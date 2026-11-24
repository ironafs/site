import { story } from '../../src/content/story.ts';
import { test, expect } from '@playwright/test';
import { enhanced, endpointProblems, pinnedAt, settle } from './util.mjs';

// How it works (#design): one diagram per OS, connectors from the boxes' real edges, tabs.
// Boxes: a .nd with no .nd inside; a container (Linux's ironafsd) counts by its
// padding band, which a wire to a box inside it may cross.

const OSES = ['linux', 'macos', 'windows'];
const PROGRAMS = Object.fromEntries(story.how.os.map(os => [os.os, os.programs]));
const HEADLINES = {
  linux: 'Linux gets /afs first.',
  macos: "On a Mac, Apple's FSKit carries the request.",
  windows: 'On Windows, IronAFS answers over SMB on the same PC.',
};
const KERNEL_NOTE = "below this line: only your operating system's own code";
const WIRES = {
  linux: ['a system call', '/dev/fuse · from the mount step', 'Rx over UDP'],
  macos: ['a system call', 'FSKit · per-user mount', 'local IPC', 'Rx over UDP'],
  windows: ['a UNC path', 'signed SMB 3.1.1 · loopback', 'local IPC', 'Rx over UDP'],
};

test('the ember follows each platform connector beneath its labels', async ({ page }) => {
  await page.goto('/');
  if (!(await enhanced(page)) || await page.locator('#design').evaluate(el => el.classList.contains('story--flow'))) test.skip();
  for (const [index, os] of OSES.entries()) {
    const wires = story.how.os[index].wires;
    for (let j = 0; j < wires.length; j++) {
      const step = j === 0 ? 1 : j === 1 ? 2 : j === wires.length - 1 ? 4 : 3;
      for (const fraction of [0.25, 0.5, 0.75]) {
        await pinnedAt(page, (index + (step - 1 + 0.06 + 0.88 * fraction) / 4) / 3);
        await settle(page);
        const result = await page.locator(`#design .scene[data-os="${os}"]`).evaluate((scene, wire) => {
          const dot = scene.querySelector(`.request-dot[data-wire="${wire}"]`);
          const path = scene.querySelector(`.connector[data-wire="${wire}"]`);
          const svg = path.ownerSVGElement;
          const rect = dot.getBoundingClientRect();
          const point = svg.createSVGPoint();
          point.x = (rect.left + rect.right) / 2; point.y = (rect.top + rect.bottom) / 2;
          const local = point.matrixTransform(svg.getScreenCTM().inverse());
          const length = path.getTotalLength();
          let distance = Infinity;
          for (let k = 0; k <= 1000; k++) {
            const p = path.getPointAtLength(length * k / 1000);
            distance = Math.min(distance, Math.hypot(p.x - local.x, p.y - local.y));
          }
          const label = scene.querySelector(`.wl[data-wire="${wire}"]`);
          return { distance, opacity: Number(getComputedStyle(dot).opacity), hidden: dot.getAttribute('aria-hidden'),
            labelAbove: Number(getComputedStyle(label).zIndex) > Number(getComputedStyle(dot).zIndex) };
        }, j);
        expect(result.distance, `${os} wire ${j}`).toBeLessThan(2);
        expect(result.opacity).toBeGreaterThan(0.9);
        expect(result.hidden).toBe('true');
        expect(result.labelAbove).toBe(true);
      }
    }
  }
});

/** Labels over boxes, and visible dots inside boxes, in the scene for `os`, under the shared contract's box rule. */
const overlapProblems = (page, os) => page.evaluate(os => {
  const scene = document.querySelector(`#design .scene[data-os="${os}"]`);
  const wires = JSON.parse(scene.dataset.wires);
  const nds = [...scene.querySelectorAll('.nd')];
  const visible = el => {
    let o = 1;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      o *= Number(cs.opacity);
    }
    return o;
  };
  // The boxes a wire's item must keep clear of: every leaf .nd, and every container except one holding an endpoint.
  const obstacles = j => {
    const ends = [document.getElementById(wires[j][0]), document.getElementById(wires[j][2])];
    return nds.filter(nd => {
      const leaf = !nd.querySelector('.nd');
      if (leaf) return true;
      return !ends.some(e => nd === e || nd.contains(e));
    });
  };
  const inter = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const out = { labels: [], dots: [], broken: [], visibleDots: 0, labelCount: 0 };
  for (const label of scene.querySelectorAll('.wl')) {
    const j = Number(label.dataset.wire);
    out.labelCount++;
    const r = label.getBoundingClientRect();
    // a label wraps between words only, never inside one, and its text stays inside its pill
    const text = label.firstChild;
    for (const m of text.textContent.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(text, m.index);
      range.setEnd(text, m.index + m[0].length);
      const lines = new Set([...range.getClientRects()].map(q => Math.round(q.top)));
      if (lines.size > 1) out.broken.push(`${os} "${label.textContent}": "${m[0]}" split over ${lines.size} lines`);
    }
    if (label.scrollWidth > label.clientWidth + 1) out.broken.push(`${os} "${label.textContent}" overflows its pill`);
    for (const nd of obstacles(j)) {
      // a container's own endpoint edge is allowed: only the containers that are not endpoints are obstacles here
      if (inter(r, nd.getBoundingClientRect())) out.labels.push(`${os} "${label.textContent}" over ${nd.id || nd.querySelector('b')?.textContent}`);
    }
  }
  for (const dot of scene.querySelectorAll('.request-dot')) {
    if (visible(dot) < 0.05) continue;
    out.visibleDots++;
    const j = Number(dot.dataset.wire);
    const d = dot.getBoundingClientRect();
    const cx = (d.left + d.right) / 2, cy = (d.top + d.bottom) / 2;
    for (const nd of obstacles(j)) {
      const b = nd.getBoundingClientRect();
      if (cx > b.left + 1 && cx < b.right - 1 && cy > b.top + 1 && cy < b.bottom - 1) out.dots.push(`${os} dot ${j} at (${cx.toFixed(0)}, ${cy.toFixed(0)}) in ${nd.id || nd.querySelector('b')?.textContent}`);
    }
    // the dot's own endpoint boxes, when they are leaves, are obstacles too (it fades as it reaches them)
    for (const id of [wires[j][0], wires[j][2]]) {
      const nd = document.getElementById(id);
      if (nd.querySelector('.nd')) continue;
      const b = nd.getBoundingClientRect();
      if (cx > b.left + 1 && cx < b.right - 1 && cy > b.top + 1 && cy < b.bottom - 1) out.dots.push(`${os} dot ${j} inside its endpoint ${id}`);
    }
  }
  return out;
}, os);

/** Boxes, labels and the status line outside their scene, and the active text or scene cut off by the viewport. */
const containment = (page, os) => page.evaluate(os => {
  const out = [];
  const scene = document.querySelector(`#design .scene[data-os="${os}"]`);
  const s = scene.getBoundingClientRect();
  for (const el of scene.querySelectorAll('.nd, .wl, .ostat, .uband, .kl, .kr')) {
    const r = el.getBoundingClientRect();
    if (r.left < s.left - 1 || r.right > s.right + 1 || r.top < s.top - 1 || r.bottom > s.bottom + 1) {
      out.push(`${el.className} "${el.textContent.trim().slice(0, 30)}" outside the scene`);
    }
  }
  const header = document.getElementById('site-header').getBoundingClientRect().bottom;
  for (const el of [document.getElementById(`panel-${os}`), scene]) {
    const r = el.getBoundingClientRect();
    if (r.top < header - 1 || r.bottom > innerHeight + 1) out.push(`${el.id || el.className} ${r.top.toFixed(0)}..${r.bottom.toFixed(0)} not within ${header.toFixed(0)}..${innerHeight}`);
  }
  return out;
}, os);

test.describe('desktop, enhanced', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    test.skip(!(await enhanced(page)), 'the enhancement is off here: the base layer is the contract');
  });

  // 761 px wide: a window taller than 900 px, where the closed text fits pinned in every engine (fit.ts; see below)
  for (const [width, height] of [[1440, 900], [1280, 720], [1728, 1000], [1100, 900], [761, 1080]]) {
    test(`at ${width} px: each OS at its 95% point has attached connectors, clear labels and its programs`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await expect(page.locator('#design')).not.toHaveClass(/story--flow/);
      for (const [i, os] of OSES.entries()) {
        await pinnedAt(page, (i + 0.95) / 3);
        await settle(page);
        expect(await endpointProblems(page), `${os} endpoints`).toEqual([]);
        const { labels, broken, labelCount } = await overlapProblems(page, os);
        expect(labelCount, `${os} has a label per wire`).toBeGreaterThanOrEqual(3);
        expect(labels).toEqual([]);
        expect(broken).toEqual([]);
        const scene = page.locator(`#design .scene[data-os="${os}"]`);
        await expect(scene).toBeVisible();
        await expect(scene.getByText(PROGRAMS[os])).toBeVisible();
        await expect(scene.locator('.g-ghost')).toHaveCount(0);
        await expect(scene.locator('.kr')).toHaveText(KERNEL_NOTE);
        await expect(scene.locator('.kr')).toBeVisible();
        await expect(scene.locator('.g-cells')).toHaveText('AFS servers');
        await expect(scene.locator('.wl')).toHaveText(WIRES[os]);
        if (width >= 1280 && os !== 'linux') {
          const lines = await scene.locator('.g-layer small, .g-daemon .chip').evaluateAll(els => els.flatMap(el => {
            if (el.matches('.chip') && el.textContent !== 'protocol clients') return [];
            const range = document.createRange();
            range.selectNodeContents(el);
            return [new Set([...range.getClientRects()].map(r => Math.round(r.top))).size];
          }));
          expect(lines).toHaveLength(2);
          await expect(scene.locator('.g-layer small'), 'layer sub-line').toBeVisible();
          expect(lines[0], 'layer sub-line').toBeGreaterThanOrEqual(1);
          expect(lines[0], 'layer sub-line').toBeLessThanOrEqual(3);
          expect(lines[1], 'protocol clients chip').toBe(1);
        }
        await expect(page.locator(`#panel-${os}`)).toHaveAttribute('aria-hidden', 'false');
        // the other scenes are hidden
        for (const other of OSES.filter(o => o !== os)) await expect(page.locator(`#design .scene[data-os="${other}"]`)).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow').toBe(true);
        expect(await containment(page, os), `${os}: every box inside its diagram, the text and the diagram on screen`).toEqual([]);
      }
    });
  }

  // At 761x900 the closed text is within a few pixels of its panel's height: whether it fits pinned depends on the
  // engine's text metrics (Chromium: 5 px short, flow; WebKit: fits, pinned). Either way the layout must be consistent.
  test('at 761x900 #design is pinned only when every closed text fits its panel; otherwise in flow, as the base layer (fit.ts)', async ({ page }) => {
    await page.setViewportSize({ width: 761, height: 900 });
    const design = page.locator('#design');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (await design.evaluate(el => el.classList.contains('story--flow'))) {
      expect(await design.evaluate(el => getComputedStyle(el.querySelector(':scope > .stage')).position)).not.toBe('sticky');
      await expect(design.locator('[role="tablist"]')).toBeHidden();
      await expect(design.locator('.osp[aria-hidden], .osp[inert], .scene[aria-hidden], .scene[inert]')).toHaveCount(0);
      await expect(design.locator('svg.wires, .wl, .request-dot')).toHaveCount(0);
    } else {
      expect(await design.evaluate(el => getComputedStyle(el.querySelector(':scope > .stage')).position)).toBe('sticky');
      const over = await design.locator('.osp').evaluateAll(els => els.map(el => el.scrollHeight - el.clientHeight));
      for (const o of over) expect(o).toBeLessThanOrEqual(1);
    }
  });

  test('each platform maps four scroll steps to one current bullet and progress marker', async ({ page }) => {
    for (const [i, os] of OSES.entries()) {
      for (let step = 1; step <= 4; step++) {
        await pinnedAt(page, (i + (step - 0.5) / 4) / 3);
        const design = page.locator('#design');
        await expect(design).toHaveAttribute('data-step', String(step));
        await expect(design).toHaveAttribute('data-platform', String(i));
        await expect(design.locator('.step-progress')).toHaveText(`step ${step} of 4`);
        const current = design.locator('.short > li.is-current');
        await expect(current).toHaveCount(step === 1 ? 0 : 1);
        if (step > 1) await expect(page.locator(`#panel-${os} .short > li`).nth(step - 2)).toHaveClass(/is-current/);
        await expect(design.locator('.scene[aria-hidden="false"]')).toHaveCount(1);
        const scene = design.locator(`.scene[data-os="${os}"]`);
        const selectors = [ '.g-prog, .g-os', os === 'linux' ? '.g-daemon, .g-daemon .inner:last-child' : '.g-layer', '.g-daemon, .g-daemon .inner:first-of-type', '.g-cells' ];
        const boxes = scene.locator(selectors[step - 1]);
        expect(await boxes.count()).toBeGreaterThan(0);
        await expect.poll(() => boxes.evaluateAll(els => els.every(el => getComputedStyle(el).borderTopColor === 'rgb(236, 138, 79)'))).toBe(true);
        const contrast = await scene.evaluate(root => {
          const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
          const luminance = color => {
            const channels = color.slice(0, 3).map(value => {
              const c = value / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
          };
          return [...root.querySelectorAll('.nd small, .nd .chip, .wl')].map(el => {
            const foreground = rgb(getComputedStyle(el).color);
            let background = [0, 0, 0], remaining = 1;
            for (let parent = el; parent && remaining > 0.001; parent = parent.parentElement) {
              const color = rgb(getComputedStyle(parent).backgroundColor);
              const alpha = color.length === 4 ? color[3] : 1;
              for (let i = 0; i < 3; i++) background[i] += (color[i] || 0) * alpha * remaining;
              remaining *= 1 - alpha;
            }
            const a = luminance(foreground), b = luminance(background);
            return { text: el.textContent, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), size: parseFloat(getComputedStyle(el).fontSize) };
          });
        });
        expect(contrast.filter(item => item.ratio < 4.5 || item.size < 12)).toEqual([]);
        const wire = scene.locator(`.connector[data-step="${step}"]`);
        if (step !== 3 || os !== 'linux') {
          await expect(wire).toHaveCount(1);
          await expect(wire).toHaveCSS('stroke', 'rgb(236, 138, 79)');
        }

      }
    }
  });

  test('clicking the macOS tab selects it and shows its panel', async ({ page }) => {
    await pinnedAt(page, 0.05);
    const tab = page.locator('#tab-macos');
    await expect(page.locator('#design [role="tablist"]')).toBeVisible();
    await expect(tab).toHaveAttribute('aria-selected', 'false');
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#panel-macos')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#panel-linux')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#tab-linux')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#design .scene[data-os="macos"]')).toBeVisible();
  });

  test('keyboard arrows move between the tabs', async ({ page }) => {
    await pinnedAt(page, 0.05);
    await page.locator('#tab-linux').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-macos')).toBeFocused();
    await expect(page.locator('#tab-macos')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-windows')).toBeFocused();
    await expect(page.locator('#tab-windows')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tab-macos')).toBeFocused();
    await expect(page.locator('#tab-macos')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-linux')).toBeFocused();
    await expect(page.locator('#tab-linux')).toHaveAttribute('aria-selected', 'true');
    // roving tabindex: only the selected tab is in the tab order
    expect(await page.locator('#design [role="tab"][tabindex="0"]').count()).toBe(1);
  });

  test('an arrow key selects its tab at once, focus ring shown, and holds it through the scroll', async ({ page }) => {
    await pinnedAt(page, 0.05);
    await page.locator('#tab-linux').focus();
    await page.keyboard.press('ArrowRight');
    const state = await page.evaluate(() => {
      const tab = document.activeElement;
      const s = getComputedStyle(tab);
      return { id: tab.id, tabIndex: tab.tabIndex, ring: s.outlineStyle !== 'none' || s.boxShadow !== 'none',
        linuxInert: document.getElementById('panel-linux').inert, macosInert: document.getElementById('panel-macos').inert };
    });
    expect(state).toEqual({ id: 'tab-macos', tabIndex: 0, ring: true, linuxInert: true, macosInert: false });
    // across two thirds (Linux to Windows) the selection never passes through macOS on the way
    await page.locator('#tab-macos').focus();
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-linux')).toHaveAttribute('aria-selected', 'true');
    await pinnedAt(page, 0.05);
    const seen = await page.evaluate(async () => {
      document.getElementById('tab-linux').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      const out = new Set();
      for (let i = 0; i < 40; i++) {
        out.add(document.querySelector('#design [role="tab"][aria-selected="true"]').id);
        await new Promise(r => requestAnimationFrame(r));
      }
      return [...out];
    });
    expect(seen).toEqual(['tab-windows']);
  });

  test('focus inside a panel that the scroll hides moves to the selected tab', async ({ page }) => {
    await pinnedAt(page, 0.1);
    const summary = page.locator('#panel-linux summary').first();
    await summary.focus();
    await expect(summary).toBeFocused();
    await pinnedAt(page, 0.5);
    await expect(page.locator('#panel-linux')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#tab-macos')).toBeFocused();
  });

  test('the step counter shows only while the tabs are on', async ({ page }) => {
    await pinnedAt(page, 0.1);
    await expect(page.locator('#design .step-progress')).toBeVisible();
    await page.evaluate(() => document.documentElement.classList.add('static'));
    await expect(page.locator('#design')).not.toHaveAttribute('data-tabs', 'on');
    await expect(page.locator('#design .step-progress')).toBeHidden();
  });

  test('resizing from 1440 to 1100 mid-section and back keeps the connectors on their boxes', async ({ page }) => {
    await pinnedAt(page, 0.5);
    await settle(page);
    expect(await endpointProblems(page)).toEqual([]);
    await page.setViewportSize({ width: 1100, height: 900 });
    await settle(page);
    expect(await endpointProblems(page), 'at 1100').toEqual([]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page);
    expect(await endpointProblems(page), 'back at 1440').toEqual([]);
  });

  test('switching to base mode with a scroll frame pending leaves no panel hidden', async ({ page }) => {
    await pinnedAt(page, 0.5);
    const hidden = await page.evaluate(async () => {
      const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // queue tabs.ts's scroll frame, then leave the enhancement before that frame runs
      scrollBy({ top: 40, behavior: 'instant' });
      dispatchEvent(new Event('scroll'));
      document.documentElement.classList.add('static');
      await frame();
      await frame();
      return [...document.querySelectorAll('#design .osp, #design .scene')]
        .filter(el => el.hasAttribute('aria-hidden') || el.inert).map(el => el.id || el.dataset.os);
    });
    expect(hidden).toEqual([]);
  });

  for (const [width, height] of [[1440, 900], [1280, 720], [1100, 900], [761, 1080]]) {
    test(`at ${width} px: with its disclosure open, each OS's text scrolls within the stage and the diagram stays on screen`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await expect(page.locator('#design')).not.toHaveClass(/story--flow/);
      for (const [i, os] of OSES.entries()) {
        await pinnedAt(page, (i + 0.95) / 3);
        // the platform change fades the panels in and out: click once the incoming panel has arrived
        await settle(page);
        await page.locator(`#panel-${os}`).evaluate(el => Promise.all(el.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished)));
        await page.locator(`#panel-${os} details > summary`).click();
        await settle(page);
        expect(await containment(page, os), `${os} open`).toEqual([]);
        const panel = page.locator(`#panel-${os}`);
        await expect(panel).toHaveAttribute('tabindex', '0');
        const result = await panel.evaluate(async el => {
          const cs = getComputedStyle(el);
          el.scrollTop = el.scrollHeight;
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const box = el.getBoundingClientRect();
          const last = [...el.querySelectorAll('details li')].pop().getBoundingClientRect();
          const cite = el.querySelector('.cite').getBoundingClientRect();
          return {
            scrolls: el.scrollHeight <= el.clientHeight + 1 || ['auto', 'scroll'].includes(cs.overflowY),
            lastIn: last.top >= box.top - 1 && last.bottom <= box.bottom + 1,
            citeIn: cite.top >= box.top - 1 && cite.bottom <= box.bottom + 1,
          };
        });
        expect(result, os).toEqual({ scrolls: true, lastIn: true, citeIn: true });
        expect(await endpointProblems(page), `${os} endpoints with the disclosure open`).toEqual([]);
      }
    });
  }

  const toBase = {
    '.static': page => page.evaluate(() => document.documentElement.classList.add('static')),
    'reduced motion': page => page.emulateMedia({ reducedMotion: 'reduce' }),
  };
  for (const [name, toggle] of Object.entries(toBase)) {
    test(`switching to base mode (${name}) unhides every panel, hides the tablist and leaves all three texts reachable`, async ({ page }) => {
      await pinnedAt(page, 0.5);
      await expect(page.locator('#panel-linux')).toHaveAttribute('aria-hidden', 'true');
      await toggle(page);
      await expect(page.locator('#design [role="tablist"]')).toBeHidden();
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#design .osp, #design .scene')]
        .filter(el => el.hasAttribute('aria-hidden') || el.hasAttribute('inert') || el.inert).length)).toBe(0);
      expect(await page.locator('#design svg.wires, #design .wl, #design .request-dot').count()).toBe(0);
      // the snapshot is YAML: an apostrophe in a single-quoted line is written twice
      const tree = (await page.locator('#design').ariaSnapshot()).replaceAll("''", "'");
      for (const os of OSES) {
        expect(tree).toContain(HEADLINES[os]);
        expect(tree).toContain(PROGRAMS[os]);
      }
    });
  }
});

test.describe('phone (390 px) and base layer', () => {
  test('three scenes stacked, each below its OS heading and text; no tablist; no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#design [role="tablist"]')).toBeHidden();
    // no step counter for an interaction this layout does not have
    await expect(page.locator('#design .step-progress')).toBeHidden();
    const scenes = page.locator('#design .scene');
    await expect(scenes).toHaveCount(3);
    const layout = await page.evaluate(() => [...document.querySelectorAll('#design .how-os')].map(block => {
      const scene = block.querySelector('.scene').getBoundingClientRect();
      const h2 = block.querySelector('.osp h2');
      const text = block.querySelector('.osp').getBoundingClientRect();
      return { os: block.dataset.os, headline: h2.textContent.trim(), textBottom: text.bottom, sceneTop: scene.top, sceneBottom: scene.bottom, left: scene.left, right: scene.right };
    }));
    expect(layout.map(l => l.os)).toEqual(OSES);
    for (const [i, l] of layout.entries()) {
      expect(l.headline).toBe(HEADLINES[l.os]);
      expect(l.textBottom, `${l.os}: text above its diagram`).toBeLessThanOrEqual(l.sceneTop + 1);
      expect(l.left).toBeGreaterThanOrEqual(0);
      expect(l.right).toBeLessThanOrEqual(390);
      if (i > 0) expect(l.sceneTop, 'stacked').toBeGreaterThan(layout[i - 1].sceneBottom);
    }
    for (const os of OSES) await expect(page.locator(`#design .scene[data-os="${os}"]`).getByText(PROGRAMS[os])).toBeAttached();
    // reading order follows the request's path: programs, kernel, platform layer, ironafsd, cells
    const order = await page.evaluate(() => [...document.querySelectorAll('#design .scene')].map(scene =>
      [...scene.querySelectorAll('.nd:not(.inner)')].map(nd => nd.id)));
    expect(order).toEqual([
      ['sc-l-prog', 'sc-l-os', 'sc-l-daemon', 'sc-l-cells'],
      ['sc-m-prog', 'sc-m-os', 'sc-m-layer', 'sc-m-daemon', 'sc-m-cells'],
      ['sc-w-prog', 'sc-w-os', 'sc-w-layer', 'sc-w-daemon', 'sc-w-cells'],
    ]);
    // and the visual order is the DOM order
    const tops = await page.evaluate(() => [...document.querySelectorAll('#design .scene')].map(scene =>
      [...scene.querySelectorAll('.nd:not(.inner)')].map(nd => nd.getBoundingClientRect().top)));
    for (const t of tops) expect(t).toEqual([...t].sort((a, b) => a - b));
    // The base diagrams show the same boundary labels as the pinned diagrams.
    for (const os of OSES) {
      const scene = page.locator(`#design .scene[data-os="${os}"]`);
      await expect(scene.locator('.kl')).toHaveText('KERNEL');
      await expect(scene.locator('.kl')).toBeVisible();
      await expect(scene.locator('.kr')).toHaveText(KERNEL_NOTE);
      await expect(scene.locator('.kr')).toBeVisible();
      await expect(scene.locator('.g-ghost')).toHaveCount(0);
    }
    expect(await page.locator('#design svg.wires, #design .request-dot').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => [...document.querySelectorAll('#design .osp, #design .scene')].filter(el => el.hasAttribute('aria-hidden') || el.inert).length)).toBe(0);
  });

  test('each disclosure has the administrator label', async ({ page }) => {
    await page.goto('/');
    const summaries = page.locator('#design details > summary');
    await expect(summaries).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(summaries.nth(i)).toHaveText(story.how.detailsLabel);
  });
});

test('settled design panels keep labels legible and tabs usable', async ({ page }) => {
  await page.goto('/');
  if (!(await enhanced(page)) || await page.locator('#design').evaluate(el => el.classList.contains('story--flow'))) test.skip();
  for (const fraction of [0.2, 0.53, 0.87]) {
    await pinnedAt(page, fraction);
    await settle(page);
    const measurements = await page.locator('#design').evaluate(root => {
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility === 'visible';
      const labels = [...root.querySelectorAll('.scene:not([aria-hidden="true"]) :is(.nd small, .wl, .uband, .kl, .kr, .ostat)')].filter(visible);
      const body = [...root.querySelectorAll('.osp:not([aria-hidden="true"]) :is(.lede, li)')].filter(visible);
      const tabs = [...root.querySelectorAll('.tab')].filter(visible);
      return {
        labels: labels.map(el => ({ size: parseFloat(getComputedStyle(el).fontSize), opacity: Number(getComputedStyle(el).opacity) })),
        body: body.map(el => parseFloat(getComputedStyle(el).fontSize)),
        tabs: tabs.map(el => el.getBoundingClientRect().height),
      };
    });
    expect(measurements.labels.length).toBeGreaterThan(0);
    expect(measurements.labels.every(label => label.size >= 12 && label.opacity >= 0.99)).toBe(true);
    expect(measurements.body.every(size => size >= 15)).toBe(true);
    expect(measurements.tabs.every(height => height >= 44)).toBe(true);
  }
  await expect(page.locator('#design .tabs-cue')).toBeVisible();
});

// Inline code in body-size prose keeps the 15 px body floor (base.css): the administrator details' commands and paths,
// opened, in every panel, and every other code in a body-size paragraph or list item of the page, in any layout.
test('inline code in body-size prose is at least 15 px, the administrator details included', async ({ page }) => {
  await page.goto('/');
  const got = await page.evaluate(() => {
    for (const d of document.querySelectorAll('#design details')) d.open = true;
    const size = el => parseFloat(getComputedStyle(el).fontSize);
    const all = [...document.querySelectorAll('main :is(p, li) > code')].filter(c => size(c.parentElement) >= 15);
    return {
      details: [...document.querySelectorAll('#design details li code')].map(c => [c.textContent, size(c)]),
      small: all.filter(c => size(c) < 15).map(c => `${c.textContent}: ${size(c)} px in ${size(c.parentElement)} px`),
      count: all.length,
    };
  });
  expect(got.details.length, 'the details hold inline code').toBeGreaterThanOrEqual(4);
  for (const [text, px] of got.details) expect(px, text).toBeGreaterThanOrEqual(15);
  expect(got.count).toBeGreaterThan(got.details.length);
  expect(got.small).toEqual([]);
});
