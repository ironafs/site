import { test, expect } from '@playwright/test';
import { axeSerious } from './util.mjs';
import { afsContext } from '../../src/content/why.ts';

for (const scheme of ['light', 'dark']) {
  for (const path of ['/', '/404/']) {
    test(`axe: no serious or critical issue on ${path}, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      if (path === '/') {
        const what = page.getByRole('region', { name: afsContext.heading });
        await expect(what).toBeVisible();
        await expect(what.getByRole('link')).toHaveCount(afsContext.resources.length);
      }
      expect(await axeSerious(page)).toEqual([]);
    });
  }
}
