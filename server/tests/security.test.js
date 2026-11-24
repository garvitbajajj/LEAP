process.env.NODE_ENV = 'test';
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { createApp } = require('../src/app');
const config = require('../src/config');
const { ApiKey, AuditLog } = require('../src/models');
const { sha256 } = require('../src/middleware/auth');

const app = createApp();
const adminToken = jwt.sign({ sub: '64b000000000000000000001', role: 'admin', name: 'Admin' }, config.jwtSecret);
const learnerToken = jwt.sign({ sub: '64b000000000000000000002', role: 'learner', name: 'Learner' }, config.jwtSecret);

describe('API Key & Secret + Security Overview', () => {
  afterEach(() => jest.restoreAllMocks());

  test('POST /admin/api-keys mints key + secret pair and stores only hashes', async () => {
    const createSpy = jest.spyOn(ApiKey, 'create').mockImplementation(async (doc) => ({
      _id: 'key-1',
      ...doc,
    }));
    jest.spyOn(AuditLog, 'create').mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/admin/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Partner Integration' });

    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^leap_pk_/);
    expect(res.body.secret).toMatch(/^leap_sk_/);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Partner Integration',
      keyHash: sha256(res.body.key),
      secretHash: sha256(res.body.secret),
    }));
  });

  test('GET /internal/verify-key rejects missing or wrong X-API-Secret when secretHash exists', async () => {
    const rawKey = `leap_pk_${crypto.randomBytes(8).toString('hex')}`;
    const rawSecret = `leap_sk_${crypto.randomBytes(8).toString('hex')}`;

    jest.spyOn(ApiKey, 'findOne').mockResolvedValue({
      _id: 'key-2',
      name: 'Partner Portal',
      keyHash: sha256(rawKey),
      secretHash: sha256(rawSecret),
      scopes: ['catalogue:read'],
    });
    const updateSpy = jest.spyOn(ApiKey, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

    const missingSecret = await request(app)
      .get('/api/v1/internal/verify-key')
      .set('x-api-key', rawKey);
    expect(missingSecret.status).toBe(401);

    const wrongSecret = await request(app)
      .get('/api/v1/internal/verify-key')
      .set('x-api-key', rawKey)
      .set('x-api-secret', 'wrong-secret');
    expect(wrongSecret.status).toBe(401);

    const valid = await request(app)
      .get('/api/v1/internal/verify-key')
      .set('x-api-key', rawKey)
      .set('x-api-secret', rawSecret);
    expect(valid.status).toBe(200);
    expect(valid.body).toMatchObject({
      authenticated: true,
      client: { name: 'Partner Portal' },
    });
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  test('GET /admin/security-overview enforces admin RBAC and lists active schemes', async () => {
    const forbidden = await request(app)
      .get('/api/v1/admin/security-overview')
      .set('Authorization', `Bearer ${learnerToken}`);
    expect(forbidden.status).toBe(403);

    jest.spyOn(ApiKey, 'countDocuments').mockResolvedValue(2);
    jest.spyOn(AuditLog, 'find').mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
    });

    const ok = await request(app)
      .get('/api/v1/admin/security-overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.schemes.map((s) => s.id)).toEqual(
      expect.arrayContaining(['jwtAuth', 'oauth2', 'apiKeyAuth', 'bearerAuth', 'basicAuth']),
    );
    expect(ok.body.hardening.activeApiKeys).toBe(2);
  });
});
