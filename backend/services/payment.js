const crypto = require('crypto');
const mongoose = require('mongoose');
const Stripe = require('stripe');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const Idempotency = require('../models/Idempotency');
const ProviderOperation = require('../models/ProviderOperation');
const logger = require('../config/logger');
const { assertDeliveryProofForPaymentRelease } = require('./operationsPolicy');
const { assertDeliveryProofIntegrity } = require('./deliveryProof');
const { createOne, runInTransaction, sessionOptions } = require('./transactions');
const { termsForBooking } = require('./commercialTerms');

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

function providerCallbackSecret(provider) {
  if (provider === 'mpesa') {
    return envValue('MPESA_WEBHOOK_SECRET', 'MPESA_CALLBACK_SECRET', 'MPESA_CALLBACK_TOKEN');
  }
  return envValue(
    'MTN_MOMO_WEBHOOK_SECRET',
    'MOMO_WEBHOOK_SECRET',
    'MTN_MOMO_CALLBACK_SECRET',
    'MTN_MOMO_CALLBACK_TOKEN'
  );
}

function authenticateProviderCallback(url, provider) {
  const secret = providerCallbackSecret(provider);
  if (!secret) return url;

  const callback = new URL(url);
  if (!callback.searchParams.has('token') && !callback.searchParams.has('secret')) {
    callback.searchParams.set('token', secret);
  }
  return callback.toString();
}

function providerCallbackUrl(provider, referenceId) {
  const configured =
    provider === 'mpesa' ? envValue('MPESA_CALLBACK_URL') : envValue('MTN_MOMO_CALLBACK_URL', 'MOMO_CALLBACK_URL');
  let callback =
    configured ||
    (provider === 'mpesa'
      ? `${publicBaseUrl()}/api/payments/webhooks/mpesa/stk`
      : `${publicBaseUrl()}/api/payments/webhooks/mtn/request-to-pay`);

  if (provider === 'mtn' && referenceId) {
    if (callback.includes(':referenceId')) {
      callback = callback.replace(':referenceId', encodeURIComponent(referenceId));
    } else {
      const parsed = new URL(callback);
      if (!parsed.pathname.endsWith(`/${referenceId}`)) {
        parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/${encodeURIComponent(referenceId)}`;
      }
      callback = parsed.toString();
    }
  }

  return authenticateProviderCallback(callback, provider);
}

function mpesaTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14);
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
  const value = String(method || '')
    .trim()
    .toLowerCase();
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

function stripeSmallestUnit(value, currency = 'kes') {
  const amount = parsePositiveAmount(value);
  return stripeAmount(1, currency) === 1 ? Math.round(amount) : Math.round(amount * 100);
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
  const contractedTotal = Number(booking?.paymentBreakdown?.shipperTotal || booking?.paymentAmount || 0);
  if (Number.isFinite(contractedTotal) && contractedTotal > 0) return contractedTotal;
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
      CallBackURL: authenticateProviderCallback(callbackUrl || providerCallbackUrl('mpesa'), 'mpesa'),
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

  async initiateB2CPayout({ amount, phone, remarks, occasion }) {
    const token = await this.accessToken();
    const payload = {
      InitiatorName: requireEnv('M-Pesa B2C initiator name', 'MPESA_B2C_INITIATOR_NAME'),
      SecurityCredential: requireEnv('M-Pesa B2C security credential', 'MPESA_B2C_SECURITY_CREDENTIAL'),
      CommandID: process.env.MPESA_B2C_COMMAND_ID || 'BusinessPayment',
      Amount: providerAmount(amount),
      PartyA: requireEnv('M-Pesa B2C shortcode', 'MPESA_B2C_SHORTCODE', 'MPESA_SHORTCODE'),
      PartyB: normalizeMpesaPhone(phone),
      Remarks: String(remarks || 'iTruck carrier payout').slice(0, 100),
      QueueTimeOutURL: authenticateProviderCallback(
        requireEnv('M-Pesa B2C timeout URL', 'MPESA_B2C_TIMEOUT_URL'),
        'mpesa'
      ),
      ResultURL: authenticateProviderCallback(requireEnv('M-Pesa B2C result URL', 'MPESA_B2C_RESULT_URL'), 'mpesa'),
      Occasion: String(occasion || 'iTruck payout').slice(0, 100)
    };
    const endpoint = process.env.MPESA_B2C_ENDPOINT || '/mpesa/b2c/v3/paymentrequest';
    const data = await fetchJson(`${this.baseUrl()}${endpoint}`, {
      fetchImpl: this.fetchImpl,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const providerReference = data.OriginatorConversationID || data.ConversationID;
    if (!providerReference) throw appError('M-Pesa B2C response did not include a conversation reference', 502);
    return { provider: 'mpesa', providerReference, response: data, status: 'pending' };
  }

  async reverseTransaction({ transactionId, amount, remarks }) {
    const token = await this.accessToken();
    const payload = {
      Initiator: requireEnv(
        'M-Pesa reversal initiator name',
        'MPESA_REVERSAL_INITIATOR_NAME',
        'MPESA_B2C_INITIATOR_NAME'
      ),
      SecurityCredential: requireEnv(
        'M-Pesa reversal security credential',
        'MPESA_REVERSAL_SECURITY_CREDENTIAL',
        'MPESA_B2C_SECURITY_CREDENTIAL'
      ),
      CommandID: 'TransactionReversal',
      TransactionID: String(transactionId),
      Amount: providerAmount(amount),
      ReceiverParty: requireEnv('M-Pesa shortcode', 'MPESA_SHORTCODE'),
      RecieverIdentifierType: process.env.MPESA_REVERSAL_RECEIVER_TYPE || '11',
      ResultURL: authenticateProviderCallback(
        requireEnv('M-Pesa reversal result URL', 'MPESA_REVERSAL_RESULT_URL'),
        'mpesa'
      ),
      QueueTimeOutURL: authenticateProviderCallback(
        requireEnv('M-Pesa reversal timeout URL', 'MPESA_REVERSAL_TIMEOUT_URL'),
        'mpesa'
      ),
      Remarks: String(remarks || 'iTruck payment refund').slice(0, 100),
      Occasion: 'iTruck refund'
    };
    const data = await fetchJson(`${this.baseUrl()}/mpesa/reversal/v1/request`, {
      fetchImpl: this.fetchImpl,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const providerReference = data.OriginatorConversationID || data.ConversationID;
    if (!providerReference) throw appError('M-Pesa reversal response did not include a conversation reference', 502);
    return { provider: 'mpesa', providerReference, response: data, status: 'pending' };
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
    return providerCallbackUrl('mtn', referenceId);
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
        'X-Callback-Url': authenticateProviderCallback(callbackUrl || this.callbackUrl(referenceId), 'mtn'),
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

  async transfer({ amount, phone, externalId, payerMessage, payeeNote, callbackUrl }) {
    const referenceId = crypto.randomUUID();
    const token = await this.accessToken('disbursement');
    const payload = {
      amount: String(providerAmount(amount)),
      currency: this.currency(),
      externalId: String(externalId),
      payee: { partyIdType: 'MSISDN', partyId: normalizeInternationalPhone(phone) },
      payerMessage: String(payerMessage || 'iTruck carrier payout').slice(0, 160),
      payeeNote: String(payeeNote || 'iTruck payout').slice(0, 160)
    };
    const configuredCallback =
      callbackUrl ||
      process.env.MTN_MOMO_DISBURSEMENT_CALLBACK_URL ||
      `${publicBaseUrl()}/api/payments/webhooks/mtn/disbursement/${referenceId}`;
    await fetchJson(`${this.baseUrl()}/disbursement/v1_0/transfer`, {
      fetchImpl: this.fetchImpl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': this.targetEnvironment(),
        'X-Callback-Url': authenticateProviderCallback(configuredCallback, 'mtn'),
        'Ocp-Apim-Subscription-Key': this.subscriptionKey('disbursement'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return { provider: 'mtn', providerReference: referenceId, response: {}, status: 'pending' };
  }

  async transferStatus(referenceId) {
    const token = await this.accessToken('disbursement');
    return fetchJson(`${this.baseUrl()}/disbursement/v1_0/transfer/${encodeURIComponent(referenceId)}`, {
      fetchImpl: this.fetchImpl,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': this.targetEnvironment(),
        'Ocp-Apim-Subscription-Key': this.subscriptionKey('disbursement')
      }
    });
  }

  async refund({ amount, originalReference, externalId, payerMessage, payeeNote, callbackUrl }) {
    const referenceId = crypto.randomUUID();
    const token = await this.accessToken('collection');
    const payload = {
      amount: String(providerAmount(amount)),
      currency: this.currency(),
      externalId: String(externalId),
      payerMessage: String(payerMessage || 'iTruck payment refund').slice(0, 160),
      payeeNote: String(payeeNote || 'iTruck refund').slice(0, 160),
      referenceIdToRefund: String(originalReference)
    };
    await fetchJson(`${this.baseUrl()}/collection/v1_0/refund`, {
      fetchImpl: this.fetchImpl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': this.targetEnvironment(),
        'X-Callback-Url': authenticateProviderCallback(
          callbackUrl || `${publicBaseUrl()}/api/payments/webhooks/mtn/refund/${referenceId}`,
          'mtn'
        ),
        'Ocp-Apim-Subscription-Key': this.subscriptionKey('collection'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return { provider: 'mtn', providerReference: referenceId, response: {}, status: 'pending' };
  }
}

class StripeService {
  constructor(options = {}) {
    this.client = options.client || new Stripe(requireEnv('Stripe secret key', 'STRIPE_SECRET_KEY'));
  }

  async createCheckoutSession({ amount, currency, bookingId, userId, transactionId, idempotencyKey }) {
    const frontendUrl = trimTrailingSlash(requireEnv('Frontend URL', 'FRONTEND_URL'));
    const shipmentUrl = `${frontendUrl}/app/shipments/${encodeURIComponent(bookingId)}`;
    const metadata = {
      bookingId: String(bookingId),
      userId: String(userId),
      transactionId: String(transactionId)
    };
    return this.client.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: String(bookingId),
        success_url: `${shipmentUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${shipmentUrl}?payment=cancelled`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: String(currency || 'KES').toLowerCase(),
              unit_amount: stripeSmallestUnit(amount, currency),
              product_data: { name: `iTruck shipment ${bookingId}` }
            }
          }
        ],
        metadata,
        payment_intent_data: { metadata }
      },
      { idempotencyKey }
    );
  }

  async refund({ paymentIntent, charge, amount, currency, reason, idempotencyKey, metadata }) {
    const zeroDecimal = stripeAmount(1, currency) === 1;
    const smallestUnit = zeroDecimal ? Math.round(amount) : Math.round(amount * 100);
    const payload = {
      ...(paymentIntent ? { payment_intent: paymentIntent } : { charge }),
      amount: smallestUnit,
      metadata
    };
    if (['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)) payload.reason = reason;
    const response = await this.client.refunds.create(payload, { idempotencyKey });
    return {
      provider: 'stripe',
      providerReference: response.id,
      response,
      status: response.status === 'succeeded' ? 'completed' : response.status || 'pending'
    };
  }

  async transfer({ amount, currency, destination, idempotencyKey, metadata }) {
    const zeroDecimal = stripeAmount(1, currency) === 1;
    const smallestUnit = zeroDecimal ? Math.round(amount) : Math.round(amount * 100);
    const response = await this.client.transfers.create(
      {
        amount: smallestUnit,
        currency: String(currency || 'usd').toLowerCase(),
        destination,
        metadata
      },
      { idempotencyKey }
    );
    return {
      provider: 'stripe',
      providerReference: response.id,
      response,
      status: 'completed'
    };
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

  async ensureWallet(userId, session = null) {
    const startingBalance = await this.legacyStartingBalance(userId);
    return Wallet.findOneAndUpdate(
      { user: userId },
      {
        $setOnInsert: {
          user: userId,
          balance: startingBalance,
          currency: process.env.DEFAULT_CURRENCY || 'KES'
        }
      },
      sessionOptions(session, { new: true, upsert: true, setDefaultsOnInsert: true })
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
    return runInTransaction(async (session) => {
      const wallet = await Wallet.findOneAndUpdate(
        { user: userId },
        {
          $inc: { balance: amountNum, version: 1 },
          $setOnInsert: { user: userId, currency: process.env.DEFAULT_CURRENCY || 'KES' }
        },
        sessionOptions(session, { new: true, upsert: true, setDefaultsOnInsert: true })
      );
      const transaction = await createOne(
        Transaction,
        {
          user: userId,
          type: 'credit',
          amount: amountNum,
          description,
          reference,
          status: 'completed',
          metadata: { walletBalance: wallet.balance }
        },
        session
      );
      if (session) {
        await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id }, { session });
      } else {
        await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });
      }
      return transaction;
    });
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
    return runInTransaction(async (session) => {
      await this.ensureWallet(userId, session);
      const wallet = await Wallet.findOneAndUpdate(
        { user: userId, balance: { $gte: amountNum } },
        { $inc: { balance: -amountNum, version: 1 } },
        sessionOptions(session, { new: true })
      );
      if (!wallet) throw appError('Insufficient wallet balance', 400);
      const transaction = await createOne(
        Transaction,
        {
          user: userId,
          type: 'debit',
          amount: amountNum,
          description,
          reference,
          status: 'completed',
          metadata: { walletBalance: wallet.balance }
        },
        session
      );
      if (session) {
        await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id }, { session });
      } else {
        await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });
      }
      return transaction;
    });
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
    return runInTransaction(async (session) => {
      await this.ensureWallet(userId, session);
      const wallet = await Wallet.findOneAndUpdate(
        { user: userId, balance: { $gte: amountNum } },
        { $inc: { balance: -amountNum, version: 1 } },
        sessionOptions(session, { new: true })
      );
      if (!wallet) throw appError('Insufficient wallet balance', 400);
      const transaction = await createOne(
        Transaction,
        {
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
        },
        session
      );
      if (session) {
        await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id }, { session });
      } else {
        await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });
      }
      return transaction;
    });
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

    assertDeliveryProofForPaymentRelease(booking);
    await assertDeliveryProofIntegrity(booking);

    if (!booking.owner) {
      throw appError('Booking has no assigned owner', 409);
    }

    const payment = await Transaction.findOne({
      booking: booking._id,
      type: 'payment',
      status: 'completed'
    }).sort('-createdAt');
    const terms = termsForBooking(booking);
    const fundedAmount = Number(payment?.amount || booking.paymentAmount);
    const carrierPayout = Number(terms.carrierPayout);
    const platformFee = Number(terms.platformFee || 0);
    if (!Number.isFinite(fundedAmount) || fundedAmount <= 0 || !Number.isFinite(carrierPayout) || carrierPayout <= 0) {
      throw appError('No completed payment is available to release', 409);
    }
    if (fundedAmount < Number(terms.shipperTotal)) throw appError('Escrow does not cover the contracted total', 409);

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
        carrierPayout,
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

      const revenueTransaction =
        platformFee > 0
          ? await Transaction.create({
              booking: reserved._id,
              type: 'platform_fee',
              method: payment?.method || 'wallet',
              amount: platformFee,
              currency: terms.currency || payment?.currency || process.env.DEFAULT_CURRENCY || 'KES',
              description: `iTruck platform fee for booking ${reserved._id}`,
              reference: `platform-fee:${reserved._id}`,
              status: 'completed',
              metadata: {
                rate: terms.platformFeeRate,
                fundedAmount,
                carrierPayout,
                paymentTransaction: payment?._id,
                recognizedAt: new Date().toISOString()
              }
            })
          : null;

      reserved.paymentStatus = 'released';
      reserved.releasedAt = new Date();
      await reserved.save();
      return { booking: reserved, transaction, revenueTransaction, alreadyReleased: false };
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
    if (method === 'mtn' && String(process.env.ENABLE_MTN_MOMO || '').toLowerCase() !== 'true') {
      throw appError('MTN MoMo is not currently available', 503);
    }
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
      const updatedTransaction = (await Transaction.findOneAndUpdate(
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

class CardPaymentService {
  constructor(options = {}) {
    this.stripe = options.stripe;
    this.options = options;
  }

  stripeService() {
    if (!this.stripe) this.stripe = new StripeService(this.options);
    return this.stripe;
  }

  async initiateBookingPayment(bookingId, payerId, options = {}) {
    return runWithIdempotency(
      options.idempotencyKey,
      { bookingId, payerId, amount: options.amount, method: 'stripe' },
      () => this.createBookingPayment(bookingId, payerId, options),
      { scope: 'booking.payment.stripe' }
    );
  }

  async createBookingPayment(bookingId, payerId, options = {}) {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw appError('Booking not found', 404);
    if (!sameId(booking.client, payerId)) throw appError('Only the booking shipper can fund escrow', 403);
    if (!booking.owner) throw appError('Accept a carrier bid before funding escrow', 409);
    if (!['confirmed', 'in_transit', 'delivered'].includes(booking.status)) {
      throw appError('Booking must be confirmed before funding escrow', 409);
    }
    if (['escrowed', 'release_pending', 'released'].includes(booking.paymentStatus)) {
      const transaction = await Transaction.findOne({ booking: booking._id, type: 'payment', status: 'completed' });
      return { booking, transaction, alreadyFunded: true };
    }
    if (booking.paymentStatus === 'pending' && booking.paymentMethod === 'stripe') {
      const transaction = await Transaction.findOne({
        booking: booking._id,
        type: 'payment',
        method: 'stripe',
        status: 'pending'
      }).sort('-createdAt');
      const checkoutUrl = metadataObject(transaction?.metadata).checkoutUrl;
      if (transaction && checkoutUrl) {
        return {
          success: true,
          provider: 'stripe',
          checkoutUrl,
          providerReference: metadataObject(transaction.metadata).checkoutSessionId,
          booking,
          transaction,
          alreadyFunded: false,
          alreadyPending: true
        };
      }
    }
    if (booking.paymentStatus === 'pending') throw appError('Booking payment is already pending', 409);
    if (!['unpaid', 'failed', undefined, null].includes(booking.paymentStatus)) {
      throw appError('Booking payment cannot be funded from its current state', 409);
    }

    const terms = termsForBooking(booking);
    const amount = parsePositiveAmount(bookingEscrowAmount(booking, options.amount));
    const currency = String(terms.currency || process.env.DEFAULT_CURRENCY || 'KES').toUpperCase();
    const pendingReference = `stripe:pending:${booking._id}:${Date.now()}`;
    const reserved = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        $or: [{ paymentStatus: { $in: ['unpaid', 'failed'] } }, { paymentStatus: { $exists: false } }]
      },
      {
        $set: {
          paymentStatus: 'pending',
          paymentMethod: 'stripe',
          paymentAmount: amount,
          paymentReference: pendingReference
        }
      },
      { new: true }
    );
    if (!reserved) throw appError('Booking payment is already being funded', 409);

    const transaction = await Transaction.create({
      user: payerId,
      booking: reserved._id,
      type: 'payment',
      method: 'stripe',
      amount,
      currency,
      reference: pendingReference,
      provider: 'stripe',
      description: `Bank card escrow payment for booking ${reserved._id}`,
      status: 'pending',
      metadata: { channel: 'hosted_card', initiatedAt: new Date().toISOString(), owner: reserved.owner }
    });

    try {
      const session = await this.stripeService().createCheckoutSession({
        amount,
        currency,
        bookingId: reserved._id,
        userId: payerId,
        transactionId: transaction._id,
        idempotencyKey: options.idempotencyKey || `checkout-${transaction._id}`
      });
      const reference = `stripe:${session.id}`;
      const metadata = {
        ...metadataObject(transaction.metadata),
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
        paymentIntent: session.payment_intent,
        initiatedAt: new Date().toISOString()
      };
      const updatedTransaction = await Transaction.findOneAndUpdate(
        { _id: transaction._id },
        { $set: { reference, providerEventId: session.id, metadata } },
        { new: true }
      );
      const updatedBooking = await Booking.findOneAndUpdate(
        { _id: reserved._id, paymentStatus: 'pending', paymentReference: pendingReference },
        { $set: { paymentReference: reference, paymentMethod: 'stripe', paymentAmount: amount } },
        { new: true }
      );
      return {
        success: true,
        provider: 'stripe',
        checkoutUrl: session.url,
        providerReference: session.id,
        booking: updatedBooking || reserved,
        transaction: updatedTransaction || transaction,
        alreadyFunded: false
      };
    } catch (err) {
      await Transaction.findOneAndUpdate(
        { _id: transaction._id },
        {
          $set: { status: 'failed', metadata: { ...metadataObject(transaction.metadata), failureMessage: err.message } }
        }
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
    const transactionId = metadata.transactionId;
    const currency = String(object.currency || 'usd').toUpperCase();
    const rawAmount = object.amount_received || object.amount_total || object.amount || 0;
    const amount = stripeAmount(rawAmount, currency);
    const status = stripePaymentStatus(event.type);
    const reference = object.payment_intent || object.id || event.id;
    const bookingPayment = bookingPaymentStatus(status);

    const transaction = await Transaction.findOneAndUpdate(
      validObjectId(transactionId) ? { _id: transactionId } : { provider: 'stripe', providerEventId: event.id },
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
          reference,
          providerEventId: event.id,
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

    if (transaction.status && transaction.status !== 'pending') {
      const booking = await updateBookingFromTransaction(transaction, transaction.status);
      return {
        received: true,
        matched: true,
        duplicate: true,
        status: transaction.status,
        booking
      };
    }

    const successful = Number(callback.ResultCode) === 0;
    const callbackItems = mpesaCallbackMetadata(callback.CallbackMetadata);
    const receipt = callbackItems.MpesaReceiptNumber || callbackItems.ReceiptNumber;
    const callbackAmount = Number(callbackItems.Amount);
    const amount = successful ? callbackAmount : Number(transaction.amount);
    const transactionMetadata = metadataObject(transaction.metadata);

    if (
      transactionMetadata.merchantRequestId &&
      callback.MerchantRequestID &&
      transactionMetadata.merchantRequestId !== callback.MerchantRequestID
    ) {
      throw appError('M-Pesa callback merchant reference does not match the payment request', 409);
    }

    if (successful && (!receipt || !Number.isFinite(callbackAmount) || callbackAmount <= 0)) {
      throw appError('M-Pesa success callback is missing receipt or amount metadata', 400);
    }

    if (
      successful &&
      Number.isFinite(Number(transaction.amount)) &&
      Math.abs(callbackAmount - Number(transaction.amount)) > 0.01
    ) {
      logger.error(
        { checkoutRequestId, callbackAmount, expectedAmount: transaction.amount },
        'M-Pesa callback amount did not match the pending transaction'
      );
      throw appError('M-Pesa callback amount does not match the pending transaction', 409);
    }

    const metadata = {
      ...transactionMetadata,
      mpesaReceipt: receipt,
      callbackResultCode: callback.ResultCode,
      callbackResultDesc: callback.ResultDesc,
      callbackMetadata: callbackItems,
      reconciledAt: new Date().toISOString()
    };
    const reference = successful && receipt ? mobileMoneyReference('mpesa', receipt) : transaction.reference;
    const status = successful ? 'completed' : 'failed';
    const updated = await Transaction.findOneAndUpdate(
      { _id: transaction._id, status: 'pending' },
      { $set: { status, reference, metadata } },
      { new: true }
    );

    if (!updated) {
      const current = await Transaction.findOne({ _id: transaction._id });
      const resolved = current || transaction;
      const booking = await updateBookingFromTransaction(resolved, resolved.status || status, { amount });
      return {
        received: true,
        matched: true,
        duplicate: true,
        status: resolved.status || status,
        booking
      };
    }

    const booking = await updateBookingFromTransaction(updated, status, { amount });

    return {
      received: true,
      matched: true,
      duplicate: false,
      status,
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
      payload.status || payload.financialTransactionId
        ? payload
        : await new MTNMoMoService().requestToPayStatus(providerReference);
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

class ProviderOperationsService {
  constructor(options = {}) {
    this.stripe = options.stripe;
    this.mpesa = options.mpesa || new MpesaService(options);
    this.mtn = options.mtn || new MTNMoMoService(options);
  }

  stripeService() {
    if (!this.stripe) this.stripe = new StripeService();
    return this.stripe;
  }

  async reserveOperation(payload) {
    try {
      return { operation: await ProviderOperation.create(payload), created: true };
    } catch (err) {
      if (err.code !== 11000) throw err;
      const existing = await ProviderOperation.findOne({ idempotencyKey: payload.idempotencyKey });
      if (
        existing &&
        String(existing.sourceTransaction) === String(payload.sourceTransaction) &&
        existing.type === payload.type
      ) {
        return { operation: existing, created: false };
      }
      throw appError('Idempotency key was already used for another provider operation', 409);
    }
  }

  async executeRefund(transactionId, options = {}) {
    const key = normalizeIdempotencyKey(options.idempotencyKey);
    if (!key) throw appError('Idempotency-Key is required', 400);
    const source = await Transaction.findById(transactionId);
    if (!source) throw appError('Payment transaction not found', 404);
    if (source.type !== 'payment' || !['completed', 'refunded'].includes(source.status)) {
      throw appError('Only a completed payment can be refunded', 409);
    }
    const provider = String(source.provider || source.method || '').toLowerCase();
    if (!['stripe', 'mpesa', 'mtn'].includes(provider)) {
      throw appError(`Refunds are not supported for ${provider || 'this payment method'}`, 400);
    }
    const amount = parsePositiveAmount(options.amount || source.amount);
    const committed = await ProviderOperation.aggregate([
      {
        $match: {
          sourceTransaction: source._id,
          type: 'refund',
          status: { $in: ['processing', 'pending', 'completed'] }
        }
      },
      { $group: { _id: null, amount: { $sum: '$amount' } } }
    ]);
    if (amount + Number(committed[0]?.amount || 0) > Number(source.amount) + 0.001) {
      throw appError('Refund amount exceeds the remaining refundable amount', 409);
    }

    const reservation = await this.reserveOperation({
      type: 'refund',
      provider,
      sourceTransaction: source._id,
      user: source.user,
      booking: source.booking,
      amount,
      currency: source.currency,
      status: 'processing',
      idempotencyKey: key,
      reason: options.reason,
      requestedBy: options.requestedBy
    });
    const operation = reservation.operation;
    if (!reservation.created) return operation;
    if (source.booking) await Booking.updateOne({ _id: source.booking }, { $set: { paymentStatus: 'refund_pending' } });

    try {
      const metadata = { operationId: String(operation._id), sourceTransaction: String(source._id) };
      let result;
      if (provider === 'stripe') {
        const reference = String(source.reference || '');
        const sourceMetadata = metadataObject(source.metadata);
        const paymentIntent =
          sourceMetadata.paymentIntent ||
          sourceMetadata.stripePaymentIntent ||
          (reference.startsWith('pi_') ? reference : undefined);
        const charge = sourceMetadata.charge || (reference.startsWith('ch_') ? reference : undefined);
        if (!paymentIntent && !charge) {
          throw appError('Stripe payment intent or charge reference is missing from the source payment', 409);
        }
        result = await this.stripeService().refund({
          paymentIntent,
          charge,
          amount,
          currency: source.currency,
          reason: options.reason,
          idempotencyKey: key,
          metadata
        });
      } else if (provider === 'mpesa') {
        const receipt = metadataObject(source.metadata).mpesaReceipt;
        if (!receipt) throw appError('M-Pesa receipt is missing from the source payment', 409);
        result = await this.mpesa.reverseTransaction({
          transactionId: receipt,
          amount,
          remarks: options.reason
        });
      } else {
        result = await this.mtn.refund({
          amount,
          originalReference: source.providerEventId,
          externalId: `refund-${operation._id}`,
          payerMessage: options.reason,
          payeeNote: `iTruck refund ${source._id}`
        });
      }

      operation.providerReference = result.providerReference;
      operation.providerResponse = result.response;
      operation.providerStatus = result.status;
      operation.status = result.status === 'completed' ? 'completed' : 'pending';
      if (operation.status === 'completed') operation.completedAt = new Date();
      await operation.save();
      if (operation.status === 'completed') await this.completeRefund(operation, source);
      return operation;
    } catch (err) {
      operation.status = 'failed';
      operation.failedAt = new Date();
      operation.lastError = err.message;
      await operation.save();
      if (source.booking) await Booking.updateOne({ _id: source.booking }, { $set: { paymentStatus: 'escrowed' } });
      throw err;
    }
  }

  async executePayout(transactionId, options = {}) {
    const key = normalizeIdempotencyKey(options.idempotencyKey);
    if (!key) throw appError('Idempotency-Key is required', 400);
    const source = await Transaction.findById(transactionId);
    if (!source) throw appError('Withdrawal transaction not found', 404);
    if (source.type !== 'withdrawal' || source.status !== 'pending') {
      throw appError('Only a pending withdrawal can be executed', 409);
    }
    const provider = String(source.method || '').toLowerCase();
    if (!['stripe', 'mpesa', 'mtn'].includes(provider)) {
      throw appError(`Payouts are not supported for ${provider || 'this withdrawal method'}`, 400);
    }
    const details = metadataObject(source.metadata).payoutDetails || {};
    const destination = details.destination;
    if (!destination) throw appError('Withdrawal destination is missing', 409);

    const reservation = await this.reserveOperation({
      type: 'payout',
      provider,
      sourceTransaction: source._id,
      user: source.user,
      amount: source.amount,
      currency: source.currency,
      status: 'processing',
      idempotencyKey: key,
      destination,
      requestedBy: options.requestedBy
    });
    const operation = reservation.operation;
    if (!reservation.created) return operation;

    try {
      const metadata = { operationId: String(operation._id), withdrawal: String(source._id) };
      let result;
      if (provider === 'stripe') {
        if (!String(destination).startsWith('acct_')) {
          throw appError('Stripe payout destination must be a connected account id', 400);
        }
        result = await this.stripeService().transfer({
          amount: source.amount,
          currency: source.currency,
          destination,
          idempotencyKey: key,
          metadata
        });
      } else if (provider === 'mpesa') {
        result = await this.mpesa.initiateB2CPayout({
          amount: source.amount,
          phone: destination,
          remarks: source.description,
          occasion: `Withdrawal ${source._id}`
        });
      } else {
        result = await this.mtn.transfer({
          amount: source.amount,
          phone: destination,
          externalId: String(source._id),
          payerMessage: source.description,
          payeeNote: `iTruck withdrawal ${source._id}`
        });
      }

      operation.providerReference = result.providerReference;
      operation.providerResponse = result.response;
      operation.providerStatus = result.status;
      operation.status = result.status === 'completed' ? 'completed' : 'pending';
      if (operation.status === 'completed') operation.completedAt = new Date();
      await operation.save();
      if (operation.status === 'completed') {
        await Transaction.updateOne(
          { _id: source._id, status: 'pending' },
          { $set: { status: 'completed', provider, providerEventId: result.providerReference } }
        );
      }
      return operation;
    } catch (err) {
      operation.status = 'failed';
      operation.failedAt = new Date();
      operation.lastError = err.message;
      await operation.save();
      await this.failPayout(operation, source, err.message);
      throw err;
    }
  }

  async completeRefund(operation, sourceInput) {
    const source = sourceInput || (await Transaction.findById(operation.sourceTransaction));
    if (!source) return;
    const completed = await ProviderOperation.aggregate([
      {
        $match: {
          sourceTransaction: source._id,
          type: 'refund',
          status: 'completed'
        }
      },
      { $group: { _id: null, amount: { $sum: '$amount' } } }
    ]);
    const fullyRefunded = Number(completed[0]?.amount || 0) >= Number(source.amount) - 0.001;
    if (fullyRefunded) await Transaction.updateOne({ _id: source._id }, { $set: { status: 'refunded' } });
    if (source.booking) {
      await Booking.updateOne(
        { _id: source.booking },
        { $set: { paymentStatus: fullyRefunded ? 'refunded' : 'escrowed' } }
      );
    }
  }

  async failPayout(operation, sourceInput, reason) {
    const source = sourceInput || (await Transaction.findById(operation.sourceTransaction));
    if (!source) return;
    await runInTransaction(async (session) => {
      const failed = await Transaction.findOneAndUpdate(
        { _id: source._id, type: 'withdrawal', status: 'pending' },
        {
          $set: {
            status: 'failed',
            metadata: { ...metadataObject(source.metadata), payoutFailure: reason, failedAt: new Date().toISOString() }
          }
        },
        sessionOptions(session, { new: true })
      );
      if (failed) {
        await Wallet.updateOne(
          { user: source.user },
          { $inc: { balance: Number(source.amount), version: 1 }, $set: { lastTransaction: source._id } },
          sessionOptions(session)
        );
      }
    });
  }

  async reconcileCallback(provider, referenceId, payload = {}) {
    const operation = await ProviderOperation.findOne({
      provider,
      $or: [
        { providerReference: referenceId },
        { providerReference: payload?.Result?.OriginatorConversationID },
        { providerReference: payload?.Result?.ConversationID }
      ].filter((entry) => Object.values(entry)[0])
    });
    if (!operation) return { received: true, matched: false };
    if (['completed', 'failed', 'cancelled'].includes(operation.status)) {
      return { received: true, matched: true, duplicate: true, status: operation.status };
    }

    let providerStatus;
    let successful;
    if (provider === 'mpesa') {
      const result = payload.Result || payload;
      successful = Number(result.ResultCode) === 0;
      providerStatus = successful ? 'SUCCESSFUL' : 'FAILED';
      operation.providerReference =
        operation.providerReference || result.OriginatorConversationID || result.ConversationID;
    } else {
      providerStatus = String(payload.status || 'PENDING').toUpperCase();
      if (providerStatus === 'PENDING') {
        operation.providerStatus = providerStatus;
        operation.callbackPayloads.push(payload);
        await operation.save();
        return { received: true, matched: true, status: 'pending' };
      }
      successful = providerStatus === 'SUCCESSFUL';
    }

    operation.providerStatus = providerStatus;
    operation.callbackPayloads.push(payload);
    operation.status = successful ? 'completed' : 'failed';
    operation.completedAt = successful ? new Date() : undefined;
    operation.failedAt = successful ? undefined : new Date();
    if (!successful) operation.lastError = payload.reason || payload?.Result?.ResultDesc || 'Provider operation failed';
    await operation.save();

    const source = await Transaction.findById(operation.sourceTransaction);
    if (operation.type === 'refund') {
      if (successful) await this.completeRefund(operation, source);
      else if (source?.booking) {
        await Booking.updateOne({ _id: source.booking }, { $set: { paymentStatus: 'escrowed' } });
      }
    } else if (successful) {
      await Transaction.updateOne(
        { _id: operation.sourceTransaction, status: 'pending' },
        {
          $set: {
            status: 'completed',
            provider,
            providerEventId: operation.providerReference
          }
        }
      );
    } else {
      await this.failPayout(operation, source, operation.lastError);
    }
    return { received: true, matched: true, duplicate: false, status: operation.status, operation };
  }

  async reconcileStripeEvent(event) {
    const object = stripeObject(event);
    if (!object?.id) return null;
    const candidates = [{ providerReference: object.id }];
    if (validObjectId(object.metadata?.operationId)) candidates.push({ _id: object.metadata.operationId });
    const operation = await ProviderOperation.findOne({
      provider: 'stripe',
      $or: candidates
    });
    if (!operation) return null;
    operation.providerResponse = object;
    operation.providerStatus = object.status || event.type;
    if (object.status === 'failed' || event.type.endsWith('.failed')) {
      operation.status = 'failed';
      operation.failedAt = new Date();
      operation.lastError = object.failure_message || object.failure_code || event.type;
    } else if (['succeeded', 'paid'].includes(object.status) || event.type.endsWith('.created')) {
      operation.status = 'completed';
      operation.completedAt = new Date();
    }
    await operation.save();
    const source = await Transaction.findById(operation.sourceTransaction);
    if (operation.status === 'completed' && operation.type === 'refund') await this.completeRefund(operation, source);
    if (operation.status === 'failed' && operation.type === 'payout') {
      await this.failPayout(operation, source, operation.lastError);
    }
    return operation;
  }
}

module.exports = {
  payments: new PaymentReconciliationService(),
  providerOperations: new ProviderOperationsService(),
  mobileMoney: new MobileMoneyPaymentService(),
  cards: new CardPaymentService(),
  wallet: new WalletService(),
  checkIdempotency,
  generateIdempotencyKey,
  markIdempotencyComplete,
  markIdempotencyFailed,
  normalizeIdempotencyKey,
  runWithIdempotency,
  StripeService,
  MpesaService,
  MTNMoMoService,
  MobileMoneyPaymentService,
  CardPaymentService,
  PaymentReconciliationService,
  ProviderOperationsService,
  WalletService
};
