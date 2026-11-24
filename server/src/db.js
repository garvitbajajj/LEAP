const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./logger');

async function connect(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info({ uri: uri.replace(/\/\/.*@/, '//***@') }, 'mongo connected');
}

const isUp = () => mongoose.connection.readyState === 1;

module.exports = { connect, isUp, mongoose };
