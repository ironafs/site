import { footer, site } from '../../src/content/site.ts';
import { links } from '../../src/data/links.ts';
import { ui } from '../../src/content/ui.ts';
import { consent, privacy } from '../../src/content/privacy.ts';
import { trademarks } from '../../src/content/trademarks.ts';
import { afsContext } from '../../src/content/why.ts';
import { consoleLines, headline } from '../content/expected.mjs';
import { pill as pillCopy, story } from '../../src/content/story.ts';
import { rust } from '../../src/content/rust.ts';
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
  assert.equal(visibleText(/<span class="term-title">([\s\S]*?)<\/span>/.exec(hero)[1]), 'Kernel crash examples');
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

const footerMarkup = (page) => /<footer\b[\s\S]*?<\/footer>/.exec(page)[0];
const anchorLinks = (markup) => [...markup.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map(([, href, body]) => [href, visibleText(body.replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, ''))]);

test('the footer links to homepage sections and site policies on every page', () => {
  const sections = ['why', 'what', 'design', 'status', 'built'];
  for (const file of htmlFiles()) {
    const raw = footerMarkup(read(file));
    const groups = Object.fromEntries([...raw.matchAll(/<nav\b[^>]*aria-labelledby="([^"]+)"[^>]*>([\s\S]*?)<\/nav>/g)]
      .map(([, id, body]) => [id, body]));
    assert.deepEqual(Object.keys(groups), ['footer-site', 'footer-policies'], file);
    const prefix = file === 'index.html' ? '' : '/';
    assert.deepEqual(anchorLinks(groups['footer-site']), sections.map(id => [`${prefix}#${id}`, id]), file);
    for (const id of sections) assert.ok(visibleText(groups['footer-site']).includes(`/${id}`), id);
    assert.deepEqual(anchorLinks(groups['footer-policies']), [
      [links.privacy, privacy.title],
      [links.trademarks, trademarks.title],
      [links.notices, ui.footerNotices],
    ]);
    assert.match(groups['footer-policies'], /<button\b[^>]*data-analytics-settings[^>]*aria-haspopup="dialog"/);
  }
});

test('#built leads with maintainer approval and the public record of the file-read change', () => {
  const raw = sectionMarkup('built');
  const overview = raw.slice(0, raw.indexOf('<details'));
  assert.match(visibleText(overview), /One maintainer approves every change/);
  assert.match(visibleText(overview), /independent of both the design and the implementation/);
  assert.deepEqual(anchorLinks(overview), [
    ['https://github.com/ironafs/site/issues/3', 'Read the contract'],
    ['https://github.com/ironafs/site/pull/4', 'See the pull request'],
    ['https://github.com/ironafs/site/commit/2f059608ebce7cbf3a4794437e2dd16420c6f00c', 'View the merged commit'],
  ]);
});

test('#built keeps the workflow, model roles and commit attribution in native disclosures', () => {
  const panels = [...sectionMarkup('built').matchAll(/<details>([\s\S]*?)<\/details>/g)].map(([, body]) => body);
  assert.deepEqual(panels.map(panel => visibleText(/<summary\b[^>]*>([\s\S]*?)<\/summary>/.exec(panel)[1])), [
    'Review requirements by change class',
    'AI models and their roles',
    'Code provenance and commit attribution',
  ]);
  const names = panels[0].matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4>/g);
  assert.deepEqual([...names].map(([, name]) => visibleText(name)), ['E Editorial', 'I Internal', 'P Public', 'S Safety', 'R Irreversible']);
  assert.ok(anchorLinks(panels[0]).some(([href]) => href === links.workflow));
  assert.ok(anchorLinks(panels[1]).some(([href]) => href === links.ai));
  assert.ok(anchorLinks(panels[1]).some(([href]) => href === links.reviews));
  assert.ok(anchorLinks(panels[2]).some(([href]) => href === links.adr0001));
  assert.ok(anchorLinks(panels[2]).some(([href]) => href === links.provenance));
  assert.match(visibleText(panels[2]), /Developer Certificate of Origin/);
  assert.match(visibleText(panels[2]), /AI-Reviewed-by/);
});

test('honest status, and courtesy', () => {
  assert.ok(section('status').includes(story.statusSection.lede));
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
  const raw = footerMarkup(html());
  const rendered = visibleText(raw);
  assert.match(rendered, /© 2026 Adrian Ana/);
  assert.ok(rendered.includes(footer.ownership));
  assert.ok(rendered.includes(footer.notice));
  assert.match(rendered, /Any copyright in the site’s own text and images is reserved, unless noted otherwise/);
  assert.doesNotMatch(text(), /AuriStor/);
  const software = /<div\b[^>]*class="footer-software"[^>]*>[\s\S]*?<\/div>/.exec(raw)[0];
  assert.deepEqual(anchorLinks(software), [
    [links.licence, 'IronAFS code'],
    [links.siteLicensing, 'Website code'],
  ]);
  assert.match(visibleText(software), /Both use GPL-3\.0-or-later\./);
  assert.deepEqual(anchorLinks(raw).filter(([href]) => href === links.author || href === links.linkedin), [[links.author, 'Adrian Ana']]);
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
  assert.ok(section('rust').includes(rust.name));
  assert.equal(text().split(rust.name).length, 2);
  assert.equal(text().split(afsContext.compatibility).length, 2);
});

test('the protocol resources are linked in their own section', () => {
  const raw = sectionMarkup('what');
  for (const { href, label } of afsContext.resources) {
    assert.ok(raw.includes(`href="${href}"`), label);
    assert.ok(visibleText(raw).includes(label), label);
  }
});

test('the follow section explains Watch and gives the repository the primary action', () => {
  const raw = sectionMarkup('follow');
  assert.match(raw, /<strong>Watch<\/strong>/);
  assert.match(raw, /<a\b[^>]*class="[^"]*follow-primary[^"]*"[^>]*href="https:\/\/github\.com\/ironafs\/ironafs"/);
  const anchors = anchorLinks(raw);
  assert.deepEqual(anchors.map(([href]) => href), [links.github, links.milestones, links.docs]);
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
