const runtime = require('../config/runtime');

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function clearModeEnv() {
  delete process.env.APP_MODE;
  delete process.env.LIVE_MODE;
  delete process.env.DEMO_MODE;
  delete process.env.RENDER;
  delete process.env.ALLOW_HOSTED_DEMO;
}

test('runtime defaults to demo only for local non-production processes', () => {
  clearModeEnv();
  process.env.NODE_ENV = 'test';
  expect(runtime.runtimeMode()).toBe('demo');
  expect(runtime.demoModeEnabled()).toBe(true);
});

test('hosted deployment cannot silently fall back to demo mode', () => {
  clearModeEnv();
  process.env.NODE_ENV = 'test';
  process.env.RENDER = 'true';
  expect(() => runtime.assertRuntimeConfig()).toThrow('Hosted deployments must run in live mode');
});

test('production requires live mode even when APP_MODE is misconfigured', () => {
  clearModeEnv();
  process.env.NODE_ENV = 'production';
  process.env.APP_MODE = 'demo';
  expect(() => runtime.assertRuntimeConfig()).toThrow('NODE_ENV=production requires APP_MODE=live');
});

test('live mode validates required production secrets at startup', () => {
  clearModeEnv();
  process.env.APP_MODE = 'live';
  process.env.MONGODB_URI = 'mongodb://localhost:27017/itruck-test';
  process.env.JWT_SECRET = 'x'.repeat(40);
  process.env.FRONTEND_URL = 'https://itruck.example';
  process.env.CLOUDINARY_CLOUD_NAME = 'cloud';
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';

  expect(runtime.assertRuntimeConfig()).toBe('live');
});

test('go-live check requires external provider integrations', () => {
  clearModeEnv();
  process.env.APP_MODE = 'live';
  process.env.MONGODB_URI = 'mongodb://localhost:27017/itruck-test';
  process.env.JWT_SECRET = 'x'.repeat(40);
  process.env.FRONTEND_URL = 'https://itruck.example';
  process.env.CLOUDINARY_CLOUD_NAME = 'cloud';
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';

  expect(() => runtime.assertGoLiveIntegrations()).toThrow('payments');

  process.env.STRIPE_SECRET_KEY = 'sk_test';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.AFRICASTALKING_API_KEY = 'sms-key';
  process.env.AFRICASTALKING_USERNAME = 'itruck';
  process.env.RESEND_API_KEY = 'email-key';
  process.env.EMAIL_FROM = 'iTruck <no-reply@itruck.example>';
  process.env.GOOGLE_MAPS_API_KEY = 'maps-key';

  expect(runtime.assertGoLiveIntegrations()).toBe(true);
});

test('go-live check requires callback authentication for mobile money providers', () => {
  clearModeEnv();
  process.env.APP_MODE = 'live';
  process.env.MONGODB_URI = 'mongodb://localhost:27017/itruck-test';
  process.env.JWT_SECRET = 'x'.repeat(40);
  process.env.FRONTEND_URL = 'https://itruck.example';
  process.env.CLOUDINARY_CLOUD_NAME = 'cloud';
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  process.env.MPESA_CONSUMER_KEY = 'consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'consumer-secret';
  process.env.MPESA_SHORTCODE = '174379';
  process.env.MPESA_PASSKEY = 'passkey';
  process.env.MPESA_CALLBACK_URL = 'https://itruck.example/api/payments/webhooks/mpesa/stk';
  delete process.env.MPESA_WEBHOOK_SECRET;
  delete process.env.MPESA_CALLBACK_SECRET;
  delete process.env.MPESA_CALLBACK_TOKEN;
  delete process.env.MTN_MOMO_WEBHOOK_SECRET;
  delete process.env.MOMO_WEBHOOK_SECRET;
  delete process.env.MTN_MOMO_CALLBACK_SECRET;
  delete process.env.MTN_MOMO_CALLBACK_TOKEN;
  process.env.AFRICASTALKING_API_KEY = 'sms-key';
  process.env.AFRICASTALKING_USERNAME = 'itruck';
  process.env.RESEND_API_KEY = 'email-key';
  process.env.EMAIL_FROM = 'iTruck <no-reply@itruck.example>';
  process.env.GOOGLE_MAPS_API_KEY = 'maps-key';

  expect(() => runtime.assertGoLiveIntegrations()).toThrow('callback authentication secret');

  process.env.MPESA_WEBHOOK_SECRET = 'callback-secret';
  expect(runtime.assertGoLiveIntegrations()).toBe(true);
});
