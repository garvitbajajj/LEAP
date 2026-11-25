const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');

const config = require('../config');
const db = require('../db');
const {
  User, LearnerProfile, ContentItem, Interaction, ApiKey, RolePermission, AuditLog,
} = require('../models');
const { AppError, ah } = require('../middleware/error');
const {
  jwtAuth, bearerAuth, basicAuth, apiKeyAuth, requireRole, requirePermission,
  ensureDefaultRolePermissions, ALL_PERMISSIONS, sha256, signJwt,
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
  const [users, items, events, topology] = await Promise.all([
    User.countDocuments(), ContentItem.countDocuments({ status: 'published' }), Interaction.countDocuments(),
    db.getTopology(),
  ]);
  res.json({
    status: 'ok', version: config.version, mongo: db.isUp() ? 'up' : 'down', topology,
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

/**
 * Implicit-feedback matrix for the ML service's collaborative filter: one row per
 * learner-item pair with a summed engagement weight. Learner ids are opaque here.
 */
router.get('/internal/interactions', apiKeyAuth, ah(async (req, res) => {
  const rows = await Interaction.aggregate([
    { $group: {
      _id: { u: '$userId', i: '$itemId' },
      weight: { $sum: { $switch: { branches: [
        { case: { $eq: ['$type', 'complete'] }, then: 3 },
        { case: { $eq: ['$type', 'like'] }, then: 2 },
        { case: { $eq: ['$type', 'skip'] }, then: -1 },
      ], default: 1 } } },
    } },
    { $match: { weight: { $gt: 0 } } },
  ]);
  res.json({
    count: rows.length,
    rows: rows.map((r) => ({ userId: String(r._id.u), itemId: String(r._id.i), weight: r.weight })),
  });
}));

/** Live verification endpoint for X-API-Key + X-API-Secret callers. */
router.get('/internal/verify-key', apiKeyAuth, ah(async (req, res) => {
  res.json({
    authenticated: true,
    scheme: 'apiKeyAuth (X-API-Key + X-API-Secret)',
    client: req.apiClient || { name: 'service' },
  });
}));

// ---------------------------------------------------------------- API key management (jwtAuth + admin)
router.post('/admin/api-keys', ...adminOnly, ah(async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) throw new AppError(400, 'VALIDATION_FAILED', 'A key name is required');
  const rawKey = `leap_pk_${crypto.randomBytes(16).toString('hex')}`;
  const rawSecret = `leap_sk_${crypto.randomBytes(24).toString('hex')}`;
  const scopes = Array.isArray(req.body?.scopes) && req.body.scopes.length
    ? req.body.scopes.map(String)
    : ['catalogue:read', 'interactions:read'];
  const key = await ApiKey.create({
    name,
    keyHash: sha256(rawKey),
    secretHash: sha256(rawSecret),
    prefix: rawKey.slice(0, 14),
    secretPrefix: rawSecret.slice(0, 14),
    scopes,
    createdBy: req.user.id,
  });
  await audit(req.user.id, 'apikey.create', 'ApiKey', key._id, null, { name, scopes });
  // The raw key and secret are returned exactly once and never stored.
  res.status(201).json({
    id: key._id,
    name,
    key: rawKey,
    secret: rawSecret,
    prefix: key.prefix,
    secretPrefix: key.secretPrefix,
    scopes,
  });
}));

router.get('/admin/api-keys', ...adminOnly, ah(async (req, res) => {
  res.json(await ApiKey.find().select('-keyHash -secretHash').sort({ createdAt: -1 }));
}));

router.get('/admin/security-overview', jwtAuth, requirePermission('security:read'), ah(async (req, res) => {
  const [activeKeys, recentAudit] = await Promise.all([
    ApiKey.countDocuments({ revokedAt: null }),
    AuditLog.find().sort({ timestamp: -1 }).limit(15).lean(),
  ]);
  res.json({
    schemes: [
      { id: 'jwtAuth', name: 'JWT Bearer Token', header: 'Authorization: Bearer <jwt>', status: 'active' },
      { id: 'oauth2', name: 'Google OAuth 2.0', header: 'Authorization Code + PKCE/State', status: config.google.clientId ? 'active' : 'unconfigured' },
      { id: 'apiKeyAuth', name: 'API Key & Secret', header: 'X-API-Key + X-API-Secret', status: 'active' },
      { id: 'bearerAuth', name: 'Static Bearer Token', header: 'Authorization: Bearer <token>', status: 'active' },
      { id: 'basicAuth', name: 'HTTP Basic Auth', header: 'Authorization: Basic <base64>', status: config.bootstrap.enabled ? 'active' : 'disabled' },
    ],
    hardening: {
      helmet: true,
      corsOrigins: config.corsOrigins,
      jwtExpiresIn: config.jwtExpiresIn,
      activeApiKeys: activeKeys,
    },
    recentAudit,
  });
}));

// ---------------------------------------------------------------- DB-backed RBAC (RolePermission)
router.get('/admin/roles', jwtAuth, requirePermission('roles:read'), ah(async (req, res) => {
  await ensureDefaultRolePermissions();
  const roles = await RolePermission.find().sort({ role: 1 }).lean();
  res.json({ roles, allPermissions: ALL_PERMISSIONS });
}));

router.put('/admin/roles/:role/permissions', jwtAuth, requirePermission('roles:write'), ah(async (req, res) => {
  const { role } = req.params;
  if (!['learner', 'instructor', 'admin'].includes(role)) {
    throw new AppError(400, 'VALIDATION_FAILED', 'role must be learner, instructor or admin');
  }
  const { permissions } = req.body || {};
  if (!Array.isArray(permissions)) {
    throw new AppError(400, 'VALIDATION_FAILED', 'permissions must be an array of strings');
  }
  const clean = [...new Set(permissions.map((p) => String(p).trim()).filter(Boolean))];
  const before = await RolePermission.findOne({ role }).lean();
  const updated = await RolePermission.findOneAndUpdate(
    { role },
    { $set: { permissions: clean } },
    { new: true, upsert: true },
  );
  await audit(req.user.id, 'role.permissions', 'RolePermission', updated._id,
    { role, permissions: before?.permissions || [] }, { role, permissions: clean });
  res.json(updated);
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
  const user = await db.withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const updated = await User.findByIdAndUpdate(req.params.id, { role }, { new: true, ...opts });
    if (role === 'learner') await LearnerProfile.updateOne({ userId: updated._id }, {}, { upsert: true, ...opts });
    await AuditLog.create([{
      actorId: req.user.id, action: 'user.role', entity: 'User', entityId: updated._id,
      before: { role: before.role }, after: { role },
    }], opts);
    return updated;
  });
  res.json(user);
}));

router.get('/admin/audit', ...adminOnly, ah(async (req, res) => {
  res.json(await AuditLog.find().sort({ timestamp: -1 }).limit(100).populate('actorId', 'name email'));
}));

module.exports = router;
