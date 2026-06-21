jest.mock('../models/Document', () => ({
  find: jest.fn()
}));
jest.mock('../models/Booking', () => ({
  find: jest.fn()
}));
jest.mock('../services/notifications', () => ({
  deliver: jest.fn().mockResolvedValue({}),
  notifyBookingParties: jest.fn().mockResolvedValue([])
}));

const Document = require('../models/Document');
const Booking = require('../models/Booking');
const notifications = require('../services/notifications');
const {
  expireDocuments,
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
