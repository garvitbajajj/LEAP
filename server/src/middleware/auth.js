/**
 * The five authentication schemes declared in the OpenAPI document:
 *   jwtAuth     JWT bearer token          - learner / instructor / admin routes
 *   bearerAuth  opaque bearer token       - internal status endpoint
 *   basicAuth   HTTP Basic                - one-time admin bootstrap
 *   apiKeyAuth  X-API-Key + X-API-Secret  - service-to-service calls
 *   oauth2      Google authorization code - see auth/routes.js
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('./error');
const { ApiKey, LearnerProfile } = require('../models');

/** Constant-time string comparison that tolerates unequal lengths. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function bearerToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function signJwt(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, name: user.name },
    config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/** jwtAuth - verifies a signed JWT and attaches req.user. */
function jwtAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) return next(new AppError(401, 'UNAUTHENTICATED', 'Missing bearer token'));
  try {
    const claims = jwt.verify(token, config.jwtSecret);
    req.user = { id: claims.sub, role: claims.role, name: claims.name };
    return next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return next(new AppError(401, code, 'Token is invalid or expired'));
  }
}

/** bearerAuth - a static opaque token, for infrastructure callers. */
function bearerAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token || !safeEqual(token, config.internalBearerToken)) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Invalid bearer token'));
  }
  return next();
}

/** basicAuth - HTTP Basic credentials, used only for the admin bootstrap. */
function basicAuth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="leap-bootstrap"');
    return next(new AppError(401, 'UNAUTHENTICATED', 'Basic credentials required'));
  }
  const [user, ...rest] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
  const pass = rest.join(':');
  if (!safeEqual(user, config.bootstrap.user) || !safeEqual(pass, config.bootstrap.password)) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Invalid basic credentials'));
  }
  return next();
}

/** apiKeyAuth - X-API-Key (+ X-API-Secret for minted keys) checked against env or MongoDB. */
async function apiKeyAuth(req, res, next) {
  try {
    const key = req.headers['x-api-key'];
    const secret = req.headers['x-api-secret'];
    if (!key) throw new AppError(401, 'UNAUTHENTICATED', 'Missing X-API-Key header');
    if (safeEqual(key, config.ml.apiKey)) {
      req.apiClient = { name: 'ml-service-env', scopes: ['catalogue:read', 'interactions:read'] };
      return next();
    }
    const found = await ApiKey.findOne({ keyHash: sha256(key), revokedAt: null });
    if (!found) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or revoked API key');
    if (found.secretHash) {
      if (!secret || !safeEqual(sha256(secret), found.secretHash)) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or missing X-API-Secret header');
      }
    }
    await ApiKey.updateOne({ _id: found._id }, { $set: { lastUsedAt: new Date() } });
    req.apiClient = { id: found._id, name: found.name, scopes: found.scopes || [] };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** RBAC - must run after jwtAuth. */
const requireRole = (...roles) => (req, res, next) => (
  roles.includes(req.user?.role)
    ? next()
    : next(new AppError(403, 'FORBIDDEN', `Requires role: ${roles.join(' or ')}`))
);

/** Personalization is blocked until the learner has consented to data collection. */
async function requireConsent(req, res, next) {
  try {
    if (req.user.role !== 'learner') return next();
    const profile = await LearnerProfile.findOne({ userId: req.user.id }).select('consentGivenAt');
    if (!profile?.consentGivenAt) {
      throw new AppError(403, 'CONSENT_REQUIRED', 'Consent to behavioural data collection is required');
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  jwtAuth, bearerAuth, basicAuth, apiKeyAuth, requireRole, requireConsent,
  signJwt, sha256, safeEqual,
};
