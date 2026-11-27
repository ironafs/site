import { expect, test } from '@playwright/test';
import { withoutScene } from './util.mjs';

test('[no-webgl] the Rust heading and decoder example are available at their anchor', async ({ page }, info) => {
  test.skip(!['chromium-nowebgl', 'chromium-desktop'].includes(info.project.name));
  await withoutScene(page);
  await page.goto('/#rust');
  const heading = page.getByRole('heading', { name: 'Why Rust for a network file system?' });
  await expect(heading).toBeVisible();
  await expect(heading.locator('.heading-accent')).toHaveText('Rust');
  await expect(page.locator('#rust canvas')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'An incomplete binary field' })).toBeVisible();
});
