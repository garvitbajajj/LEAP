process.env.NODE_ENV = 'test';
const { createFeedCache } = require('../src/recommendations/cache');
const { register } = require('../src/middleware/metrics');

/** Minimal stand-in for a node-redis client. */
function fakeRedis() {
  const data = new Map();
  const ttls = new Map();
  return {
    isReady: true,
    data,
    ttls,
    get: async (k) => (data.has(k) ? data.get(k) : null),
    set: async (k, v, opts) => { data.set(k, v); ttls.set(k, opts?.EX); },
    incr: async (k) => { const n = Number(data.get(k) || 0) + 1; data.set(k, String(n)); return n; },
  };
}

const feed = { strategy: 'hybrid', items: [{ itemId: 'a' }] };

describe('feed cache', () => {
  test('a miss, then a stored feed is a hit', async () => {
    const redis = fakeRedis();
    const cache = createFeedCache(() => redis, { ttlSeconds: 300 });
    const first = await cache.get('u1', 12);
    expect(first.status).toBe('miss');
    await cache.set('u1', 12, first.version, feed);
    await expect(cache.get('u1', 12)).resolves.toEqual({ status: 'hit', value: feed });
  });

  test('entries are written with the configured TTL', async () => {
    const redis = fakeRedis();
    const cache = createFeedCache(() => redis, { ttlSeconds: 300 });
    const { version } = await cache.get('u1', 12);
    await cache.set('u1', 12, version, feed);
    expect([...redis.ttls.values()]).toEqual([300]);
  });

  test('different page sizes are cached separately', async () => {
    const redis = fakeRedis();
    const cache = createFeedCache(() => redis, { ttlSeconds: 300 });
    const { version } = await cache.get('u1', 12);
    await cache.set('u1', 12, version, feed);
    expect((await cache.get('u1', 24)).status).toBe('miss');
  });

  test('invalidation makes every cached feed for that learner stale, and only theirs', async () => {
    const redis = fakeRedis();
    const cache = createFeedCache(() => redis, { ttlSeconds: 300 });
    for (const [u, limit] of [['u1', 12], ['u1', 24], ['u2', 12]]) {
      const { version } = await cache.get(u, limit);
      await cache.set(u, limit, version, feed);
    }
    await cache.invalidate('u1');
    expect((await cache.get('u1', 12)).status).toBe('miss');
    expect((await cache.get('u1', 24)).status).toBe('miss');
    expect((await cache.get('u2', 12)).status).toBe('hit');
  });

  test('a write that races an invalidation lands under the old version and is never served', async () => {
    const redis = fakeRedis();
    const cache = createFeedCache(() => redis, { ttlSeconds: 300 });
    const { version } = await cache.get('u1', 12); // request starts computing
    await cache.invalidate('u1'); // learner completes an item meanwhile
    await cache.set('u1', 12, version, feed); // the now-stale feed is written
    expect((await cache.get('u1', 12)).status).toBe('miss');
  });

  test('with Redis absent or not ready, every call is a bypass and nothing throws', async () => {
    for (const client of [null, { ...fakeRedis(), isReady: false }]) {
      const cache = createFeedCache(() => client, { ttlSeconds: 300 });
      await expect(cache.get('u1', 12)).resolves.toEqual({ status: 'bypass' });
      await expect(cache.set('u1', 12, '0', feed)).resolves.toBeUndefined();
      await expect(cache.invalidate('u1')).resolves.toBeUndefined();
    }
  });

  test('Redis errors degrade to a miss instead of failing the request', async () => {
    const broken = { isReady: true, get: async () => { throw new Error('boom'); }, set: async () => { throw new Error('boom'); }, incr: async () => { throw new Error('boom'); } };
    const cache = createFeedCache(() => broken, { ttlSeconds: 300 });
    await expect(cache.get('u1', 12)).resolves.toEqual({ status: 'error' });
    await expect(cache.set('u1', 12, '0', feed)).resolves.toBeUndefined();
    await expect(cache.invalidate('u1')).resolves.toBeUndefined();
  });

  test('lookups are counted in the Prometheus metrics', async () => {
    const text = await register.metrics();
    expect(text).toMatch(/leap_recommendation_cache_total\{result="hit"\}/);
    expect(text).toMatch(/leap_recommendation_cache_total\{result="bypass"\}/);
  });
});
