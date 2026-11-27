import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { consent, privacy } from '../../src/content/privacy.ts';
import { analyticsCookieNames, choiceKey, cookieDays, cookiePrefix, grantDays, legacyCookieNames, measurementId, noticeKey } from '../../src/data/analytics.ts';

for (const [width, height] of [[390, 844], [360, 740], [430, 900], [1440, 900], [1728, 1000]]) {
  test(`notice stays at the viewport bottom and clears the footer at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const notice = page.locator('[data-analytics-banner]');
    await expect(notice).toBeVisible();
    for (const atEnd of [false, true]) {
      if (atEnd) await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await expect.poll(() => notice.evaluate(el => ({ position: getComputedStyle(el).position, bottom: Math.round(el.getBoundingClientRect().bottom) })))
        .toEqual({ position: 'fixed', bottom: height });
    }
    const lastLink = page.locator('#site-footer a').last();
    await expect(lastLink).toBeInViewport();
    const boxes = await Promise.all([lastLink.boundingBox(), notice.boundingBox()]);
    expect(boxes[0].y + boxes[0].height).toBeLessThanOrEqual(boxes[1].y + 1);
    await expect(page.locator('html')).toHaveClass(/analytics-notice-visible/);
  });
}

const tagOrigin = 'https://www.googletagmanager.com';
const analyticsOrigins = [tagOrigin, 'https://www.google-analytics.com', 'https://region1.google-analytics.com'];
const tagUrl = `${tagOrigin}/gtag/js?id=${measurementId}`;
const banner = page => page.locator('[data-analytics-banner]');
const dialog = page => page.getByRole('dialog', { name: consent.heading });
const settings = page => page.locator('#site-footer').getByRole('button', { name: consent.settings });
const policyStatus = page => page.locator('main [data-analytics-status]');
const savedChoice = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), choiceKey);
// The notice's reveal (privacy.css) has played to its end: its steps are animations with delays, so on a busy main
// thread (the hero's scene compiling on software GL) they finish later than any fixed timeout would allow. The
// cookie's slow rusting loops for ever: only the animations that end are waited for.
const revealed = notice => notice.evaluate(el => Promise.all(el.getAnimations({ subtree: true })
  .filter(animation => animation.effect.getComputedTiming().endTime !== Infinity)
  .map(animation => animation.finished)));

async function watchRequests(page, baseURL) {
  const localOrigin = new URL(baseURL).origin;
  const external = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== localOrigin) external.push(url.href);
  });
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
  // Exercise the browser's CSP and the site's actual loader without sending test visits to Google.
  await page.route(/^https?:\/\//, route => {
    const url = route.request().url();
    if (new URL(url).origin === localOrigin) return route.fallback();
    if (url === tagUrl) return route.fulfill({ contentType: 'text/javascript', body: '/* GA test tag */' });
    return route.abort();
  });
  return external;
}

async function openNotice(page) {
  const manage = banner(page).getByRole('button', { name: consent.manage });
  await manage.click();
  await expect(dialog(page)).toBeVisible();
  return manage;
}

async function choose(page, button) {
  await dialog(page).getByRole('button', { name: button, exact: true }).click();
}

test('fresh pages make no requests outside the site and Decline persists', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const external = await watchRequests(page, baseURL);
  await page.goto('/');
  await expect(banner(page)).toBeVisible();
  expect(external).toEqual([]);
  await page.goto('/privacy/');
  await openNotice(page);
  await choose(page, consent.decline);
  expect(await savedChoice(page)).toEqual({ value: 'denied' });
  await page.goto('/trademarks');
  await expect(banner(page)).toBeHidden();
  await expect(settings(page)).toBeVisible();
  expect(external).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/(?:^|;\s*)_ga(?:=|_)/);
});

test('opening or closing preferences does not consent and focus returns', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.goto('/privacy/');
  await expect(banner(page).getByRole('button')).toHaveCount(4);
  const manage = await openNotice(page);
  const close = dialog(page).getByRole('button', { name: consent.closePreferences });
  const save = dialog(page).getByRole('button', { name: consent.save, exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(manage).toBeFocused();
  expect(await savedChoice(page)).toBeNull();
  expect(external).toEqual([]);
});

test('Close dismisses the notice for this tab without saving a choice', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.goto('/privacy/');
  await banner(page).getByRole('button', { name: consent.closeNotice }).click();
  await expect(banner(page)).toBeHidden();
  expect(await page.evaluate(key => sessionStorage.getItem(key), noticeKey)).toBe('1');
  await page.reload();
  await expect(banner(page)).toBeHidden();
  await settings(page).click();
  await expect(dialog(page).getByRole('switch')).not.toBeChecked();
  expect(await savedChoice(page)).toBeNull();
  expect(external).toEqual([]);
});

test('the switch applies on Save choices and closing discards edits', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.goto('/privacy/');
  await openNotice(page);
  const toggle = dialog(page).getByRole('switch');
  await toggle.check();
  await choose(page, consent.closePreferences);
  expect(await savedChoice(page)).toBeNull();
  expect(external).toEqual([]);
  await openNotice(page);
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await choose(page, consent.save);
  await expect.poll(() => external).toEqual([tagUrl]);
  await settings(page).click();
  await expect(toggle).toBeChecked();
  await choose(page, consent.closePreferences);
  expect((await savedChoice(page)).value).toBe('granted');
  expect(external).toEqual([tagUrl]);
});

test('the backdrop closes on a click while a drag from inside preserves edits', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.goto('/privacy/');
  const manage = await openNotice(page);
  const box = await dialog(page).boundingBox();
  const toggle = dialog(page).getByRole('switch');
  await toggle.check();
  await page.mouse.move(box.x + box.width / 2, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(dialog(page)).toBeVisible();
  await expect(toggle).toBeChecked();
  await page.mouse.click(1, 1);
  await expect(dialog(page)).toBeHidden();
  await expect(manage).toBeFocused();
  expect(await savedChoice(page)).toBeNull();
  expect(external).toEqual([]);
});

test('notice and policy describe the choices, events and cookie lifetimes', async ({ page, baseURL }) => {
  await watchRequests(page, baseURL);
  await page.goto('/privacy/');
  await expect(banner(page)).toContainText(consent.notice);
  await expect(page.locator('main')).toContainText(privacy.analytics.paragraphs[0]);
  await expect(page.locator('main time')).toHaveAttribute('datetime', privacy.reviewDate);
  await expect(page.locator('main code')).toHaveText('keys off');
  await openNotice(page);
  await expect(dialog(page)).toContainText(consent.purpose);
  await dialog(page).locator('summary').click();
  for (const name of consent.cookieTable.names) {
    await expect(dialog(page).getByRole('row', { name: `${name} ${consent.cookieTable.lifetime}` })).toBeVisible();
  }
  const policyLink = dialog(page).getByRole('link', { name: consent.policyLink });
  await expect(policyLink).toHaveAttribute('href', '/privacy/#analytics');
  await policyLink.click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('#analytics')).toBeFocused();
});

test('Allow loads the configured GA stream and queues one sanitized view with ads denied', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.goto('/privacy/?example=private-value#private-fragment');
  await openNotice(page);
  expect(external).toEqual([]);
  await choose(page, consent.allow);
  await expect.poll(() => external).toEqual([tagUrl]);
  expect(external.every(url => analyticsOrigins.includes(new URL(url).origin))).toBe(true);
  const commands = await page.evaluate(() => window.dataLayer.map(args => Array.from(args)));
  const cookieSettings = { cookie_expires: cookieDays * 86400, cookie_update: false, cookie_path: '/', cookie_prefix: cookiePrefix };
  expect(commands.slice(0, 4)).toEqual([
    ['set', cookieSettings],
    ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
    ['consent', 'update', { analytics_storage: 'granted' }],
    ['js', expect.anything()],
  ]);
  const config = commands.find(command => command[0] === 'config');
  expect(config[1]).toBe(measurementId);
  expect(config[2]).toMatchObject({
    send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
    ...cookieSettings,
    page_location: `${baseURL}/privacy/`,
  });
  expect(commands.filter(command => command[0] === 'event').map(([, name, params]) => [name, params.page_location]))
    .toEqual([['page_view', `${baseURL}/privacy/`]]);
  expect(JSON.stringify(commands)).not.toMatch(/private-value|private-fragment/);
  const choice = await savedChoice(page);
  const remaining = choice.expires - await page.evaluate(() => Date.now());
  expect(choice.value).toBe('granted');
  expect(remaining).toBeLessThanOrEqual(grantDays * 86400000);
  expect(remaining).toBeGreaterThan(grantDays * 86400000 - 60000);
  await page.reload();
  await expect.poll(() => external).toEqual([tagUrl, tagUrl]);
  await expect(banner(page)).toBeHidden();
});

for (const choice of ['granted', 'denied', 'undecided', 'gpc']) {
  test(`startup removes legacy cookies while ${choice}`, async ({ page, context, baseURL }) => {
    const external = await watchRequests(page, baseURL);
    const existing = choice === 'granted' ? [...analyticsCookieNames, 'unrelated'] : ['unrelated'];
    await context.addCookies([...legacyCookieNames, ...analyticsCookieNames, 'unrelated'].map(name => ({
      name, value: 'test', url: baseURL,
      expires: Math.floor(Date.now() / 1000) + (legacyCookieNames.includes(name) ? 390 : 29) * 86400,
    })));
    await page.addInitScript(({ choice, choiceKey }) => {
      if (choice === 'gpc') Object.defineProperty(navigator, 'globalPrivacyControl', { value: true });
      if (choice !== 'undecided') {
        const value = choice === 'denied' ? 'denied' : 'granted';
        localStorage.setItem(choiceKey, JSON.stringify({ value, expires: Date.now() + 86400000 }));
      }
    }, { choice, choiceKey });
    await page.goto('/privacy/');
    const names = async () => (await context.cookies(baseURL)).map(cookie => cookie.name).sort();
    await expect.poll(names).toEqual(existing.sort());
    if (choice === 'granted') {
      await expect.poll(() => external).toEqual([tagUrl]);
      await page.reload();
      await expect.poll(() => external).toEqual([tagUrl, tagUrl]);
      await expect.poll(names).toEqual(existing);
    } else {
      expect(external).toEqual([]);
    }
  });
}

test('withdrawing removes GA cookies and unloads the tag', async ({ page, context, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.goto('/privacy/');
  await openNotice(page);
  await choose(page, consent.allow);
  await expect.poll(() => external).toEqual([tagUrl]);
  await context.addCookies([...legacyCookieNames, ...analyticsCookieNames, 'unrelated'].map(name => ({ name, value: 'test', url: baseURL })));
  await settings(page).click();
  await Promise.all([page.waitForEvent('load'), choose(page, consent.decline)]);
  expect(external).toEqual([tagUrl]);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  expect((await context.cookies()).map(cookie => cookie.name)).toEqual(['unrelated']);
  await expect(policyStatus(page)).toHaveText(consent.status.denied);
});

test('a denial in another tab stops a previously allowed page', async ({ page, context, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.goto('/privacy/');
  await openNotice(page);
  await choose(page, consent.allow);
  await expect.poll(() => external).toEqual([tagUrl]);
  const other = await context.newPage();
  const otherExternal = await watchRequests(other, baseURL);
  await other.goto('/privacy/');
  await expect.poll(() => otherExternal).toEqual([tagUrl]);
  await settings(other).click();
  await Promise.all([page.waitForEvent('load'), other.waitForEvent('load'), choose(other, consent.decline)]);
  await expect(policyStatus(page)).toHaveText(consent.status.denied);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  expect(external).toEqual([tagUrl]);
});

test('expired permission asks again, and unrecognized choices stay off', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.addInitScript(key => localStorage.setItem(key, location.search ? '{invalid' : '{"value":"granted","expires":1}'), choiceKey);
  for (const path of ['/privacy/', '/privacy/?invalid']) {
    await page.goto(path);
    await expect(banner(page)).toBeVisible();
    expect(external).toEqual([]);
  }
});

test('Global Privacy Control overrides a grant and saves a denial when the signal disappears', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.addInitScript(key => {
    if (!location.search) return;
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true });
    localStorage.setItem(key, JSON.stringify({ value: 'granted', expires: Date.now() + 86400000 }));
  }, choiceKey);
  await page.goto('/privacy/?gpc');
  await expect(policyStatus(page)).toHaveText(consent.status.gpc);
  await expect(banner(page)).toBeHidden();
  await settings(page).click();
  await expect(dialog(page).getByRole('button', { name: consent.allow, exact: true })).toBeDisabled();
  await expect(dialog(page).getByRole('button', { name: consent.decline, exact: true })).toBeDisabled();
  await expect(dialog(page).getByRole('switch')).toBeDisabled();
  expect(await savedChoice(page)).toEqual({ value: 'denied' });
  await page.goto('/privacy/');
  await expect(policyStatus(page)).toHaveText(consent.status.denied);
  expect(external).toEqual([]);
});

test('without a configured ID the controls stay hidden and analytics stays inactive', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.route('**/privacy/', async route => {
    const html = await readFile(new URL('../../dist/privacy/index.html', import.meta.url), 'utf8');
    await route.fulfill({ contentType: 'text/html', body: html.replace(/ data-measurement-id="[^"]+"/, '') });
  });
  await page.goto('/privacy/');
  await expect(policyStatus(page)).toHaveText(consent.status.inactive);
  await expect(banner(page)).toBeHidden();
  await expect(settings(page)).toBeHidden();
  expect(external).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the policy is readable and consent controls stay out of the tab order', async ({ page, baseURL }) => {
    const external = await watchRequests(page, baseURL);
    await page.goto('/privacy/');
    await expect(page.getByRole('heading', { name: privacy.title, level: 1 })).toBeVisible();
    await expect(page.locator('#analytics')).toBeVisible();
    await expect(banner(page)).toBeHidden();
    await expect(settings(page)).toBeHidden();
    expect(external).toEqual([]);
  });
});

for (const scheme of ['light', 'dark']) {
  test(`privacy and its modal pass axe at phone and desktop sizes in ${scheme}`, async ({ page, baseURL }) => {
    await watchRequests(page, baseURL);
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/privacy/');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await openNotice(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  });
}

test('notice, footer and preference controls stay usable on short and enlarged screens', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.goto('/privacy/');
  for (const [width, height] of [[390, 844], [844, 390], [180, 640]]) {
    await page.setViewportSize({ width, height });
    await settings(page).scrollIntoViewIfNeeded();
    await settings(page).click();
    const modal = dialog(page);
    await expect(modal.getByRole('switch')).toBeVisible();
    await expect(modal.getByRole('button', { name: consent.save })).toBeVisible();
    await expect.poll(() => modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await choose(page, consent.closePreferences);
    await expect(settings(page)).toBeFocused();
  }
  expect(external).toEqual([]);
});

test('footer settings appear with site policies and open preferences', async ({ page }) => {
  await page.goto('/');
  await expect(settings(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Site policies' }).getByRole('button', { name: consent.settings })).toBeVisible();
  await settings(page).click();
  await expect(dialog(page)).toBeVisible();
});


test('regional default waits for the policy and direct opt-out persists', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  let answer;
  const waiting = new Promise(resolve => { answer = resolve; });
  await page.route('**/privacy/analytics-policy', async route => {
    await waiting;
    await route.fulfill({ json: { mode: 'opt-out' } });
  });
  await page.goto('/privacy/', { waitUntil: 'domcontentloaded' });
  await expect(banner(page)).toContainText(consent.pending);
  expect(external).toEqual([]);
  answer();
  await expect.poll(() => external).toEqual([tagUrl]);
  await expect(banner(page)).toContainText(consent.defaultOn);
  await banner(page).getByRole('button', { name: consent.decline }).click();
  await expect(banner(page)).toContainText('Analytics is off.');
  expect(await savedChoice(page)).toEqual({ value: 'denied' });
});

test('policy failure stays opt-in and direct choices are equally available', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.route('**/privacy/analytics-policy', route => route.abort());
  await page.goto('/privacy/');
  await expect(banner(page)).toContainText(consent.notice);
  await expect(banner(page).getByRole('button', { name: consent.allow })).toBeVisible();
  await banner(page).getByRole('button', { name: consent.decline }).click();
  // the acknowledgement is in the notice, hidden, from the start: it must be shown, and the choice saved
  await expect(banner(page).locator('[data-analytics-noted]')).toBeVisible();
  await expect(banner(page).locator('[data-analytics-noted]')).toHaveText('Analytics is off.');
  expect(await savedChoice(page)).toEqual({ value: 'denied' });
  expect(external).toEqual([]);
});

test('GPC prevents the regional default from loading analytics', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-out' } }));
  await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }));
  await page.goto('/privacy/');
  await expect(policyStatus(page)).toHaveText(consent.status.gpc);
  expect(external).toEqual([]);
  expect(await savedChoice(page)).toEqual({ value: 'denied' });
});

test('notice actions fit and remain equally prominent across widths and themes', async ({ page, baseURL }) => {
  await watchRequests(page, baseURL);
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const width of [390, 1440, 1728]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/privacy/');
      const allow = banner(page).getByRole('button', { name: consent.allow });
      const decline = banner(page).getByRole('button', { name: consent.decline });
      await expect(allow).toBeVisible();
      const [a, d] = await Promise.all([allow.boundingBox(), decline.boundingBox()]);
      expect(a.height).toBeGreaterThanOrEqual(44);
      expect(d.height).toBeGreaterThanOrEqual(44);
      expect(a.height).toBe(d.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

for (const width of [360, 390, 430]) {
  test(`compact notice fits and keeps its controls usable at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 800 });
    await watchRequests(page, baseURL);
    await page.goto('/');
    const notice = banner(page);
    const prompt = notice.locator('.analytics-prompt');
    await expect(prompt).toBeVisible();
    await revealed(notice);
    expect(await prompt.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const controls = notice.locator('button:visible');
    await expect(controls).toHaveCount(4);
    const boxes = await controls.evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height, left: r.left, right: r.right };
    }));
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
    expect(boxes[0].width).toBeCloseTo(boxes[1].width, 0);
    expect((await notice.boundingBox()).height).toBeLessThan(240);
  });
}

for (const width of [1440, 1728]) {
  test(`compact desktop privacy notice at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 });
    await watchRequests(page, baseURL);
    await page.goto('/');
    const notice = banner(page);
    const allow = notice.getByRole('button', { name: consent.allow });
    const decline = notice.getByRole('button', { name: consent.decline });
    await expect(notice).toBeVisible();
    await revealed(notice);
    await expect(allow).toBeVisible();
    await expect(notice.getByRole('button', { name: consent.closeNotice })).toBeVisible();
    expect((await notice.boundingBox()).height).toBeLessThanOrEqual(64);
    const [a, d] = await Promise.all([allow.boundingBox(), decline.boundingBox()]);
    expect(a.width).toBe(d.width);
    expect(a.height).toBe(d.height);
    expect(await allow.evaluate(el => getComputedStyle(el).fontWeight)).toBe(await decline.evaluate(el => getComputedStyle(el).fontWeight));
  });
}

// The notice's sentences are body text: 15 CSS px at least (the site's body-text floor), on phones and desktops.
for (const width of [390, 1440]) {
  test(`the notice's text is at least 15 px at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await watchRequests(page, baseURL);
    await page.goto('/');
    const sizes = await banner(page).locator('p').evaluateAll(els => els.filter(el => el.getClientRects().length).map(el => parseFloat(getComputedStyle(el).fontSize)));
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(15);
  });
}


test('command choices have equal appearance in normal, hover, focus and active states', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
  await page.goto('/');
  const allow = banner(page).getByRole('button', { name: consent.allow });
  const decline = banner(page).getByRole('button', { name: consent.decline });
  const style = el => el.evaluate(node => { const s = getComputedStyle(node); const cursor = getComputedStyle(node, '::after'); return [s.backgroundImage, s.color, s.borderColor, s.boxShadow, s.transform, s.textDecorationLine, s.outlineColor, s.outlineStyle, s.outlineWidth, cursor.content, cursor.visibility, cursor.animationName]; });
  expect(await style(allow)).toEqual(await style(decline));
  await allow.hover(); const hover = await style(allow);
  await decline.hover(); expect(await style(decline)).toEqual(hover);
  expect(hover[5]).toBe('none');
  expect(hover[10]).toBe('visible');
  expect(hover[11]).toBe('none');
  await page.mouse.down(); const active = await style(decline); await page.mouse.move(0, 0); await page.mouse.up();
  await allow.hover(); await page.mouse.down(); expect(await style(allow)).toEqual(active); await page.mouse.move(0, 0); await page.mouse.up();
  await page.mouse.move(0, 0);
  await allow.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  const focus = await style(allow);
  expect(focus[7]).not.toBe('none');
  await page.keyboard.press('Tab'); expect(await style(decline)).toEqual(focus);
});

test('wide desktop notice reveals in order, keeps its size and ends visible', async ({ page }) => {
  test.skip(page.viewportSize().width < 1101, 'wide desktop notice');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
  await page.goto('/');
  const notice = banner(page);
  await expect(notice).toBeVisible();
  const result = await notice.evaluate(el => {
    const nodes = ['.analytics-typed', '.analytics-output', '.analytics-state', '[data-notice-allow]', '[data-notice-decline]', '[data-analytics-settings]', '[data-analytics-dismiss]'].map(selector => el.querySelector(selector));
    const animations = nodes.map(node => node.getAnimations().find(animation => animation.effect.target === node));
    const timing = animations.map(animation => animation.effect.getTiming());
    animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
    const start = el.getBoundingClientRect().height;
    const hidden = nodes.slice(1).map(node => getComputedStyle(node).visibility);
    animations.forEach(animation => { animation.currentTime = animation.effect.getComputedTiming().endTime; });
    return { timing, start, end: el.getBoundingClientRect().height, hidden, visible: nodes.map(node => [getComputedStyle(node).visibility, getComputedStyle(node).opacity]) };
  });
  expect(result.timing.map(t => t.delay)).toEqual([0, 550, 1150, 1950, 1950, 2950, 2950]);
  expect(result.timing[3]).toEqual(result.timing[4]);
  expect(result.hidden).toEqual(Array(6).fill('hidden'));
  expect(result.visible).toEqual(Array(7).fill(['visible', '1']));
  expect(result.start).toBe(result.end);
});

test('phone and tablet notice controls are visible immediately', async ({ page }) => {
  test.skip(!test.info().project.use.hasTouch, 'compact notice');
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
  for (const [width, height] of [[180, 460], [320, 650], [390, 699], [768, 1024], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const notice = banner(page);
    await expect(notice).toBeVisible();
    const styles = await notice.evaluate(el => ['.analytics-typed', '.analytics-output', '[data-notice-allow]', '[data-notice-decline]'].map(selector => {
      const style = getComputedStyle(el.querySelector(selector));
      return [style.animationName, style.visibility, style.opacity];
    }));
    expect(styles).toEqual(Array(4).fill(['none', 'visible', '1']));
    expect(await notice.locator('[data-analytics-settings]').evaluate(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getClientRects().length;
    })).toBe(1);
    expect(await notice.evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(width + 1);
  }
});

test('reduced motion shows every notice element without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
  await page.goto('/');
  const styles = await banner(page).evaluate(el => ['.analytics-typed', '.analytics-output', '.analytics-state', '[data-notice-allow]', '[data-notice-decline]', '[data-analytics-settings]', '[data-analytics-dismiss]'].map(selector => {
    const s = getComputedStyle(el.querySelector(selector)); return [s.animationName, s.visibility, s.opacity];
  }));
  expect(styles).toEqual(Array(7).fill(['none', 'visible', '1']));
});

test('allow echoes its state then closes; reduced motion leaves the prompt static', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const external = await watchRequests(page, baseURL);
  await page.goto('/');
  await expect(banner(page)).toContainText(consent.notice);
  expect(await banner(page).locator('.analytics-prompt').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await banner(page).getByRole('button', { name: consent.allow }).click();
  await expect(banner(page).locator('[data-analytics-noted]')).toHaveText(consent.enabled);
  await expect.poll(() => external).toEqual([tagUrl]);
  await expect(banner(page)).toBeHidden();
});

test('notice controls remain visible when animations are cancelled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
  await page.goto('/');
  const notice = page.locator('[data-analytics-banner]');
  await expect(notice).toBeVisible();
  await revealed(notice);
  await expect(notice.getByRole('button')).toHaveCount(4);
  await notice.evaluate(el => el.getAnimations({ subtree: true }).forEach(animation => animation.cancel()));
  for (const name of [consent.allow, consent.decline, consent.manage, consent.closeNotice]) {
    await expect(notice.getByRole('button', { name })).toBeVisible();
  }
  await notice.getByRole('button', { name: consent.decline }).click();
  // the acknowledgement is in the notice, hidden, from the start: it must be shown, and the choice saved
  await expect(notice.locator('[data-analytics-noted]')).toBeVisible();
  await expect(notice.locator('[data-analytics-noted]')).toHaveText('Analytics is off.');
  expect(await savedChoice(page)).toEqual({ value: 'denied' });
});

const blockStorage = page => page.addInitScript(() => {
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(window, name, { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  }
});

test('Decline with storage blocked disables the US default in place instead of reloading into it', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-out' } }));
  await blockStorage(page);
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await page.goto('/privacy/');
  await expect.poll(() => external).toEqual([tagUrl]);
  await expect(banner(page)).toContainText(consent.defaultOn);
  await page.evaluate(() => { window.__sameDocument = true; });
  await banner(page).getByRole('button', { name: consent.decline }).click();
  await expect(banner(page)).toContainText('Analytics is off.');
  // The acknowledgement's reload delay is 1 s; a reload would load the tag again under the same default.
  await page.waitForTimeout(2500);
  expect(loads).toBe(1);
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  expect(external).toEqual([tagUrl]);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  expect(await page.evaluate(id => window[`ga-disable-${id}`], measurementId)).toBe(true);
  const commands = await page.evaluate(() => window.dataLayer.map(args => Array.from(args)));
  expect(commands.at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
  await expect(policyStatus(page)).toHaveText(consent.status.denied);
});

test('a policy request that hangs leaves analytics off after 3 s and a late opt-out is ignored', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  let answer;
  const late = new Promise(resolve => { answer = resolve; });
  await page.route('**/privacy/analytics-policy', async route => {
    await late;
    await route.fulfill({ json: { mode: 'opt-out' } }).catch(() => {});
  });
  await page.goto('/privacy/', { waitUntil: 'domcontentloaded' });
  const start = Date.now();
  await expect(banner(page)).toContainText(consent.pending);
  await expect(banner(page)).toContainText(consent.notice, { timeout: 4500 });
  expect(Date.now() - start).toBeGreaterThan(2000);
  await expect(policyStatus(page)).toHaveText(consent.status.undecided);
  answer();
  await page.waitForTimeout(1000);
  expect(external).toEqual([]);
  await expect(policyStatus(page)).toHaveText(consent.status.undecided);
});

test('the switch shows the saved choice and Save without a change keeps it', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.goto('/privacy/');
  await openNotice(page);
  await choose(page, consent.allow);
  await expect.poll(() => external).toEqual([tagUrl]);
  const saved = await savedChoice(page);
  await settings(page).click();
  await expect(dialog(page).getByRole('switch')).toBeChecked();
  await choose(page, consent.save);
  await expect(dialog(page)).toBeHidden();
  expect(await savedChoice(page)).toEqual(saved);
  expect(external).toEqual([tagUrl]);
});

test('under the US default the switch shows analytics on and Save without a change saves nothing', async ({ page, baseURL }) => {
  const external = await watchRequests(page, baseURL);
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-out' } }));
  await page.goto('/privacy/');
  await expect.poll(() => external).toEqual([tagUrl]);
  await settings(page).click();
  await expect(dialog(page).getByRole('switch')).toBeChecked();
  await choose(page, consent.save);
  await expect(dialog(page)).toBeHidden();
  expect(await savedChoice(page)).toBeNull();
});

const pairStyle = el => el.evaluate(node => {
  const s = getComputedStyle(node);
  const r = node.getBoundingClientRect();
  return { style: [s.backgroundImage, s.backgroundColor, s.color, s.borderColor, s.borderStyle, s.borderWidth, s.boxShadow, s.fontWeight, s.fontSize, s.opacity], width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top), bottom: r.bottom };
});

for (const width of [320, 390, 1440]) {
  test(`preferences show Decline and Allow as one equal pair with Save on its own row at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await watchRequests(page, baseURL);
    await page.goto('/privacy/');
    await openNotice(page);
    const button = name => dialog(page).getByRole('button', { name, exact: true });
    const [d, a, s] = await Promise.all([consent.decline, consent.allow, consent.save].map(name => pairStyle(button(name))));
    expect(a.style).toEqual(d.style);
    expect([a.width, a.height, a.top]).toEqual([d.width, d.height, d.top]);
    expect(a.height).toBeGreaterThanOrEqual(44);
    expect(s.top).toBeGreaterThanOrEqual(d.bottom);
    expect(await dialog(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}

test('under GPC the preferences show both choices locked in the same way', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await watchRequests(page, baseURL);
  await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }));
  await page.goto('/privacy/');
  await settings(page).click();
  const button = name => dialog(page).getByRole('button', { name, exact: true });
  await expect(button(consent.decline)).toBeDisabled();
  await expect(button(consent.allow)).toBeDisabled();
  await button(consent.allow).hover({ force: true });
  const [d, a] = await Promise.all([pairStyle(button(consent.decline)), pairStyle(button(consent.allow))]);
  expect(a).toEqual(d);
});
