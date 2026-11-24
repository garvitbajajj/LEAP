/**
 * C1 - interaction event ingestion. Each event is validated on its own, so one bad
 * event never fails the batch; replays are idempotent through the unique eventId.
 */
const crypto = require('crypto');
const express = require('express');
const {
  Interaction, ContentItem, LearnerProfile, LearningPath,
} = require('../models');
const { AppError, ah } = require('../middleware/error');
const { jwtAuth, requireConsent } = require('../middleware/auth');
const { updateMastery } = require('../path/mastery');
const { refreshStatuses } = require('../path/sequencer');
const { feedCache } = require('../recommendations/cache');

const router = express.Router();

const TYPES = new Set(['view', 'click', 'complete', 'like', 'skip', 'bookmark', 'quiz_attempt']);
const RANKING_EVENTS = new Set(['complete', 'like', 'skip', 'bookmark', 'quiz_attempt']);
const OBJECT_ID = /^[a-f0-9]{24}$/;
const MAX_BATCH = 500;
const QUIZ_DAMPING_WINDOW_MS = 24 * 60 * 60 * 1000;

function validate(e, userId) {
  if (!e || typeof e !== 'object') return 'MALFORMED';
  if (typeof e.eventId !== 'string' || e.eventId.length < 8) return 'INVALID_EVENT_ID';
  if (!OBJECT_ID.test(e.itemId || '')) return 'INVALID_ITEM_ID';
  if (!TYPES.has(e.type)) return 'INVALID_TYPE';
  if (e.userId && e.userId !== userId) return 'USER_MISMATCH';
  if (e.timestamp && Number.isNaN(Date.parse(e.timestamp))) return 'INVALID_TIMESTAMP';
  if (e.type === 'quiz_attempt' && !(e.score >= 0 && e.score <= 1)) return 'INVALID_SCORE';
  return null;
}

router.post('/events', jwtAuth, requireConsent, ah(async (req, res) => {
  const events = req.body?.events;
  if (!Array.isArray(events) || events.length === 0) {
    throw new AppError(400, 'VALIDATION_FAILED', 'events must be a non-empty array');
  }
  if (events.length > MAX_BATCH) {
    throw new AppError(413, 'BATCH_TOO_LARGE', `At most ${MAX_BATCH} events per batch`);
  }

  const userId = req.user.id;
  const rejected = [];
  let candidates = [];
  for (const e of events) {
    const reason = validate(e, userId);
    if (reason) rejected.push({ eventId: e?.eventId ?? null, reason });
    else candidates.push(e);
  }

  // Unknown items and replayed events are rejected per event, not per batch.
  const itemIds = [...new Set(candidates.map((e) => e.itemId))];
  const items = await ContentItem.find({ _id: { $in: itemIds } }).select('skills').lean();
  const skillsById = new Map(items.map((i) => [String(i._id), i.skills]));
  const seen = new Set((await Interaction.find({ eventId: { $in: candidates.map((e) => e.eventId) } })
    .select('eventId').lean()).map((x) => x.eventId));

  const batchIds = new Set();
  candidates = candidates.filter((e) => {
    let reason = null;
    if (!skillsById.has(e.itemId)) reason = 'UNKNOWN_ITEM';
    else if (seen.has(e.eventId) || batchIds.has(e.eventId)) reason = 'DUPLICATE';
    if (reason) rejected.push({ eventId: e.eventId, reason });
    batchIds.add(e.eventId);
    return !reason;
  });

  if (candidates.length) {
    await Interaction.insertMany(candidates.map((e) => ({
      eventId: e.eventId, userId, itemId: e.itemId, type: e.type,
      dwellSeconds: e.dwellSeconds, progressPct: e.progressPct, score: e.score,
      sessionId: e.sessionId, timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
    })), { ordered: false });
    await applySideEffects(userId, candidates, skillsById);
    // Views and clicks barely move the ranking and arrive constantly, so they leave
    // the cached feed alone; anything stronger refreshes it.
    if (candidates.some((e) => RANKING_EVENTS.has(e.type))) await feedCache.invalidate(userId);
  }

  res.status(202).json({ accepted: candidates.length, rejected });
}));

/**
 * Server-side quiz grading. Answer keys never leave the server, so the client sends
 * choices and the score is computed here, then recorded as a quiz_attempt (plus a
 * completion when passed) through the same mastery and path updates as C1 events.
 */
const PASS_MARK = 0.6;

router.post('/catalogue/items/:id/attempt', jwtAuth, requireConsent, ah(async (req, res) => {
  const item = await ContentItem.findById(req.params.id).select('skills quiz title');
  if (!item?.quiz?.length) throw new AppError(404, 'NOT_A_QUIZ', 'This item has no quiz');
  const answers = req.body?.answers;
  if (!Array.isArray(answers) || answers.length !== item.quiz.length) {
    throw new AppError(400, 'VALIDATION_FAILED', `answers must be an array of ${item.quiz.length} choices`);
  }

  const results = item.quiz.map((q, i) => ({ correct: answers[i] === q.answerIndex, answerIndex: q.answerIndex }));
  const correct = results.filter((r) => r.correct).length;
  const score = +(correct / item.quiz.length).toFixed(3);
  const passed = score >= PASS_MARK;

  const now = new Date();
  const events = [{ eventId: crypto.randomUUID(), itemId: String(item._id), type: 'quiz_attempt', score, timestamp: now }];
  if (passed) events.push({ eventId: crypto.randomUUID(), itemId: String(item._id), type: 'complete', progressPct: 100, timestamp: now });
  await Interaction.insertMany(events.map((e) => ({ ...e, userId: req.user.id })));
  await applySideEffects(req.user.id, events, new Map([[String(item._id), item.skills]]));
  await feedCache.invalidate(req.user.id);

  const profile = await LearnerProfile.findOne({ userId: req.user.id }).select('mastery');
  res.json({
    score, correct, total: item.quiz.length, passed, results,
    mastery: profile.mastery.filter((m) => item.skills.includes(m.skill)),
  });
}));

/**
 * Updates mastery and the active learning path for completions and quiz attempts.
 * ponytail: runs inline; move to a Celery worker once event volume makes it slow.
 */
async function applySideEffects(userId, events, skillsById) {
  const meaningful = events.filter((e) => e.type === 'complete' || e.type === 'quiz_attempt');
  if (!meaningful.length) return;

  const profile = await LearnerProfile.findOne({ userId });
  if (profile) {
    const since = new Date(Date.now() - QUIZ_DAMPING_WINDOW_MS);
    for (const e of meaningful) {
      const prior = e.type === 'quiz_attempt'
        ? await Interaction.countDocuments({
          userId, itemId: e.itemId, type: 'quiz_attempt', eventId: { $ne: e.eventId }, timestamp: { $gte: since },
        })
        : 0;
      updateMastery(profile.mastery, skillsById.get(e.itemId), e, prior);
    }
    profile.interactionCount += meaningful.length;
    profile.markModified('mastery');
    await profile.save();
  }

  const completedIds = new Set(meaningful
    .filter((e) => e.type === 'complete' || (e.type === 'quiz_attempt' && e.score >= 0.6))
    .map((e) => e.itemId));
  if (!completedIds.size) return;

  const paths = await LearningPath.find({ userId, status: 'active' }).populate('steps.itemId', 'prerequisites');
  for (const path of paths) {
    let touched = false;
    for (const step of path.steps) {
      if (completedIds.has(String(step.itemId._id)) && step.status !== 'complete') {
        step.status = 'complete';
        step.completedAt = new Date();
        touched = true;
      }
    }
    if (touched) {
      refreshStatuses(path);
      await path.save();
    }
  }
}

module.exports = router;
