/**
 * Email OTP generation, SHA-256 hashing, and verification with attempt lockout.
 * Uses an injectable store (just like sessions.js) so unit tests run without a database.
 */
const crypto = require('crypto');
const { OtpToken } = require('../models');
const { AppError } = require('../middleware/error');
const { sha256, safeEqual } = require('../middleware/auth');

const OTP_PURPOSES = ['verify_email', 'login_otp', 'password_reset'];
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(email, purpose, code) {
  return sha256(`${String(email).toLowerCase().trim()}:${purpose}:${String(code).trim()}`);
}

/**
 * store: { invalidateUnused(email, purpose, at), create(doc), findLatestUnused(email, purpose), update(id, patch) }
 */
function createOtpService(store, {
  ttlMs = OTP_TTL_MS,
  maxAttempts = OTP_MAX_ATTEMPTS,
  now = () => Date.now(),
} = {}) {
  const ttlMinutes = Math.round(ttlMs / 60_000);

  async function issue({ email, purpose }) {
    if (!OTP_PURPOSES.includes(purpose)) {
      throw new AppError(400, 'INVALID_OTP_PURPOSE', `purpose must be one of ${OTP_PURPOSES.join(', ')}`);
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const ts = now();
    const code = generateCode();
    const expiresAt = new Date(ts + ttlMs);

    await store.invalidateUnused(normalizedEmail, purpose, new Date(ts));
    await store.create({
      email: normalizedEmail,
      purpose,
      codeHash: hashCode(normalizedEmail, purpose, code),
      attempts: 0,
      usedAt: null,
      expiresAt,
    });

    return { code, expiresAt, ttlMinutes };
  }

  async function verify({ email, purpose, code }) {
    if (!OTP_PURPOSES.includes(purpose)) {
      throw new AppError(400, 'INVALID_OTP_PURPOSE', `purpose must be one of ${OTP_PURPOSES.join(', ')}`);
    }
    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedCode = String(code || '').trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      throw new AppError(400, 'INVALID_OTP', 'OTP must be a 6-digit code');
    }

    const ts = now();
    const record = await store.findLatestUnused(normalizedEmail, purpose);
    if (!record || new Date(record.expiresAt).getTime() <= ts) {
      throw new AppError(400, 'OTP_EXPIRED', 'OTP is invalid or has expired');
    }

    if (record.attempts >= maxAttempts) {
      await store.update(record._id, { usedAt: new Date(ts) });
      throw new AppError(429, 'OTP_LOCKED', 'Too many incorrect OTP attempts. Request a new code.');
    }

    const expected = hashCode(normalizedEmail, purpose, normalizedCode);
    if (!safeEqual(record.codeHash, expected)) {
      const nextAttempts = record.attempts + 1;
      const patch = { attempts: nextAttempts };
      if (nextAttempts >= maxAttempts) {
        patch.usedAt = new Date(ts);
      }
      await store.update(record._id, patch);
      throw new AppError(400, 'INVALID_OTP', 'Incorrect OTP code');
    }

    await store.update(record._id, { usedAt: new Date(ts) });
    return record;
  }

  return { issue, verify, ttlMinutes };
}

function mongoStore() {
  return {
    invalidateUnused: (email, purpose, at) => OtpToken.updateMany(
      { email, purpose, usedAt: null },
      { $set: { usedAt: at } },
    ),
    create: (doc) => OtpToken.create(doc),
    findLatestUnused: (email, purpose) => OtpToken.findOne({ email, purpose, usedAt: null })
      .sort({ createdAt: -1 }),
    update: (id, patch) => OtpToken.updateOne({ _id: id }, { $set: patch }),
  };
}

module.exports = {
  OTP_PURPOSES,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  generateCode,
  hashCode,
  createOtpService,
  mongoStore,
};
