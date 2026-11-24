import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The mode predicate: enhanced only with scroll-driven animation, no reduced motion,
// more than 760 px, and no `.static` on <html>. A fake window drives it.
function fakeWindow({ supports = true, matches = true, isStatic = false } = {}) {
  const classes = new Set(isStatic ? ['static'] : []);
  const mqListeners = [];
  const observers = [];
  const query = { media: '', get matches() { return state.matches; }, addEventListener: (_, cb) => mqListeners.push(cb) };
  const state = { supports, matches };
  globalThis.CSS = { supports: text => text === 'animation-timeline: view()' && state.supports };
  globalThis.matchMedia = media => { query.media = media; return query; };
  globalThis.document = { documentElement: { classList: { contains: c => classes.has(c) } } };
  globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; observers.push(this); } observe(target, options) { this.target = target; this.options = options; } };
  return {
    query,
    setMatches(v) { state.matches = v; mqListeners.forEach(cb => cb()); },
    setStatic(v) { if (v) classes.add('static'); else classes.delete('static'); observers.forEach(o => o.cb([])); },
  };
}

const { storyEnhanced, onModeChange } = await import('../../src/scripts/story/mode.ts');

// The enhancement's media query, verbatim.
const GATE = '@media (scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)';

test('enhanced only when all three hold', () => {
  fakeWindow();
  assert.equal(storyEnhanced(), true);
  fakeWindow({ supports: false });
  assert.equal(storyEnhanced(), false);
  fakeWindow({ matches: false });
  assert.equal(storyEnhanced(), false);
  fakeWindow({ isStatic: true });
  assert.equal(storyEnhanced(), false);
});

test('the media query is the enhancement selector\'s', () => {
  const w = fakeWindow();
  storyEnhanced();
  assert.equal(w.query.media, GATE.slice('@media '.length));
});

test('onModeChange reports each change once, from the media query and from .static', () => {
  const w = fakeWindow();
  const seen = [];
  onModeChange(v => seen.push(v));
  w.setMatches(false);
  w.setMatches(false);
  w.setMatches(true);
  w.setStatic(true);
  w.setStatic(false);
  assert.deepEqual(seen, [false, true, false, true]);
});

/** The top-level blocks of a stylesheet (comments removed): `{ prelude, body }`, with nested blocks left in `body`. */
function blocks(css) {
  const found = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === ';' || css[i] === '}') start = i + 1;
    if (css[i] !== '{') continue;
    let depth = 1;
    let j = i + 1;
    for (; depth > 0; j++) depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0;
    found.push({ prelude: css.slice(start, i).trim(), body: css.slice(i + 1, j - 1) });
    i = j - 1;
    start = j;
  }
  return found;
}

/** Every style rule's selector list under `css`, at any depth of @media. */
function selectorsIn(css) {
  return blocks(css).flatMap(b => b.prelude.startsWith('@') ? selectorsIn(b.body) : [b.prelude]);
}

/** A selector list's selectors, split at its top-level commas only (not those inside :is() or :not()). */
function splitList(list) {
  const parts = [''];
  let depth = 0;
  for (const c of list) {
    depth += c === '(' ? 1 : c === ')' ? -1 : 0;
    if (c === ',' && depth === 0) parts.push('');
    else parts[parts.length - 1] += c;
  }
  return parts.map(p => p.trim());
}

// Check every enhanced sheet, not just motion.css (the hero's hand-off block is in hero.css).
const ENHANCED = ['story/motion.css', 'story/crash.css', 'story/how.css', 'story/rust.css', 'story/cost.css', 'story/platforms.css', 'hero.css'];

for (const sheet of ENHANCED) {
  test(`${sheet}: every enhanced block opens with the selector verbatim, and every rule in it is under html:not(.static)`, () => {
    const css = readFileSync(new URL(`../../src/styles/${sheet}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const all = blocks(css);
    const enhanced = all.filter(b => b.prelude === '@supports (animation-timeline: view())');
    assert.ok(enhanced.length > 0, 'no enhanced block');
    for (const block of enhanced) {
      const inner = blocks(block.body);
      assert.equal(inner.length, 1, 'one @media inside each @supports');
      assert.equal(inner[0].prelude, GATE);
      const selectors = selectorsIn(inner[0].body);
      assert.ok(selectors.length > 0);
      for (const list of selectors) for (const s of splitList(list)) assert.match(s, /^html:not\(\.static\) /, s);
    }
    // nothing scroll-driven escapes the gate: animation-timeline is set only inside an enhanced block
    const outside = all.filter(b => !enhanced.includes(b)).map(b => b.body).join('\n');
    assert.doesNotMatch(outside, /animation-timeline\s*:/);
  });
}
