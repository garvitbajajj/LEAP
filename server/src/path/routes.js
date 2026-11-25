const express = require('express');
const {
  ContentItem, Interaction, LearnerProfile, LearningPath,
} = require('../models');
const { AppError, ah } = require('../middleware/error');
const { jwtAuth, requireConsent, requirePermission } = require('../middleware/auth');
const { GOALS } = require('./goals');
const { buildPath, refreshStatuses, summarise } = require('./sequencer');

const router = express.Router();
const STEP_FIELDS = 'title type skills difficulty durationMins prerequisites';

router.get('/goals', (req, res) => {
  res.json(Object.entries(GOALS).map(([id, g]) => ({ id, ...g })));
});

async function loadOwnPath(req) {
  const path = await LearningPath.findById(req.params.id).populate('steps.itemId', STEP_FIELDS);
  if (!path || String(path.userId) !== req.user.id) throw new AppError(404, 'NOT_FOUND', 'Path not found');
  return path;
}

async function respond(res, path, userId, status = 200) {
  const profile = await LearnerProfile.findOne({ userId }).select('weeklyHours');
  res.status(status).json({
    ...path.toObject(),
    goalLabel: GOALS[path.goalSkill]?.label ?? path.goalSkill,
    summary: summarise(path, profile?.weeklyHours),
  });
}

router.post('/paths', jwtAuth, requirePermission('paths:write'), requireConsent, ah(async (req, res) => {
  const profile = await LearnerProfile.findOne({ userId: req.user.id });
  const goal = req.body?.goal || profile?.goals?.[0];
  if (!GOALS[goal]) {
    throw new AppError(400, 'UNKNOWN_GOAL', `goal must be one of ${Object.keys(GOALS).join(', ')}`);
  }

  const [items, completed] = await Promise.all([
    ContentItem.find({ status: 'published' }).select('skills prerequisites difficulty durationMins').lean(),
    Interaction.distinct('itemId', { userId: req.user.id, type: 'complete' }),
  ]);
  const ordered = buildPath({
    goalSkills: GOALS[goal].skills, items, completedIds: completed, mastery: profile?.mastery,
  });

  // Regenerating replaces the previous active path for the same goal.
  await LearningPath.updateMany({ userId: req.user.id, goalSkill: goal, status: 'active' }, { status: 'abandoned' });
  const created = await LearningPath.create({
    userId: req.user.id, goalSkill: goal, steps: ordered.map((itemId) => ({ itemId })),
  });
  const path = await LearningPath.findById(created._id).populate('steps.itemId', STEP_FIELDS);
  refreshStatuses(path);
  await path.save();
  await respond(res, path, req.user.id, 201);
}));

router.get('/paths/active', jwtAuth, requirePermission('paths:write'), ah(async (req, res) => {
  const path = await LearningPath.findOne({ userId: req.user.id, status: { $in: ['active', 'completed'] } })
    .sort({ updatedAt: -1 })
    .populate('steps.itemId', STEP_FIELDS);
  if (!path) throw new AppError(404, 'NO_ACTIVE_PATH', 'No learning path yet - create one with POST /paths');
  await respond(res, path, req.user.id);
}));

router.post('/paths/:id/steps/:stepId/:action(complete|skip)', jwtAuth, requirePermission('paths:write'), ah(async (req, res) => {
  const path = await loadOwnPath(req);
  const step = path.steps.id(req.params.stepId);
  if (!step) throw new AppError(404, 'NOT_FOUND', 'Step not found');
  if (step.status === 'locked') {
    throw new AppError(409, 'STEP_LOCKED', 'Complete the prerequisite steps first');
  }
  if (req.params.action === 'complete') {
    step.status = 'complete';
    step.completedAt = new Date();
  } else {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw new AppError(400, 'VALIDATION_FAILED', 'A reason is required to skip a step');
    step.status = 'skipped';
    step.skipReason = reason.slice(0, 200);
  }
  refreshStatuses(path);
  await path.save();
  await respond(res, path, req.user.id);
}));

module.exports = router;
