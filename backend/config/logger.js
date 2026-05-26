const pino = require('pino');

const isTest = process.env.NODE_ENV === 'test';

const logger = pino({
  enabled: process.env.LOG_ENABLED !== 'false' && !isTest,
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: 'itruck-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'token',
      'refreshToken',
      'JWT_SECRET',
      'MONGODB_URI',
      'CLOUDINARY_API_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET'
    ],
    censor: '[redacted]'
  }
});

module.exports = logger;
