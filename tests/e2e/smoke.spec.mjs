import { test, expect } from '@playwright/test';

const csp = "default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self'; img-src 'self' data: https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com; font-src 'self'; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

test('the page loads with the policy headers and no CSP violation', async ({ page }) => {
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', event => window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toBe(csp);
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
  await expect(page.locator('main#main')).toBeVisible();
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});

test('a missing page gets 404.html with the same CSP', async ({ page }) => {
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  expect(response?.headers()['content-security-policy']).toBe(csp);
});
