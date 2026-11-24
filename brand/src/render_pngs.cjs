// Render the brand SVGs to PNGs with headless Chrome (the reference renderer for the SVG filters),
// then build favicon.ico with ImageMagick. Run: node render_pngs.cjs  (needs Playwright and `magick`)
// `node render_pngs.cjs og [out.png]` renders only the social preview card (to icons/og-image.png, or `out.png`).
// The card's words are the site's own (src/content/site.ts: its headline and tagline) and say what IronAFS plans,
// not what it does: no client is released yet. Its fonts are the site's self-hosted ones (@fontsource).
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const BRAND = path.resolve(__dirname, '..');
const SVG = path.join(BRAND, 'svg');
const PNG = path.join(BRAND, 'png');
const ICONS = path.join(BRAND, 'icons');
const url = f => 'file://' + path.join(SVG, f);
const BG = '#0d0e10';

function viewBox(file){ const m = fs.readFileSync(path.join(SVG, file), 'utf8').match(/viewBox="([^"]+)"/); const [, , w, h] = m[1].split(/\s+/).map(Number); return w / h; }

async function shot(page, html, w, h, out, transparent = true){
  await page.setViewportSize({ width: w, height: h });
  await page.goto('file://' + path.join(BRAND, 'src', '.render.html'));
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  console.log(path.relative(BRAND, out), `${w}x${h}`);
}
const page0 = (inner, bg = 'transparent') => `<html><body style="margin:0;background:${bg};overflow:hidden">${inner}</body></html>`;
const FONTS = path.resolve(BRAND, '..', 'node_modules', '@fontsource');
const fontFace = (family, pkg, weight) => `@font-face{font-family:'${family}';font-weight:${weight};src:url('file://${path.join(FONTS, pkg, 'files', `${pkg}-latin-${weight}-normal.woff2`)}') format('woff2')}`;

/** The social preview card (Open Graph / Twitter), 1200x630. */
const PLATFORMS = 'Planned: FUSE on Linux, FSKit on macOS and, if testing passes, SMB on Windows.';
async function renderOg(page, out){
  const { site } = await import(path.resolve(BRAND, '..', 'src', 'content', 'site.ts'));
  const r = viewBox('ironafs-logo-on-dark.svg');
  const og = page0(`<style>${fontFace('Space Grotesk', 'space-grotesk', 700)}${fontFace('JetBrains Mono', 'jetbrains-mono', 500)}</style>
      <div style="width:1200px;height:630px;box-sizing:border-box;padding:0 90px;display:flex;flex-direction:column;justify-content:center;gap:38px;
      background:radial-gradient(ellipse at 50% 38%, #1d1f24 0%, ${BG} 62%);font-family:'Space Grotesk',system-ui,sans-serif">
      <img src="${url('ironafs-logo-on-dark.svg')}" style="width:900px;height:${Math.round(900/r)}px;align-self:center">
      <div style="text-align:center;color:#ece8e3;font-size:44px;font-weight:700;letter-spacing:-.01em">${site.headline}</div>
      <div style="text-align:center;color:#a9a49d;font-size:24px;line-height:1.45;font-family:system-ui,sans-serif;margin-top:-22px">${site.tagline}<br>${PLATFORMS}</div>
      <div style="text-align:center;color:#d8662a;font-family:'JetBrains Mono',monospace;font-size:24px">ironafs.org</div></div>`, BG);
  await shot(page, og, 1200, 630, out, false);
}

(async () => {
  if (process.argv[2] === 'og') {
    fs.writeFileSync(path.join(BRAND, 'src', '.render.html'), '<html></html>');
    const browser = await chromium.launch({ channel: 'chrome' });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await renderOg(page, path.resolve(process.argv[3] ?? path.join(ICONS, 'og-image.png')));
    await browser.close();
    fs.unlinkSync(path.join(BRAND, 'src', '.render.html'));
    return;
  }
  for (const d of [PNG, ICONS]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(BRAND, 'src', '.render.html'), '<html></html>');
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  // wordmarks, transparent, for dark and for light backgrounds
  for (const theme of ['on-dark', 'on-light']){
    const f = `ironafs-logo-${theme}.svg`, r = viewBox(f);
    for (const w of [512, 1024, 2048, 4096]){
      const h = Math.round(w / r);
      await shot(page, page0(`<img src="${url(f)}" style="display:block;width:${w}px;height:${h}px">`), w, h, path.join(PNG, `ironafs-logo-${theme}-${w}.png`));
    }
  }
  // the mark alone, transparent
  for (const [f, name] of [['ironafs-mark.svg', 'ironafs-mark'], ['ironafs-mark-on-light.svg', 'ironafs-mark-on-light']])
    for (const s of [128, 256, 512, 1024, 2048])
      await shot(page, page0(`<img src="${url(f)}" style="display:block;width:${s}px;height:${s}px">`), s, s, path.join(PNG, `${name}-${s}.png`));

  // favicon PNGs from the simplified mark (transparent), then favicon.ico (16, 32, 48)
  for (const s of [16, 32, 48])
    await shot(page, page0(`<img src="${url('ironafs-mark-small.svg')}" style="display:block;width:${s}px;height:${s}px">`), s, s, path.join(ICONS, `favicon-${s}.png`));
  execFileSync('magick', ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'favicon.ico'], { cwd: ICONS });
  console.log('icons/favicon.ico 16+32+48');

  // Apple touch icon: iOS fills transparency with black and rounds the corners itself, so: solid dark square, mark at 72%
  const tile = (s, frac, file = 'ironafs-mark.svg') => page0(`<div style="width:${s}px;height:${s}px;display:grid;place-items:center;background:radial-gradient(circle at 50% 42%, #1f2126, ${BG} 70%)"><img src="${url(file)}" style="width:${Math.round(s*frac)}px;height:${Math.round(s*frac)}px"></div>`);
  await shot(page, tile(180, .72), 180, 180, path.join(ICONS, 'apple-touch-icon.png'), false);
  // Android / PWA: plain icons, and maskable ones whose mark stays inside the 80% safe circle
  for (const s of [192, 512]){
    await shot(page, tile(s, .74), s, s, path.join(ICONS, `icon-${s}.png`), false);
    await shot(page, tile(s, .56), s, s, path.join(ICONS, `icon-maskable-${s}.png`), false);
  }

  await renderOg(page, path.join(ICONS, 'og-image.png'));

  await browser.close();
  fs.unlinkSync(path.join(BRAND, 'src', '.render.html'));
})();
