import { story } from '../../src/content/story.ts';
import { test, expect } from '@playwright/test';
import { allowFrames } from './util.mjs';

// The crash (#why) and the numbers (#numbers).

const isStatic = page => page.addInitScript(() => {
  const add = () => document.documentElement?.classList.add('static');
  add();
  document.addEventListener('readystatechange', add);
});

/** Scrolls to `f` (0..1) of a pinned section's pinned scroll: its top at the viewport's top to its bottom at the bottom. */
async function pinnedAt(page, id, f) {
  allowFrames(8); // at least three still frames and the jump's, two requestAnimationFrame callbacks each
  await page.evaluate(async ({ id, f }) => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    // a smooth scroll still under way (html is scroll-behavior: smooth; a Tab's focus scroll) can carry the page on
    // after an instant jump: wait until the page holds still, then jump, and jump again until it stays there (as
    // story-rust.spec.mjs does)
    for (let last = NaN, still = 0; still < 3; still = scrollY === last ? still + 1 : 0) { last = scrollY; await frame(); }
    const s = document.getElementById(id);
    const target = Math.round(s.getBoundingClientRect().top + scrollY + f * (s.offsetHeight - innerHeight));
    for (let i = 0; i < 10; i++) {
      scrollTo({ top: target, behavior: 'instant' });
      await frame();
      if (Math.abs(scrollY - target) <= 1) break;
    }
  }, { id, f });
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

const enhanced = page => page.evaluate(() => CSS.supports('animation-timeline: view()')
  && matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)').matches
  && !document.documentElement.classList.contains('static'));

test.describe('base layer', () => {
  test.beforeEach(async ({ page }) => {
    await isStatic(page);
    await page.goto('/');
  });

  test('#why is the restart screen at 100%, followed by the kernel fault explanation', async ({ page }) => {
    const crash = page.locator('#why .crash');
    await expect(crash).toHaveCount(1);
    await crash.scrollIntoViewIfNeeded();
    await expect(crash.getByText(story.crash.message)).toBeVisible();
    await expect(crash.locator('.pct')).toHaveText(100 + story.crash.progressSuffix);
    await expect(crash.locator('.pct')).toBeVisible();
    await expect(crash.locator('.code')).toHaveText('Stop code: PAGE_FAULT_IN_NONPAGED_AREA (0x50)');
    await expect(crash).not.toContainText('What failed');
    const consequence = page.locator('#why > .stage > .crash-point');
    await expect(consequence).toHaveText('A fault in kernel code takes the whole machine down with it.');
    await consequence.scrollIntoViewIfNeeded();
    await expect(consequence).toBeInViewport();
    await expect(consequence).toBeVisible();
    const [screenBox, pointBox] = await Promise.all([crash.boundingBox(), consequence.boundingBox()]);
    expect(pointBox.y).toBeGreaterThan(screenBox.y + screenBox.height);
    expect(pointBox.x + pointBox.width / 2).toBeCloseTo(screenBox.x + screenBox.width / 2, 0);
    await expect(page.locator('#why + #numbers')).toHaveCount(1);
  });

  test('#numbers shows both numbers, each with its definition and one source link in its block', async ({ page }) => {
    await expect(page.locator('#numbers h2')).toHaveText('Driver failures in numbers.');
    const blocks = {
      crowdstrike: ['≈8.5M', 'Windows devices affected by the CrowdStrike outage of 19 July 2024'],
      'stop-errors': ['70%', story.numbers.stats[1].what],
    };
    for (const [id, [value, what]] of Object.entries(blocks)) {
      const block = page.locator(`#numbers [data-stat="${id}"]`);
      await expect(block).toHaveCount(1);
      await block.scrollIntoViewIfNeeded();
      await expect(block.locator('.big')).toHaveText(value);
      await expect(block.locator('.big')).toBeVisible();
      await expect(block.getByText(what)).toBeVisible();
      await expect(block.locator('a.source')).toHaveCount(1);
      await expect(block.locator('a.source')).toHaveAttribute('href', /^https:\/\//);
    }
  });
});

test.describe('enhancement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here: the base layer is the contract');
  });

  test('#why: with the analytics notice open, the stop-code readout stays above it at 620 px tall', async ({ page }) => {
    await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here: the base layer is the contract');
    const notice = page.locator('[data-analytics-banner]');
    await expect(notice).toBeVisible();
    await pinnedAt(page, 'why', 0.3);
    const top = (await notice.boundingBox()).y;
    const [code, pct] = await Promise.all(['#why .code', '#why .pct'].map(selector => page.locator(selector).boundingBox()));
    expect(code.y + code.height).toBeLessThanOrEqual(top);
    expect(code.y).toBeGreaterThanOrEqual(pct.y + pct.height);
  });

  test('#why counts and holds, switches off to a line and dot, then holds the centred explanation', async ({ page }) => {
    const sectionHeight = await page.locator('#why').evaluate(el => el.offsetHeight / innerHeight);
    expect(sectionHeight).toBeCloseTo(1.6, 2);
    await pinnedAt(page, 'why', 0.05);
    expect(await shown(page, '#why .msg')).toBeGreaterThan(0.95);
    const box = await page.locator('#why .msg').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));

    const pct = () => page.evaluate(() => Number(getComputedStyle(document.querySelector('#why .pct-n')).getPropertyValue('--p')));
    // The count finishes in the first 20vh of the 60vh sticky range.
    await pinnedAt(page, 'why', -0.2);
    expect(await pct(), 'before the hold').toBe(0);
    await pinnedAt(page, 'why', 0);
    expect(await pct(), 'at the start of the hold').toBeLessThanOrEqual(5);
    await pinnedAt(page, 'why', 0.17);
    const p = await pct();
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(100);
    await pinnedAt(page, 'why', 0.35);
    expect(await pct(), 'after the count').toBe(100);
    await pinnedAt(page, 'why', 0.43);
    expect(await pct(), 'just before the collapse').toBe(100);
    expect(await page.evaluate(() => Number(getComputedStyle(document.querySelector('#why .bsod')).opacity))).toBeGreaterThan(0.95);

    const bsod = page.locator('#why .bsod');
    const fullScreen = await bsod.boundingBox();
    const line = page.locator('#why .crt-line');
    const point = page.locator('#why .crash-point');
    await expect(page.locator('#why .flash')).toHaveCount(0);
    await pinnedAt(page, 'why', 0.52);
    const screen = await bsod.boundingBox();
    expect(screen.height).toBeLessThan(fullScreen.height / 2);
    expect(screen.width).toBeCloseTo(fullScreen.width, 0);
    await pinnedAt(page, 'why', 0.58);
    const longLine = await line.boundingBox();
    expect(longLine.height).toBeLessThanOrEqual(2);
    expect(longLine.width).toBeGreaterThan(box.width);
    expect(await shown(page, '#why .crt-line')).toBeGreaterThan(0.95);
    expect(await shown(page, '#why .crash-point')).toBe(0);
    await pinnedAt(page, 'why', 0.70);
    expect((await line.boundingBox()).width).toBeLessThan(longLine.width / 10);
    await pinnedAt(page, 'why', 0.76);
    expect(await shown(page, '#why .crt-line')).toBe(0);
    const fadingIn = await shown(page, '#why .crash-point');
    expect(fadingIn).toBeGreaterThan(0);
    expect(fadingIn).toBeLessThan(0.95);
    for (const f of [0.9, 0.99]) {
      await pinnedAt(page, 'why', f);
      expect(await shown(page, '#why .crash-point')).toBeGreaterThan(0.95);
      const [message, stage] = await Promise.all([point.boundingBox(), page.locator('#why > .stage').boundingBox()]);
      expect(message.x + message.width / 2).toBeCloseTo(stage.x + stage.width / 2, 0);
      expect(message.y + message.height / 2).toBeCloseTo(stage.y + stage.height / 2, 0);
    }
    await pinnedAt(page, 'why', 1);
    const opacity = await page.evaluate(() => Number(getComputedStyle(document.querySelector('#why .bsod')).opacity));
    expect(opacity).toBeLessThan(0.1);
  });

  test('#numbers: the readouts only ever show the real values', async ({ page }) => {
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      // from #numbers entering the viewport to it leaving: -0.4 .. 1.4 of the pinned scroll
      await pinnedAt(page, 'numbers', -0.4 + (1.8 * i) / 19);
      const readouts = await page.evaluate(() => [...document.querySelectorAll('[data-stat] .big')].map(el => ({
        text: el.textContent.trim(),
        before: getComputedStyle(el, '::before').content,
        after: getComputedStyle(el, '::after').content,
      })));
      for (const r of readouts) {
        expect(['≈8.5M', '70%']).toContain(r.text);
        expect(['none', 'normal']).toContain(r.before);
        expect(['none', 'normal']).toContain(r.after);
        seen.add(r.text);
      }
    }
    expect([...seen].sort()).toEqual(['70%', '≈8.5M']);
  });

  test('#numbers: the swap is sequential, never two numbers on screen at once', async ({ page }) => {
    const overlaps = [];
    // 31 positions over the pinned range, 1/30 apart: the step lands on the midpoint, where the swap happens
    for (let i = 0; i <= 30; i++) {
      const f = i / 30;
      await pinnedAt(page, 'numbers', f);
      const visible = [];
      for (const id of ['crowdstrike', 'stop-errors']) {
        const o = await shown(page, `[data-stat="${id}"]`);
        if (o > 0.1) visible.push(`${id} ${o.toFixed(2)}`);
      }
      if (visible.length > 1) overlaps.push(`${f.toFixed(3)}: ${visible.join(', ')}`);
    }
    expect(overlaps).toEqual([]);
    // the swap leaves a short empty stage around the midpoint, so no scroll position or frame lag can superimpose them
    for (const f of [0.48, 0.5, 0.52]) {
      await pinnedAt(page, 'numbers', f);
      for (const id of ['crowdstrike', 'stop-errors']) {
        expect(await shown(page, `[data-stat="${id}"]`), `${id} at ${f}`).toBeLessThanOrEqual(0.05);
      }
    }
  });

  // Both statistics' sources stay in the tab order. Wherever the scroll is, a source with keyboard focus shows its
  // statistic whole and the other statistic not at all; a faded statistic never takes the pointer from the shown one.
  test('#numbers: at every scroll position a focused source shows its statistic whole, and only that one', async ({ page }) => {
    // 101 positions, 1% apart: each fade (8% and 3.5% of the pinned scroll) is sampled several times. On software GL
    // a #numbers frame costs about 55-65 ms (measured at 1440x900) and each check waits for frames.
    test.setTimeout(180_000);
    await page.keyboard.press('Shift'); // a keyboard interaction, so script focus is :focus-visible as a Tab's is
    const bad = [];
    for (let i = 0; i <= 100; i++) {
      const f = i / 100;
      await pinnedAt(page, 'numbers', f);
      allowFrames(6); // a frame for each source focused, and one after
      bad.push(...await page.evaluate(async f => {
        const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const shown = el => {
          let opacity = 1;
          for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
            opacity *= Number(cs.opacity);
          }
          return opacity;
        };
        const out = [];
        for (const link of document.querySelectorAll('#numbers a[href]')) {
          link.focus({ preventScroll: true });
          await frame();
          const own = link.closest('.stat');
          const other = [...document.querySelectorAll('#numbers .stat')].find(stat => stat !== own);
          const what = `${f.toFixed(2)}: ${own.dataset.stat} "${link.textContent.trim().slice(0, 20)}"`;
          if (!link.matches(':focus-visible')) out.push(`${what} not focus-visible`);
          if (shown(link) < 0.95) out.push(`${what} shown ${shown(link).toFixed(2)}`);
          if (shown(other) > 0.05) out.push(`${what} other shown ${shown(other).toFixed(2)}`);
          link.blur();
        }
        await frame();
        // without focus, the statistic not on show never covers the shown one's link
        for (const link of document.querySelectorAll('#numbers a[href]')) {
          if (shown(link) < 0.95) continue;
          const r = link.getClientRects()[0];
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!link.contains(hit)) out.push(`${f.toFixed(2)}: "${link.textContent.trim().slice(0, 20)}" covered by ${hit?.tagName}.${hit?.className}`);
        }
        return out;
      }, f));
    }
    expect(bad).toEqual([]);
  });

  test('#numbers: keyboard: Tab and Shift+Tab reach both sources from the pinned start, each shown as it is focused', async ({ page }) => {
    for (const f of [0, 0.25, 0.5, 0.9]) {
      await pinnedAt(page, 'numbers', f);
      const links = page.locator('#numbers a[href]');
      const count = await links.count();
      expect(count).toBeGreaterThanOrEqual(2);
      await links.first().evaluate(el => el.focus({ preventScroll: true }));
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      for (let i = 0; i < count; i++) {
        if (i > 0) await page.keyboard.press('Tab');
        await expect(links.nth(i), `Tab ${i} at ${f}`).toBeFocused();
        const stat = await links.nth(i).evaluate(el => el.closest('.stat').dataset.stat);
        expect(await shown(page, `[data-stat="${stat}"]`), `${stat} at ${f}`).toBeGreaterThan(0.95);
      }
      for (let i = count - 2; i >= 0; i--) {
        await page.keyboard.press('Shift+Tab');
        await expect(links.nth(i), `Shift+Tab ${i} at ${f}`).toBeFocused();
        const stat = await links.nth(i).evaluate(el => el.closest('.stat').dataset.stat);
        expect(await shown(page, `[data-stat="${stat}"]`), `${stat} at ${f}`).toBeGreaterThan(0.95);
      }
      await page.evaluate(() => document.activeElement.blur());
    }
  });

  test('#numbers: the two numbers take turns', async ({ page }) => {
    await pinnedAt(page, 'numbers', 0.25);
    expect(await shown(page, '[data-stat="crowdstrike"]')).toBeGreaterThan(0.95);
    expect(await shown(page, '[data-stat="stop-errors"]')).toBe(0);
    await pinnedAt(page, 'numbers', 0.9);
    expect(await shown(page, '[data-stat="crowdstrike"]')).toBe(0);
    expect(await shown(page, '[data-stat="stop-errors"]')).toBeGreaterThan(0.95);
  });
});
