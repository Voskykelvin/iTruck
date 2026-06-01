const sms = require('../services/sms');

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  sms.setSmsProvider(new sms.QueuedSmsProvider());
});

test('normalizes local Kenyan phone numbers for SMS providers', () => {
  expect(sms.normalizePhoneNumber('0712 345 678')).toBe('+254712345678');
  expect(sms.normalizePhoneNumber('+233200000000')).toBe('+233200000000');
});

test('africas talking provider sends urlencoded SMS requests', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ SMSMessageData: { Recipients: [] } })
  }));

  const provider = new sms.AfricasTalkingSmsProvider({
    apiKey: 'sms-key',
    username: 'sandbox',
    baseUrl: 'https://sms.example'
  });

  const result = await provider.send({ to: '0712345678', message: 'Booking confirmed' });
  const [, options] = global.fetch.mock.calls[0];

  expect(result.provider).toBe('africastalking');
  expect(global.fetch).toHaveBeenCalledWith(
    'https://sms.example/version1/messaging',
    expect.objectContaining({ method: 'POST' })
  );
  expect(options.body.get('to')).toBe('+254712345678');
  expect(options.body.get('message')).toBe('Booking confirmed');
  expect(options.headers.apiKey).toBe('sms-key');
});
