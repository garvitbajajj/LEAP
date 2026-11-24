process.env.NODE_ENV = 'test';
const request = require('supertest');
const { createResetToken, resetTokenQuery, RESET_TTL_MS } = require('../src/auth/passwordReset');
const { sha256 } = require('../src/middleware/auth');
const { sendMail } = require('../src/auth/mailer');
const { createApp } = require('../src/app');

describe('password reset tokens', () => {
  test('tokens are random, and only their hash is meant to be stored', () => {
    const a = createResetToken();
    const b = createResetToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).toBe(sha256(a.raw));
    expect(a.hash).not.toContain(a.raw);
  });

  test('tokens expire after 30 minutes', () => {
    const now = 1_700_000_000_000;
    expect(createResetToken(now).expiresAt.getTime()).toBe(now + RESET_TTL_MS);
    expect(RESET_TTL_MS).toBe(30 * 60 * 1000);
  });

  test('the lookup matches on the hash and only finds unexpired tokens', () => {
    const now = 1_700_000_000_000;
    const q = resetTokenQuery('abc', now);
    expect(q.resetTokenHash).toBe(sha256('abc'));
    expect(q.resetTokenExpires.$gt.getTime()).toBe(now);
  });
});

describe('development mailer', () => {
  test('without SMTP configured it logs instead of failing', async () => {
    await expect(sendMail({ to: 'a@b.co', subject: 's', text: 't' })).resolves.toEqual({ delivered: false });
  });
});

describe('password reset endpoints', () => {
  const app = createApp();

  test('forgot-password rejects a malformed email before any lookup', async () => {
    const r = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'not-an-email' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('reset-password requires a token', async () => {
    const r = await request(app).post('/api/v1/auth/reset-password').send({ password: 'NewPass123' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('reset-password enforces the same password strength as registration', async () => {
    const r = await request(app).post('/api/v1/auth/reset-password').send({ token: 'x', password: 'weak' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('WEAK_PASSWORD');
  });
});
