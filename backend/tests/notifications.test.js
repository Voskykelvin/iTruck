jest.mock('../models/Notification', () => ({
  create: jest.fn(),
  findOne: jest.fn()
}));
jest.mock('../models/NotificationDelivery', () => ({
  create: jest.fn(),
  findOne: jest.fn()
}));
jest.mock('../models/User', () => ({
  findById: jest.fn()
}));

const Notification = require('../models/Notification');
const NotificationDelivery = require('../models/NotificationDelivery');
const notifications = require('../services/notifications');

function user(overrides = {}) {
  return {
    _id: 'user-1',
    email: 'shipper@example.com',
    phone: '0700000000',
    countryCode: '+254',
    isActive: true,
    notificationPreferences: {},
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Notification.create.mockImplementation((payload) => Promise.resolve({ _id: 'note-test', ...payload }));
  NotificationDelivery.create.mockImplementation((payload) => Promise.resolve({ _id: 'delivery-test', ...payload }));
});

test('deliver persists and emits an in-app notification by default', async () => {
  const io = { emitToUser: jest.fn() };
  const note = await notifications.deliver(
    user(),
    'shipment.status',
    {
      title: 'In transit',
      message: 'Driver departed'
    },
    io
  );

  expect(note.title).toBe('In transit');
  expect(Notification.create).toHaveBeenCalledWith(
    expect.objectContaining({
      user: 'user-1',
      category: 'tracking',
      channels: { inApp: true, push: false, email: false, sms: false },
      suppressed: false
    })
  );
  expect(NotificationDelivery.create).not.toHaveBeenCalled();
  expect(io.emitToUser).toHaveBeenCalledWith(
    'user-1',
    'notification:new',
    expect.objectContaining({ id: 'note-test' })
  );
});

test('deliver queues email and normalized SMS when the user enables them', async () => {
  await notifications.deliver(
    user({
      notificationPreferences: {
        channels: { inApp: true, email: true, sms: true }
      }
    }),
    'booking.confirmed',
    { title: 'Confirmed', message: 'Your truck is assigned' }
  );

  expect(NotificationDelivery.create).toHaveBeenCalledTimes(2);
  expect(NotificationDelivery.create).toHaveBeenCalledWith(
    expect.objectContaining({
      channel: 'email',
      recipient: 'shipper@example.com',
      nextAttemptAt: expect.any(Date)
    })
  );
  expect(NotificationDelivery.create).toHaveBeenCalledWith(
    expect.objectContaining({
      channel: 'sms',
      recipient: '+254700000000',
      nextAttemptAt: expect.any(Date)
    })
  );
});

test('deliver queues web push only when the user has enabled a subscription', async () => {
  await notifications.deliver(
    user({
      pushSubscription: {
        endpoint: 'https://push.example.com/subscription',
        keys: { p256dh: 'public-key', auth: 'auth-secret' }
      },
      notificationPreferences: {
        channels: { inApp: true, push: true }
      }
    }),
    'tracking.updated',
    { title: 'Truck moved', message: 'Your delivery is approaching', link: '/app/tracking' }
  );

  expect(NotificationDelivery.create).toHaveBeenCalledWith(
    expect.objectContaining({
      channel: 'push',
      recipient: 'https://push.example.com/subscription',
      payload: expect.objectContaining({ title: 'Truck moved', link: '/app/tracking' })
    })
  );
});

test('disabled categories create a suppressed audit record without deliveries', async () => {
  const note = await notifications.deliver(
    user({
      notificationPreferences: {
        channels: { inApp: true, email: true, sms: true },
        categories: { marketing: false }
      }
    }),
    'admin.broadcast',
    { title: 'Announcement', message: 'New feature', category: 'marketing' }
  );

  expect(note.suppressed).toBe(true);
  expect(note.suppressionReason).toContain('marketing');
  expect(NotificationDelivery.create).not.toHaveBeenCalled();
});

test('dedupe collisions do not emit or enqueue the same notification twice', async () => {
  const duplicateError = Object.assign(new Error('duplicate'), { code: 11000 });
  Notification.create.mockRejectedValueOnce(duplicateError);
  Notification.findOne.mockResolvedValueOnce({ _id: 'existing-note', title: 'Existing' });
  const io = { emitToUser: jest.fn() };

  const note = await notifications.deliver(
    user(),
    'tracking.stale',
    {
      title: 'Tracking stale',
      dedupeKey: 'tracking-stale:booking-1:2026-06-21'
    },
    io
  );

  expect(note._id).toBe('existing-note');
  expect(io.emitToUser).not.toHaveBeenCalled();
  expect(NotificationDelivery.create).not.toHaveBeenCalled();
});

test('quiet hours delay non-urgent external delivery', () => {
  const now = new Date('2026-06-21T20:30:00.000Z');
  const scheduled = notifications.nextAllowedDeliveryAt(
    now,
    {
      enabled: true,
      start: '21:00',
      end: '07:00',
      timezone: 'Africa/Nairobi',
      allowHighPriority: true
    },
    'normal'
  );

  expect(scheduled.getTime()).toBeGreaterThan(now.getTime());
  expect(
    notifications.withinQuietHours(scheduled, {
      enabled: true,
      start: '21:00',
      end: '07:00',
      timezone: 'Africa/Nairobi'
    })
  ).toBe(false);
});

test('notifyBookingParties skips empty and duplicate party ids', async () => {
  await notifications.notifyBookingParties(
    { client: user({ _id: 'same-user' }), owner: user({ _id: 'same-user' }) },
    'booking.updated',
    { title: 'Updated' }
  );
  expect(Notification.create).toHaveBeenCalledTimes(1);
});
