import { test, expect } from '@playwright/test';
import { unseenLines } from './util.mjs';

// Short windows never cut text. The enhancement needs a window at least 620 px tall (the selector
// in motion.css, mode.ts), and #design, #cost, #platforms and the hero's hand-off pin only when everything they hold
// fits their pinned stage (src/scripts/story/fit.ts, stack.ts, platforms.ts); otherwise they are in normal flow (the hero:
// the plain layout). At every size, every text line of the
// pinned sections is seen whole, opaque and on top at some scroll position.

const SECTIONS = ['hero', 'why', 'numbers', 'cost', 'platforms', 'design'];
const ALL = layout => Object.fromEntries(SECTIONS.map(id => [id, layout]));
// The expected layout of each section at each size, measured in Chromium and WebKit (both have scroll-driven
// animation in this suite and agree at every size). An engine without scroll-driven animation is all base instead.
// 1280x620: #design's text and diagram and #platforms' longest card (its lane's row) do not fit
// a 620 px stage, snug or not; #cost's cards fit snug (stack.ts), and the hero's headline block fits (below the risen
// word).
const EXPECTED = {
  '844x390': ALL('base'),
  '1280x360': ALL('base'),
  '1280x620': { hero: 'pinned', why: 'pinned', numbers: 'pinned', cost: 'pinned', platforms: 'flow', design: 'flow' },
  '1280x720': ALL('pinned'),
  '1280x800': ALL('pinned'),
  '1366x768': ALL('pinned'),
  '1440x900': ALL('pinned'),
};
const SIZES = Object.keys(EXPECTED).map(size => size.split('x').map(Number));

const enhanced = page => page.evaluate(() => CSS.supports('animation-timeline: view()')
  && matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)').matches
  && !document.documentElement.classList.contains('static'));

/** Each section's layout: base (no enhancement), flow (enhanced, but too short to pin) or pinned. */
const layouts = page => page.evaluate(ids => Object.fromEntries(ids.map(id => {
  const s = document.getElementById(id);
  // the hero: .hero-pin is the tall scroll (it takes the flow class), #hero its sticky stage
  if (id === 'hero') return [id, { flow: s.parentElement.classList.contains('story--flow'), sticky: getComputedStyle(s).position === 'sticky' }];
  const flow = id === 'cost' ? s.querySelector('.stack').classList.contains('stack--flow') : s.classList.contains('story--flow');
  const stage = getComputedStyle(s.querySelector(':scope > .stage')).position;
  const sticky = id === 'cost' ? getComputedStyle(s.querySelector('.scard')).position : stage;
  return [id, { flow, sticky: sticky === 'sticky' }];
})), SECTIONS);

for (const [width, height] of [[1440, 900], [1728, 1000]]) {
  test(`open notice clears the hero cue and platform marks at ${width}x${height}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'desktop pinned stages');
    await page.setViewportSize({ width, height });
    await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
    await page.goto('/?test');
    const notice = page.locator('[data-analytics-banner]');
    await expect(notice).toBeVisible();
    const check = async selector => {
      const marks = page.locator(selector);
      await expect(marks.first()).toBeVisible();
      const top = (await notice.boundingBox()).y;
      const boxes = await marks.evaluateAll(els => els.map(el => el.getBoundingClientRect()).filter(r => r.right > 0 && r.left < innerWidth).map(r => ({ bottom: r.bottom, x: Math.max(1, Math.min(innerWidth - 1, r.x + r.width / 2)), y: r.y + r.height / 2 })));
      expect(boxes.length).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(box.bottom).toBeLessThanOrEqual(top);
        expect(await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('[data-analytics-banner]'), box)).toBe(true);
      }
    };
    await check('.hero-cue');
    await page.locator('#platforms').scrollIntoViewIfNeeded();
    await check('#platforms .tick, #platforms .brk');
    // the axis rises with its marks: each scale break and the progress line stay on the axis line, as does
    // IronAFS's marker
    const axis = await page.evaluate(() => {
      const line = document.querySelector('#platforms .ticks').getBoundingClientRect().top;
      const centre = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
      return {
        line,
        breaks: [...document.querySelectorAll('#platforms .brk')].map(el => centre(el) - line),
        progress: centre(document.querySelector('#platforms .prog')) - line,
        marker: centre(document.querySelector('#platforms .fin .mk')) - line,
      };
    });
    expect(axis.breaks.length).toBeGreaterThan(0);
    for (const offset of [...axis.breaks, axis.progress, axis.marker]) expect(Math.abs(offset)).toBeLessThanOrEqual(3);
    expect(axis.line).toBeLessThan((await notice.boundingBox()).y);
  });
}

for (const [width, height] of SIZES) {
  test(`at ${width}x${height} every text line of the pinned sections is seen whole and on top`, async ({ page }) => {
    test.skip(page.viewportSize().width <= 760, 'a desktop browser resized: phone projects keep their own size');
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height });
    // a return visit: the console's lines are complete from the start (a first visit types them after the intro)
    await page.addInitScript(() => { localStorage.setItem('ironafs-intro-seen', '1'); localStorage.setItem('ironafs-analytics-choice-v1', '{"value":"denied"}'); });
    // ?test: no frame-rate floor. Software GL is far below it, so without ?test the live scene ends mid-walk and the
    // console is refilled (loader.ts, console.ts complete()): the text nodes unseenLines collected are then detached.
    await page.goto('/?test');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    const on = await enhanced(page);
    const layout = await layouts(page);
    const names = Object.fromEntries(Object.entries(layout).map(([id, l]) => [id, !on ? 'base' : l.flow ? 'flow' : 'pinned']));
    test.info().annotations.push({ type: 'layout', description: `${width}x${height}: ${JSON.stringify(names)}` });
    for (const [id, l] of Object.entries(layout)) {
      // the class and the computed position agree: a flow section has no sticky stage (or card)
      expect(l.sticky, `${id} sticky`).toBe(on && !l.flow);
      if (!on) expect(l.flow, `${id}: no flow class in the base layer`).toBe(false);
    }
    if (height < 620) expect(on, 'under 620 px tall: the base layer').toBe(false);
    const scrollDriven = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
    expect(names).toEqual(scrollDriven ? EXPECTED[`${width}x${height}`] : ALL('base'));

    const unseen = {};
    for (const id of SECTIONS) unseen[id] = await unseenLines(page, id === 'hero' ? '.hero-pin' : `#${id}`);
    expect(unseen).toEqual(Object.fromEntries(SECTIONS.map(id => [id, []])));
  });
}

test.describe('the fit guards', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(page.viewportSize().width <= 760, 'desktop projects');
    await page.addInitScript(() => localStorage.setItem('ironafs-analytics-choice-v1', '{"value":"denied"}'));
  });

  test('#design in flow behaves as the base layer: no tabs, no hidden or inert panel, no lines', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 620 });
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here');
    const design = page.locator('#design');
    await expect(design).toHaveClass(/story--flow/);
    await expect(design.locator('[role="tablist"]')).toBeHidden();
    expect(await design.getAttribute('data-tabs')).toBeNull();
    await expect(design.locator('[aria-hidden="true"]:is(.osp, .scene), .osp[inert], .scene[inert]')).toHaveCount(0);
    await expect(design.locator('.wires, .wl, .request-dot')).toHaveCount(0);
    await expect(design.locator('.osname')).toHaveCount(3);
    for (const os of await design.locator('.how-os').all()) await expect(os.locator('.osname')).toBeVisible();

    // grown tall enough, it pins again: tabs, one active panel, lines drawn
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(design).not.toHaveClass(/story--flow/);
    await expect(design.locator('[role="tablist"]')).toBeVisible();
    await expect(design.locator('.osp[aria-hidden="true"]')).toHaveCount(2);
    await expect(design.locator('.scene[data-drawn] svg.wires')).toHaveCount(3);
    // and back
    await page.setViewportSize({ width: 800, height: 620 });
    await expect(design).toHaveClass(/story--flow/);
    await expect(design.locator('[role="tablist"]')).toBeHidden();
    await expect(design.locator('.osp[aria-hidden], .osp[inert], .osp[role]')).toHaveCount(0);
    await expect(design.locator('.wires, .wl, .request-dot')).toHaveCount(0);
  });

  test('#platforms in flow is the vertical list: no slide, every event link visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here');
    const s = page.locator('#platforms');
    await expect(s).toHaveClass(/story--flow/);
    await expect(s.locator('.axis')).toBeHidden();
    expect(await s.locator('.evs').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    for (const a of await s.locator('.ev a').all()) {
      await a.scrollIntoViewIfNeeded();
      await expect(a).toBeInViewport();
    }
    // grown tall enough, it slides again
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(s).not.toHaveClass(/story--flow/);
    await expect(s.locator('.axis')).toBeVisible();
  });

  test('a <details> opened in #design keeps the section pinned at 1440x900 (its panel scrolls)', async ({ page }) => {
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here');
    const design = page.locator('#design');
    await expect(design).not.toHaveClass(/story--flow/);
    await page.evaluate(() => { for (const d of document.querySelectorAll('#design details')) d.open = true; });
    await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
    await expect(design).not.toHaveClass(/story--flow/);
  });
});
