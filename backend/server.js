require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http = require('http');
const mongoose = require('mongoose');
const logger = require('./config/logger');
const { assertRuntimeConfig, isLiveMode } = require('./config/runtime');
const { app } = require('./app');

const server = http.createServer(app);
const io = require('./socket')(server);
const PORT = process.env.PORT || 5000;

app.set('io', io);

mongoose.connection.on('connected', () => {
  logger.info('Mongoose default connection open.');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err }, 'Mongoose default connection error');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose default connection disconnected.');
});

async function start() {
  let mode = 'demo';
  try {
    mode = assertRuntimeConfig();
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3500 });
      logger.info('MongoDB connected');
    } else if (mode === 'live') {
      throw new Error('MONGODB_URI is required in live mode');
    }
  } catch (err) {
    if (mode === 'live' || err.code === 'RUNTIME_CONFIG' || isLiveMode()) {
      logger.error({ err }, 'Live startup failed');
      process.exit(1);
    }
    logger.warn({ err }, 'MongoDB unavailable, API will use limited in-memory fallbacks');
  }

  server.listen(PORT, () => logger.info({ port: PORT }, 'iTruck API running'));
}

function shutdown() {
  server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}

if (require.main === module) {
  start();
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { app, io, server, shutdown, start };
