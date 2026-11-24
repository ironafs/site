const plain = text => text.replaceAll('`', '');
import { story } from '../../src/content/story.ts';
import { test, expect } from '@playwright/test';
import { withoutScene } from './util.mjs';

// Rust (#rust) with the CSS word, and the two cards (#rust-cards).

const CLAIM = "IronAFS is being written in Rust, from the core to the afs command. On macOS the file-system extension is planned in Swift, and the daemon will use one C file for system logging. A file-system client can't assume server replies are well formed, and safe Rust keeps a parser from reading outside its buffers.";
const VALUES = ['76%', '35%', '24%', '<20%'];
const YEARS = ['2019', '2022', '2024', '2025'];
const GREEN = 'rgb(127, 209, 139)';
const STEEL = 'rgb(139, 146, 155)';

const isStatic = page => page.addInitScript(() => {
  const add = () => document.documentElement?.classList.add('static');
  add();
  document.addEventListener('readystatechange', add);
});

/** Scrolls to `f` (0..1) of a pinned section's pinned scroll: its top at the viewport's top to its bottom at the bottom. */
async function pinnedAt(page, id, f) {
  await page.evaluate(async ({ id, f }) => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const s = document.getElementById(id);
    const distance = () => {
      const r = s.getBoundingClientRect();
      return r.top + f * (r.height - innerHeight);
    };
    // A focus scroll or layout change can move the target while the timeline updates.
    for (let i = 0; i < 10; i++) {
      scrollTo({ top: Math.round(scrollY + distance()), behavior: 'instant' });
      await frame();
      if (Math.abs(distance()) <= 1) return;
    }
    throw new Error(`#${id} at ${f}: scroll is ${distance().toFixed(2)} px from the requested position`);
  }, { id, f });
}

// window.__shown(el): the effective opacity of el (the product over its ancestors), 0 when it or an ancestor is hidden.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__shown = el => {
      let opacity = 1;
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
        opacity *= Number(cs.opacity);
      }
      return opacity;
    };
  });
});
const shown = (page, selector) => page.locator(selector).first().evaluate(el => window.__shown(el));

const enhanced = page => page.evaluate(() => CSS.supports('animation-timeline: view()')
  && matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)').matches
  && !document.documentElement.classList.contains('static'));

/** The readout values shown (effective opacity above 0.5) at the current scroll. */
const readout = page => page.evaluate(() => [...document.querySelectorAll('#rust .readout .rv')]
  .filter(el => window.__shown(el) > 0.5).map(el => el.textContent.trim()));

// The checks that hold in every mode: the content, the markers and the colours.
for (const mode of ['static', 'default']) {
  test.describe(`#rust and #rust-cards, ${mode}`, () => {
    test.beforeEach(async ({ page }) => {
      if (mode === 'static') await isStatic(page);
      await page.goto('/');
    });

    test('the word reads "Rust" for assistive technology, the visual word is hidden from it, and the 3D host is there', async ({ page }) => {
      const host = page.locator('#rust .rust-word[data-3d-host]');
      await expect(host).toHaveCount(1);
      await expect(host.locator('.sr-only')).toHaveText(story.rust.word);
      await expect(host.locator('[aria-hidden="true"]')).toHaveText(story.rust.word);
      // the rust fill is the build's WebP of rust-only, set through the CSSOM (no style= attribute)
      await expect.poll(() => host.locator('.rw-css').evaluate(el => getComputedStyle(el, '::after').backgroundImage)).toMatch(/rust-only.*\.webp/);
      // the served markup has no style= attribute in either section (the URL comes in as data-fill)
      const html = await (await page.request.get('/')).text();
      const sections = html.slice(html.indexOf('<section id="rust"'), html.indexOf('<section id="speed"'));
      expect(sections.length).toBeGreaterThan(1000);
      expect(sections).not.toMatch(/<[^>]*\sstyle=/);
    });

    test('the claim is in the future tense, with the phase texts', async ({ page }) => {
      await expect(page.locator('#rust .rust-word + .rw-intro .rwname')).toHaveText('Iron and the rust it forms give IronAFS its name.');
      await expect(page.locator('#rust .rwclaim')).toHaveText(CLAIM);
      await expect(page.locator('#rust h2')).toHaveText('Why Rust for a network file system?');
      await expect(page.locator('#rust .t1 .lede')).toHaveText("Google reports that memory-safety bugs made up 76% of Android's reported vulnerabilities in 2019 and less than 20% in 2025.");
      await expect(page.locator('#rust')).toContainText('Memory-safety bugs per million lines');
      await expect(page.locator('#rust')).toContainText(plain(story.rust.density.lede));
      await expect(page.locator('#rust')).toHaveAttribute('aria-labelledby', 'rust-h');
    });

    test('the statistic and illustration markers, each statistic with a source link in its block', async ({ page }) => {
      for (const id of ['android-share', 'android-density', 'android-rollback', 'android-review']) {
        const block = page.locator(`#rust [data-stat="${id}"]`);
        await expect(block, id).toHaveCount(1);
        expect(await block.locator('a.source').count(), id).toBeGreaterThanOrEqual(1);
        for (const href of await block.locator('a.source').evaluateAll(as => as.map(a => a.href))) expect(href).toMatch(/^https:\/\//);
      }
      await expect(page.locator('#rust [data-illustrative="dots"]')).toHaveCount(1);
      await expect(page.locator('#rust [data-illustrative="dots"]')).toContainText(story.rust.density.illustration);
    });

    // A value inside its bar is white on the bar's steel, whose top is pale: its own plate must give it 4.5:1 even
    // over white, the worst case under it.
    test('each value inside a bar keeps at least 4.5:1 on its own backing', async ({ page }) => {
      const ratios = await page.locator('#rust .chart .b:not(.threshold) .bv').evaluateAll(els => els.map(el => {
        const rgba = c => c.match(/[\d.]+/g).map(Number);
        const [r, g, b, a = 1] = rgba(getComputedStyle(el).backgroundColor);
        const over = [r, g, b].map(v => v * a + 255 * (1 - a));
        const lum = rgb => rgb.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        const [L1, L2] = [lum(rgba(getComputedStyle(el).color).slice(0, 3)), lum(over)].sort((x, y) => y - x);
        return { text: el.textContent, ratio: (L1 + 0.05) / (L2 + 0.05) };
      }));
      expect(ratios.map(r => r.text)).toEqual(VALUES.slice(0, 3));
      for (const { text, ratio } of ratios) expect(ratio, text).toBeGreaterThanOrEqual(4.5);
    });

    test('the chart shows three values and the 2025 upper bound, in proportion', async ({ page }) => {
      const bars = page.locator('#rust .chart .col');
      await expect(bars).toHaveCount(4);
      await expect(bars.locator('.bv')).toHaveText(VALUES);
      await expect(bars.locator('.yr')).toHaveText(YEARS);
      await pinnedAt(page, 'rust', 0.4);
      const heights = await bars.locator('.b').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height));
      expect(heights, 'a bar per value').toHaveLength(4);
      expect(heights[0]).toBeGreaterThan(50);
      for (const [i, h] of [76, 35, 24, 20].entries()) expect(heights[i] / heights[0]).toBeCloseTo(h / 76, 1);
      const threshold = bars.last().locator('.b.threshold');
      await expect(threshold).toHaveCSS('border-top-style', 'dashed');
      expect(heights[3] / heights[0]).toBeCloseTo(20 / 76, 2);
    });

    test('the readout only ever shows one of the four values', async ({ page }) => {
      const seen = new Set();
      for (let i = 0; i < 30; i++) {
        await pinnedAt(page, 'rust', -0.2 + (1.4 * i) / 29);
        const values = await readout(page);
        expect(values.length, `at ${i}: ${values}`).toBeLessThanOrEqual(1);
        for (const v of values) { expect(VALUES).toContain(v); seen.add(v); }
      }
      expect(seen.size).toBeGreaterThanOrEqual(1);
    });

    test('colour: C and C++ dots are steel, the Rust dot is --rust, and nothing in #rust is green', async ({ page }) => {
      expect(await page.locator('#rust .field').evaluate(el => getComputedStyle(el).backgroundImage)).toContain(STEEL);
      const [dot, rust] = await page.locator('#rust .onedot i').evaluate(el => {
        const probe = document.createElement('span');
        probe.style.setProperty('color', 'var(--rust)');
        el.closest('section').append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return [getComputedStyle(el).backgroundColor, c];
      });
      expect(dot).toBe(rust);
      const green = await page.evaluate(green => {
        const props = ['color', 'background-color', 'background-image', 'border-top-color', 'border-bottom-color', 'border-left-color',
          'border-right-color', 'box-shadow', 'text-shadow', 'outline-color', 'fill', 'stroke', 'filter', 'mask-image'];
        const out = [];
        for (const el of document.querySelectorAll('#rust, #rust *')) {
          for (const pseudo of [null, '::before', '::after']) {
            const cs = getComputedStyle(el, pseudo);
            for (const p of props) if (cs.getPropertyValue(p).includes(green)) out.push(`${el.className}${pseudo ?? ''} ${p}`);
          }
        }
        return out;
      }, GREEN);
      expect(green).toEqual([]);
    });

    test('the density panel: two equal boxes, tops aligned, and the illustration caption', async ({ page }) => {
      await page.locator('#rust .dens').scrollIntoViewIfNeeded();
      await pinnedAt(page, 'rust', 0.8);
      const [a, b] = await page.locator('#rust .field, #rust .onedot').evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()));
      expect(a.width).toBeGreaterThan(60);
      expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.top - b.top)).toBeLessThanOrEqual(2);
      await expect(page.locator('#rust .dens figcaption')).toHaveText(story.rust.density.illustration);
      await expect(page.locator('#rust .cval')).toHaveText('≈ 1,000');
      await expect(page.locator('#rust .rustval')).toHaveText('0.2');
    });

    test('both chips name "Android Rust changes"', async ({ page }) => {
      const chips = page.locator('#rust .chips [data-stat]');
      await expect(chips).toHaveCount(2);
      await expect(chips.nth(0)).toContainText('Android Rust changes were rolled back about a quarter as often as C and C++ changes.');
      await expect(chips.nth(1)).toContainText('Android Rust changes took 25% less time to review.');
    });

    test('#rust-cards: one panel with two sourced examples', async ({ page }) => {
      const panel = page.locator('#rust-cards .facts');
      const cards = panel.locator('.fact');
      await expect(page.locator('#rust-cards h2')).toHaveText("What Rust can and can't do for a file client");
      await expect(cards).toHaveCount(2);
      for (const [i, data] of [story.cards.mountpoint, story.cards.unsafeCard].entries()) {
        await expect(cards.nth(i).locator('h3')).toHaveText(data.kicker);
        await expect(cards.nth(i)).toContainText(plain(data.text));
        await expect(cards.nth(i).locator('a.source')).toHaveAttribute('href', data.source.href);
      }
    });
  });
}

test('phone: the phases are stacked at their final state, the cards in one column', async ({ page }) => {
  await page.goto('/');
  test.skip(await enhanced(page), 'the phone and base layout');
  // both phases' text and panels, in reading order: phase 1 text, bars, phase 2 text, density
  const tops = await page.locator('#rust .t1, #rust .ph1, #rust .t2, #rust .ph2').evaluateAll(els => els.map(el => el.getBoundingClientRect().top));
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  for (const sel of ['.t1', '.ph1', '.t2', '.ph2', '.chips']) expect(await shown(page, `#rust ${sel}`), sel).toBeGreaterThan(0.95);
  expect(await readout(page)).toEqual(['<20%']);
  const [a, b] = await page.locator('#rust-cards .fact').evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()));
  if (page.viewportSize().width <= 760) {
    expect(Math.abs(a.left - b.left)).toBeLessThanOrEqual(1);
    expect(b.top).toBeGreaterThanOrEqual(a.bottom);
  }
});

test.describe('enhancement', () => {
  test.beforeEach(async ({ page }) => {
    // These timelines belong to the CSS story. rustword.spec.mjs exercises the 3D word.
    await withoutScene(page);
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here: the base layer is the contract');
  });

  test('the readout flips through all four real values in turn, with their years', async ({ page }) => {
    const at = { 0.11: ['76%', '2019'], 0.21: ['35%', '2022'], 0.3: ['24%', '2024'], 0.42: ['<20%', '2025'] };
    for (const [f, [value, year]] of Object.entries(at)) {
      await pinnedAt(page, 'rust', Number(f));
      expect(await readout(page), `at ${f}`).toEqual([value]);
      const years = await page.locator('#rust .readout .yr span').evaluateAll(els => els.filter(el => window.__shown(el) > 0.5).map(el => el.textContent));
      expect(years, `at ${f}`).toEqual([year]);
    }
    await pinnedAt(page, 'rust', 0.02);
    expect(await readout(page)).toEqual([]);
  });

  test('the bars rise with scroll, each value appearing as its bar finishes', async ({ page }) => {
    const scale = () => page.locator('#rust .chart .b').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height));
    await pinnedAt(page, 'rust', 0.01);
    const early = await scale();
    await pinnedAt(page, 'rust', 0.4);
    const late = await scale();
    expect(early[3]).toBeLessThan(late[3] * 0.2);
    expect(late[3]).toBeGreaterThan(20);
    await pinnedAt(page, 'rust', 0.15);
    expect(await shown(page, '#rust .chart .col:nth-child(1) .bv')).toBeGreaterThan(0.9);
    expect(await shown(page, '#rust .chart .col:nth-child(4) .bv')).toBeLessThan(0.1);
  });

  test('the rust spreads over the word with scroll, after the sheen', async ({ page }) => {
    const r = () => page.locator('#rust .rw-css').evaluate(el => parseFloat(getComputedStyle(el, '::after').getPropertyValue('--r1')));
    await pinnedAt(page, 'rust', 0);
    const start = await r();
    await pinnedAt(page, 'rust', 0.25);
    const mid = await r();
    await pinnedAt(page, 'rust', 0.6);
    const end = await r();
    expect(start).toBeLessThan(2);
    expect(mid).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(mid);
    const sheen = async f => { await pinnedAt(page, 'rust', f); return page.locator('#rust .rw-css').evaluate(el => getComputedStyle(el, '::before').backgroundPosition); };
    expect(await sheen(0.05)).not.toBe(await sheen(0.3));
  });

  test('one phase at a time: bars, then density, never both', async ({ page }) => {
    for (let i = 0; i <= 30; i++) {
      const f = i / 30;
      await pinnedAt(page, 'rust', f);
      const [one, two, t1, t2] = await page.locator('#rust').evaluate(el =>
        ['.ph1', '.ph2', '.t1', '.t2'].map(selector => window.__shown(el.querySelector(selector))));
      expect(Math.min(one, two), `at ${f.toFixed(2)}: ${one} ${two}`).toBeLessThanOrEqual(0.05);
      expect(Math.min(t1, t2), `text at ${f.toFixed(2)}`).toBeLessThanOrEqual(0.05);
    }
    await pinnedAt(page, 'rust', 0.3);
    expect(await shown(page, '#rust .ph1')).toBeGreaterThan(0.95);
    expect(await shown(page, '#rust .t1')).toBeGreaterThan(0.95);
    await pinnedAt(page, 'rust', 0.97);
    expect(await shown(page, '#rust .ph2')).toBeGreaterThan(0.95);
    expect(await shown(page, '#rust .t2')).toBeGreaterThan(0.95);
    expect(await shown(page, '#rust .chips li:nth-child(2)')).toBeGreaterThan(0.95);
    // the hidden phase takes no pointer input, so it never covers the shown phase's links
    expect(await page.locator('#rust .ph1').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  });

  // Every source stays in the tab order. Wherever the scroll is, a link with keyboard focus shows whole, its phase
  // shown and the other phase not; a faded phase or chip never takes the pointer from a shown link.
  test('at every scroll position a focused #rust link shows whole, in its phase', async ({ page }) => {
    // 51 positions, 2% apart, so the fades in and out of each phase and chip are sampled too
    test.setTimeout(180_000);
    await page.keyboard.press('Shift'); // a keyboard interaction, so script focus is :focus-visible as a Tab's is
    const bad = [];
    for (let i = 0; i <= 50; i++) {
      const f = i / 50;
      await pinnedAt(page, 'rust', f);
      bad.push(...await page.evaluate(async f => {
        const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const out = [];
        const links = [...document.querySelectorAll('#rust :is(a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]))')];
        for (const link of links) {
          link.focus({ preventScroll: true });
          // The focus rules apply as soon as computed style is read.
          const what = `${f.toFixed(2)}: "${link.textContent.trim().slice(0, 20)}"`;
          const other = document.querySelector(link.closest('.ph1') ? '#rust .ph2' : '#rust .ph1');
          if (!link.matches(':focus-visible')) out.push(`${what} not focus-visible`);
          if (window.__shown(link) < 0.95) out.push(`${what} shown ${window.__shown(link).toFixed(2)}`);
          if (window.__shown(other) > 0.05) out.push(`${what} other phase shown ${window.__shown(other).toFixed(2)}`);
          link.blur();
        }
        // Let the scroll-driven animations resume after focus no longer overrides them.
        await frame();
        for (const link of links) {
          if (window.__shown(link) < 0.95) continue;
          const r = link.getClientRects()[0];
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!link.contains(hit)) out.push(`${f.toFixed(2)}: "${link.textContent.trim().slice(0, 20)}" covered by ${hit?.tagName}.${hit?.className}`);
        }
        return out;
      }, f));
    }
    expect(bad).toEqual([]);
  });

  test('keyboard: Tab and Shift+Tab walk every #rust source in order from either phase, each shown as it is focused', async ({ page }) => {
    const links = page.locator('#rust a[href]');
    const count = await links.count();
    expect(count).toBe(story.rust.share.sources.length + 1 + story.rust.chips.length);
    for (const f of [0.05, 0.3, 0.6, 0.97]) {
      await pinnedAt(page, 'rust', f);
      await links.first().evaluate(el => el.focus({ preventScroll: true }));
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      for (let i = 0; i < count; i++) {
        if (i > 0) await page.keyboard.press('Tab');
        await expect(links.nth(i), `Tab ${i} at ${f}`).toBeFocused();
        expect(await links.nth(i).evaluate(el => window.__shown(el)), `link ${i} at ${f}`).toBeGreaterThan(0.95);
      }
      for (let i = count - 2; i >= 0; i--) {
        await page.keyboard.press('Shift+Tab');
        await expect(links.nth(i), `Shift+Tab ${i} at ${f}`).toBeFocused();
        expect(await links.nth(i).evaluate(el => window.__shown(el)), `link ${i} at ${f}`).toBeGreaterThan(0.95);
      }
      await page.evaluate(() => document.activeElement.blur());
    }
  });

  test('a card link with focus shows its card at once', async ({ page }) => {
    await page.evaluate(() => {
      const el = document.querySelector('#rust-cards .fact');
      scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight + 20, behavior: 'instant' });
    });
    const link = page.locator('#rust-cards .fact a.source').first();
    await link.evaluate(el => el.focus({ preventScroll: true }));
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await link.evaluate(el => window.__shown(el))).toBeGreaterThan(0.95);
  });

  test('the density field reveals with scroll', async ({ page }) => {
    const clip = () => page.locator('#rust .field').evaluate(el => getComputedStyle(el).clipPath);
    await pinnedAt(page, 'rust', 0.55);
    const a = await clip();
    await pinnedAt(page, 'rust', 0.75);
    expect(await clip()).not.toBe(a);
  });


});

for (const width of [1440, 1728]) {
  test(`#rust-cards opening aligns with #cost at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const opening = await page.evaluate(() => {
      const heading = document.querySelector('#rust-cards h2');
      const range = document.createRange();
      range.selectNodeContents(heading);
      return { left: heading.getBoundingClientRect().left, costLeft: document.querySelector('#cost h2').getBoundingClientRect().left, lines: range.getClientRects().length };
    });
    expect(Math.abs(opening.left - opening.costLeft)).toBeLessThanOrEqual(1);
    expect(opening.lines).toBe(1);
  });
}
