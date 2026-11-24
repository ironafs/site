import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { allFiles, dist, htmlFiles, inlineViolations, loadedResources, read } from './lib.mjs';

const cssFiles = () => allFiles().filter(file => file.endsWith('.css'));
const isSameSite = url => url.startsWith('/') && !url.startsWith('//') || !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url);

test('the build has pages', () => {
  assert.ok(htmlFiles().length > 0, 'dist/ has no HTML; run npm run build');
});

test('no external resources declared in HTML or CSS', () => {
  const css = cssFiles().map(read);
  for (const file of htmlFiles()) {
    const bad = loadedResources(read(file), css).filter(url => !isSameSite(url) && !url.startsWith('data:'));
    assert.deepEqual(bad, [], `${file} loads from outside the site`);
  }
  for (const file of cssFiles()) {
    const bad = loadedResources('', [read(file)]).filter(url => !isSameSite(url) && !url.startsWith('data:'));
    assert.deepEqual(bad, [], `${file} loads from outside the site`);
  }
});

test('no inline script, style or handler', () => {
  for (const file of htmlFiles()) assert.deepEqual(inlineViolations(read(file)), [], file);
});

function target(file, url) {
  const path = decodeURIComponent(url.split('#')[0].split('?')[0]);
  const resolved = path.startsWith('/') ? path : posix.join('/', posix.dirname(file), path);
  const full = join(dist, resolved);
  if (!existsSync(full)) return null;
  return statSync(full).isDirectory() ? existsSync(join(full, 'index.html')) : true;
}

test('every same-site link resolves', () => {
  for (const file of htmlFiles()) {
    const html = read(file).replace(/<!--[\s\S]*?-->/g, '');
    for (const [, url] of html.matchAll(/\s(?:href|src)\s*=\s*"(\/(?!\/)[^"]*)"/gi)) {
      assert.ok(target(file, url), `${file}: ${url} does not exist in dist/`);
    }
  }
});

test('every #anchor exists', () => {
  for (const file of htmlFiles()) {
    const html = read(file).replace(/<!--[\s\S]*?-->/g, '');
    const ids = new Set([...html.matchAll(/\sid\s*=\s*"([^"]*)"/gi)].map(match => match[1]));
    for (const [, id] of html.matchAll(/\shref\s*=\s*"#([^"]+)"/gi)) {
      assert.ok(ids.has(decodeURIComponent(id)), `${file}: #${id} has no matching id`);
    }
  }
});

test('loadedResources finds @import strings, unquoted attributes and srcset', () => {
  assert.deepEqual(loadedResources('', ['@import "https://x.example/a.css";']), ['https://x.example/a.css']);
  assert.deepEqual(loadedResources('', ["@import 'https://x.example/b.css';"]), ['https://x.example/b.css']);
  assert.deepEqual(loadedResources('', ['@import url(https://x.example/c.css);']), ['https://x.example/c.css']);
  assert.ok(loadedResources('<script src=https://x.example/a.js></script>').includes('https://x.example/a.js'));
  assert.ok(loadedResources('<link rel=stylesheet href=https://x.example/a.css>').includes('https://x.example/a.css'));
  assert.ok(loadedResources('<img srcset=https://x.example/a.png>').includes('https://x.example/a.png'));
  assert.deepEqual(loadedResources('<link rel="canonical" href="https://www.ironafs.org/">'), []);
});

test('the JSON-LD exemption needs a real type attribute', () => {
  assert.equal(inlineViolations('<script data-type="application/ld+json">alert(1)</script>').length, 1);
  assert.equal(inlineViolations('<script type="application/ld+json">{}</script>').length, 0);
  assert.equal(inlineViolations("<script type='application/ld+json'>{}</script>").length, 0);
});

test('inlineViolations flags <style> elements, inline scripts and attributes, and passes external links', () => {
  assert.equal(inlineViolations('<style>a{color:red}</style>').length, 1);
  assert.equal(inlineViolations('<style is:inline>a{}</style>').length, 1);
  assert.equal(inlineViolations('<script>x()</script>').length, 1);
  assert.equal(inlineViolations('<p style="x" onclick="y">').length, 2);
  assert.deepEqual(inlineViolations('<link rel="stylesheet" href="/x.css"><script src="/a.js"></script><script type="application/ld+json">{}</script>'), []);
});
