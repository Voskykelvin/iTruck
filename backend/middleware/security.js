const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

function redisStore(prefix) {
  if (!process.env.REDIS_URL) return undefined;

  const { createClient } = require('redis');
  const { RedisStore } = require('rate-limit-redis');
  const client = createClient({ url: process.env.REDIS_URL });

  client.on('error', err => logger.error({ err, prefix }, 'Rate limit Redis error'));
  client.connect().catch(err => logger.error({ err, prefix }, 'Rate limit Redis connect failed'));

  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args) => client.sendCommand(args)
  });
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 160,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('api')
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('auth')
});

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const fallback = 'An unexpected internal server error occurred.';
  const exposeMessage = process.env.NODE_ENV !== 'production' || status < 500;
  const message = exposeMessage ? (err.message || fallback) : fallback;

  logger.error({ err, status, path: req.originalUrl }, 'Request failed');
  res.status(status).json({ message });
}

module.exports = { apiLimiter, authLimiter, errorHandler };
