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
