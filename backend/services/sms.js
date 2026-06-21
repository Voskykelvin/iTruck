const path = require('path');
const logger = require('../config/logger');

class QueuedSmsProvider {
  async send({ to, message }) {
    logger.info({ to, messageLength: String(message || '').length }, 'SMS queued');
    return { to, message, provider: 'queue' };
  }
}

function normalizePhoneNumber(value, defaultCountryCode = process.env.SMS_DEFAULT_COUNTRY_CODE || '254') {
  const raw = String(value || '')
    .trim()
    .replace(/[^\d+]/g, '');

  if (!raw) return raw;
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('0')) return `+${defaultCountryCode}${raw.slice(1)}`;
  if (raw.startsWith(defaultCountryCode)) return `+${raw}`;
  return raw;
}

function smsTimeoutMs() {
  const configured = Number(process.env.SMS_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 15_000;
}

class AfricasTalkingSmsProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.AFRICASTALKING_API_KEY;
    this.username = options.username || process.env.AFRICASTALKING_USERNAME;
    this.baseUrl = (options.baseUrl || process.env.AFRICASTALKING_BASE_URL || 'https://api.africastalking.com').replace(
      /\/$/,
      ''
    );

    if (!this.apiKey || !this.username) {
      throw new Error("Africa's Talking SMS requires AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME");
    }
  }

  async send({ to, message }) {
    if (typeof fetch !== 'function') {
      throw new Error("Africa's Talking SMS requires a Node runtime with global fetch support");
    }

    const recipient = normalizePhoneNumber(to);
    if (!recipient) throw new Error('SMS recipient is required');
    if (!message) throw new Error('SMS message is required');

    const body = new URLSearchParams({
      username: this.username,
      to: recipient,
      message: String(message),
      enqueue: '1'
    });

    const response = await fetch(`${this.baseUrl}/version1/messaging`, {
      method: 'POST',
      signal: AbortSignal.timeout(smsTimeoutMs()),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey: this.apiKey
      },
      body
    });
    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_err) {
      data = text;
    }

    if (!response.ok) {
      const err = new Error("Africa's Talking SMS send failed");
      err.status = response.status;
      err.response = data;
      throw err;
    }

    return { provider: 'africastalking', to: recipient, response: data };
  }
}

function providerFromEnv() {
  const providerName = String(process.env.SMS_PROVIDER || '').toLowerCase();
  if (providerName === 'africastalking') {
    return new AfricasTalkingSmsProvider();
  }
  if (providerName === 'queue') {
    return new QueuedSmsProvider();
  }
  if (providerName && providerName !== 'queue') {
    throw new Error(`Unsupported SMS_PROVIDER: ${process.env.SMS_PROVIDER}`);
  }
  if (process.env.SMS_PROVIDER_MODULE) {
    const providerPath = path.resolve(process.cwd(), process.env.SMS_PROVIDER_MODULE);
    const provider = require(providerPath);
    if (!provider || typeof provider.send !== 'function') {
      throw new Error('SMS_PROVIDER_MODULE must export a provider with send(message)');
    }
    return provider;
  }
  if (!providerName && process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME) {
    return new AfricasTalkingSmsProvider();
  }
  return new QueuedSmsProvider();
}

let smsProvider;

function getSmsProvider() {
  if (!smsProvider) smsProvider = providerFromEnv();
  return smsProvider;
}

function setSmsProvider(provider) {
  if (!provider || typeof provider.send !== 'function') {
    throw new Error('SMS provider must implement send(message)');
  }
  smsProvider = provider;
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendSMS(to, message) {
  return getSmsProvider().send({ to, message });
}

async function sendBookingConfirmed(to, bookingRef) {
  return sendSMS(to, `Your booking ${bookingRef} has been confirmed. Track it on iTruck.`);
}

async function sendBidAccepted(to, bookingRef) {
  return sendSMS(to, `Your bid for booking ${bookingRef} was accepted. Open iTruck for pickup details.`);
}

module.exports = {
  AfricasTalkingSmsProvider,
  QueuedSmsProvider,
  generateOTP,
  getSmsProvider,
  normalizePhoneNumber,
  sendBidAccepted,
  sendBookingConfirmed,
  setSmsProvider,
  sendSMS
};
