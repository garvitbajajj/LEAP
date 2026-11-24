process.env.NODE_ENV = 'test';
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { createSessions, REUSE_GRACE_MS } = require('../src/auth/sessions');

/** In-memory stand-in for the MongoDB store, with a controllable clock. */
function setup() {
  const rows = new Map();
  let seq = 0;
  let clock = 1_000_000;
  const store = {
    create: async (doc) => { const id = String(++seq); rows.set(id, { ...doc, id, revokedAt: null }); },
    findByHash: async (h) => [...rows.values()].find((r) => r.tokenHash === h) || null,
    update: async (id, patch) => Object.assign(rows.get(id), patch),
    revokeFamily: async (f, at) => rows.forEach((r) => { if (r.familyId === f && !r.revokedAt) r.revokedAt = at; }),
    revokeUser: async (u, at) => rows.forEach((r) => { if (r.userId === u && !r.revokedAt) r.revokedAt = at; }),
  };
  const sessions = createSessions(store, { ttlMs: 60_000, now: () => clock });
  const user = { _id: 'u1', role: 'learner', name: 'Asha', toPublic: () => ({ id: 'u1' }) };
  const loadUser = async (id) => (id === 'u1' ? user : null);
  return { sessions, rows, user, loadUser, tick: (ms) => { clock += ms; } };
}

describe('refresh-token sessions', () => {
  test('issue returns a valid access JWT and stores only a hash of the refresh token', async () => {
    const { sessions, rows, user } = setup();
    const { accessToken, refreshToken } = await sessions.issue(user);
    expect(jwt.verify(accessToken, config.jwtSecret).sub).toBe('u1');
    const [row] = rows.values();
    expect(row.tokenHash).not.toBe(refreshToken);
    expect(row.tokenHash).toHaveLength(64);
  });

  test('rotate retires the old token and issues a new one in the same family', async () => {
    const { sessions, rows, user, loadUser } = setup();
    const first = await sessions.issue(user);
    const second = await sessions.rotate(first.refreshToken, loadUser);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    const [oldRow, newRow] = rows.values();
    expect(oldRow.revokedAt).not.toBeNull();
    expect(newRow.familyId).toBe(oldRow.familyId);
    expect(newRow.revokedAt).toBeNull();
  });

  test('reusing a retired token revokes the whole family', async () => {
    const { sessions, user, loadUser, tick } = setup();
    const first = await sessions.issue(user);
    const second = await sessions.rotate(first.refreshToken, loadUser);
    tick(REUSE_GRACE_MS + 1);
    await expect(sessions.rotate(first.refreshToken, loadUser)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
    // The legitimate holder's newer token is now dead too.
    await expect(sessions.rotate(second.refreshToken, loadUser)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
  });

  test('a reuse inside the grace window is treated as a two-tab race, not theft', async () => {
    const { sessions, user, loadUser, tick } = setup();
    const first = await sessions.issue(user);
    await sessions.rotate(first.refreshToken, loadUser);
    tick(REUSE_GRACE_MS - 1);
    await expect(sessions.rotate(first.refreshToken, loadUser)).resolves.toHaveProperty('accessToken');
  });

  test('an expired token is rejected', async () => {
    const { sessions, user, loadUser, tick } = setup();
    const { refreshToken } = await sessions.issue(user);
    tick(60_001);
    await expect(sessions.rotate(refreshToken, loadUser)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_EXPIRED' });
  });

  test('missing and unknown tokens are rejected', async () => {
    const { sessions, loadUser } = setup();
    await expect(sessions.rotate(undefined, loadUser)).rejects.toMatchObject({ code: 'MISSING_REFRESH_TOKEN' });
    await expect(sessions.rotate('not-a-real-token', loadUser)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  test('logout revokes the family so the token cannot be refreshed', async () => {
    const { sessions, user, loadUser, tick } = setup();
    const { refreshToken } = await sessions.issue(user);
    await sessions.revoke(refreshToken);
    tick(REUSE_GRACE_MS + 1);
    await expect(sessions.rotate(refreshToken, loadUser)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
  });

  test('revokeAllForUser ends every session for that user', async () => {
    const { sessions, user, loadUser, tick } = setup();
    const a = await sessions.issue(user);
    const b = await sessions.issue(user);
    await sessions.revokeAllForUser('u1');
    tick(REUSE_GRACE_MS + 1);
    await expect(sessions.rotate(a.refreshToken, loadUser)).rejects.toBeTruthy();
    await expect(sessions.rotate(b.refreshToken, loadUser)).rejects.toBeTruthy();
  });
});
