import { test, expect } from '@playwright/test';

// The intro sequence, asserted on the scene clock (data-t, the ?test hook), never wall-clock:
// software GL is slow, the scene clock only runs as fast as the frames do.
const CHIP_ALONE = 1.05;
const LETTER_GAP = 0.24;
const FALL = 1.35;
const HEAT_AT = CHIP_ALONE + 6 * LETTER_GAP + FALL;
const WARM_UP = 1.96;

const noWebgl = () => test.info().project.name === 'chromium-nowebgl';
const hero = page => page.locator('#hero');
const clock = async page => Number(await hero(page).getAttribute('data-t'));
const boxes = async page => ({
  letters: JSON.parse(await hero(page).getAttribute('data-letters')),
  canvas: JSON.parse(await hero(page).getAttribute('data-canvas')),
});
// Wall-clock waits are generous: on a 2-core CI runner software GL runs a 1440x900 scene at ~0.1 s of scene time per
// second (the melt, 6.5 s of scene time, came after more than 45 s). The assertions themselves are on the scene clock.
const SLOW = 240_000;
const inside = (box, canvas, pad = 0) => box[0] >= canvas[0] - pad && box[2] <= canvas[2] + pad && box[1] >= canvas[1] - pad && box[3] <= canvas[3] + pad;

test.beforeEach(() => {
  test.skip(noWebgl(), 'needs WebGL');
});

test('phases run chip, drop, heating, melt in order on the scene clock', async ({ page }) => {
  test.setTimeout(SLOW + 30_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__phases = [];
    window.addEventListener('DOMContentLoaded', () => {
      const h = document.getElementById('hero');
      new MutationObserver(() => {
        const p = h.dataset.phase;
        if (window.__phases[window.__phases.length - 1] !== p) window.__phases.push(p);
      }).observe(h, { attributes: true, attributeFilter: ['data-phase'] });
    });
  });
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-t-melt', /.+/, { timeout: SLOW });
  const attr = async name => Number(await hero(page).getAttribute(name));
  expect(await attr('data-t-chip')).toBeLessThan(0.5);
  expect(Math.abs((await attr('data-t-drop')) - CHIP_ALONE)).toBeLessThan(0.5);
  const heatAt = await attr('data-t-heating');
  expect(Math.abs(heatAt - HEAT_AT)).toBeLessThan(0.35);
  expect(Math.abs((await attr('data-t-melt')) - heatAt - WARM_UP)).toBeLessThan(0.2);
  const phases = await page.evaluate(() => window.__phases);
  expect(phases.slice(0, 4)).toEqual(['chip', 'drop', 'heating', 'melt']);
  expect(errors).toEqual([]);
});

test('resize 390x844 -> 844x390 during the drop keeps every letter inside the canvas and none through the chip', async ({ page }) => {
  test.setTimeout(2 * SLOW);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-phase', 'drop', { timeout: SLOW });
  await page.setViewportSize({ width: 844, height: 390 });
  // While the letters fall they are always inside the canvas sideways; each one is whole inside it (both axes)
  // as soon as it has landed. Sampled across the whole drop, after the resize.
  let samples = 0;
  const landedSeen = new Set();
  await expect.poll(async () => {
    const { letters, canvas } = await boxes(page);
    expect(letters).toHaveLength(7);
    letters.forEach((b, i) => {
      expect(b[0] >= canvas[0] - 1 && b[2] <= canvas[2] + 1, `letter ${i} ${b} sideways in ${canvas}`).toBe(true);
      if (b[4]) { landedSeen.add(i); expect(inside(b, canvas, 1), `landed letter ${i} ${b} inside ${canvas}`).toBe(true); }
    });
    samples++;
    return (await clock(page)) >= CHIP_ALONE + 6 * LETTER_GAP + FALL + 0.1;
  }, { timeout: SLOW, intervals: [50] }).toBe(true);
  expect(samples).toBeGreaterThan(3);
  const { letters, canvas } = await boxes(page);
  for (const b of letters) expect(inside(b, canvas, 1), `${b} inside ${canvas}`).toBe(true);
  expect(letters.every(b => b[4] === 1)).toBe(true);
  // measured from the rendered meshes every frame (the lowest point of each letter against the chip's rendered top under it):
  // never below the chip, and the letters do rest on it (a gap near 0, not hovering)
  const clear = Number(await hero(page).getAttribute('data-min-clear'));
  expect(clear).toBeGreaterThanOrEqual(-0.001);
  expect(clear).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test('the pointer light stays off over the empty floor and the chip, and warms only over a letter', async ({ page }) => {
  test.skip(test.info().project.use.isMobile, 'a pointer test');
  test.setTimeout(SLOW + 60_000);
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-phase', 'melt', { timeout: SLOW });
  const { letters } = await boxes(page);
  const a = letters[4]; // the A
  const cx = (a[0] + a[2]) / 2, cy = (a[1] + a[3]) / 2;
  const forge = async () => Number(await hero(page).getAttribute('data-forge'));
  for (const [x, y] of [[cx, a[3] + 70], [cx, a[3] + 140], [120, a[3] + 160], [cx, a[1] - 20]]) { // chip face, floor, off to the side, above the word
    await page.mouse.move(x, y); // one jump: the path never crosses a letter
    await page.waitForTimeout(400);
    expect(await forge(), `at ${x},${y}`).toBe(0);
  }
  const f = letters[5]; // the F: its stem is solid
  await page.mouse.move(f[0] + (f[2] - f[0]) * 0.1, (f[1] + f[3]) / 2);
  await expect.poll(forge, { timeout: 60_000 }).toBeGreaterThan(0.05);
});

test('a module factory that throws (the chip label cannot be drawn) falls back to the poster and a complete console, no page error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === '2d' && this.width === 2048) throw new Error('boom'); // only the chip's label canvas
      return getContext.call(this, type, ...rest);
    };
  });
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled', { timeout: 20_000 });
  await page.waitForTimeout(500);
  await expect(page.locator('#hero canvas')).toHaveCount(0);
  await expect(hero(page)).not.toHaveAttribute('data-scene', /.*/);
  expect(await page.locator('#console-typed .line').count()).toBe(4);
  expect(errors).toEqual([]);
});

for (const width of [1440, 1728]) {
  test(`opening console has no adjacent identity prose at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('.hero-identity')).toHaveCount(0);
  });
}
