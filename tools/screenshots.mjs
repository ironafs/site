// Takes reference screenshots, into test-results/screenshots/ unless --out says otherwise: every section at 1440x900 and at
// 390x844, the theme-following parts (the hero at the top, /built, /follow, the footer, the 404 page) in both themes.
// They are reference images to look at and diff by eye, not pixel gates: fonts and GL differ between machines, and the
// scene is not pixel-deterministic. Layout, overflow and axe are gated structurally (layout-v2.spec.mjs, a11y.spec.mjs).
// The hero is a return visit (the scene starts at its finished state), drawn with the host's GPU where there is one.
// Run by hand after a build; not part of CI:
//   npm run build && node tools/screenshots.mjs [--out <dir>] [--nojs <dir>]
// --out writes them elsewhere. --nojs <dir> also shoots #design and #platforms at 1440 with
// JavaScript disabled (the base layer, ) into <dir>. PORT picks the test server's port (default 4399).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const option = name => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
const out = option('--out') ?? fileURLToPath(new URL('../test-results/screenshots/', import.meta.url));
const nojs = option('--nojs');
const port = Number(process.env.PORT || 4399);
const base = `http://127.0.0.1:${port}`;
mkdirSync(out, { recursive: true });
if (nojs) mkdirSync(nojs, { recursive: true });

const server = spawn(process.execPath, [fileURLToPath(new URL('../tests/e2e/serve.mjs', import.meta.url))], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'inherit',
});

/** Waits until the page has held still for three frame pairs (a smooth scroll may still be under way). */
const settle = page => page.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  for (let last = NaN, still = 0; still < 3; still = scrollY === last ? still + 1 : 0) { last = scrollY; await frame(); }
});

/** Scrolls to `f` (0..1) of a pinned section's pinned scroll: its top at the viewport's top to its bottom at the bottom. */
async function pinnedAt(page, selector, f) {
  await settle(page);
  await page.evaluate(({ selector, f }) => {
    const s = document.querySelector(selector);
    const header = selector === '.hero-pin' ? document.getElementById('site-header').getBoundingClientRect().height : 0;
    const top = s.getBoundingClientRect().top + scrollY - header;
    scrollTo({ top: Math.round(top + f * (s.offsetHeight - (innerHeight - header))), behavior: 'instant' });
  }, { selector, f });
  await settle(page);
  await page.waitForTimeout(300);
}

/** Scrolls so #cost's card `i` is pinned and alone (its steps lit), as the reference shows each platform. */
async function costCard(page, i) {
  await settle(page);
  await page.evaluate(i => {
    const stack = document.querySelector('#cost .stack');
    const cards = [...stack.querySelectorAll(':scope > .scard')];
    const start = stack.getBoundingClientRect().top + scrollY - innerHeight;
    const end = start + stack.offsetHeight + innerHeight;
    // pinned: the card has stopped moving (its sticky top, offset by the stack's own pin); alone: the next card is
    // still below the viewport. The last such position, so its steps are lit.
    const tops = [];
    for (let y = start; y <= end; y += 8) {
      scrollTo({ top: y, behavior: 'instant' });
      tops.push({ y, top: cards[i].getBoundingClientRect().top, next: cards[i + 1]?.getBoundingClientRect().top ?? Infinity });
    }
    let pinned = null;
    let best = start;
    for (let k = 0; k + 1 < tops.length; k++) {
      if (Math.abs(tops[k].top - tops[k + 1].top) > 0.5 || tops[k].top <= 0) continue;
      pinned ??= tops[k].top;
      if (Math.abs(tops[k].top - pinned) <= 2 && tops[k].next >= innerHeight - 2) best = tops[k].y;
    }
    scrollTo({ top: best, behavior: 'instant' });
  }, i);
  await settle(page);
  await page.waitForTimeout(300);
}

/** An element's shot, the fixed header hidden (it would paint over a shot taller than the viewport), its pictures loaded.
 *  With JavaScript disabled Chromium runs no page callbacks for an evaluate (no promise settles): `js: false` waits. */
async function element(page, selector, path, { js = true } = {}) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  if (js) {
    await page.evaluate(selector => Promise.all([...document.querySelector(selector).querySelectorAll('img')]
      .map(img => { img.loading = 'eager'; return img.decode().catch(() => {}); })), selector);
  } else await page.waitForTimeout(1500);
  await page.evaluate(() => { document.getElementById('site-header').style.visibility = 'hidden'; });
  await el.screenshot({ path });
  await page.evaluate(() => { document.getElementById('site-header').style.visibility = ''; });
}

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not up yet */ }
    if (i > 50) throw new Error('the test server did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const gpu = process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ args: gpu });

  /** A fresh page at `width`x`height` on `path`, a return visit; with JavaScript, the hero's scene drawn. */
  async function open({ width, height, scheme = 'dark', js = true, path = '/' }) {
    const mobile = width < 761;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, colorScheme: scheme, javaScriptEnabled: js });
    const page = await context.newPage();
    page.on('pageerror', e => console.error(`page error (${width} ${scheme}): ${e.message}`));
    await page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1'));
    await page.goto(`${base}${path}`);
    if (js) await page.evaluate(() => document.fonts.ready);
    if (js && path === '/') {
      await page.waitForFunction(() => document.getElementById('hero')?.dataset.scene === 'live', null, { timeout: 60_000 })
        .catch(() => console.warn(`the scene did not draw at ${width} (${scheme}): the poster is shown`));
    }
    await page.waitForTimeout(1500);
    return page;
  }
  const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

  // 1440: the pinned sections at their phases (viewport shots), the rest as elements
  {
    const page = await open({ width: 1440, height: 900 });
    await shot(page, '1440-01-hero');
    await pinnedAt(page, '.hero-pin', 1);
    await shot(page, '1440-01-hero-handoff');
    for (const [name, selector, f] of [
      ['02-why', '#why', 0.4], ['03-numbers', '#numbers', 0.25],
      ['04-design-linux', '#design', 0.15], ['04-design-macos', '#design', 0.5], ['04-design-windows', '#design', 0.85],
      ['05-rust', '#rust', 0.3], ['05-rust-density', '#rust', 0.9], ['08-platforms', '#platforms', 0.5],
    ]) {
      await pinnedAt(page, selector, f);
      await shot(page, `1440-${name}`);
    }
    for (const [i, os] of ['windows', 'macos', 'linux', 'ironafs'].entries()) {
      await costCard(page, i);
      await shot(page, `1440-07-cost-${os}`);
    }
    await element(page, '#rust-cards', `${out}/1440-06-rust-cards.png`);
    await element(page, '#speed', `${out}/1440-09-speed.png`);
    await element(page, '#status', `${out}/1440-10-status.png`);
    await page.context().close();
  }

  // 390: every section as an element, in normal flow
  {
    const page = await open({ width: 390, height: 844 });
    for (const [name, selector] of [
      ['01-hero', '#hero'], ['02-why', '#why'], ['03-numbers', '#numbers'], ['04-design', '#design'], ['05-rust', '#rust'],
      ['06-rust-cards', '#rust-cards'], ['07-cost', '#cost'], ['08-platforms', '#platforms'], ['09-speed', '#speed'], ['10-status', '#status'],
    ]) await element(page, selector, `${out}/390-${name}.png`);
    await page.context().close();
  }

  // both themes: the hero at the top (light), /built, /follow, the footer and the 404 page
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    for (const scheme of ['dark', 'light']) {
      const page = await open({ width, height, scheme });
      if (scheme === 'light') await shot(page, `${width}-01-hero-light`);
      await element(page, '#built', `${out}/${width}-11-built-${scheme}.png`);
      await element(page, '#follow', `${out}/${width}-12-follow-${scheme}.png`);
      await element(page, '.site-footer', `${out}/${width}-13-footer-${scheme}.png`);
      await page.context().close();
      const missing = await open({ width, height, scheme, path: '/no-such-page' });
      await shot(missing, `${width}-14-404-${scheme}`);
      await missing.context().close();
    }
  }

  // JavaScript disabled: the base layer of the two sections that need their modules when enhanced
  if (nojs) {
    const page = await open({ width: 1440, height: 900, js: false });
    await element(page, '#design', `${nojs}/1440-04-design-nojs.png`, { js: false });
    await element(page, '#platforms', `${nojs}/1440-08-platforms-nojs.png`, { js: false });
    await page.context().close();
  }

  await browser.close();
  console.log(`wrote ${out}${nojs ? ` and ${nojs}` : ''}`);
} finally {
  server.kill();
}
