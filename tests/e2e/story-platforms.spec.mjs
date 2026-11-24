import { test, expect } from '@playwright/test';
import { timeline, xFor, lanes, breaks } from '../../src/data/timeline.ts';

// Where the platforms are going (#platforms): a sideways timeline that slides with scroll, three
// lanes (Linux, macOS, Windows) and IronAFS at the end, every event linked to its source. Each event's marker and
// each year tick sit at xFor(date) of the track's width; the lane names stay put while the track moves. Phone and
// base: a vertical list grouped by lane. Keyboard: focusing an event's link scrolls the page to where the track
// shows it (src/scripts/story/platforms.ts), so no focused link is ever off screen.

const enhanced = page => page.evaluate(() => CSS.supports('animation-timeline: view()')
  && matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)').matches
  && !document.documentElement.classList.contains('static'));

const frame = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Scrolls to fraction `f` of #platforms' pinned scroll (0: its top at the viewport's top; 1: its bottom at the bottom). */
const scrollToFraction = (page, f) => page.evaluate(f => {
  const s = document.getElementById('platforms');
  const top = s.getBoundingClientRect().top + scrollY;
  scrollTo({ top: top + f * (s.offsetHeight - innerHeight), behavior: 'instant' });
}, f);

/** Every event's marker centre and every tick's position, relative to its track's left edge, and the track widths. */
const measure = page => page.evaluate(() => {
  const s = document.getElementById('platforms');
  const out = { events: [], ticks: [], tracks: [] };
  for (const track of s.querySelectorAll('.evs')) {
    const t = track.getBoundingClientRect();
    out.tracks.push({ left: t.left, width: t.width, lane: track.closest('[data-lane]').dataset.lane });
    for (const ev of track.querySelectorAll('.ev')) {
      const m = ev.querySelector('.mk').getBoundingClientRect();
      out.events.push({ title: ev.querySelector('a').textContent.trim(), x: m.left + m.width / 2 - t.left, width: t.width });
    }
  }
  const axis = s.querySelector('.ticks').getBoundingClientRect();
  // a tick is its label, centred on its date
  for (const tick of s.querySelectorAll('.ticks .tick')) {
    const r = tick.getBoundingClientRect();
    out.ticks.push({ year: tick.textContent.trim(), x: r.left + r.width / 2 - axis.left, width: axis.width });
  }
  return out;
});

/** The lane cards and those of them whose box intersects the IronAFS card's (all boxes on screen: the tracks slide
 *  together, so this holds at every scroll position it is measured at). */
const finOverlaps = page => page.evaluate(() => {
  const s = document.getElementById('platforms');
  const f = s.querySelector('.fin .card').getBoundingClientRect();
  const cards = [...s.querySelectorAll('.lane:not(.fin-lane) .card')];
  const hits = cards.map(c => [c.querySelector('a').textContent.trim(), c.getBoundingClientRect()])
    .filter(([, r]) => r.left < f.right - 1 && f.left < r.right - 1 && r.top < f.bottom - 1 && f.top < r.bottom - 1)
    .map(([title, r]) => `${title}: ${Math.round(Math.min(r.right, f.right) - Math.max(r.left, f.left))}x${Math.round(Math.min(r.bottom, f.bottom) - Math.max(r.top, f.top))}`);
  return { cards: cards.length, hits };
});

// The IronAFS card sits in its own overlay lane, past every lane card (data-end, platforms.css): pinned at each of
// these sizes, no lane card intersects it; and the fit guard measures it, so an overlap would fall back to the list.
test.describe('the IronAFS card clears every lane card', () => {
  for (const [width, height] of [[1280, 720], [1366, 657], [1440, 900], [1728, 1000]]) {
    test(`pinned at ${width}x${height}`, async ({ page }) => {
      test.skip(page.viewportSize().width < 1000, 'desktop projects');
      await page.setViewportSize({ width, height });
      await page.goto('/');
      test.skip(!(await enhanced(page)), 'the enhancement is off here: the base-layer tests are the contract');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('#platforms')).not.toHaveClass(/story--flow/);
      for (const f of [0, 0.5, 1]) {
        await scrollToFraction(page, f);
        await frame(page);
        const m = await finOverlaps(page);
        expect(m.cards, 'every lane card measured').toBe(timeline.filter(e => e.lane !== 'ironafs').length);
        expect(m.hits, `at ${f}`).toEqual([]);
      }
    });
  }

  test('the fit guard falls back to the list when the IronAFS card would cover a lane card', async ({ page }) => {
    test.skip(page.viewportSize().width < 1000, 'desktop projects');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here');
    await page.evaluate(() => document.fonts.ready);
    const s = page.locator('#platforms');
    await expect(s).not.toHaveClass(/story--flow/);
    // the IronAFS card moved back over the last macOS card (where it once was: 1.03 of the track), measured again
    await page.evaluate(() => {
      document.querySelector('#platforms .tl').style.setProperty('--end', '1.03');
      dispatchEvent(new Event('resize'));
    });
    await expect(s).toHaveClass(/story--flow/);
    // and back: it pins again
    await page.evaluate(() => {
      const tl = document.querySelector('#platforms .tl');
      tl.style.setProperty('--end', tl.dataset.end);
      dispatchEvent(new Event('resize'));
    });
    await expect(s).not.toHaveClass(/story--flow/);
  });
});

test.describe('enhanced: the sideways timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here: the base-layer tests are the contract');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#platforms')).not.toHaveClass(/story--flow/);
  });

  test('each marker and each year tick sits at xFor(date) of the track, at every scroll position', async ({ page }) => {
    for (const f of [0, 0.5, 1]) {
      await scrollToFraction(page, f);
      await frame(page);
      const m = await measure(page);
      expect(m.events.map(e => e.title)).toEqual(expect.arrayContaining(timeline.map(e => e.title)));
      expect(m.events).toHaveLength(timeline.length);
      // all tracks (the lanes, the IronAFS overlay) are one width and move together
      for (const t of m.tracks) {
        expect(Math.abs(t.left - m.tracks[0].left), t.lane).toBeLessThan(1);
        expect(Math.abs(t.width - m.tracks[0].width), t.lane).toBeLessThan(1);
      }
      expect(Math.abs(m.ticks[0].width - m.tracks[0].width)).toBeLessThan(1);
      for (const e of timeline) {
        const got = m.events.find(g => g.title === e.title);
        expect(Math.abs(got.x - xFor(e.date) * got.width), `${e.title} at ${f}`).toBeLessThanOrEqual(8);
      }
      expect(m.ticks.length).toBeGreaterThanOrEqual(8);
      for (const t of m.ticks) expect(Math.abs(t.x - xFor(t.year) * t.width), `tick ${t.year}`).toBeLessThanOrEqual(8);
    }
  });

  test('events are in date order, in each lane and along the track', async ({ page }) => {
    const m = await measure(page);
    const byX = [...m.events].sort((a, b) => a.x - b.x).map(e => e.title);
    const byDate = [...timeline].sort((a, b) => xFor(a.date) - xFor(b.date)).map(e => e.title);
    expect(byX).toEqual(byDate);
    for (const lane of [...lanes.map(l => l.id), 'ironafs']) {
      const dom = await page.locator(`#platforms [data-lane="${lane}"] .ev :is(h3, h4) a`).allTextContents();
      expect(dom.map(t => t.trim()), lane).toEqual(timeline.filter(e => e.lane === lane).map(e => e.title));
    }
  });

  test('the track slides with scroll while the lane names stay where they are, visible', async ({ page }) => {
    const sample = () => page.evaluate(() => {
      const s = document.getElementById('platforms');
      return {
        track: s.querySelector('.evs').getBoundingClientRect().left,
        translate: getComputedStyle(s.querySelector('.evs')).translate,
        names: [...s.querySelectorAll('.lane > h3')].map(h => {
          const r = h.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), r.top + r.height / 2);
          return { left: Math.round(r.left), top: Math.round(r.top), visible: h.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && r.top >= 0 && r.bottom <= innerHeight && h.contains(hit) };
        }),
      };
    });
    const got = [];
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      await scrollToFraction(page, f);
      await frame(page);
      got.push(await sample());
    }
    // the animation runs: the track's computed translate changes, and the track moves left by more than a screen
    expect(new Set(got.map(g => g.translate)).size).toBeGreaterThan(3);
    for (let i = 1; i < got.length; i++) expect(got[i].track).toBeLessThan(got[i - 1].track);
    expect(got[0].track - got.at(-1).track).toBeGreaterThan(1440);
    for (const g of got) {
      g.names.forEach((n, i) => {
        // stationary (to rounding: the pinned stage may land a pixel off)
        expect(Math.abs(n.left - got[0].names[i].left), `name ${i}`).toBeLessThanOrEqual(2);
        expect(Math.abs(n.top - got[0].names[i].top), `name ${i}`).toBeLessThanOrEqual(2);
        expect(n.visible, `name ${i}`).toBe(true);
      });
    }
    expect(await page.locator('#platforms .lane > h3').allTextContents()).toEqual(lanes.map(l => l.name));
  });

  test('at every tenth of the slide, at least two event cards are wholly in view', async ({ page }) => {
    test.skip(page.viewportSize().width !== 1440 || page.viewportSize().height !== 900, 'measured at 1440x900');
    for (let i = 0; i <= 10; i++) {
      await scrollToFraction(page, 0.04 + 0.092 * i);
      await frame(page);
      const whole = await page.evaluate(() => [...document.querySelectorAll('#platforms .ev .card')].filter(card => {
        const r = card.getBoundingClientRect();
        const win = card.closest('.win').getBoundingClientRect();
        return r.left >= win.left && r.right <= Math.min(win.right, innerWidth) && r.top >= 0 && r.bottom <= innerHeight;
      }).map(card => card.querySelector('a').textContent.trim()));
      expect(whole.length, `at ${i * 10}% of the slide: ${whole.join(', ')}`).toBeGreaterThanOrEqual(2);
    }
  });

  test('the axis marks the scale breaks between their ticks', async ({ page }) => {
    const got = await page.evaluate(() => {
      const axis = document.querySelector('#platforms .ticks').getBoundingClientRect();
      const at = el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2 - axis.left; };
      return {
        width: axis.width,
        ticks: [...document.querySelectorAll('#platforms .tick')].map(t => [t.textContent.trim(), at(t)]),
        breaks: [...document.querySelectorAll('#platforms .brk')].map(b => [b.textContent.trim(), at(b)]),
      };
    });
    expect(got.breaks.length).toBe(breaks.length);
    breaks.forEach((date, i) => {
      const [text, x] = got.breaks[i];
      expect(text).toBe('≈');
      expect(Math.abs(x - xFor(date) * got.width)).toBeLessThanOrEqual(8);
      expect(got.ticks.some(([, t]) => t < x) && got.ticks.some(([, t]) => t > x)).toBe(true);
    });
    const x = year => got.ticks.find(([y]) => y === year)[1];
    expect(got.breaks.some(([, b]) => b > x('2020') && b < x('2023'))).toBe(true);
  });

  test('the IronAFS card is fully on screen at the end of the slide', async ({ page }) => {
    await scrollToFraction(page, 1);
    await frame(page);
    const r = await page.locator('#platforms .ev.fin .card').boundingBox();
    const vp = page.viewportSize();
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(vp.width);
    expect(r.y + r.height).toBeLessThanOrEqual(vp.height);
    // and not clipped away or covered: its title is what is hit at its centre
    const a = page.locator('#platforms .ev.fin a');
    expect(await a.evaluate(a => {
      const r = a.getBoundingClientRect();
      return a.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    })).toBe(true);
  });

  // The rise from the IronAFS marker to its card is a length (--lift, platforms.css). : the hero once registered
  // a custom property of the same name as a <number>, which made this length invalid: the connector had no height and
  // the card sat on the axis.
  test('the IronAFS card stands above the axis on its connector', async ({ page }) => {
    await scrollToFraction(page, 1);
    await frame(page);
    const m = await page.evaluate(() => {
      const fin = document.querySelector('#platforms .ev.fin');
      return {
        connector: parseFloat(getComputedStyle(fin, '::after').height),
        card: fin.querySelector('.card').getBoundingClientRect().bottom,
        marker: fin.querySelector('.mk').getBoundingClientRect(),
      };
    });
    expect(m.connector, 'the connector up to the card has a height').toBeGreaterThan(20);
    const axis = m.marker.top + m.marker.height / 2;
    expect(m.card, 'the card bottom above the axis').toBeLessThan(m.marker.top);
    expect(Math.abs(axis - m.connector - m.card), 'the card sits on top of its connector').toBeLessThan(4);
  });

  test('tabbing to an event link scrolls the track to it: no focused link is off screen', async ({ page, browserName }) => {
    // WebKit's Tab skips links unless Option is held (the macOS default)
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await scrollToFraction(page, 0);
    await frame(page);
    await page.locator('#platforms-h').focus();
    // every link: each event's title, then the source of its second fact, if any
    const links = timeline.flatMap(e => [e.title, ...(e.sources ?? []).map(l => l.label)]);
    const titles = [];
    for (let i = 0; i < links.length; i++) {
      await page.keyboard.press(tab);
      await frame(page);
      const state = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a.closest('#platforms')) return null;
        const r = a.getBoundingClientRect();
        const win = a.closest('.win').getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 30), r.top + r.height / 2);
        return { title: a.textContent.trim(), inWin: r.left >= win.left - 1 && r.right <= win.right + 1, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, onTop: a.contains(hit) };
      });
      expect(state, `tab ${i}`).not.toBeNull();
      expect(state, state.title).toMatchObject({ inWin: true, inView: true, onTop: true });
      titles.push(state.title);
    }
    // in reading order: the lanes, each in date order, then IronAFS
    expect(titles).toEqual(links);
  });
});

// The event descriptions are body text: 15 CSS px at least (the site's body-text floor) in every layout.
test('every event description is at least 15 px, base or enhanced', async ({ page }) => {
  await page.goto('/');
  const sizes = await page.locator('#platforms .card .t').evaluateAll(els => els.map(el => parseFloat(getComputedStyle(el).fontSize)));
  expect(sizes.length).toBeGreaterThan(5);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(15);
});

test.describe('base: a vertical list grouped by lane', () => {
  for (const mode of ['phone', 'static']) {
    test(`${mode}: the lanes in order, each a vertical list of its events in date order, every link visible`, async ({ page }) => {
      if (mode === 'phone') test.skip(page.viewportSize().width > 760, 'phone projects');
      else await page.addInitScript(() => {
        const add = () => document.documentElement?.classList.add('static');
        add();
        document.addEventListener('readystatechange', add);
      });
      await page.goto('/');
      expect(await enhanced(page)).toBe(false);
      const groups = await page.evaluate(() => [...document.querySelectorAll('#platforms [data-lane]')].map(g => ({
        lane: g.dataset.lane,
        name: g.querySelector('h3')?.textContent.trim() ?? null,
        top: g.getBoundingClientRect().top + scrollY,
        bottom: g.getBoundingClientRect().bottom + scrollY,
        events: [...g.querySelectorAll('.ev')].map(ev => {
          const r = ev.getBoundingClientRect();
          return { title: ev.querySelector('a').textContent.trim(), top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right };
        }),
      })));
      expect(groups.map(g => g.lane)).toEqual(['linux', 'macos', 'windows', 'ironafs']);
      expect(groups.slice(0, 3).map(g => g.name)).toEqual(lanes.map(l => l.name));
      const vw = page.viewportSize().width;
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (i) expect(g.top, g.lane).toBeGreaterThanOrEqual(groups[i - 1].bottom - 1);
        expect(g.events.map(e => e.title)).toEqual(timeline.filter(e => e.lane === g.lane).map(e => e.title));
        for (let j = 0; j < g.events.length; j++) {
          const e = g.events[j];
          if (j) expect(e.top, e.title).toBeGreaterThanOrEqual(g.events[j - 1].bottom - 1);
          expect(e.left).toBeGreaterThanOrEqual(0);
          expect(e.right).toBeLessThanOrEqual(vw);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
      for (const link of await page.locator('#platforms .ev a').all()) {
        await link.scrollIntoViewIfNeeded();
        await expect(link).toBeVisible();
        await expect(link).toBeInViewport();
      }
    });
  }
});
