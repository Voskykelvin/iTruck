const crypto = require('crypto');
const NotificationDelivery = require('../models/NotificationDelivery');
const WorkerLease = require('../models/WorkerLease');
const logger = require('../config/logger');
const { mongoReady } = require('../config/runtime');
const { sendMail } = require('./email');
const { sendSMS } = require('./sms');
const { sendPush } = require('./push');
const User = require('../models/User');

const WORKER_ID = `${process.pid}:${crypto.randomBytes(6).toString('hex')}`;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const LEASE_MS = 2 * 60_000;

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function providerMessageId(result = {}) {
  return (
    result.id ||
    result.messageId ||
    result.providerReference ||
    result.response?.SMSMessageData?.Recipients?.[0]?.messageId
  );
}

async function claimDelivery(now = new Date()) {
  return NotificationDelivery.findOneAndUpdate(
    {
      $or: [
        {
          status: { $in: ['pending', 'retry'] },
          nextAttemptAt: { $lte: now }
        },
        {
          status: 'processing',
          leaseUntil: { $lte: now }
        }
      ]
    },
    {
      $set: {
        status: 'processing',
        leaseUntil: new Date(now.getTime() + LEASE_MS)
      },
      $inc: { attempts: 1 }
    },
    {
      new: true,
      sort: { nextAttemptAt: 1, createdAt: 1 }
    }
  );
}

async function sendDelivery(delivery, providers = {}) {
  const emailSender = providers.sendMail || sendMail;
  const smsSender = providers.sendSMS || sendSMS;
  if (delivery.channel === 'email') {
    return emailSender({ to: delivery.recipient, ...delivery.payload });
  }
  if (delivery.channel === 'sms') {
    return smsSender(delivery.recipient, delivery.payload?.message);
  }
  if (delivery.channel === 'push') {
    const pushSender = providers.sendPush || sendPush;
    const user = await User.findById(delivery.user).select('pushSubscription');
    if (!user?.pushSubscription?.endpoint) {
      const err = new Error('Push subscription is no longer available');
      err.permanent = true;
      throw err;
    }
    return pushSender(user.pushSubscription, delivery.payload);
  }
  throw new Error(`Unsupported notification channel: ${delivery.channel}`);
}

async function processDelivery(delivery, providers = {}, now = new Date()) {
  try {
    const result = await sendDelivery(delivery, providers);
    delivery.status = 'sent';
    delivery.sentAt = now;
    delivery.leaseUntil = undefined;
    delivery.lastError = undefined;
    delivery.provider = result?.provider || delivery.channel;
    delivery.providerMessageId = providerMessageId(result);
    delivery.providerResponse = result;
    await delivery.save();
    return { status: 'sent', delivery };
  } catch (err) {
    const exhausted = err.permanent === true || delivery.attempts >= delivery.maxAttempts;
    delivery.status = exhausted ? 'failed' : 'retry';
    delivery.failedAt = exhausted ? now : undefined;
    delivery.nextAttemptAt = exhausted
      ? undefined
      : new Date(
          now.getTime() + (RETRY_DELAYS_MS[Math.min(delivery.attempts - 1, RETRY_DELAYS_MS.length - 1)] || 60_000)
        );
    delivery.leaseUntil = undefined;
    delivery.lastError = String(err.message || err).slice(0, 1000);
    await delivery.save();
    if (delivery.channel === 'push' && err.permanent === true) {
      await User.updateOne({ _id: delivery.user }, { $unset: { pushSubscription: 1 } });
    }
    logger.warn(
      { err, deliveryId: delivery._id, channel: delivery.channel, attempts: delivery.attempts, exhausted },
      'Notification delivery failed'
    );
    return { status: delivery.status, delivery, error: err };
  }
}

async function processPendingDeliveries(options = {}) {
  if (!mongoReady() && options.force !== true) return { processed: 0, sent: 0, failed: 0, retried: 0 };
  const limit = positiveInteger(options.limit || process.env.NOTIFICATION_WORKER_BATCH_SIZE, 20, 200);
  const summary = { processed: 0, sent: 0, failed: 0, retried: 0 };

  for (let index = 0; index < limit; index += 1) {
    const delivery = await claimDelivery(options.now || new Date());
    if (!delivery) break;
    const result = await processDelivery(delivery, options.providers, options.now || new Date());
    summary.processed += 1;
    if (result.status === 'sent') summary.sent += 1;
    if (result.status === 'failed') summary.failed += 1;
    if (result.status === 'retry') summary.retried += 1;
  }
  return summary;
}

async function acquireLease(key, durationMs, now = new Date()) {
  const leaseUntil = new Date(now.getTime() + durationMs);
  try {
    const lease = await WorkerLease.findOneAndUpdate(
      {
        key,
        $or: [{ leaseUntil: { $lte: now } }, { owner: WORKER_ID }]
      },
      {
        $set: { owner: WORKER_ID, leaseUntil },
        $setOnInsert: { key }
      },
      { new: true, upsert: true }
    );
    return lease?.owner === WORKER_ID;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

module.exports = {
  acquireLease,
  claimDelivery,
  processDelivery,
  processPendingDeliveries,
  sendDelivery
};
