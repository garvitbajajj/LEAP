const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const { User, LearnerProfile } = require('../models');
const { AppError, ah } = require('../middleware/error');
const { jwtAuth, signJwt } = require('../middleware/auth');

const router = express.Router();

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many attempts, try again later')),
});

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError(400, 'WEAK_PASSWORD', 'Password needs at least 8 characters with a letter and a digit');
  }
}

const session = (user) => ({ token: signJwt(user), user: user.toPublic() });

// ---------------------------------------------------------------- local auth
router.post('/auth/register', authLimiter, ah(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !EMAIL_RE.test(email || '')) {
    throw new AppError(400, 'VALIDATION_FAILED', 'A name and a valid email are required');
  }
  validatePassword(password);
  if (await User.exists({ email: email.toLowerCase() })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) });
  await LearnerProfile.create({ userId: user._id });
  res.status(201).json(session(user));
}));

router.post('/auth/login', authLimiter, ah(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || '').toLowerCase() })
    .select('+passwordHash +failedLogins +lockedUntil');

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts, account temporarily locked',
      { lockedUntil: user.lockedUntil });
  }
  const ok = user?.passwordHash && await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!ok) {
    if (user) {
      user.failedLogins += 1;
      if (user.failedLogins >= MAX_FAILED_LOGINS) {
        user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.failedLogins = 0;
      }
      await user.save();
    }
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  user.failedLogins = 0;
  user.lockedUntil = undefined;
  await user.save();
  res.json(session(user));
}));

// ---------------------------------------------------------------- Google OAuth 2.0
// The redirect leg is implemented. The callback's token exchange is deferred until
// Google credentials are issued for the project; see docs/DEFERRED.md.
router.get('/auth/google', (req, res, next) => {
  if (!config.google.clientId) {
    return next(new AppError(501, 'OAUTH_NOT_CONFIGURED',
      'Google OAuth is declared but GOOGLE_CLIENT_ID is not set in this environment'));
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/auth/google/callback', (req, res, next) => {
  if (!req.query.state || req.query.state !== req.cookies.oauth_state) {
    return next(new AppError(400, 'OAUTH_STATE_MISMATCH', 'OAuth state parameter did not match'));
  }
  return next(new AppError(501, 'OAUTH_PENDING', 'Google token exchange is scheduled for the next milestone'));
});

// ---------------------------------------------------------------- the current user
router.get('/me', jwtAuth, ah(async (req, res) => {
  const [user, profile] = await Promise.all([
    User.findById(req.user.id),
    LearnerProfile.findOne({ userId: req.user.id }),
  ]);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User no longer exists');
  res.json({ user: user.toPublic(), profile });
}));

router.post('/me/consent', jwtAuth, ah(async (req, res) => {
  const profile = await LearnerProfile.findOneAndUpdate(
    { userId: req.user.id },
    { consentGivenAt: new Date() },
    { new: true, upsert: true },
  );
  res.json({ consentGivenAt: profile.consentGivenAt });
}));

const FORMATS = ['video', 'article', 'mixed'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];

router.put('/me/profile', jwtAuth, ah(async (req, res) => {
  const { goals, knownSkills = [], weeklyHours, preferredFormat, difficultyLevel, preferredLanguage } = req.body || {};
  if (!Array.isArray(goals) || goals.length === 0) {
    throw new AppError(400, 'VALIDATION_FAILED', 'At least one goal is required');
  }
  if (preferredFormat && !FORMATS.includes(preferredFormat)) {
    throw new AppError(400, 'VALIDATION_FAILED', `preferredFormat must be one of ${FORMATS.join(', ')}`);
  }
  if (difficultyLevel && !LEVELS.includes(difficultyLevel)) {
    throw new AppError(400, 'VALIDATION_FAILED', `difficultyLevel must be one of ${LEVELS.join(', ')}`);
  }
  // Self-declared skills seed mastery; observed behaviour corrects it over time.
  const mastery = knownSkills.map(({ skill, level }) => ({
    skill, score: [0, 0.3, 0.55, 0.8][level] ?? 0.3, confidence: 0.3,
  }));
  const profile = await LearnerProfile.findOneAndUpdate(
    { userId: req.user.id },
    {
      goals, knownSkills, mastery, onboarded: true,
      ...(weeklyHours && { weeklyHours }),
      ...(preferredFormat && { preferredFormat }),
      ...(difficultyLevel && { difficultyLevel }),
      ...(preferredLanguage && { preferredLanguage }),
    },
    { new: true, upsert: true, runValidators: true },
  );
  res.json(profile);
}));

module.exports = router;
