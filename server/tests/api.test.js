/**
 * HTTP-level checks that need no database: the auth schemes reject bad credentials
 * before any query runs, and the docs and health endpoints respond.
 */
process.env.NODE_ENV = 'test';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const config = require('../src/config');

const app = createApp();
const learnerToken = jwt.sign({ sub: '64b000000000000000000001', role: 'learner' }, config.jwtSecret);

describe('platform', () => {
  test('GET /health reports mongo status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mongo');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  test('GET /metrics exposes Prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_request_duration_seconds');
  });

  test('unknown routes use the shared error envelope', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('OpenAPI document', () => {
  test('declares all five security schemes', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(Object.keys(res.body.components.securitySchemes).sort())
      .toEqual(['apiKeyAuth', 'basicAuth', 'bearerAuth', 'jwtAuth', 'oauth2']);
  });

  test('every scheme protects at least one path', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    const used = new Set(['jwtAuth']); // the global default
    for (const ops of Object.values(res.body.paths)) {
      for (const op of Object.values(ops)) (op.security || []).forEach((s) => Object.keys(s).forEach((k) => used.add(k)));
    }
    expect([...used].sort()).toEqual(['apiKeyAuth', 'basicAuth', 'bearerAuth', 'jwtAuth', 'oauth2']);
  });
});

describe('authentication schemes', () => {
  test('jwtAuth rejects a missing token', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('jwtAuth rejects a tampered token', async () => {
    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${learnerToken}x`);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('jwtAuth reports an expired token', async () => {
    const expired = jwt.sign({ sub: 'x', role: 'learner', exp: Math.floor(Date.now() / 1000) - 10 }, config.jwtSecret);
    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${expired}`);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  test('RBAC denies a learner on an admin route', async () => {
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${learnerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('bearerAuth rejects a wrong opaque token', async () => {
    const res = await request(app).get('/api/v1/internal/status').set('Authorization', 'Bearer wrong');
    expect(res.status).toBe(401);
  });

  test('basicAuth rejects wrong credentials and challenges', async () => {
    const res = await request(app).post('/api/v1/admin/bootstrap').auth('bootstrap', 'wrong');
    expect(res.status).toBe(401);
    const bare = await request(app).post('/api/v1/admin/bootstrap');
    expect(bare.headers['www-authenticate']).toMatch(/Basic/);
  });

  test('apiKeyAuth rejects a missing key', async () => {
    const res = await request(app).get('/api/v1/internal/catalogue');
    expect(res.status).toBe(401);
  });

  test('oauth2 reports that Google is not configured', async () => {
    const prevId = config.google.clientId;
    config.google.clientId = '';
    try {
      const res = await request(app).get('/api/v1/auth/google');
      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('OAUTH_NOT_CONFIGURED');
    } finally {
      config.google.clientId = prevId;
    }
  });

  test('refresh without a cookie is rejected before touching the database', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_REFRESH_TOKEN');
  });

  test('registration rejects a weak password before touching the database', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ name: 'A', email: 'a@b.co', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEAK_PASSWORD');
  });
});
