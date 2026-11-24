import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { read, visibleText } from './lib.mjs';

const canonical = new URL('../content/trademarks-canonical.md', import.meta.url);
const absoluteHrefs = new Map([
  ['LICENSING.md', 'https://github.com/ironafs/ironafs/blob/main/LICENSING.md'],
  ['README.md#licence', 'https://github.com/ironafs/ironafs#licence'],
]);

function policyMarkup(markdown) {
  const inline = text => text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${absoluteHrefs.get(href) ?? href}">${label}</a>`);

  const body = markdown.replace(/^<!-- SPDX-FileCopyrightText: [^\n]+ -->\n<!-- SPDX-License-Identifier: GPL-3\.0-or-later -->\n\n/, '');
  assert.notEqual(body, markdown, 'the canonical file keeps its upstream SPDX header');
  return body.trim().split(/\n\n+/).map(block => {
    if (block.startsWith('# ')) return `<h1>${block.slice(2)}</h1>`;
    if (block.startsWith('## ')) return `<h2>${block.slice(3)}</h2>`;
    if (block.startsWith('- ')) {
      const items = block.slice(2).split(/\n- /).map(item => `<li>${inline(item)}</li>`);
      return `<ul>${items.join('')}</ul>`;
    }
    return `<p>${inline(block)}</p>`;
  }).join('');
}

function normalizeMarkup(html) {
  // Keep the tags and hrefs in the comparison while decoding text and folding whitespace.
  return visibleText(html
    .replace(/<h2\s+[^>]*>/g, '<h2>')
    .replace(/\s*(<\/?(?:h[12]|p|ul|li)>)\s*/g, '$1')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
}

test('the trademark page matches the canonical policy text, structure and links', () => {
  const page = read('trademarks/index.html');
  // Exclude the short-version card explicitly; compare the complete canonical body.
  const body = /<article class="document-body" data-canonical-policy>([\s\S]*?)<\/article>/.exec(page);
  assert.ok(body, 'trademark policy body');
  // the attribution line sits above the policy, outside it, once (the comparison below is the policy body alone)
  const source = "This is the IronAFS trademark policy, copied from the ironafs/ironafs repository; 'this repository' below means that one.";
  const before = page.slice(0, body.index);
  assert.equal(visibleText(page).split(source).length - 1, 1, 'the attribution line, once');
  assert.ok(visibleText(before).endsWith(source), 'the attribution line, just above the policy');
  assert.ok(!visibleText(body[1]).includes(source), 'the attribution line is not inside the policy');
  assert.equal(normalizeMarkup(body[1].replace(/<aside class="document-summary"[\s\S]*?<\/aside>/, '').replace(/<details class="document-toc-mobile"[\s\S]*?<\/details>/, '')), normalizeMarkup(policyMarkup(readFileSync(canonical, 'utf8'))));
});
