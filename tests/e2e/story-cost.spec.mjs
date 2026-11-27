import { story } from '../../src/content/story.ts';
import { test, expect } from '@playwright/test';
import { allowFrames, unseenLines } from './util.mjs';

// The cost of shipping kernel code (#cost): four stacked cards. Enhancement: each stays flat, pins
// and plays its picture (phases from src/scripts/story/stack.ts, measured from the layout) before the next slides
// over it. Phone and base: the cards in normal flow, each picture at its final state.

const costCards = [story.cost.windows, story.cost.macos, story.cost.linux, story.cost.ironafs];
const HEADINGS = [
  'New kernel drivers need Microsoft signing.',
  'Third-party kexts need Reduced Security.',
  'A kernel update can mean a rebuild.',
  'IronAFS ships no kernel code.',
];
const DESIGN_LINE = 'planned: Linux first (FUSE), then macOS (FSKit), then Windows (local SMB)';
// the elements that play in each card (the steps), and the macOS schematic's switch and tick
const STEPS = '.on';

const isStatic = page => page.addInitScript(() => {
  const add = () => document.documentElement?.classList.add('static');
  add();
  document.addEventListener('readystatechange', add);
});

const enhanced = page => page.evaluate(() => CSS.supports('animation-timeline: view()')
  && matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)').matches
  && !document.documentElement.classList.contains('static'));

const frame = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/**
 * Scrolls through the whole stack (from its top entering the viewport to its bottom leaving), `step` of the
 * viewport's height at a time, and records at each position: each card's top, the opacity of each of its steps,
 * the typed command's visible and full widths, and card 0's filter.
 */
async function sweep(page, step = 0.02) {
  // its positions, a frame each
  allowFrames(2 * await page.evaluate(step => Math.ceil((document.querySelector('#cost .stack').offsetHeight + innerHeight) / (step * innerHeight)) + 2, step));
  return page.evaluate(async step => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const stack = document.querySelector('#cost .stack');
    const start = stack.getBoundingClientRect().top + scrollY - innerHeight;
    const end = start + stack.offsetHeight + innerHeight;
    const cards = [...stack.querySelectorAll('.scard')];
    const typed = stack.querySelector('.typed');
    const out = [];
    for (let s = start; s <= end; s += step * innerHeight) {
      scrollTo({ top: s, behavior: 'instant' });
      await frame();
      out.push({
        s: scrollY,
        tops: cards.map(c => c.getBoundingClientRect().top),
        steps: cards.map(c => [...c.querySelectorAll('.on')].map(el => Number(getComputedStyle(el).opacity))),
        highlights: cards.map(c => [...c.querySelectorAll('.vis .on')].map(el => getComputedStyle(el).borderColor !== 'rgb(56, 59, 71)')),
        typed: [typed.getBoundingClientRect().width, typed.scrollWidth],
        filters: cards.map(c => getComputedStyle(c).filter),
        rotate: cards.map(c => getComputedStyle(c).rotate),
      });
    }
    return { vh: innerHeight, out };
  }, step);
}

/** The samples where card `i` is pinned: the longest run with its top within 4 px of the run's first top. */
function pinnedRun(samples, i) {
  let best = [];
  for (let a = 0; a < samples.length; a++) {
    let b = a;
    while (b + 1 < samples.length && Math.abs(samples[b + 1].tops[i] - samples[a].tops[i]) <= 4) b++;
    if (b - a + 1 > best.length) best = samples.slice(a, b + 1);
    a = b;
  }
  return best;
}

for (const mode of ['static', 'default']) {
  test.describe(`#cost, ${mode}`, () => {
    test.beforeEach(async ({ page }) => {
      if (mode === 'static') await isStatic(page);
      await page.goto('/');
    });

    test('the head and the four cards, in order, with their exact headings', async ({ page }) => {
      await expect(page.locator('#cost h2')).toHaveText('Kernel code is hard to ship, and harder to run from your own build.');
      await expect(page.locator('#cost .eyebrow')).toHaveText('/why · shipping kernel code');
      await expect(page.locator('#cost .scard')).toHaveCount(4);
      await expect(page.locator('#cost .scard h3')).toHaveText(HEADINGS);
      await expect(page.locator('#cost .scard .os')).toHaveText(costCards.map(card => 'platform' in card ? `${card.os} ${card.platform}` : card.os));
      await expect(page.locator('#cost .scard .lede')).toHaveText(costCards.map(card => card.lede));
      const pipe = page.locator('#cost .scard').nth(0).locator('.pipe');
      await expect(pipe.locator(':scope > li')).toHaveText(story.cost.windows.steps.map((step, i) => `${i + 1} ${step}`));
      await expect(page.getByRole('link', { name: story.cost.windows.testing.link.label })).toHaveAttribute('href', story.cost.windows.testing.link.href);
      await expect(page.locator('#cost .scard').nth(1)).toContainText(story.cost.macos.dialog.allow);
      await expect(page.locator('#cost .scard').nth(1)).toContainText(story.cost.macos.dialog.label);
    });

    test('the Debian workflow is labelled and afs status shows the current state', async ({ page }) => {
      const debian = page.locator('#cost [data-illustrative="debian"]');
      await expect(debian).toHaveCount(1);
      await expect(page.locator('#cost-linux ~ .foot').getByRole('link', { name: 'Debian Secure Boot' })).toBeVisible();
      await expect(debian.locator('.cost-panel-note')).toContainText(story.cost.linux.workflow.failure);
      await expect(debian).toContainText(story.cost.linux.workflow.lines.at(-1).text);
      const status = page.locator('#cost .afs');
      await expect(status).toHaveCount(1);
      await expect(status.locator('.typed')).toHaveText(story.cost.ironafs.command);
      await expect(status.locator('.design')).toHaveText(DESIGN_LINE);
      await expect(status).toContainText('ironafsd: not running yet · M2a in progress');
      await expect(status).not.toContainText('illustrative output');
      await expect(status.locator('.bigout > span')).toHaveText(['ironafsd: not running yet · M2a in progress', DESIGN_LINE]);
    });

    test('the Debian workflow fits its panel without a console frame or clipped text', async ({ page }) => {
      const pre = await page.locator('#cost .cost-terminal').evaluate(el => {
        const cs = getComputedStyle(el);
        return { border: cs.borderTopWidth, shadow: cs.boxShadow, overflow: `${cs.overflowX} ${cs.overflowY}`, clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 };
      });
      expect(pre).toEqual({ border: '0px', shadow: 'none', overflow: 'visible visible', clipped: false });
    });

    test('the served markup has no style= attribute, and the drops picture is AVIF/WebP', async ({ page }) => {
      const html = await (await page.request.get('/')).text();
      const section = html.slice(html.indexOf('<section id="cost"'), html.indexOf('<section id="platforms"'));
      expect(section.length).toBeGreaterThan(1000);
      expect(section).not.toMatch(/<[^>]*\sstyle=/);
      expect(section).toMatch(/drops[^"]*\.avif/);
      expect(section).toMatch(/drops[^"]*\.webp/);
      expect(section).not.toMatch(/drops[^"]*\.png/);
    });

    test('no focusable element in #cost is hidden or nearly transparent at any point of the stack', async ({ page }) => {
      allowFrames(2 * 61); // 61 positions, a frame each
      const bad = await page.evaluate(async () => {
        const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const stack = document.querySelector('#cost .stack');
        const start = stack.getBoundingClientRect().top + scrollY - innerHeight;
        const out = [];
        for (let i = 0; i <= 60; i++) {
          scrollTo({ top: start + (i / 60) * (stack.offsetHeight + innerHeight), behavior: 'instant' });
          await frame();
          for (const el of document.querySelectorAll('#cost :is(a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]))')) {
            let opacity = 1;
            let hidden = false;
            for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
              const cs = getComputedStyle(a);
              if (cs.display === 'none' || cs.visibility === 'hidden') { hidden = true; break; }
              opacity *= Number(cs.opacity);
            }
            if (!hidden && opacity < 0.1) out.push(`${i}: ${el.textContent.trim().slice(0, 30)}`);
          }
        }
        return out;
      });
      expect(bad).toEqual([]);
    });
  });
}

// The terminal output also keeps the 12 CSS px floor.
test('the IronAFS output text is at least 12 px', async ({ page }) => {
  await page.goto('/');
  const sizes = await page.locator('#cost .bigout > span').evaluateAll(els => els.map(el => parseFloat(getComputedStyle(el).fontSize)));
  expect(sizes, 'both output lines measured').toHaveLength(2);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
});

test('reduced motion: four cards in normal flow, every step at full opacity, the command typed out', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const cards = page.locator('#cost .scard');
  await expect(cards).toHaveCount(4);
  const boxes = await cards.evaluateAll(els => els.map(el => ({ ...el.getBoundingClientRect().toJSON(), position: getComputedStyle(el).position })));
  for (const [i, box] of boxes.entries()) {
    expect(box.position, `card ${i}`).not.toBe('sticky');
    if (i > 0) expect(box.top, `card ${i} below card ${i - 1}`).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
    expect(box.right).toBeLessThanOrEqual(page.viewportSize().width + 1);
  }
  await cards.nth(0).scrollIntoViewIfNeeded();
  const steps = await page.locator(`#cost ${STEPS}`).evaluateAll(els => els.map(el => Number(getComputedStyle(el).opacity)));
  expect(steps).toHaveLength(13);
  expect(steps.every(o => o === 1)).toBe(true);
  // the macOS schematic at its final state: Reduced chosen, the box ticked
  expect(await page.locator('#cost .mac .doff').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(0);
  expect(await page.locator('#cost .mac .don').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  const typed = page.locator('#cost .typed');
  await typed.scrollIntoViewIfNeeded();
  const [w, sw] = await typed.evaluate(el => [el.getBoundingClientRect().width, el.scrollWidth]);
  expect(w).toBeGreaterThanOrEqual(sw - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

// at the project's size, and on desktop also where the text column covers more of the card
for (const size of [null, { width: 1024, height: 768 }, { width: 800, height: 900 }]) test(`the IronAFS card: its text keeps AA contrast over the drops picture${size ? ` at ${size.width}` : ''}`, async ({ page }) => {
  if (size) {
    test.skip(page.viewportSize().width <= 760, 'phone projects: their own size only');
    await page.setViewportSize(size);
  }
  // the privacy notice closed (a choice made): its fixed bar would cover the card's last lines on a phone, and they
  // would be measured against the notice's own text instead of the picture
  await page.addInitScript(() => localStorage.setItem('ironafs-analytics-choice-v1', '{"value":"denied"}'));
  await page.goto('/');
  const card = page.locator('#cost .scard.iron');
  if (await enhanced(page)) {
    // pinned, after the output has appeared
    await page.evaluate(() => {
      const stack = document.querySelector('#cost .stack');
      scrollTo({ top: stack.getBoundingClientRect().top + scrollY + stack.offsetHeight - innerHeight * 0.95, behavior: 'instant' });
    });
  } else {
    await card.scrollIntoViewIfNeeded();
  }
  await frame(page);
  await expect(card.locator('.iron-art img')).toBeVisible();
  await card.locator('.iron-art img').evaluate(img => img.decode?.());
  // the text's boxes and colours, then the picture alone behind them (text made invisible, layout kept)
  // each line of each text node (its ink box, not the element's: a block's box spans the column), with its colour
  const texts = await card.evaluate(el => [...el.querySelectorAll('.os, h3, .lede, .bigcmd, .bigout > span')].flatMap(t => {
    const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    const out = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const cs = getComputedStyle(node.parentElement);
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        out.push({ name: t.textContent.trim().slice(0, 24), x: r.left, y: r.top, w: r.width, h: r.height, color: cs.color, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) });
      }
    }
    return out;
  }));
  // through the CSSOM (the CSP refuses a <style> tag)
  await card.evaluate(el => {
    for (const t of [el.querySelector('.iron-copy'), ...el.querySelectorAll('.iron-copy *')]) {
      t.style.setProperty('color', 'transparent', 'important');
      t.style.setProperty('text-shadow', 'none', 'important');
    }
    el.querySelector('.bigcmd .cur').style.setProperty('visibility', 'hidden', 'important');
  });
  await frame(page);
  const shot = await page.screenshot();
  const worst = await page.evaluate(async ({ png, texts }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const scale = img.width / innerWidth;
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    const probe = document.createElement('canvas').getContext('2d');
    const out = [];
    for (const t of texts) {
      probe.fillStyle = '#000'; probe.fillStyle = t.color; probe.fillRect(0, 0, 1, 1);
      const [tr, tg, tb] = probe.getImageData(0, 0, 1, 1).data;
      const lt = lum(tr, tg, tb);
      const x = Math.max(0, Math.round(t.x * scale)), y = Math.max(0, Math.round(t.y * scale));
      const w = Math.min(c.width - x, Math.round(t.w * scale)), h = Math.min(c.height - y, Math.round(t.h * scale));
      if (w <= 0 || h <= 0) continue;
      const d = g.getImageData(x, y, w, h).data;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, lum(d[i], d[i + 1], d[i + 2]));
      const ratio = (Math.max(lt, max) + 0.05) / (Math.min(lt, max) + 0.05);
      const large = t.size >= 24 || (t.size >= 18.66 && t.weight >= 700);
      out.push({ name: t.name, ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5 });
    }
    return out;
  }, { png: shot.toString('base64'), texts });
  expect(worst.length).toBeGreaterThanOrEqual(5);
  for (const t of worst) expect(t.ratio, `${t.name}: ${t.ratio}`).toBeGreaterThanOrEqual(t.need);
});

// A short window (a landscape phone, a small laptop window): under 620 px tall the enhancement is off (the base layer);
// above it the stack pins only when every card fits under its sticky top, and otherwise the cards are in normal flow.
// Either way, every text line of every card is shown in full, on top (not under the header or a later card), at some
// scroll position (unseenLines, util.mjs; story-fit.spec.mjs runs it over every pinned section at more sizes).
for (const size of [{ width: 844, height: 390 }, { width: 1280, height: 360 }, { width: 1280, height: 720 }]) {
  test(`at ${size.width}x${size.height} every line of every card is seen whole and on top at some scroll position`, async ({ page }) => {
    test.skip(page.viewportSize().width <= 760, 'a desktop browser resized: phone projects keep their own size');
    test.setTimeout(150_000);
    await page.setViewportSize(size);
    await page.goto('/');
    await frame(page);
    const count = await page.locator('#cost .stack :is(.os, h3, .lede, .foot, .pipe li, .mac p, .cost-terminal li, .cost-panel-note, .bigcmd, .bigout span)').count();
    expect(count).toBeGreaterThanOrEqual(30);
    expect(await unseenLines(page, '#cost .stack')).toEqual([]);
    const flow = await page.locator('#cost .stack').evaluate(el => el.classList.contains('stack--flow'));
    if (size.height < 620) {
      expect(await enhanced(page)).toBe(false);
      expect(flow).toBe(false);
    } else {
      const clearance = await page.locator('#cost .stack').evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--analytics-clearance')) || 0);
      expect(flow).toBe(clearance > 720 - (0.84 * 720 + 66));
    }
  });
}

test.describe('enhancement', () => {
  test.beforeEach(async ({ page }) => {
    // the sweeps take one sample per 2% of the viewport over the whole stack: room for a loaded machine
    test.setTimeout(150_000);
    await page.addInitScript(() => localStorage.setItem('ironafs-analytics-choice-v1', '{"value":"denied"}'));
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here: the base layer is the contract');
  });

  test('stack.ts sets each step\'s range from the layout, and redoes it when the window changes', async ({ page }) => {
    const ranges = () => page.locator(`#cost ${STEPS}`).evaluateAll(els => els.map(el => el.style.getPropertyValue('--r')));
    await expect.poll(async () => (await ranges()).every(r => /^cover [\d.]+% cover [\d.]+%$/.test(r))).toBe(true);
    const before = await ranges();
    // in order: each card's steps after one another, and each card's after the previous card's
    const starts = before.map(r => parseFloat(r.split(' ')[1]));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(async () => (await ranges())[0]).not.toBe(before[0]);
  });

  test('before the stack reaches the viewport its steps are at their final state (axe reads the page there)', async ({ page }) => {
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await frame(page);
    expect(await page.evaluate(() => document.querySelector('#cost .stack').getBoundingClientRect().top)).toBeGreaterThan(await page.evaluate(() => innerHeight));
    const steps = await page.locator(`#cost ${STEPS}`).evaluateAll(els => els.map(el => Number(getComputedStyle(el).opacity)));
    expect(steps.every(o => o === 1)).toBe(true);
  });

  test('each platform card highlights its steps in sequence and keeps them readable', async ({ page }) => {
    const { vh, out } = await sweep(page);
    for (let i = 0; i < 3; i++) {
      const run = pinnedRun(out, i);
      expect(run.at(-1).s - run[0].s, `card ${i} pinned for at least 10vh`).toBeGreaterThanOrEqual(0.1 * vh);
      expect(run.every(sample => sample.steps[i].every(opacity => opacity === 1))).toBe(true);
      const steps = run[0].highlights[i];
      const firstHighlights = steps.map((_, step) => run.findIndex(sample => sample.highlights[i][step]));
      expect(firstHighlights.every(sample => sample >= 0)).toBe(true);
      expect(new Set(firstHighlights).size).toBe(steps.length);
      expect(firstHighlights).toEqual([...firstHighlights].sort((a, b) => a - b));
    }
  });

  test('the cards stay flat, and the earlier card dims behind the next', async ({ page }) => {
    const { out } = await sweep(page, 0.05);
    for (let i = 0; i < 4; i++) {
      for (const sample of out) expect(sample.rotate[i], `card ${i} stays flat`).toMatch(/^(none|x 0deg)$/);
    }
    for (let i = 0; i < 3; i++) {
      // when card i + 1 is pinned, card i behind it is dimmed
      const next = pinnedRun(out, i + 1)[0];
      expect(next.filters[i], `card ${i} behind card ${i + 1}`).toMatch(/brightness\(0\.[0-5]/);
    }
  });

  test('the last card types "afs status" and shows its output before the stack ends', async ({ page }) => {
    const { out } = await sweep(page);
    const run = pinnedRun(out, 3);
    expect(run[0].typed[0], 'nothing typed yet at the pin').toBeLessThan(4);
    const done = run.findIndex(sample => sample.typed[0] >= sample.typed[1] - 1);
    expect(done, 'the command is typed out while the card is pinned').toBeGreaterThanOrEqual(0);
    expect(run.slice(done).some(sample => Math.min(...sample.steps[3]) >= 0.99), 'then the output').toBe(true);
    await expect(page.locator('#cost .typed')).toHaveText(story.cost.ironafs.command);
  });

  // WCAG 2.2.2: the IronAFS command's cursor blinks for no more than five seconds, then holds still; coming back into
  // view starts the five seconds again.
  test('the IronAFS cursor stops blinking within five seconds and blinks again when it comes back into view', async ({ page }) => {
    const cursor = page.locator('#cost .bigcmd .cur');
    const blink = () => cursor.evaluate(el => {
      const animation = el.getAnimations().find(a => a.animationName === 'cs-blink');
      return animation && { state: animation.playState, end: animation.effect.getComputedTiming().endTime, time: animation.currentTime };
    });
    expect((await blink()).end).toBeLessThanOrEqual(5000);
    await cursor.evaluate(el => scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight / 2, behavior: 'instant' }));
    await expect.poll(blink).toMatchObject({ state: 'running' });
    await expect.poll(async () => (await blink()).state, { timeout: 7000 }).toBe('finished');
    expect(await cursor.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await frame(page);
    await cursor.evaluate(el => scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight / 2, behavior: 'instant' }));
    await expect.poll(blink).toMatchObject({ state: 'running' });
  });

  test('macOS: the schematic switches from Full to Reduced and the box ticks while the card is pinned', async ({ page }) => {
    allowFrames(2 * 121); // 121 positions, a frame each
    const states = await page.evaluate(async () => {
      const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const stack = document.querySelector('#cost .stack');
      const start = stack.getBoundingClientRect().top + scrollY - innerHeight;
      const card = stack.querySelectorAll('.scard')[1];
      const out = [];
      for (let i = 0; i <= 120; i++) {
        scrollTo({ top: start + (i / 120) * (stack.offsetHeight + innerHeight), behavior: 'instant' });
        await frame();
        out.push({
          off: Number(getComputedStyle(card.querySelector('.doff')).opacity),
          on: Number(getComputedStyle(card.querySelector('.don')).opacity),
          tick: getComputedStyle(card.querySelector('.c')).backgroundColor,
        });
      }
      return out;
    });
    expect(states[0]).toMatchObject({ off: 1, on: 0 });
    expect(states.at(-1)).toMatchObject({ off: 0, on: 1 });
    expect(states[0].tick).not.toBe(states.at(-1).tick);
  });
});
