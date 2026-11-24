import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { slices, workflowPath } from '../../tools/ci-slices.mjs';
import { fileURLToPath } from 'node:url';

// CI's browser suite is split into slices (.github/workflows/ci.yml, the e2e job's matrix). A spec missing from
// every slice can silently miss CI on that project.
// arguments) and requires the slices together to select every test of every project, each in a job that installs
// its browser.
const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = readFileSync(workflowPath, 'utf8');
const cli = fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js', import.meta.url));

/** The tests Playwright selects for `args`, one line each: "[project] › file:line:col › title" (cached per args). */
const listings = new Map();
function listed(args) {
  const key = args.join(' ');
  if (!listings.has(key)) listings.set(key, list(args));
  return listings.get(key);
}
function list(args) {
  const run = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=list', ...args.filter(a => !/^--(workers|reporter)\b/.test(a))], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `playwright --list ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.split('\n').filter(line => /^\s+\[[^\]]+\] › /.test(line)).map(line => line.trim());
}

const projectOf = line => /^\[([^\]]+)\]/.exec(line)[1];
const fileOf = line => / › ([^:]+\.spec\.mjs):/.exec(line)[1];

test('the matrix reader reads every entry and its arguments', () => {
  const yaml = 'jobs:\n  e2e:\n    strategy:\n      matrix:\n        include:\n          - name: a, b\n            browser: chromium\n            args: --project=x --workers=1 one two\n          - name: c\n            browser: webkit\n            args: --project=y\n    steps:\n';
  assert.deepEqual(slices(yaml), [
    { name: 'a, b', browser: 'chromium', args: ['--project=x', '--workers=1', 'one', 'two'] },
    { name: 'c', browser: 'webkit', args: ['--project=y'] },
  ]);
  const real = slices(workflow);
  assert.ok(real.length >= 10, `${real.length} slices`);
  for (const slice of real) {
    assert.ok(slice.name && slice.browser && slice.args.length, `a complete entry: ${JSON.stringify(slice)}`);
    assert.ok(slice.args.some(a => a.startsWith('--project=')), `${slice.name} names its project`);
  }
  assert.match(workflow, /npm run test:e2e -- --reporter=list \$\{\{ matrix\.args \}\}/, 'the e2e step passes the slice\'s arguments');
});

test('every test of every project runs in some CI slice, in a job that installs its browser', () => {
  const all = listed([]);
  assert.ok(all.length > 500, `${all.length} tests listed`);
  const covered = new Set();
  for (const slice of slices(workflow)) {
    const tests = listed(slice.args);
    assert.ok(tests.length > 0, `${slice.name} selects tests`);
    for (const line of tests) {
      const project = projectOf(line);
      assert.ok(project.startsWith(`${slice.browser}-`), `${slice.name} installs ${slice.browser} but runs ${project}`);
      covered.add(line);
    }
  }
  const missing = all.filter(line => !covered.has(line));
  const byFile = [...new Set(missing.map(line => `${projectOf(line)} ${fileOf(line)}`))];
  assert.deepEqual(byFile, [], `${missing.length} tests run in no slice`);
});

test('every e2e spec file is reachable on chromium-desktop by some slice', () => {
  const specs = readdirSync(new URL('../e2e/', import.meta.url)).filter(f => f.endsWith('.spec.mjs')).sort();
  const reached = new Set();
  for (const slice of slices(workflow)) {
    for (const line of listed(slice.args)) if (projectOf(line) === 'chromium-desktop') reached.add(fileOf(line).replace(/^.*\//, ''));
  }
  assert.deepEqual(specs.filter(spec => !reached.has(spec)), []);
});

// Every push to main is tested: a push's run has its own concurrency group (its commit), so a third push can never
// replace a run of main that is still pending; a pull request's group is its number, and a new push cancels it.
test('the workflow\'s concurrency groups main pushes by commit and pull requests by number', () => {
  const block = /\nconcurrency:\n {2}group: (.*)\n {2}cancel-in-progress: (.*)\n/.exec(workflow);
  assert.ok(block, 'ci.yml has a top-level concurrency block');
  const [, group, cancel] = block;
  assert.match(group, /github\.sha/, 'a push to main is grouped by its commit');
  assert.doesNotMatch(group, /github\.ref\b/, 'never by the branch: pending main runs would replace each other');
  assert.match(group, /github\.event\.pull_request\.number/);
  assert.equal(cancel.trim(), "${{ github.event_name == 'pull_request' }}");
});
