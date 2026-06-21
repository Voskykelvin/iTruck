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
      'req.body.password',
      'req.body.currentPassword',
      'req.body.newPassword',
      'req.body.token',
      'req.body.refreshToken',
      'req.body.pin',
      'req.body.mpesaPassword',
      'req.body.deviceId',
      'req.query.token',
      'req.query.secret',
      'res.headers["set-cookie"]',
      'password',
      'token',
      'refreshToken',
      'JWT_SECRET',
      'MONGODB_URI',
      'CLOUDINARY_API_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'MPESA_CONSUMER_SECRET',
      'MPESA_PASSKEY',
      'MPESA_WEBHOOK_SECRET',
      'MPESA_CALLBACK_SECRET',
      'MTN_MOMO_API_KEY',
      'MTN_MOMO_SUBSCRIPTION_KEY',
      'MTN_MOMO_WEBHOOK_SECRET',
      'MTN_MOMO_CALLBACK_SECRET',
      'MOMO_API_KEY',
      'MOMO_SUBSCRIBER_KEY',
      'MOMO_WEBHOOK_SECRET',
      'AFRICASTALKING_API_KEY',
      'SENDGRID_API_KEY',
      'RESEND_API_KEY',
      'SMTP_URL',
      'SMTP_PASS'
    ],
    censor: '[redacted]'
  }
});

module.exports = logger;
