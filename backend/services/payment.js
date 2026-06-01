const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');

function parsePositiveAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    const err = new Error('Amount must be greater than zero');
    err.status = 400;
    throw err;
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

  async credit(userId, amount, description = 'Wallet credit', reference = 'manual') {
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

  async debit(userId, amount, description = 'Wallet debit', reference = 'manual') {
    const amountNum = parsePositiveAmount(amount);
    await this.ensureWallet(userId);

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: amountNum } },
      { $inc: { balance: -amountNum, version: 1 } },
      { new: true }
    );

    if (!wallet) {
      const err = new Error('Insufficient wallet balance');
      err.status = 400;
      throw err;
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

  async withdraw(userId, amount, method = 'mpesa', payoutDetails = {}, description = 'Owner wallet withdrawal') {
    const amountNum = parsePositiveAmount(amount);
    await this.ensureWallet(userId);

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: amountNum } },
      { $inc: { balance: -amountNum, version: 1 } },
      { new: true }
    );

    if (!wallet) {
      const err = new Error('Insufficient wallet balance');
      err.status = 400;
      throw err;
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

  async releaseBookingPayment(bookingId, releasedBy) {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      const err = new Error('Booking not found');
      err.status = 404;
      throw err;
    }

    if (booking.status !== 'delivered') {
      const err = new Error('Booking must be delivered before payment release');
      err.status = 409;
      throw err;
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
      const err = new Error('Booking payment is not held in escrow');
      err.status = 409;
      throw err;
    }

    if (!booking.owner) {
      const err = new Error('Booking has no assigned owner');
      err.status = 409;
      throw err;
    }

    const payment = await Transaction.findOne({
      booking: booking._id,
      type: 'payment',
      status: 'completed'
    }).sort('-createdAt');
    const amount = payment?.amount || booking.paymentAmount;
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      const err = new Error('No completed payment is available to release');
      err.status = 409;
      throw err;
    }

    const reserved = await Booking.findOneAndUpdate(
      { _id: booking._id, paymentStatus: 'escrowed' },
      { $set: { paymentStatus: 'release_pending' } },
      { new: true }
    );
    if (!reserved) {
      const err = new Error('Booking payment is already being released');
      err.status = 409;
      throw err;
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
  StripeService: class {},
  MpesaService: class {},
  MTNMoMoService: class {},
  PaymentReconciliationService,
  WalletService
};
