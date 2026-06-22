import { expect, test } from '@playwright/test';

test('workspace serves secure sign-in and health endpoints', async ({ page, request }) => {
  const pageErrors = [];
  const authRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (record) => {
    if (record.url().includes('/api/auth/')) authRequests.push(record.url());
  });
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  const response = await page.goto('/app/profile');
  expect(response?.ok()).toBeTruthy();
  await page.waitForTimeout(1000);
  expect(pageErrors).toEqual([]);
  expect(authRequests).toHaveLength(0);
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByRole('heading', { name: 'iTruck Workspace', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});

test('browser sessions use HttpOnly access cookies without localStorage tokens', async ({ page, context }) => {
  await page.goto('/app/profile');
  const login = await page.evaluate(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': crypto.randomUUID()
      },
      body: JSON.stringify({
        email: 'owner.one@example.com',
        password: 'ChangeMeUser123!',
        deviceId: crypto.randomUUID()
      })
    });
    return { status: response.status, body: await response.json() };
  });
  expect(login).toMatchObject({ status: 200, body: { user: { role: 'owner' } } });

  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === 'itruck_access')?.httpOnly).toBe(true);
  expect(cookies.some((cookie) => cookie.name === 'itruck_csrf')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('itruck_token'))).toBeNull();
});
