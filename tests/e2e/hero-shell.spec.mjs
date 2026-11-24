import { consoleLines } from '../content/expected.mjs';
import { test, expect } from '@playwright/test';

const LINES = consoleLines;
const noWebgl = () => test.info().project.name === 'chromium-nowebgl';
const hero = page => page.locator('#hero');
const posterOpacity = page => page.locator('img.hero-poster, .hero-poster img').first().evaluate(el => Number(getComputedStyle(el).opacity));

test.beforeEach(() => {
  test.skip(noWebgl() && !test.info().title.includes('[no-webgl]'), 'the no-WebGL project runs only the no-WebGL test');
  test.skip(!noWebgl() && test.info().title.includes('[no-webgl]'), 'needs the project without WebGL');
});

test('the canvas appears only after load, owns data-phase and sets data-scene', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    window.addEventListener('load', () => { window.__canvasAtLoad = document.querySelectorAll('#hero canvas').length; });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test'); // ?test: no frame-rate floor (software GL is far below it), so the scene lives to its drop
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 });
  expect(await page.evaluate(() => window.__canvasAtLoad)).toBe(0);
  const canvas = page.locator('#hero canvas.hero-canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  await expect(hero(page)).toHaveAttribute('data-phase', 'drop', { timeout: 60_000 }); // only the scene writes drop: it owns the phase while live
  expect(errors).toEqual([]);
});

test('replay on a return visit plays the intro: a new scene from the chip, the poster hidden', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1'));
  await page.goto('/?test'); // no frame-rate floor: the scene must outlive its first 2 s on software GL
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 }); // the finished state
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled');
  await page.evaluate(() => { window.__old = document.querySelector('#hero canvas.hero-canvas'); });
  await page.locator('#replay').click();
  await expect(hero(page)).toHaveAttribute('data-phase', 'chip', { timeout: 15_000 });
  expect(await page.evaluate(() => document.querySelector('#hero canvas.hero-canvas') !== window.__old)).toBe(true);
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 });
  await expect.poll(() => posterOpacity(page)).toBeLessThan(1);
});

test('replay while a scene is live disposes the old scene: one canvas, the old context released', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test'); // no frame-rate floor: the scene must outlive its first 2 s on software GL
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 });
  await page.evaluate(() => { window.__old = document.querySelector('#hero canvas.hero-canvas'); });
  await page.locator('#replay').click();
  await expect.poll(() => page.evaluate(() => {
    const now = document.querySelector('#hero canvas.hero-canvas');
    return !!now && now !== window.__old;
  }), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#hero canvas')).toHaveCount(1);
  expect(await page.evaluate(() => ({ connected: window.__old.isConnected, lost: window.__old.getContext('webgl2').isContextLost() }))).toEqual({ connected: false, lost: true });
  await expect(hero(page)).toHaveAttribute('data-scene', 'live');
  expect(errors).toEqual([]);
});

test('a failure while building the scene falls back to the poster and a complete console, no page error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    WebGL2RenderingContext.prototype.createFramebuffer = () => { throw new Error('boom'); };
  });
  await page.goto('/');
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled', { timeout: 15_000 });
  await page.waitForTimeout(500);
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  await expect.poll(() => posterOpacity(page)).toBe(1);
  expect(await page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent))).toEqual(LINES);
  expect(errors).toEqual([]);
});

test('a first visit whose scene chunk fails to load: the poster, a complete console, cooled, no page error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
  await page.goto('/');
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled', { timeout: 15_000 });
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  await expect(hero(page)).not.toHaveAttribute('data-await-melt', /.*/);
  await expect.poll(() => posterOpacity(page)).toBe(1);
  expect(await page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent))).toEqual(LINES);
  expect(errors).toEqual([]);
});

test('a first visit whose scene never arrives: after the watchdog the poster and a complete console, and the late scene never starts', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const held = [];
  await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => { held.push(route); }); // never answered (until the end)
  await page.goto('/');
  await expect(hero(page)).toHaveAttribute('data-await-melt', '');
  await expect.poll(() => held.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled', { timeout: 30_000 }); // the 12 s watchdog
  await expect.poll(() => posterOpacity(page)).toBe(1);
  expect(await page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent))).toEqual(LINES);
  for (const route of held) await route.continue(); // the chunk arrives late
  await page.waitForTimeout(4000);
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled');
  expect(errors).toEqual([]);
});

test('a return visit starts the scene at the finished state: cooled at once, embers on, the console complete and never typed', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('ironafs-intro-seen', '1');
    window.__phases = [];
    window.__typed = 0;
    window.__posterAtCanvas = null;
    window.addEventListener('DOMContentLoaded', () => {
      const h = document.getElementById('hero');
      new MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'attributes' && window.__phases.at(-1) !== h.dataset.phase) window.__phases.push(h.dataset.phase);
          for (const node of r.addedNodes ?? []) {
            if (node.nodeName === 'CANVAS') window.__posterAtCanvas = getComputedStyle(h.querySelector('img.hero-poster, .hero-poster img')).opacity;
          }
        }
      }).observe(h, { attributes: true, attributeFilter: ['data-phase'], childList: true });
      new MutationObserver(() => { window.__typed++; }).observe(document.getElementById('console-typed'), { subtree: true, childList: true, characterData: true });
    });
  });
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 });
  // the poster stayed in place until the canvas had drawn a frame
  expect(await page.evaluate(() => window.__posterAtCanvas)).toBe('1');
  await expect(page.locator('#hero canvas.hero-canvas')).toHaveCount(1);
  expect(Number(await hero(page).getAttribute('data-t-cooled'))).toBeLessThan(0.2);
  await expect.poll(async () => JSON.parse(await hero(page).getAttribute('data-embers'))[0]).toBeGreaterThan(0.5);
  expect(await hero(page).getAttribute('data-pool')).toBe('0');
  for (const y of JSON.parse(await hero(page).getAttribute('data-base'))) expect(Math.abs(y)).toBeLessThanOrEqual(0.01);
  await page.waitForTimeout(1500);
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled');
  expect(await page.evaluate(() => window.__phases.filter(p => p !== 'cooled'))).toEqual([]);
  expect(await page.evaluate(() => window.__typed)).toBe(0);
  expect(await page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent))).toEqual(LINES);
  await expect.poll(() => posterOpacity(page)).toBe(0);
  expect(errors).toEqual([]);
});

// At rest, on the 1440x900 laptop, "IronAFS" spans at least 60% of the window (the
// mockup's framing; it was 53% with the camera 20% further back), and it sits between the console and the status pill.
test('the word at rest spans at least 60% of a 1440x900 window, between the console and the status pill', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1'));
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 });
  await expect.poll(async () => JSON.parse((await hero(page).getAttribute('data-letters')) ?? '[]').length).toBe(7);
  const m = await page.evaluate(() => {
    const letters = JSON.parse(document.getElementById('hero').dataset.letters);
    return {
      left: Math.min(...letters.map(b => b[0])), right: Math.max(...letters.map(b => b[2])),
      top: Math.min(...letters.map(b => b[1])), bottom: Math.max(...letters.map(b => b[3])),
      term: document.querySelector('.term').getBoundingClientRect().bottom,
      status: document.querySelector('.hero .pill').getBoundingClientRect().top,
    };
  });
  expect((m.right - m.left) / 1440, `the word is ${Math.round(m.right - m.left)} px wide`).toBeGreaterThanOrEqual(0.6);
  expect(m.top, 'below the console').toBeGreaterThan(m.term);
  expect(m.bottom, 'above the status pill').toBeLessThanOrEqual(m.status);
});

test('reduced motion on a return visit keeps the poster: no canvas, no scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1'));
  await page.goto('/');
  await page.waitForTimeout(3000);
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled');
  expect(await posterOpacity(page)).toBe(1);
});

test('replay starts the scene on a return visit, but not under reduced motion', async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1'));
  await page.goto('/?test'); // no frame-rate floor: the scene must outlive its first 2 s on software GL
  await page.locator('#replay').click();
  await expect(hero(page)).toHaveAttribute('data-phase', 'chip', { timeout: 15_000 });
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 });
  await expect(page.locator('#hero canvas.hero-canvas')).toHaveCount(1);

  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: test.info().project.use.viewport, reducedMotion: 'reduce' });
  const reduced = await context.newPage();
  await reduced.goto('/');
  await reduced.locator('#replay').click();
  await reduced.waitForTimeout(3000);
  await expect(reduced.locator('#hero canvas')).toHaveCount(0);
  await expect(reduced.locator('#hero')).not.toHaveAttribute('data-scene', /.*/);
  await context.close();
});

test('the test hook shows the scene clock and phase times only with ?test', async ({ page }) => {
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 });
  await expect.poll(async () => Number(await hero(page).getAttribute('data-t'))).toBeGreaterThan(0.3);
  expect(await hero(page).getAttribute('data-t-chip')).not.toBeNull();
  await page.close(); // one software-GL scene at a time
  const plain = await page.context().newPage();
  await plain.goto('/');
  await expect(plain.locator('#hero')).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  expect(await plain.locator('#hero').evaluate(el => el.getAttributeNames().filter(n => n === 'data-t' || n.startsWith('data-t-')))).toEqual([]);
});

test('WEBGL_lose_context mid-intro: poster back, console complete, cooled', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test'); // no frame-rate floor: the scene must outlive its first 2 s on software GL
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const gl = document.querySelector('#hero canvas.hero-canvas').getContext('webgl2');
    gl.getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled');
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect.poll(() => posterOpacity(page)).toBe(1);
  expect(await page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent))).toEqual(LINES);
  await page.waitForTimeout(1500);
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled');
  expect(errors).toEqual([]);
});

test('the render loop stops while the hero is scrolled out of view', async ({ page }) => {
  // the scene's own frames (each sets data-t through the ?test hook), not every animation frame on the page: the
  // header's scroll handling draws frames of its own while a slow page finishes its smooth scroll
  await page.addInitScript(() => {
    window.__raf = 0;
    window.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(() => { window.__raf++; }).observe(document.getElementById('hero'), { attributes: true, attributeFilter: ['data-t'] });
    });
  });
  await page.goto('/?test'); // no frame-rate floor: the scene must outlive its first 2 s on software GL
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 15_000 });
  const count = async ms => {
    const before = await page.evaluate(() => window.__raf);
    await page.waitForTimeout(ms);
    return (await page.evaluate(() => window.__raf)) - before;
  };
  // software GL under a loaded test run can manage only a frame or two a second: poll, never one fixed window
  await expect.poll(() => count(1500), { timeout: 15_000 }).toBeGreaterThan(1);
  // past the hero's pin (the hand-off's tall scroll on desktop, the hero itself elsewhere), not only the hero's stage
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('.hero-pin').offsetHeight + 600, behavior: 'instant' }));
  await page.waitForTimeout(3000); // a frame already under way may finish (a slow runner draws one in ~1 s)
  await expect.poll(() => count(1500), { timeout: 20_000 }).toBe(0); // and it stays stopped: a quiet 1.5 s window
  const where = () => page.evaluate(() => { const r = document.querySelector('#hero canvas').getBoundingClientRect(); return `scrollY ${scrollY}, canvas ${Math.round(r.top)}..${Math.round(r.bottom)} of ${innerHeight}`; });
  expect(await count(1500), await where()).toBe(0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => count(1500), { timeout: 15_000 }).toBeGreaterThan(1);
});

test('[no-webgl] without WebGL the poster stays, no page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))).toBe(false);
  await page.goto('/');
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled', { timeout: 12_000 });
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  await expect.poll(() => posterOpacity(page)).toBe(1);
  expect(await page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent))).toEqual(LINES);
  expect(errors).toEqual([]);
});
