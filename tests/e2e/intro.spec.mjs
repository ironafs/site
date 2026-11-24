import { ui } from '../../src/content/ui.ts';
import { consoleLines } from '../content/expected.mjs';
import { test, expect } from '@playwright/test';
import { warmUp, withoutScene } from './util.mjs';

const LINES = consoleLines;
// These specs time the typed console alone: they run without WebGL2 (withoutScene), so no scene comes and the
// console types as soon as the page starts (with a live scene it waits for the melt: hero-shell.spec.mjs and
// hero-melt.spec.mjs cover that). The LCP and long-task budgets run on the real path, the 3D scene included.
const typed = page => page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent));

test('first visit types the four lines exactly and finishes within 8 s; the final text is in the DOM from the start', async ({ page }) => {
  await withoutScene(page);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'chip');
  expect(await page.locator('#console-sr').evaluate(el => el.textContent)).toBe(LINES.join(''));
  await page.waitForTimeout(1200);
  const mid = (await typed(page)).join('').length;
  expect(mid).toBeGreaterThan(0);
  expect(mid).toBeLessThan(LINES.join('').length);
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled', { timeout: 8000 });
  expect(await typed(page)).toEqual(LINES);
  expect(errors).toEqual([]);
});

test('the typed layer is aria-hidden and nothing is a live region', async ({ page }) => {
  await withoutScene(page);
  await page.goto('/');
  await expect(page.locator('#console-typed')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#hero [aria-live]').count()).toBe(0);
});

const watchTyped = () => {
  window.__typedMutations = 0;
  new MutationObserver(records => {
    for (const r of records) if (r.type === 'characterData' || r.removedNodes.length) if (r.target.nodeType === 1 ? r.target.closest('#console-typed') : r.target.parentElement?.closest('#console-typed')) window.__typedMutations++;
  }).observe(document, { subtree: true, childList: true, characterData: true });
  document.addEventListener('DOMContentLoaded', () => { window.__phaseAtDcl = document.getElementById('hero')?.dataset.phase; });
};
const seenFlag = () => localStorage.setItem('ironafs-intro-seen', '1');

test('reload: complete at first paint and never retyped', async ({ page }) => {
  await withoutScene(page);
  await page.goto('/');
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled');
  await page.addInitScript(watchTyped);
  await page.reload();
  expect(await typed(page)).toEqual(LINES);
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.__typedMutations)).toBe(0);
  expect(await page.evaluate(() => window.__phaseAtDcl)).toBe('cooled');
  expect(await typed(page)).toEqual(LINES);
});

test('JavaScript disabled: the poster is visible and the console is complete', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL, viewport: test.info().project.use.viewport });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled');
  expect(await typed(page)).toEqual(LINES);
  expect(await page.locator('#console-typed').evaluate(el => getComputedStyle(el).visibility)).toBe('visible');
  expect(await page.locator('.hero-poster').evaluate(el => ({ opacity: getComputedStyle(el).opacity, done: el.complete, w: el.naturalWidth }))).toEqual({ opacity: '1', done: true, w: expect.any(Number) });
  await context.close();
});

test('the module never loads: after 5 s the poster and the complete console are revealed', async ({ page }) => {
  await withoutScene(page);
  await page.route('**/_astro/*.js', route => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-intro', 'play');
  expect(await page.locator('#console-typed').evaluate(el => getComputedStyle(el).visibility)).toBe('hidden');
  await page.waitForTimeout(6000);
  expect(await page.locator('#console-typed').evaluate(el => getComputedStyle(el).visibility)).toBe('visible');
  expect(await page.locator('.hero-poster').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  expect(await typed(page)).toEqual(LINES);
  await expect(page.locator('html')).toHaveAttribute('data-intro', 'play');
});

test('first visit: the full console text is never visible before typing, and the poster waits', async ({ page }) => {
  await withoutScene(page);
  await page.addInitScript(fullLength => {
    window.__flash = false;
    window.__posterEarly = false;
    const started = performance.now();
    const tick = () => {
      const typedEl = document.getElementById('console-typed');
      const hero = document.getElementById('hero');
      const playing = document.documentElement.dataset.intro === 'play' || hero?.dataset.phase === 'chip';
      if (typedEl && hero && playing) {
        const visible = getComputedStyle(typedEl).visibility !== 'hidden';
        if (visible && typedEl.textContent.length >= fullLength && performance.now() - started < 3000) window.__flash = true;
        if (getComputedStyle(hero.querySelector('.hero-poster')).opacity !== '0') window.__posterEarly = true;
      }
      if (hero?.dataset.phase === 'cooled' && document.documentElement.dataset.intro === 'typing') return;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, LINES.join('').length);
  await page.goto('/');
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled', { timeout: 9000 });
  expect(await page.evaluate(() => window.__flash)).toBe(false);
  expect(await page.evaluate(() => window.__posterEarly)).toBe(false);
});

test('reduced motion: complete at first paint on a first visit, never retyped', async ({ page }) => {
  await withoutScene(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(watchTyped);
  await page.goto('/');
  expect(await typed(page)).toEqual(LINES);
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.__typedMutations)).toBe(0);
  expect(await page.evaluate(() => window.__phaseAtDcl)).toBe('cooled');
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled');
});

test('reduced motion turned on while the console types (no scene): it completes at once', async ({ page }) => {
  await withoutScene(page);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/');
  await expect.poll(async () => (await typed(page)).join('').length).toBeGreaterThan(0);
  expect((await typed(page)).join('').length).toBeLessThan(LINES.join('').length);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => typed(page), { timeout: 1000 }).toEqual(LINES);
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled', { timeout: 1000 });
  expect(errors).toEqual([]);
});

test('a throwing localStorage: no page errors, the intro plays and completes, replay works', async ({ page }) => {
  await withoutScene(page);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    const boom = () => { throw new Error('SecurityError'); };
    Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
  });
  await page.goto('/');
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'chip');
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled', { timeout: 9000 });
  expect(await typed(page)).toEqual(LINES);
  await page.locator('#replay').click();
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'chip');
  expect(errors).toEqual([]);
});

test('#replay restarts typing, labelled for assistive tech', async ({ page }) => {
  await withoutScene(page);
  await page.goto('/');
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled');
  const replay = page.locator('#replay');
  await expect(replay).toHaveAttribute('aria-label', ui.replay);
  const box = await replay.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await replay.click();
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'chip');
  const full = LINES.join('');
  await expect.poll(async () => {
    const partial = (await typed(page)).join('');
    return partial.length > 0 && partial.length < full.length && full.startsWith(partial);
  }).toBe(true);
  await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled');
  expect(await typed(page)).toEqual(LINES);
});

test('the poster carries width and height (no layout shift) and the console stays inside the viewport width', async ({ page }) => {
  await withoutScene(page);
  await page.goto('/');
  const poster = page.locator('#hero picture img');
  await expect(poster).toHaveAttribute('width', /\d+/);
  await expect(poster).toHaveAttribute('height', /\d+/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const font = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#console-typed')).fontSize));
  expect(font).toBeGreaterThanOrEqual(12);
});

const lcpObserver = () => {
  window.__lcp = [];
  // the element is recorded by what it is in the hero copy (its h1 id or the subline class), not only by its tag
  const role = el => !el ? '?' : el.id === 'headline' && el.closest('#hero .hero-copy') ? 'hero h1'
    : el.matches('#hero .hero-copy p.subline') ? 'hero subline' : el.tagName;
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__lcp.push({ tag: e.element?.tagName ?? '?', role: role(e.element), t: e.startTime }); })
    .observe({ type: 'largest-contentful-paint', buffered: true });
};
const phoneOnly = (browserName, info) => browserName !== 'chromium' || info.project.name !== 'chromium-phone';

// The first screen's largest paint is the hero's text, never the 3D canvas, the poster or anything outside the hero
// copy. With the headline block first on phones, the subline can be larger than the h1: either one is right.
test('first visit: the largest contentful paint on the phone profile is the hero text (h1 or subline)', async ({ page, browser, browserName }, info) => {
  test.skip(phoneOnly(browserName, info), 'LCP API: chromium phone');
  await warmUp(browser, info.project.use);
  await page.addInitScript(lcpObserver);
  await page.goto('/');
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.body.click());
  expect(['hero h1', 'hero subline']).toContain((await page.evaluate(() => window.__lcp)).at(-1).role);
});

for (const mode of ['return visit', 'reduced motion']) {
  test(`${mode}: LCP is within 2000 ms on the phone profile (4x CPU, Fast 4G), poster allowed`, async ({ page, browser, browserName }, info) => {
    test.skip(phoneOnly(browserName, info), 'LCP API: chromium phone');
    await warmUp(browser, info.project.use); // a browser that has run before (util.mjs): its first paint is not a shader compile
    if (mode === 'return visit') await page.addInitScript(seenFlag);
    else await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(lcpObserver);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await page.goto('/');
    await page.waitForTimeout(4000);
    await page.evaluate(() => document.body.click());
    const last = (await page.evaluate(() => window.__lcp)).at(-1);
    console.log(`${mode} LCP: ${last.tag} at ${Math.round(last.t)} ms`);
    expect(last.t).toBeLessThanOrEqual(2000);
  });
}
