import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { read, visibleText } from './lib.mjs';
import { timeline, xFor, lanes, ticks, breaks } from '../../src/data/timeline.ts';
import { story } from '../../src/content/story.ts';

// Where the platforms are going (#platforms): the timeline's data and its date scale.

/** A string as a literal regular expression. */
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sources = readFileSync(new URL('../../docs/sources/os-timeline.md', import.meta.url), 'utf8');

test('xFor: 2005 is 0, 2026-12 is 1, monotonic, with the compressed spans at their knots', () => {
  assert.equal(xFor('2005'), 0);
  assert.equal(xFor('2026-12'), 1);
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
  near(xFor('2007'), 0.11, '2007');
  near(xFor('2017-10'), 0.26, '2017-10');
  near(xFor('2018-10'), 0.4, '2018-10');
  near(xFor('2019-10'), 0.43, '2019-10');
  near(xFor('2021'), 0.46, '2021');
  near(xFor('2024'), 0.53, '2024');
  let last = -Infinity;
  for (let y = 2005; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      const date = `${y}-${String(m).padStart(2, '0')}`;
      const x = xFor(date);
      assert.ok(x > last, `${date}: ${x} after ${last}`);
      assert.ok(x >= 0 && x <= 1, `${date}: ${x} in [0, 1]`);
      last = x;
    }
  }
  // a year alone is its January
  assert.equal(xFor('2024'), xFor('2024-01'));
  // the spans without many events are compressed: a year of 2021-2023 is narrower than a year of 2024-2026
  assert.ok(xFor('2023') - xFor('2022') < (xFor('2026') - xFor('2025')) / 3);
});

test('xFor normalises to the bounds it is given, with no jump', () => {
  assert.equal(xFor('2018-12', '2005', '2018-12'), 1);
  assert.equal(xFor('2005', '2005', '2018-12'), 0);
  assert.equal(xFor('2020', '2020', '2026-12'), 0);
  assert.equal(xFor('2026-12', '2020', '2026-12'), 1);
  assert.equal(xFor('2030', '2020', '2026-12'), 1, 'clamped');
  for (const [from, to] of [['2005', '2018-12'], ['2020', '2026-12'], ['2022', '2025'], ['2010', '2030']]) {
    let last = -Infinity;
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
      for (let m = 1; m <= 12; m++) {
        const date = `${y}-${String(m).padStart(2, '0')}`;
        if (date < from || date > to) continue;
        const x = xFor(date, from, to);
        assert.ok(x >= last, `${from}..${to} ${date}: ${x} after ${last}`);
        if (last > -Infinity) assert.ok(x - last < 0.1, `${from}..${to} ${date}: a jump from ${last} to ${x}`);
        last = x;
      }
    }
  }
});

test('ticks and scale breaks: in order, and each break between two ticks inside a compressed span', () => {
  assert.ok(ticks.length >= 8);
  assert.deepEqual(ticks, [...ticks].sort());
  for (const b of breaks) {
    const before = ticks.filter(t => xFor(t) < xFor(b)).at(-1);
    const after = ticks.find(t => xFor(t) > xFor(b));
    assert.ok(before && after, `${b} lies between ticks`);
  }
  assert.ok(breaks.some(b => b > '2020' && b < '2024'), 'a break between 2020 and 2023');
});

test('the strings live in story.platforms: timeline and lanes are its arrays', () => {
  assert.equal(timeline, story.platforms.events);
  assert.equal(lanes, story.platforms.lanes);
});

test('every entry has a lane, a date, its text and an https primary source from os-timeline.md', () => {
  assert.equal(timeline.length, 12);
  for (const e of timeline) {
    assert.ok(['linux', 'macos', 'windows', 'ironafs'].includes(e.lane), `${e.title}: lane ${e.lane}`);
    assert.match(e.date, /^\d{4}(-(0[1-9]|1[0-2]))?$/, `${e.title}: date`);
    for (const key of ['label', 'title', 'text']) assert.ok(e[key].trim(), `${e.title}: ${key}`);
    assert.equal(new URL(e.href).protocol, 'https:', `${e.title}: ${e.href}`);
    if (e.lane !== 'ironafs') assert.ok(sources.includes(e.href), `${e.title}: ${e.href} is a source in os-timeline.md`);
    for (const link of e.sources ?? []) {
      assert.ok(link.label.trim(), `${e.title}: second source label`);
      assert.equal(new URL(link.href).protocol, 'https:');
      assert.ok(sources.includes(link.href), `${e.title}: ${link.href} is a source in os-timeline.md`);
    }
  }
});

test('each lane is in date order, and the timeline ends with the IronAFS design', () => {
  for (const [lane, count] of Object.entries({ linux: 4, macos: 3, windows: 4 })) {
    const dates = timeline.filter(e => e.lane === lane).map(e => xFor(e.date));
    assert.equal(dates.length, count, lane);
    assert.deepEqual(dates, [...dates].sort((a, b) => a - b), `${lane} in date order`);
  }
  const fin = timeline.at(-1);
  assert.equal(fin.lane, 'ironafs');
  assert.equal(fin, story.platforms.events.at(-1));
  assert.equal(fin.title, 'IronAFS');
  assert.equal(timeline.filter(e => e.lane === 'ironafs').length, 1);
  assert.deepEqual(lanes.map(l => l.id), ['linux', 'macos', 'windows']);
});

test('the built #platforms carries every event, linked to its source, and no draft sources pill', () => {
  const html = read('index.html');
  const section = /<section id="platforms"[\s\S]*?<\/section>/.exec(html)[0];
  assert.ok(section.length > 100, 'the section is built');
  const text = visibleText(section);
  assert.match(text, /Every platform now supports code outside the kernel\./);
  for (const e of timeline) {
    for (const key of ['label', 'title', 'text']) assert.ok(text.includes(e[key]), `${e.title}: ${key} "${e[key]}" is shown`);
    const link = new RegExp(`<a\\b[^>]*href="${esc(e.href)}"[^>]*>\\s*${esc(e.title)}\\s*</a>`);
    assert.match(section, link, `${e.title} links to ${e.href}`);
    for (const l of e.sources ?? []) assert.match(section, new RegExp(`<a\\b[^>]*href="${esc(l.href)}"[^>]*>\\s*${esc(l.label)}\\s*</a>`), `${e.title}: ${l.label}`);
  }
  assert.match(timeline.find(e => e.title === 'Endpoint security platform' && e.date === '2026-11').href, /2026\/11\/17\/windows-security-at-ignite-2026/);
  assert.deepEqual(timeline.filter(e => e.lane === 'windows').map(e => [e.label, e.title, e.text, e.href]).slice(1, 3), [
    ['2017 · 1709', 'Cloud Files API', 'A user-mode sync provider hydrates placeholder files on demand.', 'https://learn.microsoft.com/en-us/windows/win32/cfapi/build-a-cloud-file-sync-engine'],
    ['2018 · 1809', 'ProjFS', 'A user-mode provider can project a file tree into a folder.', 'https://learn.microsoft.com/en-us/windows/win32/projfs/projfs-programming-guide'],
  ]);
  assert.doesNotMatch(text, /Rust stays|Kexts need Reduced Security|Windows protected print mode|Windows Resiliency Initiative|Driver Quality Initiative/);
  assert.match(timeline.find(e => e.title === 'FUSE zero-copy' && e.date === '2026-10').href, /kernel\.googlesource\.com\/.*\/9cebfe6504488198b012e746bc6b313f88b95439$/);
  for (const l of lanes) assert.ok(text.includes(l.name), `lane ${l.name}`);
  assert.doesNotMatch(text, /Sources:/);
  assert.doesNotMatch(section, /class="[^"]*\bdraft\b/);
  assert.doesNotMatch(section, /\sstyle=/);
});
