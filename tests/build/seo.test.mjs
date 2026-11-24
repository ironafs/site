import { site } from '../../src/content/site.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { dist, read } from './lib.mjs';

const html = () => read('index.html');
const meta = (attr, name) => new RegExp(`<meta\\b(?=[^>]*\\b${attr}="${name}")[^>]*>`).exec(html())?.[0];
const content = tag => /\bcontent="([^"]*)"/.exec(tag ?? '')?.[1];

test('title, description, canonical', () => {
  assert.ok(html().includes(`<title>${site.title}</title>`));
  assert.equal(content(meta('name', 'description')), site.tagline);
  assert.match(html(), /<link\b[^>]*rel="canonical"[^>]*href="https:\/\/www\.ironafs\.org\/"|<link\b[^>]*href="https:\/\/www\.ironafs\.org\/"[^>]*rel="canonical"/);
});

test('the legal pages declare their own directory URL as canonical and og:url, as the sitemap lists it', () => {
  const sitemap = read('sitemap-0.xml');
  for (const path of ['trademarks', 'privacy']) {
    const page = read(`${path}/index.html`);
    const url = `https://www.ironafs.org/${path}/`;
    assert.deepEqual([...page.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/g)].map(([tag]) => /href="([^"]*)"/.exec(tag)[1]), [url], path);
    assert.equal(content(/<meta\b(?=[^>]*\bproperty="og:url")[^>]*>/.exec(page)?.[0]), url, path);
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), path);
  }
});

test('Open Graph and Twitter cards', () => {
  assert.equal(content(meta('property', 'og:image')), site.ogImage);
  assert.equal(content(meta('property', 'og:description')), site.tagline);
  assert.equal(content(meta('name', 'twitter:description')), site.tagline);
  assert.equal(content(meta('property', 'og:title')), site.title);
  assert.equal(content(meta('name', 'twitter:title')), site.title);
  assert.equal(content(meta('property', 'og:image:width')), '1200');
  assert.equal(content(meta('property', 'og:image:height')), '630');
  assert.equal(content(meta('name', 'twitter:card')), 'summary_large_image');
  assert.equal(content(meta('name', 'theme-color')), '#0d0e10');
});

test('JSON-LD SoftwareSourceCode', () => {
  const match = /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html());
  assert.ok(match, 'ld+json block');
  const data = JSON.parse(match[1]);
  assert.equal(data['@type'], 'SoftwareSourceCode');
  assert.equal(data.license, site.ironafsLicence);
  assert.equal(data.programmingLanguage, 'Rust');
  assert.equal(data.name, site.name);
  assert.equal(data.codeRepository, 'https://github.com/ironafs/ironafs');
});

test('favicon and manifest links, and the files exist', () => {
  for (const needle of [
    /<link\b[^>]*rel="icon"[^>]*href="\/favicon\.ico"[^>]*sizes="48x48"|<link\b[^>]*href="\/favicon\.ico"[^>]*sizes="48x48"[^>]*rel="icon"/,
    /<link\b[^>]*href="\/favicon\.svg"[^>]*type="image\/svg\+xml"|<link\b[^>]*type="image\/svg\+xml"[^>]*href="\/favicon\.svg"/,
    /<link\b[^>]*rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"|<link\b[^>]*href="\/apple-touch-icon\.png"[^>]*rel="apple-touch-icon"/,
    /<link\b[^>]*rel="manifest"[^>]*href="\/site\.webmanifest"|<link\b[^>]*href="\/site\.webmanifest"[^>]*rel="manifest"/,
  ]) assert.match(html(), needle);
  for (const file of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'og-image.png', 'site.webmanifest', 'robots.txt']) {
    assert.ok(existsSync(join(dist, file)), file);
  }
});

test('404 is noindex-free but excluded from the sitemap; robots points at it', () => {
  const sitemap = read('sitemap-0.xml');
  assert.doesNotMatch(sitemap, /404/);
  assert.match(sitemap, /https:\/\/www\.ironafs\.org\//);
  assert.match(read('sitemap-index.xml'), /sitemap-0\.xml/);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/www\.ironafs\.org\/sitemap-index\.xml/);
});

test('the 404 page links home', () => {
  assert.match(read('404.html'), /<a\b[^>]*href="\/"/);
});
