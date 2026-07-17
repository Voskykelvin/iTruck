import { expect, test } from '@playwright/test';

async function loginAsAdmin(page) {
  await page.goto('/login');
  const response = await page.evaluate(async () => {
    const result = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': crypto.randomUUID()
      },
      body: JSON.stringify({
        email: 'admin@itruck.africa',
        password: 'ChangeMeAdmin123!',
        deviceId: crypto.randomUUID()
      })
    });
    return result.status;
  });
  expect(response).toBe(200);
}

test('admin operations separates vehicle and people verification queues', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/app/admin');

  await expect(page.getByRole('heading', { name: 'Admin Console' })).toBeVisible();
  await page.getByRole('button', { name: 'Verification', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verification center' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Vehicles/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /People/ })).toBeVisible();
  await expect(page.getByRole('table').getByText('TRK 001')).toBeVisible();

  await page.getByRole('button', { name: 'Review' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Review vehicle' })).toBeVisible();
  await expect(page.getByText('Submitted evidence')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('tab', { name: /People/ }).click();
  await expect(page.getByRole('table').getByText('Platform Admin')).toBeVisible();
});

test('admin operations remains usable on a phone and reports offline state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await page.goto('/app/admin');
  await expect(page.getByRole('heading', { name: 'Admin Console' })).toBeVisible();
  await expect(page.locator('.admin-section-nav')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('.network-status.is-offline').first()).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.network-status.is-online').first()).toBeVisible();
});
