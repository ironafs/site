import { built, footer, follow, menu, site } from '../../src/content/site.ts';
import { links } from '../../src/data/links.ts';
import { ui } from '../../src/content/ui.ts';
import { consent, privacy } from '../../src/content/privacy.ts';
import { trademarks } from '../../src/content/trademarks.ts';
import { afsContext } from '../../src/content/why.ts';
import { consoleLines, headline } from '../content/expected.mjs';
import { pill as pillCopy, story } from '../../src/content/story.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORBIDDEN, htmlFiles, read, timelineCloudFiles, visibleText, windowsAlternative, windowsDesignAlternative, windowsRoute, withoutApproved, withoutWindowsDesignCopy } from './lib.mjs';
import { currentMilestone, parseMilestones, statusPill } from '../../src/data/milestones.ts';

const snapshot = JSON.parse(readFileSync(new URL('../../src/data/milestones.snapshot.json', import.meta.url), 'utf8'));

const html = () => read('index.html');
const text = () => visibleText(html());
const sectionMarkup = (id) => {
  const match = new RegExp(`<section\\b[^>]*\\bid="${id}"[\\s\\S]*?</section>`).exec(html());
  assert.ok(match, `section #${id} exists`);
  return match[0];
};
const section = (id) => visibleText(sectionMarkup(id));

test('exactly one h1 with the headline', () => {
  const h1s = [...html().matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1s.length, 1);
  assert.equal(visibleText(h1s[0][1]), headline);
});

test('the subline is exact', () => {
  const sub = /<p\b[^>]*class="subline"[^>]*>([\s\S]*?)<\/p>/.exec(html());
  assert.ok(sub, 'the hero has a subline');
  assert.equal(visibleText(sub[1]), 'No kernel module, no kext, no driver. IronAFS is built on the file-system support your OS already has, with no kernel code of its own to sign, approve or rebuild.');
});

const validPill = value => value === pillCopy.none || value === pillCopy.m1
  || value === 'IronAFS™ · in progress: core and read-only Linux client'
  || value.startsWith(pillCopy.closedPrefix) || value.startsWith(pillCopy.nowPrefix);
const pills = () => [...html().matchAll(/<a\b[^>]*class="pill"[^>]*>([\s\S]*?)<\/a>/g)].map(p => visibleText(p[1].replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '')));

test('the status pill: exact for the committed snapshot, in the hero and the menu', () => {
  // The snapshot's own current milestone decides the text (the M1 wording is pinned in status.test.mjs).
  const snapshotPill = statusPill(currentMilestone(parseMilestones(snapshot.milestones)));
  assert.ok(validPill(snapshotPill));
  const found = pills();
  assert.equal(found.length, 2, 'one pill in the hero, one in the menu');
  assert.equal(found[0], found[1].replace('™', ''));
  // The build fetches live milestones; only a build that fell back to the snapshot is pinned to the snapshot's text.
  if (/as of \d{4}-\d{2}-\d{2} \(snapshot\)/.test(text())) assert.equal(found[1], snapshotPill);
  else assert.ok(validPill(found[1]));
  assert.match(html(), /<a\b[^>]*class="pill"[^>]*href="https:\/\/github\.com\/ironafs\/ironafs\/milestones"|<a\b[^>]*href="https:\/\/github\.com\/ironafs\/ironafs\/milestones"[^>]*class="pill"/);
});

test('the hero has the licence chip', () => {
  const hero = /<section\b[^>]*\bid="hero"[\s\S]*?<\/section>/.exec(html())[0];
  const chip = /<a\b[^>]*class="licence-chip"[^>]*>([\s\S]*?)<\/a>/.exec(hero);
  assert.ok(chip, 'a licence chip in the hero');
  assert.ok(visibleText(chip[1]).includes(site.ironafsLicence));
});

test('the console: its title and its four lines, exact, spacing included', () => {
  const hero = /<section\b[^>]*\bid="hero"[\s\S]*?<\/section>/.exec(html())[0];
  assert.equal(visibleText(/<span class="term-title">([\s\S]*?)<\/span>/.exec(hero)[1]), "when the kernel can't recover");
  assert.match(hero, /<button\b[^>]*id="replay"[^>]*aria-label="Replay console"/);
  assert.match(hero, /<button\b[^>]*id="hero-pause"[^>]*aria-label="Pause background motion"/);
  const sr = /<div id="console-sr"[^>]*>([\s\S]*?)<\/div><div id="console-typed"/.exec(hero) ?? /<div id="console-sr"[^>]*>((?:<div>[\s\S]*?<\/div>)+)<\/div>/.exec(hero);
  const lines = [...sr[1].matchAll(/<div>([\s\S]*?)<\/div>/g)].map(l => l[1].replace(/&#39;/g, "'"));
  assert.deepEqual(lines, consoleLines);
});

test('the forbidden strings are absent from every page', () => {
  for (const file of htmlFiles()) {
    const visible = withoutApproved(read(file), [windowsDesignAlternative, timelineCloudFiles]);
    for (const bad of FORBIDDEN) {
      assert.ok(!visible.includes(bad), `${file}: "${bad}"`);
    }
  }
});

test('the sections appear in page order, by id', () => {
  const main = /<main\b[\s\S]*<\/main>/.exec(html())[0];
  const ids = [...main.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ['hero', 'why', 'numbers', 'cost', 'platforms', 'what', 'design', 'rust', 'rust-cards', 'speed', 'status', 'built', 'follow']);
});

test('the section ids and landmarks exist', () => {
  for (const id of ['main', 'hero', 'console', 'why', 'numbers', 'cost', 'platforms', 'what', 'design', 'rust', 'rust-cards', 'speed', 'status', 'built', 'follow', 'site-header', 'menu-button', 'menu']) {
    assert.match(html(), new RegExp(`\\bid="${id}"`), `#${id}`);
  }
  assert.match(html(), /<header\b[^>]*id="site-header"/);
  assert.match(html(), /<nav\b/);
  assert.match(html(), /<footer\b/);
  assert.match(html(), /<a\b[^>]*class="skip-link"[^>]*href="#main"|<a\b[^>]*href="#main"[^>]*class="skip-link"/);
  assert.ok(html().includes(`aria-label="${ui.github}"`));
});

test('the footer carries the groups, the credit and the trademark notice', () => {
  const footerHtml = /<footer\b[\s\S]*?<\/footer>/.exec(html())[0];
  const rendered = visibleText(footerHtml);
  assert.ok(rendered.includes(footer.built));
  assert.ok(!rendered.includes('AuriStor'), 'the footer does not mention AuriStor');
  const anchors = [...footerHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(a => ({
    attrs: a[1],
    href: /\bhref="([^"]*)"/.exec(a[1])?.[1],
    text: visibleText(a[2].replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '')).trim(),
  }));
  // The groups are navs named by their visible labels; no heading is added.
  const groups = Object.fromEntries([...footerHtml.matchAll(/<nav\b[^>]*aria-labelledby="([^"]+)"[^>]*>([\s\S]*?)<\/nav>/g)].map(g => [g[1], g[2]]));
  assert.deepEqual(Object.keys(groups), ['footer-site', 'footer-project', 'footer-author']);
  assert.doesNotMatch(footerHtml, /<h[1-6]\b/);
  const groupLinks = id => [...groups[id].matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(a => a[1]);
  // Site: every menu path, with its slash.
  assert.deepEqual(groupLinks('footer-site'), menu.paths.map(link => link.href));
  for (const label of ['/why', '/design', '/status', '/built', '/follow']) assert.ok(visibleText(groups['footer-site']).includes(label), label);
  // Project: the menu's links; one GitHub link.
  assert.deepEqual(groupLinks('footer-project'), menu.links.map(link => link.href));
  const github = anchors.filter(a => a.text === menu.links[0].label);
  assert.equal(github.length, 1, 'one GitHub link in the footer');
  assert.equal(github[0].href, 'https://github.com/ironafs/ironafs');
  // Author: the credit is the group's label; its links are the personal site and LinkedIn.
  assert.ok(visibleText(groups['footer-author']).includes(footer.built));
  assert.deepEqual(groupLinks('footer-author'), footer.author.map(link => link.href));
  assert.deepEqual(anchors.filter(a => a.href.startsWith('https://adrianana.com') || a.href.includes('linkedin.com')).map(a => a.text), footer.author.map(link => link.label));
  // External rows open as the menu's rows do.
  for (const a of anchors.filter(a => a.href.startsWith('https://') && !a.href.endsWith('LICENSING.md'))) {
    assert.match(a.attrs, /\brel="noopener"/, a.href);
    assert.match(a.attrs, /\btarget="_blank"/, a.href);
  }
});

test('#built displays the review and owner rules', () => {
  const raw = sectionMarkup('built');
  const rendered = section('built');
  assert.ok(rendered.includes(built.intro));
  assert.ok(rendered.includes(built.human));
  for (const paragraph of [built.classes.heading, built.classes.lead, built.waits, built.provenance, built.humanBody]) {
    assert.ok(rendered.includes(paragraph), paragraph);
  }
  const tables = [...raw.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)].map(table =>
    [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(row =>
      [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map(cell => visibleText(cell[1]))));
  assert.deepEqual(tables, [[built.families.head, ...built.families.rows], [built.classes.head, ...built.classes.rows]]);
  assert.deepEqual(tables[1].slice(1).map(row => row[0]), ['E Editorial', 'I Internal', 'P Public', 'S Safety', 'R Irreversible']);
  const links = [...raw.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(([, href, html]) => ({ label: visibleText(html), href }));
  assert.deepEqual(links, built.links);
  assert.equal(links.length, 5);
});

test('honest status, and courtesy', () => {
  assert.ok(section('status').includes("The architecture is accepted and public, and the protocol codec is written. Rx and the cache are at an early stage, and the first client, read-only on Linux, is being built now. There's no working client or release yet, and no promised dates. The GitHub milestones show the current work."));
  assert.doesNotMatch(withoutApproved(html(), [windowsDesignAlternative, timelineCloudFiles]), /Cloud Files|AFSRedir/);
  assert.doesNotMatch(section('status'), /issues/i);
});

test('no present-tense claim that the shared core or the client exists', () => {
  assert.doesNotMatch(text(), /lives in one shared Rust core/);
  assert.doesNotMatch(withoutWindowsDesignCopy(html(), windowsRoute), /IronAFS uses/);
  assert.ok(section('design').includes(story.how.note));
});

test('the Windows design states the conditional UNC route and gated alternative', () => {
  const design = section('design');
  assert.ok(design.includes(windowsRoute));
  assert.ok(design.includes(windowsAlternative));
  assert.ok(!design.includes('lines of IronAFS code in the kernel'));
});

test('the crash lines carry no annotations and the console has no comment line', () => {
  const raw = html();
  assert.doesNotMatch(raw, /# oops in|# afs kext|whole machine goes down/);
  const hero = /<section\b[^>]*\bid="hero"[\s\S]*?<\/section>/.exec(raw)[0];
  assert.equal((hero.match(/class="line /g) ?? []).length, 4, 'four typed lines');
});

// : #design passed no heading and no labelledby, so it had no accessible name. (#why and #rust-cards
// have no heading of their own: they stay unnamed, a plain region of the page.)
test('#design is named by its first headline, and every section\'s aria-labelledby names an element of the page', () => {
  const page = html();
  assert.match(page, /<section\b[^>]*\bid="design"[^>]*\baria-labelledby="design-h"/);
  const named = [...page.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*\baria-labelledby="([^"]+)"/g)];
  assert.ok(named.length >= 10, `${named.length} named sections`);
  for (const [, id, by] of named) for (const ref of by.split(/\s+/)) assert.match(page, new RegExp(`\\bid="${ref}"`), `#${id}: #${ref} exists`);
});


test('the homepage has the status and legal notices', () => {
  assert.match(html(), /class="pill"[^>]*>[\s\S]*?IronAFS™/);
  const raw = /<footer\b[\s\S]*?<\/footer>/.exec(html())[0];
  const rendered = visibleText(raw);
  assert.ok(rendered.indexOf(footer.ownership) > rendered.indexOf(footer.built));
  assert.ok(rendered.indexOf(footer.notice) > rendered.indexOf(footer.ownership));
  assert.ok(rendered.includes("This website's code is GPL-3.0-or-later (see the licence). Any copyright in the site's own text and images is reserved, unless noted otherwise."));
  assert.doesNotMatch(text(), /AuriStor/);
  const legal = [
    [links.licence, `${footer.licence} ${site.ironafsLicence}`],
    [links.siteLicensing, 'see the licence'],
    [links.trademarks, trademarks.title],
    [links.notices, ui.footerNotices],
    [links.privacy, privacy.title],
  ];
  for (const [href, label] of legal) {
    const anchor = [...raw.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].find(a => a[1] === href);
    assert.ok(anchor, href);
    assert.equal(visibleText(anchor[2]), label);
  }
  assert.ok(rendered.includes(consent.settings));
  assert.equal((text().match(/™/g) ?? []).length, 2);
  assert.ok(section('hero').includes('IronAFS™'));
  assert.ok(rendered.includes('IronAFS™'));
  // The retired status element is a class in the markup, which the visible text never contains.
  assert.doesNotMatch(sectionMarkup('hero'), /hero-status/);
});

test('the privacy policy includes the regional check, choices and rights', () => {
  const page = read('privacy/index.html');
  const summary = /<aside\b[^>]*class="document-summary"[^>]*>([\s\S]*?)<\/aside>/.exec(page);
  assert.ok(summary);
  assert.ok(visibleText(summary[1]).includes("In the US, analytics is on by default, with a one-click opt-out. Everywhere else, and whenever the region can't be checked, it stays off until you allow it."));
  const hosting = /<h2 id="hosting">[^<]*<\/h2>\s*<p>([\s\S]*?)<\/p>/.exec(page);
  assert.ok(hosting);
  assert.equal(visibleText(hosting[1]), privacy.hosting.text);
  const rights = /<h2 id="rights">Your choices and rights<\/h2>\s*<p>([\s\S]*?)<\/p>\s*<p>([\s\S]*?)<\/p>/.exec(page);
  assert.ok(rights);
  assert.equal(visibleText(rights[1]), privacy.rights.choices);
  assert.equal(visibleText(rights[2]), privacy.rights.before + privacy.questions.email.label + privacy.rights.after);
  assert.match(rights[2], /href="mailto:adrian@adrianana\.com"/);
  assert.equal([...page.matchAll(/href="#rights">Your choices and rights<\/a>/g)].length, 2);
  assert.ok(visibleText(page).includes('the general type of browser and device (not the model or exact version)'));
  assert.ok(visibleText(page).includes("New activity restarts that period for the browser's identifier. Turning analytics off stops new collection; it does not delete data already sent."));
});

test('the protocol explainer has its own section, with the name explanation in Rust', () => {
  const what = section('what');
  assert.ok(what.includes("AFS (the Andrew File System) is a distributed file system that has been used by universities, research labs and companies, including large financial firms. A cell is a group of AFS servers managed together; clients reach a cell's files under /afs/<cell-name> and cache the files they fetch."));
  assert.ok(what.includes('Protocol references'));
  for (const phrase of [afsContext.eyebrow, afsContext.heading, afsContext.compatibility]) assert.ok(what.includes(phrase));
  for (const { term, description } of afsContext.definitions) assert.ok(what.includes(term + description) || what.includes(term + ' ' + description));
  assert.ok(section('rust').includes(story.rust.name));
  assert.equal(text().split(story.rust.name).length, 2);
  assert.equal(text().split(afsContext.compatibility).length, 2);
});

test('the protocol resources and follow actions resolve in their own sections', () => {
  for (const [id, links] of [['what', afsContext.resources], ['follow', follow.buttons]]) {
    const raw = new RegExp(`<section\\b[^>]*\\bid="${id}"[\\s\\S]*?</section>`).exec(html())[0];
    for (const { href, label } of links) {
      assert.ok(raw.includes(`href="${href}"`), label);
      assert.ok(visibleText(raw).includes(label), label);
    }
  }
});

test('the analytics notice presents its purpose and pending state after the prompt', () => {
  const notice = /<section\b[^>]*data-analytics-banner[\s\S]*?<\/section>/.exec(html());
  assert.ok(notice);
  const copy = visibleText(notice[0]);
  assert.ok(copy.indexOf(consent.prompt) < copy.indexOf(consent.noticePurpose));
  assert.ok(copy.indexOf(consent.noticePurpose) < copy.indexOf(consent.pending));
  assert.ok(copy.indexOf(consent.pending) < copy.indexOf(consent.allowCommand));
  assert.equal(consent.notice, 'Analytics: off.');
  assert.equal(consent.defaultOn, 'Analytics: on · US default.');
  assert.equal(consent.noticeGpc, 'Analytics: off · Global Privacy Control.');
});
