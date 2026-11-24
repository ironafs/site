import { test, expect } from '@playwright/test';

// The 3D Rust word: "Rust" in three.js inside #rust's
// .rust-word[data-3d-host], with the hero's steel and rust materials, rusting with #rust's scroll progress. It starts
// near the section and stops (freeing its renderer) after it; it never renders while the hero renders; on a lost
// context, a frame rate below the floor, reduced motion, a phone or no WebGL, the CSS word stays in its place.
// Software GL (SwiftShader) is slow: every wait polls, never one fixed window.

const project = () => test.info().project.name;
const host = page => page.locator('#rust .rust-word[data-3d-host]');
const canvas = page => page.locator('#rust .rust-word[data-3d-host] canvas');
const frames = (page, selector) => page.locator(selector).evaluate(el => Number(el.dataset.frames || 0));
const cssWordShown = page => page.locator('#rust .rw-css').evaluate(el => getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none' && Number(getComputedStyle(el).opacity) > 0);
const pageErrors = page => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  return errors;
};

/** Scrolls to `f` (0..1) of #rust's pinned scroll: its top at the viewport's top to its bottom at the bottom. */
async function rustAt(page, f) {
  await page.evaluate(async f => {
    const s = document.getElementById('rust');
    const top = s.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + f * (s.offsetHeight - innerHeight), behavior: 'instant' });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, f);
}
/** Scrolls to the page's top and waits for two frames there, as rustAt does: the hero, back on screen, may build its
 * scene in long tasks first, and the word's stop comes only once the page has drawn the new scroll position. */
async function toTop(page) {
  await page.evaluate(async () => {
    scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/** The 3D word is live: one canvas in the host, .has-3d, the CSS word hidden. */
async function expectLive(page) {
  await expect(canvas(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(host(page)).toHaveClass(/\bhas-3d\b/, { timeout: 20_000 });
  await expect.poll(() => cssWordShown(page)).toBe(false);
}
/** The CSS word holds the place: no canvas, no .has-3d, the CSS word visible. */
async function expectCssWord(page, timeout = 10_000) {
  await expect(canvas(page)).toHaveCount(0, { timeout });
  await expect(host(page)).not.toHaveClass(/\bhas-3d\b/);
  await expect.poll(() => cssWordShown(page)).toBe(true);
}

test.describe('the 3D word runs (chromium-desktop)', () => {
  test.beforeEach(() => {
    test.skip(project() !== 'chromium-desktop', 'loader and scene logic on SwiftShader: chromium-desktop');
  });

  test('scrolling to #rust mounts one canvas and .has-3d, frames advance; back at #top it is gone', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = pageErrors(page);
    await page.goto('/?test');
    await expect(canvas(page), 'nothing before the section is near').toHaveCount(0);
    await rustAt(page, 0.1);
    await expectLive(page);
    await expect(canvas(page)).toHaveAttribute('aria-hidden', 'true');
    const before = await frames(page, '#rust .rust-word');
    await expect.poll(() => frames(page, '#rust .rust-word'), { timeout: 20_000 }).toBeGreaterThan(before);
    // the canvas sits over the CSS word's box (the 3D word takes its place, not the whole column)
    const boxes = await page.evaluate(() => {
      const r = el => { const b = document.querySelector(el).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      return { word: r('#rust .rw-css'), canvas: r('#rust .rust-word canvas') };
    });
    expect(boxes.canvas.l).toBeLessThanOrEqual(boxes.word.l + 1);
    expect(boxes.canvas.r).toBeGreaterThanOrEqual(boxes.word.r - 1);
    expect(boxes.canvas.t).toBeLessThanOrEqual(boxes.word.t + 1);
    expect(boxes.canvas.b).toBeGreaterThanOrEqual(boxes.word.b - 1);
    await toTop(page);
    await expectCssWord(page, 10_000);
    expect(errors).toEqual([]);
  });

  test('it comes back when the section is reached again', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?test');
    await rustAt(page, 0.1);
    await expectLive(page);
    await toTop(page);
    await expectCssWord(page);
    await rustAt(page, 0.2);
    await expectLive(page);
  });

  test('while the Rust word renders, the hero renders nothing (its data-frames holds for 2 s)', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1')); // a return visit: the hero is live at once
    await page.goto('/?test');
    await expect(page.locator('#hero')).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
    await expect.poll(() => frames(page, '#hero'), { timeout: 20_000 }).toBeGreaterThan(0);
    await rustAt(page, 0.1);
    await expectLive(page);
    await expect.poll(() => frames(page, '#rust .rust-word'), { timeout: 20_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1500); // a hero frame already under way may finish
    const hero0 = await frames(page, '#hero');
    const rust0 = await frames(page, '#rust .rust-word');
    await page.waitForTimeout(2000);
    expect(await frames(page, '#hero'), 'the hero is paused off screen').toBe(hero0);
    await expect.poll(() => frames(page, '#rust .rust-word'), { timeout: 20_000 }).toBeGreaterThan(rust0);
  });

  test('the rust amount follows #rust\'s scroll progress: 0 -> 1 over its first 40%', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?test');
    await rustAt(page, 0);
    await expectLive(page);
    const amount = () => host(page).evaluate(el => Number(el.dataset.rust));
    await expect.poll(amount, { timeout: 20_000 }).toBeCloseTo(0, 1);
    await rustAt(page, 0.2);
    await expect.poll(amount, { timeout: 20_000 }).toBeCloseTo(0.5, 1);
    await rustAt(page, 0.5);
    await expect.poll(amount, { timeout: 20_000 }).toBeCloseTo(1, 1);
  });

  test('?test&rwfloor=force: below the floor, the CSS word returns and the 3D word stays away', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = pageErrors(page);
    await page.goto('/?test&rwfloor=force');
    await rustAt(page, 0.1);
    await expect(host(page)).toHaveAttribute('data-rw-end', 'floor', { timeout: 30_000 });
    await expectCssWord(page);
    await toTop(page);
    await rustAt(page, 0.2);
    await page.waitForTimeout(3000);
    await expectCssWord(page, 1000);
    expect(errors).toEqual([]);
  });

  test('a lost WebGL context: the CSS word returns', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = pageErrors(page);
    await page.goto('/?test');
    await rustAt(page, 0.1);
    await expectLive(page);
    await canvas(page).evaluate(c => c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await expect(host(page)).toHaveAttribute('data-rw-end', 'context', { timeout: 10_000 });
    await expectCssWord(page);
    expect(errors).toEqual([]);
  });

  test('a window too short for #rust pinned (flow): the word stops and the CSS word stands at its final state; grown back, it returns', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?test');
    await rustAt(page, 0.1);
    await expectLive(page);
    // 1280x620: #rust does not fit its pinned stage (fit.ts) and is in flow, the base layer
    await page.setViewportSize({ width: 1280, height: 620 });
    await expect(page.locator('#rust')).toHaveClass(/story--flow/);
    await page.locator('#rust .rust-word').scrollIntoViewIfNeeded();
    await expectCssWord(page);
    // the CSS word at its final state: fully rusted (the base layer's radii), no sheen
    const word = await page.locator('#rust .rw-css').evaluate(el => ({
      r1: getComputedStyle(el, '::after').getPropertyValue('--r1').trim(),
      sheen: getComputedStyle(el, '::before').content,
    }));
    expect(word).toEqual({ r1: '80%', sheen: 'none' });
    // it stays away while the word is on screen in flow
    await page.waitForTimeout(1500);
    await expect(canvas(page)).toHaveCount(0);
    // grown back: pinned, and the 3D word returns
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('#rust')).not.toHaveClass(/story--flow/);
    await rustAt(page, 0.1);
    await expectLive(page);
  });

  test('reduced motion: never a canvas', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?test');
    await rustAt(page, 0.1);
    await page.waitForTimeout(4000);
    await expectCssWord(page, 1000);
  });

  test('reduced motion turned on while it runs: it stops and the CSS word returns', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?test');
    await rustAt(page, 0.1);
    await expectLive(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectCssWord(page, 20_000);
  });
});

test('a phone viewport: never a canvas', async ({ page }) => {
  test.skip(!project().endsWith('-phone'), 'the phone projects');
  test.setTimeout(60_000);
  await page.goto('/?test');
  await rustAt(page, 0.1);
  await page.waitForTimeout(4000);
  await expect(canvas(page)).toHaveCount(0);
  await expect(host(page)).not.toHaveClass(/\bhas-3d\b/);
});

test('[no-webgl] without WebGL: never a canvas, the CSS word, no page errors', async ({ page }) => {
  test.skip(project() !== 'chromium-nowebgl', 'needs the project without WebGL');
  test.setTimeout(60_000);
  const errors = pageErrors(page);
  await page.goto('/?test');
  expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))).toBe(false);
  await rustAt(page, 0.1);
  await page.waitForTimeout(4000);
  await expectCssWord(page, 1000);
  expect(errors).toEqual([]);
});
