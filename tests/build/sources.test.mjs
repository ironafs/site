import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORBIDDEN, elementAt, htmlFiles, read, timelineCloudFiles, visibleText, windowsDesignAlternative, withoutApproved } from './lib.mjs';

// The markers of the story's honesty rules: every statistic block carries
// data-stat="<StatId>" and a source link inside it; every illustration carries data-illustrative="<IllustrationId>"
// and a visible label. The expected sets are the two unions in src/lib/types.ts, read from that file, so an id
// added there without its markup fails here.
const storySource = readFileSync(new URL('../../src/lib/types.ts', import.meta.url), 'utf8');

/** The string literals of `export type <name> = 'a' | 'b' ...;` in types.ts. */
export function unionMembers(source, name) {
  const match = new RegExp(`export type ${name}\\s*=([^;]*);`).exec(source);
  assert.ok(match, `types.ts exports the union ${name}`);
  const members = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(members.length > 0, `${name} has members`);
  assert.equal(match[1].replace(/'[^']+'|\||\s/g, ''), '', `${name} is a plain union of string literals`);
  return members;
}

const html = () => read('index.html');

/** Every element carrying `attr`, as { value, html } (its whole outer HTML). */
function marked(attr) {
  const page = html();
  return [...page.matchAll(new RegExp(`<[a-z][a-z0-9-]*\\b[^>]*\\s${attr}="([^"]*)"`, 'gi'))]
    .map(m => ({ value: m[1], html: elementAt(page, m.index) }));
}

test('the union reader reads types.ts unions and refuses anything else', () => {
  assert.deepEqual(unionMembers("export type X = 'a' | 'b-c';", 'X'), ['a', 'b-c']);
  assert.throws(() => unionMembers("export type X = 'a' | Y;", 'X'));
  assert.throws(() => unionMembers('export type Z = string;', 'X'));
});

test('the statistic blocks are exactly the StatId union, each with an https source link inside', () => {
  const blocks = marked('data-stat');
  const expected = unionMembers(storySource, 'StatId');
  assert.deepEqual([...new Set(blocks.map(b => b.value))].sort(), [...expected].sort());
  assert.equal(blocks.length, expected.length, 'one block per statistic');
  for (const block of blocks) {
    const links = [...block.html.matchAll(/<a\b[^>]*>/gi)].map(m => m[0]).filter(tag => /\sclass="(?:[^"]*\s)?source(?:\s[^"]*)?"/.test(tag));
    assert.ok(links.length > 0, `${block.value}: an a.source inside its block`);
    for (const tag of links) assert.match(tag, /\shref="https:\/\/[^"]+"/, `${block.value}: ${tag}`);
  }
});

test('the illustrations are exactly the IllustrationId union, each visibly labelled', () => {
  const figures = marked('data-illustrative');
  const expected = unionMembers(storySource, 'IllustrationId');
  assert.deepEqual([...new Set(figures.map(f => f.value))].sort(), [...expected].sort());
  assert.equal(figures.length, expected.length, 'one marker per illustration');
  for (const figure of figures) {
    // visible: not inside a screen-reader-only or aria-hidden span
    const shown = figure.html.replace(/<(\w+)\b[^>]*(?:class="sr-only"|aria-hidden="true")[^>]*>[\s\S]*?<\/\1>/g, '');
    if (figure.value === 'debian') {
      assert.match(shown, /^<pre\b[^>]*><span\b[^>]*>Debian, DKMS and Secure Boot<\/span>/, 'Debian workflow starts with its visible label');
    } else {
      assert.match(visibleText(shown), /illustrative|Illustration/, `${figure.value}: labelled`);
    }
  }
});

test('the forbidden strings are absent', () => {
  for (const file of htmlFiles()) {
    const visible = withoutApproved(read(file), [windowsDesignAlternative, timelineCloudFiles]);
    for (const bad of FORBIDDEN) assert.ok(!visible.includes(bad), `${file}: "${bad}"`);
  }
});

test('no style= attribute anywhere', () => {
  for (const file of htmlFiles()) {
    const tags = [...read(file).replace(/<!--[\s\S]*?-->/g, '').matchAll(/<[a-z][^>]*>/gi)].map(m => m[0]).filter(tag => /\sstyle\s*=/i.test(tag));
    assert.deepEqual(tags, [], file);
  }
});

test('elementAt returns the whole element, nested same-name tags included', () => {
  const page = '<p>x</p><div a="1"><div>in</div><br><span>s</span></div><div>after</div>';
  assert.equal(elementAt(page, page.indexOf('<div a')), '<div a="1"><div>in</div><br><span>s</span></div>');
  assert.equal(elementAt('<img src="a"><p>', 0), '<img src="a">');
});
