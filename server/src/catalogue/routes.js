const express = require('express');
const { ContentItem } = require('../models');
const { AppError, ah } = require('../middleware/error');
const { jwtAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../admin/audit');
const { findCycle } = require('./graph');

const router = express.Router();
const authorOnly = [jwtAuth, requireRole('instructor', 'admin')];

const EDITABLE = ['title', 'description', 'type', 'skills', 'prerequisites', 'difficulty',
  'durationMins', 'language', 'url', 'quiz'];

// Legal status transitions. Retired items may be republished; drafts cannot be retired.
const TRANSITIONS = { publish: ['draft', 'retired'], retire: ['published'] };

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const isAuthor = (user) => ['instructor', 'admin'].includes(user.role);

/** Rejects a write that would make the prerequisite graph cyclic. */
async function assertAcyclic(itemId, prerequisites) {
  if (!prerequisites?.length) return;
  const found = await ContentItem.countDocuments({ _id: { $in: prerequisites } });
  if (found !== new Set(prerequisites.map(String)).size) {
    throw new AppError(400, 'UNKNOWN_PREREQUISITE', 'One or more prerequisites do not exist');
  }
  const all = await ContentItem.find().select('prerequisites').lean();
  const nodes = all.map((n) => ({ id: n._id, prerequisites: n.prerequisites }));
  const self = nodes.find((n) => String(n.id) === String(itemId));
  if (self) self.prerequisites = prerequisites;
  else nodes.push({ id: itemId, prerequisites });
  const cycle = findCycle(nodes);
  if (cycle) {
    throw new AppError(409, 'PREREQUISITE_CYCLE_DETECTED',
      'These prerequisites would create a cycle', { cycle });
  }
}

router.get('/catalogue/items', jwtAuth, ah(async (req, res) => {
  const { q, skill, type, difficulty, status } = req.query;
  const limit = Math.min(Number(req.query.limit) || 24, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const filter = {};
  filter.status = isAuthor(req.user) && status ? status : 'published';
  if (skill) filter.skills = skill;
  if (type) filter.type = type;
  if (difficulty) filter.difficulty = Number(difficulty);
  if (q) filter.$text = { $search: String(q) };

  const [items, total] = await Promise.all([
    ContentItem.find(filter).select('-quiz.answerIndex')
      .sort(q ? { score: { $meta: 'textScore' } } : { difficulty: 1, title: 1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    ContentItem.countDocuments(filter),
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

router.get('/catalogue/skills', jwtAuth, ah(async (req, res) => {
  res.json((await ContentItem.distinct('skills', { status: 'published' })).sort());
}));

router.get('/catalogue/graph', jwtAuth, ah(async (req, res) => {
  const items = await ContentItem.find({ status: 'published' }).select('title prerequisites difficulty').lean();
  res.json({
    nodes: items.map((i) => ({ id: i._id, title: i.title, difficulty: i.difficulty })),
    edges: items.flatMap((i) => i.prerequisites.map((p) => ({ from: p, to: i._id }))),
  });
}));

router.get('/catalogue/items/:id', jwtAuth, ah(async (req, res) => {
  const item = await ContentItem.findById(req.params.id)
    .select('-quiz.answerIndex')
    .populate('prerequisites', 'title difficulty skills');
  if (!item || (item.status !== 'published' && !isAuthor(req.user))) {
    throw new AppError(404, 'NOT_FOUND', 'Content item not found');
  }
  res.json(item);
}));

router.post('/catalogue/items', ...authorOnly, ah(async (req, res) => {
  const data = pick(req.body || {}, EDITABLE);
  const item = new ContentItem({ ...data, createdBy: req.user.id, status: 'draft' });
  await item.validate();
  await assertAcyclic(item._id, data.prerequisites);
  await item.save();
  await audit(req.user.id, 'catalogue.create', 'ContentItem', item._id, null, data);
  res.status(201).json(item);
}));

router.patch('/catalogue/items/:id', ...authorOnly, ah(async (req, res) => {
  const item = await ContentItem.findById(req.params.id);
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Content item not found');
  const changes = pick(req.body || {}, EDITABLE);
  if (changes.prerequisites) await assertAcyclic(item._id, changes.prerequisites);
  const before = pick(item.toObject(), Object.keys(changes));
  item.set(changes);
  await item.save();
  await audit(req.user.id, 'catalogue.update', 'ContentItem', item._id, before, changes);
  res.json(item);
}));

router.post('/catalogue/items/:id/:action(publish|retire)', ...authorOnly, ah(async (req, res) => {
  const { action } = req.params;
  const item = await ContentItem.findById(req.params.id);
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Content item not found');
  if (!TRANSITIONS[action].includes(item.status)) {
    throw new AppError(409, 'ILLEGAL_TRANSITION', `Cannot ${action} an item that is ${item.status}`);
  }
  const before = item.status;
  item.status = action === 'publish' ? 'published' : 'retired';
  await item.save();
  await audit(req.user.id, `catalogue.${action}`, 'ContentItem', item._id, { status: before }, { status: item.status });
  res.json(item);
}));

module.exports = router;
