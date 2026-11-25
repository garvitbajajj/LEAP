const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./logger');

async function connect(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    readPreference: config.mongoReadPreference,
  });
  logger.info({ uri: uri.replace(/\/\/.*@/, '//***@'), readPreference: config.mongoReadPreference }, 'mongo connected');
}

const isUp = () => mongoose.connection.readyState === 1;

/**
 * Inspects the active MongoDB deployment topology (standalone, replicaSet, or sharded).
 * Never throws; returns a safe summary object for /internal/status.
 */
async function getTopology() {
  if (!isUp() || !mongoose.connection.db) {
    return { mode: 'disconnected' };
  }
  try {
    const admin = mongoose.connection.db.admin();
    const hello = await admin.command({ hello: 1 });

    if (hello.msg === 'isdbgrid') {
      const { shards = [] } = await admin.command({ listShards: 1 });
      return {
        mode: 'sharded',
        shards: shards.map((s) => ({ id: s._id, host: s.host, state: s.state })),
      };
    }

    if (hello.setName) {
      const status = await admin.command({ replSetGetStatus: 1 });
      return {
        mode: 'replicaSet',
        setName: status.set,
        primary: hello.primary,
        readPreference: config.mongoReadPreference,
        members: (status.members || []).map((m) => ({
          name: m.name,
          stateStr: m.stateStr,
          health: m.health,
        })),
      };
    }

    return { mode: 'standalone' };
  } catch (err) {
    return { mode: 'unknown', error: err.message };
  }
}

/**
 * Runs `fn(session)` inside a MongoDB ACID transaction when connected to a
 * replica set or sharded cluster. Falls back to `fn(null)` on standalone
 * MongoDB instances or when disconnected.
 */
async function withTransaction(fn) {
  if (!isUp()) return fn(null);
  const topology = await getTopology();
  if (topology.mode !== 'replicaSet' && topology.mode !== 'sharded') {
    return fn(null);
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { connect, isUp, getTopology, withTransaction, mongoose };
