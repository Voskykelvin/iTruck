const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
  jest.clearAllMocks();
});

test('web push reports unconfigured state without exposing partial VAPID settings', () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  jest.doMock('web-push', () => ({
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn()
  }));

  const push = require('../services/push');
  expect(push.publicKey()).toBe('');
});

test('web push configures VAPID and returns provider delivery metadata', async () => {
  Object.assign(process.env, {
    VAPID_PUBLIC_KEY: 'public-key',
    VAPID_PRIVATE_KEY: 'private-key',
    VAPID_SUBJECT: 'mailto:ops@example.com'
  });
  const provider = {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn().mockResolvedValue({
      statusCode: 201,
      headers: { location: 'push-message-1' }
    })
  };
  jest.doMock('web-push', () => provider);

  const push = require('../services/push');
  const result = await push.sendPush(
    { endpoint: 'https://push.example.com/subscription', keys: { p256dh: 'key', auth: 'secret' } },
    { title: 'iTruck update', message: 'Shipment delivered', priority: 'high' }
  );

  expect(provider.setVapidDetails).toHaveBeenCalledWith('mailto:ops@example.com', 'public-key', 'private-key');
  expect(provider.sendNotification).toHaveBeenCalledWith(
    expect.objectContaining({ endpoint: 'https://push.example.com/subscription' }),
    expect.stringContaining('Shipment delivered'),
    { TTL: 3600, urgency: 'high' }
  );
  expect(result).toMatchObject({ provider: 'web-push', id: 'push-message-1', statusCode: 201 });
});

test('expired web push subscriptions are marked as permanent failures', async () => {
  Object.assign(process.env, {
    VAPID_PUBLIC_KEY: 'public-key',
    VAPID_PRIVATE_KEY: 'private-key',
    VAPID_SUBJECT: 'mailto:ops@example.com'
  });
  const gone = Object.assign(new Error('subscription gone'), { statusCode: 410 });
  jest.doMock('web-push', () => ({
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn().mockRejectedValue(gone)
  }));

  const push = require('../services/push');
  await expect(push.sendPush({ endpoint: 'https://push.example.com/gone' }, { title: 'Update' })).rejects.toMatchObject(
    { permanent: true }
  );
});
