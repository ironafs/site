import { consoleLines } from '../content/expected.mjs';
import { test, expect } from '@playwright/test';

// The phone tier: lighter effects, a frame-rate fallback, and reduced motion keeping the poster.
// Run on the phone projects. ?test shows the limits (data-limits) and turns the frame-rate watchdog off (software
// GL is far below 30 fps); ?test&fps=30 turns it on.
const LINES = consoleLines;
const hero = page => page.locator('#hero');
const posterOpacity = page => page.locator('img.hero-poster, .hero-poster img').first().evaluate(el => Number(getComputedStyle(el).opacity));

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'chromium-phone', 'the phone tier runs on the chromium phone profile');
});

test.describe('the limits', () => {
  test.use({ deviceScaleFactor: 3 });
  test('pixel ratio <= 1.5, embers <= 120, fire <= 400, no haze pass, a 1024 shadow map', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('/?test');
    expect(await page.evaluate(() => devicePixelRatio)).toBe(3);
    await expect(hero(page)).toHaveAttribute('data-limits', /.+/, { timeout: 30_000 });
    const limits = JSON.parse(await hero(page).getAttribute('data-limits'));
    expect(limits.tier).toBe('phone');
    expect(limits.dpr).toBeLessThanOrEqual(1.5);
    expect(limits.embers).toBeLessThanOrEqual(120);
    expect(limits.fire).toBeLessThanOrEqual(400);
    expect(limits.haze).toBe(false);
    expect(limits.shadow).toBe(1024);
    expect(await hero(page).getAttribute('data-fps-floor'), 'phones keep the 30 fps floor').toBe('30');
    expect(errors).toEqual([]);
  });
});

test('a coarse pointer is a phone even on a wide screen (tierFor)', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1100, height: 800 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/?test');
  await expect(page.locator('#hero')).toHaveAttribute('data-limits', /.+/, { timeout: 30_000 });
  expect(JSON.parse(await page.locator('#hero').getAttribute('data-limits')).tier).toBe('phone');
  await context.close();
});

// A device below its floor, made certain: a floor no display reaches (?test&fps=1000), so the watchdog's verdict never
// depends on the host. No CPU throttling: the 40x startup throttle it used to carry made the first
// frame late enough on a loaded 2-core runner that the loader's 12 s load watchdog (loader.ts WATCHDOG_MS) ended the
// intro first, and the test then failed on `live` (CI runs 44861742608 and 44861720720); the forced floor alone
// guarantees a result below it.
test('the frame-rate watchdog: a scene below its floor stops, the poster shows and the console completes', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__live = null;
    window.__ended = null;
    window.addEventListener('DOMContentLoaded', () => {
      const h = document.getElementById('hero');
      new MutationObserver(() => {
        if (h.dataset.scene === 'live' && window.__live === null) window.__live = performance.now();
        if (window.__live !== null && window.__ended === null && h.dataset.scene !== 'live') window.__ended = performance.now();
      }).observe(h, { attributes: true, attributeFilter: ['data-scene'] });
    });
  });
  await page.goto('/?test&fps=1000');
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled', { timeout: 60_000 });
  const { live, ended } = await page.evaluate(() => ({ live: window.__live, ended: window.__ended }));
  expect(live, 'the scene went live (the watchdog, not the load watchdog, ended it)').not.toBeNull();
  expect(ended, 'the scene ended').not.toBeNull();
  // the 2 s window opens once the idle warm-up compile has resolved (a link hitch there is no verdict on the frame
  // rate): at most the idle wait (1 s) + the compile's cap (3 s, scene.ts WARM_TIMEOUT_MS) + the window (2 s), and
  // the timer slack of a busy main thread
  expect(ended - live, 'the scene stopped within 8 s of its first frame (the warm-up compile and the 2 s window)').toBeLessThan(8000);
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  await expect.poll(() => posterOpacity(page)).toBe(1);
  await expect(page.locator('#console-typed .line')).toHaveCount(LINES.length);
  expect(await page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent))).toEqual(LINES);
  expect(errors).toEqual([]);
});

test('a healthy frame rate keeps the scene (the watchdog does not fire on a device that holds its floor)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  test.setTimeout(150_000);
  // a floor the machine holds: ~90 fps on a laptop, but under 10 fps on a 2-core CI runner (software GL)
  await page.goto('/?test&fps=1');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await expect.poll(async () => Number(await hero(page).getAttribute('data-t')), { timeout: 100_000 }).toBeGreaterThan(4); // past the 2 s window
  await expect(hero(page)).toHaveAttribute('data-scene', 'live');
  await expect(page.locator('#hero canvas.hero-canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('reduced motion on a first visit: no canvas, no scene code, the poster and a complete console', async ({ page }) => {
  const errors = [];
  const requests = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => requests.push(r.url()));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?test');
  await page.waitForTimeout(4000);
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  expect(requests.filter(u => /three|scene|stage/i.test(u))).toEqual([]);
  await expect.poll(() => posterOpacity(page)).toBe(1);
  expect(await page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent))).toEqual(LINES);
  expect(errors).toEqual([]);
});
