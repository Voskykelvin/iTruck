import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5000',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm --prefix ../backend start',
    url: 'http://127.0.0.1:5000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LIVE_MODE: 'false',
      DEMO_MODE: 'true',
      JWT_SECRET: 'playwright-secret',
      FRONTEND_URL: 'http://127.0.0.1:5000',
      ALLOWED_ORIGINS: 'http://127.0.0.1:5000',
      REDIS_URL: '',
      PORT: '5000'
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ]
});
