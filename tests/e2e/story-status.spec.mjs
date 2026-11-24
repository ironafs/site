import { ui } from '../../src/content/ui.ts';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { currentMilestone, milestoneCode, nextMilestone, parseMilestones, trackOrder } from '../../src/data/milestones.ts';
import { milestoneCopy, story } from '../../src/content/story.ts';

// Speed and status: #speed is plain text in normal flow; #status shows the now and next cards
// driven by the build-time milestones, the follow card, the milestone track (GitHub titles, code order, the current
// one aria-current="step") and the forge picture below the text, never behind it. The fixture builds (the committed
// snapshot, "M1 closed, M2a open") are in tests/build/milestones.test.mjs; here the served build may hold live data,
// so the expectations are computed from what its track says, with the same helpers the build uses.

const repo = 'https://github.com/ironafs/ironafs';
const adr0004 = `${repo}/blob/main/docs/adr/0004-architecture.md`;
const snapshot = JSON.parse(readFileSync(new URL('../../src/data/milestones.snapshot.json', import.meta.url), 'utf8'));

/** The track as the page shows it: title, open/closed, link. */
const track = page => page.evaluate(() => [...document.querySelectorAll('#status .ms > li')].map(li => ({
  title: li.querySelector('a').textContent,
  open: li.dataset.state === 'open',
  url: li.querySelector('a').href,
  current: li.querySelector('a').getAttribute('aria-current'),
  text: li.textContent,
})));

const card = (page, which) => page.evaluate(which => {
  const el = document.querySelector(`#status [data-card="${which}"]`);
  return el && { title: el.querySelector('.nn-title').textContent.trim(), body: el.querySelector('.nn-body').textContent.trim() };
}, which);

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('the track lists every milestone by its GitHub title in code order, the current one aria-current="step"', async ({ page }) => {
  const shown = await track(page);
  expect(shown.length).toBeGreaterThan(0);
  const items = shown.map((m, i) => ({ number: i + 1, title: m.title, open: m.open, openItems: 0, closedItems: 0, url: m.url }));
  expect(trackOrder(items).map(m => m.title), 'code order').toEqual(shown.map(m => m.title));
  if (await page.locator('#status .status-asof', { hasText: '(snapshot)' }).count()) {
    expect(shown.map(m => m.title), 'a snapshot build shows the snapshot').toEqual(trackOrder(parseMilestones(snapshot.milestones)).map(m => m.title));
  }
  const current = currentMilestone(items);
  expect(shown.filter(m => m.current === 'step').map(m => m.title)).toEqual([current.title]);
  await expect(page.locator('#status [aria-current]')).toHaveCount(1);
  // closed milestones read as done in text too ("12 done" counts items, not the milestone)
  for (const m of shown) expect(m.text.includes(ui.closedSpoken.trim()), m.title).toBe(!m.open);
});

test('the now and next cards follow the current milestone: GitHub title, milestoneCopy body', async ({ page }) => {
  const shown = await track(page);
  const items = shown.map((m, i) => ({ number: i + 1, title: m.title, open: m.open, openItems: 0, closedItems: 0, url: m.url }));
  const current = currentMilestone(items);
  const next = nextMilestone(items, current);
  expect(await card(page, 'now')).toEqual({ title: current.title, body: milestoneCopy[milestoneCode(current.title)].body });
  if (next) expect(await card(page, 'next')).toEqual({ title: next.title, body: milestoneCopy[milestoneCode(next.title)].body });
  else expect(await card(page, 'next')).toBeNull();
});

test('the links: ADR 0004, the repository and the issues page', async ({ page }) => {
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('#status a')].map(a => a.href));
  for (const href of [adr0004, repo, `${repo}/issues`]) expect(hrefs, href).toContain(href);
  await expect(page.locator('#status [data-card="follow"] a')).toHaveText(story.statusSection.follow.links.map(link => link.label));
  // the calls to action are consolidated in #follow: #status has no button row of its own
  await expect(page.locator('#status .cta')).toHaveCount(0);
});

test('the forge picture sits below the text of #status, never behind it', async ({ page }) => {
  const m = await page.evaluate(() => {
    const s = document.getElementById('status');
    const forge = s.querySelector('.forge');
    const f = forge.getBoundingClientRect();
    const boxes = [];
    const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || !node.parentElement.checkVisibility()) continue;
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) boxes.push({ text: node.textContent.trim().slice(0, 30), top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
    const hits = boxes.filter(b => b.left < f.right && b.right > f.left && b.top < f.bottom && b.bottom > f.top);
    return { forge: { width: f.width, height: f.height }, boxes: boxes.length, hits, img: !!forge.querySelector('picture img') };
  });
  expect(m.img).toBe(true);
  expect(m.forge.height).toBeGreaterThan(150);
  expect(m.boxes).toBeGreaterThan(20);
  expect(m.hits).toEqual([]);
});

test('#speed has four paragraphs and says there is no working client to benchmark', async ({ page }) => {
  await expect(page.locator('#speed h2')).toHaveText('How fast will it be?');
  const paragraphs = page.locator('#speed .speed-body > p');
  await expect(paragraphs).toHaveCount(4);
  await expect(paragraphs).toHaveText([
    'FUSE can add overhead. In a 2017 study, a FUSE file system on top of ext4 ran from no noticeable slowdown to 83% slower in the worst case, depending on the workload.',
    ...story.speed.body,
  ]);
  await expect(paragraphs.first().getByRole('link', { name: '2017 study' })).toHaveAttribute('href', story.speed.study.source.href);
  await expect(paragraphs.last()).toContainText("There's no working client to benchmark yet.");
});

// the story stays dark in both themes; /built, /follow and the footer follow the visitor's theme.
for (const scheme of ['light', 'dark']) {
  test(`${scheme} theme: #status stays dark; #built, #follow and the footer follow the theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const lum = await page.evaluate(() => {
      const bg = el => {
        for (let a = el; a; a = a.parentElement) {
          const c = getComputedStyle(a).backgroundColor;
          const canvas = document.createElement('canvas').getContext('2d');
          canvas.fillStyle = c; canvas.fillRect(0, 0, 1, 1);
          const [r, g, b, alpha] = canvas.getImageData(0, 0, 1, 1).data;
          if (alpha > 0) return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        }
        return 1;
      };
      return { status: bg(document.getElementById('status')), speed: bg(document.getElementById('speed')), built: bg(document.getElementById('built')), follow: bg(document.getElementById('follow')), footer: bg(document.querySelector('.site-footer')) };
    });
    expect(lum.status).toBeLessThan(0.2);
    expect(lum.speed).toBeLessThan(0.2);
    for (const id of ['built', 'follow', 'footer']) {
      if (scheme === 'light') expect(lum[id], id).toBeGreaterThan(0.8);
      else expect(lum[id], id).toBeLessThan(0.2);
    }
  });
}
