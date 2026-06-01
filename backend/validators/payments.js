const { body } = require('express-validator');
const { liveMongoIdParam, optionalString, positiveAmount } = require('./common');

const idempotencyKeyBody = optionalString('idempotencyKey', 128);

const amountSchema = [positiveAmount('amount'), optionalString('description', 240), idempotencyKeyBody];

const withdrawalSchema = [
  positiveAmount('amount'),
  body('method').isIn(['mpesa', 'mtn', 'bank', 'stripe']).withMessage('Choose a supported withdrawal method'),
  body('destination').trim().isLength({ min: 3, max: 120 }).withMessage('Destination account or phone is required'),
  optionalString('accountName', 120),
  optionalString('description', 240),
  idempotencyKeyBody
];

const releasePaymentSchema = [liveMongoIdParam('bookingId'), idempotencyKeyBody];

module.exports = { amountSchema, releasePaymentSchema, withdrawalSchema };
