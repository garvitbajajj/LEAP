/**
 * LEAP data models. ContentItem matches contract C4, LearnerProfile matches C5.
 *
 * Simplifications for the base build (documented, not accidental):
 *   - quiz attempts are Interaction documents with type 'quiz_attempt' and a score
 *   - per-skill mastery is embedded in LearnerProfile rather than its own collection
 *   - explanations are embedded in each Recommendation item
 *   - model versions live in the ML service's registry, not MongoDB
 */
const { mongoose } = require('../db');

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const opts = { timestamps: true, versionKey: false };

// ---------------------------------------------------------------- User
const UserSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  role: { type: String, enum: ['learner', 'instructor', 'admin'], default: 'learner' },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  googleId: { type: String, unique: true, sparse: true },
  emailVerified: { type: Boolean, default: false },
  failedLogins: { type: Number, default: 0, select: false },
  lockedUntil: { type: Date, select: false },
  resetTokenHash: { type: String, select: false, index: { sparse: true } },
  resetTokenExpires: { type: Date, select: false },
}, opts);

UserSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    emailVerified: Boolean(this.emailVerified),
  };
};

// ---------------------------------------------------------------- LearnerProfile (C5)
const MasterySchema = new Schema({
  skill: { type: String, required: true },
  score: { type: Number, min: 0, max: 1, default: 0.1 },
  confidence: { type: Number, min: 0, max: 1, default: 0.2 },
}, { _id: false });

const LearnerProfileSchema = new Schema({
  userId: { type: ObjectId, ref: 'User', required: true, unique: true },
  goals: { type: [String], default: [] },
  knownSkills: [{ _id: false, skill: String, level: { type: Number, min: 1, max: 3 } }],
  preferredFormat: { type: String, enum: ['video', 'article', 'mixed'], default: 'mixed' },
  preferredLanguage: { type: String, default: 'en' },
  weeklyHours: { type: Number, min: 1, max: 60, default: 5 },
  difficultyLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
  mastery: { type: [MasterySchema], default: [] },
  interactionCount: { type: Number, default: 0 },
  consentGivenAt: { type: Date, default: null },
  onboarded: { type: Boolean, default: false },
}, opts);

// ---------------------------------------------------------------- ContentItem (C4)
const QuizQuestionSchema = new Schema({
  question: String,
  options: [String],
  answerIndex: Number,
}, { _id: false });

const ContentItemSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['course', 'video', 'article', 'quiz'], required: true },
  skills: {
    type: [String],
    validate: { validator: (v) => v.length > 0, message: 'at least one skill is required' },
  },
  prerequisites: [{ type: ObjectId, ref: 'ContentItem' }],
  difficulty: { type: Number, min: 1, max: 5, required: true },
  durationMins: { type: Number, min: 1, default: 15 },
  language: { type: String, default: 'en' },
  status: { type: String, enum: ['draft', 'published', 'retired'], default: 'draft' },
  popularity: { type: Number, default: 0 },
  url: String,
  quiz: { type: [QuizQuestionSchema], default: undefined },
  createdBy: { type: ObjectId, ref: 'User' },
}, opts);
// Candidate retrieval filters on these three together.
ContentItemSchema.index({ status: 1, skills: 1, difficulty: 1 });
ContentItemSchema.index({ title: 'text', description: 'text' });

// ---------------------------------------------------------------- Interaction (C1 events)
const InteractionSchema = new Schema({
  eventId: { type: String, required: true, unique: true }, // idempotency key for replays
  userId: { type: ObjectId, ref: 'User', required: true },
  itemId: { type: ObjectId, ref: 'ContentItem', required: true },
  type: { type: String, enum: ['view', 'click', 'complete', 'like', 'skip', 'bookmark', 'quiz_attempt'], required: true },
  dwellSeconds: Number,
  progressPct: Number,
  score: Number,
  sessionId: String,
  timestamp: { type: Date, default: Date.now },
}, { versionKey: false });
// Profile rebuilds read a learner's history newest-first.
InteractionSchema.index({ userId: 1, timestamp: -1 });

// ---------------------------------------------------------------- Recommendation (C2 log)
const RecommendationSchema = new Schema({
  userId: { type: ObjectId, ref: 'User', required: true },
  strategy: { type: String, enum: ['hybrid', 'cold_start', 'fallback'] },
  modelVersion: String,
  degraded: Boolean,
  items: [{
    _id: false, itemId: ObjectId, score: Number, rank: Number,
    reason: String, reasonFactors: [{ _id: false, factor: String, contribution: Number }],
  }],
  generatedAt: { type: Date, default: Date.now },
}, { versionKey: false });
RecommendationSchema.index({ userId: 1, generatedAt: -1 });

// ---------------------------------------------------------------- Feedback
const FeedbackSchema = new Schema({
  userId: { type: ObjectId, ref: 'User', required: true },
  itemId: { type: ObjectId, ref: 'ContentItem', required: true },
  verdict: { type: String, enum: ['relevant', 'not_relevant'] },
  rating: { type: Number, min: 1, max: 5 },
  comment: { type: String, maxlength: 500 },
}, opts);
FeedbackSchema.index({ userId: 1, itemId: 1 });

// ---------------------------------------------------------------- LearningPath
const PathStepSchema = new Schema({
  itemId: { type: ObjectId, ref: 'ContentItem', required: true },
  status: { type: String, enum: ['locked', 'available', 'in_progress', 'complete', 'skipped'], default: 'locked' },
  completedAt: Date,
  skipReason: String,
});

const LearningPathSchema = new Schema({
  userId: { type: ObjectId, ref: 'User', required: true },
  goalSkill: { type: String, required: true },
  steps: [PathStepSchema],
  status: { type: String, enum: ['active', 'completed', 'abandoned'], default: 'active' },
}, opts);
// At most one active path per learner per goal.
LearningPathSchema.index({ userId: 1, goalSkill: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } });

// ---------------------------------------------------------------- ApiKey (apiKeyAuth)
const ApiKeySchema = new Schema({
  name: { type: String, required: true },
  keyHash: { type: String, required: true, unique: true }, // sha256, never the raw key
  prefix: String,
  createdBy: { type: ObjectId, ref: 'User' },
  revokedAt: Date,
  lastUsedAt: Date,
}, opts);

// ---------------------------------------------------------------- RefreshToken (sessions)
const RefreshTokenSchema = new Schema({
  userId: { type: ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true }, // sha256 - the raw token is never stored
  familyId: { type: String, required: true, index: true }, // every rotation of one login shares this
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedBy: String, // hash of the token that superseded this one
}, { timestamps: true, versionKey: false });
// MongoDB deletes each token a day after it expires; until then it still detects reuse.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });

// ---------------------------------------------------------------- OtpToken
const OtpTokenSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  purpose: { type: String, enum: ['verify_email', 'login_otp', 'password_reset'], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  usedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, opts);
OtpTokenSchema.index({ email: 1, purpose: 1, createdAt: -1 });
OtpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------------------------------------------------------------- AuditLog
const AuditLogSchema = new Schema({
  actorId: { type: ObjectId, ref: 'User' },
  action: { type: String, required: true },
  entity: String,
  entityId: String,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now },
}, { versionKey: false });

module.exports = {
  User: model('User', UserSchema),
  LearnerProfile: model('LearnerProfile', LearnerProfileSchema),
  ContentItem: model('ContentItem', ContentItemSchema),
  Interaction: model('Interaction', InteractionSchema),
  Recommendation: model('Recommendation', RecommendationSchema),
  Feedback: model('Feedback', FeedbackSchema),
  LearningPath: model('LearningPath', LearningPathSchema),
  ApiKey: model('ApiKey', ApiKeySchema),
  RefreshToken: model('RefreshToken', RefreshTokenSchema),
  OtpToken: model('OtpToken', OtpTokenSchema),
  AuditLog: model('AuditLog', AuditLogSchema),
};
