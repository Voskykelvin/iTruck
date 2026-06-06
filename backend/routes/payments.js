const express = require('express');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../config/asyncHandler');
const notifications = require('../services/notifications');
const payment = require('../services/payment');
const { amountSchema, fundEscrowSchema, releasePaymentSchema, withdrawalSchema } = require('../validators/payments');

const router = express.Router();

router.use(protect);

function idempotencyKey(req) {
  return req.get('Idempotency-Key') || req.body.idempotencyKey || '';
}

function demoTransaction(req, type, overrides = {}) {
  const body = req.body || {};
  return {
    id: `${type}-${Date.now()}`,
    user: req.user._id,
    type,
    amount: Number(body.amount || overrides.amount || 0),
    method: body.method || overrides.method || 'manual',
    description: body.description || overrides.description || '',
    reference: idempotencyKey(req) || `${type}:memory`,
    status: overrides.status || 'completed',
    metadata: {
      mode: 'memory',
      destination: body.destination,
      accountName: body.accountName || ''
    }
  };
}

function demoTransactions(req) {
  return [
    demoTransaction(req, 'payment', {
      amount: 1260,
      method: 'wallet',
      description: 'Escrow funded for ITK-2044',
      status: 'completed'
    }),
    demoTransaction(req, 'withdrawal', {
      amount: 240,
      method: 'mpesa',
      description: 'Owner payout request',
      status: 'pending'
    })
  ];
}

function transactionMetadataValue(transaction, key) {
  const metadata = transaction?.metadata;
  if (!metadata) return undefined;
  if (typeof metadata.get === 'function') return metadata.get(key);
  return metadata[key];
}

router.get(
  '/wallet',
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({
        balance: Number(req.user.walletBalance || 0),
        transactions: demoTransactions(req),
        mode: 'memory'
      });
    }

    const [balance, transactions] = await Promise.all([
      payment.wallet.getBalance(req.user._id),
      payment.wallet.listTransactions(req.user._id, { limit: req.query.limit })
    ]);
    res.json({ balance, transactions });
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
  '/bookings/:bookingId/escrow',
  restrictTo('client'),
  fundEscrowSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const transaction = demoTransaction(req, 'payment', {
        amount: req.body.amount || 0,
        method: 'wallet',
        description: `Escrow funded for booking ${req.params.bookingId}`,
        status: 'completed'
      });
      return res.status(201).json({
        booking: {
          _id: req.params.bookingId,
          paymentStatus: 'escrowed',
          paymentReference: transaction.reference,
          paymentAmount: transaction.amount,
          paidAt: new Date().toISOString()
        },
        transaction,
        balance: Number(req.user.walletBalance || 0),
        alreadyFunded: false,
        mode: 'memory'
      });
    }

    const result = await payment.wallet.fundBookingEscrow(req.params.bookingId, req.user._id, {
      amount: req.body.amount,
      idempotencyKey: idempotencyKey(req)
    });

    if (!result.alreadyFunded) {
      const amount = result.transaction?.amount || result.booking?.paymentAmount || req.body.amount;
      try {
        await notifications.notifyBookingParties(
          result.booking,
          'payment.escrowed',
          {
            title: `${result.booking._id} escrow funded`,
            message: `Wallet escrow of ${amount} is now held for this shipment.`,
            link: '/app/payments',
            bookingId: result.booking._id,
            amount
          },
          req.app.get('io')
        );
      } catch (_err) {
        // Payment completion should not fail because a notification could not be recorded.
      }

      const io = req.app.get('io');
      if (io?.emitToBooking) io.emitToBooking(result.booking._id, 'payment-escrowed', result.booking);
    }

    const balance =
      transactionMetadataValue(result.transaction, 'walletBalance') ?? (await payment.wallet.getBalance(req.user._id));
    res.status(result.alreadyFunded ? 200 : 201).json({ ...result, balance });
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
