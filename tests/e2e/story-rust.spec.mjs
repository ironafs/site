import { expect, test } from '@playwright/test';
import { withoutScene } from './util.mjs';

const section = page => page.locator('#rust');
const fixture = page => page.locator('#rust figure[aria-labelledby="xdr-title"]');
const track = (page, name) => section(page).locator(`[data-rust-track="${name}"]`);
const share = page => section(page).getByRole('article', { name: 'Memory-safety share' });
const density = page => section(page).getByRole('article', { name: 'Memory-safety density' });
const expectedPoints = ['2019, 76%', '2022, 35%', '2024, 24%', '2025, below 20%'];

async function openRust(page) {
  await withoutScene(page);
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
  // Each check sets its own scroll position after the page loads.
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-analytics-banner]')).toBeVisible();
}

async function position(hold, progress) {
  await hold.evaluate((el, progress) => {
    const top = parseFloat(getComputedStyle(el.firstElementChild).top);
    const notice = document.querySelector('[data-analytics-banner]');
    const height = Math.min(innerHeight, visualViewport?.height ?? innerHeight);
    const noticeTop = notice.hidden || getComputedStyle(notice).position !== 'fixed' ? height : notice.getBoundingClientRect().top;
    const bottom = Math.min(height, noticeTop) - 10;
    const travel = parseFloat(getComputedStyle(el, '::after').height);
    const lead = Math.min(48, Math.max(0, bottom - top - el.firstElementChild.offsetHeight - 12));
    scrollTo({ top: Math.round(scrollY + el.getBoundingClientRect().top - top - lead + progress * (lead + 0.9 * travel)), behavior: 'instant' });
  }, progress);
}

test('Rust presents the decoder fixture, the Android units and the proposed file rules without scripts', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/#rust');
    await expect(section(page).getByRole('heading', { name: 'Why Rust for a network file system?' })).toBeVisible();
    await expect(fixture(page)).toContainText('5 bytes');
    await expect(fixture(page)).toContainText('2 bytes');
    await expect(fixture(page).getByRole('img', { name: 'Two bytes present, three bytes missing' })).toBeVisible();
    await expect(fixture(page)).toContainText('Truncated');
    await expect(fixture(page).getByRole('link', { name: 'View regression test' }))
      .toHaveAttribute('href', /decode\/tests\.rs#L323-L332$/);
    await expect(fixture(page).getByRole('link', { name: 'View decoder checks' }))
      .toHaveAttribute('href', /decode\.rs#L643-L688$/);

    await expect(share(page).getByRole('listitem').locator('.sr-only')).toHaveText(expectedPoints);
    await expect(share(page).locator('.chart-point').filter({ hasText: '35%' })).toHaveCount(1);
    await expect(share(page)).toContainText('Hatching shows the 2025 upper bound.');
    await expect(density(page)).toContainText('Estimated vulnerabilities per million lines of Android code');
    await expect(density(page)).toContainText('≈ 1,000');
    await expect(density(page)).toContainText('0.2');
    await expect(density(page)).toContainText('found and fixed before release');
    await expect(density(page).locator('figcaption')).toHaveCount(0);

    const engineering = section(page).locator('#android-engineering');
    await engineering.locator('summary').click();
    await expect(engineering).toContainText('Among medium and large changes');
    await expect(engineering).toContainText('a quarter of the C++ rate');
    const cards = page.locator('#rust-cards');
    await expect(cards.getByRole('heading', { name: 'File permissions and cached data' })).toBeVisible();
    await expect(cards).toContainText('even when the file is already cached');
    await expect(cards).toContainText('tells the operating system to discard its copy');
    await expect(cards.getByRole('link', { name: 'IronAFS architecture' })).toHaveAttribute('href', /0004-architecture-1-core/);
    await expect(cards.getByRole('link', { name: 'Mountpoint on GitHub' })).toHaveAttribute('href', /awslabs\/mountpoint-s3/);
    await expect(cards.getByRole('heading', { name: 'Unsafe Rust at the OS boundary' })).toBeVisible();
    await expect(cards.getByRole('link', { name: 'Unsafe-code rules' })).toHaveAttribute('href', /0005-ironafs-os/);
    const binder = cards.locator('details').filter({ hasText: 'Linux Binder example' });
    const cve = binder.getByRole('link', { name: 'CVE-2025-68260', includeHidden: true });
    await expect(cve).toBeHidden();
    await binder.locator('summary').click();
    await expect(cve).toBeVisible();
    await expect(cve).toHaveAttribute('href', /cve\.org\/CVERecord\?id=CVE-2025-68260$/);
  } finally {
    await context.close();
  }
});

test('fixture steps and Android bars read in sequence before the chart changes in place', async ({ page, browserName }, info) => {
  test.skip(info.project.name === 'chromium-nowebgl');
  await openRust(page);
  const android = track(page, 'android');
  await expect(android).toHaveAttribute('data-sticky', '');
  const intro = track(page, info.project.name.endsWith('-phone') ? 'fixture' : 'project');
  await expect(intro).toHaveAttribute('data-sticky', '');
  const fixtureTops = [];
  for (const [progress, step] of [[0.12, 0], [0.26, 1], [0.44, 2], [0.62, 3], [0.85, 4]]) {
    await position(intro, progress);
    await expect(fixture(page)).toHaveAttribute('data-xdr-step', String(step));
    if (step >= 2) fixtureTops.push((await fixture(page).boundingBox()).y);
  }
  expect(Math.max(...fixtureTops) - Math.min(...fixtureTops)).toBeLessThanOrEqual(2);
  await expect(fixture(page).getByText('Truncated', { exact: true }).locator('..')).toHaveCSS('opacity', '1');

  await position(android, 0.35 * 0.55);
  const rising = share(page).locator('[data-active][data-awaiting-label]');
  await expect(rising.locator('.chart-fill')).toBeVisible();
  await expect(rising.locator('.chart-point')).toBeHidden();

  const years = ['2019', '2022', '2024', '2025'];
  for (const [index, progress] of [0.20, 0.45, 0.70, 0.95].entries()) {
    await position(android, progress * 0.55);
    const active = share(page).locator('[data-active]');
    await expect(active.locator('.chart-point')).toBeVisible();
    await expect(active.getByText(years[index], { exact: true })).toBeVisible();
    await expect(share(page).locator('.chart-point:visible')).toHaveCount(index + 1);
  }

  await position(android, 0.63);
  const shell = android.locator('> :first-child');
  await expect(share(page).locator('.chart-point:visible')).toHaveCount(4);
  const bars = share(page).locator('.chart-bar');
  const proportions = await bars.evaluateAll(elements => elements.map(el => el.offsetHeight / el.closest('.chart-bars').offsetHeight));
  [0.76, 0.35, 0.24, 0.20].forEach((ratio, index) => expect(Math.abs(proportions[index] - ratio)).toBeLessThan(0.01));
  await expect(bars.last().locator('.chart-fill')).toHaveCSS('border-top-style', 'dashed');
  const start = await shell.boundingBox();
  const safe = await page.evaluate(() => {
    const notice = document.querySelector('[data-analytics-banner]');
    return [document.querySelector('#site-header').getBoundingClientRect().bottom,
      notice.hidden || getComputedStyle(notice).position !== 'fixed' ? innerHeight : notice.getBoundingClientRect().top];
  });
  expect(start.y).toBeGreaterThanOrEqual(safe[0]);
  expect(start.y + start.height).toBeLessThanOrEqual(safe[1]);

  await position(android, 0.78);
  await expect(track(page, 'share')).toHaveCSS('opacity', '0');
  await expect(track(page, 'density')).toHaveCSS('opacity', '1');
  expect(await shell.boundingBox()).toEqual(start);
  const field = density(page).locator('.density-field');
  const dot = density(page).locator('.density-dot');
  const fieldBox = await field.boundingBox();
  const dotBox = await dot.boundingBox();
  expect(dotBox.y).toBeCloseTo(fieldBox.y, 0);
  expect(dotBox.width).toBeCloseTo(fieldBox.width, 0);
  expect(dotBox.height).toBeCloseTo(fieldBox.height, 0);
  const part = await field.evaluate(el => getComputedStyle(el).clipPath);
  await position(android, 0.96);
  await expect.poll(() => field.evaluate(el => getComputedStyle(el).clipPath)).not.toBe(part);
  await position(android, 0.78);

  const shareLink = share(page).getByRole('link', { name: 'Google’s 2025 Android security report' });
  const densityLink = density(page).getByRole('link', { name: 'Google, 2025' });
  await page.keyboard.press('Shift');
  await shareLink.evaluate(link => link.focus({ preventScroll: true }));
  await expect(track(page, 'share')).toHaveCSS('opacity', '1');
  await expect(track(page, 'density')).toHaveCSS('opacity', '0');
  await expect(share(page).locator('.chart-point:visible')).toHaveCount(4);
  await expect(shareLink).toBeFocused();
  expect((await shareLink.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // Safari’s default keyboard setting reaches links with Option-Tab.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press(tab);
  await expect(densityLink).toBeFocused();
  await expect(track(page, 'density')).toHaveCSS('opacity', '1');
  await page.keyboard.press(`Shift+${tab}`);
  await expect(shareLink).toBeFocused();
  await expect(track(page, 'share')).toHaveCSS('opacity', '1');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(android).not.toHaveAttribute('data-sticky');
  await expect(shareLink).toBeFocused();
  await expect(shareLink).toBeInViewport({ ratio: 1 });
  await expect(track(page, 'share')).toHaveCSS('opacity', '1');
  await expect(track(page, 'density')).toHaveCSS('opacity', '1');
});

for (const viewport of [{ width: 1024, height: 660 }, { width: 320, height: 660 }]) {
  test(`short ${viewport.width}px view gives both settled panels in flow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openRust(page);
    await expect(track(page, 'android')).not.toHaveAttribute('data-sticky');
    await expect(share(page).locator('.chart-point:visible')).toHaveCount(4);
    await expect(track(page, 'density')).toHaveCSS('opacity', '1');
    const shareBox = await share(page).boundingBox();
    const densityBox = await density(page).boundingBox();
    expect(shareBox.y + shareBox.height).toBeLessThan(densityBox.y);
    expect(densityBox.x + densityBox.width).toBeLessThanOrEqual(viewport.width);
  });
}

test('pointer-focused sources leave the Android and decoder reveals tied to scroll', async ({ page }, info) => {
  await openRust(page);
  const android = track(page, 'android');
  const intro = track(page, info.project.name.endsWith('-phone') ? 'fixture' : 'project');
  await expect(android).toHaveAttribute('data-sticky', '');
  await expect(intro).toHaveAttribute('data-sticky', '');

  async function clickSource(link) {
    // Keep the same document open while retaining the focus from activating the link.
    await link.evaluate(el => el.addEventListener('click', event => {
      event.preventDefault();
      el.focus({ preventScroll: true });
    }, { once: true }));
    await link.click();
    await expect(link).toBeFocused();
    expect(await link.evaluate(el => el.matches(':focus-visible'))).toBe(false);
  }

  await position(intro, 0.85);
  await expect(fixture(page)).toHaveAttribute('data-xdr-step', '4');
  await clickSource(fixture(page).getByRole('link', { name: 'View regression test' }));
  await position(intro, 0.26);
  await expect(fixture(page)).toHaveAttribute('data-xdr-step', '1');

  await position(android, 0.63);
  await expect(track(page, 'share')).toHaveCSS('opacity', '1');
  await clickSource(share(page).getByRole('link', { name: 'Google’s 2025 Android security report' }));
  await position(android, 0.80);
  await expect(track(page, 'density')).toHaveCSS('opacity', '1');
  await clickSource(density(page).getByRole('link', { name: 'Google, 2025' }));
  await position(android, 0.63);
  await expect(track(page, 'share')).toHaveCSS('opacity', '1');
});

test('dismissing the notice preserves reading position below Rust when the charts start to fit', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 710 });
  await openRust(page);
  const android = track(page, 'android');
  const heading = page.locator('#speed h2').first();
  await expect.poll(() => heading.evaluate(async el => {
    scrollBy({ top: el.getBoundingClientRect().top - 150, behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return Math.abs(el.getBoundingClientRect().top - 150);
  })).toBeLessThanOrEqual(1);
  await expect(android).not.toHaveAttribute('data-sticky');
  const readingPosition = () => heading.evaluate(el => ({
    headingTop: el.getBoundingClientRect().top,
    rustOffset: document.getElementById('rust').getBoundingClientRect().top + scrollY,
  }));
  const before = await readingPosition();

  await page.locator('[data-analytics-dismiss]').click();
  await expect(android).toHaveAttribute('data-sticky', '');
  await expect.poll(async () => {
    const after = await readingPosition();
    const drift = after.headingTop - before.headingTop;
    // Earlier scenes can remeasure on the same event, and the browser may anchor their change.
    const upstreamShift = after.rustOffset - before.rustOffset;
    return Math.min(Math.abs(drift), Math.abs(drift - upstreamShift));
  }).toBeLessThanOrEqual(2);
});

test('Rust sources and disclosure controls follow reading order in both keyboard directions', async ({ page, browserName }) => {
  await openRust(page);
  const controls = [
    ...await fixture(page).getByRole('link').all(),
    section(page).getByText('Ownership and concurrent reads', { exact: true }),
    ...await share(page).getByRole('link').all(),
    density(page).getByRole('link', { name: 'Google, 2025' }),
    section(page).getByText('Code review and rollbacks on Android', { exact: true }),
  ];
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press('Shift');
  await controls[0].focus();
  for (const [direction, indices] of [
    [tab, [0, 1, 2, 3, 4, 5, 6, 7]],
    [`Shift+${tab}`, [7, 6, 5, 4, 3, 2, 1, 0]],
  ]) {
    for (const [offset, index] of indices.entries()) {
      if (offset > 0) await page.keyboard.press(direction);
      const control = controls[index];
      await expect(control).toBeFocused();
      await expect.poll(() => control.evaluate(el => {
        const box = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
    }
  }
});

test('the static mode presents the settled fixture and charts in reading order', async ({ page }) => {
  await page.addInitScript(() => document.addEventListener('readystatechange', () => document.documentElement.classList.add('static')));
  await openRust(page);
  await expect(section(page).locator('[data-sticky]')).toHaveCount(0);
  await expect(fixture(page).getByText('Truncated', { exact: true }).locator('..')).toHaveCSS('opacity', '1');
  await expect(share(page).locator('.chart-point:visible')).toHaveCount(4);
  const a = await share(page).boundingBox();
  const b = await density(page).boundingBox();
  expect(a.y + a.height).toBeLessThan(b.y);
});
