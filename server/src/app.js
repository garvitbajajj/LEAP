const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const { v4: uuid } = require('uuid');

const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const { notFound, errorHandler } = require('./middleware/error');
const { register, metricsMiddleware } = require('./middleware/metrics');

const startedAt = Date.now();

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = req.headers['x-request-id'] || uuid();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/metrics' },
  }));
  app.use(metricsMiddleware);

  app.get('/health', (req, res) => {
    res.json({
      status: db.isUp() ? 'ok' : 'degraded',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      mongo: db.isUp() ? 'up' : 'down',
      version: config.version,
    });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  require('./routes')(app);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
