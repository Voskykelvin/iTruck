jest.mock('../services/notifications', () => ({
  broadcast: jest.fn().mockResolvedValue({ targeted: 1, created: 1 }),
  deliver: jest.fn().mockResolvedValue({})
}));

const mongoose = require('mongoose');
const IssueReport = require('../models/IssueReport');
const Booking = require('../models/Booking');
const User = require('../models/User');
const notifications = require('../services/notifications');
const {
  addComment,
  casePriority,
  createCase,
  reopenCase,
  reopenCaseRecord,
  resolveCase,
  slaDeadlines,
  transitionCase,
  visibleCase
} = require('../services/caseManagement');

function oid() {
  return new mongoose.Types.ObjectId();
}

function activeCase(overrides = {}) {
  const record = new IssueReport({
    user: oid(),
    caseNumber: 'ITC-260621-ABC123',
    kind: 'support',
    category: 'delay',
    title: 'Border delay',
    message: 'The shipment is delayed at the border',
    status: 'open',
    priority: 'high',
    firstResponseDueAt: new Date('2026-06-21T10:00:00.000Z'),
    resolutionDueAt: new Date('2026-06-22T10:00:00.000Z'),
    participants: [oid()],
    ...overrides
  });
  record.save = jest.fn().mockResolvedValue(record);
  return record;
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.spyOn(User, 'find').mockReturnValue({
    select() {
      return this;
    },
    limit: jest.fn().mockResolvedValue([])
  });
});

test('case priorities and SLA targets reflect severity', () => {
  expect(casePriority('critical')).toBe('urgent');
  expect(casePriority('high')).toBe('high');
  expect(casePriority('low')).toBe('low');

  const now = new Date('2026-06-21T00:00:00.000Z');
  const urgent = slaDeadlines('urgent', now);
  expect(urgent.firstResponseDueAt).toEqual(new Date('2026-06-21T00:30:00.000Z'));
  expect(urgent.resolutionDueAt).toEqual(new Date('2026-06-21T08:00:00.000Z'));
});

test('case transitions pause and resume the resolution SLA', () => {
  const record = activeCase();
  const waitingAt = new Date('2026-06-21T08:00:00.000Z');
  transitionCase(record, 'waiting_on_user', oid(), { now: waitingAt, note: 'Please upload evidence' });
  expect(record.slaPausedAt).toEqual(waitingAt);

  const resumedAt = new Date('2026-06-21T10:00:00.000Z');
  transitionCase(record, 'in_progress', oid(), { now: resumedAt });
  expect(record.slaPausedAt).toBeUndefined();
  expect(record.resolutionDueAt).toEqual(new Date('2026-06-22T12:00:00.000Z'));
});

test('invalid case status transitions are rejected', () => {
  const record = activeCase({ status: 'closed' });
  expect(() => transitionCase(record, 'in_progress', oid())).toThrow('Invalid case status transition');
});

test('participants cannot see internal comments or timeline entries', () => {
  const participant = oid();
  const record = activeCase({
    participants: [participant],
    comments: [
      { author: oid(), body: 'Public update', visibility: 'participants' },
      { author: oid(), body: 'Internal fraud review', visibility: 'internal' }
    ],
    timeline: [
      { action: 'case.created', visibility: 'participants' },
      { action: 'case.risk.flagged', visibility: 'internal' }
    ],
    payload: { internalSignal: true }
  });
  const visible = visibleCase(record, { _id: participant, role: 'client' });
  expect(visible.comments).toHaveLength(1);
  expect(visible.timeline).toHaveLength(1);
  expect(visible.payload).toBeUndefined();
});

test('resolved cases can reopen during the configured window', () => {
  const record = activeCase({
    status: 'resolved',
    resolvedAt: new Date('2026-06-20T00:00:00.000Z'),
    reopenCount: 0,
    resolution: { outcome: 'no_action', summary: 'Original resolution' }
  });
  reopenCaseRecord(record, oid(), {
    now: new Date('2026-06-21T00:00:00.000Z'),
    note: 'New evidence'
  });
  expect(record.status).toBe('in_progress');
  expect(record.reopenCount).toBe(1);
  expect(record.resolution).toBeUndefined();
  expect(record.timeline.at(-1).action).toBe('case.reopened');
});

test('resolved disputes must be explicitly reopened before participants add evidence', async () => {
  const record = activeCase({
    kind: 'dispute',
    status: 'resolved',
    resolvedAt: new Date('2026-06-20T00:00:00.000Z')
  });

  await expect(addComment(record, { body: 'I have more evidence' }, oid())).rejects.toThrow('Reopen the dispute');
  expect(record.comments).toHaveLength(0);
});

test('participant-visible admin comments record first response and evidence', async () => {
  const now = new Date('2026-06-21T11:00:00.000Z');
  const record = activeCase();
  await addComment(
    record,
    {
      body: 'Operations is reviewing the uploaded route evidence',
      visibility: 'participants',
      evidenceUrls: ['/api/uploads/local/case-evidence.pdf'],
      evidenceFileNames: ['case-evidence.pdf']
    },
    oid(),
    { isAdmin: true, now }
  );

  expect(record.firstRespondedAt).toEqual(now);
  expect(record.firstResponseBreachedAt).toEqual(now);
  expect(record.comments[0].evidence[0].fileName).toBe('case-evidence.pdf');
  expect(notifications.deliver).toHaveBeenCalled();
});

test('creating a dispute holds the booking and records participants', async () => {
  const client = oid();
  const owner = oid();
  const bookingId = oid();
  const booking = { _id: bookingId, client, owner, status: 'in_transit' };
  const created = activeCase({
    _id: oid(),
    user: client,
    booking: bookingId,
    kind: 'dispute',
    participants: [client, owner]
  });
  jest.spyOn(Booking, 'findById').mockResolvedValue(booking);
  jest.spyOn(IssueReport, 'findOne').mockResolvedValue(null);
  jest.spyOn(IssueReport, 'create').mockResolvedValue(created);
  const bookingUpdate = jest.spyOn(Booking, 'findOneAndUpdate').mockResolvedValue({
    ...booking,
    status: 'disputed'
  });

  const result = await createCase({
    user: client,
    booking: bookingId,
    kind: 'dispute',
    category: 'damage',
    severity: 'high',
    message: 'Cargo was damaged during transit'
  });

  expect(result).toBe(created);
  expect(bookingUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ _id: bookingId, status: 'in_transit' }),
    expect.objectContaining({
      $set: expect.objectContaining({
        status: 'disputed',
        disputeStatusBefore: 'in_transit',
        disputeCase: created._id
      })
    }),
    expect.any(Object)
  );
  expect(notifications.broadcast).toHaveBeenCalled();
});

test('only direct booking participants can open formal disputes', async () => {
  const bidder = oid();
  jest.spyOn(Booking, 'findById').mockResolvedValue({
    _id: oid(),
    client: oid(),
    owner: oid(),
    status: 'in_transit'
  });

  await expect(
    createCase({
      user: bidder,
      booking: oid(),
      kind: 'dispute',
      category: 'damage',
      message: 'A losing bidder must not freeze this shipment'
    })
  ).rejects.toThrow('assigned carrier');
});

test('failed dispute holds clean up the newly created case without transactions', async () => {
  const client = oid();
  const bookingId = oid();
  const created = activeCase({ _id: oid(), user: client, booking: bookingId, kind: 'dispute' });
  jest.spyOn(Booking, 'findById').mockResolvedValue({
    _id: bookingId,
    client,
    owner: oid(),
    status: 'in_transit'
  });
  jest.spyOn(IssueReport, 'findOne').mockResolvedValue(null);
  jest.spyOn(IssueReport, 'create').mockResolvedValue(created);
  jest.spyOn(Booking, 'findOneAndUpdate').mockRejectedValue(new Error('write failed'));
  const cleanup = jest.spyOn(IssueReport, 'deleteOne').mockResolvedValue({ deletedCount: 1 });

  await expect(
    createCase({
      user: client,
      booking: bookingId,
      kind: 'dispute',
      category: 'damage',
      message: 'Cargo was damaged during transit'
    })
  ).rejects.toThrow('write failed');
  expect(cleanup).toHaveBeenCalledWith({ _id: created._id });
});

test('reopening a dispute places the booking back on hold', async () => {
  const bookingId = oid();
  const record = activeCase({
    _id: oid(),
    booking: bookingId,
    kind: 'dispute',
    status: 'resolved',
    resolvedAt: new Date('2026-06-20T00:00:00.000Z'),
    resolution: { outcome: 'resume_booking', summary: 'Initial review complete' }
  });
  jest.spyOn(Booking, 'findById').mockResolvedValue({
    _id: bookingId,
    status: 'in_transit',
    disputeStatusBefore: 'in_transit',
    disputeCase: record._id
  });
  const bookingUpdate = jest.spyOn(Booking, 'findOneAndUpdate').mockResolvedValue({
    _id: bookingId,
    status: 'disputed',
    disputeStatusBefore: 'in_transit',
    disputeCase: record._id
  });

  await reopenCase(record, oid(), {
    now: new Date('2026-06-21T09:00:00.000Z'),
    note: 'New evidence needs review'
  });

  expect(record.status).toBe('in_progress');
  expect(record.bookingStatusBeforeDispute).toBe('in_transit');
  expect(record.resolution).toBeUndefined();
  expect(bookingUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ _id: bookingId, status: 'in_transit' }),
    expect.objectContaining({
      $set: expect.objectContaining({ status: 'disputed', disputeCase: record._id })
    }),
    expect.any(Object)
  );
});

test('dispute resolution resumes the pre-dispute booking state', async () => {
  const bookingId = oid();
  const record = activeCase({
    _id: oid(),
    booking: bookingId,
    kind: 'dispute',
    bookingStatusBeforeDispute: 'in_transit'
  });
  jest.spyOn(Booking, 'findById').mockResolvedValue({
    _id: bookingId,
    status: 'disputed',
    disputeStatusBefore: 'in_transit'
  });
  const bookingUpdate = jest.spyOn(Booking, 'findOneAndUpdate').mockResolvedValue({
    _id: bookingId,
    status: 'in_transit'
  });

  await resolveCase(
    record,
    {
      outcome: 'resume_booking',
      summary: 'Evidence reviewed; shipment can continue'
    },
    oid(),
    { now: new Date('2026-06-21T09:00:00.000Z') }
  );

  expect(record.status).toBe('resolved');
  expect(record.resolution.outcome).toBe('resume_booking');
  expect(bookingUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'disputed', disputeCase: record._id }),
    expect.objectContaining({ $set: expect.objectContaining({ status: 'in_transit' }) }),
    expect.any(Object)
  );
});

test('funded disputes require the refund-required outcome before cancellation', async () => {
  const bookingId = oid();
  const record = activeCase({
    _id: oid(),
    booking: bookingId,
    kind: 'dispute',
    bookingStatusBeforeDispute: 'in_transit'
  });
  jest.spyOn(Booking, 'findById').mockResolvedValue({
    _id: bookingId,
    status: 'disputed',
    paymentStatus: 'escrowed',
    disputeStatusBefore: 'in_transit'
  });

  await expect(
    resolveCase(
      record,
      {
        outcome: 'cancel_booking',
        summary: 'Cancel the shipment'
      },
      oid()
    )
  ).rejects.toThrow('refund-required');
});

test('support cases cannot apply booking dispute outcomes', async () => {
  const record = activeCase({ kind: 'support' });
  await expect(
    resolveCase(
      record,
      {
        outcome: 'refund_required',
        summary: 'This support case must not alter payment semantics'
      },
      oid()
    )
  ).rejects.toThrow('no-action or dismissed');
});

test('refund-required dispute outcomes mark funded bookings pending reconciliation', async () => {
  const bookingId = oid();
  const record = activeCase({
    _id: oid(),
    booking: bookingId,
    kind: 'dispute',
    bookingStatusBeforeDispute: 'in_transit'
  });
  jest.spyOn(Booking, 'findById').mockResolvedValue({
    _id: bookingId,
    status: 'disputed',
    paymentStatus: 'escrowed',
    disputeStatusBefore: 'in_transit'
  });
  const bookingUpdate = jest.spyOn(Booking, 'findOneAndUpdate').mockResolvedValue({
    _id: bookingId,
    status: 'cancelled',
    paymentStatus: 'refund_pending'
  });

  await resolveCase(
    record,
    {
      outcome: 'refund_required',
      summary: 'Cancel shipment and begin provider refund reconciliation',
      evidenceUrls: ['/api/uploads/local/refund-decision.pdf']
    },
    oid()
  );

  expect(bookingUpdate).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      $set: expect.objectContaining({ status: 'cancelled', paymentStatus: 'refund_pending' })
    }),
    expect.any(Object)
  );
  expect(record.resolution.requiresRefund).toBe(true);
  expect(record.resolution.evidenceUrls).toEqual(['/api/uploads/local/refund-decision.pdf']);
});
