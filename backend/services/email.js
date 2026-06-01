const path = require('path');
const logger = require('../config/logger');

class QueuedEmailProvider {
  async send({ to, subject }) {
    logger.info({ to, subject }, 'Email queued');
    return { accepted: [to], provider: 'queue' };
  }
}

function providerFromEnv() {
  if (!process.env.EMAIL_PROVIDER_MODULE) return new QueuedEmailProvider();
  const providerPath = path.resolve(process.cwd(), process.env.EMAIL_PROVIDER_MODULE);
  const provider = require(providerPath);
  if (!provider || typeof provider.send !== 'function') {
    throw new Error('EMAIL_PROVIDER_MODULE must export a provider with send(message)');
  }
  return provider;
}

let emailProvider;

function getEmailProvider() {
  if (!emailProvider) emailProvider = providerFromEnv();
  return emailProvider;
}

function setEmailProvider(provider) {
  if (!provider || typeof provider.send !== 'function') {
    throw new Error('Email provider must implement send(message)');
  }
  emailProvider = provider;
}

async function sendMail(message) {
  return getEmailProvider().send(message);
}

module.exports = {
  QueuedEmailProvider,
  getEmailProvider,
  setEmailProvider,
  sendMail,
  templates: {
    welcome: (user) => 'Welcome ' + user.firstName
  }
};
