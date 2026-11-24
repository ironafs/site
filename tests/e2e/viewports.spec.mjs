import { test, expect } from '@playwright/test';

const sections = ['hero', 'why', 'numbers', 'cost', 'platforms', 'design', 'rust'];
// Baseline from the desktop layout. The wrapped Rust source links previously sent that section into
// flow at 1680x931 and 1728x1000. At 1280x600 the enhancement is off entirely.
const flowAt = {
  '1280x600': [],
  '1366x657': [], // #design fits snug (fit.ts)
  '1536x730': [],
  '1440x789': [],
  '1470x838': [],
  '1512x864': [],
  '1680x931': [],
  '1728x1000': [],
  '1920x960': [],
  '2560x1320': [],
  '1024x700': ['design', 'rust'],
};

for (const [size, flow] of Object.entries(flowAt)) {
  test(`story pinning at ${size}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'the desktop Chromium viewport matrix');
    const [width, height] = size.split('x').map(Number);
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem('ironafs-analytics-choice-v1', '{"value":"denied"}'));
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const layout = await page.evaluate(ids => Object.fromEntries(ids.map(id => {
      const section = document.getElementById(id);
      const moving = id === 'hero' ? section : section.querySelector(id === 'cost' ? '.scard' : ':scope > .stage');
      const guard = id === 'hero' ? section.parentElement : id === 'cost' ? section.querySelector('.stack') : section;
      return [id, {
        pinned: getComputedStyle(moving).position === 'sticky',
        flow: guard.matches('.story--flow, .stack--flow'),
      }];
    })), sections);
    info.annotations.push({ type: 'layout', description: JSON.stringify(layout) });
    expect(layout).toEqual(Object.fromEntries(sections.map(id => [id, {
      pinned: height >= 620 && !flow.includes(id),
      flow: flow.includes(id),
    }])));
  });
}
