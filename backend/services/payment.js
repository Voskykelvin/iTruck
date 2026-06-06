const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const Idempotency = require('../models/Idempotency');
const logger = require('../config/logger');

const IDEMPOTENCY_TTL_MINUTES = 60;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/;

function appError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function envValue(...keys) {
  return keys.map((key) => process.env[key]).find(Boolean);
}

function requireEnv(label, ...keys) {
  const value = envValue(...keys);
  if (!value) {
    throw appError(`${label} is not configured`, 503);
  }
  return value;
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function providerBaseUrl(value, fallback) {
  return trimTrailingSlash(value || fallback);
}

function publicBaseUrl() {
  const value = envValue('PUBLIC_API_URL', 'API_BASE_URL', 'BASE_URL', 'APP_URL');
  if (!value) {
    throw appError('BASE_URL or provider callback URL must be configured', 503);
  }
  return trimTrailingSlash(value);
}

function providerCallbackUrl(provider) {
  if (provider === 'mpesa') {
    return envValue('MPESA_CALLBACK_URL') || `${publicBaseUrl()}/api/payments/webhooks/mpesa/stk`;
  }
  return (
    envValue('MTN_MOMO_CALLBACK_URL', 'MOMO_CALLBACK_URL') ||
    `${publicBaseUrl()}/api/payments/webhooks/mtn/request-to-pay`
  );
}

function mpesaTimestamp(date = new Date()) {
  return date.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

function normalizeMpesaPhone(phone) {
  let cleaned = String(phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = `254${cleaned.slice(1)}`;
  if (/^(7|1)\d{8}$/.test(cleaned)) cleaned = `254${cleaned}`;
  if (!/^254(?:7|1)\d{8}$/.test(cleaned)) {
    throw appError('Enter a valid Kenyan M-Pesa number', 400);
  }
  return cleaned;
}

function normalizeInternationalPhone(phone) {
  const cleaned = String(phone || '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(cleaned)) {
    throw appError('Enter a valid mobile money number with country code', 400);
  }
  return cleaned;
}

function maskPhone(phone) {
  const cleaned = String(phone || '').replace(/\D/g, '');
  if (cleaned.length <= 4) return cleaned;
  return `${'*'.repeat(Math.max(cleaned.length - 4, 0))}${cleaned.slice(-4)}`;
}

function normalizeMobileMoneyMethod(method) {
  const value = String(method || '').trim().toLowerCase();
  if (value === 'mpesa' || value === 'm-pesa') return 'mpesa';
  if (['mtn', 'momo', 'mtn-momo', 'mtn_momo'].includes(value)) return 'mtn';
  throw appError('Choose either M-Pesa or MTN MoMo', 400);
}

function providerAmount(value) {
  const amount = Math.round(parsePositiveAmount(value));
  if (amount < 1) throw appError('Payment amount must be at least 1', 400);
  return amount;
}

function mobileMoneyReference(method, providerReference) {
  return `${method}:${providerReference}`;
}

function parseJsonResponse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_err) {
    return { raw: text };
  }
}

function providerErrorMessage(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  return (
    data.errorMessage ||
    data.error_description ||
    data.message ||
    data.description ||
    data.ResultDesc ||
    data.raw ||
    fallback
  );
}

async function fetchJson(url, options = {}) {
  const activeFetch = options.fetchImpl || global.fetch;
  if (typeof activeFetch !== 'function') {
    throw appError('HTTP fetch API is not available in this runtime', 500);
  }

  const response = await activeFetch(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body
  });
  const text = await response.text();
  const data = parseJsonResponse(text);

  if (!response.ok) {
    const err = appError(providerErrorMessage(data, 'Payment provider request failed'), response.status || 502);
    err.details = data;
    throw err;
  }

  return data;
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

function metadataObject(metadata) {
  if (!metadata) return {};
  if (typeof metadata.toObject === 'function') return metadata.toObject();
  return { ...metadata };
}

function mpesaCallbackMetadata(callbackMetadata = {}) {
  return (callbackMetadata.Item || []).reduce((acc, item) => {
    if (item?.Name) acc[item.Name] = item.Value;
    return acc;
  }, {});
}

async function saveTransaction(transaction, updates) {
  Object.assign(transaction, updates);
  if (typeof transaction.save === 'function') return transaction.save();
  const filter = transaction?._id
    ? { _id: transaction._id }
    : { provider: transaction.provider, providerEventId: transaction.providerEventId };
  return Transaction.findOneAndUpdate(filter, { $set: updates }, { new: true });
}

async function updateBookingFromTransaction(transaction, status, options = {}) {
  if (!transaction?.booking) return null;
  const amount = firstPositiveAmount([options.amount, transaction.amount]);
  const updates = {
    paymentStatus: bookingPaymentStatus(status),
    paymentReference: transaction.reference || '',
    paymentAmount: amount || transaction.amount
  };

  if (status === 'completed') updates.paidAt = new Date();
  return Booking.findByIdAndUpdate(transaction.booking, { $set: updates }, { new: true });
}

class MpesaService {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl;
  }

  baseUrl() {
    return providerBaseUrl(process.env.MPESA_BASE_URL, 'https://sandbox.safaricom.co.ke');
  }

  async accessToken() {
    const consumerKey = requireEnv('M-Pesa consumer key', 'MPESA_CONSUMER_KEY');
    const consumerSecret = requireEnv('M-Pesa consumer secret', 'MPESA_CONSUMER_SECRET');
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const data = await fetchJson(`${this.baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
      fetchImpl: this.fetchImpl,
      headers: { Authorization: `Basic ${auth}` }
    });

    if (!data.access_token) {
      throw appError('M-Pesa token response did not include access_token', 502);
    }
    return data.access_token;
  }

  async initiateStkPush({ amount, phone, accountReference, description, callbackUrl }) {
    const formattedPhone = normalizeMpesaPhone(phone);
    const shortcode = requireEnv('M-Pesa shortcode', 'MPESA_SHORTCODE');
    const passkey = requireEnv('M-Pesa passkey', 'MPESA_PASSKEY');
    const token = await this.accessToken();
    const timestamp = mpesaTimestamp();
    const payload = {
      BusinessShortCode: shortcode,
      Password: Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64'),
      Timestamp: timestamp,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
      Amount: providerAmount(amount),
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl || providerCallbackUrl('mpesa'),
      AccountReference: String(accountReference || 'ITRUCK').slice(0, 12),
      TransactionDesc: String(description || 'iTruck escrow').slice(0, 60)
    };

    const data = await fetchJson(`${this.baseUrl()}/mpesa/stkpush/v1/processrequest`, {
      fetchImpl: this.fetchImpl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!data.CheckoutRequestID) {
      throw appError('M-Pesa STK response did not include CheckoutRequestID', 502);
    }

    return {
      provider: 'mpesa',
      providerReference: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      message: data.CustomerMessage || data.ResponseDescription || 'M-Pesa STK push sent',
      response: data
    };
  }
}

class MTNMoMoService {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl;
  }

  baseUrl() {
    return providerBaseUrl(envValue('MTN_MOMO_BASE_URL', 'MOMO_BASE_URL'), 'https://sandbox.momodeveloper.mtn.com');
  }

  subscriptionKey(product = 'collection') {
    if (product === 'disbursement') {
      return requireEnv(
        'MTN MoMo disbursement subscription key',
        'MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY',
        'MOMO_DISB_SUBSCRIBER_KEY'
      );
    }
    return requireEnv('MTN MoMo subscription key', 'MTN_MOMO_SUBSCRIPTION_KEY', 'MOMO_SUBSCRIBER_KEY');
  }

  async accessToken(product = 'collection') {
    const apiUser =
      product === 'disbursement'
        ? requireEnv('MTN MoMo disbursement API user', 'MTN_MOMO_DISBURSEMENT_API_USER', 'MOMO_DISB_USER_ID')
        : requireEnv('MTN MoMo API user', 'MTN_MOMO_API_USER', 'MOMO_USER_ID');
    const apiKey =
      product === 'disbursement'
        ? requireEnv('MTN MoMo disbursement API key', 'MTN_MOMO_DISBURSEMENT_API_KEY', 'MOMO_DISB_API_KEY')
        : requireEnv('MTN MoMo API key', 'MTN_MOMO_API_KEY', 'MOMO_API_KEY');
    const auth = Buffer.from(`${apiUser}:${apiKey}`).toString('base64');
    const data = await fetchJson(`${this.baseUrl()}/${product}/token/`, {
      fetchImpl: this.fetchImpl,
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Ocp-Apim-Subscription-Key': this.subscriptionKey(product)
      }
    });

    if (!data.access_token) {
      throw appError('MTN MoMo token response did not include access_token', 502);
    }
    return data.access_token;
  }

  targetEnvironment() {
    return envValue('MTN_MOMO_TARGET_ENV', 'MOMO_TARGET_ENV') || 'sandbox';
  }

  currency() {
    return String(envValue('MTN_MOMO_CURRENCY', 'MOMO_CURRENCY') || 'EUR').toUpperCase();
  }

  callbackUrl(referenceId) {
    const base = providerCallbackUrl('mtn');
    if (base.includes(':referenceId')) return base.replace(':referenceId', encodeURIComponent(referenceId));
    if (base.endsWith(`/${referenceId}`)) return base;
    return `${trimTrailingSlash(base)}/${encodeURIComponent(referenceId)}`;
  }

  async requestToPay({ amount, phone, externalId, payerMessage, payeeNote, callbackUrl }) {
    const referenceId = crypto.randomUUID();
    const token = await this.accessToken('collection');
    const payload = {
      amount: String(providerAmount(amount)),
      currency: this.currency(),
      externalId: String(externalId),
      payer: {
        partyIdType: 'MSISDN',
        partyId: normalizeInternationalPhone(phone)
      },
      payerMessage: String(payerMessage || 'iTruck booking payment').slice(0, 160),
      payeeNote: String(payeeNote || 'iTruck escrow').slice(0, 160)
    };

    await fetchJson(`${this.baseUrl()}/collection/v1_0/requesttopay`, {
      fetchImpl: this.fetchImpl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': this.targetEnvironment(),
        'X-Callback-Url': callbackUrl || this.callbackUrl(referenceId),
        'Ocp-Apim-Subscription-Key': this.subscriptionKey('collection'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    return {
      provider: 'mtn',
      providerReference: referenceId,
      message: 'MTN MoMo request to pay sent',
      response: {}
    };
  }

  async requestToPayStatus(referenceId) {
    const token = await this.accessToken('collection');
    return fetchJson(`${this.baseUrl()}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`, {
      fetchImpl: this.fetchImpl,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': this.targetEnvironment(),
        'Ocp-Apim-Subscription-Key': this.subscriptionKey('collection')
      }
    });
  }
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

class MobileMoneyPaymentService {
  constructor(options = {}) {
    this.mpesa = options.mpesa || new MpesaService(options);
    this.mtn = options.mtn || new MTNMoMoService(options);
  }

  async initiateBookingPayment(bookingId, payerId, options = {}) {
    const method = normalizeMobileMoneyMethod(options.method || options.provider);
    const phone = options.phone || options.destination;
    const requestPayload = {
      bookingId,
      payerId,
      amount: options.amount,
      method,
      phone
    };

    return runWithIdempotency(
      options.idempotencyKey,
      requestPayload,
      () => this.createBookingPayment(bookingId, payerId, { ...options, method, phone }),
      { scope: `booking.payment.${method}` }
    );
  }

  async createBookingPayment(bookingId, payerId, options = {}) {
    const method = normalizeMobileMoneyMethod(options.method);
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
      });
      return { booking, transaction: existing, alreadyFunded: true };
    }

    if (booking.paymentStatus === 'pending') {
      throw appError('Booking payment is already pending', 409);
    }

    if (!['unpaid', 'failed', undefined, null].includes(booking.paymentStatus)) {
      throw appError('Booking payment cannot be funded from its current state', 409);
    }

    const amount = parsePositiveAmount(bookingEscrowAmount(booking, options.amount));
    const currency =
      method === 'mpesa'
        ? String(envValue('MPESA_CURRENCY') || 'KES').toUpperCase()
        : String(envValue('MTN_MOMO_CURRENCY', 'MOMO_CURRENCY') || 'EUR').toUpperCase();
    const pendingReference = `${method}:pending:${booking._id}:${Date.now()}`;
    const reserved = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        $or: [{ paymentStatus: { $in: ['unpaid', 'failed'] } }, { paymentStatus: { $exists: false } }]
      },
      {
        $set: {
          paymentStatus: 'pending',
          paymentMethod: method,
          paymentAmount: amount,
          paymentReference: pendingReference
        }
      },
      { new: true }
    );

    if (!reserved) {
      throw appError('Booking payment is already being funded', 409);
    }

    const transaction = await Transaction.create({
      user: payerId,
      booking: reserved._id,
      type: 'payment',
      method,
      amount,
      currency,
      reference: pendingReference,
      provider: method,
      description: `${method === 'mpesa' ? 'M-Pesa' : 'MTN MoMo'} escrow payment for booking ${reserved._id}`,
      status: 'pending',
      metadata: {
        channel: 'mobile_money',
        phone: maskPhone(options.phone),
        initiatedAt: new Date().toISOString(),
        owner: reserved.owner
      }
    });

    try {
      const providerResult =
        method === 'mpesa'
          ? await this.mpesa.initiateStkPush({
              amount,
              phone: options.phone,
              accountReference: `ITR-${String(reserved._id).slice(-8).toUpperCase()}`,
              description: `iTruck booking ${String(reserved._id).slice(-8)}`,
              callbackUrl: options.callbackUrl
            })
          : await this.mtn.requestToPay({
              amount,
              phone: options.phone,
              externalId: reserved._id,
              payerMessage: `iTruck booking ${String(reserved._id).slice(-8)}`,
              payeeNote: 'iTruck escrow payment',
              callbackUrl: options.callbackUrl
            });

      const finalReference = mobileMoneyReference(method, providerResult.providerReference);
      const metadata = {
        ...metadataObject(transaction.metadata),
        providerReference: providerResult.providerReference,
        merchantRequestId: providerResult.merchantRequestId,
        providerResponse: providerResult.response
      };
      const updatedTransaction =
        (await Transaction.findOneAndUpdate(
          { _id: transaction._id },
          {
            $set: {
              reference: finalReference,
              providerEventId: providerResult.providerReference,
              metadata
            }
          },
          { new: true }
        )) || {
          ...transaction,
          reference: finalReference,
          providerEventId: providerResult.providerReference,
          metadata
        };

      const updatedBooking =
        (await Booking.findOneAndUpdate(
          { _id: reserved._id, paymentStatus: 'pending', paymentReference: pendingReference },
          { $set: { paymentReference: finalReference, paymentAmount: amount, paymentMethod: method } },
          { new: true }
        )) || reserved;

      return {
        success: true,
        provider: method,
        providerReference: providerResult.providerReference,
        message: providerResult.message,
        booking: updatedBooking,
        transaction: updatedTransaction,
        alreadyFunded: false
      };
    } catch (err) {
      const metadata = {
        ...metadataObject(transaction.metadata),
        failureMessage: err.message,
        failedAt: new Date().toISOString()
      };
      await Transaction.findOneAndUpdate(
        { _id: transaction._id },
        { $set: { status: 'failed', metadata } },
        { new: true }
      );
      await Booking.updateOne(
        { _id: reserved._id, paymentStatus: 'pending', paymentReference: pendingReference },
        { $set: { paymentStatus: 'failed' }, $unset: { paymentReference: 1 } }
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

  async reconcileMpesaCallback(payload = {}) {
    const callback = payload?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID) {
      throw appError('Invalid M-Pesa callback payload', 400);
    }

    const checkoutRequestId = callback.CheckoutRequestID;
    const transaction = await Transaction.findOne({
      provider: 'mpesa',
      providerEventId: checkoutRequestId
    });

    if (!transaction) {
      logger.warn({ checkoutRequestId }, 'M-Pesa callback did not match a transaction');
      return { received: true, matched: false };
    }

    const successful = Number(callback.ResultCode) === 0;
    const callbackItems = mpesaCallbackMetadata(callback.CallbackMetadata);
    const receipt = callbackItems.MpesaReceiptNumber || callbackItems.ReceiptNumber;
    const amount = firstPositiveAmount([callbackItems.Amount, transaction.amount]);
    const metadata = {
      ...metadataObject(transaction.metadata),
      mpesaReceipt: receipt,
      callbackResultCode: callback.ResultCode,
      callbackResultDesc: callback.ResultDesc,
      callbackMetadata: callbackItems,
      reconciledAt: new Date().toISOString()
    };
    const reference = successful && receipt ? mobileMoneyReference('mpesa', receipt) : transaction.reference;

    const updated = await saveTransaction(transaction, {
      status: successful ? 'completed' : 'failed',
      reference,
      metadata
    });
    const booking = await updateBookingFromTransaction(updated || transaction, successful ? 'completed' : 'failed', {
      amount
    });

    return {
      received: true,
      matched: true,
      status: successful ? 'completed' : 'failed',
      booking
    };
  }

  async reconcileMTNMoMoCallback(referenceId, payload = {}) {
    const providerReference = referenceId || payload.referenceId || payload.externalId;
    if (!providerReference) {
      throw appError('MTN MoMo reference id is required', 400);
    }

    const transaction = await Transaction.findOne({
      provider: 'mtn',
      providerEventId: providerReference
    });

    if (!transaction) {
      logger.warn({ providerReference }, 'MTN MoMo callback did not match a transaction');
      return { received: true, matched: false };
    }

    const providerPayload =
      payload.status || payload.financialTransactionId ? payload : await new MTNMoMoService().requestToPayStatus(providerReference);
    const status = String(providerPayload.status || 'PENDING').toUpperCase();
    if (status === 'PENDING') {
      const metadata = {
        ...metadataObject(transaction.metadata),
        providerStatus: status,
        callbackPayload: providerPayload,
        reconciledAt: new Date().toISOString()
      };
      await saveTransaction(transaction, { metadata });
      return { received: true, matched: true, status: 'pending' };
    }

    const successful = status === 'SUCCESSFUL';
    const amount = firstPositiveAmount([providerPayload.amount, transaction.amount]);
    const metadata = {
      ...metadataObject(transaction.metadata),
      providerStatus: status,
      financialTransactionId: providerPayload.financialTransactionId,
      reason: providerPayload.reason,
      callbackPayload: providerPayload,
      reconciledAt: new Date().toISOString()
    };
    const reference =
      successful && providerPayload.financialTransactionId
        ? mobileMoneyReference('mtn', providerPayload.financialTransactionId)
        : transaction.reference;

    const updated = await saveTransaction(transaction, {
      status: successful ? 'completed' : 'failed',
      reference,
      metadata
    });
    const booking = await updateBookingFromTransaction(updated || transaction, successful ? 'completed' : 'failed', {
      amount
    });

    return {
      received: true,
      matched: true,
      status: successful ? 'completed' : 'failed',
      booking
    };
  }
}

module.exports = {
  payments: new PaymentReconciliationService(),
  mobileMoney: new MobileMoneyPaymentService(),
  wallet: new WalletService(),
  checkIdempotency,
  generateIdempotencyKey,
  markIdempotencyComplete,
  markIdempotencyFailed,
  normalizeIdempotencyKey,
  runWithIdempotency,
  StripeService: class {},
  MpesaService,
  MTNMoMoService,
  MobileMoneyPaymentService,
  PaymentReconciliationService,
  WalletService
};
