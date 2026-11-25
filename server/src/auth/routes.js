const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const db = require('../db');
const { User, LearnerProfile } = require('../models');
const { AppError, ah } = require('../middleware/error');
const { jwtAuth } = require('../middleware/auth');
const { createSessions, mongoStore } = require('./sessions');
const google = require('./google');
const { createResetToken, resetTokenQuery } = require('./passwordReset');
const { sendMail } = require('./mailer');
const { OTP_PURPOSES, createOtpService, mongoStore: otpMongoStore } = require('./otp');
const { feedCache } = require('../recommendations/cache');
const logger = require('../logger');

const router = express.Router();

const REFRESH_COOKIE = 'leap_rt';
const refreshTtlMs = config.refreshTtlDays * 86_400_000;
const sessions = createSessions(mongoStore(), { ttlMs: refreshTtlMs });
const otpService = createOtpService(otpMongoStore());

// HttpOnly so page scripts can never read it; scoped to the auth routes so it is not
// sent with every API call.
const cookieOptions = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
};

/** Starts a session: refresh token in the cookie, access token in the response body. */
async function startSession(res, user) {
  const { accessToken, refreshToken } = await sessions.issue(user);
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: refreshTtlMs });
  return { token: accessToken, user: user.toPublic() };
}

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
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const [created] = await User.create([{ name, email, passwordHash }], opts);
    await LearnerProfile.create([{ userId: created._id }], opts);
    return created;
  });
  res.status(201).json(await startSession(res, user));
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
  res.json(await startSession(res, user));
}));

// ---------------------------------------------------------------- refresh and logout
router.post('/auth/refresh', authLimiter, ah(async (req, res) => {
  try {
    const { accessToken, refreshToken, user } = await sessions.rotate(
      req.cookies[REFRESH_COOKIE],
      (id) => User.findById(id),
    );
    res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: refreshTtlMs });
    res.json({ token: accessToken, user: user.toPublic() });
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw err;
  }
}));

// ---------------------------------------------------------------- password reset
const GENERIC_RESET_REPLY = { message: 'If an account exists for that email, a reset link has been sent.' };

router.post('/auth/forgot-password', authLimiter, ah(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!EMAIL_RE.test(email)) throw new AppError(400, 'VALIDATION_FAILED', 'A valid email is required');

  const user = await User.findOne({ email });
  if (user) {
    const { raw, hash, expiresAt } = createResetToken();
    await User.updateOne({ _id: user._id }, { resetTokenHash: hash, resetTokenExpires: expiresAt });
    const link = `${config.clientUrl}/reset-password?token=${raw}`;
    // Not awaited: a slow mail server must not make "account exists" measurably slower.
    sendMail({
      to: user.email,
      subject: 'Reset your LEAP password',
      text: `Hi ${user.name},\n\nUse this link within 30 minutes to choose a new password:\n${link}\n\n`
        + 'If you did not ask for this, you can ignore this email - your password has not changed.',
    }).catch((err) => logger.error({ err: err.message }, 'password reset email failed'));
  }
  // Identical reply either way, so this endpoint cannot be used to discover accounts.
  res.status(202).json(GENERIC_RESET_REPLY);
}));

router.post('/auth/reset-password', authLimiter, ah(async (req, res) => {
  const { token, password } = req.body || {};
  if (!token) throw new AppError(400, 'VALIDATION_FAILED', 'A reset token is required');
  validatePassword(password);

  const user = await User.findOne(resetTokenQuery(token)).select('+resetTokenHash');
  if (!user) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired');

  await User.updateOne({ _id: user._id }, {
    passwordHash: await bcrypt.hash(password, 10),
    failedLogins: 0,
    $unset: { resetTokenHash: 1, resetTokenExpires: 1, lockedUntil: 1 },
  });
  // A reset usually means the old password may be known to someone else, so end every session.
  await sessions.revokeAllForUser(user._id);
  res.json({ message: 'Password updated. Please log in with your new password.' });
}));

// ---------------------------------------------------------------- Email OTP
const OTP_SUBJECTS = {
  verify_email: 'Verify your LEAP email',
  login_otp: 'Your LEAP sign-in code',
  password_reset: 'Your LEAP password reset code',
};

router.post('/auth/otp/send', authLimiter, ah(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const purpose = String(req.body?.purpose || 'login_otp').trim();
  if (!EMAIL_RE.test(email)) throw new AppError(400, 'VALIDATION_FAILED', 'A valid email is required');
  if (!OTP_PURPOSES.includes(purpose)) {
    throw new AppError(400, 'INVALID_OTP_PURPOSE', `purpose must be one of ${OTP_PURPOSES.join(', ')}`);
  }

  const user = await User.findOne({ email });
  let devCode;
  if (user) {
    const { code, ttlMinutes } = await otpService.issue({ email, purpose });
    sendMail({
      to: user.email,
      subject: OTP_SUBJECTS[purpose],
      text: `Hi ${user.name},\n\nYour LEAP one-time verification code is: ${code}\n\n`
        + `It expires in ${ttlMinutes} minutes. If you did not request this, you can safely ignore this email.`,
    }).catch((err) => logger.error({ err: err.message }, 'OTP email failed'));
    if (!config.smtp.host && config.nodeEnv !== 'production') {
      devCode = code;
    }
  }

  // Identical response shape whether or not the account exists (prevents email enumeration).
  res.status(202).json({
    sent: true,
    purpose,
    ttlMinutes: otpService.ttlMinutes,
    ...(devCode ? { devCode } : {}),
  });
}));

router.post('/auth/otp/verify', authLimiter, ah(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const purpose = String(req.body?.purpose || 'verify_email').trim();
  const code = String(req.body?.code || '').trim();
  if (!EMAIL_RE.test(email)) throw new AppError(400, 'VALIDATION_FAILED', 'A valid email is required');
  if (!OTP_PURPOSES.includes(purpose)) {
    throw new AppError(400, 'INVALID_OTP_PURPOSE', `purpose must be one of ${OTP_PURPOSES.join(', ')}`);
  }

  await otpService.verify({ email, purpose, code });
  const user = await User.findOne({ email });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

  if (purpose === 'verify_email' && !user.emailVerified) {
    user.emailVerified = true;
    await user.save();
  }
  if (purpose === 'login_otp') {
    return res.json({ verified: true, ...(await startSession(res, user)) });
  }
  return res.json({ verified: true, user: user.toPublic() });
}));

router.post('/auth/reset-password-otp', authLimiter, ah(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const code = String(req.body?.code || '').trim();
  const password = req.body?.password;
  if (!EMAIL_RE.test(email)) throw new AppError(400, 'VALIDATION_FAILED', 'A valid email is required');
  validatePassword(password);

  await otpService.verify({ email, purpose: 'password_reset', code });
  const user = await User.findOne({ email });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

  await User.updateOne({ _id: user._id }, {
    passwordHash: await bcrypt.hash(password, 10),
    failedLogins: 0,
    $unset: { resetTokenHash: 1, resetTokenExpires: 1, lockedUntil: 1 },
  });
  await sessions.revokeAllForUser(user._id);
  res.json({ message: 'Password updated. Please log in with your new password.' });
}));

router.post('/auth/logout', ah(async (req, res) => {
  await sessions.revoke(req.cookies[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
}));

// ---------------------------------------------------------------- Google OAuth 2.0
// Authorization code + PKCE. The state and PKCE verifier live in a short-lived
// HttpOnly cookie; SameSite=Lax so it survives the top-level redirect back from Google.
const OAUTH_COOKIE = 'leap_oauth';
const oauthCookieOptions = {
  httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', path: '/api/v1/auth/google',
};

/** Which sign-in methods this deployment offers, so the UI can hide unconfigured ones. */
router.get('/auth/providers', (req, res) => {
  res.json({ password: true, google: Boolean(config.google.clientId && config.google.clientSecret) });
});

router.get('/auth/google', (req, res, next) => {
  if (!config.google.clientId || !config.google.clientSecret) {
    return next(new AppError(501, 'OAUTH_NOT_CONFIGURED',
      'Google OAuth is declared but GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in this environment'));
  }
  const { state, verifier, challenge } = google.newFlow();
  res.cookie(OAUTH_COOKIE, `${state}.${verifier}`, { ...oauthCookieOptions, maxAge: 10 * 60 * 1000 });
  return res.redirect(google.authorizationUrl({
    clientId: config.google.clientId, redirectUri: config.google.redirectUri, state, challenge,
  }));
});

/** The callback is a browser navigation, so failures redirect back to the login page. */
router.get('/auth/google/callback', ah(async (req, res) => {
  const back = (reason) => res.redirect(`${config.clientUrl}/?oauth=${reason}`);
  const [state, verifier] = String(req.cookies[OAUTH_COOKIE] || '').split('.');
  res.clearCookie(OAUTH_COOKIE, oauthCookieOptions);

  if (req.query.error) return back('denied');
  if (!state || !verifier || req.query.state !== state) return back('state_mismatch');
  if (!req.query.code) return back('failed');

  let profile;
  try {
    const tokens = await google.exchangeCode({
      code: String(req.query.code),
      verifier,
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret,
      redirectUri: config.google.redirectUri,
    });
    profile = await google.fetchProfile(tokens.access_token);
  } catch (err) {
    req.log.warn({ err: err.message }, 'google sign-in failed');
    return back('failed');
  }

  // Match on Google id first, then link by verified email, otherwise create a learner.
  let user = await User.findOne({ googleId: profile.googleId })
    || await User.findOne({ email: profile.email });
  if (user && !user.googleId) {
    user.googleId = profile.googleId;
    await user.save();
  }
  if (!user) {
    user = await db.withTransaction(async (session) => {
      const opts = session ? { session } : {};
      const [created] = await User.create([{
        name: profile.name, email: profile.email, authProvider: 'google', googleId: profile.googleId,
      }], opts);
      await LearnerProfile.create([{ userId: created._id }], opts);
      return created;
    });
  }

  // Tokens never travel in the URL: the refresh cookie is set here and the app
  // exchanges it for an access token as soon as it loads.
  await startSession(res, user);
  return res.redirect(`${config.clientUrl}/`);
}));

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
  await feedCache.invalidate(req.user.id); // a new goal changes what should be recommended
  res.json(profile);
}));

module.exports = router;
