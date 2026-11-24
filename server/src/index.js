const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const { connectRedis, closeRedis } = require('./redis');
const { createApp } = require('./app');

async function main() {
  await db.connect();
  connectRedis(); // optional and non-blocking: the feed cache is bypassed until it is ready
  const app = createApp();
  const server = app.listen(config.port, () =>
    logger.info({ port: config.port }, `LEAP API listening on http://localhost:${config.port}`));

  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await closeRedis();
      await db.mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
