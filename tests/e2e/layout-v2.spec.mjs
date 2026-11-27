import { test, expect } from '@playwright/test';
import { allowFrames, axeSerious, endpointProblems, enhanced, hiddenContent, order, pinnedAt, settle, widths } from './util.mjs';

// The v2 page's layout at the check widths and under zoom. Runs on every project:
// the viewport is set per test, so each engine (and the phones' touch and mobile settings) sees every size.

// Each check width, portrait and landscape: a portrait window is 16:9 the tall way (at most 400 px taller than wide,
// for the desktop widths), a landscape one 16:9 the wide way (at least 320 px tall).
const portrait = w => Math.min(Math.round(w * 16 / 9), w + 400);
const landscape = w => Math.max(320, Math.round(w * 9 / 16));

/** The widest the document gets while it is scrolled through, a stop at each section's top and middle. */
async function widestWhileScrolling(page) {
  allowFrames(2 * (2 * await page.locator('main section[id]').count() + 2)); // its stops, a frame each
  return page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = [];
    const stops = [0];
    for (const s of document.querySelectorAll('main section[id]')) {
      const top = s.getBoundingClientRect().top + scrollY;
      stops.push(top, top + s.offsetHeight / 2);
    }
    stops.push(document.documentElement.scrollHeight);
    for (const top of stops) {
      scrollTo({ top, behavior: 'instant' });
      await frame();
      if (document.documentElement.scrollWidth > innerWidth) out.push(`at ${Math.round(scrollY)}: ${document.documentElement.scrollWidth} > ${innerWidth}`);
    }
    return out;
  });
}

for (const width of widths) {
  test(`at ${width} px, portrait and landscape, nothing overflows horizontally anywhere on the page`, async ({ page }) => {
    for (const height of [portrait(width), landscape(width)]) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      expect(await widestWhileScrolling(page), `${width}x${height}`).toEqual([]);
    }
  });
}

// 200% browser zoom in a 1280x800 window lays the page out in 640x400 CSS px: tested as that viewport.
test.describe('200% zoom at a 1280 px window (a 640x400 viewport)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 400 });
    await page.goto('/');
  });

  test('no horizontal overflow anywhere on the page', async ({ page }) => {
    expect(await widestWhileScrolling(page)).toEqual([]);
  });

  test('every section\'s content is visible, unclipped and on top', async ({ page }) => {
    const { count, problems } = await hiddenContent(page, order.slice(1).map(id => `#${id}`).join(', '));
    expect(count, 'the walk reached the content').toBeGreaterThan(40);
    expect(problems).toEqual([]);
  });

  for (const id of ['why', 'what', 'design', 'status']) {
    test(`the menu path to #${id} lands at its start`, async ({ page }, info) => {
      await page.waitForSelector('html[data-menu-ready]');
      const press = info.project.use.hasTouch ? 'tap' : 'click';
      await page.locator('#menu-button')[press]();
      await expect(page.locator('#menu')).toHaveJSProperty('open', true);
      await page.locator(`#menu a[href="/#${id}"]`)[press]();
      await expect(page.locator('#menu')).toHaveJSProperty('open', false);
      await expect(page, `menu navigation reaches #${id} after closing`).toHaveURL(url => url.hash === `#${id}`);
      // Pinned stages start at the viewport top; flow sections start below the header.
      await expect.poll(() => page.evaluate(id => {
        const target = document.getElementById(id);
        const section = target.getBoundingClientRect();
        const stage = target.querySelector(':scope > .stage');
        const pinned = stage && getComputedStyle(stage).position === 'sticky';
        const first = document.querySelector(`#${id} :is(h2, p)`).getBoundingClientRect();
        const header = document.getElementById('site-header').getBoundingClientRect();
        const atStart = pinned ? Math.abs(section.top) <= 1 && Math.abs(stage.getBoundingClientRect().top) <= 1
          : section.top >= header.bottom - 1 && section.top <= header.bottom + 16;
        return atStart
          && first.top >= header.bottom - 1 && first.bottom <= innerHeight + 1;
      }, id), { timeout: 5000, message: `#${id} starts with its first text in view` }).toBe(true);
    });
  }

  test('axe: no serious or critical finding', async ({ page }) => {
    expect(await axeSerious(page)).toEqual([]);
  });
});

// A stress test of the connectors only (layout review): CSS zoom 125% on the root at 1440x900, applied while #design
// is pinned. The connectors follow their boxes (connectors.ts redraws on its scene's resize). Zoom fires no resize
// event, so the fit guard keeps the pinned layout until the next measurement; at that measurement it finds the zoomed
// text and diagrams too big for the stage (Chromium and WebKit, 2026-11-22) and puts #design in flow, the base layer,
// where no connector is drawn at all. Both halves are checked: attached while pinned, none drawn in flow.
test('CSS zoom 125% at 1440x900: the connectors stay on their boxes; re-measured, #design is pinned or draws none', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ironafs-analytics-choice-v1', '{"value":"denied"}'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  test.skip(!(await enhanced(page)), 'the enhancement is off here: no connectors are drawn');
  // the fit guard's own pending measurements (fonts) happen before the zoom
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  const design = page.locator('#design');
  await expect(design).not.toHaveClass(/story--flow/);
  for (let i = 0; i < 3; i++) {
    await pinnedAt(page, (i + 0.95) / 3);
    await page.evaluate(() => document.documentElement.style.setProperty('zoom', '1.25'));
    await settle(page);
    await page.waitForTimeout(100);
    expect(await design.evaluate(el => el.classList.contains('story--flow')), 'still pinned: nothing re-measured').toBe(false);
    expect(await endpointProblems(page), `OS ${i} at 125%`).toEqual([]);
    await page.evaluate(() => document.documentElement.style.removeProperty('zoom'));
    await settle(page);
  }
  await page.evaluate(() => document.documentElement.style.setProperty('zoom', '1.25'));
  await page.evaluate(() => dispatchEvent(new Event('resize')));
  await settle(page);
  await page.waitForTimeout(100);
  if (await design.evaluate(el => el.classList.contains('story--flow'))) {
    expect(await page.locator('#design svg.wires, #design .wl, #design .request-dot').count(), 'in flow: no connectors').toBe(0);
  } else {
    for (let i = 0; i < 3; i++) {
      await pinnedAt(page, (i + 0.95) / 3);
      await settle(page);
      expect(await endpointProblems(page), `OS ${i} at 125%, re-measured`).toEqual([]);
    }
  }
});

for (const width of [360, 390, 1024, 1440, 1728]) {
  for (const colorScheme of ['light', 'dark']) {
    test(`editorial sections and footer at ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      for (const selector of ['#what', '#speed', '#built', '#follow', '#site-footer']) {
        await expect(page.locator(selector)).toBeVisible();
        expect(await page.locator(selector).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      const panels = page.locator('#built details');
      await expect(panels).toHaveCount(3);
      for (const panel of await panels.all()) {
        const summary = panel.locator('summary');
        await summary.click();
        await expect(panel).toHaveAttribute('open', '');

        const { overflows, smallTargets } = await panel.evaluate(el => {
          const boxes = [el, ...el.querySelectorAll('.built-reference-list > li, .built-provenance > div, .built-trailer-example')];
          const overflows = boxes.filter(box => {
            const bounds = box.getBoundingClientRect();
            return box.scrollWidth > box.clientWidth || bounds.left < 0 || bounds.right > innerWidth;
          }).map(box => box.className || box.tagName);
          const smallTargets = [...el.querySelectorAll('summary, a[href]')].filter(target => {
            const { width, height } = target.getBoundingClientRect();
            return width < 44 || height < 44;
          }).map(target => target.textContent.trim());
          return { overflows, smallTargets };
        });
        const name = await summary.innerText();
        expect(overflows, name).toEqual([]);
        expect(smallTargets, name).toEqual([]);
      }
      await expect(page.locator('#built .built-class-list > li')).toHaveCount(5);
      await expect(panels.nth(1).locator('.built-reference-list > li')).toHaveCount(5);
      if (width >= 1024) {
        for (const selector of ['#what h2', '#speed h2', '#follow h2']) {
          expect(await page.locator(selector).evaluate(el => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getClientRects().length;
          }), selector).toBe(selector === '#speed h2' ? 2 : 1);
        }
      }
      if (width >= 1440) {
        const edges = await page.evaluate(() => ['.header-inner', '#built > .container', '#site-footer > .container']
          .map(selector => {
            const el = document.querySelector(selector);
            return el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft);
          }));
        expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(1);
        if (width === 1728) expect(edges[0]).toBeLessThan(200);
        // The performance intro and status content start on the shared editorial edge.
        const starts = await page.evaluate(() => ['#speed h2', '#speed .speed-intro .lede', '#status h2', '#status .lede', '#status .nownext']
          .map(selector => [selector, document.querySelector(selector).getBoundingClientRect().left]));
        for (const [selector, left] of starts) expect(Math.abs(left - edges[0]), selector).toBeLessThan(1);
      }
      const legalLinks = page.locator('.footer-legal a');
      await expect(legalLinks).toHaveCount(3);
      for (const link of await legalLinks.all()) {
        await expect(link).toHaveCSS('text-decoration-line', 'none');
        await expect(link.locator('[aria-hidden="true"]')).toHaveText('↗');
      }
      const order = await page.locator('#site-footer').evaluate(el => {
        const groups = el.querySelector('.footer-groups').getBoundingClientRect();
        const legal = el.querySelector('.footer-legal').getBoundingClientRect();
        return groups.bottom <= legal.top;
      });
      expect(order).toBe(true);
      expect(await axeSerious(page)).toEqual([]);
      for (const path of ['/privacy/', '/trademarks/']) {
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await axeSerious(page)).toEqual([]);
      }
    });
  }
}

for (const [width, height] of [[1280, 800], [1440, 900], [1728, 1000], [390, 844], [360, 740]]) {
  test(`/what diagram and definitions fit at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const diagram = page.locator('#what .what-diagram');
    const definitions = page.locator('#what .afs-context');
    await expect(diagram).toBeVisible();
    await expect(definitions).toBeVisible();
    for (const copy of ['new client · user space · in progress', 'existing client · in the kernel', 'AFS servers',
      'first tests planned with OpenAFS 1.8 servers', 'end-to-end compatibility unverified', 'USER SPACE', 'KERNEL']) {
      await expect(diagram.getByText(copy, { exact: true })).toBeVisible();
    }
    const label = await diagram.locator('.what-wire-label').boundingBox();
    const wires = await diagram.locator('.what-track').evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }));
    expect(label).not.toBeNull();
    for (const wire of wires) {
      const overlaps = wire.x < label.x + label.width && wire.x + wire.width > label.x &&
        wire.y < label.y + label.height && wire.y + wire.height > label.y;
      expect(overlaps, 'wire must not cross the AFS-3 label').toBe(false);
    }
    const parts = await diagram.locator('.what-client, .what-cells, .what-wire-label, .what-kernel span, .what-status span').evaluateAll(els => els.map(el => ({ name: el.textContent.trim(), ...el.getBoundingClientRect().toJSON() })));
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      expect(Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5, `${a.name} overlaps ${b.name}`).toBe(false);
    }
    if (width >= 1120) {
      expect(wires[0].width).toBeGreaterThan(15);
      expect(wires[1].width).toBeGreaterThan(15);
    }
    if (width >= 1280) {
      // Each client's detail and the server label stay on one line.
      const lines = await diagram.locator('.what-client small, .what-cells b').evaluateAll(els => els.map(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return [el.textContent, new Set([...range.getClientRects()].map(r => Math.round(r.top))).size];
      }));
      for (const [text, count] of lines) expect(count, text).toBe(1);
    }
    // the caption's two statements are two separate pills, not one run of text
    const pills = await diagram.locator('.what-status span').evaluateAll(els => els.map(el => getComputedStyle(el).borderTopStyle));
    expect(pills).toEqual(['solid', 'solid']);
    const boxes = await Promise.all([diagram.boundingBox(), definitions.boundingBox()]);
    const [figure, list] = boxes;
    expect(figure).not.toBeNull();
    expect(list).not.toBeNull();
    if (width >= 1120) {
      expect(figure.x).toBeLessThan(list.x);
      expect(figure.x + figure.width).toBeLessThanOrEqual(list.x);
    } else {
      expect(figure.y + figure.height).toBeLessThanOrEqual(list.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
