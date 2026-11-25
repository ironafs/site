import { story } from '../../src/content/story.ts';
import { test, expect } from '@playwright/test';
import { allowFrames } from './util.mjs';

// The crash (#why) and the numbers (#numbers).

const isStatic = page => page.addInitScript(() => {
  const add = () => document.documentElement?.classList.add('static');
  add();
  document.addEventListener('readystatechange', add);
});

/** Scrolls to `f` (0..1) of the stage's sticky travel, including its header inset on phones. */
async function pinnedAt(page, id, f) {
  allowFrames(8); // at least three still frames and the jump's, two requestAnimationFrame callbacks each
  await page.evaluate(async ({ id, f }) => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    // a smooth scroll still under way (html is scroll-behavior: smooth; a Tab's focus scroll) can carry the page on
    // after an instant jump: wait until the page holds still, then jump, and jump again until it stays there (as
    // story-rust.spec.mjs does)
    for (let last = NaN, still = 0; still < 3; still = scrollY === last ? still + 1 : 0) { last = scrollY; await frame(); }
    const s = document.getElementById(id);
    const stage = s.querySelector('.stage');
    const inset = parseFloat(getComputedStyle(stage).top) || 0;
    const target = Math.round(s.getBoundingClientRect().top + scrollY - inset + f * (s.offsetHeight - stage.offsetHeight));
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

async function expectActiveStatSource(page, active) {
  await expect(page.locator(`#numbers .stat:not(.s${active}) .source`)).toHaveCSS('pointer-events', 'none');
  const source = page.locator(`#numbers .s${active} .source`);
  await expect(source).toHaveCSS('pointer-events', 'auto');
  const hits = await source.evaluate(link => [...link.getClientRects()].map(rect => {
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return link.contains(hit);
  }));
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.every(Boolean), `all parts of source ${active} respond to taps`).toBe(true);
}

test.describe('portrait phone holds', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!test.info().project.use.hasTouch, 'phone projects');
    await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
    await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
    await page.goto('/');
    test.skip(!(await page.evaluate(() => CSS.supports('animation-timeline: view()'))), 'needs scroll-driven animation');
  });

  test('the stage holds while the story changes and releases after the last phase', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 699 });
    const header = await page.locator('#site-header').boundingBox();
    const notice = page.locator('[data-analytics-banner]');
    await expect(notice).toBeVisible();
    const noticeTop = (await notice.boundingBox()).y;
    const why = page.locator('#why > .stage');
    await expect(why).toHaveCSS('position', 'sticky');
    await pinnedAt(page, 'why', 0.17);
    const stageTop = (await why.boundingBox()).y;
    expect(stageTop).toBeCloseTo(header.y + header.height, 0);
    expect(await shown(page, '#why .msg')).toBeGreaterThan(0.95);
    const progress = await page.locator('#why .pct-n').evaluate(el => Number(getComputedStyle(el).getPropertyValue('--p')));
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
    const code = await page.locator('#why .code').boundingBox();
    expect(code.y + code.height).toBeLessThan(noticeTop);
    await pinnedAt(page, 'why', 0.9);
    expect((await why.boundingBox()).y).toBe(stageTop);
    expect(await shown(page, '#why .crash-point')).toBeGreaterThan(0.95);
    await pinnedAt(page, 'why', 1.2);
    expect((await why.boundingBox()).y).toBeLessThan(stageTop - 20);

    const numbers = page.locator('#numbers > .stage');
    await expect(numbers).toHaveCSS('position', 'sticky');
    await pinnedAt(page, 'numbers', 0.25);
    expect((await numbers.boundingBox()).y).toBe(stageTop);
    expect(await shown(page, '#numbers .s1')).toBeGreaterThan(0.95);
    expect(await shown(page, '#numbers .s2')).toBe(0);
    await expectActiveStatSource(page, 1);
    await pinnedAt(page, 'numbers', 0.8);
    expect((await numbers.boundingBox()).y).toBe(stageTop);
    expect(await shown(page, '#numbers .s1')).toBe(0);
    expect(await shown(page, '#numbers .s2')).toBeGreaterThan(0.95);
    await expectActiveStatSource(page, 2);
    const source = await page.locator('#numbers .s2 .src').boundingBox();
    expect(source.y + source.height).toBeLessThan(noticeTop);
    await page.setViewportSize({ width: 375, height: 600 });
    await expect(why).toHaveCSS('position', 'sticky');
  });

  test('short screens, landscape and reduced motion keep both sections in normal flow', async ({ page }) => {
    for (const [width, height, reducedMotion] of [[375, 550, 'no-preference'], [844, 390, 'no-preference'], [390, 844, 'reduce']]) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion });
      for (const id of ['why', 'numbers']) await expect(page.locator(`#${id} > .stage`)).toHaveCSS('position', 'relative');
      expect(await shown(page, '#numbers .s1')).toBe(1);
      expect(await shown(page, '#numbers .s2')).toBe(1);
    }
  });

  test('individual diagrams, charts and workflows hold below the bar and above the notice', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 699 });
    const notice = page.locator('[data-analytics-banner]');
    await expect(notice).toBeVisible();
    const noticeTop = (await notice.boundingBox()).y;
    const targets = ['#cost .vis', '#cost .afs', '#design .scene', '#rust .ph1', '#rust .dens'];
    for (const selector of targets) {
      for (const target of await page.locator(selector).all()) {
        await expect(target).toHaveCSS('position', 'sticky');
        const positions = await target.evaluate(async el => {
          const top = parseFloat(getComputedStyle(el).top);
          const track = el.parentElement;
          const start = track.getBoundingClientRect().top + scrollY - top;
          const distance = track.offsetHeight - el.offsetHeight;
          const mark = async fraction => {
            scrollTo({ top: start + fraction * distance, behavior: 'instant' });
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const rect = el.getBoundingClientRect();
            return [rect.top, rect.bottom];
          };
          return { top, first: await mark(0.2), last: await mark(0.8), released: await mark(1.25) };
        });
        expect(positions.first[0]).toBeCloseTo(positions.top, 0);
        expect(positions.last[0]).toBeCloseTo(positions.top, 0);
        expect(positions.first[1]).toBeLessThan(noticeTop);
        expect(positions.released[0]).toBeLessThan(positions.top - 12);
      }
    }
    await expect(page.locator('#platforms .lane > h3').first()).toHaveCSS('position', 'sticky');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const selector of targets) await expect(page.locator(selector).first()).not.toHaveCSS('position', 'sticky');
  });

  for (const [width, height] of [[390, 699], [600, 900], [820, 1000], [1024, 768]]) {
    test(`the shell types when readable on ${width}×${height}, then keeps its output`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const terminal = page.locator('#cost .afs');
      const notice = page.locator('[data-analytics-banner]');
      await expect(notice).toBeVisible();
      await expect(terminal).toHaveCSS('position', 'sticky');
      await terminal.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const noticeTop = document.querySelector('[data-analytics-banner]').getBoundingClientRect().top;
        scrollTo({ top: scrollY + rect.bottom - noticeTop + 24, behavior: 'instant' });
      });
      await expect(terminal).toHaveAttribute('data-terminal', 'playing');
      await expect(terminal.locator('.bigout .ok')).toHaveCSS('opacity', '0');
      const size = await terminal.boundingBox();
      const pin = parseFloat(await terminal.evaluate(el => getComputedStyle(el).top));
      expect(size.y).toBeGreaterThan(pin + 20);
      await expect(terminal).toHaveAttribute('data-terminal', 'done');
      await expect(terminal.locator('.bigout .design')).toHaveCSS('opacity', '1');
      const command = await terminal.locator('.typed').evaluate(el => [el.clientWidth, el.scrollWidth]);
      expect(command[0]).toBeGreaterThanOrEqual(command[1] - 1);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await expect(terminal).toHaveAttribute('data-terminal', 'done');
    });
  }

  test('a fling past the shell leaves the command and output readable', async ({ page }) => {
    const terminal = page.locator('#cost .afs');
    await expect(terminal).toHaveCSS('position', 'sticky');
    await terminal.evaluate(el => {
      const track = el.parentElement;
      const top = parseFloat(getComputedStyle(el).top);
      scrollTo({ top: track.getBoundingClientRect().bottom + scrollY - top - el.offsetHeight + 24, behavior: 'instant' });
    });
    await expect(terminal).toHaveAttribute('data-terminal', 'done');
    await expect(terminal.locator('.bigout .design')).toHaveCSS('opacity', '1');
  });

  test('short tablets start the smaller Design and Rust scenes before they pin', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const notice = page.locator('[data-analytics-banner]');
    await expect(notice).toBeVisible();
    for (const id of ['design', 'rust']) await expect(page.locator(`#${id}`)).toHaveAttribute('data-compact-scenes', 'tablet');
    for (const selector of ['#design .scene[data-os="linux"]', '#rust .ph1']) {
      const panel = page.locator(selector);
      await expect(panel).toHaveCSS('position', 'sticky');
      await panel.evaluate(el => {
        const top = parseFloat(getComputedStyle(el).top);
        scrollTo({ top: el.parentElement.getBoundingClientRect().top + scrollY - top - 30, behavior: 'instant' });
      });
      await expect.poll(() => panel.evaluate(el => Number(el.parentElement.style.getPropertyValue('--phone-beat-progress')))).toBeGreaterThan(0.1);
      const art = await panel.boundingBox();
      const top = parseFloat(await panel.evaluate(el => getComputedStyle(el).top));
      expect(art.y).toBeGreaterThan(top + 20);
      expect(art.y + art.height).toBeLessThan((await notice.boundingBox()).y);
    }
    await expect(page.locator('#platforms .lane > h3').first()).toHaveCSS('position', 'sticky');
  });
});

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
