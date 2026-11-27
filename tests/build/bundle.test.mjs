import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET_BYTES, heroBundleGzip } from '../../tools/bundle-size.mjs';

const tool = fileURLToPath(new URL('../../tools/bundle-size.mjs', import.meta.url));

test('the 3D bundle (three.js, the hero scene and the glyphs) is built, split from the page scripts and within 300 KB gzip', () => {
  const { chunks, total } = heroBundleGzip();
  assert.ok(chunks.some(chunk => chunk.file.startsWith('scene.')), 'the scene chunk is a dynamic import of the hero loader');
  assert.ok(chunks.every(chunk => chunk.roots.length === 1 && chunk.roots[0] === 'hero'), 'only the hero reaches the 3D bundle');
  assert.equal(new Set(chunks.map(chunk => chunk.file)).size, chunks.length, 'no chunk counted twice');
  assert.ok(total > 50 * 1024, `three.js is in it (${total} bytes gzip)`);
  assert.ok(total <= BUDGET_BYTES, `hero bundle ${total} bytes gzip is over ${BUDGET_BYTES}`);
  const run = spawnSync(process.execPath, [tool], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /3D total: [\d.]+ KB gzip/);
});

test('the size check fails above the budget: the CLI exits non-zero on a fake over-budget chunk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hero-bundle-'));
  mkdirSync(join(dir, '_astro'));
  writeFileSync(join(dir, '_astro', 'Hero.astro_astro_type_script_index_0_lang.x.js'), 'import("./scene.x.js");');
  // incompressible bytes: random data does not shrink under gzip
  const noise = Buffer.from(Array.from({ length: BUDGET_BYTES + 4096 }, () => Math.floor(Math.random() * 256)));
  writeFileSync(join(dir, '_astro', 'scene.x.js'), noise);
  assert.ok(heroBundleGzip(dir).total > BUDGET_BYTES);
  const run = spawnSync(process.execPath, [tool, dir], { encoding: 'utf8' });
  assert.notEqual(run.status, 0, 'the CLI rejects an over-budget bundle');
  assert.match(run.stderr, /over budget/);
  assert.match(run.stdout, /3D total: [\d.]+ KB gzip/);
});
