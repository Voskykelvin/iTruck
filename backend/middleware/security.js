const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');

function redisStore(prefix) {
  if (!process.env.REDIS_URL) return undefined;

  const { createClient } = require('redis');
  const { RedisStore } = require('rate-limit-redis');
  const client = createClient({ url: process.env.REDIS_URL });

  client.on('error', (err) => logger.error({ err, prefix }, 'Rate limit Redis error'));
  client.connect().catch((err) => logger.error({ err, prefix }, 'Rate limit Redis connect failed'));

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

function handleCastError(err) {
  const raw = err.value;
  const value = raw === null || raw === undefined ? raw : typeof raw === 'object' ? JSON.stringify(raw) : raw;
  return AppError.badRequest(`Invalid ${err.path}: ${value}`);
}

function handleDuplicateKey(err) {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  const value = err.keyValue?.[field];
  return new AppError(`${field} '${value}' is already in use.`, 409);
}

function handleValidationError(err) {
  const messages = Object.values(err.errors || {}).map((error) => error.message);
  return new AppError(`Validation failed: ${messages.join('. ')}`, 422);
}

function normalizeError(err) {
  if (err.name === 'CastError') return handleCastError(err);
  if (err.code === 11000) return handleDuplicateKey(err);
  if (err.name === 'ValidationError') return handleValidationError(err);
  if (err.name === 'JsonWebTokenError') return AppError.unauthorized('Invalid token. Please log in again.');
  if (err.name === 'TokenExpiredError') return AppError.unauthorized('Your session has expired. Please log in again.');
  return err;
}

function statusCodeFor(err) {
  const status = Number(err.statusCode || err.status || 500);
  return status >= 400 && status <= 599 ? status : 500;
}

function errorHandler(err, req, res, _next) {
  const error = normalizeError(err);
  const status = statusCodeFor(error);
  const fallback = 'An unexpected internal server error occurred.';
  const exposeMessage = process.env.NODE_ENV !== 'production' || status < 500;
  const message = exposeMessage ? error.message || fallback : fallback;
  const payload = { status: status < 500 ? 'fail' : 'error', message };

  if (error.details && exposeMessage) payload.details = error.details;

  const log = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
  log({ err: error, status, path: req.originalUrl, operational: Boolean(error.isOperational) }, 'Request failed');
  res.status(status).json(payload);
}

module.exports = { apiLimiter, authLimiter, errorHandler };
