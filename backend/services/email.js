const path = require('path');
const logger = require('../config/logger');
const { isLiveMode } = require('../config/runtime');

class QueuedEmailProvider {
  async send({ to, subject }) {
    const recipientCount = Array.isArray(to) ? to.length : to ? 1 : 0;
    logger.info({ recipientCount, subject }, 'Email queued');
    return { accepted: recipientCount, provider: 'queue' };
  }
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function recipients(value) {
  const list = (Array.isArray(value) ? value : [value]).map((item) => String(item || '').trim()).filter(Boolean);
  if (!list.length) throw new Error('Email recipient is required');
  return list;
}

function addressObject(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(.*?)\s*<([^<>]+)>$/);
  return match ? { name: match[1].trim(), email: match[2].trim() } : { email: text };
}

function emailTimeoutMs() {
  const configured = Number(process.env.EMAIL_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 15_000;
}

async function responseData(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_err) {
    return { message: text };
  }
}

class ResendEmailProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.RESEND_API_KEY;
    this.from = options.from || process.env.EMAIL_FROM;
    this.baseUrl = String(options.baseUrl || process.env.RESEND_API_URL || 'https://api.resend.com').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl || global.fetch;
    required(this.apiKey, 'RESEND_API_KEY is required');
    required(this.from, 'EMAIL_FROM is required');
    required(this.fetchImpl, 'Email provider requires a runtime with fetch support');
  }

  async send(message) {
    const response = await this.fetchImpl(`${this.baseUrl}/emails`, {
      method: 'POST',
      signal: AbortSignal.timeout(emailTimeoutMs()),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: message.from || this.from,
        to: recipients(message.to),
        subject: required(message.subject, 'Email subject is required'),
        ...(message.text ? { text: message.text } : {}),
        ...(message.html ? { html: message.html } : {}),
        ...(message.cc ? { cc: recipients(message.cc) } : {}),
        ...(message.bcc ? { bcc: recipients(message.bcc) } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {})
      })
    });
    const data = await responseData(response);
    if (!response.ok) {
      const err = new Error(data.message || 'Resend email delivery failed');
      err.status = response.status || 502;
      throw err;
    }
    return { provider: 'resend', ...data };
  }
}

class SendGridEmailProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.SENDGRID_API_KEY;
    this.from = options.from || process.env.EMAIL_FROM;
    this.baseUrl = String(options.baseUrl || process.env.SENDGRID_API_URL || 'https://api.sendgrid.com').replace(
      /\/$/,
      ''
    );
    this.fetchImpl = options.fetchImpl || global.fetch;
    required(this.apiKey, 'SENDGRID_API_KEY is required');
    required(this.from, 'EMAIL_FROM is required');
    required(this.fetchImpl, 'Email provider requires a runtime with fetch support');
  }

  async send(message) {
    const personalization = {
      to: recipients(message.to).map(addressObject)
    };
    if (message.cc) personalization.cc = recipients(message.cc).map(addressObject);
    if (message.bcc) personalization.bcc = recipients(message.bcc).map(addressObject);

    const content = [];
    if (message.text) content.push({ type: 'text/plain', value: message.text });
    if (message.html) content.push({ type: 'text/html', value: message.html });
    if (!content.length) throw new Error('Email text or HTML content is required');

    const response = await this.fetchImpl(`${this.baseUrl}/v3/mail/send`, {
      method: 'POST',
      signal: AbortSignal.timeout(emailTimeoutMs()),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [personalization],
        from: addressObject(message.from || this.from),
        subject: required(message.subject, 'Email subject is required'),
        content,
        ...(message.replyTo ? { reply_to: addressObject(message.replyTo) } : {})
      })
    });
    const data = await responseData(response);
    if (!response.ok) {
      const err = new Error(data.errors?.[0]?.message || data.message || 'SendGrid email delivery failed');
      err.status = response.status || 502;
      throw err;
    }
    return { provider: 'sendgrid', status: response.status, ...data };
  }
}

class SmtpEmailProvider {
  constructor(options = {}) {
    this.from = options.from || process.env.EMAIL_FROM;
    required(this.from, 'EMAIL_FROM is required');

    if (options.transporter) {
      this.transporter = options.transporter;
      return;
    }

    const nodemailer = require('nodemailer');
    const smtpUrl = options.url || process.env.SMTP_URL;
    const timeout = emailTimeoutMs();
    if (smtpUrl) {
      this.transporter = nodemailer.createTransport(
        {
          url: smtpUrl,
          pool: true,
          connectionTimeout: timeout,
          greetingTimeout: timeout,
          socketTimeout: timeout
        },
        { from: this.from }
      );
      return;
    }

    const host = options.host || process.env.SMTP_HOST;
    const port = Number(options.port || process.env.SMTP_PORT || 587);
    const user = options.user || process.env.SMTP_USER;
    const pass = options.pass || process.env.SMTP_PASS;
    required(host, 'SMTP_HOST or SMTP_URL is required');
    if (Boolean(user) !== Boolean(pass)) throw new Error('SMTP_USER and SMTP_PASS must be configured together');

    this.transporter = nodemailer.createTransport(
      {
        host,
        port,
        secure: options.secure ?? (process.env.SMTP_SECURE === 'true' || port === 465),
        pool: true,
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout,
        ...(user ? { auth: { user, pass } } : {})
      },
      { from: this.from }
    );
  }

  async send(message) {
    const result = await this.transporter.sendMail({
      ...message,
      from: message.from || this.from,
      to: recipients(message.to)
    });
    return { provider: 'smtp', ...result };
  }
}

function providerFromEnv() {
  if (process.env.EMAIL_PROVIDER_MODULE) {
    const providerPath = path.resolve(process.cwd(), process.env.EMAIL_PROVIDER_MODULE);
    const provider = require(providerPath);
    if (!provider || typeof provider.send !== 'function') {
      throw new Error('EMAIL_PROVIDER_MODULE must export a provider with send(message)');
    }
    return provider;
  }

  const provider = String(process.env.EMAIL_PROVIDER || '')
    .trim()
    .toLowerCase();
  if (provider === 'resend' || (!provider && process.env.RESEND_API_KEY)) return new ResendEmailProvider();
  if (provider === 'sendgrid' || (!provider && process.env.SENDGRID_API_KEY)) return new SendGridEmailProvider();
  if (provider === 'smtp' || (!provider && (process.env.SMTP_URL || process.env.SMTP_HOST))) {
    return new SmtpEmailProvider();
  }
  if (provider && provider !== 'queue') throw new Error(`Unsupported EMAIL_PROVIDER: ${process.env.EMAIL_PROVIDER}`);
  if (isLiveMode()) throw new Error('A real email provider is required in live mode');
  return new QueuedEmailProvider();
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
  ResendEmailProvider,
  SendGridEmailProvider,
  SmtpEmailProvider,
  getEmailProvider,
  setEmailProvider,
  sendMail,
  templates: {
    welcome: (user) => 'Welcome ' + user.firstName
  }
};
