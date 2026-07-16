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

test('homepage menu opens on mobile and exposes working destinations', async ({ page }) => {
  await page.setViewportSize(mobileViewport);
  await page.goto('/');

  const menuButton = page.getByRole('button', { name: 'Open menu' });
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  await expect(page.getByRole('link', { name: 'How It Works' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('link', { name: 'Fleet', exact: true }).click();
  await expect(page.locator('#fleet')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
});

test('signed-in mobile navigation stays available across workspace pages', async ({ page }) => {
  await page.setViewportSize(mobileViewport);
  await loginAsShipper(page);
  await page.goto('/app/book');

  const mobileNav = page.getByRole('navigation', { name: 'Primary mobile navigation' });
  await expect(mobileNav).toBeVisible();
  await mobileNav.getByRole('link', { name: 'Shipments' }).click();
  await expect(page).toHaveURL(/\/app\/shipments$/);

  const shipmentCard = page.locator('.data-table-mobile .data-table-card').first();
  await expect(shipmentCard).toBeVisible();
  await expect(shipmentCard.getByText('ID', { exact: true })).toBeVisible();
  await expect(shipmentCard.getByText('Status', { exact: true })).toBeVisible();
  await expect(shipmentCard.getByText('Route', { exact: true })).toBeVisible();
  expect(
    await shipmentCard
      .locator('.data-table-card-value')
      .first()
      .evaluate((element) => element.getBoundingClientRect().height < 40)
  ).toBe(true);

  await page.route('**/api/documents*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: [
          {
            id: 'phone-document-1',
            fileName: 'proof-of-delivery.pdf',
            documentType: 'proof_of_delivery',
            status: 'verified',
            createdAt: '2026-07-16T08:00:00.000Z',
            bookingId: 'phone-booking-1'
          }
        ]
      })
    });
  });

  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const workspaceNav = page.getByRole('complementary', { name: 'Workspace navigation' });
  await expect(workspaceNav).toBeVisible();
  await workspaceNav.getByRole('link', { name: 'Documents' }).click();
  await expect(page).toHaveURL(/\/app\/documents$/);
  await expect(workspaceNav).toHaveCount(0);
  await expect(mobileNav).toBeVisible();

  const documentCard = page.locator('.data-table-mobile .data-table-card').first();
  await expect(documentCard).toBeVisible();
  await expect(documentCard.getByText('Document Name', { exact: true })).toBeVisible();
  await expect(documentCard.getByText('Date Added', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
