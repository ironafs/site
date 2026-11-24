import AxeBuilder from '@axe-core/playwright';
import { test } from '@playwright/test';

export const widths = [360, 390, 430, 768, 1024, 1280, 1440, 1920];

/** The most a frame may take before a sweep counts the page as stuck: far slower than any page that still draws. */
const FRAME_MS = 2000;

/**
 * Gives the running test time for `frames` more frames (requestAnimationFrame callbacks) on top of its budget: a
 * sweep that waits for frames at every position takes as long as its frames do, a few milliseconds each on a GPU and
 * up to a second each under software rendering on a 2-core runner. Call it before the sweep, with the frames it waits
 * for; the test still fails if the page stops drawing.
 */
export function allowFrames(frames) {
  test.setTimeout(test.info().timeout + frames * FRAME_MS);
}

/** Abort and record every request that leaves `baseURL`'s origin. Returns the list (empty when clean). */
export async function blockExternal(page, baseURL) {
  const origin = new URL(baseURL).origin;
  const external = [];
  await page.route(/^[a-z][a-z0-9+.-]*:/i, route => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:') || new URL(url).origin === origin) return route.fallback();
    external.push(url);
    return route.abort('blockedbyclient');
  });
  return external;
}

/**
 * Scrolls `root` (a selector) through the viewport, from its top entering to its bottom leaving, `step` of the
 * viewport's height at a time, and returns the text lines never seen whole: every line box of every text node under
 * it that is rendered (not display: none, not in a closed <details>), except those under `skip`. A line counts as
 * seen when, at some scroll position, its box lies inside the viewport, its effective opacity (the product over its
 * ancestors) is at least 0.95, and the topmost element at its centre that is not fully transparent is the text's own
 * element or inside it (on top: not under the header, a later card or a clipping parent). Lines are keyed by text node and line index, so a line
 * shown at one scroll position and another line of the same paragraph at another both count.
 */
export async function unseenLines(page, root, { step = 0.04, skip = '.sr-only' } = {}) {
  // its positions, a frame each
  allowFrames(2 * await page.evaluate(({ root, step }) => Math.ceil((document.querySelector(root).offsetHeight + innerHeight) / (innerHeight * step)) + 2, { root, step }));
  return page.evaluate(async ({ root, step, skip }) => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = document.querySelector(root);
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || (skip && parent.closest(skip))) continue;
      if (!parent.checkVisibility()) continue;
      // screen-reader-only text (a 1 px clipped box, as #why's percentage in the enhancement)
      const box = parent.getBoundingClientRect();
      if (box.width <= 1 && box.height <= 1) continue;
      nodes.push(node);
    }
    const seen = new Map(nodes.map(node => [node, new Set()]));
    const lineCount = new Map(nodes.map(node => [node, 0]));
    const start = el.getBoundingClientRect().top + scrollY - innerHeight;
    const end = start + el.offsetHeight + innerHeight;
    const range = document.createRange();
    for (let s = start; s <= end + 1; s += innerHeight * step) {
      scrollTo({ top: s, behavior: 'instant' });
      await frame();
      for (const node of nodes) {
        range.selectNodeContents(node);
        // one box per line: the fragments on one line (a pre-wrap line's hanging space is its own fragment) united
        const rects = [];
        for (const r of range.getClientRects()) {
          if (r.width <= 0 || r.height <= 0) continue;
          const line = rects.find(l => Math.abs(l.top - r.top) < 2);
          if (!line) { rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }); continue; }
          line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right); line.bottom = Math.max(line.bottom, r.bottom);
        }
        lineCount.set(node, Math.max(lineCount.get(node), rects.length));
        if (seen.get(node).size >= rects.length && rects.length) continue;
        let opacity = 1;
        for (let a = node.parentElement; a && a !== document.documentElement; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
        if (opacity < 0.95) continue;
        rects.forEach((r, i) => {
          if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return;
          // the topmost element there that can be seen: a fully transparent one (a readout value not shown yet) covers nothing
          const hit = document.elementsFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2).find(e => {
            for (let a = e; a && a !== document.documentElement; a = a.parentElement) if (Number(getComputedStyle(a).opacity) < 0.02) return false;
            return true;
          });
          if (hit && node.parentElement.contains(hit)) seen.get(node).add(i);
        });
      }
    }
    return nodes.filter(node => seen.get(node).size < Math.max(1, lineCount.get(node)))
      .map(node => `${node.parentElement.className || node.parentElement.tagName}: ${node.textContent.trim().slice(0, 50)} (${seen.get(node).size}/${lineCount.get(node)} lines)`);
  }, { root, step, skip });
}

/** axe's serious and critical findings on the page as it is now (WCAG 2.2 AA tags), as strings. */
export async function axeSerious(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
}

// The story's sections and their content (story-base.spec.mjs; layout-v2.spec.mjs).
// The hero is #hero (`#top` is the document's top, which the HTML spec resolves).
export const order = ['hero', 'why', 'numbers', 'cost', 'platforms', 'what', 'design', 'rust', 'rust-cards', 'speed', 'status', 'built', 'follow'];
/** The scroll story's sections, #why to #status. */
export const storySections = order.slice(1, order.indexOf('status') + 1);
// Content includes text and blocks that carry no p or heading of their own (the Rust word, its panels, the cards,
// the #cost cards including their padding, #status's forge picture below the text, and the Rust examples'
// one panel, whose padding is part of the panel).
export const content = 'h2, h3, p, li, dt, dd, .val, .big, figcaption, pre, .rust-word, #rust .ph, .fact, #rust-cards .facts, #cost .scard, #status .forge';

/** Every problem with every content element under `root` (scrolled into view one by one), as strings.
 *  `frames: false` reads each element straight after its scroll, without waiting for frames: with JavaScript
 *  disabled Chromium runs no page callbacks (rAF, timers) for an evaluate, and nothing scroll-driven is on then. */
export async function hiddenContent(page, selector, { frames = true } = {}) {
  return page.evaluate(async ({ selector, content, frames }) => {
    const frame = () => frames ? new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))) : Promise.resolve();
    const name = el => `${el.closest('section[id]')?.id ?? '?'} ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}"`;
    const problems = [];
    // #design's step counter belongs to the pinned tabs alone and is hidden without them (story-how.spec.mjs checks it)
    const els = [...document.querySelectorAll(selector)].flatMap(root => [...root.querySelectorAll(content)])
      .filter(el => !el.closest('details:not([open])') || el.closest('summary'))
      .filter(el => !el.matches('#design .step-progress'));
    for (const el of els) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      await frame();
      let opacity = 1;
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        opacity *= Number(cs.opacity);
        if (cs.display === 'none') problems.push(`${name(el)}: display none on ${a.tagName.toLowerCase()}.${a.className}`);
        if (cs.visibility === 'hidden') problems.push(`${name(el)}: visibility hidden on ${a.tagName.toLowerCase()}.${a.className}`);
      }
      if (opacity < 0.95) problems.push(`${name(el)}: opacity ${opacity.toFixed(2)}`);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { problems.push(`${name(el)}: empty box`); continue; }
      for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const b = a.getBoundingClientRect();
        if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) {
          problems.push(`${name(el)}: clipped by ${a.tagName.toLowerCase()}.${a.className}`);
        }
      }
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      // An inline or inline-block link's padding (a 44 px phone tap target) can reach over an adjacent line.
      // Where it paints nothing, it is looked through: a foreign link with no background, border,
      // box or text shadow, outline, filter or backdrop filter (each can paint outside the text), and only at a point
      // in its padding, outside its text (with 3 px for the underline). Its text, or anything it paints, still covers.
      const unpainted = h => {
        const cs = getComputedStyle(h);
        return (cs.display === 'inline' || cs.display === 'inline-block')
          && cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none'
          && cs.boxShadow === 'none' && cs.outlineStyle === 'none' && cs.textShadow === 'none'
          && cs.filter === 'none' && (cs.backdropFilter ?? 'none') === 'none' && (cs.webkitBackdropFilter ?? 'none') === 'none'
          && ['Top', 'Right', 'Bottom', 'Left'].every(side => cs[`border${side}Style`] === 'none' || parseFloat(cs[`border${side}Width`]) === 0);
      };
      const inText = h => {
        const range = document.createRange();
        range.selectNodeContents(h);
        return [...range.getClientRects()].some(t => x >= t.left - 3 && x <= t.right + 3 && y >= t.top - 3 && y <= t.bottom + 3);
      };
      const see = h => !(h.tagName === 'A' && !h.contains(el) && unpainted(h) && !inText(h));
      const hit = document.elementsFromPoint(x, y).find(see);
      if (!hit || !(hit === el || el.contains(hit))) problems.push(`${name(el)}: covered by ${hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'nothing'}`);
    }
    return { count: els.length, problems };
  }, { selector, content, frames });
}

/** Keeps the CSS and console fallbacks active without starting either WebGL2 scene. */
export const withoutScene = page => page.addInitScript(() => {
  delete window.WebGL2RenderingContext;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return type === 'webgl2' ? null : getContext.call(this, type, ...rest);
  };
});

// #design's connectors (story-how.spec.mjs; layout-v2.spec.mjs).
/** Whether the story's enhancement is on in this page (mode.ts's storyEnhanced()). */
export const enhanced = page => page.evaluate(() => CSS.supports('animation-timeline: view()')
  && matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)').matches
  && !document.documentElement.classList.contains('static'));

/** Scrolls to `f` (0..1) of #design's pinned scroll: its top at the viewport's top to its bottom at the bottom. */
export async function pinnedAt(page, f) {
  await page.evaluate(async f => {
    const s = document.getElementById('design');
    const top = s.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + f * (s.offsetHeight - innerHeight), behavior: 'instant' });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, f);
}

export const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));

/** Every connector endpoint that is off its box's named edge by more than 2 px, for every scene, as strings. */
export const endpointProblems = page => page.evaluate(() => {
  const out = [];
  for (const scene of document.querySelectorAll('#design .scene')) {
    const wires = JSON.parse(scene.dataset.wires);
    const paths = [...scene.querySelectorAll('svg.wires path.connector')];
    if (paths.length !== wires.length) { out.push(`${scene.dataset.os}: ${paths.length} paths for ${wires.length} wires`); continue; }
    // The path's user units to viewport pixels, as the boxes are measured: the SVG as drawn (its client rect) over
    // its own size in user units. Under CSS zoom the two differ by the zoom factor. Not getScreenCTM(): WebKit's
    // leaves CSS zoom out (2026-11-22: a = 1 at zoom 1.25, while the drawn lines were 1.25x), Chromium's has it.
    const svgEl = scene.querySelector('svg.wires');
    const drawn = svgEl.getBoundingClientRect();
    const sx = drawn.width / svgEl.width.baseVal.value, sy = drawn.height / svgEl.height.baseVal.value;
    paths.forEach((path, j) => {
      const nums = path.getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number);
      const pts = [];
      for (let k = 0; k < nums.length; k += 2) pts.push([drawn.left + nums[k] * sx, drawn.top + nums[k + 1] * sy]);
      const [from, fromSide, to, toSide] = wires[j];
      for (const [[x, y], id, side] of [[pts[0], from, fromSide], [pts[pts.length - 1], to, toSide]]) {
        const r = document.getElementById(id).getBoundingClientRect();
        const edge = { t: [y, r.top], b: [y, r.bottom], l: [x, r.left], r: [x, r.right] }[side];
        const along = side === 't' || side === 'b' ? [x, r.left, r.right] : [y, r.top, r.bottom];
        const ok = Math.abs(edge[0] - edge[1]) <= 2 && along[0] >= along[1] - 2 && along[0] <= along[2] + 2;
        if (!ok) out.push(`${scene.dataset.os} wire ${j} ${id}.${side}: (${x.toFixed(1)}, ${y.toFixed(1)}) vs box ${[r.left, r.top, r.right, r.bottom].map(v => v.toFixed(1))}`);
      }
    });
  }
  return out;
});

// The generic warm-up page: text in several sizes and weights, gradients, rounded corners, shadows,
// a blur, a mask, a backdrop filter and a picture, so the rasterizer's common shaders are compiled; with `webgl`, a
// WebGL2 context that clears once, so the GPU process and the GL backend are up. No three.js and none of the hero's
// shaders: their compilation is part of a first visit, and the timed visit pays it.
const WARM_PAGE = `<!doctype html><meta charset="utf-8"><title>warm-up</title>
<style>
  body { margin: 0; padding: 24px; font: 16px/1.5 system-ui, sans-serif; color: #ddd; background: linear-gradient(160deg, #222, #111); }
  h1 { font: 700 56px/1.1 Georgia, serif; } p { max-width: 60ch; } code { font: 14px ui-monospace, monospace; }
  .card { margin: 16px 0; padding: 16px; border: 1px solid #444; border-radius: 16px; box-shadow: 0 18px 50px #000a;
          background: radial-gradient(90% 100% at 0 0, #3a1a0c, #1a1a1a); }
  .blur { filter: blur(3px); opacity: 0.5; } .mask { mask-image: linear-gradient(#000, transparent); }
  .glass { backdrop-filter: blur(12px); background: #ffffff10; }
</style>
<h1>Warm-up page</h1><p>Generic text, <b>bold</b>, <i>italic</i> and <code>monospace</code>, so the first paint of the
timed visit is not the browser's first paint.</p>
<div class="card glass"><p class="blur">A blurred line.</p><p class="mask">A masked line.</p>
<img alt="" width="64" height="40" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='40'%3E%3Crect width='64' height='40' fill='%23d8662a'/%3E%3C/svg%3E"></div>
<canvas width="64" height="64"></canvas>`;

/**
 * Warms the browser's GPU process before a timed first visit, in a throwaway context: the site's /404 page until it
 * has painted (the header, the fonts and the base sheet; no hero and no WebGL), then the generic page above (and,
 * with `webgl`, a WebGL2 clear). A fresh headless browser has no GPU shader cache: its first page pays about 2 s
 * compiling the rasterizer's shaders before anything is painted (2026-11-22: first paint 3.3 s cold, 1.3 s warm, under
 * SwiftShader and on a Metal GPU alike), which a visitor's browser, with its shader cache on disk, never pays. Whether
 * a timed test was its worker's first page decided whether its LCP passed. : the warm-up used to be a
 * visit to `/` until the hero's scene drew, which compiled the hero's own shaders, so the "first visit" left out their
 * cold compilation; now nothing of the scene is loaded before the timed visit. (The generic page alone was measured
 * too: the phone LCP then rose from about 1.4 s to 3.15 s, the rasterizer's cold start for this site's first paint,
 * which /404 warms without the scene.) The timed visit keeps its own fresh context: no storage, no HTTP cache.
 */
export async function warmUp(browser, use, { webgl = false } = {}) {
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport, isMobile: use.isMobile, hasTouch: use.hasTouch });
  const page = await context.newPage();
  const scene = [];
  page.on('request', r => { if (/\/_astro\/(scene|stage|letters|ShaderPass)\./.test(r.url())) scene.push(r.url()); });
  await page.goto('/404');
  await page.waitForFunction(() => performance.getEntriesByType('paint').length > 0);
  await page.setContent(WARM_PAGE);
  const cleared = await page.evaluate(webgl => new Promise(resolve => {
    let ok = !webgl;
    if (webgl) {
      const gl = document.querySelector('canvas').getContext('webgl2');
      if (gl) {
        gl.clearColor(0.85, 0.4, 0.16, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        ok = px[0] > 200;
      }
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(ok)));
  }), webgl);
  if (!cleared) throw new Error('warmUp: the WebGL2 clear did not run');
  if (scene.length) throw new Error(`warmUp loaded the hero's scene code: ${scene.join(', ')}`);
  await context.close();
}
