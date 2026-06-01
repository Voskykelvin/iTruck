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
