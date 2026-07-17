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

test('admin payments shows revenue, provider readiness, and reconciliation in KES', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/app/admin');
  await page.getByRole('button', { name: 'Payments', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Platform revenue', exact: true })).toBeVisible();
  await expect(page.getByText(/KES\s*145\.75/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Payment readiness and exceptions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Collection reconciliation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '30-day revenue activity' })).toBeVisible();

  const readiness = page.locator('.admin-content-card', { hasText: 'Payment readiness and exceptions' });
  await expect(readiness.getByText('Bank card', { exact: true }).first()).toBeVisible();
  await expect(readiness.getByText('M-Pesa', { exact: true }).first()).toBeVisible();
  await expect(readiness.getByText('MTN MoMo', { exact: true }).first()).toBeVisible();
  await expect(readiness.getByText('Disabled until a later launch phase').first()).toBeVisible();
  await expect(page.getByText('Wallet escrow')).toHaveCount(0);

  const workflows = page.locator('.admin-content-card', { hasText: 'Payment provider workflows' });
  await workflows.getByLabel('Status').selectOption('exceptions');
  await expect(workflows.getByText('mpesa:demo:992').first()).toBeVisible();
  await expect(workflows.getByText('stripe:demo:991')).toHaveCount(0);

  await workflows.getByRole('button', { name: 'Recheck status' }).first().click();
  await expect(page.getByText('Payment status checked')).toBeVisible();

  const download = page.waitForEvent('download');
  await workflows.getByRole('button', { name: 'Export CSV' }).click();
  await expect((await download).suggestedFilename()).toMatch(/itruck-payment-reconciliation-\d{4}-\d{2}-\d{2}\.csv/);
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
