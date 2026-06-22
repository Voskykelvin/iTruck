import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const route of ['/app/profile', '/app/privacy', '/app/terms']) {
  test(`${route} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('#root')).not.toBeEmpty();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact))).toEqual([]);
  });
}
