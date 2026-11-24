const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');

const config = require('../config');
const db = require('../db');
const {
  User, LearnerProfile, ContentItem, Interaction, ApiKey, AuditLog,
} = require('../models');
const { AppError, ah } = require('../middleware/error');
const {
  jwtAuth, bearerAuth, basicAuth, apiKeyAuth, requireRole, sha256, signJwt,
} = require('../middleware/auth');
const { audit } = require('./audit');

const router = express.Router();
const adminOnly = [jwtAuth, requireRole('admin')];

// ---------------------------------------------------------------- basicAuth
/** Creates the first administrator. Refuses once one exists or when disabled by env. */
router.post('/admin/bootstrap', basicAuth, ah(async (req, res) => {
  if (!config.bootstrap.enabled) {
    throw new AppError(403, 'BOOTSTRAP_DISABLED', 'Admin bootstrap is disabled in this environment');
  }
  if (await User.exists({ role: 'admin' })) {
    throw new AppError(409, 'ALREADY_BOOTSTRAPPED', 'An administrator already exists');
  }
  const { name = 'Administrator', email, password } = req.body || {};
  if (!email || !password || password.length < 8) {
    throw new AppError(400, 'VALIDATION_FAILED', 'email and a password of at least 8 characters are required');
  }
  const user = await User.create({
    name, email, role: 'admin', passwordHash: await bcrypt.hash(password, 10),
  });
  await audit(user._id, 'admin.bootstrap', 'User', user._id, null, { email });
  res.status(201).json({ token: signJwt(user), user: user.toPublic() });
}));

// ---------------------------------------------------------------- bearerAuth
/** Infrastructure status for monitoring, guarded by a static opaque token. */
router.get('/internal/status', bearerAuth, ah(async (req, res) => {
  const [users, items, events] = await Promise.all([
    User.countDocuments(), ContentItem.countDocuments({ status: 'published' }), Interaction.countDocuments(),
  ]);
  res.json({
    status: 'ok', version: config.version, mongo: db.isUp() ? 'up' : 'down',
    counts: { users, publishedItems: items, interactions: events },
  });
}));

// ---------------------------------------------------------------- apiKeyAuth
/** Service-to-service catalogue export, e.g. for the ML service's nightly backfill. */
router.get('/internal/catalogue', apiKeyAuth, ah(async (req, res) => {
  const items = await ContentItem.find({ status: 'published' })
    .select('title description type skills prerequisites difficulty durationMins popularity')
    .lean();
  res.json({ count: items.length, items });
}));

// ---------------------------------------------------------------- API key management (jwtAuth + admin)
router.post('/admin/api-keys', ...adminOnly, ah(async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) throw new AppError(400, 'VALIDATION_FAILED', 'A key name is required');
  const raw = `leap_${crypto.randomBytes(24).toString('hex')}`;
  const key = await ApiKey.create({
    name, keyHash: sha256(raw), prefix: raw.slice(0, 9), createdBy: req.user.id,
  });
  await audit(req.user.id, 'apikey.create', 'ApiKey', key._id, null, { name });
  // The raw key is returned exactly once and never stored.
  res.status(201).json({ id: key._id, name, key: raw, prefix: key.prefix });
}));

router.get('/admin/api-keys', ...adminOnly, ah(async (req, res) => {
  res.json(await ApiKey.find().select('-keyHash').sort({ createdAt: -1 }));
}));

router.delete('/admin/api-keys/:id', ...adminOnly, ah(async (req, res) => {
  const key = await ApiKey.findByIdAndUpdate(req.params.id, { revokedAt: new Date() }, { new: true });
  if (!key) throw new AppError(404, 'NOT_FOUND', 'API key not found');
  await audit(req.user.id, 'apikey.revoke', 'ApiKey', key._id);
  res.status(204).end();
}));

// ---------------------------------------------------------------- users and audit (jwtAuth + admin)
router.get('/admin/users', ...adminOnly, ah(async (req, res) => {
  res.json(await User.find().sort({ createdAt: -1 }).limit(200));
}));

router.patch('/admin/users/:id/role', ...adminOnly, ah(async (req, res) => {
  const { role } = req.body || {};
  if (!['learner', 'instructor', 'admin'].includes(role)) {
    throw new AppError(400, 'VALIDATION_FAILED', 'role must be learner, instructor or admin');
  }
  const before = await User.findById(req.params.id);
  if (!before) throw new AppError(404, 'NOT_FOUND', 'User not found');
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (role === 'learner') await LearnerProfile.updateOne({ userId: user._id }, {}, { upsert: true });
  await audit(req.user.id, 'user.role', 'User', user._id, { role: before.role }, { role });
  res.json(user);
}));

router.get('/admin/audit', ...adminOnly, ah(async (req, res) => {
  res.json(await AuditLog.find().sort({ timestamp: -1 }).limit(100).populate('actorId', 'name email'));
}));

module.exports = router;
