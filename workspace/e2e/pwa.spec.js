import { expect, test } from '@playwright/test';

test('manifest and install assets are valid and reachable', async ({ page }) => {
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);

  const manifest = await response.json();
  expect(manifest.name).toBe('iTruck Africa');
  expect(manifest.short_name).toBe('iTruck');
  expect(manifest.start_url).toBe('/app');
  expect(manifest.display).toBe('standalone');

  for (const icon of manifest.icons) {
    const iconResponse = await page.request.get(icon.src);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
  }
});

test('service worker installs and provides the offline fallback', async ({ browserName, context, page }) => {
  test.skip(browserName !== 'chromium', 'The Android Trusted Web Activity uses Chromium service-worker behavior.');

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  try {
    await context.setOffline(true);
    await page.goto('/app/shipments');
    await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
