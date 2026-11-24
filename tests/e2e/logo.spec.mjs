import { test, expect } from '@playwright/test';

// The header wordmark rusts: "AFS" is bare steel
// on load and rust covers it in about two seconds; hovering the logo burns the rust off, and it creeps back after;
// reduced motion shows the finished, rusted wordmark at once. Rust is a pixel whose red exceeds its blue by more than 40.
// ready() also keeps AFS's pixels as mounted (window.__mounted, read by mounted()): the start, before the first frame.
async function ready(page, { theme } = {}) {
  // the header is under test, not the hero: no 3D scene competing for the CPU (menu.spec.mjs does the same)
  await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
  await page.addInitScript(light => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', e => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
    // before the module script mounts it: flip the server-rendered logo to the light theme as it is parsed
    if (light) new MutationObserver((_, observer) => {
      const logo = document.querySelector('[data-rust-logo]');
      if (logo) { logo.dataset.theme = 'light'; logo.classList.replace('rl-dark', 'rl-light'); observer.disconnect(); }
    }).observe(document, { childList: true, subtree: true });
    // data-rust="mounted" is set as the canvas goes in; this runs once that task has drawn AFS at its start (rust 0)
    // and before the first frame moves it: the start itself, however late a test gets to read the canvas
    window.__mounted = null;
    new MutationObserver((_, observer) => {
      const logo = document.querySelector('#site-header [data-rust-logo]');
      if (logo?.dataset.rust !== 'mounted') return;
      observer.disconnect();
      const canvas = logo.querySelector('.rl-canvas');
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0, rust = 0, lightness = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        n++;
        if (d[i] - d[i + 2] > 40) rust++;
        lightness += (d[i] + d[i + 1] + d[i + 2]) / 3;
      }
      window.__mounted = { n, rust: rust / n, light: lightness / n };
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-rust'] });
  }, theme === 'light');
  await page.goto('/');
}

/** The share of AFS's opaque pixels that are rust, and their mean brightness. */
const afs = page => page.evaluate(() => {
  const canvas = document.querySelector('#site-header .rl-canvas');
  if (!canvas) return null;
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0, rust = 0, light = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    n++;
    if (d[i] - d[i + 2] > 40) rust++;
    light += (d[i] + d[i + 1] + d[i + 2]) / 3;
  }
  return { n, rust: rust / n, light: light / n };
});
/** AFS as mounted (ready()): its share of rust and mean brightness at the start. */
const mounted = page => page.waitForFunction(() => window.__mounted).then(handle => handle.jsonValue());

test('AFS starts as steel and is rust after 2.5 s, with no CSP violation', async ({ page }) => {
  await ready(page);
  const logo = page.locator('#site-header [data-rust-logo]');
  await expect(logo).toHaveAttribute('data-rust', /rusting|rusted/);
  const first = await mounted(page);
  expect(first.n, 'AFS is drawn').toBeGreaterThan(200);
  expect(first.rust, 'bare steel at the start').toBeLessThan(0.3);
  await page.waitForTimeout(2500);
  expect((await afs(page)).rust).toBeGreaterThanOrEqual(0.95);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});

test('hovering the logo burns the rust off within 1.5 s, and it rusts back after', async ({ page, isMobile }) => {
  test.skip(isMobile, 'hover is a pointer device thing');
  await ready(page);
  await expect(page.locator('#site-header [data-rust-logo]')).toHaveAttribute('data-rust', 'rusted', { timeout: 6000 });
  // read once before the hover (as the 404 test does): a canvas's first read is a GPU readback, seconds long on
  // software GL, and it must not take up the 1.5 s
  expect((await afs(page)).rust).toBeGreaterThanOrEqual(0.95);
  await page.locator('#site-header .brand').hover();
  await expect.poll(async () => (await afs(page)).rust, { timeout: 1500, intervals: [100] }).toBeLessThanOrEqual(0.05);
  await page.mouse.move(700, 600);
  await expect.poll(async () => (await afs(page)).rust, { timeout: 5000 }).toBeGreaterThanOrEqual(0.95);
});

test('reduced motion: the rusted wordmark at once, still, and hover changes nothing', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const logo = page.locator('#site-header [data-rust-logo]');
  await expect(logo).toHaveAttribute('data-rust', 'still');
  expect((await afs(page)).rust).toBeGreaterThanOrEqual(0.95);
  const cell = () => page.locator('#site-header .rl-cell').innerHTML();
  const before = await cell();
  if (!isMobile) await page.locator('#site-header .brand').hover();
  await page.waitForTimeout(600);
  expect(await cell(), 'the cell does not turn').toBe(before);
  expect((await afs(page)).rust).toBeGreaterThanOrEqual(0.95);
});

test('light theme: gunmetal steel, darker than the dark theme\'s', async ({ page }) => {
  await ready(page, { theme: 'light' });
  await expect(page.locator('#site-header [data-rust-logo]')).toHaveAttribute('data-rust', /rusting|rusted/);
  const first = await mounted(page);
  expect(first.rust).toBeLessThan(0.3);
  expect(first.light, 'gunmetal').toBeLessThan(110);
});

test('the header keeps its height and the logo its size', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#site-header [data-rust-logo]')).toHaveAttribute('data-rust', /rusting|rusted/);
  const m = await page.evaluate(() => ({
    header: document.querySelector('#site-header .header-inner').getBoundingClientRect().height,
    logo: document.querySelector('#site-header [data-rust-logo]').getBoundingClientRect().width,
    vw: innerWidth,
  }));
  expect(m.header).toBe(m.vw >= 900 ? 64 : 56);
  expect(Math.abs(m.logo - (m.vw >= 900 ? 134 : 117)), `the logo is ${m.logo} px wide`).toBeLessThanOrEqual(6);
});

// The same wordmark, larger, on the 404 page. It follows the visitor's theme. (The home page shows one logo, the
// header's: #follow has none.)
const afsIn = (page, selector) => page.evaluate(sel => {
  const canvas = document.querySelector(`${sel} .rl-canvas`);
  if (!canvas) return null;
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0, rust = 0, light = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    n++;
    if (d[i] - d[i + 2] > 40) rust++;
    light += (d[i] + d[i + 1] + d[i + 2]) / 3;
  }
  return { n, rust: rust / n, light: light / n };
}, selector);

for (const [name, path, selector] of [['404', '/no-such-page', '.not-found']]) {
  test(`${name}: AFS rusts in 2.5 s and hovering burns it off within 1.5 s, with no CSP violation`, async ({ page, isMobile }) => {
    await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
    await page.addInitScript(() => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', e => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await page.goto(path);
    const logo = page.locator(`${selector} [data-rust-logo]`);
    await logo.scrollIntoViewIfNeeded();
    await expect(logo).toHaveAttribute('data-rust', /rusting|rusted/);
    const first = await afsIn(page, selector);
    expect(first.n, 'AFS is drawn, larger than the header\'s').toBeGreaterThan(1000);
    expect(first.rust, 'bare steel at the start').toBeLessThan(0.3);
    await page.waitForTimeout(2500);
    expect((await afsIn(page, selector)).rust).toBeGreaterThanOrEqual(0.95);
    if (!isMobile) {
      await logo.hover();
      await expect.poll(async () => (await afsIn(page, selector)).rust, { timeout: 1500, intervals: [100] }).toBeLessThanOrEqual(0.05);
    }
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });

  test(`${name}: the logo follows the theme (gunmetal in light, steel in dark)`, async ({ page }) => {
    await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
    const resolved = {};
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' }); // still: the finished, rusted mark
      await page.goto('about:blank'); // a fresh document for each scheme
      await page.goto(path);
      const logo = page.locator(`${selector} [data-rust-logo]`);
      await logo.scrollIntoViewIfNeeded();
      await expect(logo).toHaveAttribute('data-rust', 'still');
      resolved[scheme] = await page.evaluate(sel => {
        // the steel "Ir" and "n" are text with a gradient: read the theme from the class the script resolved
        return document.querySelector(`${sel} [data-rust-logo]`).classList.contains('rl-light') ? 'light' : 'dark';
      }, selector);
    }
    expect(resolved).toEqual({ light: 'light', dark: 'dark' });
  });

  test(`${name}: reduced motion shows the rusted wordmark at once`, async ({ page }) => {
    await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    const logo = page.locator(`${selector} [data-rust-logo]`);
    await logo.scrollIntoViewIfNeeded();
    await expect(logo).toHaveAttribute('data-rust', 'still');
    expect((await afsIn(page, selector)).rust).toBeGreaterThanOrEqual(0.95);
  });
}

test('the home page has one logo, the header\'s: #follow has none', async ({ page }) => {
  await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
  await page.goto('/');
  await expect(page.locator('#site-header [data-rust-logo]')).toHaveCount(1);
  await expect(page.locator('#follow [data-rust-logo]')).toHaveCount(0);
  await expect(page.locator('main [data-rust-logo]')).toHaveCount(0);
});

// : the auto-themed logos follow a theme change in the same document: the palette class,
// the steel on the canvas, and still one animation loop (its ?test frame counter keeps its rate).
for (const [name, path, selector] of [['404', '/no-such-page?test', '.not-found']]) {
  test(`${name}: a live theme change dark -> light -> dark re-themes the logo (class and pixels), with one loop`, async ({ page }) => {
    await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(path);
    const logo = page.locator(`${selector} [data-rust-logo]`);
    await logo.scrollIntoViewIfNeeded();
    await expect(logo).toHaveAttribute('data-rust', /rusting|rusted/);
    await expect(logo).toHaveClass(/\brl-dark\b/);
    // burn the rust off (the hover handler; dispatched, so phones run it too) so the canvas shows its bare steel
    await logo.dispatchEvent('pointerenter');
    await expect.poll(async () => (await afsIn(page, selector)).rust, { timeout: 3000 }).toBeLessThanOrEqual(0.05);
    const steel = async () => (await afsIn(page, selector)).light;
    const rate = async () => {
      const frames = () => logo.evaluate(el => Number(el.dataset.frames || 0));
      const a = await frames();
      await page.waitForTimeout(1000);
      return (await frames()) - a;
    };
    expect(await steel(), 'dark: bright steel').toBeGreaterThan(140);
    const before = await rate();
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(logo).toHaveClass(new RegExp(`\\brl-${scheme}\\b`));
      await expect(logo).not.toHaveClass(new RegExp(`\\brl-${scheme === 'light' ? 'dark' : 'light'}\\b`));
      if (scheme === 'light') await expect.poll(steel, { message: 'light: gunmetal' }).toBeLessThan(110);
      else await expect.poll(steel, { message: 'dark: steel again' }).toBeGreaterThan(140);
    }
    const after = await rate();
    expect(before, 'the loop runs').toBeGreaterThan(5);
    expect(after, `one loop: ${before} frames/s before, ${after} after`).toBeLessThan(before * 1.5);
    expect(await logo.locator('.rl-canvas').count()).toBe(1);
    expect(await logo.locator('.rl-cell > defs').count()).toBe(1);
  });
}

test('the header logo (theme="dark") keeps its steel through a live theme change', async ({ page }) => {
  await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const logo = page.locator('#site-header [data-rust-logo]');
  await expect(logo).toHaveAttribute('data-rust', /rusting|rusted/);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(300);
  await expect(logo).toHaveClass(/\brl-dark\b/);
  await expect(logo).not.toHaveClass(/\brl-light\b/);
});

// The canvas follows the type: resizing across the header's breakpoint after the logo has mounted rebuilds AFS at
// the new size, so it stays in proportion with "Ir", the cell and "n".
test('after mounting, a resize across the header breakpoint resizes AFS with the rest of the wordmark', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a desktop window resized');
  await ready(page);
  const logo = page.locator('#site-header [data-rust-logo]');
  await expect(logo).toHaveAttribute('data-rust', /rusting|rusted/);
  const measure = () => page.evaluate(() => {
    const host = document.querySelector('#site-header [data-rust-logo]');
    const fs = parseFloat(getComputedStyle(host).fontSize);
    return { fs, height: host.querySelector('.rl-canvas').getBoundingClientRect().height };
  });
  const wide = await measure();
  await page.setViewportSize({ width: 600, height: 900 });
  await expect.poll(async () => { const m = await measure(); return m.fs !== wide.fs; }).toBe(true);
  // AFS's box is the type's ascent and descent (0.95 + 0.22 em), at the size the type has now
  await expect.poll(async () => { const m = await measure(); return Math.abs(m.height - Math.ceil(m.fs * 1.17)); }).toBeLessThanOrEqual(1);
});

test('a font that fails to load leaves the server-rendered wordmark, with no page error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    document.fonts.load = () => Promise.reject(new Error('font blocked'));
  });
  await ready(page);
  await page.waitForTimeout(1500);
  await expect(page.locator('#site-header [data-rust-logo] .rl-afs')).toHaveCount(1);
  await expect(page.locator('#site-header [data-rust-logo] .rl-canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
