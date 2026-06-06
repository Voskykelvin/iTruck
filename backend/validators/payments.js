const { body } = require('express-validator');
const { liveMongoIdBody, liveMongoIdParam, optionalString, positiveAmount } = require('./common');

const idempotencyKeyBody = optionalString('idempotencyKey', 128);

const amountSchema = [positiveAmount('amount'), optionalString('description', 240), idempotencyKeyBody];

const fundEscrowSchema = [
  liveMongoIdParam('bookingId'),
  body('amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0.01 })
    .withMessage('amount must be greater than zero')
    .toFloat(),
  idempotencyKeyBody
];

const withdrawalSchema = [
  positiveAmount('amount'),
  body('method').isIn(['mpesa', 'mtn', 'bank', 'stripe']).withMessage('Choose a supported withdrawal method'),
  body('destination').trim().isLength({ min: 3, max: 120 }).withMessage('Destination account or phone is required'),
  optionalString('accountName', 120),
  optionalString('description', 240),
  idempotencyKeyBody
];

const releasePaymentSchema = [liveMongoIdParam('bookingId'), idempotencyKeyBody];

const mobileMoneyProvider = body('method')
  .optional({ checkFalsy: true })
  .isIn(['mpesa', 'm-pesa', 'mtn', 'momo', 'mtn-momo'])
  .withMessage('Choose either M-Pesa or MTN MoMo');

const mobileMoneyProviderAlias = body('provider')
  .optional({ checkFalsy: true })
  .isIn(['mpesa', 'm-pesa', 'mtn', 'momo', 'mtn-momo'])
  .withMessage('Choose either M-Pesa or MTN MoMo');

const mobileMoneyPhone = body('phone')
  .trim()
  .isLength({ min: 8, max: 24 })
  .withMessage('A valid mobile money phone number is required');

const initiateMobileMoneySchema = [
  liveMongoIdParam('bookingId'),
  body().custom((_, { req }) => {
    if (req.body.method || req.body.provider) return true;
    throw new Error('method is required');
  }),
  mobileMoneyProvider,
  mobileMoneyProviderAlias,
  mobileMoneyPhone,
  body('amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0.01 })
    .withMessage('amount must be greater than zero')
    .toFloat(),
  idempotencyKeyBody
];

const initiateMobileMoneyBodySchema = [
  liveMongoIdBody('bookingId', { required: true }),
  body().custom((_, { req }) => {
    if (req.body.method || req.body.provider) return true;
    throw new Error('method is required');
  }),
  mobileMoneyProvider,
  mobileMoneyProviderAlias,
  mobileMoneyPhone,
  body('amount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0.01 })
    .withMessage('amount must be greater than zero')
    .toFloat(),
  idempotencyKeyBody
];

module.exports = {
  amountSchema,
  fundEscrowSchema,
  initiateMobileMoneyBodySchema,
  initiateMobileMoneySchema,
  releasePaymentSchema,
  withdrawalSchema
};
