import { ui } from '../../src/content/ui.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleText } from './lib.mjs';
import { milestoneCopy, pill as pillCopy } from '../../src/content/story.ts';
import { currentMilestone, milestoneCode, nextMilestone, parseMilestones, statusPill } from '../../src/data/milestones.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = name => join(root, 'tests/fixtures/milestones', name);
const dirs = [];

const built = new Map();
/** Build the site into its own output dir (not dist/) with MILESTONES_FIXTURE set; one build per fixture and env. */
function build(fixtureValue, extraEnv = {}) {
  const key = JSON.stringify([fixtureValue, extraEnv]);
  if (!built.has(key)) built.set(key, buildOnce(fixtureValue, extraEnv));
  return built.get(key);
}

function buildOnce(fixtureValue, extraEnv) {
  const out = mkdtempSync(join(tmpdir(), 'ironafs-ms-'));
  dirs.push(out);
  const run = spawnSync('npx', ['astro', 'build', '--outDir', out], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MILESTONES_FIXTURE: fixtureValue, GITHUB_TOKEN: '', ...extraEnv },
  });
  const html = run.status === 0 ? readFileSync(join(out, 'index.html'), 'utf8') : '';
  return { run, html, output: `${run.stdout}\n${run.stderr}` };
}

const section = html => (/<section[^>]*\bid="status"[^>]*>([\s\S]*?)<\/section>/.exec(html) ?? [])[1] ?? '';
const statusText = html => visibleText(section(html));
const pillsOf = html => [...html.matchAll(/<a\b[^>]*class="pill"[^>]*>([\s\S]*?)<\/a>/g)].map(p => visibleText(p[1].replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '')));
const pill = html => pillsOf(html)[1];
const hasLine = html => pillsOf(html).length === 2;

test.after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

test('M0 and M1 open: both titles, "12 done", the pill skips M0 and reads the M1 text', () => {
  const { run, html } = build(fixture('normal.json'));
  assert.equal(run.status, 0, run.stderr);
  const text = statusText(html);
  assert.match(text, /M0: public foundation/);
  assert.match(text, /M1: architecture/);
  assert.match(text, /12 done · 1 open items/);
  assert.match(text, /as of \d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(text, /\(snapshot\)/, 'a live fetch is not labelled a snapshot');
  assert.equal(pill(html), pillCopy.m1);
  assert.deepEqual(pillsOf(html), [pill(html).replace('™', ''), pill(html)], 'the hero and the menu say the same');
  assert.match(html, /href="https:\/\/github\.com\/ironafs\/ironafs\/milestones"/);
  assert.doesNotMatch(text, /issues/i, 'the status says items, never issues');
});

test('a title with < & and quotes is escaped, no element appears', () => {
  const { run, html } = build(fixture('odd-title.json'));
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(html, /<3>/);
  assert.match(html, /M&lt;3&gt; &amp; &#34;x&#34;|M&lt;3&gt; &amp; &quot;x&quot;/);
  assert.match(statusText(html), /M<3> & "x"/);
  assert.doesNotMatch(statusText(html), /issues/i);
  assert.equal(pill(html), pillCopy.none, 'a title without a milestone code is left out of the pill');
});

test('M1 closed, M2a open with <&" in its title: the pill names M2a, escaped', () => {
  const { run, html } = build(fixture('m1-closed-odd.json'));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(pill(html), `${pillCopy.nowPrefix}M2a: core <b> & "x"`);
  assert.doesNotMatch(html, /<b> &/);
  assert.match(html, /M2a: core &lt;b&gt; &amp; (&#34;|&quot;)x(&#34;|&quot;)/);
  // The track: code order, not GitHub order (M2b and Roadmap come first there); the title without a code last.
  const track = [...section(html).matchAll(/<li\b[^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(li => visibleText(li[1]));
  assert.deepEqual(track, ['M0: public foundation', 'M1: architecture', 'M2a: core <b> & "x"', 'M2b: rxkad and tokens', 'Roadmap']);
});

test('an empty list says "No milestones yet" and the pill says only "Design phase"', () => {
  const { run, html } = build(fixture('empty.json'));
  assert.equal(run.status, 0, run.stderr);
  assert.ok(statusText(html).includes(ui.milestonesEmpty));
  assert.equal(pill(html), pillCopy.none);
});

test('all closed: the pill names the last milestone by code (here M1)', () => {
  const { run, html } = build(fixture('all-closed.json'));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(pill(html), pillCopy.m1);
});

test('an unreachable API uses the snapshot, warns, and the build succeeds', () => {
  const { run, html, output } = build('unreachable');
  assert.equal(run.status, 0, output);
  assert.match(output, /milestones.*snapshot/i);
  const snapshot = JSON.parse(readFileSync(join(root, 'src/data/milestones.snapshot.json'), 'utf8'));
  assert.match(snapshot.fetchedAt, /^\d{4}-\d{2}-\d{2}$/, 'the snapshot carries its own date');
  assert.ok(snapshot.milestones.length > 0, 'the committed snapshot is not empty');
  for (const m of snapshot.milestones) assert.ok(statusText(html).includes(m.title), `${m.title} shown from the snapshot`);
  assert.ok(statusText(html).includes(`as of ${snapshot.fetchedAt} (snapshot)`), 'the status shows the snapshot date, marked as a snapshot');
  assert.doesNotMatch(statusText(html), new RegExp(`as of ${new Date().toISOString().slice(0, 10)}(?! \\(snapshot\\))`), 'never today\'s date over snapshot numbers');
  assert.ok(hasLine(html));
});

test('a foreign html_url fails the build and the message names html_url', () => {
  const { run, output } = build(fixture('foreign-url.json'));
  assert.notEqual(run.status, 0);
  assert.match(output, /html_url/);
});

test('a ../ html_url is rejected and the message names html_url', () => {
  const { run, output } = build(fixture('dotdot-url.json'));
  assert.notEqual(run.status, 0);
  assert.match(output, /html_url/);
});

test('a fetch that never resolves times out, warns once and uses the snapshot', () => {
  const { run, html, output } = build('hang', { MILESTONES_TIMEOUT_MS: '300' });
  assert.equal(run.status, 0, output);
  assert.match(output, /milestones.*snapshot/i);
  assert.equal(output.match(/using the committed snapshot/g)?.length, 1, 'warning printed once (memoised)');
  assert.ok(hasLine(html));
});

// The now and next cards: the title from GitHub, the body from milestoneCopy keyed by the code.
const card = (html, which) => {
  const body = (new RegExp(`<article\\b[^>]*data-card="${which}"[^>]*>([\\s\\S]*?)</article>`).exec(section(html)) ?? [])[1];
  if (body === undefined) return null;
  const part = cls => visibleText((new RegExp(`<[a-z0-9]+\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</[a-z0-9]+>`).exec(body) ?? [])[1] ?? '');
  return { title: part('nn-title'), body: part('nn-body') };
};
const current = html => [...section(html).matchAll(/<a\b[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/a>/g)].map(a => visibleText(a[1]));

test('the committed snapshot (API unreachable): the now and next cards and the current mark follow its current milestone', () => {
  const { run, html, output } = build('unreachable');
  assert.equal(run.status, 0, output);
  const items = parseMilestones(JSON.parse(readFileSync(join(root, 'src/data/milestones.snapshot.json'), 'utf8')).milestones);
  const now = currentMilestone(items);
  const next = nextMilestone(items, now);
  assert.ok(now && next, 'the snapshot has a current and a next milestone');
  assert.deepEqual(card(html, 'now'), { title: now.title, body: milestoneCopy[milestoneCode(now.title)].body });
  assert.deepEqual(card(html, 'next'), { title: next.title, body: milestoneCopy[milestoneCode(next.title)].body });
  assert.deepEqual(current(html), [now.title]);
  assert.equal(pill(html), statusPill(now));
});

test('M1 closed, M2a open: the now card is M2a, next is M2b, and the pill has a display label', () => {
  const { run, html, output } = build(fixture('m1-closed.json'));
  assert.equal(run.status, 0, output);
  assert.deepEqual(card(html, 'now'), { title: 'M2a: core and Linux, read-only', body: milestoneCopy.M2a.body });
  assert.deepEqual(card(html, 'next'), { title: 'M2b: rxkad and tokens', body: milestoneCopy.M2b.body });
  assert.deepEqual(current(html), ['M2a: core and Linux, read-only']);
  assert.equal(pill(html), 'IronAFS™ · in progress: core and read-only Linux client');
  // closed milestones read as done in text too, never only by colour ("12 done" counts items, not the milestone)
  const state = s => [...section(html).matchAll(new RegExp(`<li\\b[^>]*data-state="${s}"[^>]*>([\\s\\S]*?)</li>`, 'g'))].map(li => visibleText(li[1]));
  assert.equal(state('closed').length, 2);
  for (const li of state('closed')) assert.ok(li.includes(ui.closedSpoken.trim()));
  for (const li of state('open')) assert.ok(!li.includes(ui.closedSpoken.trim()));
});

test('no milestones: no now or next card, the follow card stays', () => {
  const { run, html } = build(fixture('empty.json'));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(card(html, 'now'), null);
  assert.equal(card(html, 'next'), null);
  assert.match(card(html, 'follow')?.title ?? '', /^Follow development/);
});

// Malformed data fails validation: a state other than open or closed would otherwise read as closed (a false
// completion), and a count that is not a non-negative integer would publish an impossible number.
test('parseMilestones rejects an unknown state and impossible counts', () => {
  const good = { number: 3, title: 'M2a: core', state: 'open', open_issues: 2, closed_issues: 5, html_url: 'https://github.com/ironafs/ironafs/milestone/3' };
  assert.equal(parseMilestones([good]).length, 1);
  assert.equal(parseMilestones([{ ...good, state: 'closed' }])[0].open, false);
  for (const [field, value] of [['state', 'merged'], ['state', 'OPEN'], ['open_issues', -1], ['closed_issues', 1.5], ['open_issues', Number.NaN], ['closed_issues', Infinity]]) {
    assert.throws(() => parseMilestones([{ ...good, [field]: value }]), new RegExp(field), `${field}: ${value}`);
  }
});

// The shell's `cat status` and `afs status` read the milestones the build used (#shell[data-status]), as the
// status section does: never a milestone fixed in the copy.
const shellStatusOf = html => JSON.parse((/<dialog\b[^>]*id="shell"[^>]*\bdata-status="([^"]*)"/.exec(html) ?? [])[1]?.replace(/&quot;/g, '"').replace(/&#34;/g, '"') ?? 'null');

test('the shell\'s status follows the build\'s milestones: M2a in progress, M2b next; all closed; none', () => {
  assert.deepEqual(shellStatusOf(build(fixture('m1-closed.json')).html), { code: 'M2a', open: true, next: 'M2b' });
  assert.deepEqual(shellStatusOf(build(fixture('all-closed.json')).html), { code: 'M1', open: false, next: null });
  assert.deepEqual(shellStatusOf(build(fixture('empty.json')).html), { code: null, open: false, next: null });
});
