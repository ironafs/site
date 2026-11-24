// Runs CI's browser suite locally, slice by slice as the e2e matrix in .github/workflows/ci.yml has it (each slice's
// project, files, shard and worker count), one after another, with CI=1. Build first (npm run build); set PORT to a
// free port. Prints each slice's counts and exits non-zero when any test failed, or when a name filter matches no slice.
//   PORT=4617 node tools/ci-local.mjs [--out <dir>] [name filter]
// --hardware is the phone long-task gate, which CI's GPU-less runners cannot run: budgets.spec on
// chromium-phone with BUDGET_HW=1 (the host's GPU). It builds the checkout first (dist/ is untracked: an older build
// would be measured under this commit's name), and fails if the build fails, the tree has uncommitted changes, HEAD
// moves during the run, or the long-task test did not run and pass (not skipped, not filtered out). It prints the
// commit the build was made from, the renderer, the browser and the measured values, for the PR.
//   PORT=4617 node tools/ci-local.mjs --hardware
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slices } from './ci-slices.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'node_modules/@playwright/test/cli.js');
const argv = process.argv.slice(2);
const hardware = argv.includes('--hardware');
if (hardware) argv.splice(argv.indexOf('--hardware'), 1);
const outAt = argv.indexOf('--out');
const out = outAt >= 0 ? argv.splice(outAt, 2)[1] : join(root, 'test-results/ci-local');
const filter = argv[0];
mkdirSync(out, { recursive: true });

/** passed, failed, flaky, skipped and timed-out counts from a JSON report. */
function counts(file) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const c = { passed: 0, failed: 0, timedOut: 0, skipped: 0, interrupted: 0 };
  const failures = [];
  const walk = suite => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests) for (const r of t.results) {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (r.status === 'failed' || r.status === 'timedOut') failures.push(`${t.projectName} ${spec.file}:${spec.line} ${spec.title}`);
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites) walk(suite);
  return { c, failures };
}

const head = () => spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const uncommitted = () => spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== '';

if (hardware) {
  const sha = head();
  const dirty = uncommitted();
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  if (build.status !== 0) {
    console.log(`hardware gate: FAILED (the build of ${sha} failed)`);
    process.exit(1);
  }
  const json = join(out, 'hardware.json');
  const run = spawnSync(process.execPath, [cli, 'test', '--reporter=dot,json', '--project=chromium-phone', '--workers=1', 'tests/e2e/budgets.spec.mjs'], {
    cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CI: '1', BUDGET_HW: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: json },
  });
  const report = JSON.parse(readFileSync(json, 'utf8'));
  const results = [];
  const walk = suite => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests) for (const r of t.results) results.push({ title: spec.title, status: r.status, annotations: [...(t.annotations ?? []), ...(r.annotations ?? [])] });
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites) walk(suite);
  const gate = results.filter(r => r.title.startsWith('hardware GL: long-task time'));
  const moved = head() !== sha || uncommitted() !== dirty;
  console.log(`hardware gate: commit ${sha}, built from it by this run${dirty ? ' (with uncommitted changes)' : ''}${moved ? ' (the checkout changed during the run)' : ''}`);
  for (const r of results) console.log(`  ${r.status}: ${r.title}`);
  for (const a of new Map(gate.flatMap(r => r.annotations).map(a => [`${a.type}\n${a.description}`, a])).values()) console.log(`  ${a.type}: ${a.description}`);
  const ok = run.status === 0 && gate.length === 1 && gate[0].status === 'passed' && !dirty && !moved;
  console.log(ok ? 'hardware gate: PASSED' : `hardware gate: FAILED (${gate.length ? `the long-task test ${gate[0].status}` : 'the long-task test did not run'}${dirty ? ', uncommitted changes' : ''}${moved ? ', the checkout changed' : ''})`);
  process.exit(ok ? 0 : 1);
}

let bad = 0;
const total = { passed: 0, failed: 0, timedOut: 0, skipped: 0 };
const chosen = slices().map((slice, i) => ({ slice, i })).filter(({ slice }) => !filter || slice.name.includes(filter));
if (!chosen.length) {
  console.log(`no slice matches ${JSON.stringify(filter)}: nothing was run`);
  process.exit(1);
}
for (const { slice, i } of chosen) {
  const json = join(out, `${String(i + 1).padStart(2, '0')}.json`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [cli, 'test', '--reporter=dot,json', ...slice.args], {
    cwd: root, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CI: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: json },
  });
  const { c, failures } = counts(json);
  for (const k of Object.keys(total)) total[k] += c[k] ?? 0;
  if (run.status !== 0) bad++;
  console.log(`${slice.name}: ${c.passed} passed, ${c.failed + c.timedOut} failed, ${c.skipped} skipped (${Math.round((Date.now() - started) / 1000)} s)`);
  for (const f of failures) console.log(`  failed: ${f}`);
}
console.log(`total: ${total.passed} passed, ${total.failed + total.timedOut} failed, ${total.skipped} skipped`);
process.exit(bad ? 1 : 0);
