import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// tools/ci-local.mjs: a filter that matches no slice is a failure, not an empty pass; the hardware gate builds the
// checkout before it measures (dist/ is untracked) and stops when that build fails.
const root = fileURLToPath(new URL('../../', import.meta.url));
const tool = join(root, 'tools/ci-local.mjs');

test('a name filter that matches no slice exits non-zero and runs nothing', () => {
  const out = mkdtempSync(join(tmpdir(), 'ironafs-ci-local-'));
  try {
    const run = spawnSync(process.execPath, [tool, '--out', out, 'no-such-slice-name'], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /no slice matches "no-such-slice-name"/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the hardware gate builds first, and a failed build fails the gate before anything is measured', { skip: process.platform === 'win32' }, () => {
  const bin = mkdtempSync(join(tmpdir(), 'ironafs-fake-npm-'));
  try {
    const log = join(bin, 'calls');
    // npm stands in for the build: it records its arguments and fails
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\necho "$@" >> "${log}"\nexit 1\n`);
    chmodSync(join(bin, 'npm'), 0o755);
    const run = spawnSync(process.execPath, [tool, '--hardware', '--out', bin], {
      cwd: root, encoding: 'utf8', timeout: 20_000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stdout, /hardware gate: FAILED \(the build of [0-9a-f]{40} failed\)/);
    assert.equal(readFileSync(log, 'utf8').trim(), 'run build');
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});
