const { AuditLog } = require('../models');
const logger = require('../logger');

/** Records an administrative or catalogue mutation. Never throws into the request. */
async function audit(actorId, action, entity, entityId, before, after) {
  try {
    await AuditLog.create({ actorId, action, entity, entityId: String(entityId ?? ''), before, after });
  } catch (err) {
    logger.warn({ err, action }, 'audit write failed');
  }
}

module.exports = { audit };
