import { shell as shellCopy } from '../../src/content/shell.ts';
import { site } from '../../src/content/site.ts';
import { test, expect } from '@playwright/test';

// The hidden shell: `/` (not while typing in a field) or the header's `/` key opens a small
// terminal under the header; a labelled dialog with a labelled input, closed with Esc, focus back where it was.
// Not offered on touch devices.
async function ready(page, path = '/') {
  // the header is under test, not the hero (menu.spec.mjs does the same)
  await page.route(/\/_astro\/scene\.[^/]*\.js$/, route => route.abort());
  await page.route(/github\.com/, route => route.abort());
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', e => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto(path);
  await page.waitForSelector('html[data-shell-ready]');
}

const shell = page => page.locator('#shell');
const input = page => page.locator('#shell-input');
const lastLine = page => page.locator('#shell-log > :last-child');

/** A jump has already reached its destination and stays there for the next 100 ms. */
async function settledTop(page, id) {
  const first = await page.evaluate(i => document.getElementById(i).getBoundingClientRect().top, id);
  await page.waitForTimeout(100);
  const last = await page.evaluate(i => document.getElementById(i).getBoundingClientRect().top, id);
  expect(Math.abs(first - last)).toBeLessThanOrEqual(1);
  return last;
}

async function run(page, command) {
  await input(page).fill(command);
  await input(page).press('Enter');
}

test.describe('the shell (desktop)', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'desktop only');
  });

  test('`/` opens a labelled dialog with a labelled, focused input; Esc closes it and focus returns', async ({ page }) => {
    await ready(page);
    await expect(shell(page)).toBeHidden();
    await page.locator('.site-nav a').first().focus();
    await page.keyboard.press('/');
    await expect(shell(page)).toBeVisible();
    await expect(shell(page)).toHaveAttribute('aria-label', /shell/i);
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveAccessibleName(/command/i);
    await expect(input(page)).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(shell(page)).toBeHidden();
    await expect(page.locator('.site-nav a').first()).toBeFocused();
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });

  test('the `/` key button is in the header, a 44 px target, and toggles the shell', async ({ page }) => {
    await ready(page);
    const key = page.locator('#shell-key');
    await expect(key).toBeVisible();
    await expect(key).toHaveAccessibleName(/shell/i);
    await expect(key).toHaveAttribute('aria-controls', 'shell');
    await expect(key).toHaveAttribute('aria-expanded', 'false');
    const box = await key.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    // in the header, between the section links and the GitHub button
    const order = await page.evaluate(() => {
      const nav = document.querySelector('.site-nav'), key = document.getElementById('shell-key'), gh = document.querySelector('.github');
      return [nav.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING, key.compareDocumentPosition(gh) & Node.DOCUMENT_POSITION_FOLLOWING];
    });
    expect(order.every(Boolean)).toBe(true);
    await key.click();
    await expect(shell(page)).toBeVisible();
    await expect(key).toHaveAttribute('aria-expanded', 'true');
    await expect(input(page)).toBeFocused();
    // under the header
    const header = await page.locator('#site-header').boundingBox();
    const panel = await shell(page).boundingBox();
    expect(panel.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    await key.click();
    await expect(shell(page)).toBeHidden();
    await expect(key).toHaveAttribute('aria-expanded', 'false');
    await expect(key).toBeFocused();
  });

  test('keyboard only: Tab reaches the key, Enter opens it, `exit` closes it', async ({ page }) => {
    await ready(page);
    await page.locator('#shell-key').focus();
    await page.keyboard.press('Enter');
    await expect(input(page)).toBeFocused();
    await run(page, 'exit');
    await expect(shell(page)).toBeHidden();
    await expect(page.locator('#shell-key')).toBeFocused();
  });

  test('`/` does nothing while typing in a field', async ({ page }) => {
    await ready(page);
    await page.locator('#shell-key').click();
    await input(page).type('a/b');
    await expect(input(page)).toHaveValue('a/b');
    await page.keyboard.press('Escape');
    await expect(page.locator('#shell-key')).toHaveAttribute('aria-expanded', 'false');
    // a field outside the shell
    await page.evaluate(() => {
      const field = document.createElement('input');
      field.id = 'probe';
      field.setAttribute('aria-label', 'probe');
      document.querySelector('main').prepend(field);
    });
    await page.locator('#probe').focus();
    await page.keyboard.type('/x');
    await expect(page.locator('#probe')).toHaveValue('/x');
    await expect(shell(page)).toBeHidden();
  });

  // WCAG 2.1.4: the single-character shortcut can be turned off, and stays off on the next visit;
  // the header's / key still opens the shell, where `keys on` turns it back on.
  test('keys off turns the / shortcut off across a reload; the / key still opens the shell; keys on restores it', async ({ page }) => {
    await ready(page);
    await page.keyboard.press('/');
    await run(page, 'keys off');
    await expect(lastLine(page)).toHaveText(shellCopy.keysOff);
    await page.keyboard.press('Escape');
    await expect(shell(page)).toBeHidden();
    await page.reload();
    await page.waitForSelector('html[data-shell-ready]');
    await page.keyboard.press('/');
    await page.waitForTimeout(300);
    await expect(shell(page)).toBeHidden();
    await page.locator('#shell-key').click();
    await expect(shell(page)).toBeVisible();
    await run(page, 'keys on');
    await expect(lastLine(page)).toHaveText(shellCopy.keysOn);
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForSelector('html[data-shell-ready]');
    await page.keyboard.press('/');
    await expect(shell(page)).toBeVisible();
  });

  test('keys with storage blocked: off lasts for the page, and nothing throws', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    });
    await ready(page);
    await page.keyboard.press('/');
    await expect(shell(page)).toBeVisible();
    await run(page, 'keys off');
    await page.keyboard.press('Escape');
    await expect(shell(page)).toBeHidden();
    await page.evaluate(() => document.activeElement?.blur()); // out of the shell's input, where `/` is typing
    await page.keyboard.press('/');
    await page.waitForTimeout(300);
    await expect(shell(page)).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('help, ls, pwd, the jokes and unknown commands answer as spec 6.3 says', async ({ page }) => {
    await ready(page);
    await page.keyboard.press('/');
    await run(page, 'help');
    // `keys off` and `keys on` added
    await expect(lastLine(page)).toHaveText(shellCopy.help);
    await run(page, 'ls');
    // exactly, two spaces apart (toHaveText would fold the spaces)
    await expect.poll(() => lastLine(page).evaluate(el => el.textContent)).toBe('why  what  design  status  built  follow');
    await run(page, 'pwd');
    await expect(lastLine(page)).toHaveText('/afs');
    await run(page, 'insmod afs.ko');
    await expect(lastLine(page)).toHaveText(shellCopy.module);
    await run(page, 'modprobe afs');
    await expect(lastLine(page)).toHaveText(shellCopy.module);
    await run(page, 'kextload afs.kext');
    await expect(lastLine(page)).toHaveText(shellCopy.module);
    await run(page, 'sudo rm -rf /');
    await expect(lastLine(page)).toHaveText(shellCopy.sudo);
    await run(page, 'frobnicate');
    await expect(lastLine(page)).toHaveText(shellCopy.unknown);
    await run(page, 'cat README');
    await expect(lastLine(page)).toHaveText(site.tagline);
    // each command is echoed after its prompt
    await expect(page.locator('#shell-log')).toContainText(`${shellCopy.initialPrompt} frobnicate`);
  });

  test('completion, history, outside click and terminal commands', async ({ page }) => {
    await ready(page);
    await page.keyboard.press('/');
    await input(page).press('Tab');
    await expect(input(page)).not.toBeFocused();
    await input(page).focus();
    await input(page).fill('who');
    await input(page).press('Tab');
    await expect(input(page)).toHaveValue('whoami');
    await input(page).fill('afs d');
    await input(page).press('Tab');
    await expect(input(page)).toHaveValue('afs diagnose');
    await input(page).press('Tab');
    await expect(page.locator('#shell-log')).toContainText('afs diagnose tokens');
    await run(page, 'whoami');
    await expect(lastLine(page)).toHaveText(shellCopy.whoami);
    await run(page, 'forge');
    await expect(lastLine(page)).toHaveText(shellCopy.forge);
    await input(page).fill('unfinished');
    await input(page).press('ArrowUp');
    await expect(input(page)).toHaveValue('forge');
    await input(page).press('ArrowUp');
    await expect(input(page)).toHaveValue('whoami');
    await input(page).press('ArrowDown');
    await input(page).press('ArrowDown');
    await expect(input(page)).toHaveValue('unfinished');
    for (const [command, output] of [
      ['afs diagnose', shellCopy.afsDiagnose],
      ['afs diagnose tokens', shellCopy.afsTokens], ['afs pending list', shellCopy.afsPending],
      ['afs cache show /afs/example', shellCopy.afsCache], ['afs config show', shellCopy.afsConfig],
      ['afs config check', shellCopy.afsConfig], ['afs help', shellCopy.afsHelp],
    ]) {
      await run(page, command);
      await expect(lastLine(page)).toHaveText(output);
    }
    await run(page, 'clear');
    await expect(page.locator('#shell-log > *')).toHaveCount(0);
    await expect(input(page)).toHaveCSS('box-shadow', 'none');
    await page.locator('.site-nav a').first().click();
    await expect(shell(page)).toBeHidden();
  });

  // The status replies agree with the page's own status section (its now and next cards), whatever the build's
  // milestones are: never a milestone fixed in the copy.
  test('cat status, afs status and afs status --json name the milestone the status section shows as now, and its next', async ({ page }) => {
    await ready(page);
    const code = sel => page.locator(`#status [data-card="${sel}"] .nn-title`).evaluateAll(els => /^(M\d+[a-z]?)/.exec(els[0]?.textContent.trim() ?? '')?.[1] ?? null);
    const [now, next] = [await code('now'), await code('next')];
    const open = await page.locator('#status .ms li.now').evaluateAll(els => els[0]?.dataset.state !== 'closed');
    const milestone = now ? (open ? shellCopy.milestoneOpen : shellCopy.milestoneClosed).replace('{code}', now) : shellCopy.milestoneNone;
    const nextText = next ? shellCopy.milestoneNext.replace('{code}', next) : '';
    await page.keyboard.press('/');
    await run(page, 'cat status');
    await expect(lastLine(page)).toHaveText(shellCopy.status.replace('{milestone}', milestone).replace('{next}', nextText));
    await run(page, 'afs status');
    await expect(lastLine(page)).toHaveText(shellCopy.afsStatus.replace('{milestone}', milestone).replace('{next}', nextText));
    await run(page, 'afs status --json');
    const json = JSON.parse(await lastLine(page).textContent());
    expect(json).toEqual({ ironafsd: 'not running yet', milestone: now, state: now ? (open ? shellCopy.stateOpen : shellCopy.stateClosed) : null, next, cells: [] });
  });

  // Tab completes only when it changes the command (or lists the choices once); otherwise focus moves on, and
  // Shift+Tab is never taken.
  test('Tab after a complete command and Shift+Tab always move focus out of the input', async ({ page }) => {
    await ready(page);
    await page.keyboard.press('/');
    await input(page).fill('whoami');
    await input(page).press('Tab');
    await expect(input(page)).not.toBeFocused();
    await expect(input(page)).toHaveValue('whoami');
    await input(page).focus();
    await input(page).fill('who');
    await input(page).press('Shift+Tab');
    await expect(input(page)).toHaveValue('who'); // not completed
    await expect(page.locator('#shell-log')).toBeFocused(); // the log, before the input
    await input(page).focus();
    await input(page).fill('afs diagnose');
    await input(page).press('Tab'); // lists the two commands it could be, once
    await expect(input(page)).toBeFocused();
    await expect(lastLine(page)).toHaveText('afs diagnose  afs diagnose tokens');
    await input(page).press('Tab'); // nothing more to do: focus moves on
    await expect(input(page)).not.toBeFocused();
  });

  test('pause and play set the hero\'s pause control, remembered for the visit, and help lists them', async ({ page }) => {
    await ready(page);
    await page.keyboard.press('/');
    await run(page, 'pause');
    await expect(lastLine(page)).toHaveText(shellCopy.pause);
    await expect(page.locator('#hero-pause')).toHaveAttribute('aria-label', 'Resume background motion');
    expect(await page.evaluate(() => sessionStorage.getItem('ironafs-hero-paused'))).toBe('1');
    await run(page, 'play');
    await expect(lastLine(page)).toHaveText(shellCopy.play);
    await expect(page.locator('#hero-pause')).toHaveAttribute('aria-label', 'Pause background motion');
    expect(await page.evaluate(() => sessionStorage.getItem('ironafs-hero-paused'))).toBeNull();
    expect(shellCopy.help).toMatch(/\bpause\b.*\bplay\b/);
  });

  test('cd design scrolls to #design and the prompt shows /afs/design; cd .. goes back to the top', async ({ page }) => {
    await ready(page);
    await page.keyboard.press('/');
    await run(page, 'cd design');
    await expect(page.locator('#shell-prompt')).toHaveText(`${shellCopy.promptHost}:/afs/design$`);
    // it lands where the header's /design link lands (the same scroll helper as the menu: menu.ts goToSection)
    const viaShell = await settledTop(page, 'design');
    expect(new URL(page.url()).hash).toBe('#design');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('.site-nav a[href="/#design"]').click();
    const viaLink = await settledTop(page, 'design');
    expect(Math.abs(viaShell - viaLink), `shell ${viaShell} px, link ${viaLink} px`).toBeLessThanOrEqual(4);
    const header = await page.evaluate(() => document.getElementById('site-header').getBoundingClientRect().bottom);
    const pinned = await page.locator('#design > .stage').evaluate(el => getComputedStyle(el).position === 'sticky');
    if (pinned) expect(Math.abs(viaShell)).toBeLessThanOrEqual(1);
    else expect(viaShell).toBeGreaterThanOrEqual(header - 1);
    await expect(shell(page)).toBeHidden();
    await page.keyboard.press('/');
    await expect(input(page)).toBeFocused();
    await run(page, 'pwd');
    await expect(lastLine(page)).toHaveText('/afs/design');
    for (const id of ['why', 'what', 'status', 'built', 'follow']) {
      await run(page, `cd ${id}`);
      await expect(page.locator('#shell-prompt')).toHaveText(`${shellCopy.promptHost}:/afs/${id}$`);
      await expect.poll(() => page.evaluate(i => new URL(location.href).hash === `#${i}`, id)).toBe(true);
    }
    await run(page, 'cd ..');
    await expect(page.locator('#shell-prompt')).toHaveText(shellCopy.initialPrompt);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBe(0);
    await run(page, 'cd nowhere');
    await expect(lastLine(page)).toHaveText(shellCopy.cdError.replace('{path}', 'nowhere'));
  });

  test('reduced motion: cd jumps, no smooth scroll', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    await page.keyboard.press('/');
    await run(page, 'cd status');
    // the very next frame is already where it settles
    const first = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(document.getElementById('status').getBoundingClientRect().top))));
    const settled = await settledTop(page, 'status');
    expect(Math.abs(first - settled)).toBeLessThanOrEqual(1);
    expect(settled).toBeLessThan(400);
  });

  test('typed input is text, never HTML', async ({ page }) => {
    await ready(page);
    await page.keyboard.press('/');
    await run(page, '<img src=x>');
    await expect(page.locator('#shell-log img')).toHaveCount(0);
    await expect(page.locator('#shell-log')).toContainText('<img src=x>');
    await run(page, 'cd <b>x</b>');
    await expect(page.locator('#shell-log b')).toHaveCount(0);
    await expect(lastLine(page)).toHaveText(shellCopy.cdError.replace('{path}', '<b>x</b>'));
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
  });

  test('open github opens the repository in a new tab', async ({ page, context }) => {
    await context.route(/github\.com/, route => route.abort());
    await ready(page);
    await page.keyboard.press('/');
    // the new tab's request (aborted: no network in tests)
    const request = context.waitForEvent('request', r => /^https:\/\/github\.com\/ironafs\/ironafs\/?$/.test(r.url()));
    const popup = context.waitForEvent('page');
    await run(page, 'open github');
    await request;
    expect(await popup).not.toBe(page);
  });

  test('on the 404 page, cd design goes to the home page\'s #design', async ({ page }) => {
    await ready(page, '/no-such-page');
    await page.keyboard.press('/');
    await run(page, 'cd design');
    await page.waitForURL(/\/#design$/);
  });

  test('nothing in the closed shell is focusable', async ({ page }) => {
    await ready(page);
    const focusable = await page.evaluate(() => Array.from(document.querySelectorAll('#shell input, #shell [tabindex], #shell button, #shell a'))
      .filter(el => el.getClientRects().length > 0).length);
    expect(focusable).toBe(0);
  });
});

test.describe('the shell on touch devices', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 900, 'phones only');
  });

  test('no `/` key on phones, and `/` does not open the shell on a coarse pointer', async ({ page }) => {
    await ready(page);
    await expect(page.locator('#shell-key')).toBeHidden();
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      await page.keyboard.press('/');
      await page.waitForTimeout(200);
      await expect(shell(page)).toBeHidden();
    }
  });
});
