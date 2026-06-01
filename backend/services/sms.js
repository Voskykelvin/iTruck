const path = require('path');
const logger = require('../config/logger');

class QueuedSmsProvider {
  async send({ to, message }) {
    logger.info({ to, messageLength: String(message || '').length }, 'SMS queued');
    return { to, message, provider: 'queue' };
  }
}

function providerFromEnv() {
  if (!process.env.SMS_PROVIDER_MODULE) return new QueuedSmsProvider();
  const providerPath = path.resolve(process.cwd(), process.env.SMS_PROVIDER_MODULE);
  const provider = require(providerPath);
  if (!provider || typeof provider.send !== 'function') {
    throw new Error('SMS_PROVIDER_MODULE must export a provider with send(message)');
  }
  return provider;
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

module.exports = {
  QueuedSmsProvider,
  generateOTP,
  getSmsProvider,
  setSmsProvider,
  sendSMS
};
