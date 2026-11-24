import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

/** Read a file from dist/ as UTF-8. */
export function read(file) {
  return readFileSync(join(dist, file), 'utf8');
}

function walk(dir, found = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

/** Every file under dist/, relative to it, with forward slashes. */
export function allFiles() {
  return walk(dist).map(path => path.slice(dist.length).split('\\').join('/'));
}

/** Every .html file under dist/, relative to it. */
export function htmlFiles() {
  return allFiles().filter(file => file.endsWith('.html'));
}

/** Strings that must never appear in visible text. */
export const FORBIDDEN = ['nothing ships', 'Nothing ships', 'afs.sys', 'AFSRedir', 'AFS without the kernel panic', 'Cloud Files'];

export const windowsRoute = "IronAFS uses \\\\afs only where tests show a sign-in under that name can't leave the machine; elsewhere it uses \\\\127.0.0.1 through a mapped drive or shortcut.";
export const windowsAlternative = "Where local SMB doesn't qualify, it doesn't ship; a Cloud Files route is the gated alternative.";

/** A sentence of the copy that may name a forbidden string, and the start tag of the element it must be in. */
export const windowsDesignAlternative = [/<div\b[^>]*\bid="panel-windows"/, windowsAlternative];
/** The #platforms card that names Microsoft's Cloud Files API: its title, in the Windows lane. */
export const timelineCloudFiles = [/<div\b[^>]*\bdata-lane="windows"/, 'Cloud Files API'];

/**
 * The page's visible text with each listed sentence taken out of its element (`[start tag, sentence]`), once, for
 * a site-wide wording check. The text is normalised once, as a whole: the element's bounds are marked in the markup
 * and the sentence is replaced by a line break, so a forbidden string can neither hide across the element's
 * bounds nor be made by joining the sentence's neighbours.
 */
export function withoutApproved(html, exemptions) {
  const found = exemptions
    .map(([start, sentence], i) => ({ i, sentence, at: start.exec(html)?.index }))
    .filter(e => e.at !== undefined)
    .sort((a, b) => b.at - a.at);
  const open = i => String.fromCharCode(0xe000 + 2 * i), close = i => String.fromCharCode(0xe001 + 2 * i);
  let marked = html;
  for (const { i, at } of found) {
    const markup = elementAt(marked, at);
    marked = marked.slice(0, at) + open(i) + markup + close(i) + marked.slice(at + markup.length);
  }
  let text = visibleText(marked);
  for (const { i, sentence } of found) {
    const a = text.indexOf(open(i)), b = text.indexOf(close(i), a);
    text = text.slice(0, a) + text.slice(a, b).replace(sentence, '\n') + text.slice(b);
  }
  return text.replace(/[\ue000-\uf8ff]/g, '');
}

/** Exclude one exact sentence from the Windows panel for a site-wide wording check. */
export function withoutWindowsDesignCopy(html, sentence) {
  return withoutApproved(html, [[windowsDesignAlternative[0], sentence]]);
}

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** The outer HTML of the element whose start tag begins at `index` in `html`, nested same-name elements included. */
export function elementAt(html, index) {
  const name = /^<([a-z][a-z0-9-]*)/i.exec(html.slice(index))[1].toLowerCase();
  const startEnd = html.indexOf('>', index) + 1;
  if (voidTags.has(name) || html[startEnd - 2] === '/') return html.slice(index, startEnd);
  const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  tags.lastIndex = startEnd;
  let depth = 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(index, m.index + m[0].length);
  }
  throw new Error(`<${name}> at ${index} is never closed`);
}

export function visibleText(html) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', trade: '™' };
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, code) => {
      if (code.startsWith('#')) return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
      return entities[code] ?? entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every URL a page loads: HTML src and srcset, <link href> (not rel=canonical),
 * and url() in the given CSS texts.
 */
export function loadedResources(html, css = []) {
  const found = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const [, value] of body.matchAll(/\ssrc\s*=\s*"([^"]*)"/gi)) found.push(value);
  for (const [, value] of body.matchAll(/\ssrc\s*=\s*'([^']*)'/gi)) found.push(value);
  for (const [, value] of body.matchAll(/\ssrc\s*=\s*([^\s"'=<>`]+)/gi)) found.push(value);
  for (const [, value] of body.matchAll(/\ssrcset\s*=\s*([^\s"'=<>`]+)/gi)) {
    for (const candidate of value.split(',')) if (candidate) found.push(candidate.split(/\s+/)[0]);
  }
  for (const [, value] of body.matchAll(/\ssrcset\s*=\s*["']([^"']*)["']/gi)) {
    for (const candidate of value.split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) found.push(url);
    }
  }
  for (const [tag] of body.matchAll(/<link\b[^>]*>/gi)) {
    if (/\brel\s*=\s*["']?[^"'>]*\bcanonical\b/i.test(tag)) continue;
    const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(tag);
    if (href) found.push(href[1] ?? href[2] ?? href[3]);
  }
  for (const text of css) {
    for (const [, , value] of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) found.push(value);
    for (const [, , value] of text.matchAll(/@import\s+(["'])(.*?)\1/gi)) found.push(value);
  }
  return found;
}

/** Inline script (except an application/ld+json data block), <style> elements, style= and on*= handlers. */
export function inlineViolations(html) {
  const found = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const [tag] of body.matchAll(/<script\b[^>]*>/gi)) {
    if (/\ssrc\s*=/i.test(tag)) continue;
    if (/\stype\s*=\s*["']?application\/ld\+json["']?(?=[\s>\/])/i.test(tag)) continue;
    found.push(tag);
  }
  for (const [tag] of body.matchAll(/<style\b[^>]*>/gi)) found.push(tag);
  for (const [tag] of body.matchAll(/<[a-z][^>]*>/gi)) {
    for (const [, name] of tag.matchAll(/\s(style|on[a-z]+)\s*=/gi)) found.push(`${name} in ${tag.slice(0, 80)}`);
  }
  return found;
}
