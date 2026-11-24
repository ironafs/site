import test from 'node:test';
import assert from 'node:assert/strict';
import { chipTopUnder } from '../../src/scripts/hero/footprint.ts';

test('the top under a letter is the highest chip point over its footprint, clipped to the chip', () => {
  const seen = [];
  const topAt = x => { seen.push(x); return 1 + x; };
  // x 3.2, half .4 -> footprint [2.8, 3.6], clipped to the chip [-3, 3] -> [2.8, 3.0]
  const top = chipTopUnder({ x: 3.2, half: 0.4 }, 3, topAt);
  assert.ok(seen.every(x => x >= 2.8 - 1e-9 && x <= 3.0 + 1e-9), `sampled outside [2.8, 3.0]: ${seen}`);
  assert.equal(seen.length, 7);
  assert.ok(Math.abs(top - 4.0) < 1e-9, `the highest sample is at 3.0 (${top})`);
});

test('a letter wholly beyond the chip rests on the floor (0)', () => {
  assert.equal(chipTopUnder({ x: 4, half: 0.4 }, 3, () => 9), 0);
  assert.equal(chipTopUnder({ x: -4, half: 0.4 }, 3, () => 9), 0);
});

test('a surface that peaks at the letter edge gives the edge value (the F case)', () => {
  const edge = 2.8;
  const topAt = x => (Math.abs(x - edge) < 1e-9 ? 1.37 : 1.02);
  assert.equal(chipTopUnder({ x: 3.2, half: 0.4 }, 3, topAt), 1.37);
  assert.equal(chipTopUnder({ x: 3.2, half: 0.4 }, 3, () => 1.02), 1.02);
});

test('a letter fully on the chip samples its whole footprint', () => {
  const seen = [];
  chipTopUnder({ x: 0, half: 1 }, 3, x => { seen.push(x); return 0; }, 5);
  assert.deepEqual(seen.map(x => Math.round(x * 100) / 100), [-1, -0.5, 0, 0.5, 1]);
});
