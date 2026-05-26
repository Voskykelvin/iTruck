const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../config/asyncHandler');
const payment = require('../services/payment');

const router = express.Router();

const amountValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero').toFloat(),
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

module.exports = router;
