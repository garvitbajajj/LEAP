const pino = require('pino');

module.exports = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'leap-server' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
