import { ui } from '../../src/content/ui.ts';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { currentMilestone, milestoneCode, nextMilestone, parseMilestones, trackOrder } from '../../src/data/milestones.ts';
import { milestoneCopy, story } from '../../src/content/story.ts';

// Status shows the now and next cards
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

test.describe('performance section', () => {
  const section = page => page.locator('#speed');
  const track = page => section(page).locator('[data-read-track]');
  const card = page => section(page).getByRole('region', { name: 'Follow a Linux file read' });
  const cached = page => card(page).getByRole('heading', { name: 'This read stays local' });
  const server = page => card(page).getByRole('heading', { name: 'This read reaches the fileserver' });

  function scrollTrack(page, progress) {
    return track(page).evaluate((el, progress) => {
      const top = parseFloat(getComputedStyle(el.firstElementChild).top);
      const travel = parseFloat(getComputedStyle(el, '::after').height);
      const start = el.getBoundingClientRect().top + scrollY - top;
      scrollTo({ top: Math.round(start + travel * progress), behavior: 'instant' });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, progress);
  }

  async function open(page) {
    await page.goto('/#speed');
    await page.evaluate(() => document.fonts.ready);
  }

  test('the copy distinguishes the planned local read, server fetch, simulator target, and FUSE research', async ({ page }) => {
    await open(page);
    const speed = section(page);
    await expect(speed.getByRole('heading', { name: 'Where a file read spends time' })).toBeVisible({ timeout: 2000 });
    await expect(card(page).getByText('Bytes back to the app')).toBeVisible();
    await expect(card(page)).toContainText('The daemon rechecks the caller’s grant before returning data.');
    await expect(card(page)).toContainText('Renewing a read grant may still contact the server');
    await expect(speed.getByText(/repeat-read test targets/)).toContainText('zero remote procedure calls');
    await expect(speed.getByRole('link', { name: 'Benchmark plan' })).toHaveAttribute('href', /testing\.md#56-benchmarks$/);
    await speed.getByText('What the 2017 FUSE study found').click();
    await expect(speed.getByRole('link', { name: 'Read the FAST ’17 study' })).toBeVisible();
    for (const link of await speed.getByRole('link').all()) {
      expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the read holds across both phases and preserves a keyboard choice until the scene is left', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop hold and keyboard interaction');
    await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
    await open(page);
    const notice = page.locator('[data-analytics-banner]');
    await expect(notice).toBeVisible();
    await expect(track(page)).toHaveAttribute('data-read-hold', '', { timeout: 2200 });
    await scrollTrack(page, .18);
    await expect(cached(page)).toBeVisible();
    const bounds = await card(page).boundingBox();
    const { y } = bounds;
    const header = await page.locator('#site-header').boundingBox();
    expect(y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(y + bounds.height).toBeLessThanOrEqual((await notice.boundingBox()).y);
    const cacheRadio = card(page).getByRole('radio', { name: 'Valid cached copy' });
    await cacheRadio.focus();
    await scrollTrack(page, .82);
    await expect(server(page)).toBeVisible();
    await expect(cacheRadio).toBeFocused();
    expect(Math.abs((await card(page).boundingBox()).y - y)).toBeLessThanOrEqual(2);
    await expect(cached(page)).toHaveCount(0);
    const radio = card(page).getByRole('radio', { name: 'Fetch from server' });
    await expect(radio).toBeChecked();
    const scroll = await page.evaluate(() => scrollY);
    await radio.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(cached(page)).toBeVisible();
    await expect(cacheRadio).toBeFocused();
    await expect(card(page).getByRole('status')).toContainText('current read grant');
    expect(Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThanOrEqual(2);
    await section(page).getByRole('heading', { level: 2 }).evaluate(el => el.focus({ preventScroll: true }));
    await scrollTrack(page, .92);
    await expect(cached(page)).toBeVisible();
    await scrollTrack(page, 1.23);
    await expect.poll(async () => (await card(page).boundingBox()).y).toBeLessThan(y - 30);
    await scrollTrack(page, -4);
    await expect.poll(() => track(page).evaluate(el => el.getBoundingClientRect().top >= innerHeight)).toBe(true);
    await scrollTrack(page, .82);
    await expect(server(page)).toBeVisible();
    await expect(card(page).getByRole('status')).toBeEmpty();
  });

  test('both scenarios stay in normal flow on a short screen and with reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 610 });
    await open(page);
    await expect(cached(page)).toBeVisible({ timeout: 2200 });
    await expect(server(page)).toBeVisible();
    await expect(card(page).getByRole('radio')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(cached(page)).toBeVisible();
    await expect(server(page)).toBeVisible();
    await expect(track(page)).not.toHaveAttribute('data-read-hold', '');
  });

  test('switching to reduced motion keeps keyboard focus visible', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Only enhanced viewports have focusable scenario controls');
    await open(page);
    await expect(track(page)).toHaveAttribute('data-read-hold', '');
    await scrollTrack(page, .18);
    await card(page).getByRole('radio', { name: 'Valid cached copy' }).focus();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const heading = card(page).getByRole('heading', { name: 'Follow a Linux file read' });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect(cached(page)).toBeVisible();
    await expect(server(page)).toBeVisible();
  });

  test('the phone layout presents both scenarios without controls', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone normal-flow check');
    await open(page);
    await expect(cached(page)).toBeVisible();
    await expect(server(page)).toBeVisible();
    await expect(card(page).getByRole('radio')).toHaveCount(0);
    expect(await card(page).evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
  });

  test('a portrait tablet can tap a scenario while the diagram holds', async ({ browser, baseURL, isMobile }) => {
    test.skip(isMobile, 'Tablet coverage runs once per browser engine');
    const page = await browser.newPage({ baseURL, viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
    try {
      await open(page);
      await expect(track(page)).toHaveAttribute('data-read-hold', '', { timeout: 2200 });
      await scrollTrack(page, -.4);
      await expect(cached(page)).toBeVisible();
      const label = card(page).locator('label', { hasText: 'Fetch from server' });
      expect((await label.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await label.tap();
      await expect(server(page)).toBeVisible();
      await expect(card(page).getByRole('radio', { name: 'Fetch from server' })).toBeChecked();
      const pulse = card(page).locator('[data-return-for=server]');
      await expect(pulse).toHaveCSS('animation-name', 'speed-read-return');
    } finally {
      await page.close();
    }
  });

  test('Back restores the fileserver example when scroll determines the selection', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Only enhanced viewports have a scroll-selected example');
    // Without a fragment, WebKit restores the scroll offset instead of re-anchoring.
    await page.evaluate(() => document.fonts.ready);
    await expect(track(page)).toHaveAttribute('data-read-hold', '');
    await scrollTrack(page, .82);
    await expect(server(page)).toBeVisible();
    await page.goto('/privacy/');
    await page.goBack();
    await expect(server(page)).toBeVisible();
    await expect(card(page).getByRole('radio', { name: 'Fetch from server' })).toBeChecked();
  });

  test('both scenarios remain available with JavaScript off', async ({ browser, baseURL, isMobile }) => {
    test.skip(isMobile, 'No-script coverage runs once per browser engine');
    const page = await browser.newPage({ baseURL, javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    try {
      await page.goto('/#speed');
      await expect(cached(page)).toBeVisible();
      await expect(server(page)).toBeVisible();
      await expect(card(page).getByRole('radio')).toHaveCount(0);
    } finally {
      await page.close();
    }
  });
});
