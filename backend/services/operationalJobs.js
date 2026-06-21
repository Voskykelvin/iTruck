const Document = require('../models/Document');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Truck = require('../models/Truck');
const logger = require('../config/logger');
const notifications = require('./notifications');

const ACTIVE_TRACKING_STATUSES = ['in_transit', 'delivery_pending'];
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function expiryWindow(daysRemaining) {
  if (daysRemaining <= 1) return 1;
  if (daysRemaining <= 7) return 7;
  return 30;
}

async function expireEmbeddedDocument(document) {
  const Model = {
    user: User,
    truck: Truck,
    booking: Booking
  }[document.targetType];
  if (!Model || !document.target) return;
  await Model.updateOne(
    { _id: document.target },
    { $set: { 'documents.$[document].status': 'expired' } },
    { arrayFilters: [{ 'document.type': document.type }] }
  );
}

async function expireDocuments(now = new Date(), io) {
  const documents = await Document.find({
    expiresAt: { $lte: now },
    status: { $ne: 'expired' }
  })
    .select('_id user type title targetType target expiresAt')
    .limit(100);

  let expired = 0;
  for (const document of documents) {
    try {
      await expireEmbeddedDocument(document);
      await notifications.deliver(
        document.user,
        'document.expired',
        {
          title: `${document.title || document.type} expired`,
          message: 'Upload a current replacement before using this account or vehicle for new work.',
          link: '/app/documents',
          priority: 'high',
          documentId: document._id,
          documentType: document.type,
          dedupeKey: `document-expired:${document._id}`
        },
        io
      );
      document.status = 'expired';
      await document.save();
      expired += 1;
    } catch (err) {
      logger.error({ err, documentId: document._id }, 'Expired document notification failed');
    }
  }

  return expired;
}

async function notifyExpiringDocuments(now = new Date(), io) {
  const horizon = new Date(now.getTime() + 30 * DAY_MS);
  const documents = await Document.find({
    expiresAt: { $gt: now, $lte: horizon },
    status: { $ne: 'expired' }
  })
    .select('_id user type title targetType expiresAt')
    .limit(200);

  let notified = 0;
  for (const document of documents) {
    try {
      const daysRemaining = Math.max(1, Math.ceil((document.expiresAt.getTime() - now.getTime()) / DAY_MS));
      const window = expiryWindow(daysRemaining);
      await notifications.deliver(
        document.user,
        'document.expiring',
        {
          title: `${document.title || document.type} expires soon`,
          message: `This document expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Upload a replacement early to avoid an operations hold.`,
          link: '/app/documents',
          priority: window === 1 ? 'high' : 'normal',
          documentId: document._id,
          documentType: document.type,
          expiresAt: document.expiresAt,
          dedupeKey: `document-expiring:${document._id}:${window}`
        },
        io
      );
      notified += 1;
    } catch (err) {
      logger.error({ err, documentId: document._id }, 'Expiring document notification failed');
    }
  }

  return notified;
}

async function notifyStaleTracking(now = new Date(), io) {
  const configuredStaleMinutes = Number(process.env.TRACKING_STALE_MINUTES);
  const staleMinutes =
    Number.isFinite(configuredStaleMinutes) && configuredStaleMinutes > 0 ? configuredStaleMinutes : 45;
  const cutoff = new Date(now.getTime() - staleMinutes * 60 * 1000);
  const bookings = await Booking.find({
    status: { $in: ACTIVE_TRACKING_STATUSES },
    owner: { $ne: null },
    $or: [
      { 'lastKnownLocation.recordedAt': { $lte: cutoff } },
      {
        'lastKnownLocation.recordedAt': { $exists: false },
        updatedAt: { $lte: cutoff }
      }
    ]
  })
    .select('_id client owner pickup destination status lastKnownLocation updatedAt')
    .limit(100);

  let notified = 0;
  for (const booking of bookings) {
    try {
      await notifications.notifyBookingParties(
        booking,
        'tracking.stale',
        {
          title: `${booking._id} tracking needs attention`,
          message: `No fresh location has been received for at least ${staleMinutes} minutes.`,
          link: '/app/tracking',
          priority: 'high',
          bookingId: booking._id,
          dedupeKey: `tracking-stale:${booking._id}:${dayKey(now)}`
        },
        io
      );
      notified += 1;
    } catch (err) {
      logger.error({ err, bookingId: booking._id }, 'Stale tracking notification failed');
    }
  }

  return notified;
}

async function runOperationalNotificationScan(options = {}) {
  const now = options.now || new Date();
  const io = options.io;
  const tasks = [
    ['expired', () => expireDocuments(now, io)],
    ['expiring', () => notifyExpiringDocuments(now, io)],
    ['staleTracking', () => notifyStaleTracking(now, io)]
  ];
  const summary = { expired: 0, expiring: 0, staleTracking: 0 };
  for (const [key, task] of tasks) {
    try {
      summary[key] = await task();
    } catch (err) {
      logger.error({ err, job: key }, 'Operational notification job failed');
    }
  }
  logger.info(summary, 'Operational notification scan complete');
  return summary;
}

module.exports = {
  expireDocuments,
  expiryWindow,
  notifyExpiringDocuments,
  notifyStaleTracking,
  runOperationalNotificationScan
};
