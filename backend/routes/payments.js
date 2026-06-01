const express = require('express');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../config/asyncHandler');
const payment = require('../services/payment');
const { amountSchema, releasePaymentSchema, withdrawalSchema } = require('../validators/payments');

const router = express.Router();

router.use(protect);

function idempotencyKey(req) {
  return req.get('Idempotency-Key') || req.body.idempotencyKey || '';
}

function demoTransaction(req, type, overrides = {}) {
  return {
    id: `${type}-${Date.now()}`,
    user: req.user._id,
    type,
    amount: Number(req.body.amount || overrides.amount || 0),
    method: req.body.method || overrides.method || 'manual',
    description: req.body.description || overrides.description || '',
    reference: idempotencyKey(req) || `${type}:memory`,
    status: overrides.status || 'completed',
    metadata: {
      mode: 'memory',
      destination: req.body.destination,
      accountName: req.body.accountName || ''
    }
  };
}

router.get(
  '/wallet',
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ balance: Number(req.user.walletBalance || 0), mode: 'memory' });
    res.json({ balance: await payment.wallet.getBalance(req.user._id) });
  })
);

router.post(
  '/wallet/debit',
  restrictTo('admin'),
  amountSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ ...demoTransaction(req, 'debit'), mode: 'memory' });
    res.json(
      await payment.wallet.debit(req.user._id, req.body.amount, req.body.description, 'manual', {
        idempotencyKey: idempotencyKey(req)
      })
    );
  })
);

router.post(
  '/wallet/credit',
  restrictTo('admin'),
  amountSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ ...demoTransaction(req, 'credit'), mode: 'memory' });
    res.json(
      await payment.wallet.credit(req.user._id, req.body.amount, req.body.description, 'manual', {
        idempotencyKey: idempotencyKey(req)
      })
    );
  })
);

router.post(
  '/withdraw',
  restrictTo('owner', 'admin'),
  withdrawalSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.status(201).json({
        transaction: demoTransaction(req, 'withdrawal', { status: 'pending' }),
        mode: 'memory'
      });
    }

    const transaction = await payment.wallet.withdraw(
      req.user._id,
      req.body.amount,
      req.body.method,
      {
        destination: req.body.destination,
        accountName: req.body.accountName || '',
        requestedByRole: req.user.role
      },
      req.body.description || 'Owner wallet withdrawal',
      { idempotencyKey: idempotencyKey(req) }
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
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.status(201).json({
        booking: {
          _id: req.params.bookingId,
          paymentStatus: 'released',
          releasedAt: new Date().toISOString()
        },
        transaction: demoTransaction(req, 'credit', {
          amount: req.body.amount,
          description: `Payment release for booking ${req.params.bookingId}`
        }),
        alreadyReleased: false,
        mode: 'memory'
      });
    }

    const result = await payment.wallet.releaseBookingPayment(req.params.bookingId, req.user._id, {
      idempotencyKey: idempotencyKey(req)
    });
    res.status(result.alreadyReleased ? 200 : 201).json(result);
  })
);

module.exports = router;
