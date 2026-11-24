import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Public files outside the built pages: the favicon is the original mark from brand/, and the social card says what IronAFS plans, in the site's words.
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// The favicon is the scheme-aware mark generated into brand/svg and brand/icons.
// The site serves that file unchanged, so a pass cannot swap the tab icon on its own.
test('the served favicon is the original scheme-aware mark from brand/', () => {
  const served = read('public/favicon.svg');
  assert.equal(served, read('brand/svg/favicon.svg'));
  assert.equal(served, read('brand/icons/favicon.svg'));
  assert.match(served, /prefers-color-scheme: dark/);
});

test('the social card is the site\'s headline and tagline, Windows conditional, with local fonts', () => {
  const source = read('brand/src/render_pngs.cjs');
  assert.match(source, /site\.headline/);
  assert.match(source, /site\.tagline/);
  assert.doesNotMatch(source, /Written in Rust|without the kernel panic/);
  const platforms = /const PLATFORMS = '([^']*)'/.exec(source)?.[1] ?? '';
  assert.match(platforms, /if testing passes, SMB on Windows/);
  assert.doesNotMatch(source, /fonts\.googleapis\.com/);
});
