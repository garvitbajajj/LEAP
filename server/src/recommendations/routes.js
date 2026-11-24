/**
 * C2 - the personalised feed. Builds a C3 request, asks the ML service to rank it,
 * and falls back to a popularity ranking if the ML service is unavailable. A learner
 * never sees an error from this endpoint because of the ML service.
 */
const express = require('express');
const {
  ContentItem, Interaction, LearnerProfile, Recommendation, Feedback,
} = require('../models');
const { AppError, ah } = require('../middleware/error');
const { jwtAuth, requireConsent } = require('../middleware/auth');
const { recommendationFallbacks } = require('../middleware/metrics');
const { GOALS } = require('../path/goals');
const mlClient = require('./mlClient');
const logger = require('../logger');

const router = express.Router();

// Implicit-feedback weights per event type, decayed by age so recent activity counts more.
const BASE_WEIGHT = { complete: 3, like: 2.5, quiz_attempt: 2, bookmark: 1.5, view: 1, click: 0.5, skip: -1 };
const HALF_LIFE_DAYS = 30;

function decayedHistory(interactions) {
  const now = Date.now();
  const byItem = new Map();
  for (const i of interactions) {
    const ageDays = (now - new Date(i.timestamp).getTime()) / 86_400_000;
    const w = (BASE_WEIGHT[i.type] ?? 0) * 0.5 ** (ageDays / HALF_LIFE_DAYS);
    byItem.set(String(i.itemId), (byItem.get(String(i.itemId)) || 0) + w);
  }
  return [...byItem].map(([itemId, weight]) => ({ itemId, weight: +weight.toFixed(4) }));
}

/** Popularity ranking used when the ML service cannot answer. */
function fallbackRank(candidates, goalSkills, limit) {
  return candidates
    .map((c) => {
      const goalMatch = c.skills.some((s) => goalSkills.includes(s)) ? 1 : 0;
      return { c, score: 0.6 * (c.popularity || 0) + 0.4 * goalMatch };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ c, score }, i) => ({
      itemId: String(c._id),
      score: +score.toFixed(4),
      rank: i + 1,
      reason: 'Popular with learners working towards the same goal',
      factors: [{ factor: 'popularity', contribution: +(0.6 * (c.popularity || 0)).toFixed(4) }],
    }));
}

router.get('/recommendations', jwtAuth, requireConsent, ah(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 50);
  const userId = req.user.id;

  const profile = await LearnerProfile.findOne({ userId }).lean();
  if (!profile?.onboarded) {
    throw new AppError(409, 'ONBOARDING_REQUIRED', 'Complete onboarding before requesting recommendations');
  }

  const [items, interactions, rejected] = await Promise.all([
    ContentItem.find({ status: 'published' })
      .select('title description type skills prerequisites difficulty durationMins popularity').lean(),
    Interaction.find({ userId }).select('itemId type timestamp').lean(),
    Feedback.distinct('itemId', { userId, verdict: 'not_relevant' }),
  ]);

  const completed = new Set(interactions.filter((i) => i.type === 'complete').map((i) => String(i.itemId)));
  const suppressed = new Set(rejected.map(String));

  // Business rules: nothing already finished, nothing the learner rejected, and nothing
  // whose prerequisites are still outstanding - every recommendation is actionable now.
  const candidates = items.filter((i) => !completed.has(String(i._id))
    && !suppressed.has(String(i._id))
    && i.prerequisites.every((p) => completed.has(String(p))));

  const goalSkills = profile.goals.flatMap((g) => GOALS[g]?.skills ?? []);
  const payload = {
    userId,
    profile: { ...profile, userId: String(profile.userId), goalSkills },
    candidateItemIds: candidates.map((c) => String(c._id)),
    candidateItems: candidates.map((c) => ({ ...c, _id: String(c._id), prerequisites: c.prerequisites.map(String) })),
    history: decayedHistory(interactions),
    completedItemIds: [...completed],
    context: { device: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop' },
    limit,
  };

  let ranked;
  let strategy;
  let modelVersion;
  let degraded = false;
  try {
    const out = await mlClient.recommend(payload);
    ranked = out.items;
    strategy = out.strategy;
    modelVersion = out.modelVersion;
  } catch (err) {
    logger.warn({ err: err.message }, 'ml unavailable, serving fallback');
    recommendationFallbacks.inc();
    ranked = fallbackRank(candidates, goalSkills, limit);
    strategy = 'fallback';
    modelVersion = 'fallback-popularity';
    degraded = true;
  }

  const byId = new Map(candidates.map((c) => [String(c._id), c]));
  const out = ranked.filter((r) => byId.has(r.itemId)).map((r) => {
    const c = byId.get(r.itemId);
    return {
      itemId: r.itemId,
      title: c.title,
      description: c.description,
      type: c.type,
      durationMins: c.durationMins,
      difficulty: c.difficulty,
      skills: c.skills,
      score: r.score,
      rank: r.rank,
      reason: r.reason,
      reasonFactors: r.factors,
    };
  });

  const generatedAt = new Date();
  await Recommendation.create({
    userId, strategy, modelVersion, degraded, generatedAt,
    items: out.map((o) => ({
      itemId: o.itemId, score: o.score, rank: o.rank, reason: o.reason, reasonFactors: o.reasonFactors,
    })),
  });

  res.json({ userId, generatedAt, strategy, modelVersion, degraded, items: out });
}));

// ---------------------------------------------------------------- feedback
router.post('/feedback', jwtAuth, ah(async (req, res) => {
  const { itemId, verdict, rating, comment } = req.body || {};
  if (!/^[a-f0-9]{24}$/.test(itemId || '')) throw new AppError(400, 'VALIDATION_FAILED', 'A valid itemId is required');
  if (verdict && !['relevant', 'not_relevant'].includes(verdict)) {
    throw new AppError(400, 'VALIDATION_FAILED', 'verdict must be relevant or not_relevant');
  }
  if (rating !== undefined && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
    throw new AppError(400, 'VALIDATION_FAILED', 'rating must be an integer from 1 to 5');
  }
  if (!verdict && rating === undefined) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Provide a verdict or a rating');
  }
  if (!(await ContentItem.exists({ _id: itemId }))) throw new AppError(404, 'NOT_FOUND', 'Content item not found');
  const fb = await Feedback.create({ userId: req.user.id, itemId, verdict, rating, comment });
  res.status(201).json(fb);
}));

module.exports = router;
