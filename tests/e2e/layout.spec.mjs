import { test, expect } from '@playwright/test';
import { widths, blockExternal } from './util.mjs';
import { afsContext } from '../../src/content/why.ts';

// The header wordmark (RustLogo) is 3.886 em wide on one line: it is never squeezed or wrapped.
const ratio = 3.886;

async function expectReadyLogoRatio(page, message) {
  const logo = page.locator('#site-header [data-rust-logo]');
  await expect(logo.locator('canvas.rl-canvas')).toBeAttached();
  // The canvas can mount before ResizeObserver rebuilds it at the current font size.
  await expect(async () => {
    const r = await logo.evaluate(el => el.getBoundingClientRect().width / parseFloat(getComputedStyle(el).fontSize));
    expect(r, message).toBeGreaterThan(ratio * 0.97);
    expect(r, message).toBeLessThan(ratio * 1.03);
  }).toPass({ timeout: 5_000 });
}

async function expectNoHorizontalOverflow(page, message) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth, message).toBeLessThanOrEqual(innerWidth);
}

for (const scheme of ['light', 'dark']) {
  test(`no horizontal overflow at every width, ${scheme}`, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const external = await blockExternal(page, baseURL);
    await page.addInitScript(() => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', e => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const [initialWidth] = widths;
    await page.setViewportSize({ width: initialWidth, height: 800 });
    await page.goto('/');
    for (const width of widths) {
      if (width !== initialWidth) await page.setViewportSize({ width, height: 800 });
      await expectNoHorizontalOverflow(page, `width ${width}`);
      await expectReadyLogoRatio(page, `logo ratio at ${width}`);
      await expectNoHorizontalOverflow(page, `width ${width} after logo sizing`);
      const what = page.getByRole('region', { name: afsContext.heading });
      expect(await what.evaluate(el => ({
        position: getComputedStyle(el.firstElementChild).position,
        theme: getComputedStyle(el).colorScheme,
      }))).toEqual({ position: 'relative', theme: 'dark' });
    }
    expect(external).toEqual([]);
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });
}

test('at 360 px and 200% zoom nothing in #console, #site-header or #site-footer overflows its parent', async ({ page, browserName }) => {
  // 200% zoom at 360 px is a 180 CSS px layout viewport; emulate it with a 180 px viewport.
  await page.setViewportSize({ width: 180, height: 640 });
  await page.goto('/');
  await expectReadyLogoRatio(page, 'logo ratio at 200% zoom');
  for (const id of ['console', 'site-header', 'site-footer']) {
    const overflowing = await page.evaluate(id => {
      const root = document.getElementById(id);
      const out = [];
      for (const el of root.querySelectorAll('*')) {
        const parent = el.parentElement;
        if (!parent || el.closest('dialog:not([open])')) continue;
        const a = el.getBoundingClientRect();
        const b = parent.getBoundingClientRect();
        if (a.width === 0 && a.height === 0) continue;
        if (a.right > b.right + 1 || a.left < b.left - 1) out.push(`${el.tagName.toLowerCase()}.${el.className} in ${parent.tagName.toLowerCase()}`);
      }
      return out;
    }, id);
    expect(overflowing, `#${id} (${browserName})`).toEqual([]);
  }
  await expectNoHorizontalOverflow(page);
});

// The two footer navigation groups stack on a phone and sit side by side on a wide screen.
test('the compact footer stacks on phones and keeps 44 px targets', async ({ page }) => {
  const measure = () => page.evaluate(() => {
    const footer = document.getElementById('site-footer');
    const navs = [...footer.querySelectorAll('nav')].map(n => n.getBoundingClientRect());
    const rows = [...footer.querySelectorAll('a, button')].flatMap(el => [...el.getClientRects()].map(r => r.height));
    // every link and summary in main, inline links in sentences included, each line on its own (a hidden one has none)
    const targets = [...document.querySelectorAll('main :is(a[href], summary)')].flatMap(el => [...el.getClientRects()]
      .map(r => ({ h: r.height, what: `${el.closest('section[id]')?.id} ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"` })));
    const legal = footer.querySelector('.footer-groups').nextElementSibling.getBoundingClientRect().top;
    return { tops: navs.map(r => r.top), lefts: navs.map(r => r.left), bottoms: navs.map(r => r.bottom), rows, targets, legal };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const phone = await measure();
  expect(phone.tops).toHaveLength(2);
  expect(phone.tops[1]).toBeGreaterThanOrEqual(phone.bottoms[0]);
  await expect(page.locator('#site-footer a')).toHaveCount(11);
  expect(phone.rows.length).toBeGreaterThanOrEqual(11);
  for (const h of phone.rows) expect(h).toBeGreaterThanOrEqual(44);
  expect(phone.targets.length, 'the story\'s links, the summaries, the milestones').toBeGreaterThanOrEqual(50);
  expect(phone.targets.filter(t => t.h < 44).map(t => `${t.what}: ${t.h.toFixed(1)} px`)).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktop = await measure();
  expect(Math.max(...desktop.tops) - Math.min(...desktop.tops)).toBeLessThanOrEqual(1);
  expect(desktop.lefts[0]).toBeLessThan(desktop.lefts[1]);
  expect(desktop.legal).toBeGreaterThanOrEqual(Math.max(...desktop.bottoms));
});

// Phones: every control is a 44 x 44 px target, width as well as height: the header's Home link, every link, summary
// and button in main and the footer, on the home page and on /privacy. A link wrapped over lines is measured by its
// whole box (its line boxes together), each line still 44 px tall.
for (const path of ['/', '/privacy/']) {
  test(`at 390 px every control on ${path} is at least 44 x 44 px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const small = await page.evaluate(() => {
      const els = [...document.querySelectorAll('#site-header a[href], main :is(a[href], summary, button), #site-footer :is(a[href], button)')]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
      const name = el => `${el.closest('section[id], header, footer, main')?.id || el.closest('header, footer, main').tagName.toLowerCase()} ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`;
      const out = [];
      for (const el of els) {
        const lines = [...el.getClientRects()].filter(r => r.width > 0 && r.height > 0);
        const box = el.getBoundingClientRect();
        if (lines.some(r => r.height < 43.5) || box.width < 43.5) out.push(`${name(el)}: ${box.width.toFixed(1)} x ${Math.min(...lines.map(r => r.height)).toFixed(1)}`);
      }
      return { out, count: els.length };
    });
    expect(small.count).toBeGreaterThan(path === '/' ? 60 : 10);
    expect(small.out).toEqual([]);
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the built disclosures open by keyboard and expose their reference links without JavaScript', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 320, height: 660 });
    await page.goto('/#built');
    const panels = page.locator('#built details');
    await expect(panels).toHaveCount(3);

    for (const panel of await panels.all()) {
      const summary = panel.locator('summary');
      const link = panel.getByRole('link').first();
      await expect(link).toBeHidden();
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(panel).toHaveAttribute('open', '');
      await expect(link).toBeVisible();
      // WebKit follows Safari’s default keyboard setting, which uses Option-Tab to reach links.
      await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
      await expect(link).toBeFocused();
      await expect(link).toHaveCSS('outline-style', 'solid');
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(link).toBeHidden();
    }
  });

  // The static wordmark (no canvas) and a status pill whose label fits on one line are still 44 px targets.
  test('at 390 px the Home link and a one-line status pill are 44 x 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const sizes = await page.evaluate(() => {
      const pill = document.querySelector('#hero .pill');
      pill.childNodes[1].textContent = 'IronAFS™ · M2a';
      return [document.querySelector('#site-header a.brand'), pill].map(el => {
        const r = el.getBoundingClientRect();
        return { lines: el.getClientRects().length, width: r.width, height: r.height };
      });
    });
    for (const size of sizes) {
      expect(size.lines).toBe(1);
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(43.5);
    }
  });
});

// Check every target in normal flow. story-crash.spec checks the two statistics' links at their separate
// scroll positions when they share the same pinned stage.
test('at 390 px in normal flow, tap targets in main and the footer have distinct hit areas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const { count, overlaps, missed } = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const els = [...document.querySelectorAll('main :is(a[href], summary, button), #site-footer :is(a[href], button)')];
    const name = el => `${el.closest('section[id], footer')?.id} ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`;
    const rects = els.flatMap(el => [...el.getClientRects()].filter(r => r.width > 0 && r.height > 0)
      .map(r => ({ el, top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right })));
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const [a, b] = [rects[i], rects[j]];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 0.5 && y > 0.5) overlaps.push(`${name(a.el)} x ${name(b.el)}: ${y.toFixed(1)} px`);
    }
    const missed = [];
    for (const r of rects) {
      scrollTo({ top: Math.max(0, (r.top + r.bottom) / 2 - innerHeight / 2), behavior: 'instant' });
      await frame();
      const x = (r.left + r.right) / 2;
      const y = (r.top + r.bottom) / 2 - scrollY;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === r.el || r.el.contains(hit))) missed.push(`${name(r.el)}: ${hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'nothing'}`);
    }
    return { count: rects.length, overlaps, missed };
  });
  expect(count, 'the targets were measured').toBeGreaterThan(60);
  expect(overlaps).toEqual([]);
  expect(missed).toEqual([]);
});
