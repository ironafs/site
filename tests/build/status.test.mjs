import test from 'node:test';
import assert from 'node:assert/strict';
import { currentMilestone, milestoneCode, nextMilestone, statusPill, trackOrder } from '../../src/data/milestones.ts';
import { milestoneCopy, pill } from '../../src/content/story.ts';

let number = 0;
/** A milestone as parseMilestones returns it; GitHub numbers follow creation order unless given. */
const m = (title, open, n = ++number) => ({ number: n, title, open, openItems: open ? 1 : 0, closedItems: 1, url: `https://github.com/ironafs/ironafs/milestone/${n}` });

test('pill while M1 is current', () => assert.equal(statusPill(m('M1: architecture', true)), pill.m1));

test('pill after M1', () => assert.equal(statusPill(m('M2a: core and Linux, read-only', true)), 'IronAFS™ · in progress: core and read-only Linux client'));

test('a closed milestone with a progress label still uses its title', () => {
  assert.equal(statusPill(m('M2a: core and Linux, read-only', false)), `${pill.closedPrefix}M2a: core and Linux, read-only`);
});

test('none → null, pill text "Design phase"', () => {
  assert.equal(currentMilestone([]), null);
  assert.equal(nextMilestone([], null), null);
  assert.equal(statusPill(null), pill.none);
});

test('code order, not number order', () => {
  const items = [m('M0: public foundation', false, 1), m('M2b: rxkad and tokens', true, 2), m('M2a: core and Linux, read-only', true, 3), m('M1: architecture', false, 4)];
  assert.equal(currentMilestone(items)?.title, 'M2a: core and Linux, read-only');
  assert.equal(nextMilestone(items, currentMilestone(items))?.title, 'M2b: rxkad and tokens');
});

test('M0 open is skipped', () => {
  const items = [m('M0: public foundation', true), m('M1: architecture', true), m('M2a: core and Linux, read-only', true)];
  assert.equal(currentMilestone(items)?.title, 'M1: architecture');
});

test('M1 closed → M2a is current', () => {
  const items = [m('M0: public foundation', false), m('M1: architecture', false), m('M2a: core and Linux, read-only', true), m('M2b: rxkad and tokens', true)];
  assert.equal(currentMilestone(items)?.title, 'M2a: core and Linux, read-only');
  assert.equal(statusPill(currentMilestone(items)), 'IronAFS™ · in progress: core and read-only Linux client');
});

test('all closed → the last by code, and no next', () => {
  const items = [m('M3: Linux writes and locks', false, 9), m('M0: public foundation', false, 1), m('M1: architecture', false, 2)];
  assert.equal(currentMilestone(items)?.title, 'M3: Linux writes and locks');
  assert.equal(nextMilestone(items, currentMilestone(items)), null);
});

test('next after M2a is M2b; next after M1 is M2a; the last open has no next', () => {
  const titles = ['M0: public foundation', 'M1: architecture', 'M2a: core and Linux, read-only', 'M2b: rxkad and tokens', 'M3: Linux writes and locks', 'M7: proposed later work'];
  const items = titles.map(t => m(t, t !== 'M0: public foundation'));
  const at = code => items.find(i => milestoneCode(i.title) === code);
  assert.equal(nextMilestone(items, at('M1'))?.title, 'M2a: core and Linux, read-only');
  assert.equal(nextMilestone(items, at('M2a'))?.title, 'M2b: rxkad and tokens');
  assert.equal(nextMilestone(items, at('M7')), null);
});

test('next skips a milestone already closed', () => {
  const items = [m('M1: architecture', true), m('M2a: core and Linux, read-only', false), m('M2b: rxkad and tokens', true)];
  assert.equal(nextMilestone(items, currentMilestone(items))?.title, 'M2b: rxkad and tokens');
});

test('milestoneCode handles "M7: proposed later work" and rejects "Roadmap"', () => {
  assert.equal(milestoneCode('M7: proposed later work'), 'M7');
  assert.equal(milestoneCode('M2a: core and Linux, read-only'), 'M2a');
  assert.equal(milestoneCode('M0: public foundation'), 'M0');
  assert.equal(milestoneCode('M10: far away'), 'M10');
  assert.equal(milestoneCode('Roadmap'), null);
  assert.equal(milestoneCode('M2 a: no'), null);
  assert.equal(milestoneCode('Milestone 3: no'), null);
  assert.equal(milestoneCode(''), null);
});

test('an unknown code is left out of now and next, and listed last on the track', () => {
  const roadmap = m('Roadmap', true, 1);
  const items = [roadmap, m('M2a: core and Linux, read-only', true, 3), m('M1: architecture', true, 2)];
  assert.equal(currentMilestone(items)?.title, 'M1: architecture');
  assert.equal(nextMilestone(items, currentMilestone(items))?.title, 'M2a: core and Linux, read-only');
  assert.deepEqual(trackOrder(items).map(i => i.title), ['M1: architecture', 'M2a: core and Linux, read-only', 'Roadmap']);
  assert.equal(currentMilestone([roadmap]), null, 'only unknown codes: no current');
  assert.equal(statusPill(currentMilestone([roadmap])), pill.none);
});

test('the track orders by code, M10 after M9, M2 before M2a', () => {
  const items = [m('M10: x', true), m('M2a: y', true), m('M9: z', true), m('M2: w', true), m('M0: v', false)];
  assert.deepEqual(trackOrder(items).map(i => milestoneCode(i.title)), ['M0', 'M2', 'M2a', 'M9', 'M10']);
});

test('a title with <&" passes through as text (Astro escapes it)', () => {
  const odd = m('M2a: a <b> & "c"', true);
  assert.equal(statusPill(odd), `${pill.nowPrefix}${odd.title}`);
});

test('every milestone M1 to M7 has a milestone card body', () => {
  for (const code of ['M1', 'M2a', 'M2b', 'M3', 'M4', 'M5', 'M6', 'M7']) {
    assert.ok(milestoneCopy[code]?.body, `${code} has a body`);
  }
  for (const [code, sentences] of Object.entries({ M2b: 2, M3: 2, M4: 2, M5: 2, M6: 1, M7: 2 })) {
    const body = milestoneCopy[code].body;
    assert.equal(body.match(/[.!?](\s|$)/g)?.length, sentences, `${code}: sentence count`);
    assert.doesNotMatch(body, /\bwill\b|\bships?\b|\bsoon\b|\b20\d\d\b/i, `${code}: no promise, no date`);
  }
});

test('every story section carries the SectionHead fields', async () => {
  const { story } = await import('../../src/content/story.ts');
  for (const key of ['crash', 'numbers', 'how', 'rust', 'cards', 'cost', 'platforms', 'speed', 'statusSection']) {
    assert.equal(typeof story[key].eyebrow, 'string', `${key}.eyebrow`);
    assert.equal(typeof story[key].heading, 'string', `${key}.heading`);
  }
});
