import { consoleLines } from '../content/expected.mjs';
import { test, expect } from '@playwright/test';

// The scene's lifecycle tests cover a first visit that is
// not on screen, a page load that never completes, a replay racing a scheduled start or a lost context, an error
// inside the frame loop or the first compile, the frame-rate floor on the desktop, and reduced motion turned on
// mid-session. The logic is the loader's and the scene's, not the engine's: these run on chromium-desktop only.
const LINES = consoleLines;
const POSTER = /\/_astro\/poster\.[^/]*\.(avif|webp|png)$/;
const hero = page => page.locator('#hero');
const typed = page => page.locator('#console-typed .line').evaluateAll(els => els.map(el => el.textContent));
const posterOpacity = page => page.locator('img.hero-poster, .hero-poster img').first().evaluate(el => Number(getComputedStyle(el).opacity));
const seen = page => page.evaluate(() => localStorage.getItem('ironafs-intro-seen'));
const returnVisit = page => page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1'));
const pageErrors = page => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  return errors;
};
/** The poster, a complete console and cooled, with no canvas and no live scene. */
async function expectFallback(page) {
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled', { timeout: 30_000 });
  await expect(page.locator('#hero canvas')).toHaveCount(0, { timeout: 15_000 });
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  await expect.poll(() => posterOpacity(page)).toBe(1);
  await expect.poll(() => typed(page)).toEqual(LINES);
}

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'chromium-desktop', 'loader and scene logic: chromium-desktop');
});

test('a first visit in a background tab: hidden for 15 s, then shown, the intro plays (the watchdog counts only shown time)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = pageErrors(page);
  await page.addInitScript(() => {
    let hidden = true;
    Object.defineProperty(Document.prototype, 'hidden', { get: () => hidden, configurable: true });
    Object.defineProperty(Document.prototype, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible'), configurable: true });
    window.__show = () => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); };
  });
  await page.goto('/?test');
  await page.waitForTimeout(15_000); // longer than the 12 s watchdog
  await page.evaluate(() => window.__show());
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await expect(hero(page)).toHaveAttribute('data-phase', 'drop', { timeout: 60_000 }); // only the scene writes drop
  expect(await seen(page), 'the intro is not marked seen before it has played').toBeNull();
  expect(errors).toEqual([]);
});

test('a first visit scrolled away from the hero for 15 s, then back: the intro plays', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = pageErrors(page);
  await page.goto('/?test');
  // past the hero's pin (the hand-off's tall scroll on desktop, the hero itself elsewhere), not only the hero's stage
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('.hero-pin').offsetHeight + 800, behavior: 'instant' }));
  await page.waitForTimeout(15_000);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await expect(hero(page)).toHaveAttribute('data-phase', 'drop', { timeout: 60_000 });
  expect(await seen(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('a first visit whose page load never completes (a stalled image): after the watchdog, the poster and a complete console, not marked seen', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = pageErrors(page);
  const held = [];
  await page.route(POSTER, route => { held.push(route); }); // never answered: the load event never fires
  await page.goto('/?test', { waitUntil: 'domcontentloaded' });
  await expect(hero(page)).toHaveAttribute('data-await-melt', '');
  await expectFallback(page);
  expect(await seen(page), 'a watchdog fallback is not the intro: the next visit plays it').toBeNull();
  for (const route of held) await route.continue().catch(() => {});
  await page.waitForTimeout(3000); // the load comes late: no scene starts after the fallback
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('replay on a return visit before the scheduled start has run: the replay plays, the stale finished start never replaces it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = pageErrors(page);
  await returnVisit(page);
  const held = [];
  await page.route(POSTER, route => { held.push(route); }); // holds the load event, and with it the return visit's start
  await page.goto('/?test', { waitUntil: 'domcontentloaded' });
  await page.locator('#replay').click();
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await page.evaluate(() => { window.__intro = document.querySelector('#hero canvas.hero-canvas'); });
  for (const route of held) await route.continue().catch(() => {}); // load, then idle: the scheduled start comes now
  await page.waitForTimeout(4000);
  expect(await page.evaluate(() => document.querySelector('#hero canvas.hero-canvas') === window.__intro), 'the replay is still the scene').toBe(true);
  await expect(hero(page)).toHaveAttribute('data-phase', 'drop', { timeout: 60_000 });
  expect(errors).toEqual([]);
});

// The scene is built a part per task: a replay between two parts abandons the first build. Its
// canvas goes, its context is freed, and it never draws, sets a phase or ends into the replay's scene.
test('replay while the first scene is still being built: the build is abandoned, the replay plays, one canvas', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = pageErrors(page);
  await returnVisit(page);
  await page.addInitScript(() => {
    window.__first = null;
    window.__lost = 0;
    document.addEventListener('DOMContentLoaded', () => {
      const h = document.getElementById('hero');
      new MutationObserver(() => {
        const canvas = h.querySelector('canvas.hero-canvas');
        if (!canvas || window.__first) return;
        // a microtask after the canvas went in: the build has made its renderer and is paused before the next part
        window.__first = canvas;
        canvas.addEventListener('webglcontextlost', () => { window.__lost++; });
        document.getElementById('replay').click();
      }).observe(h, { childList: true });
    });
  });
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 60_000 });
  const state = await page.evaluate(() => ({
    canvases: document.querySelectorAll('#hero canvas').length,
    firstGone: !!window.__first && !window.__first.isConnected,
    firstLost: window.__lost,
    phase: document.getElementById('hero').dataset.phase,
  }));
  expect(state.canvases, 'one canvas: the replay\'s').toBe(1);
  expect(state.firstGone, 'the abandoned build\'s canvas was removed').toBe(true);
  expect(state.firstLost, 'its context was freed').toBeGreaterThan(0);
  expect(state.phase, 'the replay plays from the start').toBe('chip');
  expect(errors).toEqual([]);
});

test('the old scene loses its context just after replay: the replay is consistent (one canvas, the console waiting for its melt)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = pageErrors(page);
  await returnVisit(page);
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await page.evaluate(() => {
    const lose = document.querySelector('#hero canvas.hero-canvas').getContext('webgl2').getExtension('WEBGL_lose_context');
    document.getElementById('replay').click();
    lose.loseContext(); // a no-op if the replay already released that context
  });
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const h = document.getElementById('hero');
    return { canvases: h.querySelectorAll('canvas').length, phase: h.dataset.phase, awaiting: h.hasAttribute('data-await-melt'), lines: document.querySelectorAll('#console-typed .line .msg').length };
  });
  // either the replay plays (a scene, the console empty and waiting) or the fallback holds (no scene, cooled):
  // never a new scene playing its chip under a console already complete
  if (state.canvases) expect(state, 'a replay that plays').toMatchObject({ canvases: 1, awaiting: true, lines: 0 });
  else expect(state, 'a fallback that holds').toMatchObject({ phase: 'cooled', awaiting: false });
  expect(errors).toEqual([]);
});

test('during a replay, data-scene="live" is set only while a scene that has drawn is on the canvas', async ({ page }) => {
  await returnVisit(page);
  await page.addInitScript(() => {
    window.__liveUndrawn = [];
    window.addEventListener('DOMContentLoaded', () => {
      const h = document.getElementById('hero');
      new MutationObserver(() => {
        const t = h.dataset.timings ? JSON.parse(h.dataset.timings) : {};
        if (h.dataset.scene === 'live' && t.built !== undefined && t.frame === undefined) window.__liveUndrawn.push(h.dataset.timings);
      }).observe(h, { attributes: true, childList: true, attributeFilter: ['data-scene', 'data-timings'] });
    });
  });
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await page.locator('#replay').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(document.getElementById('hero').dataset.timings ?? '{}').frame !== undefined && document.getElementById('hero').dataset.tChip !== undefined), { timeout: 30_000 }).toBe(true);
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  expect(await page.evaluate(() => window.__liveUndrawn)).toEqual([]);
});

test('an error inside the frame loop ends the scene: the poster and a complete console, no page error, a warning', async ({ page }) => {
  const errors = pageErrors(page);
  const warnings = [];
  page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
  await returnVisit(page);
  await page.addInitScript(() => {
    window.__boom = false;
    for (const name of ['drawElements', 'drawArrays']) {
      const draw = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        if (window.__boom) throw new Error('boom');
        return draw.apply(this, args);
      };
    }
  });
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await page.evaluate(() => { window.__boom = true; });
  await expectFallback(page);
  expect(errors).toEqual([]);
  // a visitor's frame bug shows in devtools (it is not a page error)
  expect(warnings.some(w => w.includes('IronAFS hero: a frame of the 3D scene failed'))).toBe(true);
});

test('a shader that throws while the first frame is compiled ends the scene: the poster, no page error (return visit: no watchdog)', async ({ page }) => {
  const errors = pageErrors(page);
  await returnVisit(page);
  await page.addInitScript(() => {
    const source = WebGL2RenderingContext.prototype.shaderSource;
    window.__thrown = 0;
    WebGL2RenderingContext.prototype.shaderSource = function (shader, src) {
      if (src.includes('#define USE_SHADOWMAP')) { window.__thrown++; throw new Error('boom'); } // the scene's own materials, not the build's environment
      return source.call(this, shader, src);
    };
  });
  await page.goto('/?test');
  await expect.poll(() => page.evaluate(() => window.__thrown), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.locator('#hero canvas')).toHaveCount(0, { timeout: 15_000 });
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled');
  await expect.poll(() => posterOpacity(page)).toBe(1);
  expect(await typed(page)).toEqual(LINES);
  expect(errors).toEqual([]);
});

test('the desktop has the frame-rate floor too: a floor it cannot hold stops the scene, the poster and a complete console', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = pageErrors(page);
  await page.goto('/?test&fps=1000'); // a floor no machine holds: the watch must exist on the desktop tier
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  expect(JSON.parse(await hero(page).getAttribute('data-limits')).tier).toBe('desktop');
  // a visitor's desktop floor is 24 fps, so a display capped at 30 Hz (macOS Low Power Mode) holds it
  expect(await hero(page).getAttribute('data-fps-floor')).toBe('24');
  await expectFallback(page);
  expect(errors).toEqual([]);
});

test('reduced motion turned on while the intro plays: the scene goes, the poster and a complete console', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectFallback(page);
  await page.waitForTimeout(1500);
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('reduced motion turned on at rest (a return visit): the live scene goes, the poster stays', async ({ page }) => {
  const errors = pageErrors(page);
  await returnVisit(page);
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectFallback(page);
  expect(errors).toEqual([]);
});

test('reduced motion turned on while the scene chunk loads: no scene starts', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = pageErrors(page);
  const held = [];
  await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => { held.push(route); });
  await page.goto('/?test');
  await expect.poll(() => held.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of held) await route.continue();
  await page.waitForTimeout(4000);
  await expectFallback(page);
  expect(errors).toEqual([]);
});

// The context is lost while the stage (a module) is being built: the build is abandoned at its next part, the intro
// falls back at once (not after the 12 s watchdog), and nothing it made stays registered (the letters' window
// pointer listeners). The loss is forced as the chip's label texture is drawn, inside the stage's build.
test('the context is lost while the scene is being built: the build is abandoned and the intro falls back at once, no listener left', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = pageErrors(page);
  await page.addInitScript(() => {
    window.__lostAt = 0;
    window.__contextLost = false;
    window.__fallback = null;
    document.addEventListener('hero:scene-end', event => {
      if (event.target.id === 'hero' && !window.__fallback) {
        window.__fallback = { at: performance.now(), seen: event.detail.seen, contextLost: window.__contextLost };
      }
    }, true);
    window.__pointerListeners = 0;
    const add = window.addEventListener;
    const remove = window.removeEventListener;
    window.addEventListener = function (type, ...rest) { if (type === 'pointermove') window.__pointerListeners++; return add.call(this, type, ...rest); };
    window.removeEventListener = function (type, ...rest) { if (type === 'pointermove') window.__pointerListeners--; return remove.call(this, type, ...rest); };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      const hero = document.querySelector('#hero canvas.hero-canvas');
      if (kind === '2d' && this.width === 2048 && this.height === 520 && hero && !window.__lostAt) {
        hero.addEventListener('webglcontextlost', () => { window.__contextLost = true; }, { capture: true, once: true });
        window.__lostAt = performance.now(); // the chip's label: the letters are built, the stage is not
        getContext.call(hero, 'webgl2').getExtension('WEBGL_lose_context').loseContext();
      }
      return getContext.call(this, kind, ...rest);
    };
  });
  await page.goto('/?test');
  await expect.poll(() => page.evaluate(() => window.__lostAt), { timeout: 30_000 }).toBeGreaterThan(0);
  await expectFallback(page);
  const state = await page.evaluate(() => ({
    fallback: window.__fallback,
    lostAt: window.__lostAt,
  }));
  expect(state.fallback, 'scene-end after webglcontextlost marked the intro seen').toMatchObject({
    seen: true, contextLost: true,
  });
  const elapsed = state.fallback.at - state.lostAt;
  expect(elapsed, 'fallback followed the forced context loss').toBeGreaterThanOrEqual(0);
  expect(elapsed, 'fallback came promptly after the forced context loss').toBeLessThan(8000);
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__pointerListeners), 'the abandoned build left no pointer listener').toBe(0);
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  expect(errors).toEqual([]);
});

// A shader whose program fails to link throws nothing: three.js reports it (renderer.debug), and the scene must not
// mark that blank canvas live. LINK_STATUS false for the scene's own materials (not the build's environment).
test('a shader that fails to link without throwing ends the scene: the poster, never data-scene=live (return visit)', async ({ page }) => {
  const errors = pageErrors(page);
  await returnVisit(page);
  await page.addInitScript(() => {
    window.__failedLinks = 0;
    window.__everLive = false;
    const source = WebGL2RenderingContext.prototype.shaderSource;
    const shaders = new WeakSet();
    WebGL2RenderingContext.prototype.shaderSource = function (shader, src) {
      if (src.includes('#define USE_SHADOWMAP')) shaders.add(shader);
      return source.call(this, shader, src);
    };
    const attach = WebGL2RenderingContext.prototype.attachShader;
    const programs = new WeakSet();
    WebGL2RenderingContext.prototype.attachShader = function (program, shader) {
      if (shaders.has(shader)) programs.add(program);
      return attach.call(this, program, shader);
    };
    const param = WebGL2RenderingContext.prototype.getProgramParameter;
    WebGL2RenderingContext.prototype.getProgramParameter = function (program, name) {
      if (name === this.LINK_STATUS && programs.has(program)) { window.__failedLinks++; return false; }
      return param.call(this, program, name);
    };
    window.addEventListener('DOMContentLoaded', () => {
      const h = document.getElementById('hero');
      new MutationObserver(() => { if (h.dataset.scene === 'live') window.__everLive = true; }).observe(h, { attributes: true, attributeFilter: ['data-scene'] });
    });
  });
  await page.goto('/?test');
  await expect.poll(() => page.evaluate(() => window.__failedLinks), { timeout: 30_000 }).toBeGreaterThan(0);
  await expectFallback(page);
  expect(await page.evaluate(() => window.__everLive), 'a scene whose shaders failed never replaced the poster').toBe(false);
  expect(errors).toEqual([]);
});

// The frame-rate floor counts the scene's own renders, and only while it can draw: a window spent off screen is no
// verdict either way. ?test&fps=1000: a floor no device holds, so a verdict, whenever it comes, ends the scene.
test('the frame-rate floor gives no verdict while the hero is off screen, and judges it once it is back', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = pageErrors(page);
  await returnVisit(page);
  await page.goto('/?test&fps=1000');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('.hero-pin').offsetHeight + 800, behavior: 'instant' }));
  await page.waitForTimeout(10_000); // the warm-up and several 2 s windows, all off screen
  await expect(page.locator('#hero canvas.hero-canvas'), 'no verdict off screen: the scene is still there').toHaveCount(1);
  await expect(hero(page)).toHaveAttribute('data-scene', 'live');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expectFallback(page); // back on screen: a window of real renders, below the floor
  expect(errors).toEqual([]);
});

// The first-frame watchdog counts only while the canvas is on screen (the render loop runs only then), not while
// the hero's text is: on a phone layout the canvas is the top band of a taller section.
test('a first visit on a phone layout with the canvas scrolled away but the console in view for 15 s: the intro still plays', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = pageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test');
  const band = await page.evaluate(() => document.querySelector('.hero-poster img, img.hero-poster').getBoundingClientRect().bottom);
  await page.evaluate(y => window.scrollTo({ top: y + 20, behavior: 'instant' }), band);
  expect(await page.evaluate(() => { const r = document.getElementById('hero').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }), 'the hero section is still in view').toBe(true);
  await page.waitForTimeout(15_000); // longer than the 12 s watchdog
  await expect(hero(page)).toHaveAttribute('data-await-melt', ''); // still waiting for the intro, no fallback
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await expect(hero(page)).toHaveAttribute('data-phase', 'drop', { timeout: 60_000 });
  expect(errors).toEqual([]);
});

// Reduced motion turned on after the head gate marked a first visit (data-intro=play) but before the modules ran:
// the modules read the preference again, so no scene and no typing; the finished console and the poster at once.
test('reduced motion turned on between the head gate and the modules: no intro, the poster and the finished console', async ({ page }) => {
  const errors = pageErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    // the head gate's query only: it saw no preference (the preference arrived just after it ran)
    const match = window.matchMedia.bind(window);
    let first = true;
    window.matchMedia = query => {
      if (first && query === '(prefers-reduced-motion: reduce)') {
        first = false;
        return { matches: false, media: query, addEventListener() {}, removeEventListener() {} };
      }
      return match(query);
    };
    window.__played = false;
    new MutationObserver(() => { if (document.documentElement.dataset.intro === 'play') window.__played = true; })
      .observe(document, { attributes: true, subtree: true, attributeFilter: ['data-intro'] }); // <html> may not exist yet
  });
  await page.goto('/?test');
  expect(await page.evaluate(() => window.__played), 'the head gate marked a first visit').toBe(true);
  await page.waitForTimeout(4000); // load and idle: a scene would have started by now
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-await-melt', /.*/);
  expect(await page.evaluate(() => document.documentElement.dataset.intro)).toBeUndefined();
  expect(await posterOpacity(page)).toBe(1);
  expect(await typed(page)).toEqual(LINES);
  expect(errors).toEqual([]);
});

// The visitor's pause (WCAG 2.2.2): an action button beside Replay, 44 px, reached by Tab, its label saying what it will
// do (pause or resume; no aria-pressed: the label and icon carry the state), remembered for the visit; paused, the
// scene draws no frame and the caret is still.
const frames = page => page.evaluate(() => Number(document.getElementById('hero').dataset.frames || 0));
const pauseKey = page => page.locator('#hero-pause');

test('the pause control stops the scene at rest, is remembered for the visit, and play brings the scene back', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = pageErrors(page);
  await returnVisit(page);
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  const key = pauseKey(page);
  await expect(key).toBeVisible();
  await expect(key).toHaveAttribute('aria-label', 'Pause background motion');
  await expect(key).not.toHaveAttribute('aria-pressed');
  const box = await key.boundingBox();
  expect(Math.min(box.width, box.height), 'a 44 px target').toBeGreaterThanOrEqual(44);
  // keyboard: Shift+Tab from Replay reaches it, Space presses it
  await page.locator('#replay').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(key).toBeFocused();
  await page.keyboard.press('Space');
  await expect(key).toHaveAttribute('aria-label', 'Resume background motion');
  await expect(key).toHaveAccessibleName('Resume background motion');
  await expect(key).not.toHaveAttribute('aria-pressed');
  await page.waitForTimeout(500);
  const before = await frames(page);
  await page.waitForTimeout(2500);
  expect(await frames(page), 'paused: no frame is drawn').toBe(before);
  await expect(hero(page)).toHaveAttribute('data-scene', 'live'); // the last frame stays on the stage
  expect(await page.locator('#hero .caret').last().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  // remembered for the visit: a reload stays paused and starts no scene
  await page.reload();
  await expect(pauseKey(page)).toHaveAttribute('aria-label', 'Resume background motion');
  await expect(pauseKey(page)).not.toHaveAttribute('aria-pressed');
  await page.waitForTimeout(4000);
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  expect(await posterOpacity(page)).toBe(1);
  await pauseKey(page).click();
  await expect(pauseKey(page)).toHaveAttribute('aria-label', 'Pause background motion');
  await expect(pauseKey(page)).toHaveAccessibleName('Pause background motion');
  await expect(pauseKey(page)).not.toHaveAttribute('aria-pressed');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled'); // back at rest
  const resumed = await frames(page);
  await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(resumed);
  expect(await page.evaluate(() => sessionStorage.getItem('ironafs-hero-paused'))).toBeNull();
  expect(errors).toEqual([]);
});

test('pausing while the intro waits for its melt ends the intro: the poster and a complete console; reduced motion offers no pause', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = pageErrors(page);
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-await-melt', '');
  await pauseKey(page).click();
  await expectFallback(page);
  await page.waitForTimeout(3000);
  await expect(page.locator('#hero canvas'), 'nothing still loading starts').toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pauseKey(page)).toBeHidden();
  expect(errors).toEqual([]);
});

// The chip's warning light is put out by the melt and stays out: the stage no longer pulses it once the melt began.
test('after the melt the chip\'s warning light stays out (return visit, at rest)', async ({ page }) => {
  await returnVisit(page);
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    seen.add(await hero(page).getAttribute('data-warn'));
    await page.waitForTimeout(250);
  }
  expect([...seen]).toEqual(['0.000']);
});
