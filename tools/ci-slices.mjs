// The e2e job's matrix in .github/workflows/ci.yml: one slice of the browser suite per entry. Read by
// tests/build/ci-matrix.test.mjs (every test runs in some slice) and tools/ci-local.mjs (runs them locally).
import { readFileSync } from 'node:fs';

export const workflowPath = new URL('../.github/workflows/ci.yml', import.meta.url);

/** The e2e matrix's entries: { name, browser, args } in file order, args split on spaces. */
export function slices(yaml = readFileSync(workflowPath, 'utf8')) {
  const include = /\n {6}matrix:\n {8}include:\n((?: {10}.*\n| {12}.*\n)+)/.exec(yaml);
  if (!include) throw new Error('ci.yml has no e2e matrix with an include list');
  return include[1].split(/\n(?= {10}- )/).map(entry => {
    const field = name => new RegExp(`(?:^|\\n) {10}(?:- | {2})${name}: (.*)`).exec(entry)?.[1].trim();
    return { name: field('name'), browser: field('browser'), args: (field('args') ?? '').split(/\s+/).filter(Boolean) };
  });
}
