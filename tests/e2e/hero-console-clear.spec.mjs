import { test, expect } from '@playwright/test';

// The console panel must not hide any letter, even during the melt.
// cooled: no landed letter's screen box may intersect the console's box. (A letter still falling comes from
// above the first screen and passes behind the panel by design.)
// [width, height, touch]: a touch device wider than 900 px (an iPad in landscape) is the phone tier on the desktop layout.
// The panel's width and height are asserted steady through the whole intro too: its width once followed the typed
// text (768 -> 947 px), and on Linux (advances rounded to whole pixels) a typed line wrapped and the panel grew a row
// down onto the letters.
const sizes = [[900, 800], [1000, 800], [1024, 768], [1125, 800], [1280, 800], [1440, 900], [1920, 1080], [768, 1024], [390, 844], [844, 390], [1024, 768, true], [1180, 820, true]];
// The clearance comes from the scene's framing and the CSS, not the engine: WebKit runs the two common laptop sizes
// (each size is a whole intro on software GL, minutes on CI); chromium-desktop runs them all.
const WEBKIT_SIZES = ['1280x800', '1440x900'];

// Each size is its own test group, so CI can shard this file across jobs (.github/workflows/ci.yml).
test.describe.configure({ mode: 'parallel' });

test.beforeEach(() => {
  test.skip(!['chromium-desktop', 'webkit-desktop'].includes(test.info().project.name), 'sizes are set by the test');
});

for (const [width, height, touch] of sizes) {
  test(`no landed letter goes under the console at ${width}x${height}${touch ? ' (touch)' : ''}, and the console keeps its width`, async ({ browser }) => {
    test.skip(test.info().project.name === 'webkit-desktop' && (touch || !WEBKIT_SIZES.includes(`${width}x${height}`)), 'webkit: the two laptop sizes');
    // a whole intro to cooled on software GL: 1920x1080 on a 2-core CI runner was still melting at 200 s
    test.setTimeout(480_000);
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width, height }, hasTouch: !!touch, isMobile: !!touch && test.info().project.name !== 'webkit-desktop' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => {
      window.__worst = { overlap: -Infinity, t: 0, phase: '', samples: 0, landedSeen: 0 };
      window.__termWidths = {}; // phase -> [min, max] of the panel's width
      window.__termHeights = [Infinity, -Infinity];
      window.addEventListener('DOMContentLoaded', () => {
        const h = document.getElementById('hero');
        new MutationObserver(() => {
          const term = document.querySelector('.term').getBoundingClientRect();
          const span = (window.__termWidths[h.dataset.phase] ??= [Infinity, -Infinity]);
          span[0] = Math.min(span[0], term.width);
          span[1] = Math.max(span[1], term.width);
          window.__termHeights = [Math.min(window.__termHeights[0], term.height), Math.max(window.__termHeights[1], term.height)];
          if (!h.dataset.letters) return;
          const w = window.__worst;
          w.samples++;
          for (const b of JSON.parse(h.dataset.letters)) {
            if (!b[4]) continue; // still falling
            w.landedSeen++;
            const across = Math.min(b[2], term.right) - Math.max(b[0], term.left);
            const depth = term.bottom - b[1]; // > 0: the letter's top is under the panel
            const hit = across > 0 && b[3] > term.top ? depth : -Infinity;
            if (hit > w.overlap) { w.overlap = hit; w.t = +h.dataset.t; w.phase = h.dataset.phase; }
          }
        }).observe(h, { attributes: true, attributeFilter: ['data-t'] });
      });
    });
    await page.goto('/?test');
    await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled', { timeout: 440_000 });
    if (touch) expect(JSON.parse(await page.locator('#hero').getAttribute('data-limits')).tier, 'a coarse pointer is the phone tier').toBe('phone');
    await expect(page.locator('.hero h1')).toBeVisible();
    const worst = await page.evaluate(() => window.__worst);
    expect(worst.landedSeen, 'letters were sampled').toBeGreaterThan(50);
    expect(worst.overlap, `the worst overlap (px) was at t=${worst.t} in ${worst.phase}`).toBeLessThanOrEqual(0);
    const widths = await page.evaluate(() => window.__termWidths);
    expect(Object.keys(widths), 'the panel was measured in every phase').toEqual(expect.arrayContaining(['chip', 'drop', 'melt', 'cooled']));
    const all = Object.values(widths).flat();
    expect(Math.max(...all) - Math.min(...all), `the panel's width per phase: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(0.5);
    if (width >= 900) { // the desktop layout: the panel sits over the scene and its bottom is what the letters clear
      const [low, high] = await page.evaluate(() => window.__termHeights);
      expect(high - low, `the panel's height went from ${low} to ${high} px (a typed line wrapped)`).toBeLessThanOrEqual(0.5);
    }
    expect(errors).toEqual([]);
    await context.close();
  });
}
