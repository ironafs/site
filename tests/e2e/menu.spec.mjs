import { ui } from '../../src/content/ui.ts';
import { test, expect } from '@playwright/test';

async function ready(page) {
  // The header is under test, not the hero: without its 3D chunk the page keeps the poster, and a software-GL scene
  // on a 2-core CI runner no longer starves the header's CSS transitions (the GitHub flames stalled at 0.98 opacity).
  await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', e => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto('/');
  await page.waitForSelector('html[data-menu-ready]');
}

for (const size of [{ width: 1728, height: 1000 }, { width: 1440, height: 900 }]) {
  for (const id of ['why', 'what', 'design', 'status']) {
    test(`${size.width}x${size.height}: /${id} jumps to the section start`, async ({ page }, info) => {
      test.skip(info.project.use.hasTouch, 'desktop navigation');
      await page.setViewportSize(size);
      await ready(page);
      const result = await page.evaluate(async id => {
        const section = document.getElementById(id);
        const stage = section.querySelector(':scope > .stage');
        document.querySelector(`.site-nav a[href="/#${id}"]`).click();
        const first = scrollY;
        await new Promise(resolve => setTimeout(resolve, 100));
        const at100 = scrollY;
        const top = section.getBoundingClientRect().top;
        const header = document.getElementById('site-header').getBoundingClientRect().bottom;
        const pinned = stage && getComputedStyle(stage).position === 'sticky';
        const stageTop = stage?.getBoundingClientRect().top;
        await new Promise(resolve => setTimeout(resolve, 300));
        const enhanced = CSS.supports('animation-timeline: view()') && !document.documentElement.classList.contains('static')
          && matchMedia('(prefers-reduced-motion: no-preference)').matches;
        return { first, at100, later: scrollY, top, header, pinned, stageTop, enhanced };
      }, id);
      expect(Math.abs(result.first - result.at100)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.at100 - result.later)).toBeLessThanOrEqual(1);
      if (result.pinned) {
        expect(Math.abs(result.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.stageTop)).toBeLessThanOrEqual(1);
      } else {
        expect(result.top).toBeGreaterThanOrEqual(result.header - 1);
        expect(result.top).toBeLessThanOrEqual(result.header + 16);
      }
      if (id === 'status' || id === 'what') expect(result.pinned).toBeFalsy();
      else if (result.enhanced) expect(result.pinned).toBe(true);
    });
  }
}

test('phone menu paths land below the header', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'phone navigation');
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  for (const id of ['why', 'what', 'design', 'status']) {
    await page.locator('#menu-button').tap();
    await page.locator(`#menu a[href="/#${id}"]`).tap();
    await expect(page.locator(`#${id}-h`)).toBeFocused();
    const { top, header, focusTop } = await page.evaluate(id => ({
      top: document.getElementById(id).getBoundingClientRect().top,
      header: document.getElementById('site-header').getBoundingClientRect().bottom,
      focusTop: document.activeElement.getBoundingClientRect().top,
    }), id);
    expect(top).toBeGreaterThanOrEqual(header - 1);
    expect(top).toBeLessThanOrEqual(header + 16);
    expect(focusTop).toBeGreaterThanOrEqual(header - 1);
  }
});

test('hash URLs and document contents use the same section offset', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/#why', '/#what', '/#design', '/#status', '/privacy', '/trademarks']) {
    await page.goto(path);
    await page.waitForSelector('html[data-menu-ready]');
    if (!path.includes('#')) {
      const link = page.locator('.document-toc a[href^="#"]').first();
      await link.click();
    }
    const result = await page.evaluate(() => {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      const stage = target.querySelector(':scope > .stage');
      return {
        top: target.getBoundingClientRect().top,
        header: document.getElementById('site-header').getBoundingClientRect().bottom,
        pinned: stage && getComputedStyle(stage).position === 'sticky',
      };
    });
    if (result.pinned) expect(Math.abs(result.top)).toBeLessThanOrEqual(1);
    else {
      expect(result.top).toBeGreaterThanOrEqual(result.header - 1);
      expect(result.top).toBeLessThanOrEqual(result.header + 16);
    }
  }
});

// The legal pages' contents mark the section being read: the last heading at or above 30% of the viewport's height.
// On a tall, narrower window (1280x1440) a heading moved across that line in small steps must update the mark each
// time; an observer band sized from the window's width (432 px line, 256-544 px band) missed the crossing.
test('the document contents follow a heading across the 30% line on a tall window', async ({ page }, info) => {
  test.skip(info.project.use.hasTouch, 'the desktop contents column');
  await page.setViewportSize({ width: 1280, height: 1440 });
  await page.goto('/privacy');
  await page.waitForSelector('html[data-menu-ready]');
  const ids = await page.locator('.document-toc a[href^="#"]').evaluateAll(as => as.map(a => a.hash.slice(1)));
  const line = 1440 * 0.3;
  for (const id of ids.slice(1, 4)) {
    // just below the line, then just above it: two small scrolls, the second crossing the line inside any band
    for (const [offset, current] of [[18, false], [-12, true]]) {
      await page.evaluate(([i, y]) => {
        const top = document.getElementById(i).getBoundingClientRect().top;
        window.scrollBy({ top: top - y, behavior: 'instant' });
      }, [id, line + offset]);
      const link = page.locator(`.document-toc a[href="#${id}"]`);
      if (current) await expect(link).toHaveAttribute('aria-current', 'location');
      else await expect(link).not.toHaveAttribute('aria-current', /.*/);
    }
  }
});

test.describe('phone menu', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 900, 'phone only');
  });

  test('GitHub is inside the phone menu and the current section has a steady marker', async ({ page }) => {
    await page.goto('/#design');
    await expect(page.locator('html')).toHaveAttribute('data-menu-ready', '');
    await expect(page.locator('.header-inner > a.github')).toBeHidden();
    const button = await page.locator('#menu-button').boundingBox();
    // A direct touch preserves the reading position. Playwright's locator scrolls the sticky button into view.
    await page.touchscreen.tap(button.x + button.width / 2, button.y + button.height / 2);
    await expect(page.locator('#menu .menu-primary a')).toHaveText(/GitHub/);
    await expect(page.locator('#menu .menu-paths [aria-current="location"]')).toHaveAttribute('href', '/#design');
    await expect(page.locator('#menu .menu-primary a')).toHaveAttribute('href', /github\.com/);
  });

  test('the button is a 44 px target; tapping opens a focus-contained sheet; Escape closes it', async ({ page, browserName }) => {
    await ready(page);
    const button = page.locator('#menu-button');
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toHaveAttribute('aria-controls', 'menu');
    await button.tap();
    await expect(page.locator('#menu')).toHaveJSProperty('open', true);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => document.getElementById('menu').contains(document.activeElement))).toBe(true);
    // the page does not scroll while the sheet is open
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
    if (browserName === 'chromium') { // mouse.wheel is not supported in mobile WebKit
      await page.mouse.move(100, 400);
      await page.mouse.wheel(0, 600);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
    // Tab stays inside
    const count = await page.evaluate(() => document.querySelectorAll('#menu a[href], #menu button').length);
    for (let i = 0; i < count + 2; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.getElementById('menu').contains(document.activeElement)), `tab ${i}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toHaveJSProperty('open', false);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
  });

  test('the sheet closes on the back gesture', async ({ page }) => {
    await ready(page);
    await page.locator('#menu-button').tap();
    await expect(page.locator('#menu')).toHaveJSProperty('open', true);
    await page.goBack();
    await expect(page.locator('#menu')).toHaveJSProperty('open', false);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('tapping the /status row closes the sheet and focuses the status heading in view', async ({ page }) => {
    await ready(page);
    await page.locator('#menu-button').tap();
    await page.locator('#menu a[href="/#status"]').tap();
    await expect(page.locator('#menu')).toHaveJSProperty('open', false);
    await expect(page.locator('#status-h')).toBeFocused();
    await expect.poll(() => page.evaluate(() => {
      const r = document.getElementById('status-h').getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    })).toBe(true);
  });

  // : #why has no heading; its restart message (#why-h) is the focus target, as each path's heading is.
  for (const id of ['why', 'what', 'design', 'built', 'follow']) {
    test(`tapping the /${id} row moves focus to #${id}-h in that section`, async ({ page }) => {
      await ready(page);
      await page.locator('#menu-button').tap();
      await page.locator(`#menu a[href="/#${id}"]`).tap();
      await expect(page.locator('#menu')).toHaveJSProperty('open', false);
      await expect(page.locator(`#${id}-h`)).toBeFocused();
      expect(await page.evaluate(id => document.activeElement.closest('section')?.id, id)).toBe(id);
    });
  }

  test('rows are at least 56 px tall; the sheet honours the safe-area inset; six paths then three links then the status pill', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => document.documentElement.style.setProperty('--safe-top', '47px'));
    await page.locator('#menu-button').tap();
    const rows = await page.locator('#menu .menu-row').evaluateAll(els => els.map(e => ({ h: e.getBoundingClientRect().height, text: e.textContent.trim(), href: e.getAttribute('href') })));
    expect(rows.length).toBeGreaterThanOrEqual(9);
    // The sheet's opening transform can introduce floating-point noise in the client rect.
    for (const row of rows) expect(row.h, row.text).toBeGreaterThanOrEqual(56 - 0.001);
    expect(rows.map(r => r.href).slice(0, 6)).toEqual(['/#why', '/#what', '/#design', '/#status', '/#built', '/#follow']);
    expect(rows.slice(6).map(r => r.text.replace(/\s+/g, ' '))).toEqual(['GitHub ↗', 'Milestones ↗', 'Design docs ↗']);
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('menu')).paddingTop));
    expect(pad).toBeGreaterThanOrEqual(47);
    expect(await page.locator('#menu .pill').count()).toBe(1);
    const sheet = await page.locator('#menu').boundingBox();
    expect(sheet.width).toBeGreaterThanOrEqual(page.viewportSize().width - 1);
    expect(sheet.height).toBeGreaterThanOrEqual(page.viewportSize().height - 1);
  });

  test('the sheet slides in 200 ms', async ({ page }) => {
    await ready(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('menu')).transitionDuration)).toContain('0.2s');
  });

  test('with reduced motion the sheet has no transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    const durations = await page.evaluate(() => getComputedStyle(document.getElementById('menu')).transitionDuration.split(',').map(s => s.trim()));
    expect(durations.every(d => d === '0s')).toBe(true);
  });

  const isOpen = page => page.evaluate(() => document.getElementById('menu').open);
  const locked = page => page.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden');
  const expanded = page => page.locator('#menu-button').getAttribute('aria-expanded');
  const settled = async (page, url) => {
    await expect.poll(() => isOpen(page)).toBe(false);
    await expect.poll(() => locked(page)).toBe(false);
    expect(await expanded(page)).toBe('false');
    if (url) expect(page.url()).toBe(url);
  };

  test('the x button closes the sheet and releases the scroll lock', async ({ page }) => {
    await ready(page);
    await page.locator('#menu-button').tap();
    await page.locator('#menu-close').tap();
    await settled(page, new URL('/', page.url()).href);
    await expect(page.locator('#menu-button')).toBeFocused();
  });

  test('a double tap on x does not navigate away', async ({ page }) => {
    await ready(page);
    const url = page.url();
    const before = await page.evaluate(() => history.length);
    await page.locator('#menu-button').tap();
    await page.evaluate(() => { const b = document.getElementById('menu-close'); b.click(); b.click(); });
    await settled(page, url);
    await page.waitForTimeout(300);
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await expect(page.locator('#menu-button')).toBeVisible();
  });

  test('Escape twice and the back gesture after Escape do not strand anything or leave the site', async ({ page }) => {
    await page.goto('/no-such-page/');
    const prior = page.url();
    await ready(page);
    const url = page.url();
    await page.locator('#menu-button').tap();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await settled(page, url);
    await page.waitForTimeout(300);
    expect(page.url()).toBe(url);
    await page.goBack();
    await expect.poll(() => page.url()).toBe(prior);
    await expect.poll(() => locked(page)).toBe(false);
  });

  test('open then the browser back gesture closes the sheet and stays on the page', async ({ page }) => {
    await ready(page);
    const url = page.url();
    await page.locator('#menu-button').tap();
    await page.goBack();
    await settled(page, url);
    await expect(page.locator('#menu-button')).toBeFocused();
  });

  test('back with the sheet closed navigates back normally', async ({ page }) => {
    await page.goto('/no-such-page/');
    const prior = page.url();
    await ready(page);
    await page.locator('#menu-button').tap();
    await page.keyboard.press('Escape');
    await settled(page);
    await page.goBack();
    await expect.poll(() => page.url()).toBe(prior);
  });

  test('a row tap releases the scroll lock and leaves no extra history entry', async ({ page }) => {
    await ready(page);
    const before = await page.evaluate(() => history.length);
    await page.locator('#menu-button').tap();
    await page.locator('#menu a[href="/#design"]').tap();
    await expect.poll(() => page.url()).toMatch(/\/#design$/);
    await settled(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await page.goBack();
    await expect.poll(() => new URL(page.url()).hash).toBe('');
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('a native dialog.close() with no pop removes our history entry and Back then behaves normally', async ({ page }) => {
    await page.goto('/no-such-page/');
    const prior = page.url();
    await ready(page);
    const url = page.url();
    await page.locator('#menu-button').tap();
    await page.evaluate(() => document.getElementById('menu').close());
    await settled(page, url);
    await page.waitForTimeout(300);
    expect(page.url()).toBe(url);
    await page.goBack();
    await expect.poll(() => page.url()).toBe(prior);
  });

  test('a native close while a pop is in flight pops exactly once', async ({ page }) => {
    await page.goto('/no-such-page/');
    const prior = page.url();
    await ready(page);
    const url = page.url();
    await page.locator('#menu-button').tap();
    await page.evaluate(() => { document.getElementById('menu-close').click(); document.getElementById('menu').close(); });
    await settled(page, url);
    await page.waitForTimeout(400);
    expect(page.url()).toBe(url);
    await expect(page.locator('#menu-button')).toBeVisible();
    await page.goBack();
    await expect.poll(() => page.url()).toBe(prior);
  });

  test('a row tap followed at once by a native close still scrolls and pops once', async ({ page }) => {
    await ready(page);
    await page.locator('#menu-button').tap();
    await page.evaluate(() => { document.querySelector('#menu a[href="/#design"]').click(); document.getElementById('menu').close(); });
    await settled(page);
    await expect.poll(() => page.url()).toMatch(/\/#design$/);
    expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(3);
  });

  test('a second row tap while closing does not navigate away', async ({ page }) => {
    await ready(page);
    await page.locator('#menu-button').tap();
    await page.evaluate(() => { document.querySelector('#menu a[href="/#why"]').click(); document.querySelector('#menu a[href="/#status"]').click(); });
    await settled(page);
    await page.waitForTimeout(300);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('resizing past 900 px while open closes the sheet', async ({ page }) => {
    await ready(page);
    const url = page.url();
    await page.locator('#menu-button').tap();
    await page.setViewportSize({ width: 1000, height: 800 });
    await settled(page, url);
  });

  test('no script or style violation from the menu', async ({ page }) => {
    await ready(page);
    await page.locator('#menu-button').tap();
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });
});

test.describe('desktop header', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'desktop only');
  });

  test('links visible, menu button hidden, GitHub link labelled', async ({ page }) => {
    await ready(page);
    for (const href of ['/#why', '/#what', '/#design', '/#status']) await expect(page.locator(`.site-nav a[href="${href}"]`)).toBeVisible();
    await expect(page.locator('#menu-button')).toBeHidden();
    await expect(page.locator('a.github')).toHaveAttribute('aria-label', ui.github);
    const box = await page.locator('a.github').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
  });

  for (const width of [900, 1024, 1365]) {
    test(`header controls fit on one line at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await ready(page);
      const boxes = await page.locator('.brand, .site-nav a, #shell-key, a.github').evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()));
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right - 1);
        expect(Math.abs(boxes[i].top + boxes[i].height / 2 - boxes[0].top - boxes[0].height / 2)).toBeLessThan(2);
      }
      expect(boxes.at(-1).right).toBeLessThanOrEqual(width);
    });
  }

  test('scrolling 20 px makes the header solid', async ({ page }) => {
    await ready(page);
    await expect(page.locator('#site-header')).not.toHaveAttribute('data-solid', /.*/);
    await page.evaluate(() => window.scrollTo(0, 20));
    await expect(page.locator('#site-header')).toHaveAttribute('data-solid', '');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('#site-header')).not.toHaveAttribute('data-solid', /.*/);
  });

  test('the visible section marks its link current, and only that one', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => document.getElementById('what').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(page.locator('.site-nav a[aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('.site-nav a[href="/#what"]')).toHaveAttribute('aria-current', 'true');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(page.locator('.site-nav a[aria-current="true"]')).toHaveCount(0);
  });

  test('hovering a link heats its bar; hovering the GitHub icon shows flames', async ({ page }) => {
    await ready(page);
    const bar = () => page.evaluate(() => getComputedStyle(document.querySelector('.site-nav a'), '::after').transform);
    const before = await bar();
    await page.locator('.site-nav a').first().hover();
    await expect.poll(bar).not.toBe(before);
    await page.locator('a.github').hover();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('a.github .fire')).opacity)).toBe('1');
  });
});

test.describe('phone menu history', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 900, 'phone only');
  });

  test('open, close, Forward, open, close: the menu keeps working and the page is unlocked', async ({ page }) => {
    await ready(page);
    const button = page.locator('#menu-button');
    const menu = page.locator('#menu');
    await button.tap();
    await expect(menu).toHaveJSProperty('open', true);
    await page.locator('#menu-close').tap();
    await expect(menu).toHaveJSProperty('open', false);
    await page.goForward();
    await expect(menu).toHaveJSProperty('open', false);
    await button.tap();
    await expect(menu).toHaveJSProperty('open', true);
    await page.locator('#menu-close').tap();
    await expect(menu).toHaveJSProperty('open', false);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-menu-open'))).toBe(false);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
    // Escape still works
    await button.tap();
    await expect(menu).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveJSProperty('open', false);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    // a row tap still navigates and closes
    await button.tap();
    await page.locator('#menu a[href="/#status"]').tap();
    await expect(menu).toHaveJSProperty('open', false);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
    expect(new URL(page.url()).origin).toBe(new URL(test.info().project.use.baseURL ?? page.url()).origin);
  });
});

async function tabletFragmentPage(page) {
  await page.setViewportSize({ width: 820, height: 1050 });
  await page.route('**/privacy/analytics-policy', route => route.fulfill({ json: { mode: 'opt-in' } }));
  await page.addInitScript(() => {
    window.fragmentScrolls = [];
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args) {
      if (this.matches('#rust, #speed')) window.fragmentScrolls.push(this.id);
      return scrollIntoView.apply(this, args);
    };
  });
}

async function settleTabletLayout(page) {
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
  });
}

test('fresh story fragments reach their headings after tablet layout settles', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit-phone', 'portrait WebKit tablet layout');
  await tabletFragmentPage(page);
  for (const id of ['rust', 'speed']) {
    await page.goto(`/#${id}`);
    await settleTabletLayout(page);
    await expect.poll(() => page.evaluate(id => {
      const heading = document.querySelector(`#${id} h2`).getBoundingClientRect();
      const header = document.getElementById('site-header').getBoundingClientRect();
      return heading.top >= header.bottom - 1 && heading.bottom < innerHeight / 2;
    }, id)).toBe(true);
    await page.goto('/privacy/');
  }
});

test('tablet fragment correction leaves native history and early touch scrolling alone', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit-phone', 'portrait WebKit tablet layout');
  await tabletFragmentPage(page);
  await page.goto('/#rust');
  await settleTabletLayout(page);
  await page.evaluate(() => scrollBy({ top: 250, behavior: 'instant' }));
  await page.reload();
  await settleTabletLayout(page);
  expect(await page.evaluate(() => window.fragmentScrolls)).toEqual([]);
  await page.goto('/privacy/');
  await page.goBack();
  await settleTabletLayout(page);
  expect(await page.evaluate(() => window.fragmentScrolls)).toEqual([]);

  // Keep the initial layout pending while the reader touches and scrolls.
  await page.goto('/privacy/');
  let releaseFonts;
  const fonts = new Promise(resolve => { releaseFonts = resolve; });
  await page.route('**/*.woff2', async route => {
    await fonts;
    return route.continue();
  });
  try {
    await page.goto('/#rust', { waitUntil: 'domcontentloaded' });
    await page.touchscreen.tap(8, 70);
    await page.evaluate(() => scrollBy({ top: 500, behavior: 'instant' }));
  } finally {
    releaseFonts();
  }
  await settleTabletLayout(page);
  expect(await page.evaluate(() => window.fragmentScrolls)).toEqual([]);
});
