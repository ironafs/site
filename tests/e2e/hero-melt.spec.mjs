import { test, expect } from '@playwright/test';

// The melt, the fused metal and the embers, asserted through the ?test hook on the
// scene clock (data-t), never wall-clock: software GL runs a few frames a second.
const noWebgl = () => test.info().project.name === 'chromium-nowebgl';
const hero = page => page.locator('#hero');
const clock = async page => Number(await hero(page).getAttribute('data-t'));
// Wall-clock waits are generous: on a 2-core CI runner software GL runs a 1440x900 scene at ~0.1 s of scene time per
// second. The assertions themselves are on the scene clock.
const SLOW = 240_000;
const embers = async page => JSON.parse(await hero(page).getAttribute('data-embers')); // [opacity, mean stir speed]

test.beforeEach(() => {
  test.skip(noWebgl(), 'needs WebGL');
});

test('no embers and an empty console (the caret only) before the melt; after cooling no pool is drawn and every letter stands on the floor', async ({ page }) => {
  test.setTimeout(3 * SLOW);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__emberBeforeMelt = 0;
    window.__samplesBeforeMelt = 0;
    window.addEventListener('DOMContentLoaded', () => {
      const h = document.getElementById('hero');
      new MutationObserver(() => {
        if (!h.dataset.embers || h.dataset.tMelt) return;
        window.__emberBeforeMelt = Math.max(window.__emberBeforeMelt, JSON.parse(h.dataset.embers)[0]);
        window.__samplesBeforeMelt++;
        const typed = document.getElementById('console-typed');
        window.__typedBeforeMelt = Math.max(window.__typedBeforeMelt ?? 0, typed.textContent.length);
        window.__caretBeforeMelt = !!typed.querySelector('.caret');
      }).observe(h, { attributes: true, attributeFilter: ['data-embers'] });
    });
  });
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-t-melt', /.+/, { timeout: SLOW });
  expect(await page.evaluate(() => window.__samplesBeforeMelt)).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__emberBeforeMelt)).toBe(0);
  // with a live scene the console types when the melt starts
  expect(await page.evaluate(() => window.__typedBeforeMelt)).toBe(0);
  expect(await page.evaluate(() => window.__caretBeforeMelt)).toBe(true);
  // the embers fade in over 2.5 s from the melt
  const meltT = Number(await hero(page).getAttribute('data-t-melt'));
  await expect.poll(() => clock(page), { timeout: SLOW }).toBeGreaterThan(meltT + 2.6);
  expect((await embers(page))[0]).toBeGreaterThan(0.5);
  expect(await page.locator('#console-typed').evaluate(el => el.textContent.length)).toBeGreaterThan(0);
  // while it melts, the pool is drawn
  expect(await hero(page).getAttribute('data-pool')).toBe('1');

  await expect(hero(page)).toHaveAttribute('data-phase', 'cooled', { timeout: SLOW });
  const meltEnd = Number(await hero(page).getAttribute('data-melt-end'));
  const cooledT = Number(await hero(page).getAttribute('data-t-cooled'));
  expect(Math.abs(cooledT - (meltT + meltEnd + 3.5))).toBeLessThan(0.25);
  await expect.poll(() => clock(page)).toBeGreaterThan(cooledT + 0.2);
  expect(await hero(page).getAttribute('data-pool')).toBe('0');
  const bases = JSON.parse(await hero(page).getAttribute('data-base'));
  expect(bases).toHaveLength(7);
  for (const y of bases) expect(Math.abs(y), `letter base ${bases}`).toBeLessThanOrEqual(0.01);
  // the scene stays live at rest
  await expect(hero(page)).toHaveAttribute('data-scene', 'live');
  expect(errors).toEqual([]);
});

test('the pointer stirs the embers, and they settle within 3 s of scene time', async ({ page }) => {
  test.skip(test.info().project.use.isMobile, 'a pointer test');
  test.setTimeout(2 * SLOW);
  await page.addInitScript(() => localStorage.setItem('ironafs-intro-seen', '1')); // a return visit: the finished state, embers on
  await page.goto('/?test');
  await expect(hero(page)).toHaveAttribute('data-scene', 'live', { timeout: 30_000 });
  await expect.poll(async () => (await embers(page))[0], { timeout: 60_000 }).toBeGreaterThan(0.5);
  const calm = (await embers(page))[1];
  expect(calm).toBeLessThan(0.05);
  const box = await page.locator('#hero canvas.hero-canvas').boundingBox();
  // sweep across the canvas a few times, through the air above and around the word
  let peak = 0;
  for (let pass = 0; pass < 4; pass++) {
    const y = box.y + box.height * (0.3 + pass * 0.12);
    for (let k = 0; k <= 24; k++) {
      await page.mouse.move(box.x + box.width * (pass % 2 ? 1 - k / 24 : k / 24), y);
      await page.waitForTimeout(25);
      peak = Math.max(peak, (await embers(page))[1]);
    }
  }
  // the mean over every ember: only those near the pointer's path move, so a few hundredths is a strong stir
  expect(peak, 'the stir speed rose while the pointer passed').toBeGreaterThan(0.03);
  await page.mouse.move(box.x + box.width / 2, 4); // off the canvas (over the header): nothing stirs the air
  const stopped = await clock(page);
  await expect.poll(() => clock(page), { timeout: SLOW }).toBeGreaterThan(stopped + 3);
  expect((await embers(page))[1], 'settled within 3 s').toBeLessThan(Math.max(0.02, peak * 0.02));
});
