const crypto = require('crypto');
const mongoose = require('mongoose');
const IssueReport = require('../models/IssueReport');
const Booking = require('../models/Booking');
const User = require('../models/User');
const logger = require('../config/logger');
const notifications = require('./notifications');
const { assertReceiverGradeDeliveryProof } = require('./operationsPolicy');

const ACTIVE_STATUSES = [
  'submitted',
  'reviewing',
  'open',
  'triaged',
  'in_progress',
  'waiting_on_user',
  'waiting_on_carrier'
];
const WAITING_STATUSES = ['waiting_on_user', 'waiting_on_carrier'];
const RESOLVED_STATUSES = ['resolved', 'closed', 'dismissed'];
const DISPUTE_OUTCOMES = ['resume_booking', 'cancel_booking', 'confirm_delivery', 'refund_required'];
const STATUS_TRANSITIONS = {
  submitted: ['triaged', 'in_progress', 'waiting_on_user', 'waiting_on_carrier', 'resolved', 'dismissed'],
  reviewing: ['in_progress', 'waiting_on_user', 'waiting_on_carrier', 'resolved', 'dismissed'],
  open: ['triaged', 'in_progress', 'waiting_on_user', 'waiting_on_carrier', 'resolved', 'dismissed'],
  triaged: ['in_progress', 'waiting_on_user', 'waiting_on_carrier', 'resolved', 'dismissed'],
  in_progress: ['waiting_on_user', 'waiting_on_carrier', 'resolved', 'dismissed'],
  waiting_on_user: ['in_progress', 'resolved', 'dismissed'],
  waiting_on_carrier: ['in_progress', 'resolved', 'dismissed'],
  resolved: ['in_progress', 'closed'],
  dismissed: ['in_progress', 'closed'],
  closed: []
};

const SLA_DEFAULTS = {
  low: { firstResponseMinutes: 8 * 60, resolutionMinutes: 5 * 24 * 60 },
  normal: { firstResponseMinutes: 4 * 60, resolutionMinutes: 3 * 24 * 60 },
  high: { firstResponseMinutes: 60, resolutionMinutes: 24 * 60 },
  urgent: { firstResponseMinutes: 30, resolutionMinutes: 8 * 60 }
};
const PRIORITY_RANK = { low: 1, normal: 2, high: 3, urgent: 4 };

function casePriority(severity = 'normal', explicitPriority) {
  if (IssueReport.CASE_PRIORITIES.includes(explicitPriority)) return explicitPriority;
  if (severity === 'critical') return 'urgent';
  if (severity === 'high') return 'high';
  if (severity === 'low') return 'low';
  return 'normal';
}

function casePriorityRank(priority = 'normal') {
  return PRIORITY_RANK[priority] || PRIORITY_RANK.normal;
}

function configuredMinutes(priority, key, fallback) {
  const envKey = `CASE_SLA_${key}_${priority}`.toUpperCase();
  const value = Number(process.env[envKey]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function slaDeadlines(priority = 'normal', now = new Date()) {
  const defaults = SLA_DEFAULTS[priority] || SLA_DEFAULTS.normal;
  const firstResponseMinutes = configuredMinutes(priority, 'first_response_minutes', defaults.firstResponseMinutes);
  const resolutionMinutes = configuredMinutes(priority, 'resolution_minutes', defaults.resolutionMinutes);
  return {
    firstResponseDueAt: new Date(now.getTime() + firstResponseMinutes * 60_000),
    resolutionDueAt: new Date(now.getTime() + resolutionMinutes * 60_000)
  };
}

function uniqueIds(values = []) {
  const ids = new Map();
  values.filter(Boolean).forEach((value) => {
    const id = value?._id || value;
    if (id) ids.set(String(id), id);
  });
  return [...ids.values()];
}

function sameId(left, right) {
  return Boolean(left && right && String(left?._id || left) === String(right?._id || right));
}

function generateCaseNumber(now = new Date()) {
  const date = now.toISOString().slice(2, 10).replaceAll('-', '');
  return `ITC-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function evidenceRecords(urls = [], actor, fileNames = []) {
  return urls.map((url, index) => ({
    url,
    fileName: fileNames[index],
    addedBy: actor,
    createdAt: new Date()
  }));
}

function appendTimeline(record, action, actor, options = {}) {
  record.timeline.push({
    actor,
    action,
    fromStatus: options.fromStatus,
    toStatus: options.toStatus,
    visibility: options.visibility || 'participants',
    note: options.note,
    metadata: options.metadata || {},
    createdAt: options.now || new Date()
  });
}

function supportsTransactions() {
  const topology = mongoose.connection.client?.topology?.description?.type;
  return topology === 'ReplicaSetWithPrimary' || topology === 'Sharded';
}

async function runAtomic(work) {
  if (!supportsTransactions()) return work(null);
  return mongoose.connection.transaction((session) => work(session));
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function createDocument(Model, payload, session) {
  if (!session) return Model.create(payload);
  const [record] = await Model.create([payload], { session });
  return record;
}

async function notifyUsers(users, type, data, io) {
  const settled = await Promise.allSettled(uniqueIds(users).map((user) => notifications.deliver(user, type, data, io)));
  return settled.filter((result) => result.status === 'fulfilled').length;
}

async function notifyAdmins(type, data, io) {
  try {
    const admins = await User.find({ role: 'admin', isActive: { $ne: false } })
      .select('firstName lastName email phone countryCode role isActive notificationPreferences')
      .limit(100);
    return notifications.broadcast({ users: admins, type, data, io });
  } catch (err) {
    logger.error({ err, type }, 'Case admin notification failed');
    return { targeted: 0, created: 0 };
  }
}

function disputeBookingUpdate(record, booking, outcome, now) {
  const update = {
    disputeResolvedAt: now,
    disputeResolution: outcome
  };
  if (outcome === 'resume_booking') {
    const resumableStatus = record.bookingStatusBeforeDispute || booking.disputeStatusBefore;
    if (!Booking.STATUSES.includes(resumableStatus) || resumableStatus === 'disputed') {
      const err = new Error('The booking does not have a valid pre-dispute status');
      err.status = 409;
      throw err;
    }
    update.status = resumableStatus;
  }
  if (outcome === 'cancel_booking' && ['escrowed', 'release_pending', 'released'].includes(booking.paymentStatus)) {
    const err = new Error('Funded bookings must use the refund-required resolution outcome');
    err.status = 409;
    throw err;
  }
  if (outcome === 'cancel_booking' || outcome === 'refund_required') update.status = 'cancelled';
  if (outcome === 'confirm_delivery') {
    assertReceiverGradeDeliveryProof(booking);
    update.status = 'delivered';
    update.deliveredAt = booking.deliveredAt || now;
  }
  if (
    outcome === 'refund_required' &&
    !['unpaid', 'failed', 'refunded'].includes(String(booking.paymentStatus || 'unpaid'))
  ) {
    update.paymentStatus = 'refund_pending';
  }
  return update;
}

function assertStatusTransition(from, to) {
  if (from === to) return;
  if (!(STATUS_TRANSITIONS[from] || []).includes(to)) {
    const err = new Error(`Invalid case status transition from ${from} to ${to}`);
    err.status = 409;
    throw err;
  }
}

function resumeSla(record, now) {
  if (!record.slaPausedAt) return;
  const pausedMs = Math.max(0, now.getTime() - record.slaPausedAt.getTime());
  if (record.resolutionDueAt) record.resolutionDueAt = new Date(record.resolutionDueAt.getTime() + pausedMs);
  record.slaPausedAt = undefined;
}

function transitionCase(record, nextStatus, actor, options = {}) {
  const now = options.now || new Date();
  const previous = record.status;
  assertStatusTransition(previous, nextStatus);
  if (WAITING_STATUSES.includes(nextStatus) && !record.slaPausedAt) record.slaPausedAt = now;
  if (WAITING_STATUSES.includes(previous) && !WAITING_STATUSES.includes(nextStatus)) resumeSla(record, now);
  record.status = nextStatus;
  record.lastActivityAt = now;
  if (nextStatus === 'resolved' || nextStatus === 'dismissed') record.resolvedAt = now;
  if (nextStatus === 'closed') record.closedAt = now;
  appendTimeline(record, options.action || 'case.status.changed', actor, {
    fromStatus: previous,
    toStatus: nextStatus,
    note: options.note,
    visibility: options.visibility,
    metadata: options.metadata,
    now
  });
  return record;
}

async function createCase(input, options = {}) {
  const now = options.now || new Date();
  const kind = IssueReport.CASE_KINDS.includes(input.kind) ? input.kind : 'support';
  const category = IssueReport.CASE_CATEGORIES.includes(input.category) ? input.category : 'other';
  const priority = casePriority(input.severity, input.priority);
  const deadlines = slaDeadlines(priority, now);
  if (kind === 'dispute' && !input.booking) {
    const err = new Error('A booking is required for dispute cases');
    err.status = 422;
    throw err;
  }

  const record = await runAtomic(async (session) => {
    let booking;
    if (input.booking) {
      booking = await withSession(Booking.findById(input.booking), session);
      if (!booking) {
        const err = new Error('Booking not found');
        err.status = 404;
        throw err;
      }
    }

    if (kind === 'dispute' && booking) {
      const directParticipant =
        sameId(input.user, booking.client) || sameId(input.user, booking.owner) || sameId(input.user, booking.driver);
      if (!options.isAdmin && !directParticipant) {
        const err = new Error('Only the booking client or assigned carrier can open a formal dispute');
        err.status = 403;
        throw err;
      }
      if (booking.status === 'disputed') {
        const err = new Error('This booking is already held in dispute');
        err.status = 409;
        throw err;
      }
      const existing = await withSession(
        IssueReport.findOne({
          booking: booking._id,
          kind: 'dispute',
          status: { $in: ACTIVE_STATUSES }
        }),
        session
      );
      if (existing) {
        const err = new Error(`An active dispute already exists: ${existing.caseNumber || existing._id}`);
        err.status = 409;
        throw err;
      }
    }

    const directParticipant =
      booking &&
      (sameId(input.user, booking.client) ||
        sameId(input.user, booking.owner) ||
        sameId(input.user, booking.driver) ||
        options.isAdmin);
    const participants = uniqueIds([input.user, ...(directParticipant ? [booking?.client, booking?.owner] : [])]);
    const payload = {
      user: input.user,
      booking: booking?._id,
      caseNumber: generateCaseNumber(now),
      kind,
      category,
      title: input.title || `${category.replaceAll('_', ' ')} ${kind}`,
      status: 'open',
      severity: input.severity || 'normal',
      priority,
      priorityRank: casePriorityRank(priority),
      message: input.message,
      participants,
      evidence: evidenceRecords(input.evidenceUrls, input.user, input.evidenceFileNames),
      bookingStatusBeforeDispute: kind === 'dispute' ? booking?.status : undefined,
      ...deadlines,
      openedAt: now,
      lastActivityAt: now,
      payload: input.payload || {}
    };
    payload.timeline = [
      {
        actor: input.user,
        action: 'case.created',
        toStatus: 'open',
        note: input.message,
        visibility: 'participants',
        metadata: { kind, category, priority },
        createdAt: now
      }
    ];

    let created;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        created = await createDocument(IssueReport, payload, session);
        break;
      } catch (err) {
        if (err.code !== 11000 || attempt === 2) throw err;
        payload.caseNumber = generateCaseNumber(now);
      }
    }

    if (kind === 'dispute' && booking) {
      let updated;
      try {
        updated = await Booking.findOneAndUpdate(
          { _id: booking._id, status: booking.status },
          {
            $set: {
              status: 'disputed',
              disputeStatusBefore: booking.status,
              disputedAt: now,
              disputeCase: created._id
            }
          },
          { new: true, runValidators: true, ...(session ? { session } : {}) }
        );
      } catch (err) {
        if (!session) await IssueReport.deleteOne({ _id: created._id }).catch(() => {});
        throw err;
      }
      if (!updated) {
        if (!session) await IssueReport.deleteOne({ _id: created._id }).catch(() => {});
        const err = new Error('Booking changed while the dispute was being opened');
        err.status = 409;
        throw err;
      }
    }

    return created;
  });

  await notifyAdmins(
    'case.created',
    {
      title: `${record.caseNumber} ${record.kind} opened`,
      message: record.message,
      link: '/app/admin',
      priority: record.priority === 'urgent' ? 'high' : record.priority,
      caseId: record._id,
      caseNumber: record.caseNumber,
      bookingId: record.booking
    },
    options.io
  );
  await notifyUsers(
    (record.participants || []).filter((participant) => String(participant?._id || participant) !== String(input.user)),
    'case.opened',
    {
      title: `${record.caseNumber} ${record.kind} opened`,
      message: record.message,
      link: '/app/tracking',
      priority: record.priority === 'urgent' ? 'high' : record.priority,
      caseId: record._id,
      caseNumber: record.caseNumber,
      bookingId: record.booking,
      dedupeKey: `case-opened:${record._id}`
    },
    options.io
  );
  return record;
}

async function assignCase(record, assignee, actor, options = {}) {
  if (record.status === 'closed') {
    const err = new Error('Closed cases cannot be reassigned');
    err.status = 409;
    throw err;
  }
  const previousAssignee = record.assignedTo;
  record.assignedTo = assignee;
  if (['submitted', 'open'].includes(record.status)) transitionCase(record, 'triaged', actor, options);
  appendTimeline(record, 'case.assigned', actor, {
    note: options.note,
    visibility: 'internal',
    metadata: { previousAssignee, assignee }
  });
  record.lastActivityAt = options.now || new Date();
  await record.save();
  if (assignee) {
    await notifyUsers(
      [assignee],
      'case.assigned',
      {
        title: `${record.caseNumber} assigned to you`,
        message: record.title || record.message,
        link: '/app/admin',
        priority: record.priority === 'urgent' ? 'high' : record.priority,
        caseId: record._id,
        caseNumber: record.caseNumber
      },
      options.io
    );
  }
  return record;
}

async function changeCaseStatus(record, nextStatus, actor, options = {}) {
  const now = options.now || new Date();
  if (!record.firstRespondedAt && options.note) {
    record.firstRespondedAt = now;
    if (record.firstResponseDueAt && now > record.firstResponseDueAt && !record.firstResponseBreachedAt) {
      record.firstResponseBreachedAt = now;
    }
  }
  transitionCase(record, nextStatus, actor, { ...options, now });
  await record.save();
  await notifyUsers(
    record.participants,
    'case.status',
    {
      title: `${record.caseNumber} ${nextStatus.replaceAll('_', ' ')}`,
      message: options.note || 'Your support case status changed.',
      link: '/app/tracking',
      priority: record.priority === 'urgent' ? 'high' : record.priority,
      caseId: record._id,
      caseNumber: record.caseNumber,
      bookingId: record.booking,
      status: nextStatus
    },
    options.io
  );
  return record;
}

async function addComment(record, input, actor, options = {}) {
  const now = options.now || new Date();
  const isAdmin = options.isAdmin === true;
  if (record.status === 'closed') {
    const err = new Error('Closed cases cannot receive new comments');
    err.status = 409;
    throw err;
  }
  if (!isAdmin && record.kind === 'dispute' && ['resolved', 'dismissed'].includes(record.status)) {
    const err = new Error('Reopen the dispute before adding more evidence');
    err.status = 409;
    throw err;
  }
  const visibility = isAdmin && input.visibility === 'internal' ? 'internal' : 'participants';
  record.comments.push({
    author: actor,
    body: input.body,
    visibility,
    evidence: evidenceRecords(input.evidenceUrls, actor, input.evidenceFileNames),
    createdAt: now
  });
  if (isAdmin && !record.firstRespondedAt && visibility === 'participants') {
    record.firstRespondedAt = now;
    if (record.firstResponseDueAt && now > record.firstResponseDueAt && !record.firstResponseBreachedAt) {
      record.firstResponseBreachedAt = now;
    }
  }
  if (!isAdmin && WAITING_STATUSES.includes(record.status)) {
    transitionCase(record, 'in_progress', actor, { now, action: 'case.participant.replied' });
  } else if (!isAdmin && record.status === 'resolved') {
    reopenCaseRecord(record, actor, { now, note: 'Reopened by participant reply' });
  } else {
    appendTimeline(record, 'case.comment.added', actor, {
      now,
      visibility,
      metadata: { commentVisibility: visibility, evidenceCount: input.evidenceUrls?.length || 0 }
    });
  }
  record.lastActivityAt = now;
  await record.save();

  if (visibility === 'participants') {
    const notification = {
      title: `${record.caseNumber} has a new update`,
      message: input.body.slice(0, 300),
      caseId: record._id,
      caseNumber: record.caseNumber,
      bookingId: record.booking
    };
    if (isAdmin) {
      await notifyUsers(record.participants, 'case.comment', { ...notification, link: '/app/tracking' }, options.io);
    } else if (record.assignedTo) {
      await notifyUsers([record.assignedTo], 'case.comment', { ...notification, link: '/app/admin' }, options.io);
    } else {
      await notifyAdmins('case.comment', { ...notification, link: '/app/admin' }, options.io);
    }
  }
  return record;
}

function assertCaseCanReopen(record, now) {
  if (!['resolved', 'dismissed'].includes(record.status)) {
    const err = new Error('Only resolved or dismissed cases can be reopened');
    err.status = 409;
    throw err;
  }
  const configuredReopenDays = Number(process.env.CASE_REOPEN_DAYS);
  const reopenDays = Number.isFinite(configuredReopenDays) && configuredReopenDays > 0 ? configuredReopenDays : 14;
  const resolvedAt = record.resolvedAt || record.updatedAt;
  if (resolvedAt && now.getTime() - resolvedAt.getTime() > reopenDays * 24 * 60 * 60 * 1000) {
    const err = new Error('This case is closed to reopening; create a follow-up case');
    err.status = 409;
    throw err;
  }
}

function reopenCaseRecord(record, actor, options = {}) {
  const now = options.now || new Date();
  assertCaseCanReopen(record, now);
  const previous = record.status;
  record.status = 'in_progress';
  record.resolvedAt = undefined;
  record.closedAt = undefined;
  record.resolution = undefined;
  record.reopenedAt = now;
  record.reopenCount = Number(record.reopenCount || 0) + 1;
  record.lastActivityAt = now;
  const deadlines = slaDeadlines(record.priority, now);
  record.resolutionDueAt = deadlines.resolutionDueAt;
  record.resolutionBreachedAt = undefined;
  appendTimeline(record, 'case.reopened', actor, {
    fromStatus: previous,
    toStatus: 'in_progress',
    note: options.note,
    now
  });
  return record;
}

async function reopenCase(record, actor, options = {}) {
  const now = options.now || new Date();
  assertCaseCanReopen(record, now);
  let fallbackRollback;

  try {
    await runAtomic(async (session) => {
      if (record.kind === 'dispute') {
        if (!record.booking) {
          const err = new Error('The dispute is not linked to a booking');
          err.status = 409;
          throw err;
        }
        const booking = await withSession(Booking.findById(record.booking), session);
        if (!booking) {
          const err = new Error('The disputed booking is no longer available');
          err.status = 409;
          throw err;
        }
        if (booking.status === 'disputed' && !sameId(booking.disputeCase, record._id)) {
          const err = new Error('The booking is held by another dispute');
          err.status = 409;
          throw err;
        }

        const previousStatus = booking.status === 'disputed' ? booking.disputeStatusBefore : booking.status;
        if (!Booking.STATUSES.includes(previousStatus) || previousStatus === 'disputed') {
          const err = new Error('The booking does not have a valid state for reopening this dispute');
          err.status = 409;
          throw err;
        }
        record.bookingStatusBeforeDispute = previousStatus;

        if (booking.status !== 'disputed') {
          const previous = {
            status: booking.status,
            disputeStatusBefore: booking.disputeStatusBefore,
            disputedAt: booking.disputedAt,
            disputeCase: booking.disputeCase,
            disputeResolvedAt: booking.disputeResolvedAt,
            disputeResolution: booking.disputeResolution
          };
          const updated = await Booking.findOneAndUpdate(
            { _id: booking._id, status: booking.status },
            {
              $set: {
                status: 'disputed',
                disputeStatusBefore: booking.status,
                disputedAt: now,
                disputeCase: record._id
              },
              $unset: { disputeResolvedAt: 1, disputeResolution: 1 }
            },
            { new: true, runValidators: true, ...(session ? { session } : {}) }
          );
          if (!updated) {
            const err = new Error('The booking changed while the dispute was being reopened');
            err.status = 409;
            throw err;
          }
          if (!session) fallbackRollback = { bookingId: booking._id, previous };
        }
      }

      reopenCaseRecord(record, actor, { ...options, now });
      if (session) record.$session(session);
      await record.save();
    });
  } catch (err) {
    if (fallbackRollback) {
      const defined = Object.fromEntries(
        Object.entries(fallbackRollback.previous).filter(([, value]) => value !== undefined)
      );
      const missing = Object.fromEntries(
        Object.entries(fallbackRollback.previous)
          .filter(([, value]) => value === undefined)
          .map(([key]) => [key, 1])
      );
      await Booking.findOneAndUpdate(
        { _id: fallbackRollback.bookingId, status: 'disputed', disputeCase: record._id },
        {
          ...(Object.keys(defined).length ? { $set: defined } : {}),
          ...(Object.keys(missing).length ? { $unset: missing } : {})
        }
      ).catch(() => {});
    }
    throw err;
  }

  const notification = {
    title: `${record.caseNumber} reopened`,
    message: options.note || 'The case requires additional review.',
    priority: record.priority === 'urgent' ? 'high' : record.priority,
    caseId: record._id,
    caseNumber: record.caseNumber
  };
  await Promise.all([
    notifyUsers([record.assignedTo], 'case.reopened', { ...notification, link: '/app/admin' }, options.io),
    notifyUsers(record.participants, 'case.reopened', { ...notification, link: '/app/tracking' }, options.io)
  ]);
  return record;
}

async function resolveCase(record, input, actor, options = {}) {
  const now = options.now || new Date();
  if (!ACTIVE_STATUSES.includes(record.status)) {
    const err = new Error('Only active cases can be resolved');
    err.status = 409;
    throw err;
  }
  if (record.kind === 'dispute' && !DISPUTE_OUTCOMES.includes(input.outcome)) {
    const err = new Error('Dispute resolution must include a booking outcome');
    err.status = 409;
    throw err;
  }
  if (record.kind !== 'dispute' && !['no_action', 'dismissed'].includes(input.outcome)) {
    const err = new Error('Support case resolution must use no-action or dismissed');
    err.status = 409;
    throw err;
  }

  let fallbackRollback;
  try {
    await runAtomic(async (session) => {
      let bookingStatus;
      if (record.kind === 'dispute' && record.booking) {
        const booking = await withSession(Booking.findById(record.booking), session);
        if (!booking || booking.status !== 'disputed') {
          const err = new Error('The disputed booking is no longer available for resolution');
          err.status = 409;
          throw err;
        }
        const update = disputeBookingUpdate(record, booking, input.outcome, now);
        if (!update.status) {
          const err = new Error('Unable to determine the booking resolution status');
          err.status = 409;
          throw err;
        }
        const updated = await Booking.findOneAndUpdate(
          { _id: booking._id, status: 'disputed', disputeCase: record._id },
          { $set: update },
          { new: true, runValidators: true, ...(session ? { session } : {}) }
        );
        if (!updated) {
          const err = new Error('The disputed booking changed before resolution');
          err.status = 409;
          throw err;
        }
        bookingStatus = updated.status;
        if (!session) {
          const previous = {
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            deliveredAt: booking.deliveredAt,
            disputeResolvedAt: booking.disputeResolvedAt,
            disputeResolution: booking.disputeResolution
          };
          fallbackRollback = { bookingId: booking._id, appliedStatus: updated.status, previous };
        }
      }

      transitionCase(record, input.outcome === 'dismissed' ? 'dismissed' : 'resolved', actor, {
        now,
        action: 'case.resolved',
        note: input.summary,
        metadata: { outcome: input.outcome, bookingStatus }
      });
      if (!record.firstRespondedAt) {
        record.firstRespondedAt = now;
        if (record.firstResponseDueAt && now > record.firstResponseDueAt && !record.firstResponseBreachedAt) {
          record.firstResponseBreachedAt = now;
        }
      }
      if (record.resolutionDueAt && now > record.resolutionDueAt && !record.resolutionBreachedAt) {
        record.resolutionBreachedAt = now;
      }
      record.resolution = {
        outcome: input.outcome,
        summary: input.summary,
        bookingStatus,
        requiresRefund: input.outcome === 'refund_required',
        resolvedBy: actor,
        resolvedAt: now,
        evidenceUrls: input.evidenceUrls || []
      };
      if (session) record.$session(session);
      await record.save();
    });
  } catch (err) {
    if (fallbackRollback) {
      const defined = Object.fromEntries(
        Object.entries(fallbackRollback.previous).filter(([, value]) => value !== undefined)
      );
      const missing = Object.fromEntries(
        Object.entries(fallbackRollback.previous)
          .filter(([, value]) => value === undefined)
          .map(([key]) => [key, 1])
      );
      await Booking.findOneAndUpdate(
        {
          _id: fallbackRollback.bookingId,
          status: fallbackRollback.appliedStatus,
          disputeCase: record._id
        },
        {
          ...(Object.keys(defined).length ? { $set: defined } : {}),
          ...(Object.keys(missing).length ? { $unset: missing } : {})
        }
      ).catch(() => {});
    }
    throw err;
  }

  await notifyUsers(
    record.participants,
    'case.resolved',
    {
      title: `${record.caseNumber} resolved`,
      message: input.summary,
      link: '/app/tracking',
      priority: 'normal',
      caseId: record._id,
      caseNumber: record.caseNumber,
      bookingId: record.booking,
      outcome: input.outcome
    },
    options.io
  );
  return record;
}

function caseAccessFilter(user) {
  if (user.role === 'admin') return {};
  return { $or: [{ user: user._id }, { participants: user._id }] };
}

function visibleCase(record, user) {
  const value = record?.toObject ? record.toObject() : { ...record };
  if (user.role === 'admin') return value;
  value.comments = (value.comments || []).filter((comment) => comment.visibility !== 'internal');
  value.timeline = (value.timeline || []).filter((event) => event.visibility !== 'internal');
  delete value.payload;
  return value;
}

module.exports = {
  ACTIVE_STATUSES,
  RESOLVED_STATUSES,
  STATUS_TRANSITIONS,
  addComment,
  assignCase,
  caseAccessFilter,
  casePriority,
  casePriorityRank,
  changeCaseStatus,
  createCase,
  generateCaseNumber,
  reopenCase,
  reopenCaseRecord,
  resolveCase,
  slaDeadlines,
  transitionCase,
  visibleCase
};
