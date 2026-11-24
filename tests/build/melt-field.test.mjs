import test from 'node:test';
import assert from 'node:assert/strict';
import { MELT, meltAt, meltEnd, slumpAt } from '../../src/scripts/hero/melt-field.ts';
import { meltGlsl } from '../../src/scripts/hero/melt-glsl.ts';

// A word laid out like the real one: seven letters across a chip of half-width 3.7, the hot letters I, n, A, S.
const CHIP_HALF = 3.7;
const CHIP_DEPTH = 2;
const HOT = [-2.95, -0.95, 1.05, 2.95];
const END = meltEnd(HOT, CHIP_HALF, CHIP_DEPTH);
const xs = Array.from({ length: 75 }, (_, i) => -CHIP_HALF + (2 * CHIP_HALF * i) / 74);
const zs = [-1, -0.5, 0, 0.5, 1];

/** The time a point is half melted (bisection: meltAt rises with t). */
function halfTime(x, z, hot = HOT, chipHalf = CHIP_HALF) {
  let lo = 0, hi = meltEnd(hot, chipHalf, CHIP_DEPTH) + 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (meltAt(x, z, mid, hot, chipHalf) < 0.5) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;

test('nothing has melted at t = 0, everything has at meltEnd + 0.01', () => {
  assert.ok(END > 1 && END < 10, `meltEnd ${END}`);
  for (const x of xs) {
    for (const z of zs) {
      assert.equal(meltAt(x, z, 0, HOT, CHIP_HALF), 0, `at ${x}, ${z}, t 0`);
      assert.equal(meltAt(x, z, END + 0.01, HOT, CHIP_HALF), 1, `at ${x}, ${z}, t ${END + 0.01}`);
    }
  }
});

test('the melt only ever advances: monotonic in t at 50 sampled points', () => {
  for (let i = 0; i < 50; i++) {
    const x = -CHIP_HALF + ((i * 0.61803) % 1) * 2 * CHIP_HALF;
    const z = -CHIP_DEPTH / 2 + ((i * 0.41421) % 1) * CHIP_DEPTH;
    let prev = -1;
    for (let t = 0; t <= END + 0.5; t += 0.02) {
      const m = meltAt(x, z, t, HOT, CHIP_HALF);
      assert.ok(m >= prev - 1e-12, `meltAt(${x}, ${z}) fell at t ${t}: ${prev} -> ${m}`);
      assert.ok(m >= 0 && m <= 1);
      prev = m;
    }
  }
});

test('hottest under the letters: a point under a hot letter is half melted before a point 1.5 units away', () => {
  // one hot letter alone on the chip (the others far off), so 1.5 units away is away from every hot letter
  const half = 4;
  for (const h of [-1.2, 0, 0.7]) {
    const hot = [h, 99, 99, 99];
    const under = mean(zs.map(z => halfTime(h, z, hot, half)));
    const away = mean(zs.flatMap(z => [halfTime(h - 1.5, z, hot, half), halfTime(h + 1.5, z, hot, half)]));
    assert.ok(under < away, `letter at ${h}: under ${under.toFixed(3)} s, 1.5 away ${away.toFixed(3)} s`);
  }
});

test('the thin ends melt early: past 0.97 of the half-width, half melted sooner than the middle on average', () => {
  const ends = xs.filter(x => Math.abs(x) > 0.97 * CHIP_HALF);
  const middle = xs.filter(x => Math.abs(x) < 0.5 * CHIP_HALF);
  assert.ok(ends.length >= 2 && middle.length > 10);
  const tEnds = mean(ends.flatMap(x => zs.map(z => halfTime(x, z))));
  const tMiddle = mean(middle.flatMap(x => zs.map(z => halfTime(x, z))));
  assert.ok(tEnds < tMiddle, `ends ${tEnds.toFixed(3)} s, middle ${tMiddle.toFixed(3)} s`);
});

test('the GLSL twin is built from the same constants: each MELT value is in it, read from the argument', () => {
  // distinctive values, so a literal cannot be found by accident elsewhere in the shader
  const odd = { base: 0.1234, noise: 1.5678, hotDistance: 0.9123, edgeEarly: 0.9456, durBase: 0.8765, durSpread: 1.6543 };
  const glsl = meltGlsl(odd, 3);
  assert.match(glsl, /float meltAt\(float x, float z\)/);
  assert.match(glsl, /uniform float uA;/);
  assert.match(glsl, /uniform vec4 uHot;/);
  for (const [name, value] of Object.entries(odd)) assert.ok(glsl.includes(String(value)), `${name} = ${value} is not in the GLSL`);
  assert.ok(glsl.includes('3.0'), 'the chip half-width is baked in');
  // generated text: every bracket closes (an unbalanced one compiled to a blank chip in the browser, not a test failure)
  let depth = 0;
  for (const ch of glsl) { depth += ch === '(' ? 1 : ch === ')' ? -1 : 0; assert.ok(depth >= 0); }
  assert.equal(depth, 0, 'unbalanced parentheses in the GLSL');
});

/** Runs the generated GLSL as JavaScript: the few GLSL forms it uses map one to one. */
function glslAsJs(glsl, hot, a) {
  const body = glsl
    .replace(/uniform[^;]*;[^\n]*\n/, '')
    .replace(/float (\w+)\(float (\w+), float (\w+)\)\{/g, 'function $1($2, $3){')
    .replace(/\bfloat /g, 'let ');
  const smoothstep = (e0, e1, v) => { const t = Math.min(Math.max((v - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };
  const make = new Function('uA', 'uHot', 'smoothstep', 'sin', 'abs', 'max', 'min', `${body}\nreturn { meltAt, slumpAt };`);
  return make(a, { x: hot[0], y: hot[1], z: hot[2], w: hot[3] }, smoothstep, Math.sin, Math.abs, Math.max, Math.min);
}

test('the GLSL computes the same field as the JavaScript, at 400 points across the melt', () => {
  const glsl = meltGlsl(MELT, CHIP_HALF);
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const x = -CHIP_HALF + ((i * 0.61803) % 1) * 2 * CHIP_HALF;
    const z = -1 + ((i * 0.41421) % 1) * 2;
    const t = ((i * 0.27183) % 1) * (END + 0.5);
    const g = glslAsJs(glsl, HOT, t);
    worst = Math.max(worst, Math.abs(g.meltAt(x, z) - meltAt(x, z, t, HOT, CHIP_HALF)), Math.abs(g.slumpAt(x, z) - slumpAt(x, z, t, HOT, CHIP_HALF)));
  }
  assert.ok(worst < 1e-3, `the GLSL and the JavaScript differ by up to ${worst}`);
});
