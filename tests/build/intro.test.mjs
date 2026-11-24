import test from 'node:test';
import assert from 'node:assert/strict';
import { introSeen, markIntroSeen, wantsFullIntro } from '../../src/scripts/intro.mjs';

const throwing = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceeded'); } };

test('introSeen is false when getItem throws, when storage is missing, or empty', () => {
  assert.equal(introSeen(throwing), false);
  assert.equal(introSeen(null), false);
  assert.equal(introSeen({ getItem: () => null, setItem() {} }), false);
});

test('markIntroSeen swallows a throwing setItem and remembers otherwise', () => {
  assert.doesNotThrow(() => markIntroSeen(throwing));
  assert.doesNotThrow(() => markIntroSeen(null));
  const map = new Map();
  const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  assert.equal(introSeen(storage), false);
  markIntroSeen(storage);
  assert.equal(introSeen(storage), true);
});

test('wantsFullIntro: not seen and not reduced motion; a throwing localStorage still plays', () => {
  const win = (seen, reduced, broken = false) => ({
    matchMedia: () => ({ matches: reduced }),
    get localStorage() { if (broken) throw new Error('blocked'); return { getItem: () => (seen ? '1' : null), setItem() {} }; },
  });
  assert.equal(wantsFullIntro(win(false, false)), true);
  assert.equal(wantsFullIntro(win(true, false)), false);
  assert.equal(wantsFullIntro(win(false, true)), false);
  assert.equal(wantsFullIntro(win(false, false, true)), true);
});

// The head gate (public/intro-gate.js, a classic script) must decide exactly as wantsFullIntro does.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function runGate({ seen, reduced, brokenStorage, noMatchMedia }) {
  const attrs = {};
  const window = {
    matchMedia: noMatchMedia ? undefined : () => ({ matches: reduced }),
    get localStorage() {
      if (brokenStorage) throw new Error('blocked');
      return { getItem: () => (seen ? '1' : null) };
    },
  };
  const document = { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } };
  vm.runInNewContext(readFileSync(new URL('../../public/intro-gate.js', import.meta.url), 'utf8'), { window, document });
  return { gate: attrs['data-intro'] === 'play', win: window };
}

test('the head gate agrees with wantsFullIntro in every state', () => {
  for (const seen of [false, true]) for (const reduced of [false, true]) for (const brokenStorage of [false, true]) {
    const { gate, win } = runGate({ seen, reduced, brokenStorage });
    assert.equal(gate, wantsFullIntro(win), JSON.stringify({ seen, reduced, brokenStorage }));
  }
  const { gate, win } = runGate({ seen: false, reduced: false, noMatchMedia: true });
  assert.equal(gate, wantsFullIntro(win));
});
