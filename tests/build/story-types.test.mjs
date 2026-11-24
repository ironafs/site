import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The story's declared shapes agree with what uses them: the copy's literal type-checks against Story (it is
// written `satisfies Story`, which the Astro build does not check), and Section's height prop accepts exactly the
// heights story/motion.css implements, which are the heights the sections pass.
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the story copy type-checks against the Story shape', () => {
  const run = spawnSync('npx', ['tsc', '--noEmit', '-p', '.'], { cwd: root, encoding: 'utf8' });
  const errors = `${run.stdout}\n${run.stderr}`.split('\n').filter(line => /^src\/(content\/story\.ts|lib\/types\.ts)\(/.test(line));
  assert.deepEqual(errors, []);
});

test('Section\'s height prop, the pin heights in motion.css and the heights the sections pass are one set', () => {
  const union = /height\?:\s*([\d\s|]+);/.exec(read('src/components/story/Section.astro'));
  assert.ok(union, 'Section declares its height prop as a union of numbers');
  const declared = union[1].split('|').map(n => Number(n.trim())).sort((a, b) => a - b);
  const styled = [...read('src/styles/story/motion.css').matchAll(/\.story\.h-(\d+)\b/g)].map(m => Number(m[1]));
  const dir = 'src/components/story/';
  const passed = readdirSync(new URL(`../../${dir}`, import.meta.url)).filter(f => f.endsWith('.astro'))
    .flatMap(f => [...read(dir + f).matchAll(/<Section\b[^>]*\bheight=\{(\d+)\}/g)].map(m => Number(m[1])));
  assert.deepEqual(declared, [...new Set(styled)].sort((a, b) => a - b), 'every declared height has its pin rule, and no more');
  assert.ok(passed.length > 0);
  for (const h of passed) assert.ok(declared.includes(h), `a section passes height ${h}, which Section does not declare`);
});
