const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const Idempotency = require('../models/Idempotency');

const IDEMPOTENCY_TTL_MINUTES = 60;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/;

function appError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toString === 'function' && value._bsontype) return value.toString();
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
}

function hashPayload(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function generateIdempotencyKey(parts) {
  return hashPayload(parts).slice(0, 32);
}

function normalizeIdempotencyKey(key) {
  const value = String(key || '').trim();
  if (!value) return '';
  if (value.length < 8 || value.length > 128 || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw appError('Idempotency-Key must be 8-128 URL-safe characters', 400);
  }
  return value;
}

function idempotencyError(message, status = 409) {
  const err = appError(message, status);
  err.isOperational = true;
  return err;
}

function serializeIdempotencyResult(value) {
  if (!value) return value;
  if (typeof value.toObject === 'function') {
    return value.toObject({ depopulate: true, versionKey: false });
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    return { message: 'Operation completed' };
  }
}

async function checkIdempotency(key, options = {}) {
  const cleanKey = normalizeIdempotencyKey(key);
  if (!cleanKey) throw appError('Idempotency-Key is required', 400);
  const ttlMinutes = Number(options.ttlMinutes || IDEMPOTENCY_TTL_MINUTES);
  const requestHash = options.requestPayload ? hashPayload(options.requestPayload) : undefined;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  try {
    const record = await Idempotency.create({
      key: cleanKey,
      scope: options.scope || 'payment',
      requestHash,
      status: 'processing',
      expiresAt
    });
    return { exists: false, key: cleanKey, record };
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  const existing = await Idempotency.findOne({ key: cleanKey });
  if (!existing) {
    throw idempotencyError('Unable to reserve idempotency key');
  }

  if (requestHash && existing.requestHash && existing.requestHash !== requestHash) {
    throw idempotencyError('Idempotency key was reused with a different request payload');
  }

  if (existing.status === 'completed') {
    return { exists: true, key: cleanKey, result: existing.result, record: existing };
  }

  if (existing.status === 'failed') {
    const err = idempotencyError(existing.error?.message || 'Previous request with this idempotency key failed');
    err.previousResult = existing.result;
    throw err;
  }

  throw idempotencyError('Request is already being processed');
}

async function markIdempotencyComplete(key, resultData = {}) {
  const cleanKey = normalizeIdempotencyKey(key);
  return Idempotency.findOneAndUpdate(
    { key: cleanKey },
    {
      $set: {
        status: 'completed',
        result: serializeIdempotencyResult(resultData),
        completedAt: new Date()
      },
      $unset: { error: 1, failedAt: 1 }
    },
    { new: true }
  );
}

async function markIdempotencyFailed(key, error) {
  const cleanKey = normalizeIdempotencyKey(key);
  return Idempotency.findOneAndUpdate(
    { key: cleanKey },
    {
      $set: {
        status: 'failed',
        result: { error: error.message },
        error: {
          message: error.message,
          status: error.status || 500
        },
        failedAt: new Date()
      }
    },
    { new: true }
  );
}

async function runWithIdempotency(key, requestPayload, operation, options = {}) {
  if (!key) return operation();

  const state = await checkIdempotency(key, {
    requestPayload,
    scope: options.scope,
    ttlMinutes: options.ttlMinutes
  });
  if (state.exists) return state.result;

  try {
    const result = await operation();
    await markIdempotencyComplete(state.key, result);
    return result;
  } catch (err) {
    try {
      await markIdempotencyFailed(state.key, err);
    } catch (_markErr) {
      // Preserve the original payment error for the caller.
    }
    throw err;
  }
}

function parsePositiveAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw appError('Amount must be greater than zero', 400);
  }
  return value;
}

function stripeAmount(value, currency = 'usd') {
  const amount = Number(value || 0);
  const zeroDecimal = new Set([
    'bif',
    'clp',
    'djf',
    'gnf',
    'jpy',
    'kmf',
    'krw',
    'mga',
    'pyg',
    'rwf',
    'ugx',
    'vnd',
    'vuv',
    'xaf',
    'xof',
    'xpf'
  ]);
  return zeroDecimal.has(String(currency || '').toLowerCase()) ? amount : amount / 100;
}

function validObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function idOf(value) {
  return value?._id || value;
}

function sameId(left, right) {
  return String(idOf(left) || '') === String(idOf(right) || '');
}

function acceptedBidAmount(booking = {}) {
  const bid = (booking.bids || []).find((item) => item.status === 'accepted');
  const amount = Number(bid?.amount || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function firstPositiveAmount(values = []) {
  return values.map(Number).find((value) => Number.isFinite(value) && value > 0) || 0;
}

function bookingEscrowAmount(booking, requestedAmount) {
  const requested = Number(requestedAmount || 0);
  if (Number.isFinite(requested) && requested > 0) return requested;

  return firstPositiveAmount([
    acceptedBidAmount(booking),
    booking?.paymentAmount,
    booking?.budget,
    booking?.estimate?.total,
    booking?.cargoValue
  ]);
}

function stripeObject(event) {
  return event?.data?.object || {};
}

function stripeMetadata(object = {}) {
  return object.metadata || {};
}

function stripePaymentStatus(type) {
  if (['checkout.session.completed', 'payment_intent.succeeded'].includes(type)) return 'completed';
  if (['charge.refunded', 'refund.created', 'refund.updated'].includes(type)) return 'refunded';
  if (['checkout.session.expired', 'payment_intent.canceled', 'payment_intent.payment_failed'].includes(type)) {
    return 'failed';
  }
  return 'pending';
}

function bookingPaymentStatus(transactionStatus) {
  if (transactionStatus === 'completed') return 'escrowed';
  if (transactionStatus === 'failed') return 'failed';
  if (transactionStatus === 'refunded') return 'refunded';
  return 'pending';
}

class WalletService {
  async legacyStartingBalance(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) return 0;
    if (!User.collection?.findOne) return 0;

    const user = await User.collection.findOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { projection: { walletBalance: 1 } }
    );

    return Number(user?.walletBalance || 0);
  }

  async ensureWallet(userId) {
    const startingBalance = await this.legacyStartingBalance(userId);
    return Wallet.findOneAndUpdate(
      { user: userId },
      {
        $setOnInsert: {
          user: userId,
          balance: startingBalance,
          currency: 'USD'
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  async getBalance(userId) {
    const wallet = await this.ensureWallet(userId);
    return wallet?.balance || 0;
  }

  async listTransactions(userId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit || 12), 1), 50);
    return Transaction.find({ user: userId }).sort('-createdAt').limit(limit);
  }

  async credit(userId, amount, description = 'Wallet credit', reference = 'manual', options = {}) {
    return runWithIdempotency(
      options.idempotencyKey,
      { userId, amount, description, reference },
      () => this.createCredit(userId, amount, description, reference),
      { scope: 'wallet.credit' }
    );
  }

  async createCredit(userId, amount, description = 'Wallet credit', reference = 'manual') {
    const amountNum = parsePositiveAmount(amount);
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: { balance: amountNum, version: 1 },
        $setOnInsert: { user: userId, currency: 'USD' }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const transaction = await Transaction.create({
      user: userId,
      type: 'credit',
      amount: amountNum,
      description,
      reference,
      status: 'completed',
      metadata: { walletBalance: wallet.balance }
    });

    await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });
    return transaction;
  }

  async debit(userId, amount, description = 'Wallet debit', reference = 'manual', options = {}) {
    return runWithIdempotency(
      options.idempotencyKey,
      { userId, amount, description, reference },
      () => this.createDebit(userId, amount, description, reference),
      { scope: 'wallet.debit' }
    );
  }

  async createDebit(userId, amount, description = 'Wallet debit', reference = 'manual') {
    const amountNum = parsePositiveAmount(amount);
    await this.ensureWallet(userId);

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: amountNum } },
      { $inc: { balance: -amountNum, version: 1 } },
      { new: true }
    );

    if (!wallet) {
      throw appError('Insufficient wallet balance', 400);
    }

    const transaction = await Transaction.create({
      user: userId,
      type: 'debit',
      amount: amountNum,
      description,
      reference,
      status: 'completed',
      metadata: { walletBalance: wallet.balance }
    });

    await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });
    return transaction;
  }

  async withdraw(
    userId,
    amount,
    method = 'mpesa',
    payoutDetails = {},
    description = 'Owner wallet withdrawal',
    options = {}
  ) {
    return runWithIdempotency(
      options.idempotencyKey,
      { userId, amount, method, payoutDetails, description },
      () => this.createWithdrawal(userId, amount, method, payoutDetails, description),
      { scope: 'wallet.withdraw' }
    );
  }

  async createWithdrawal(
    userId,
    amount,
    method = 'mpesa',
    payoutDetails = {},
    description = 'Owner wallet withdrawal'
  ) {
    const amountNum = parsePositiveAmount(amount);
    await this.ensureWallet(userId);

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: amountNum } },
      { $inc: { balance: -amountNum, version: 1 } },
      { new: true }
    );

    if (!wallet) {
      throw appError('Insufficient wallet balance', 400);
    }

    const transaction = await Transaction.create({
      user: userId,
      type: 'withdrawal',
      method,
      amount: amountNum,
      description,
      reference: `wd-${Date.now()}`,
      status: 'pending',
      metadata: {
        payoutDetails,
        requestedAt: new Date().toISOString(),
        walletBalance: wallet.balance
      }
    });

    await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });
    return transaction;
  }

  async fundBookingEscrow(bookingId, payerId, options = {}) {
    return runWithIdempotency(
      options.idempotencyKey,
      { bookingId, payerId, amount: options.amount },
      () => this.createBookingEscrow(bookingId, payerId, options.amount),
      { scope: 'booking.payment.escrow' }
    );
  }

  async createBookingEscrow(bookingId, payerId, requestedAmount) {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw appError('Booking not found', 404);
    }

    if (!sameId(booking.client, payerId)) {
      throw appError('Only the booking shipper can fund escrow', 403);
    }

    if (!booking.owner) {
      throw appError('Accept a carrier bid before funding escrow', 409);
    }

    if (!['confirmed', 'in_transit', 'delivered'].includes(booking.status)) {
      throw appError('Booking must be confirmed before funding escrow', 409);
    }

    if (['escrowed', 'release_pending', 'released'].includes(booking.paymentStatus)) {
      const existing = await Transaction.findOne({
        booking: booking._id,
        type: 'payment',
        status: 'completed'
      }).sort('-createdAt');
      return { booking, transaction: existing, alreadyFunded: true };
    }

    if (!['unpaid', 'pending', 'failed'].includes(booking.paymentStatus || 'unpaid')) {
      throw appError('Booking payment cannot be funded from its current state', 409);
    }

    const amount = parsePositiveAmount(bookingEscrowAmount(booking, requestedAmount));
    await this.ensureWallet(payerId);

    const originalPaymentStatus = booking.paymentStatus || 'unpaid';
    const reserved = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        $or: [{ paymentStatus: { $in: ['unpaid', 'pending', 'failed'] } }, { paymentStatus: { $exists: false } }]
      },
      {
        $set: {
          paymentStatus: 'pending',
          paymentAmount: amount,
          paymentReference: `wallet:${booking._id}`
        }
      },
      { new: true }
    );

    if (!reserved) {
      throw appError('Booking payment is already being funded', 409);
    }

    const wallet = await Wallet.findOneAndUpdate(
      { user: payerId, balance: { $gte: amount } },
      { $inc: { balance: -amount, version: 1 } },
      { new: true }
    );

    if (!wallet) {
      await Booking.updateOne(
        { _id: booking._id, paymentStatus: 'pending' },
        { $set: { paymentStatus: originalPaymentStatus }, $unset: { paymentReference: 1 } }
      );
      throw appError('Insufficient wallet balance', 400);
    }

    const transaction = await Transaction.create({
      user: payerId,
      booking: reserved._id,
      type: 'payment',
      method: 'wallet',
      amount,
      description: `Escrow funded for booking ${reserved._id}`,
      reference: `escrow:${reserved._id}`,
      status: 'completed',
      metadata: {
        walletBalance: wallet.balance,
        owner: reserved.owner,
        fundedAt: new Date().toISOString()
      }
    });

    await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });

    reserved.paymentStatus = 'escrowed';
    reserved.paymentReference = transaction.reference;
    reserved.paymentAmount = amount;
    reserved.paidAt = new Date();
    await reserved.save();

    return { booking: reserved, transaction, alreadyFunded: false };
  }

  async releaseBookingPayment(bookingId, releasedBy, options = {}) {
    return runWithIdempotency(
      options.idempotencyKey,
      { bookingId, releasedBy },
      () => this.releaseReservedBookingPayment(bookingId, releasedBy),
      { scope: 'booking.payment.release' }
    );
  }

  async releaseReservedBookingPayment(bookingId, releasedBy) {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw appError('Booking not found', 404);
    }

    if (booking.status !== 'delivered') {
      throw appError('Booking must be delivered before payment release', 409);
    }

    if (booking.paymentStatus === 'released') {
      const existing = await Transaction.findOne({
        booking: booking._id,
        type: 'credit',
        reference: `release:${booking._id}`
      });
      return { booking, transaction: existing, alreadyReleased: true };
    }

    if (booking.paymentStatus !== 'escrowed') {
      throw appError('Booking payment is not held in escrow', 409);
    }

    if (!booking.owner) {
      throw appError('Booking has no assigned owner', 409);
    }

    const payment = await Transaction.findOne({
      booking: booking._id,
      type: 'payment',
      status: 'completed'
    }).sort('-createdAt');
    const amount = payment?.amount || booking.paymentAmount;
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw appError('No completed payment is available to release', 409);
    }

    const reserved = await Booking.findOneAndUpdate(
      { _id: booking._id, paymentStatus: 'escrowed' },
      { $set: { paymentStatus: 'release_pending' } },
      { new: true }
    );
    if (!reserved) {
      throw appError('Booking payment is already being released', 409);
    }

    try {
      const transaction = await this.credit(
        reserved.owner,
        amount,
        `Payment release for booking ${reserved._id}`,
        `release:${reserved._id}`
      );
      transaction.booking = reserved._id;
      transaction.metadata = {
        ...(transaction.metadata || {}),
        releasedBy,
        paymentTransaction: payment?._id
      };
      await transaction.save?.();

      reserved.paymentStatus = 'released';
      reserved.releasedAt = new Date();
      await reserved.save();
      return { booking: reserved, transaction, alreadyReleased: false };
    } catch (err) {
      await Booking.updateOne(
        { _id: reserved._id, paymentStatus: 'release_pending' },
        { $set: { paymentStatus: 'escrowed' } }
      );
      throw err;
    }
  }
}

class PaymentReconciliationService {
  async reconcileStripeEvent(event) {
    const object = stripeObject(event);
    const metadata = stripeMetadata(object);
    const bookingId = metadata.bookingId || metadata.booking || object.client_reference_id;
    const userId = metadata.userId || metadata.clientId || metadata.user;
    const currency = String(object.currency || 'usd').toUpperCase();
    const rawAmount = object.amount_received || object.amount_total || object.amount || 0;
    const amount = stripeAmount(rawAmount, currency);
    const status = stripePaymentStatus(event.type);
    const reference = object.payment_intent || object.id || event.id;
    const bookingPayment = bookingPaymentStatus(status);

    const transaction = await Transaction.findOneAndUpdate(
      { provider: 'stripe', providerEventId: event.id },
      {
        $setOnInsert: {
          user: validObjectId(userId) ? userId : undefined,
          booking: validObjectId(bookingId) ? bookingId : undefined,
          type: status === 'refunded' ? 'refund' : 'payment',
          method: 'stripe',
          amount,
          currency,
          reference,
          provider: 'stripe',
          providerEventId: event.id,
          description: `Stripe ${event.type}`
        },
        $set: {
          status,
          metadata: {
            stripeType: event.type,
            stripeObjectId: object.id,
            bookingId,
            userId,
            livemode: Boolean(event.livemode)
          }
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (validObjectId(bookingId)) {
      const updates = {
        paymentStatus: bookingPayment,
        paymentReference: String(reference || ''),
        paymentAmount: amount
      };
      if (status === 'completed') updates.paidAt = new Date();
      await Booking.findByIdAndUpdate(bookingId, { $set: updates }, { new: true });
    }

    return transaction;
  }
}

module.exports = {
  payments: new PaymentReconciliationService(),
  wallet: new WalletService(),
  checkIdempotency,
  generateIdempotencyKey,
  markIdempotencyComplete,
  markIdempotencyFailed,
  normalizeIdempotencyKey,
  runWithIdempotency,
  StripeService: class {},
  MpesaService: class {},
  MTNMoMoService: class {},
  PaymentReconciliationService,
  WalletService
};
