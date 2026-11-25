import { ui } from '../../src/content/ui.ts';
import { test, expect } from '@playwright/test';

// The hero hand-off. On desktop with the enhancement on, the hero pins (.hero-pin is the tall
// scroll, #hero the sticky stage): the console lifts away, the live scene stays pinned while the letters rise (a CSS
// transform on the canvas and the poster, nothing inside three.js), and the headline, subline and pills arrive below
// the letters. Phones, .static and short windows keep the plain layout. ?test exposes the letters' viewport boxes
// (data-letters, measured from the canvas's getBoundingClientRect, so they already include the transform) and a
// count of drawn frames (data-frames).

const TITLE = ui.termTitle;

const isStatic = page => page.addInitScript(() => {
  const add = () => document.documentElement?.classList.add('static');
  add();
  document.addEventListener('readystatechange', add);
});
const returnVisit = page => page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1'));

const enhanced = page => page.evaluate(() => CSS.supports('animation-timeline: view()')
  && matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)').matches
  && !document.documentElement.classList.contains('static'));

const frame = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Scrolls to `f` (0..1) of the hero's pin: the stage pinned under the header, to the pin's bottom at the viewport's. */
async function pinAt(page, f) {
  await page.evaluate(f => {
    const pin = document.querySelector('.hero-pin');
    const header = document.getElementById('site-header').getBoundingClientRect().height;
    const start = pin.getBoundingClientRect().top + scrollY - header;
    const length = pin.offsetHeight - (innerHeight - header);
    scrollTo({ top: start + f * length, behavior: 'instant' });
  }, f);
  await frame(page);
}

/** The effective opacity of `selector` (the product over its ancestors), 0 when it or an ancestor is hidden. */
const shown = (page, selector) => page.evaluate(selector => {
  let opacity = 1;
  for (let a = document.querySelector(selector); a && a !== document.documentElement; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    opacity *= Number(cs.opacity);
  }
  return opacity;
}, selector);

/** The letters' union box in viewport pixels, read after the scene has drawn at least two more frames. */
async function freshLetters(page) {
  const before = Number(await page.locator('#hero').getAttribute('data-frames'));
  await expect.poll(async () => Number(await page.locator('#hero').getAttribute('data-frames')), { timeout: 15_000 }).toBeGreaterThan(before + 1);
  return page.evaluate(() => {
    const b = JSON.parse(document.getElementById('hero').dataset.letters);
    return { top: Math.min(...b.map(l => l[1])), bottom: Math.max(...b.map(l => l[3])), left: Math.min(...b.map(l => l[0])), right: Math.max(...b.map(l => l[2])) };
  });
}

async function liveScene(page) {
  await expect(page.locator('#hero')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
  await expect.poll(async () => JSON.parse((await page.locator('#hero').getAttribute('data-letters')) ?? '[]').length, { timeout: 15_000 }).toBe(7);
}

test.describe('desktop, enhanced', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(page.viewportSize().width <= 760, 'desktop projects');
    test.skip(test.info().project.name === 'chromium-nowebgl', 'needs the live scene');
  });

  test('at the top: the console and the word are visible, the h1 is transparent, the scroll cue shows', async ({ page }) => {
    await returnVisit(page);
    await page.goto('/?test');
    test.skip(!(await enhanced(page)), 'no scroll-driven animation here');
    await liveScene(page);
    await expect(page.locator('.hero-pin')).not.toHaveClass(/story--flow/);
    expect(await page.locator('#hero').evaluate(el => getComputedStyle(el).position)).toBe('sticky');
    expect(await shown(page, '.hero .term')).toBeGreaterThan(0.95);
    const letters = await freshLetters(page);
    const term = await page.locator('.hero .term').boundingBox();
    expect(letters.top, 'the word below the console').toBeGreaterThan(term.y + term.height);
    expect(letters.bottom, 'the word in the viewport').toBeLessThanOrEqual(900);
    expect(await page.locator('.hero h1').evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(0.1);
    await expect(page.locator('.hero-cue')).toBeVisible();
    await expect(page.locator('.hero-cue')).toHaveText(ui.scroll);
    expect(await shown(page, '.hero-cue')).toBeGreaterThan(0.95);
    await expect(page.locator('.term-title')).toHaveText(TITLE);
  });

  test('at 60% of the pin the h1 is opaque and below the letters; the word rose and the console is gone', async ({ page }) => {
    await returnVisit(page);
    await page.goto('/?test');
    test.skip(!(await enhanced(page)), 'no scroll-driven animation here');
    await liveScene(page);
    const atTop = await freshLetters(page);
    await pinAt(page, 0.6);
    const letters = await freshLetters(page);
    expect(letters.bottom, 'the letters rose (the transform runs with scroll)').toBeLessThan(atTop.bottom - 50);
    expect(await page.locator('.hero h1').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
    const h1 = await page.locator('.hero h1').evaluate(el => el.getBoundingClientRect().top);
    expect(h1, `h1 top ${h1} below the letters' bottom ${letters.bottom}`).toBeGreaterThan(letters.bottom);
    expect(await shown(page, '.hero .term')).toBe(0);
    expect(await shown(page, '.hero-cue')).toBe(0);

    // at the end of the pin the whole headline block is in the stage, below the letters, and opaque
    await pinAt(page, 1);
    const end = await freshLetters(page);
    for (const sel of ['.hero h1', '.hero .subline', '.hero-chips', '.hero .pill']) {
      expect(await shown(page, sel), sel).toBe(1);
      const box = await page.locator(sel).boundingBox();
      expect(box.y, `${sel} below the letters`).toBeGreaterThan(end.bottom);
      expect(box.y + box.height, `${sel} inside the viewport`).toBeLessThanOrEqual(page.viewportSize().height);
    }
    // the pills row: the status pill (first in the reading order) beside the licence chip, after the subline
    const row = await page.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      return { sub: r('.hero .subline'), pill: r('.hero .pill'), chip: r('.hero .licence-chip') };
    });
    expect(row.pill.top, 'the pill below the subline').toBeGreaterThanOrEqual(row.sub.bottom);
    expect(Math.abs((row.pill.top + row.pill.bottom) / 2 - (row.chip.top + row.chip.bottom) / 2), 'pill and chip on one row').toBeLessThan(4);
    expect(row.pill.right, 'the pill before the chip').toBeLessThanOrEqual(row.chip.left);
  });

  test('the headline block arrives below the letters at every step, never over them', async ({ page }) => {
    test.setTimeout(120_000);
    await returnVisit(page);
    await page.goto('/?test');
    test.skip(!(await enhanced(page)), 'no scroll-driven animation here');
    await liveScene(page);
    for (let f = 0; f <= 1.0001; f += 0.1) {
      await pinAt(page, f);
      const letters = await freshLetters(page);
      for (const sel of ['.hero h1', '.hero .subline', '.hero-chips', '.hero .pill']) {
        if (await shown(page, sel) < 0.05) continue;
        const top = await page.locator(sel).evaluate(el => el.getBoundingClientRect().top);
        expect(top, `${sel} at ${f.toFixed(1)}`).toBeGreaterThan(letters.bottom);
      }
    }
  });

  test('the scene is never restarted: one canvas, no return to the chip, frames keep coming', async ({ page }) => {
    // At about 0.1 s of scene time per second under software GL (hero-melt.spec.mjs),
    // the intro can take over 120 s to cool. Keep one deadline for setup, scrolling and cooling.
    test.setTimeout(180_000);
    // a first visit: the visitor scrolls during the intro, which plays on in the raised position
    await page.addInitScript(() => {
      window.__phases = [];
      document.addEventListener('DOMContentLoaded', () => {
        const hero = document.getElementById('hero');
        new MutationObserver(() => { if (window.__phases.at(-1) !== hero.dataset.phase) window.__phases.push(hero.dataset.phase); })
          .observe(hero, { attributes: true, attributeFilter: ['data-phase'] });
      });
    });
    await page.goto('/?test');
    test.skip(!(await enhanced(page)), 'no scroll-driven animation here');
    await expect(page.locator('#hero')).toHaveAttribute('data-scene', 'live', { timeout: 20_000 });
    await page.evaluate(() => { window.__canvas = document.querySelector('#hero canvas.hero-canvas'); });
    for (const f of [0.3, 0.6, 1, 0.5, 0]) {
      await pinAt(page, f);
      const before = Number(await page.locator('#hero').getAttribute('data-frames'));
      await expect.poll(async () => Number(await page.locator('#hero').getAttribute('data-frames')), { message: `frames at ${f}` }).toBeGreaterThan(before);
    }
    await pinAt(page, 0.6);
    // The intro's clock must keep moving until the scene cools.
    const readScene = () => page.locator('#hero').evaluate(hero => ({ phase: hero.dataset.phase, t: Number(hero.dataset.t) }));
    let scene = await readScene();
    while (scene.phase !== 'cooled') {
      const { t } = scene;
      await expect.poll(async () => {
        scene = await readScene();
        return scene.phase === 'cooled' || scene.t > t;
      }, { message: `the scene cools or the clock moves on from ${t}`, timeout: 30_000 }).toBe(true);
    }
    expect(await page.evaluate(() => document.querySelector('#hero canvas.hero-canvas') === window.__canvas)).toBe(true);
    await expect(page.locator('#hero canvas')).toHaveCount(1);
    const phases = await page.evaluate(() => window.__phases);
    const firstOther = phases.findIndex(p => p !== 'chip');
    expect(phases.slice(firstOther).includes('chip'), `phases ${phases.join(' > ')}`).toBe(false);
  });

  test('nothing focusable in the hero is invisible at any scroll position', async ({ page }) => {
    await returnVisit(page);
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'no scroll-driven animation here');
    for (let f = 0; f <= 1.0001; f += 0.04) {
      await pinAt(page, f);
      const faint = await page.evaluate(() => [...document.querySelectorAll('.hero-pin a[href], .hero-pin button')].filter(el => {
        if (!el.checkVisibility({ visibilityProperty: true })) return false; // not focusable
        let o = 1;
        for (let a = el; a && a !== document.documentElement; a = a.parentElement) o *= Number(getComputedStyle(a).opacity);
        return o < 0.25;
      }).map(el => el.textContent.trim().slice(0, 30) || el.getAttribute('aria-label')));
      expect(faint, `at ${f.toFixed(2)}`).toEqual([]);
    }
    // and Tab from the replay button never lands on a hidden link: at the top it leaves the hero
    await pinAt(page, 0);
    await page.locator('#replay').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.hero-copy'))).toBe(false);
  });

  test('a window too narrow for the desktop hero keeps v1\'s layout (no pin)', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'no scroll-driven animation here');
    await expect(page.locator('.hero-pin')).toHaveClass(/story--flow/);
    expect(await page.locator('#hero').evaluate(el => getComputedStyle(el).position)).not.toBe('sticky');
    expect(await shown(page, '.hero h1')).toBe(1);
    await expect(page.locator('.hero-cue')).toBeHidden();
  });

  test('a window grown back to fit pins again', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'no scroll-driven animation here');
    await expect(page.locator('.hero-pin')).toHaveClass(/story--flow/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.hero-pin')).not.toHaveClass(/story--flow/);
    expect(await page.locator('#hero').evaluate(el => getComputedStyle(el).position)).toBe('sticky');
  });
});

/** The plain layout: not pinned, the h1 opaque in the first viewport; the status pill above the h1, the licence chip after the subline. */
async function expectV1(page) {
  expect(await page.locator('#hero').evaluate(el => getComputedStyle(el).position)).not.toBe('sticky');
  expect(await shown(page, '.hero h1')).toBe(1);
  const h1 = await page.locator('.hero h1').boundingBox();
  expect(h1.y + h1.height, 'the h1 in the first viewport').toBeLessThanOrEqual(page.viewportSize().height);
  await expect(page.locator('.hero-cue')).toBeHidden();
  const order = await page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    return { h1: r('.hero h1').bottom, h1Top: r('.hero h1').top, sub: r('.hero .subline'), pill: r('.hero .pill'), chip: r('.hero .licence-chip') };
  });
  expect(order.sub.top, 'subline below the h1').toBeGreaterThanOrEqual(order.h1 - 1);
  expect(order.pill.bottom, 'status pill above the h1 (v1)').toBeLessThanOrEqual(order.h1Top + 1);
  expect(order.chip.top, 'the licence chip after the subline').toBeGreaterThanOrEqual(order.sub.bottom - 1);
}

test('phone: the console and art hold together above the copy, then release', async ({ page }) => {
  test.skip(page.viewportSize().width > 760, 'phone projects');
  await page.goto('/');
  await expect(page.locator('.hero-pin')).not.toHaveClass(/story--flow/);
  await expect(page.locator('#hero')).not.toHaveCSS('position', 'sticky');
  const intro = page.locator('.hero-intro');
  await expect(intro).toHaveCSS('position', 'sticky');
  expect(await shown(page, '.hero h1')).toBe(1);
  await expect(page.locator('.hero-cue')).toBeHidden();
  const order = await page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const notice = document.querySelector('.analytics-notice:not([hidden])');
    return {
      header: r('#site-header').bottom,
      terminal: r('#hero .term'),
      art: r('.hero-art'),
      pill: r('.hero .pill'),
      h1: r('.hero h1').top,
      clearance: notice?.getBoundingClientRect().top ?? innerHeight,
    };
  });
  expect(order.terminal.top).toBeGreaterThanOrEqual(order.header - 1);
  expect(Math.abs(order.terminal.bottom - order.art.top)).toBeLessThan(2);
  expect(order.art.bottom).toBeLessThan(order.clearance);
  expect(order.pill.top).toBeGreaterThan(order.art.bottom);
  expect(order.pill.bottom).toBeLessThanOrEqual(order.h1 + 1);
  await expect(page.locator('.term-title')).toHaveText(TITLE);

  const start = (await intro.boundingBox()).y;
  await page.evaluate(() => scrollTo({ top: 86, behavior: 'instant' }));
  await expect.poll(async () => Math.abs((await intro.boundingBox()).y - start)).toBeLessThan(2);
  await page.evaluate(() => scrollTo({ top: 220, behavior: 'instant' }));
  await expect.poll(async () => (await intro.boundingBox()).y).toBeLessThan(start - 40);
});

test('phone: enabling the intro hold leaves the copy in place', async ({ page }) => {
  test.skip(page.viewportSize().width > 760, 'phone projects');
  let resume;
  const delayed = new Promise(resolve => { resume = resolve; });
  await page.route('**/_astro/Hero.astro_astro_type_script_index_0_lang.*.js', async route => {
    await delayed;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  const intro = page.locator('.hero-intro');
  const copyGap = () => page.locator('.hero-copy').evaluate(el =>
    el.getBoundingClientRect().top - document.querySelector('.hero-intro').getBoundingClientRect().bottom);
  let before;
  try {
    await expect(page.locator('.hero-art')).toHaveCSS('position', 'relative');
    await expect(intro).toHaveCSS('position', 'static');
    before = await copyGap();
  } finally {
    resume();
  }
  await expect(intro).toHaveCSS('position', 'sticky');
  expect(Math.abs(await copyGap() - before)).toBeLessThan(1);
});

test('phone: the intro scrolls normally in short landscape and under reduced motion', async ({ page }) => {
  test.skip(page.viewportSize().width > 760, 'phone projects');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await expect(page.locator('.hero-intro')).toHaveCSS('position', 'static');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.hero-intro')).toHaveCSS('position', 'static');
});

test('.static: the h1 is visible at the top, in v1\'s layout', async ({ page }) => {
  test.skip(page.viewportSize().width <= 760, 'desktop projects');
  await isStatic(page);
  await page.goto('/');
  await expectV1(page);
  await expect(page.locator('.term-title')).toHaveText(TITLE);
});

test('reduced motion: the h1 is visible at the top, in v1\'s layout', async ({ page }) => {
  test.skip(page.viewportSize().width <= 760, 'desktop projects');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expectV1(page);
});
