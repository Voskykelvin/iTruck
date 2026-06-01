const { body } = require('express-validator');
const { liveMongoIdParam, optionalString, positiveAmount } = require('./common');

const amountSchema = [positiveAmount('amount'), optionalString('description', 240)];

const withdrawalSchema = [
  positiveAmount('amount'),
  body('method').isIn(['mpesa', 'mtn', 'bank', 'stripe']).withMessage('Choose a supported withdrawal method'),
  body('destination').trim().isLength({ min: 3, max: 120 }).withMessage('Destination account or phone is required'),
  optionalString('accountName', 120),
  optionalString('description', 240)
];

const releasePaymentSchema = [liveMongoIdParam('bookingId')];

module.exports = { amountSchema, releasePaymentSchema, withdrawalSchema };
