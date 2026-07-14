import { expect, test } from '@playwright/test';

const mobileViewport = { width: 390, height: 844 };

async function loginAsShipper(page) {
  await page.goto('/login');
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': crypto.randomUUID()
      },
      body: JSON.stringify({
        email: 'shipper.one@example.com',
        password: 'ChangeMeUser123!',
        deviceId: crypto.randomUUID()
      })
    });
    return response.status;
  });
  expect(result).toBe(200);
}

test('mobile auth and workspace stay within the viewport and expose homepage branding', async ({ page }) => {
  await page.setViewportSize(mobileViewport);
  await page.goto('/login');

  const authBrand = page.getByRole('link', { name: 'iTruck homepage' });
  await expect(authBrand).toBeVisible();
  await expect(authBrand).toHaveAttribute('href', '/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await loginAsShipper(page);
  await page.goto('/app/shipper');
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
  await expect(page.locator('.topbar-mobile-brand')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const metrics = page.locator('.metrics-grid');
  await expect(metrics).toBeVisible();
  expect(await metrics.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});

test('settings uses calm account-access language on mobile', async ({ page }) => {
  await page.setViewportSize(mobileViewport);
  await loginAsShipper(page);
  await page.goto('/app/profile');

  await expect(page.getByRole('heading', { name: 'Account access' })).toBeVisible();
  await expect(page.getByText('Danger Zone')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
