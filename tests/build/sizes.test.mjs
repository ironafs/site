import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BUDGET_BYTES, heroBundleGzip } from '../../tools/bundle-size.mjs';
import { allFiles, dist, read } from './lib.mjs';

// The size budgets, gzip via node:zlib: the page (index.html and the stylesheets it links) within
// 60 KB; all the 3D (the hero's chunks and the glyph file, three.js once) within 300 KB.
// The 3D chunks are counted by tools/bundle-size.mjs, which CI also runs on its own.
const PAGE_BUDGET = 60 * 1024;
const gzip = buffer => gzipSync(buffer, { level: 9 }).length;

/** index.html and every stylesheet it links, each with its gzip size. */
function pageFiles() {
  const html = read('index.html');
  const css = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0])
    .filter(tag => /\srel="stylesheet"/i.test(tag))
    .map(tag => /\shref="\/([^"]+)"/i.exec(tag)[1]);
  return ['index.html', ...css].map(file => ({ file, gzip: gzip(readFileSync(join(dist, file))) }));
}

test('index.html and its CSS: within 60 KB gzip', () => {
  const files = pageFiles();
  assert.ok(files.some(f => f.file.endsWith('.css')), 'the page links its stylesheets');
  const total = files.reduce((sum, f) => sum + f.gzip, 0);
  assert.ok(total <= PAGE_BUDGET, `page ${total} bytes gzip (${files.map(f => `${f.file} ${f.gzip}`).join(', ')}) is over ${PAGE_BUDGET}`);
});

test('all the 3D: within 300 KB gzip, the glyph file counted', () => {
  const { chunks, total } = heroBundleGzip();
  assert.equal(BUDGET_BYTES, 300 * 1024);
  // The glyph file is bundled into a JS chunk, never a separate asset; that chunk is one of the counted ones.
  const typeface = JSON.parse(readFileSync(new URL('../../src/assets/hero/letters.typeface.json', import.meta.url), 'utf8'));
  assert.ok(!allFiles().some(f => /typeface|\.json$/.test(f) && f.startsWith('_astro/')), 'no glyph file outside the chunks');
  const astro = join(dist, '_astro');
  // every glyph's outline is in some counted chunk
  const outlines = Object.entries(typeface.glyphs).map(([ch, g]) => [ch, String(g.o).trim()]);
  const holders = readdirSync(astro).filter(f => f.endsWith('.js') && outlines.some(([, o]) => readFileSync(join(astro, f), 'utf8').includes(o)));
  const all = holders.map(f => readFileSync(join(astro, f), 'utf8')).join('\n');
  for (const [ch, o] of outlines) assert.ok(all.includes(o), `glyph ${ch} is in a chunk`);
  for (const file of holders) {
    const chunk = chunks.find(c => c.file === file);
    assert.ok(chunk, `${file} (the glyphs) is counted`);
    assert.deepEqual(chunk.roots, ['hero'], 'the hero loader reaches the glyphs');
  }
  assert.ok(total <= BUDGET_BYTES, `3D ${total} bytes gzip is over ${BUDGET_BYTES}`);
});
