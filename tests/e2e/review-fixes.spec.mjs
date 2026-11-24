import { test, expect } from '@playwright/test';

// Phones and tablets (below 900 px): the headline block leads over the picture under a scrim, the console closes the
// first screen. Every hero text line keeps its contrast against the backdrop actually behind it (the picture under the
// scrim, read from a screenshot with the text made transparent), no text box overlaps another or the console, and the
// console's replay control is in the first viewport.
async function overlayProblems(page) {
  const texts = await page.evaluate(() => [...document.querySelectorAll('.hero .pill, .hero h1, .hero .subline')].flatMap(t => {
    const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    const out = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('[aria-hidden="true"]')) continue;
      const cs = getComputedStyle(node.parentElement);
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        out.push({ name: t.tagName === 'H1' ? 'h1' : t.className, x: r.left, y: r.top, w: r.width, h: r.height, color: cs.color, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) });
      }
    }
    return out;
  }));
  const layout = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const parts = ['.hero .pill', '.hero h1', '.hero .subline', '.hero .hero-chips', '#hero .term'].map(s => ({ name: s, ...box(document.querySelector(s)) }));
    return { parts, replay: box(document.getElementById('replay')), vh: innerHeight, vw: innerWidth };
  });
  // the backdrop alone: the copy made transparent through the CSSOM (the CSP refuses a <style> tag), layout kept
  await page.evaluate(() => {
    for (const t of document.querySelectorAll('.hero-copy, .hero-copy *')) {
      t.style.setProperty('color', 'transparent', 'important');
      t.style.setProperty('text-shadow', 'none', 'important');
      t.style.setProperty('border-color', 'transparent', 'important');
    }
  });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = await page.screenshot();
  const contrast = await page.evaluate(async ({ png, texts }) => {
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
      const large = t.name === 'h1' && (t.size >= 24 || (t.size >= 18.66 && t.weight >= 700));
      out.push({ name: t.name, ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5 });
    }
    return out;
  }, { png: shot.toString('base64'), texts });
  const overlaps = [];
  const { parts } = layout;
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) overlaps.push(`${a.name} overlaps ${b.name}`);
  }
  return { contrast, overlaps, layout };
}

function expectOverlay({ contrast, overlaps, layout }) {
  expect(new Set(contrast.map(t => t.name)), 'the pill, the h1 and the subline were measured').toEqual(new Set(['pill', 'h1', 'subline']));
  for (const t of contrast) expect(t.ratio, `${t.name}: ${t.ratio} over its backdrop`).toBeGreaterThanOrEqual(t.need);
  expect(overlaps).toEqual([]);
  const { replay, vh, vw } = layout;
  expect(replay.top, 'replay in the first viewport').toBeGreaterThanOrEqual(0);
  expect(replay.bottom, 'replay in the first viewport').toBeLessThanOrEqual(vh);
  expect(replay.left).toBeGreaterThanOrEqual(0);
  expect(replay.right).toBeLessThanOrEqual(vw);
}

for (const width of [360, 390, 430]) {
  test(`phone hero at ${width}: the poster shows its full width, and the headline block over it is legible and clear of the console`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const m = await page.evaluate(() => {
      const img = document.querySelector('img.hero-poster') ?? document.querySelector('.hero-poster img');
      const box = img.getBoundingClientRect();
      return { fit: getComputedStyle(img).objectFit, ratio: img.naturalWidth / img.naturalHeight, boxW: box.width, boxH: box.height, shownW: Math.min(box.width, box.height * (img.naturalWidth / img.naturalHeight)), left: box.left, vw: window.innerWidth };
    });
    expect(m.ratio).toBeGreaterThan(1.5);
    expect(m.fit).toBe('contain');
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.boxW).toBeGreaterThanOrEqual(m.vw - 1);
    expect(m.shownW, 'no horizontal crop').toBeGreaterThanOrEqual(m.boxW - 1);
    expectOverlay(await overlayProblems(page));
  });
}

test('on a desktop width the poster still covers the hero', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const fit = await page.evaluate(() => getComputedStyle(document.querySelector('img.hero-poster') ?? document.querySelector('.hero-poster img')).objectFit);
  expect(fit).toBe('cover');
});


for (const width of [360, 180]) {
  test(`focus every control at ${width} px, from the bottom up: none sits under the header`, async ({ page }) => {
    // WebKit's Tab skips links by default, so focus() drives the walk (the same scroll-into-view runs).
    await page.setViewportSize({ width, height: 640 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const result = await page.evaluate(async () => {
      const header = document.getElementById('site-header');
      const els = [...document.querySelectorAll('main a[href], main button, main h2[tabindex], footer a[href]')]
        .filter(el => el.getClientRects().length > 0 && !el.closest('dialog, .sr-only')).reverse();
      const under = [];
      for (const el of els) {
        el.focus();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const top = el.getBoundingClientRect().top;
        const bottom = header.getBoundingClientRect().bottom;
        if (top < bottom - 1) under.push({ name: `${el.tagName.toLowerCase()}.${el.className}`, top, headerBottom: bottom });
      }
      return { count: els.length, under };
    });
    expect(result.count, 'the walk reached page content').toBeGreaterThan(8);
    expect(result.under).toEqual([]);
  });
}

test('the header height variable follows a wrapped header and is stable (no feedback loop)', async ({ page }) => {
  await page.setViewportSize({ width: 180, height: 640 });
  await page.goto('/');
  const { h, v } = await page.evaluate(() => ({
    h: document.getElementById('site-header').getBoundingClientRect().height,
    v: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-live')),
  }));
  expect(Math.abs(v - h)).toBeLessThanOrEqual(1);
  await page.waitForTimeout(500);
  const h2 = await page.evaluate(() => document.getElementById('site-header').getBoundingClientRect().height);
  expect(h2, 'the header does not keep growing').toBe(h);
});

test('reduced motion: hovering the GitHub button shows no static flames', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the GitHub flames are a desktop hover');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const github = page.locator('.github').first();
  await github.hover({ force: true });
  const state = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.github .fire'));
    return { display: s.display, opacity: s.opacity };
  });
  expect(state.display === 'none' || state.opacity === '0').toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await github.hover({ force: true });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.github .fire')).opacity)).toBe('1');
});

// The word's letters at rest span 53.2-73.4% of the 16:10 picture (measured from the scene's letter boxes, which the
// poster is rendered from. The picture covers
// the hero box centred, so in a box of another shape the band sits around the box's centre at that share of the
// picture's covered height.
const WORD_TOP = 0.53;
const WORD_BOTTOM = 0.735;
const sizes = [[900, 800], [1024, 800], [1280, 800], [1440, 900], [1920, 1080], [1024, 768], [1366, 1024], [1024, 1366], [768, 1024]];
const wholeH1 = ['1280x800', '1440x900', '1920x1080'];
for (const [width, height] of sizes) {
  test(`hero at ${width}x${height}: console, word, then status pill and h1 with no overlap${wholeH1.includes(`${width}x${height}`) ? ', the whole h1 in the first viewport' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const m = await page.evaluate(() => {
      const img = document.querySelector('img.hero-poster') ?? document.querySelector('.hero-poster img');
      const r = el => { const b = document.querySelector(el).getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY }; };
      const box = img.getBoundingClientRect();
      return { posterTop: box.top + scrollY, posterH: box.height, posterW: box.width, term: r('.term'), status: r('.hero .pill'), h1: r('.hero h1'), fold: innerHeight };
    });
    const scaled = Math.max(m.posterH, (m.posterW * 1800) / 2880);
    const centre = m.posterTop + m.posterH / 2;
    const wordTop = centre + (WORD_TOP - 0.5) * scaled;
    const wordBottom = centre + (WORD_BOTTOM - 0.5) * scaled;
    if (width >= 900) {
      expect(m.term.bottom, 'console ends above the word').toBeLessThanOrEqual(wordTop);
      expect(m.status.top, 'status pill below the word').toBeGreaterThanOrEqual(wordBottom);
      expect(m.h1.top, 'h1 below the word').toBeGreaterThanOrEqual(wordBottom);
    } else {
      // below 900 px the headline block leads over the picture (the phone layout): the console still starts below
      // the picture, and the text over the picture is legible and clear of the console
      expect(m.term.top, 'phones: the console starts below the picture').toBeGreaterThanOrEqual(m.posterTop + m.posterH - 1);
      expectOverlay(await overlayProblems(page));
    }
    if (wholeH1.includes(`${width}x${height}`)) expect(m.h1.bottom, 'the whole h1 is in the first viewport').toBeLessThanOrEqual(m.fold);
  });
}

// The console keeps its size: the letters' clearance comes from the scene's framing.
test('the desktop console keeps its type size: at least 17.5 px at 1280 wide', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const size = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.hero .console')).fontSize));
  expect(size).toBeGreaterThanOrEqual(17.5);
});

// Keep the headline on one line at desktop widths (the room goes to the word), still the largest text
// on the page; narrower screens wrap it inside its box.
const h1Lines = page => page.evaluate(() => {
  const h1 = document.querySelector('.hero h1');
  const range = document.createRange();
  range.selectNodeContents(h1);
  const tops = new Set([...range.getClientRects()].map(r => Math.round(r.top)));
  const box = h1.getBoundingClientRect();
  return { lines: tops.size, size: parseFloat(getComputedStyle(h1).fontSize), right: box.right, overflow: h1.scrollWidth - h1.clientWidth, vw: innerWidth };
});
for (const [width, height] of [[1280, 800], [1440, 900], [1728, 1117], [1920, 1080]]) {
  test(`the headline is one line at ${width}x${height}, at least 60 px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const m = await h1Lines(page);
    expect(m.lines, 'one line').toBe(1);
    expect(m.size).toBeGreaterThanOrEqual(60);
  });
}
for (const [width, height] of [[360, 740], [390, 844], [768, 1024], [1024, 768]]) {
  test(`the headline wraps inside its box at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const m = await h1Lines(page);
    expect(m.overflow).toBeLessThanOrEqual(0);
    expect(m.right).toBeLessThanOrEqual(m.vw);
  });
}
