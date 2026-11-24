/**
 * Seeds a demo-ready database: catalogue with a valid prerequisite DAG, three role
 * accounts, a pre-onboarded demo learner, and synthetic learners whose history gives
 * the recommender collaborative signal from the first request.
 *
 *   npm run seed            (drops and recreates the leap database)
 */
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const logger = require('../logger');
const {
  User, LearnerProfile, ContentItem, Interaction, Recommendation, Feedback, LearningPath, ApiKey, AuditLog,
} = require('../models');
const CATALOGUE = require('./catalogue');
const { QUIZZES } = require('./catalogue');
const { GOALS } = require('../path/goals');
const { topologicalOrder, findCycle } = require('../catalogue/graph');

// Deterministic PRNG so every seed run produces the same demo.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(35);

const DEMO_ACCOUNTS = [
  { name: 'Demo Learner', email: 'learner@leap.dev', password: 'Learner@123', role: 'learner' },
  { name: 'Demo Instructor', email: 'instructor@leap.dev', password: 'Instructor@123', role: 'instructor' },
  { name: 'Demo Admin', email: 'admin@leap.dev', password: 'Admin@1234', role: 'admin' },
];
const SYNTHETIC_LEARNERS = 30;

async function seed() {
  await db.connect();
  await Promise.all([User, LearnerProfile, ContentItem, Interaction, Recommendation, Feedback,
    LearningPath, ApiKey, AuditLog].map((M) => M.deleteMany({})));
  await Promise.all([ContentItem, Interaction, LearningPath, User].map((M) => M.syncIndexes()));

  // ---------------------------------------------------------------- catalogue
  const idByKey = {};
  for (const [key] of CATALOGUE) idByKey[key] = new db.mongoose.Types.ObjectId();

  const docs = CATALOGUE.map(([key, title, type, skills, difficulty, durationMins, prereqs, description]) => ({
    _id: idByKey[key], title, type, skills, difficulty, durationMins, description,
    prerequisites: prereqs.map((p) => idByKey[p]),
    status: 'published',
    quiz: QUIZZES[key],
  }));
  const cycle = findCycle(docs.map((d) => ({ id: d._id, prerequisites: d.prerequisites })));
  if (cycle) throw new Error(`seed catalogue has a cycle: ${cycle}`);
  await ContentItem.insertMany(docs);
  logger.info({ items: docs.length }, 'catalogue seeded');

  // ---------------------------------------------------------------- demo accounts
  const accounts = {};
  for (const a of DEMO_ACCOUNTS) {
    accounts[a.role] = await User.create({ ...a, passwordHash: await bcrypt.hash(a.password, 10) });
  }

  // ---------------------------------------------------------------- synthetic learners
  // Each follows a goal through the catalogue in prerequisite order, completing a random
  // prefix and browsing a little beyond it - realistic history for CF and popularity.
  const goalKeys = Object.keys(GOALS);
  const nodes = docs.map((d) => ({ id: d._id, prerequisites: d.prerequisites, difficulty: d.difficulty, durationMins: d.durationMins }));
  const order = topologicalOrder(nodes);
  const events = [];
  const passwordHash = await bcrypt.hash('Synthetic@123', 4);
  const now = Date.now();

  for (let i = 0; i < SYNTHETIC_LEARNERS; i += 1) {
    const goal = goalKeys[i % goalKeys.length];
    const user = await User.create({ name: `Learner ${i + 1}`, email: `learner${i + 1}@synthetic.leap`, passwordHash });
    const relevant = order.filter((id) => docs.find((d) => String(d._id) === id).skills.some((s) => GOALS[goal].skills.includes(s)));
    const completed = Math.floor(rand() * relevant.length * 0.8) + 1;
    relevant.slice(0, completed + 2).forEach((itemId, idx) => {
      const ts = new Date(now - (relevant.length - idx) * 86400000 * (1 + rand() * 2));
      const item = docs.find((d) => String(d._id) === itemId);
      events.push({ eventId: uuid(), userId: user._id, itemId, type: 'view', dwellSeconds: 60 + rand() * 600, timestamp: ts });
      if (idx < completed) {
        if (item.type === 'quiz') {
          events.push({ eventId: uuid(), userId: user._id, itemId, type: 'quiz_attempt', score: 0.5 + rand() * 0.5, timestamp: ts });
        }
        events.push({ eventId: uuid(), userId: user._id, itemId, type: 'complete', progressPct: 100, timestamp: ts });
        if (rand() < 0.35) events.push({ eventId: uuid(), userId: user._id, itemId, type: 'like', timestamp: ts });
      }
    });
    await LearnerProfile.create({
      userId: user._id, goals: [goal], onboarded: true, consentGivenAt: new Date(), interactionCount: completed,
    });
  }

  // ---------------------------------------------------------------- demo learner
  // Pre-onboarded with a little history, so the demo opens on a personalised feed.
  const learner = accounts.learner;
  const demoDone = ['py-intro', 'py-control', 'stats-descriptive'];
  demoDone.forEach((key, idx) => {
    const ts = new Date(now - (demoDone.length - idx) * 86400000);
    events.push({ eventId: uuid(), userId: learner._id, itemId: idByKey[key], type: 'view', dwellSeconds: 900, timestamp: ts });
    events.push({ eventId: uuid(), userId: learner._id, itemId: idByKey[key], type: 'complete', progressPct: 100, timestamp: ts });
  });
  await LearnerProfile.create({
    userId: learner._id,
    goals: ['data-analyst'],
    knownSkills: [{ skill: 'python-basics', level: 1 }],
    preferredFormat: 'mixed',
    weeklyHours: 6,
    difficultyLevel: 'beginner',
    mastery: [
      { skill: 'python-basics', score: 0.45, confidence: 0.5 },
      { skill: 'statistics', score: 0.3, confidence: 0.4 },
    ],
    interactionCount: demoDone.length,
    consentGivenAt: new Date(),
    onboarded: true,
  });

  await Interaction.insertMany(events);

  // ---------------------------------------------------------------- popularity prior
  const pop = await Interaction.aggregate([
    { $group: {
      _id: '$itemId',
      score: { $sum: { $switch: { branches: [
        { case: { $eq: ['$type', 'complete'] }, then: 3 },
        { case: { $eq: ['$type', 'like'] }, then: 2 },
      ], default: 1 } } },
    } },
  ]);
  const max = Math.max(...pop.map((p) => p.score), 1);
  await ContentItem.bulkWrite(pop.map((p) => ({
    updateOne: { filter: { _id: p._id }, update: { popularity: +(p.score / max).toFixed(3) } },
  })));

  logger.info({
    users: DEMO_ACCOUNTS.length + SYNTHETIC_LEARNERS,
    interactions: events.length,
    accounts: DEMO_ACCOUNTS.map((a) => `${a.email} / ${a.password}`),
  }, 'seed complete');
  await db.mongoose.disconnect();
}

seed().catch(async (err) => {
  logger.fatal({ err }, 'seed failed');
  await db.mongoose.disconnect();
  process.exit(1);
});
