import { story as storyCopy } from '../../src/content/story.ts';
import { test, expect } from '@playwright/test';
import { content, hiddenContent, order, storySections as story } from './util.mjs';

// The story's two layers. The base layer is the contract wherever the enhancement is
// off: the `.static` test switch, reduced motion, JavaScript disabled, phones, and browsers without scroll-driven
// animation.

const modes = {
  static: async page => page.addInitScript(() => {
    const add = () => document.documentElement?.classList.add('static');
    add();
    document.addEventListener('readystatechange', add);
  }),
  'reduced motion': async page => page.emulateMedia({ reducedMotion: 'reduce' }),
};

for (const [mode, setup] of Object.entries(modes)) {
  test.describe(`base layer, ${mode}`, () => {
    test.beforeEach(async ({ page }) => {
      await setup(page);
      await page.goto('/');
    });

    test('every content element of every section is visible, unclipped and on top', async ({ page }) => {
      const { count, problems } = await hiddenContent(page, order.slice(1).map(id => `#${id}`).join(', '));
      expect(count, 'the walk reached the content').toBeGreaterThan(40);
      expect(problems).toEqual([]);
    });

    test('each <details>, opened, shows its list the same way', async ({ page }) => {
      const count = await page.evaluate(() => {
        const all = [...document.querySelectorAll('main details')];
        for (const d of all) d.open = true;
        return all.length;
      });
      expect(count, 'the design placeholder has a disclosure per OS').toBeGreaterThanOrEqual(1);
      const { count: items, problems } = await hiddenContent(page, 'main details');
      expect(items).toBeGreaterThan(0);
      expect(problems).toEqual([]);
    });

    test('the sections appear in page order', async ({ page }) => {
      // the hero's section is the stage inside its pin (.hero-pin); the others are main's children
      const ids = await page.evaluate(() => [...document.querySelectorAll('main > section[id], main > .hero-pin > section[id]')].map(s => s.id));
      expect(ids).toEqual(order);
    });

    test('no blank pinned space: each section is at most its content plus 20vh', async ({ page }) => {
      const tall = await page.evaluate(({ story, content }) => {
        const out = [];
        for (const id of story) {
          const section = document.getElementById(id);
          // A closed disclosure still has a visible, tappable summary.
          const boxes = [...section.querySelectorAll(`${content}, summary`)].map(el => el.getBoundingClientRect()).filter(r => r.height > 0);
          if (!boxes.length) boxes.push({ top: 0, bottom: 0 }); // a placeholder with no copy yet: at most 20vh
          const top = Math.min(...boxes.map(r => r.top));
          const bottom = Math.max(...boxes.map(r => r.bottom));
          const height = section.getBoundingClientRect().height;
          if (height > bottom - top + 0.2 * innerHeight) out.push(`${id}: ${Math.round(height)} px for ${Math.round(bottom - top)} px of content`);
        }
        return out;
      }, { story, content });
      expect(tall).toEqual([]);
    });
  });
}

test('the story sections render their heads from story.ts, empty heads left out', async ({ page }) => {
  await page.goto('/');
  const empty = await page.evaluate(() => [...document.querySelectorAll('main .story :is(h2, .eyebrow)')].filter(el => !el.textContent.trim()).length);
  expect(empty).toBe(0);
  await expect(page.locator('#numbers h2').first()).toHaveText(storyCopy.numbers.heading);
  await expect(page.locator('#status h2').first()).toHaveText(storyCopy.statusSection.heading);
});

for (const id of ['design', 'status']) {
  test(`/#${id} lands with its heading below the header, in the top 40% of the viewport`, async ({ page }) => {
    await page.goto(`/#${id}`);
    await expect.poll(() => page.evaluate(id => {
      const h2 = document.querySelector(`#${id} h2`).getBoundingClientRect();
      const header = document.getElementById('site-header').getBoundingClientRect();
      return h2.top >= header.bottom - 1 && h2.top <= 0.4 * innerHeight;
    }, id), { timeout: 5000 }).toBe(true);
  });
}

test('the art loads lazily as AVIF and WebP pictures, decorative', async ({ page }) => {
  await page.goto('/');
  const art = await page.evaluate(() => [...document.querySelectorAll('main .story picture img')].map(img => ({
    loading: img.getAttribute('loading'),
    alt: img.getAttribute('alt'),
    types: [...img.closest('picture').querySelectorAll('source')].map(s => s.type),
  })));
  // chip (#numbers), rust (#rust), forge (#status); drops and rust-only arrive with their sections (Tasks 7, 5).
  expect(art.length).toBeGreaterThanOrEqual(3);
  for (const a of art) {
    expect(a.loading).toBe('lazy');
    expect(a.alt).toBe('');
    expect(a.types).toEqual(['image/avif', 'image/webp']);
  }
});

// The enhancement: only where storyEnhanced() would be true (mode.ts). Chromium desktop always; WebKit desktop
// only where it supports scroll-driven animation; never on phones.
test.describe('enhancement layer', () => {
  test('pinned sections take their heights and sticky stages; .static removes both', async ({ page }) => {
    await page.goto('/');
    const enhanced = await page.evaluate(() => CSS.supports('animation-timeline: view()')
      && matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)').matches);
    test.skip(!enhanced, 'the enhancement is off here: the base-layer tests are the contract');
    const measure = () => page.evaluate(() => Object.fromEntries(['why', 'numbers', 'design', 'rust', 'platforms', 'status'].map(id => {
      const s = document.getElementById(id);
      return [id, { vh: Math.round(10 * s.getBoundingClientRect().height / innerHeight) / 10, position: getComputedStyle(s.querySelector(':scope > .stage')).position }];
    })));
    const on = await measure();
    expect(on).toMatchObject({
      why: { vh: 1.6, position: 'sticky' },
      numbers: { vh: 1.9, position: 'sticky' },
      design: { vh: 5.6, position: 'sticky' },
      rust: { vh: 4.4, position: 'sticky' },
      platforms: { vh: 3, position: 'sticky' },
    });
    expect(on.status.position).not.toBe('sticky');
    await page.evaluate(() => document.documentElement.classList.add('static'));
    const off = await measure();
    for (const id of ['why', 'numbers', 'design', 'rust', 'platforms']) {
      expect(off[id].position, id).not.toBe('sticky');
      expect(off[id].vh, id).toBeLessThan(on[id].vh);
    }
  });
});

// JavaScript disabled: the enhancement needs its modules (the tabs, the timeline's --x, the fit
// guards), so its media query asks for `scripting: enabled` and the page uses the base layer. The hero shows
// the poster and complete console (intro.spec.mjs). Both desktop projects check a full window and a short one
// that still pins when scripting is enabled.
for (const height of [900, 700]) {
  test.describe(`base layer, JavaScript disabled, 1440x${height}`, () => {
    let context;
    let page;
    test.beforeEach(async ({ browser }) => {
      test.skip(test.info().project.use.viewport.width < 1000, 'desktop projects');
      context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height } });
      page = await context.newPage();
      await page.goto('/');
    });
    test.afterEach(async () => context?.close());

    test('every story section is in normal flow: no sticky stage, no section taller than its content needs', async () => {
      const sticky = await page.evaluate(() => [...document.querySelectorAll('main *')]
        .filter(el => getComputedStyle(el).position === 'sticky')
        .map(el => `${el.closest('section[id]')?.id ?? '?'} ${el.tagName.toLowerCase()}.${el.className}`));
      expect(sticky).toEqual([]);
      const { count, problems } = await hiddenContent(page, story.map(id => `#${id}`).join(', '), { frames: false });
      expect(count, 'the walk reached the content').toBeGreaterThan(40);
      expect(problems).toEqual([]);
    });

    test('#design: every OS panel\'s text is visible', async () => {
      const panels = await page.locator('#design .how-os').count();
      expect(panels, 'Linux, macOS and Windows').toBe(3);
      const { count, problems } = await hiddenContent(page, '#design .how-os', { frames: false });
      expect(count).toBeGreaterThan(10);
      expect(problems).toEqual([]);
    });

    test('#platforms: no two events overlap', async () => {
      const overlaps = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('#platforms .ev')].map(ev => ({ title: ev.querySelector('a').textContent.trim(), r: ev.getBoundingClientRect() }));
        const out = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const [a, b] = [boxes[i].r, boxes[j].r];
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${boxes[i].title} / ${boxes[j].title}`);
        }
        return { count: boxes.length, out };
      });
      expect(overlaps.count).toBe(storyCopy.platforms.events.length);
      expect(overlaps.out).toEqual([]);
    });

    test('#platforms: no lane card intersects the IronAFS card', async () => {
      const got = await page.evaluate(() => {
        const f = document.querySelector('#platforms .fin .card').getBoundingClientRect();
        const cards = [...document.querySelectorAll('#platforms .lane:not(.fin-lane) .card')];
        const hits = cards.filter(c => {
          const r = c.getBoundingClientRect();
          return r.left < f.right - 1 && f.left < r.right - 1 && r.top < f.bottom - 1 && f.top < r.bottom - 1;
        }).map(c => c.querySelector('a').textContent.trim());
        return { cards: cards.length, finHeight: f.height, hits };
      });
      expect(got.cards).toBe(storyCopy.platforms.events.filter(e => e.lane !== 'ironafs').length);
      expect(got.finHeight, 'the IronAFS card is laid out').toBeGreaterThan(0);
      expect(got.hits).toEqual([]);
    });

    test('no horizontal overflow', async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  });
}

// hiddenContent's look-through: a foreign link's unpainted padding over a line is not covering it,
// but its text over a line is, and so is its offset text-shadow. A probe section in main: a paragraph,
// and a transparent link set over its centre.
for (const [display, shift, covered] of ['inline', 'inline-block'].flatMap(display => [
  [display, 'padding', false], [display, 'text', true], [display, 'shadow', true],
])) {
  test(`hiddenContent: an ${display} link with ${shift} over a paragraph ${covered ? 'covers' : 'does not cover'} it`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(({ display, shift }) => {
      const section = document.createElement('section');
      section.id = 'probe-root';
      const p = document.createElement('p');
      p.textContent = 'An unrelated line of text, long enough to have a centre.';
      const holder = document.createElement('p');
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = 'a transparent link';
      holder.append(a);
      section.append(holder, p);
      document.querySelector('main').append(section);
      a.style.display = display;
      a.style.position = 'relative';
      if (shift !== 'text') a.style.paddingBottom = '60px';
      const range = document.createRange();
      range.selectNodeContents(a);
      const [pr, ar] = [p.getBoundingClientRect(), range.getBoundingClientRect()];
      const [cx, cy] = [pr.left + pr.width / 2, pr.top + pr.height / 2];
      // Centre the text over the paragraph for the text case. In the other cases only the padding
      // reaches the centre, with a text shadow painted there in the shadow case.
      a.style.left = `${cx - (ar.left + ar.width / 2)}px`;
      const offset = shift === 'text' ? 0 : 32;
      a.style.top = `${cy - (ar.top + ar.height / 2) - offset}px`;
      if (shift === 'shadow') a.style.textShadow = `0 ${offset}px 0 #fff`;
    }, { display, shift });
    const { problems } = await hiddenContent(page, '#probe-root');
    // the link really is over the paragraph's centre (so a pass for the padding is the look-through, not a miss)
    expect(await page.evaluate(() => {
      const p = document.querySelector('#probe-root p:last-child');
      p.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = p.getBoundingClientRect();
      return document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).some(h => h.matches('#probe-root a'));
    }), 'the link is hit at the paragraph\'s centre').toBe(true);
    const unrelated = problems.filter(x => x.includes('An unrelated line'));
    expect(unrelated, problems.join('; ')).toEqual(covered ? [expect.stringContaining('covered by a')] : []);
  });
}
