import { test, expect, chromium } from '@playwright/test';
import { warmUp } from './util.mjs';

// The runtime budgets. The phone budgets run on chromium-phone, the
// profile they are written for: CDP 4x CPU slowdown and Fast 4G, a first visit (no intro-seen flag), the 3D included.
// The story pictures' byte budget runs on chromium-desktop, the 1440 profile. The sizes of the files themselves are
// tests/build/sizes.test.mjs.
//
// Two modes:
// - By default (CI, every local run) the projects' software GL (SwiftShader) draws. LCP, CLS, the menu tap and the
//   pictures are measured here.
// - BUDGET_HW=1 selects the host's GPU (Metal on macOS, ANGLE on Vulkan elsewhere) and adds the long-task budget and a
//   tap during the scene's build. Under software GL the GPU's work runs on the CPU and the main thread waits on it
//   (the scene's start cost 1.2-2.0 s of long-task time on SwiftShader, 2026-11-22): that is the emulator's time, not a
//   phone's, so outside this mode the long-task test is skipped, saying why. `node tools/ci-local.mjs --hardware`
//   runs this mode and fails unless the long-task test ran and passed.
// Before each timed visit a throwaway generic page (not this site, and none of its shaders) warms the GPU process and
// the rasterizer's shader cache, as a visitor's browser has them (util.mjs warmUp; ).
const HW = !!process.env.BUDGET_HW;
const HW_LAUNCH = { args: process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] };
if (HW) test.use({ launchOptions: HW_LAUNCH });

/**
 * A cold browser for a hardware measurement: a browser process launched for this test alone, with an
 * empty profile (no shader cache on disk), where only warmUp runs before the timed visit: /404 and the generic page,
 * never the hero. The worker's shared browser has already drawn the hero in the earlier tests of this file, so its
 * GPU process holds the scene's compiled shaders. `firstVisit()` checks the timed page is the process's only open
 * page and its first navigation was the site's `/`; the annotation records it for the gate's printout.
 */
const cold = [];
test.afterEach(async () => { while (cold.length) await cold.pop().close().catch(() => {}); });
async function coldPage(info) {
  const browser = await chromium.launch(HW_LAUNCH);
  cold.push(browser);
  await warmUp(browser, info.project.use, { webgl: true });
  const { baseURL, viewport, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch });
  const navigations = [];
  context.on('request', r => { if (r.isNavigationRequest()) navigations.push(new URL(r.url()).pathname); });
  const page = await context.newPage();
  const firstVisit = () => {
    const pages = browser.contexts().flatMap(c => c.pages()).length;
    info.annotations.push({ type: 'cold browser', description: `its own process (chromium ${browser.version()}); before the timed visit only the /404 and generic warm-up; pages open: ${pages}; navigations: ${navigations.join(' ')}` });
    expect(pages, 'the timed page is the cold browser\'s only page').toBe(1);
    expect(navigations[0], 'its first navigation is the site').toBe('/');
  };
  return { browser, page, firstVisit };
}

const phone = info => info.project.name === 'chromium-phone';
const desktop = info => info.project.name === 'chromium-desktop';

/** The story's pictures (the art masters' builds), not the hero's poster: their files are named after the masters. */
const STORY_ART = /\/_astro\/(chip|forge|drops|rust|rust-only)\.[^/]*\.(avif|webp|png|jpe?g)$/;
const STORY_PICTURES = ['chip', 'drops', 'forge'];
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render/i;
// The GPUs the hardware gate knows, as whole words: an Apple M-series chip, NVIDIA, AMD, Intel's integrated and Arc
// graphics, and the phone GPUs. A masked value ("Apple GPU", "WebKit WebGL") names no device and matches none. A GPU
// not listed fails with its renderer string printed: add it here deliberately.
const HARDWARE_GPU = /\b(?:apple m\d+|nvidia|geforce|quadro|rtx|amd|radeon|intel(?:\(r\))?\s+(?:iris|uhd|hd graphics|arc)|adreno|mali|powervr)\b/i;

/**
 * Whether `renderer` (the hero's unmasked renderer string; heroRenderer never falls back to gl.RENDERER) positively
 * names a hardware GPU: it contains a known device or vendor token and is not software GL. Anything else fails, an
 * unknown or masked value included: the long-task budget is measured on hardware or not at all.
 */
function isHardwareRenderer(renderer) {
  const r = String(renderer ?? '');
  return HARDWARE_GPU.test(r) && !SOFTWARE_GL.test(r);
}

/** 4x CPU and Fast 4G (as intro.spec.mjs's LCP tests): 150 ms latency, 1.6 Mbit/s down, 750 kbit/s up. */
async function phoneProfile(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  return cdp;
}

/** Records LCP, layout shifts (without recent input), long tasks and when the hero scene went live. */
const observe = () => {
  window.__perf = { lcp: [], cls: 0, long: [], live: 0 };
  const role = el => !el ? '?' : el.id === 'headline' && el.closest('#hero .hero-copy') ? 'hero h1'
    : el.matches('#hero .hero-copy p.subline') ? 'hero subline'
    : el.matches('#hero .hero-art .hero-opening') ? 'hero opening' : el.tagName;
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__perf.lcp.push({ tag: e.element?.tagName ?? '?', role: role(e.element), t: e.startTime }); })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__perf.long.push({ start: e.startTime, duration: e.duration }); })
    .observe({ type: 'longtask', buffered: true });
  new MutationObserver(() => {
    if (!window.__perf.live && document.getElementById('hero')?.dataset.scene === 'live') window.__perf.live = performance.now();
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-scene'] });
};

/** Event Timing entries for #menu-button (input to the next paint after its handlers), from the start of the page.
 *  `first-input` too: it is reported whatever its duration, so a tap that is the page's first input is always seen
 *. */
const watchMenuEvents = () => {
  window.__events = [];
  const record = list => {
    for (const e of list.getEntries()) if (e.target?.closest?.('#menu-button')) window.__events.push({ name: e.name, type: e.entryType, start: e.startTime, duration: e.duration });
  };
  new PerformanceObserver(record).observe({ type: 'event', durationThreshold: 16, buffered: true });
  new PerformanceObserver(record).observe({ type: 'first-input', buffered: true });
};

/** The renderer string of the hero's own WebGL context (its canvas returns the context it already has). */
const heroRenderer = page => page.evaluate(() => {
  const gl = document.querySelector('#hero canvas.hero-canvas')?.getContext('webgl2');
  if (!gl) return '';
  // the unmasked renderer only: gl.RENDERER is a generic string ("WebKit WebGL") that names no device
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '') : '';
});

test('the hardware-renderer rule accepts only a named hardware GPU', () => {
  for (const ok of ['ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E9B) Direct3D11 vs_5_0 ps_5_0, D3D11)']) {
    expect(isHardwareRenderer(ok), ok).toBe(true);
  }
  for (const bad of ['', '   ', null, undefined, 'WebKit WebGL', 'WebKit', 'Mozilla', 'Google Inc.', 'Apple GPU', 'Generic Renderer',
    'ANGLE (Unknown, Unknown, Unknown)', 'WebGL', 'unidentified renderer',
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver']) {
    expect(isHardwareRenderer(bad), String(bad)).toBe(false);
  }
});

test.describe('phone profile (chromium-phone, 4x CPU, Fast 4G, first visit, 3D included)', () => {
  test.beforeEach(({}, info) => test.skip(!phone(info), 'the phone budgets: chromium-phone'));

  // The phone opens on the console and cold plate above the hero copy. With no input the LCP search runs through
  // the whole intro, to its end (cooled) and 2 s past it. ?test keeps the scene running where its frame rate is below the
  // phone's floor (software GL): the profile is a mid-range phone, which holds the floor.
  test('LCP within 2000 ms for the hero, CLS within 0.05: a first visit with no input, through the whole intro', async ({ page, browser }, info) => {
    test.setTimeout(120_000);
    await warmUp(browser, info.project.use, { webgl: true });
    await page.addInitScript(observe);
    await phoneProfile(page);
    await page.goto('/?test');
    await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled', { timeout: 60_000 });
    await page.waitForTimeout(2000);
    const perf = await page.evaluate(() => window.__perf);
    const lcp = perf.lcp.at(-1);
    console.log(`phone budgets: LCP ${lcp.role} at ${Math.round(lcp.t)} ms (${perf.lcp.length} entries); CLS ${perf.cls.toFixed(4)}; the scene live at ${Math.round(perf.live)} ms`);
    expect(perf.live, 'the 3D was included: the scene drew').toBeGreaterThan(0);
    expect(['hero opening', 'hero h1', 'hero subline'], 'the opening artwork or headline copy is the largest paint through the intro').toContain(lcp.role);
    expect(lcp.t, 'LCP').toBeLessThanOrEqual(2000);
    expect(perf.cls, 'CLS').toBeLessThanOrEqual(0.05);
  });

  test('at rest after the intro, a tap on #menu-button paints the open dialog within 150 ms', async ({ page }) => {
    test.setTimeout(90_000);
    await phoneProfile(page);
    await page.addInitScript(watchMenuEvents);
    await page.goto('/');
    await page.waitForSelector('html[data-menu-ready]');
    // The console sets this after the hero loader starts. The server-rendered hero is already cooled.
    await expect(page.locator('html')).toHaveAttribute('data-intro', 'typing');
    await expect(page.locator('#hero')).toHaveAttribute('data-phase', 'cooled', { timeout: 60_000 });
    await page.locator('#menu-button').tap();
    await expect(page.locator('#menu')).toHaveJSProperty('open', true);
    // Event Timing: from the input to the next paint after its handlers (the frame that shows the open dialog);
    // events quicker than 16 ms are not reported as `event` entries, which is within budget too, but the tap is the
    // page's first input, so its `first-input` entry is always there: no entry means nothing was measured.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100)))));
    const events = await page.evaluate(() => window.__events);
    console.log(`menu tap: ${events.map(e => `${e.name} (${e.type}) ${e.duration} ms`).join(', ')}`);
    expect(events.filter(e => e.type === 'first-input'), 'the tap was measured (its first-input entry)').toHaveLength(1);
    for (const e of events) expect(e.duration, e.name).toBeLessThanOrEqual(150);
  });

  test('hardware GL: a tap on #menu-button while the scene is being built paints the dialog within 150 ms', async ({}, info) => {
    test.skip(!HW, 'measured with the host GPU only (BUDGET_HW=1): software GL blocks the main thread on the GPU');
    const { browser, page, firstVisit } = await coldPage(info);
    await phoneProfile(page);
    await page.addInitScript(watchMenuEvents);
    await page.addInitScript(observe);
    // the canvas goes in as the build starts; the scene goes live with its first frame, a few tasks later. The page
    // calls back the moment the canvas is in, and the tap is sent from there (a poll from here lands too late).
    let tapped = null;
    await page.exposeBinding('__buildStarted', ({ page }) => { tapped ??= page.touchscreen.tap(...menuCentre); });
    await page.addInitScript(() => {
      window.__built = 0;
      window.__tapAt = 0;
      addEventListener('pointerdown', e => { if (!window.__tapAt && e.target.closest?.('#menu-button')) window.__tapAt = e.timeStamp; }, true);
      document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
        if (window.__built || !document.querySelector('#hero canvas.hero-canvas')) return;
        window.__built = performance.now();
        window.__buildStarted();
      }).observe(document.querySelector('#hero .hero-art'), { childList: true }));
    });
    await page.goto('/');
    const box = await page.locator('#menu-button').boundingBox();
    const menuCentre = [box.x + box.width / 2, box.y + box.height / 2];
    await page.waitForFunction(() => window.__built > 0, null, { timeout: 30_000 });
    await expect.poll(() => tapped !== null).toBe(true);
    await tapped;
    await expect(page.locator('#menu')).toHaveJSProperty('open', true);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100)))));
    const { events, built, live, tapAt } = await page.evaluate(() => ({ events: window.__events, built: window.__built, live: window.__perf.live, tapAt: window.__tapAt }));
    console.log(`menu tap during the build: build from ${Math.round(built)} ms, tap at ${Math.round(tapAt)} ms, live at ${Math.round(live)} ms; ${events.map(e => `${e.name} (${e.type}) ${e.duration} ms at ${Math.round(e.start)}`).join(', ')}`);
    expect(tapAt, 'the tap came during the build').toBeGreaterThan(built);
    expect(!live || tapAt < live, 'the tap came before the scene\'s first frame').toBe(true);
    const renderer = await heroRenderer(page);
    info.annotations.push({ type: 'renderer', description: renderer });
    expect(isHardwareRenderer(renderer), `a known hardware GPU (add a new one to HARDWARE_GPU deliberately); renderer: "${renderer}"`).toBe(true);
    expect(events.filter(e => e.type === 'first-input'), 'the tap was measured (its first-input entry)').toHaveLength(1);
    firstVisit();
    await browser.close();
    for (const e of events) expect(e.duration, e.name).toBeLessThanOrEqual(150);
  });

  test('hardware GL: long-task time over 50 ms within 200 ms in the first 10 s, the 3D included', async ({}, info) => {
    test.skip(!HW, 'measured with the host GPU only (BUDGET_HW=1, tools/ci-local.mjs --hardware): under software GL the main thread waits on the emulated GPU');
    const { browser, page, firstVisit } = await coldPage(info);
    await page.addInitScript(observe);
    await phoneProfile(page);
    await page.goto('/');
    await page.waitForFunction(() => performance.now() >= 10_000, null, { timeout: 20_000, polling: 500 });
    const perf = await page.evaluate(() => window.__perf);
    const renderer = await heroRenderer(page);
    const blocking = perf.long.filter(t => t.start < 10_000).reduce((sum, t) => sum + Math.max(0, Math.min(t.start + t.duration, 10_000) - t.start - 50), 0);
    const tasks = perf.long.map(t => `${Math.round(t.duration)} at ${Math.round(t.start)}`).join(', ');
    for (const [type, description] of [['renderer', renderer], ['browser', `${browser.browserType().name()} ${browser.version()}`],
      ['long-task time', `${Math.round(blocking)} ms (${tasks})`], ['scene live', `${Math.round(perf.live)} ms`]]) info.annotations.push({ type, description });
    console.log(`phone budgets: long-task time over 50 ms ${Math.round(blocking)} ms (${tasks}); the scene live at ${Math.round(perf.live)} ms; renderer ${renderer}`);
    expect(perf.live, 'the 3D is included: the scene\'s first frame within the first 10 s').toBeGreaterThan(0);
    expect(perf.live).toBeLessThanOrEqual(10_000);
    expect(isHardwareRenderer(renderer), `a known hardware GPU (add a new one to HARDWARE_GPU deliberately); renderer: "${renderer}"`).toBe(true);
    firstVisit();
    await browser.close();
    expect(blocking, 'long-task time over 50 ms in the first 10 s').toBeLessThanOrEqual(200);
  });

  test('the story pictures are lazy, and none is requested before the load event', async ({ page }) => {
    await phoneProfile(page);
    await page.goto('/', { waitUntil: 'load' });
    const pictures = await page.evaluate(() => [...document.querySelectorAll('main .story picture img')].map(img => ({
      name: new URL(img.src).pathname.split('/').at(-1).split('.')[0],
      loading: img.loading,
    })));
    expect(pictures.map(({ name }) => name).sort()).toEqual(STORY_PICTURES);
    for (const { name, loading } of pictures) expect(loading, name).toBe('lazy');
    await page.waitForTimeout(2000);
    const early = await page.evaluate(art => {
      const load = performance.getEntriesByType('navigation')[0].loadEventStart;
      return performance.getEntriesByType('resource').filter(r => new RegExp(art).test(new URL(r.name).pathname) && r.startTime < load)
        .map(r => `${new URL(r.name).pathname} at ${Math.round(r.startTime)} ms (load ${Math.round(load)} ms)`);
    }, STORY_ART.source);
    expect(early).toEqual([]);
  });
});

test('1440 profile: after scrolling the whole page, the story pictures transferred at most 300 KB', async ({ page }, info) => {
  test.skip(!desktop(info), 'the 1440 profile: chromium-desktop');
  await page.goto('/');
  await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let top = 0; top < document.documentElement.scrollHeight; top += innerHeight / 2) {
      scrollTo({ top, behavior: 'instant' });
      await frame();
    }
  });
  await page.waitForLoadState('networkidle');
  const art = await page.evaluate(art => performance.getEntriesByType('resource')
    .filter(r => new RegExp(art).test(new URL(r.name).pathname))
    .map(r => ({ file: new URL(r.name).pathname, bytes: r.transferSize })), STORY_ART.source);
  const total = art.reduce((sum, a) => sum + a.bytes, 0);
  console.log(`story pictures at 1440: ${(total / 1024).toFixed(1)} KB (${art.map(a => `${a.file.replace('/_astro/', '')} ${(a.bytes / 1024).toFixed(1)}`).join(', ')})`);
  for (const name of STORY_PICTURES) expect(art.some(a => a.file.startsWith(`/_astro/${name}.`)), name).toBe(true);
  expect(art.filter(a => /\/_astro\/rust(?:-only)?\./.test(a.file))).toEqual([]);
  for (const a of art) expect(a.bytes, `${a.file} was transferred (not 0 bytes)`).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(300 * 1024);
});
