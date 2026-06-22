const Document = require('../models/Document');
const Booking = require('../models/Booking');
const IssueReport = require('../models/IssueReport');
const User = require('../models/User');
const Truck = require('../models/Truck');
const logger = require('../config/logger');
const notifications = require('./notifications');
const bidding = require('./bidding');
const matching = require('./matching');

const ACTIVE_TRACKING_STATUSES = ['in_transit', 'delivery_pending'];
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_CASE_STATUSES = [
  'submitted',
  'reviewing',
  'open',
  'triaged',
  'in_progress',
  'waiting_on_user',
  'waiting_on_carrier'
];

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

async function expireCarrierBids(now = new Date(), io) {
  const bookings = await Booking.find({
    bids: {
      $elemMatch: {
        status: { $in: bidding.ACTIVE_BID_STATUSES },
        expiresAt: { $lte: now }
      }
    }
  })
    .select('_id client pickup destination bids')
    .limit(100);

  let expired = 0;
  for (const booking of bookings) {
    try {
      const expiredBids = (booking.bids || []).filter((bid) => bidding.expireBidIfNeeded(bid, now));
      if (!expiredBids.length) continue;
      await booking.save();
      await Promise.allSettled(
        expiredBids.flatMap((bid) => [
          notifications.deliver(
            bid.owner?._id || bid.owner,
            'bid.expired',
            {
              title: `Bid expired on ${booking._id}`,
              message: 'The offer validity window ended before the booking was awarded.',
              link: '/app/bids',
              bookingId: booking._id,
              bidId: bid._id,
              dedupeKey: `bid-expired:${booking._id}:${bid._id}`
            },
            io
          ),
          notifications.deliver(
            booking.client,
            'bid.expired',
            {
              title: `Carrier bid expired on ${booking._id}`,
              message: `${booking.pickup || 'Pickup'} to ${booking.destination || 'delivery'} has an expired offer.`,
              link: '/app/bids',
              bookingId: booking._id,
              bidId: bid._id,
              dedupeKey: `bid-expired-client:${booking._id}:${bid._id}`
            },
            io
          )
        ])
      );
      if (io?.emitToBooking) io.emitToBooking(booking._id, 'bid-expired', booking);
      expired += expiredBids.length;
    } catch (err) {
      logger.error({ err, bookingId: booking._id }, 'Bid expiry processing failed');
    }
  }
  return expired;
}

async function reconcileDispatchCapacity() {
  const bookings = await Booking.find({
    status: { $in: ['delivered', 'cancelled'] },
    dispatchPlan: { $ne: null }
  })
    .select('_id status dispatchPlan dispatch')
    .limit(100);
  let reconciled = 0;
  for (const booking of bookings) {
    try {
      const plan = await matching.releaseAssignment(booking, booking.status);
      if (plan) reconciled += 1;
    } catch (err) {
      logger.error({ err, bookingId: booking._id }, 'Dispatch capacity reconciliation failed');
    }
  }
  return reconciled;
}

async function escalateBreachedCases(now = new Date(), io) {
  const cases = await IssueReport.find({
    status: { $in: ACTIVE_CASE_STATUSES },
    slaPausedAt: { $exists: false },
    $or: [
      {
        firstRespondedAt: { $exists: false },
        firstResponseBreachedAt: { $exists: false },
        firstResponseDueAt: { $lte: now }
      },
      {
        resolutionBreachedAt: { $exists: false },
        resolutionDueAt: { $lte: now }
      }
    ]
  })
    .select(
      '_id caseNumber title message kind category priority status assignedTo firstRespondedAt firstResponseDueAt firstResponseBreachedAt resolutionDueAt resolutionBreachedAt escalationLevel timeline booking'
    )
    .limit(100);

  if (!cases.length) return 0;
  const admins = await User.find({ role: 'admin', isActive: { $ne: false } })
    .select('firstName lastName email phone countryCode role isActive notificationPreferences')
    .limit(100);
  let escalated = 0;

  for (const record of cases) {
    try {
      const firstResponseBreach =
        !record.firstRespondedAt &&
        !record.firstResponseBreachedAt &&
        record.firstResponseDueAt &&
        record.firstResponseDueAt <= now;
      const resolutionBreach = !record.resolutionBreachedAt && record.resolutionDueAt && record.resolutionDueAt <= now;
      if (!firstResponseBreach && !resolutionBreach) continue;

      const breachTypes = [];
      const update = {
        lastEscalatedAt: now,
        lastActivityAt: now,
        escalationLevel: Math.min(Number(record.escalationLevel || 0) + 1, 5)
      };
      if (firstResponseBreach) {
        update.firstResponseBreachedAt = now;
        breachTypes.push('first-response');
      }
      if (resolutionBreach) {
        update.resolutionBreachedAt = now;
        breachTypes.push('resolution');
      }
      const breachFilter = [];
      if (firstResponseBreach) {
        breachFilter.push({
          firstRespondedAt: { $exists: false },
          firstResponseBreachedAt: { $exists: false },
          firstResponseDueAt: { $lte: now }
        });
      }
      if (resolutionBreach) {
        breachFilter.push({
          resolutionBreachedAt: { $exists: false },
          resolutionDueAt: { $lte: now }
        });
      }
      const result = await IssueReport.updateOne(
        {
          _id: record._id,
          status: { $in: ACTIVE_CASE_STATUSES },
          slaPausedAt: { $exists: false },
          $or: breachFilter
        },
        {
          $set: update,
          $push: {
            timeline: {
              action: 'case.sla.breached',
              visibility: 'internal',
              note: `${breachTypes.join(' and ')} SLA breached`,
              metadata: { breachTypes, escalationLevel: update.escalationLevel },
              createdAt: now
            }
          }
        }
      );
      if (!result.modifiedCount) continue;

      const recipients = record.assignedTo
        ? [record.assignedTo, ...admins.filter((admin) => String(admin._id) !== String(record.assignedTo))]
        : admins;
      await notifications.broadcast({
        users: recipients,
        type: 'case.sla-breached',
        data: {
          title: `${record.caseNumber || record._id} SLA breached`,
          message: `${breachTypes.join(' and ')} target missed for ${record.title || record.message || 'support case'}.`,
          link: '/app/admin',
          priority: 'high',
          caseId: record._id,
          caseNumber: record.caseNumber,
          bookingId: record.booking,
          breachTypes,
          escalationLevel: update.escalationLevel,
          dedupeKey: `case-sla:${record._id}:${breachTypes.join('+')}`
        },
        io
      });
      escalated += 1;
    } catch (err) {
      logger.error({ err, caseId: record._id }, 'Case SLA escalation failed');
    }
  }

  return escalated;
}

async function closeResolvedCases(now = new Date(), io) {
  const configuredDays = Number(process.env.CASE_AUTO_CLOSE_DAYS);
  const autoCloseDays = Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : 7;
  const cutoff = new Date(now.getTime() - autoCloseDays * DAY_MS);
  const eligibleFilter = {
    status: { $in: ['resolved', 'dismissed'] },
    $or: [{ resolvedAt: { $lte: cutoff } }, { resolvedAt: { $exists: false }, updatedAt: { $lte: cutoff } }]
  };
  const cases = await IssueReport.find(eligibleFilter)
    .select('_id caseNumber status participants booking timeline')
    .limit(100);
  let closed = 0;

  for (const record of cases) {
    try {
      const previous = record.status;
      const result = await IssueReport.updateOne(
        { _id: record._id, ...eligibleFilter },
        {
          $set: { status: 'closed', closedAt: now, lastActivityAt: now },
          $push: {
            timeline: {
              action: 'case.auto-closed',
              fromStatus: previous,
              toStatus: 'closed',
              visibility: 'participants',
              note: `Automatically closed ${autoCloseDays} days after resolution`,
              createdAt: now
            }
          }
        }
      );
      if (!result.modifiedCount) continue;
      await Promise.allSettled(
        (record.participants || []).map((participant) =>
          notifications.deliver(
            participant,
            'case.closed',
            {
              title: `${record.caseNumber || record._id} closed`,
              message: 'This case was closed after the resolution period ended.',
              link: '/app/tracking',
              caseId: record._id,
              caseNumber: record.caseNumber,
              bookingId: record.booking,
              dedupeKey: `case-closed:${record._id}`
            },
            io
          )
        )
      );
      closed += 1;
    } catch (err) {
      logger.error({ err, caseId: record._id }, 'Resolved case auto-close failed');
    }
  }
  return closed;
}

async function cleanupAbandonedBookings(now = new Date(), io) {
  const configuredHours = Number(process.env.ABANDONED_BOOKING_HOURS);
  const abandonedHours = Number.isFinite(configuredHours) && configuredHours >= 1 ? configuredHours : 72;
  const cutoff = new Date(now.getTime() - abandonedHours * 60 * 60 * 1000);
  const bookings = await Booking.find({
    status: { $in: ['pending', 'bidding'] },
    owner: null,
    paymentStatus: { $in: ['unpaid', 'failed'] },
    updatedAt: { $lte: cutoff },
    bids: { $not: { $elemMatch: { status: { $in: bidding.ACTIVE_BID_STATUSES } } } }
  })
    .select('_id client pickup destination status updatedAt')
    .limit(100);

  let cancelled = 0;
  for (const booking of bookings) {
    try {
      const result = await Booking.updateOne(
        {
          _id: booking._id,
          status: booking.status,
          updatedAt: { $lte: cutoff },
          bids: { $not: { $elemMatch: { status: { $in: bidding.ACTIVE_BID_STATUSES } } } }
        },
        { $set: { status: 'cancelled' } }
      );
      if (!result.modifiedCount) continue;
      await notifications.deliver(
        booking.client,
        'booking.abandoned-cancelled',
        {
          title: `${booking._id} was closed`,
          message: `The inactive booking was automatically closed after ${abandonedHours} hours without an active bid or payment.`,
          link: '/app/book',
          bookingId: booking._id,
          priority: 'normal',
          dedupeKey: `booking-abandoned:${booking._id}`
        },
        io
      );
      cancelled += 1;
    } catch (err) {
      logger.error({ err, bookingId: booking._id }, 'Abandoned booking cleanup failed');
    }
  }
  return cancelled;
}

async function runOperationalNotificationScan(options = {}) {
  const now = options.now || new Date();
  const io = options.io;
  const tasks = [
    ['expired', () => expireDocuments(now, io)],
    ['expiring', () => notifyExpiringDocuments(now, io)],
    ['staleTracking', () => notifyStaleTracking(now, io)],
    ['expiredBids', () => expireCarrierBids(now, io)],
    ['dispatchCapacity', () => reconcileDispatchCapacity()],
    ['caseSlaBreaches', () => escalateBreachedCases(now, io)],
    ['casesAutoClosed', () => closeResolvedCases(now, io)],
    ['abandonedBookings', () => cleanupAbandonedBookings(now, io)]
  ];
  const summary = {
    expired: 0,
    expiring: 0,
    staleTracking: 0,
    expiredBids: 0,
    dispatchCapacity: 0,
    caseSlaBreaches: 0,
    casesAutoClosed: 0,
    abandonedBookings: 0
  };
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
  cleanupAbandonedBookings,
  closeResolvedCases,
  escalateBreachedCases,
  expireDocuments,
  expireCarrierBids,
  expiryWindow,
  notifyExpiringDocuments,
  notifyStaleTracking,
  reconcileDispatchCapacity,
  runOperationalNotificationScan
};
