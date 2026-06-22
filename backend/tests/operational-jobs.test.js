jest.mock('../models/Document', () => ({
  find: jest.fn()
}));
jest.mock('../models/Booking', () => ({
  find: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../models/IssueReport', () => ({
  find: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../models/User', () => ({
  find: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../services/notifications', () => ({
  broadcast: jest.fn().mockResolvedValue({ targeted: 0, created: 0 }),
  deliver: jest.fn().mockResolvedValue({}),
  notifyBookingParties: jest.fn().mockResolvedValue([])
}));

const Document = require('../models/Document');
const Booking = require('../models/Booking');
const IssueReport = require('../models/IssueReport');
const User = require('../models/User');
const notifications = require('../services/notifications');
const {
  closeResolvedCases,
  cleanupAbandonedBookings,
  escalateBreachedCases,
  expireDocuments,
  expireCarrierBids,
  expiryWindow,
  notifyExpiringDocuments,
  notifyStaleTracking
} = require('../services/operationalJobs');

function queryResult(items) {
  return {
    select() {
      return this;
    },
    limit: jest.fn().mockResolvedValue(items)
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.find.mockReturnValue(queryResult([]));
  IssueReport.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Booking.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

test('abandoned unpaid bookings are cancelled only after active bids are gone', async () => {
  Booking.find.mockReturnValue(
    queryResult([
      {
        _id: 'booking-abandoned',
        client: 'client-1',
        pickup: 'Nairobi',
        destination: 'Mombasa',
        status: 'bidding',
        updatedAt: new Date('2026-06-18T00:00:00.000Z')
      }
    ])
  );

  await expect(cleanupAbandonedBookings(new Date('2026-06-22T12:00:00.000Z'))).resolves.toBe(1);
  expect(Booking.find).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: null,
      paymentStatus: { $in: ['unpaid', 'failed'] },
      bids: { $not: { $elemMatch: { status: expect.any(Object) } } }
    })
  );
  expect(Booking.updateOne).toHaveBeenCalledWith(
    expect.objectContaining({ _id: 'booking-abandoned', status: 'bidding' }),
    { $set: { status: 'cancelled' } }
  );
  expect(notifications.deliver).toHaveBeenCalledWith(
    'client-1',
    'booking.abandoned-cancelled',
    expect.objectContaining({ dedupeKey: 'booking-abandoned:booking-abandoned' }),
    undefined
  );
});

test('expiry windows provide 30, 7, and 1 day dedupe boundaries', () => {
  expect(expiryWindow(20)).toBe(30);
  expect(expiryWindow(6)).toBe(7);
  expect(expiryWindow(1)).toBe(1);
});

test('expired document scan updates status and alerts the user', async () => {
  const document = {
    _id: 'doc-1',
    user: 'user-1',
    type: 'insurance',
    title: 'Insurance',
    status: 'approved',
    save: jest.fn().mockResolvedValue(undefined)
  };
  Document.find.mockReturnValue(queryResult([document]));

  await expect(expireDocuments(new Date())).resolves.toBe(1);
  expect(document.status).toBe('expired');
  expect(notifications.deliver).toHaveBeenCalledWith(
    'user-1',
    'document.expired',
    expect.objectContaining({ dedupeKey: 'document-expired:doc-1' }),
    undefined
  );
});

test('expiring document scan creates threshold-specific reminders', async () => {
  const now = new Date('2026-06-21T00:00:00.000Z');
  Document.find.mockReturnValue(
    queryResult([
      {
        _id: 'doc-2',
        user: 'user-2',
        type: 'road-license',
        title: 'Road license',
        expiresAt: new Date('2026-06-26T00:00:00.000Z')
      }
    ])
  );

  await notifyExpiringDocuments(now);
  expect(notifications.deliver).toHaveBeenCalledWith(
    'user-2',
    'document.expiring',
    expect.objectContaining({ dedupeKey: 'document-expiring:doc-2:7' }),
    undefined
  );
});

test('stale tracking scan alerts both booking parties with a daily dedupe key', async () => {
  Booking.find.mockReturnValue(
    queryResult([
      {
        _id: 'booking-1',
        client: 'client-1',
        owner: 'owner-1',
        pickup: 'Nairobi',
        destination: 'Kampala'
      }
    ])
  );

  await notifyStaleTracking(new Date('2026-06-21T12:00:00.000Z'));
  expect(Booking.find).toHaveBeenCalledWith(
    expect.objectContaining({
      status: { $in: ['in_transit', 'delivery_pending'] }
    })
  );
  expect(notifications.notifyBookingParties).toHaveBeenCalledWith(
    expect.objectContaining({ _id: 'booking-1' }),
    'tracking.stale',
    expect.objectContaining({ dedupeKey: 'tracking-stale:booking-1:2026-06-21' }),
    undefined
  );
});

test('expired carrier bids are finalized and both parties are notified', async () => {
  const booking = {
    _id: 'booking-bid-expiry',
    client: 'client-1',
    pickup: 'Nairobi',
    destination: 'Kisumu',
    bids: [
      {
        _id: 'bid-1',
        owner: 'owner-1',
        status: 'pending',
        expiresAt: new Date('2026-06-21T10:00:00.000Z'),
        history: []
      }
    ],
    save: jest.fn().mockResolvedValue(undefined)
  };
  Booking.find.mockReturnValue(queryResult([booking]));

  await expect(expireCarrierBids(new Date('2026-06-21T11:00:00.000Z'))).resolves.toBe(1);
  expect(booking.bids[0].status).toBe('expired');
  expect(notifications.deliver).toHaveBeenCalledWith(
    'owner-1',
    'bid.expired',
    expect.objectContaining({ dedupeKey: 'bid-expired:booking-bid-expiry:bid-1' }),
    undefined
  );
  expect(notifications.deliver).toHaveBeenCalledWith(
    'client-1',
    'bid.expired',
    expect.objectContaining({ dedupeKey: 'bid-expired-client:booking-bid-expiry:bid-1' }),
    undefined
  );
});

test('operational scans continue after one recipient fails', async () => {
  const now = new Date('2026-06-21T00:00:00.000Z');
  Document.find.mockReturnValue(
    queryResult([
      {
        _id: 'doc-failed',
        user: 'user-1',
        type: 'insurance',
        expiresAt: new Date('2026-06-26T00:00:00.000Z')
      },
      {
        _id: 'doc-sent',
        user: 'user-2',
        type: 'road-license',
        expiresAt: new Date('2026-06-26T00:00:00.000Z')
      }
    ])
  );
  notifications.deliver.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({});

  await expect(notifyExpiringDocuments(now)).resolves.toBe(1);
  expect(notifications.deliver).toHaveBeenCalledTimes(2);
});

test('case SLA scans mark breaches once and notify operators', async () => {
  const now = new Date('2026-06-21T12:00:00.000Z');
  const record = {
    _id: 'case-1',
    caseNumber: 'ITC-260621-ABC123',
    title: 'Cargo damage',
    priority: 'high',
    assignedTo: 'admin-1',
    firstResponseDueAt: new Date('2026-06-21T10:00:00.000Z'),
    resolutionDueAt: new Date('2026-06-21T11:00:00.000Z'),
    escalationLevel: 0,
    timeline: []
  };
  IssueReport.find.mockReturnValue(queryResult([record]));
  User.find.mockReturnValue(
    queryResult([
      { _id: 'admin-1', role: 'admin' },
      { _id: 'admin-2', role: 'admin' }
    ])
  );

  await expect(escalateBreachedCases(now)).resolves.toBe(1);
  expect(IssueReport.updateOne).toHaveBeenCalledWith(
    expect.objectContaining({ _id: 'case-1', status: expect.any(Object) }),
    expect.objectContaining({
      $set: expect.objectContaining({
        firstResponseBreachedAt: now,
        resolutionBreachedAt: now,
        escalationLevel: 1
      }),
      $push: {
        timeline: expect.objectContaining({
          action: 'case.sla.breached',
          visibility: 'internal'
        })
      }
    })
  );
  expect(notifications.broadcast).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'case.sla-breached',
      data: expect.objectContaining({ dedupeKey: 'case-sla:case-1:first-response+resolution' })
    })
  );
});

test('case SLA scans skip notifications when the case changes before the atomic update', async () => {
  const now = new Date('2026-06-21T12:00:00.000Z');
  IssueReport.find.mockReturnValue(
    queryResult([
      {
        _id: 'case-raced',
        caseNumber: 'ITC-260621-RACED1',
        title: 'Case resolved during scan',
        firstResponseDueAt: new Date('2026-06-21T10:00:00.000Z'),
        resolutionDueAt: new Date('2026-06-22T10:00:00.000Z'),
        escalationLevel: 0
      }
    ])
  );
  IssueReport.updateOne.mockResolvedValue({ modifiedCount: 0 });

  await expect(escalateBreachedCases(now)).resolves.toBe(0);
  expect(notifications.broadcast).not.toHaveBeenCalled();
});

test('resolved cases auto-close after the configured resolution period', async () => {
  const now = new Date('2026-06-21T12:00:00.000Z');
  const record = {
    _id: 'case-2',
    caseNumber: 'ITC-260610-CLOSED',
    status: 'resolved',
    participants: ['user-1'],
    timeline: []
  };
  IssueReport.find.mockReturnValue(queryResult([record]));

  await expect(closeResolvedCases(now)).resolves.toBe(1);
  expect(IssueReport.updateOne).toHaveBeenCalledWith(
    expect.objectContaining({ _id: 'case-2', status: { $in: ['resolved', 'dismissed'] } }),
    expect.objectContaining({
      $set: expect.objectContaining({ status: 'closed', closedAt: now }),
      $push: { timeline: expect.objectContaining({ action: 'case.auto-closed' }) }
    })
  );
  expect(notifications.deliver).toHaveBeenCalledWith(
    'user-1',
    'case.closed',
    expect.objectContaining({ dedupeKey: 'case-closed:case-2' }),
    undefined
  );
});

test('auto-close does not overwrite a case reopened during the scan', async () => {
  IssueReport.find.mockReturnValue(
    queryResult([
      {
        _id: 'case-reopened',
        caseNumber: 'ITC-260610-REOPEN',
        status: 'resolved',
        participants: ['user-1']
      }
    ])
  );
  IssueReport.updateOne.mockResolvedValue({ modifiedCount: 0 });

  await expect(closeResolvedCases(new Date('2026-06-21T12:00:00.000Z'))).resolves.toBe(0);
  expect(notifications.deliver).not.toHaveBeenCalled();
});
