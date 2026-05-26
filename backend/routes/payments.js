const express = require('express');
const { body } = require('express-validator');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../config/asyncHandler');
const payment = require('../services/payment');

const router = express.Router();

const amountValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero').toFloat(),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 240 }).withMessage('Description is too long'),
  validate
];

const withdrawalValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero').toFloat(),
  body('method').isIn(['mpesa', 'mtn', 'bank', 'stripe']).withMessage('Choose a supported withdrawal method'),
  body('destination').trim().isLength({ min: 3, max: 120 }).withMessage('Destination account or phone is required'),
  body('accountName').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Account name is too long'),
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 240 }).withMessage('Description is too long'),
  validate
];

router.use(protect);

router.get('/wallet', asyncHandler(async (req, res) => {
  res.json({ balance: await payment.wallet.getBalance(req.user._id) });
}));

router.post('/wallet/debit', amountValidation, asyncHandler(async (req, res) => {
  res.json(await payment.wallet.debit(req.user._id, req.body.amount, req.body.description));
}));

router.post('/wallet/credit', amountValidation, asyncHandler(async (req, res) => {
  res.json(await payment.wallet.credit(req.user._id, req.body.amount, req.body.description));
}));

router.post('/withdraw', restrictTo('owner', 'admin'), withdrawalValidation, asyncHandler(async (req, res) => {
  const transaction = await payment.wallet.withdraw(
    req.user._id,
    req.body.amount,
    req.body.method,
    {
      destination: req.body.destination,
      accountName: req.body.accountName || '',
      requestedByRole: req.user.role
    },
    req.body.description || 'Owner wallet withdrawal'
  );

  res.status(201).json({ transaction });
}));

module.exports = router;
