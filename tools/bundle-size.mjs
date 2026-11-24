// Prints the gzip size of the 3D bundle and fails above the budget (300 KB gzip for all
// the 3D). It counts every chunk the hero's loader and the Rust word's loader reach through their dynamic imports
// (`import('./scene')`), with those chunks' static imports: three.js once (it is shared), the hero's scene and
// stage, the Rust word's scene, and the glyph file (letters.typeface.json, bundled into the letters' chunk).
// Run after `npm run build` (`node tools/bundle-size.mjs [dist dir]`, dist/ by default); tests/build/bundle.test.mjs
// covers it.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const BUDGET_BYTES = 300 * 1024;
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

/** The page scripts whose dynamic imports load 3D: the hero's (Hero.astro) and the Rust word's (Rust.astro). */
export const LOADERS = { hero: 'Hero.astro_astro_type_script', rustword: 'Rust.astro_astro_type_script' };

/**
 * The 3D chunks: everything each loader reaches through a dynamic import, with those chunks' static imports. A
 * loader's own static imports (shared page code, such as the hero's loader, which the Rust word's script imports for
 * its floor and tier) are followed but not counted: they are page scripts. Each chunk is counted once, with `roots`:
 * the loaders that reach it (a chunk both reach, three.js, is shared).
 */
export function threeDChunks(distDir = dist) {
  const dir = join(distDir, '_astro');
  const files = readdirSync(dir).filter(file => file.endsWith('.js'));
  const staticImport = /(?:from|import)\s*["']\.\/([^"']+\.js)["']/g;
  const dynamicImport = /import\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g;
  const roots = new Map();
  for (const [root, prefix] of Object.entries(LOADERS)) {
    const page = new Set();
    const counted = new Set();
    const visit = (file, is3d) => {
      const source = readFileSync(join(dir, file), 'utf8');
      for (const [pattern, next3d] of [[staticImport, is3d], [dynamicImport, true]]) {
        for (const [, next] of source.matchAll(pattern)) {
          if (!files.includes(next)) continue;
          if (next3d && !counted.has(next)) { counted.add(next); visit(next, true); }
          else if (!next3d && !page.has(next) && !counted.has(next)) { page.add(next); visit(next, false); }
        }
      }
    };
    for (const loader of files.filter(file => file.startsWith(prefix))) visit(loader, false);
    for (const file of counted) roots.set(file, [...(roots.get(file) ?? []), root]);
  }
  return [...roots].map(([file, from]) => ({ file, roots: from, gzip: gzipSync(readFileSync(join(dir, file)), { level: 9 }).length }));
}

/** The hero's chunks alone (its loader's reach, shared chunks included). */
export function heroChunks(distDir = dist) {
  return threeDChunks(distDir).filter(chunk => chunk.roots.includes('hero'));
}

/** Every 3D chunk, each once, and their total: the number the budget applies to. */
export function heroBundleGzip(distDir = dist) {
  const chunks = threeDChunks(distDir);
  return { chunks, total: chunks.reduce((sum, chunk) => sum + chunk.gzip, 0) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { chunks, total } = heroBundleGzip(process.argv[2] ?? dist);
  if (chunks.length === 0) {
    console.error('bundle-size: no 3D chunk found in _astro (did the build run?)');
    process.exit(1);
  }
  for (const chunk of chunks) console.log(`${chunk.file}  ${(chunk.gzip / 1024).toFixed(1)} KB gzip  (${chunk.roots.join(' + ')})`);
  console.log(`3D total: ${(total / 1024).toFixed(1)} KB gzip (budget ${BUDGET_BYTES / 1024} KB)`);
  if (total > BUDGET_BYTES) {
    console.error('bundle-size: the 3D total is over budget');
    process.exit(1);
  }
}
