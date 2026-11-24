// Renders src/assets/hero/poster.png (2880x1800) from the real scene's finished state (a return visit starts
// there), so the poster and the live canvas line up when one gives way to the other.
// Run by hand after a build: npm run build && node tools/poster.mjs   (rebuild afterwards: the page embeds the poster).
// Not part of CI. Uses the same software GL as the end-to-end tests, so it renders the same on any machine.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../src/assets/hero/poster.png', import.meta.url));
const port = 4398;
const server = spawn(process.execPath, [fileURLToPath(new URL('../tests/e2e/serve.mjs', import.meta.url))], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'inherit',
});
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* not up yet */ }
    if (i > 50) throw new Error('the test server did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // bypassCSP: the style tag that hides the page around the canvas is inline
  // 900 + the 64 px header: the hero's box is then exactly 16:10 (1440x900), the poster's shape
  const page = await browser.newPage({ viewport: { width: 1440, height: 964 }, deviceScaleFactor: 2, bypassCSP: true });
  page.on('pageerror', e => console.error('page error:', e.message));
  // nothing leaves the machine (the analytics tag stays unloaded), and the analytics notice, fixed over the bottom
  // of the viewport for an undecided visit, is hidden with the rest of the page below
  await page.route(url => new URL(url).hostname !== '127.0.0.1', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1')); // a return visit: the finished state
  await page.goto(`http://127.0.0.1:${port}/?test`);
  const hero = page.locator('#hero');
  await hero.locator('canvas.hero-canvas').waitFor();
  await page.waitForFunction(() => document.getElementById('hero')?.dataset.scene === 'live', null, { timeout: 60_000 });
  await page.waitForFunction(() => Number(document.getElementById('hero')?.dataset.t) > 3, null, { timeout: 120_000 }); // the embers drift
  await page.addStyleTag({ content: '.site-header,header,.hero-inner,.hero-poster{visibility:hidden !important} .hero::after,.analytics-notice{display:none !important}' });
  const notice = await page.locator('.analytics-notice').evaluateAll(els => els.some(el => el.getBoundingClientRect().height > 0));
  if (notice) throw new Error('the analytics notice is still drawn: it would be baked into the poster');
  await page.waitForTimeout(500);
  const box = await hero.locator('canvas.hero-canvas').boundingBox();
  if (Math.round(box.width) !== 1440 || Math.round(box.height) !== 900) throw new Error(`the canvas is ${box.width}x${box.height}, not 1440x900`);
  await hero.locator('canvas.hero-canvas').screenshot({ path: out });
  await browser.close();
  console.log(`wrote ${out}`);
} finally {
  server.kill();
}
