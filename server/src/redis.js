/**
 * Optional Redis connection. With REDIS_URL unset the app runs without it; when set,
 * the client connects in the background and reconnects with backoff, and nothing ever
 * blocks waiting for it - callers check `isReady` and skip Redis otherwise.
 */
const { createClient } = require('redis');
const config = require('./config');
const logger = require('./logger');

let client = null;
let lastErrorLog = 0;

function connectRedis() {
  if (!config.redisUrl || client) return client;
  client = createClient({
    url: config.redisUrl,
    // Fail commands fast while disconnected instead of queueing them.
    disableOfflineQueue: true,
    socket: { connectTimeout: 2000, reconnectStrategy: (retries) => Math.min(250 * 2 ** retries, 10_000) },
  });
  client.on('ready', () => logger.info('redis connected'));
  client.on('error', (err) => {
    // Reconnect attempts fail repeatedly while Redis is down; log at most every 30s.
    if (Date.now() - lastErrorLog > 30_000) {
      lastErrorLog = Date.now();
      logger.warn({ err: err.message }, 'redis unavailable, feed cache bypassed');
    }
  });
  client.connect().catch(() => {}); // the error handler above reports failures
  return client;
}

const getRedis = () => client;

async function closeRedis() {
  if (client?.isOpen) await client.quit().catch(() => {});
}

module.exports = { connectRedis, getRedis, closeRedis };
