/**
 * Password-reset tokens: random, single-use, short-lived, and stored only as a hash,
 * so a database leak cannot be used to reset anyone's password.
 */
const crypto = require('crypto');
const { sha256 } = require('../middleware/auth');

const RESET_TTL_MS = 30 * 60 * 1000;

function createResetToken(now = Date.now()) {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw), expiresAt: new Date(now + RESET_TTL_MS) };
}

/** Query that finds the user a raw token belongs to, only while it is unexpired. */
const resetTokenQuery = (raw, now = Date.now()) => ({
  resetTokenHash: sha256(String(raw)),
  resetTokenExpires: { $gt: new Date(now) },
});

module.exports = { createResetToken, resetTokenQuery, RESET_TTL_MS };
