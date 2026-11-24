/**
 * Redis cache for the personalised feed (C2 responses).
 *
 * Keys carry a per-learner version: rec:<userId>:<version>:<limit>. Invalidating a
 * learner bumps their version, which makes every cached feed of theirs unreachable in
 * one O(1) write - no key scanning. Orphaned entries simply expire with their TTL.
 *
 * Every operation degrades to "miss" when Redis is absent, disconnected or erroring,
 * so the feed is always served; the cache only ever makes it faster.
 */
const { feedCacheResults } = require('../middleware/metrics');

function createFeedCache(getClient, { ttlSeconds }) {
  const ready = () => Boolean(getClient()?.isReady);
  const versionKey = (userId) => `recver:${userId}`;

  async function get(userId, limit) {
    if (!ready()) {
      feedCacheResults.inc({ result: 'bypass' });
      return { status: 'bypass' };
    }
    try {
      const client = getClient();
      const version = (await client.get(versionKey(userId))) || '0';
      const raw = await client.get(`rec:${userId}:${version}:${limit}`);
      feedCacheResults.inc({ result: raw ? 'hit' : 'miss' });
      return raw ? { status: 'hit', value: JSON.parse(raw) } : { status: 'miss', version };
    } catch {
      feedCacheResults.inc({ result: 'error' });
      return { status: 'error' };
    }
  }

  /** Stores under the version read by get(), so a write racing an invalidation lands stale. */
  async function set(userId, limit, version, value) {
    if (!ready() || version === undefined) return;
    try {
      await getClient().set(`rec:${userId}:${version}:${limit}`, JSON.stringify(value), { EX: ttlSeconds });
    } catch { /* caching is best-effort */ }
  }

  async function invalidate(userId) {
    if (!ready()) return;
    try {
      await getClient().incr(versionKey(String(userId)));
    } catch { /* an un-invalidated entry still expires with its TTL */ }
  }

  return { get, set, invalidate };
}

/** The app-wide instance, bound to the shared Redis connection. */
const feedCache = createFeedCache(
  () => require('../redis').getRedis(),
  { ttlSeconds: require('../config').feedCacheTtlSeconds },
);

module.exports = { createFeedCache, feedCache };
