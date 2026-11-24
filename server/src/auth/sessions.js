/**
 * Refresh-token sessions with rotation and reuse detection.
 *
 * Login issues a short-lived access JWT plus an opaque refresh token. Every refresh
 * retires the presented token and issues a new one in the same "family". Presenting
 * a retired token again means it was copied, so the whole family is revoked and the
 * learner must log in again.
 *
 * Only a SHA-256 hash of each refresh token is stored. The logic takes its storage as
 * an argument so it can be tested without a database; `mongoStore` is the real one.
 */
const crypto = require('crypto');
const { signJwt, sha256 } = require('../middleware/auth');
const { AppError } = require('../middleware/error');

/**
 * Two tabs refreshing at the same moment both present the same token. Treat a reuse
 * within this window, of a token that was rotated normally, as that race and not as theft.
 */
const REUSE_GRACE_MS = 10_000;

const newRawToken = () => crypto.randomBytes(48).toString('base64url');
const fail = (code, message) => new AppError(401, code, message);

/**
 * store: { create(doc), findByHash(hash), update(id, patch),
 *          revokeFamily(familyId, at), revokeUser(userId, at) }
 */
function createSessions(store, { ttlMs, now = () => Date.now() }) {
  async function issue(user, familyId = crypto.randomUUID()) {
    const refreshToken = newRawToken();
    await store.create({
      userId: String(user._id),
      tokenHash: sha256(refreshToken),
      familyId,
      expiresAt: new Date(now() + ttlMs),
    });
    return { accessToken: signJwt(user), refreshToken };
  }

  async function rotate(rawToken, loadUser) {
    if (!rawToken) throw fail('MISSING_REFRESH_TOKEN', 'No refresh token was presented');
    const current = await store.findByHash(sha256(rawToken));
    if (!current) throw fail('INVALID_REFRESH_TOKEN', 'Refresh token is not recognised');

    if (current.revokedAt) {
      const benignRace = current.replacedBy && now() - new Date(current.revokedAt).getTime() < REUSE_GRACE_MS;
      if (!benignRace) {
        await store.revokeFamily(current.familyId, new Date(now()));
        throw fail('REFRESH_TOKEN_REUSED', 'Refresh token was already used; all sessions in this chain are revoked');
      }
    }
    if (new Date(current.expiresAt).getTime() <= now()) {
      throw fail('REFRESH_TOKEN_EXPIRED', 'Session expired, please log in again');
    }

    const user = await loadUser(current.userId);
    if (!user) throw fail('INVALID_REFRESH_TOKEN', 'User no longer exists');

    const next = await issue(user, current.familyId);
    if (!current.revokedAt) {
      await store.update(current.id, { revokedAt: new Date(now()), replacedBy: sha256(next.refreshToken) });
    }
    return { ...next, user };
  }

  /** Logout: revoke the presented token's whole family. Unknown tokens are ignored. */
  async function revoke(rawToken) {
    if (!rawToken) return;
    const current = await store.findByHash(sha256(rawToken));
    if (current) await store.revokeFamily(current.familyId, new Date(now()));
  }

  /** Revoke every session a user has - used after a password reset. */
  const revokeAllForUser = (userId) => store.revokeUser(String(userId), new Date(now()));

  return { issue, rotate, revoke, revokeAllForUser };
}

/** The MongoDB-backed store used by the running server. */
function mongoStore() {
  const { RefreshToken } = require('../models');
  const toPlain = (d) => d && { ...d, id: d._id };
  return {
    create: (doc) => RefreshToken.create(doc),
    findByHash: async (tokenHash) => toPlain(await RefreshToken.findOne({ tokenHash }).lean()),
    update: (id, patch) => RefreshToken.updateOne({ _id: id }, patch),
    revokeFamily: (familyId, at) => RefreshToken.updateMany({ familyId, revokedAt: null }, { revokedAt: at }),
    revokeUser: (userId, at) => RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: at }),
  };
}

module.exports = { createSessions, mongoStore, REUSE_GRACE_MS };
