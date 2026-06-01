const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../config/asyncHandler');
const payment = require('../services/payment');
const { amountSchema, releasePaymentSchema, withdrawalSchema } = require('../validators/payments');

const router = express.Router();

router.use(protect);

router.get(
  '/wallet',
  asyncHandler(async (req, res) => {
    res.json({ balance: await payment.wallet.getBalance(req.user._id) });
  })
);

router.post(
  '/wallet/debit',
  restrictTo('admin'),
  amountSchema,
  validate,
  asyncHandler(async (req, res) => {
    res.json(await payment.wallet.debit(req.user._id, req.body.amount, req.body.description));
  })
);

router.post(
  '/wallet/credit',
  restrictTo('admin'),
  amountSchema,
  validate,
  asyncHandler(async (req, res) => {
    res.json(await payment.wallet.credit(req.user._id, req.body.amount, req.body.description));
  })
);

router.post(
  '/withdraw',
  restrictTo('owner', 'admin'),
  withdrawalSchema,
  validate,
  asyncHandler(async (req, res) => {
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
  })
);

router.post(
  '/bookings/:bookingId/release',
  restrictTo('admin'),
  releasePaymentSchema,
  validate,
  asyncHandler(async (req, res) => {
    const result = await payment.wallet.releaseBookingPayment(req.params.bookingId, req.user._id);
    res.status(result.alreadyReleased ? 200 : 201).json(result);
  })
);

module.exports = router;
