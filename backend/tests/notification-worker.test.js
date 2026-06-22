jest.mock('../models/NotificationDelivery', () => ({
  findOneAndUpdate: jest.fn()
}));
jest.mock('../models/WorkerLease', () => ({
  findOneAndUpdate: jest.fn()
}));
jest.mock('../config/runtime', () => ({
  mongoReady: jest.fn(() => true)
}));
jest.mock('../models/User', () => ({
  findById: jest.fn(),
  updateOne: jest.fn()
}));

const NotificationDelivery = require('../models/NotificationDelivery');
const WorkerLease = require('../models/WorkerLease');
const User = require('../models/User');
const { acquireLease, processDelivery, processPendingDeliveries } = require('../services/notificationWorker');

function delivery(overrides = {}) {
  return {
    _id: 'delivery-1',
    channel: 'email',
    recipient: 'user@example.com',
    payload: { subject: 'Update', text: 'Hello' },
    status: 'processing',
    attempts: 1,
    maxAttempts: 4,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('notification worker sends web push through the stored subscription', async () => {
  const select = jest.fn().mockResolvedValue({
    pushSubscription: {
      endpoint: 'https://push.example.com/subscription',
      keys: { p256dh: 'public-key', auth: 'auth-secret' }
    }
  });
  User.findById.mockReturnValue({ select });
  const item = delivery({ channel: 'push', user: 'user-1', recipient: 'https://push.example.com/subscription' });
  const sendPush = jest.fn().mockResolvedValue({ provider: 'web-push', id: 'push-1' });

  const result = await processDelivery(item, { sendPush });

  expect(result.status).toBe('sent');
  expect(sendPush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: item.recipient }), item.payload);
  expect(item.providerMessageId).toBe('push-1');
});

test('notification worker records successful provider delivery', async () => {
  const item = delivery();
  const result = await processDelivery(item, {
    sendMail: jest.fn().mockResolvedValue({ provider: 'resend', id: 'email-1' })
  });

  expect(result.status).toBe('sent');
  expect(item.status).toBe('sent');
  expect(item.provider).toBe('resend');
  expect(item.providerMessageId).toBe('email-1');
  expect(item.save).toHaveBeenCalled();
});

test('notification worker schedules exponential retries', async () => {
  const now = new Date('2026-06-21T12:00:00.000Z');
  const item = delivery({ attempts: 2 });
  const result = await processDelivery(
    item,
    { sendMail: jest.fn().mockRejectedValue(new Error('provider unavailable')) },
    now
  );

  expect(result.status).toBe('retry');
  expect(item.nextAttemptAt).toEqual(new Date(now.getTime() + 5 * 60_000));
  expect(item.lastError).toContain('provider unavailable');
});

test('notification worker permanently fails exhausted deliveries', async () => {
  const item = delivery({ channel: 'sms', attempts: 4, maxAttempts: 4 });
  const result = await processDelivery(item, {
    sendSMS: jest.fn().mockRejectedValue(new Error('recipient rejected'))
  });

  expect(result.status).toBe('failed');
  expect(item.status).toBe('failed');
  expect(item.failedAt).toBeInstanceOf(Date);
});

test("notification worker records Africa's Talking message ids", async () => {
  const item = delivery({ channel: 'sms' });
  await processDelivery(item, {
    sendSMS: jest.fn().mockResolvedValue({
      provider: 'africastalking',
      response: {
        SMSMessageData: {
          Recipients: [{ messageId: 'ATXid_123' }]
        }
      }
    })
  });

  expect(item.providerMessageId).toBe('ATXid_123');
});

test('worker lease acquisition returns false on a competing unique lease', async () => {
  WorkerLease.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
  await expect(acquireLease('scan', 60_000)).resolves.toBe(false);
});

test('worker processes claimed deliveries and reports batch totals', async () => {
  const item = delivery();
  NotificationDelivery.findOneAndUpdate.mockResolvedValueOnce(item).mockResolvedValueOnce(null);

  await expect(
    processPendingDeliveries({
      force: true,
      limit: 5,
      providers: {
        sendMail: jest.fn().mockResolvedValue({ provider: 'resend', id: 'email-2' })
      }
    })
  ).resolves.toEqual({ processed: 1, sent: 1, failed: 0, retried: 0 });
  expect(item.attempts).toBe(1);
  expect(item.status).toBe('sent');
});

test('worker lease acquisition succeeds for the current owner', async () => {
  WorkerLease.findOneAndUpdate.mockImplementation((_filter, update) => Promise.resolve({ owner: update.$set.owner }));
  const lease = await acquireLease('scan', 60_000);
  expect(lease).toBe(true);
  expect(WorkerLease.findOneAndUpdate).toHaveBeenCalled();
});
