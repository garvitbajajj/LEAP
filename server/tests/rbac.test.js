/**
 * HTTP enforcement tests for granular RBAC permissions wired across
 * catalogue, analytics, recommendations, paths, and events routers.
 */
process.env.NODE_ENV = 'test';
const request = require('supertest');
const jwt = require('jsonwebtoken');

const config = require('../src/config');
const { createApp } = require('../src/app');

const app = createApp();
const learnerToken = jwt.sign({ sub: '64b000000000000000000001', role: 'learner' }, config.jwtSecret);
const instructorToken = jwt.sign({ sub: '64b000000000000000000002', role: 'instructor' }, config.jwtSecret);

describe('RBAC route-level permission enforcement', () => {
  test('learner cannot access catalogue:write or analytics:read endpoints', async () => {
    const createRes = await request(app)
      .post('/api/v1/catalogue/items')
      .set('Authorization', `Bearer ${learnerToken}`)
      .send({ title: 'Test' });
    expect(createRes.status).toBe(403);
    expect(createRes.body.error.code).toBe('FORBIDDEN');

    const analyticsRes = await request(app)
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${learnerToken}`);
    expect(analyticsRes.status).toBe(403);
    expect(analyticsRes.body.error.code).toBe('FORBIDDEN');
  });

  test('instructor cannot access learner-only recommendations:read, paths:write, or events:write', async () => {
    const feedRes = await request(app)
      .get('/api/v1/recommendations')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(feedRes.status).toBe(403);
    expect(feedRes.body.error.code).toBe('FORBIDDEN');

    const pathReadRes = await request(app)
      .get('/api/v1/paths/active')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(pathReadRes.status).toBe(403);
    expect(pathReadRes.body.error.code).toBe('FORBIDDEN');

    const pathWriteRes = await request(app)
      .post('/api/v1/paths')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ goal: 'data-analyst' });
    expect(pathWriteRes.status).toBe(403);
    expect(pathWriteRes.body.error.code).toBe('FORBIDDEN');

    const eventsRes = await request(app)
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ events: [] });
    expect(eventsRes.status).toBe(403);
    expect(eventsRes.body.error.code).toBe('FORBIDDEN');
  });
});
