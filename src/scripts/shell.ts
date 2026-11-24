// The hidden shell: `/` anywhere (not
// while typing in a field) or the header's `/` key opens a small terminal under the header. Commands: help, ls, pwd,
// cd <section>, cd .., cat README, cat status, open github, keys off / keys on, pause / play (the hero's motion,
// hero/pause.ts), exit (or Esc), the afs commands and three jokes. It is an extra:
// everything it does is also a link on the page. Not offered on touch devices. Everything typed is shown
// as text, never HTML. `keys off` turns the single-character `/` shortcut off (WCAG 2.1.4),
// remembered in localStorage where storage works; the header's `/` key still opens the shell, to turn it back on.
import { shell } from '../content/shell';
import type { ShellStatus } from '../data/milestones';
import { setHeroPaused } from './hero/pause';
import { goToSection } from './menu';
import { links } from '../data/links';
import { site } from '../content/site';

const SECTIONS = ['why', 'what', 'design', 'status', 'built', 'follow'] as const;
const HOME = '/afs';
const prompt = (cwd: string) => `${shell.promptHost}:${cwd}$`;
const KEYS_STORE = 'ironafs-shell-keys';

/** What a command line prints, and what it does. Pure, so the replies are one table. */
type Reply = { clear?: boolean; text: string; kind?: 'ok' | 'err'; cwd?: string; go?: string | 'top'; open?: string; close?: boolean; keys?: 'on' | 'off'; paused?: boolean };

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);

/** The status replies, from the build-time milestones (#shell[data-status], Header.astro): never a fixed milestone. */
function statusReplies(status: ShellStatus): { status: string; afsStatus: string; afsJson: string } {
  const milestone = status.code ? fill(status.open ? shell.milestoneOpen : shell.milestoneClosed, { code: status.code }) : shell.milestoneNone;
  const next = status.next ? fill(shell.milestoneNext, { code: status.next }) : '';
  return {
    status: fill(shell.status, { milestone, next }),
    afsStatus: fill(shell.afsStatus, { milestone, next }),
    afsJson: fill(shell.afsJson, {
      code: JSON.stringify(status.code),
      state: JSON.stringify(status.code ? (status.open ? shell.stateOpen : shell.stateClosed) : null),
      nextCode: JSON.stringify(status.next),
    }),
  };
}

const NO_STATUS: ShellStatus = { code: null, open: false, next: null };

export function answer(line: string, cwd: string, status: ShellStatus = NO_STATUS): Reply | null {
  const [command = '', ...args] = line.trim().split(/\s+/);
  const arg = args[0] ?? '';
  switch (command) {
    case '': return null;
    case 'help': return { text: shell.help };
    case 'clear': return { text: '', clear: true };
    case 'whoami': return { text: shell.whoami };
    case 'forge': return { text: shell.forge };
    case 'afs': {
      const cmd = args.join(' ');
      if (cmd === 'status') return { text: statusReplies(status).afsStatus };
      if (cmd === 'status --json') return { text: statusReplies(status).afsJson };
      if (cmd === 'diagnose') return { text: shell.afsDiagnose };
      if (cmd === 'diagnose tokens') return { text: shell.afsTokens };
      if (cmd === 'pending list') return { text: shell.afsPending };
      if (args[0] === 'cache' && args[1] === 'show' && args.length === 3) return { text: shell.afsCache };
      if (cmd === 'config show' || cmd === 'config check') return { text: shell.afsConfig };
      if (cmd === 'help') return { text: shell.afsHelp };
      return { text: shell.afsHelp, kind: 'err' };
    }
    case 'ls': return { text: SECTIONS.join('  ') };
    case 'pwd': return { text: cwd };
    case 'cd': {
      const dir = arg.replace(/^(\/afs)?\/?/, '').replace(/\/+$/, '');
      if (dir === '' || dir === '..' || dir === '~' || dir === '.' && cwd === HOME) return { text: shell.top, kind: 'ok', cwd: HOME, go: 'top' };
      if (dir === '.') return { text: cwd };
      if ((SECTIONS as readonly string[]).includes(dir)) return { text: `→ /${dir}`, kind: 'ok', cwd: `${HOME}/${dir}`, go: dir };
      return { text: shell.cdError.replace('{path}', () => arg), kind: 'err' };
    }
    case 'cat':
      if (arg === 'README' || arg === 'README.md') return { text: site.tagline };
      if (arg === 'status') return { text: statusReplies(status).status };
      return { text: shell.catError.replace('{path}', () => arg || shell.emptyArg), kind: 'err' };
    case 'open':
      if (arg === 'github') return { text: `→ ${links.github.replace(/^https:\/\//, '')}`, kind: 'ok', open: links.github };
      return { text: shell.openError, kind: 'err' };
    case 'keys':
      if (arg === 'off') return { text: shell.keysOff, kind: 'ok', keys: 'off' };
      if (arg === 'on') return { text: shell.keysOn, kind: 'ok', keys: 'on' };
      return { text: shell.keysError, kind: 'err' };
    case 'pause': return { text: shell.pause, kind: 'ok', paused: true };
    case 'play': return { text: shell.play, kind: 'ok', paused: false };
    case 'exit':
    case 'logout': return { text: '', close: true };
    case 'sudo': return { text: shell.sudo, kind: 'err' };
    case 'insmod':
    case 'modprobe':
    case 'kextload': return { text: shell.module, kind: 'err' };
    default: return { text: shell.unknown, kind: 'err' };
  }
}

const typing = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

export function initShell(doc: Document): void {
  const win = doc.defaultView as Window;
  const root = doc.documentElement;
  const dialog = doc.getElementById('shell') as HTMLDialogElement | null;
  const key = doc.getElementById('shell-key') as HTMLButtonElement | null;
  const log = doc.getElementById('shell-log');
  const input = doc.getElementById('shell-input') as HTMLInputElement | null;
  const ps = doc.getElementById('shell-prompt');
  const entry = input?.parentElement;
  const cursorText = entry?.querySelector('.shell-cursor span');
  if (!dialog || !log || !input || !ps) return;

  // Touch devices have no `/` key: the shell is not offered there; the menu does everything it does.
  const coarse = win.matchMedia('(pointer: coarse)');
  const offered = () => !coarse.matches;
  const offer = () => {
    if (key) key.hidden = !offered();
    if (!offered() && dialog.open) close();
  };

  let cwd = HOME;
  const history: string[] = [];
  let historyIndex = 0, unfinished = '', listed = '';
  let status = NO_STATUS;
  try { status = { ...NO_STATUS, ...JSON.parse(dialog.dataset.status ?? '{}') }; } catch { /* no status: the replies say so */ }
  const completions = ['help', 'clear', 'exit', 'ls', 'pwd', ...SECTIONS.map(x => `cd ${x}`), 'cat README', 'cat status', 'open github', 'keys on', 'keys off', 'pause', 'play', 'whoami', 'forge', 'sudo', 'afs status', 'afs status --json', 'afs diagnose', 'afs diagnose tokens', 'afs pending list', 'afs cache show', 'afs config show', 'afs config check', 'afs help'];
  let returnTo: HTMLElement | null = null;
  // the `/` shortcut, on unless turned off (storage may be blocked: then it is on, and `keys off` lasts for the page)
  let shortcut = true;
  try { shortcut = win.localStorage.getItem(KEYS_STORE) !== 'off'; } catch { /* storage blocked */ }
  const setShortcut = (on: boolean) => {
    shortcut = on;
    try {
      if (on) win.localStorage.removeItem(KEYS_STORE);
      else win.localStorage.setItem(KEYS_STORE, 'off');
    } catch { /* storage blocked */ }
  };

  const say = (text: string, kind?: string) => {
    const line = doc.createElement('div');
    if (kind) line.className = kind;
    line.textContent = text;
    log.append(line);
    log.scrollTop = log.scrollHeight;
  };
  const echo = (text: string) => {
    const line = doc.createElement('div');
    const p = doc.createElement('span');
    p.className = 'ps';
    p.textContent = prompt(cwd);
    line.append(p, ` ${text}`);
    log.append(line);
    log.scrollTop = log.scrollHeight;
  };

  function open() {
    if (!offered()) return;
    if (dialog!.open) { input!.focus(); return; }
    const active = doc.activeElement;
    returnTo = active instanceof HTMLElement && active !== doc.body ? active : null;
    if (!log!.childElementCount) say(shell.welcome, 'ok');
    dialog!.show();
    key?.setAttribute('aria-expanded', 'true');
    input!.focus();
  }
  let restoreFocus = false;
  function close(restore = false) {
    if (!dialog!.open) return;
    restoreFocus = restore;
    dialog!.close();
  }
  dialog.addEventListener('close', () => {
    key?.setAttribute('aria-expanded', 'false');
    input.value = '';
    const target = returnTo && returnTo.isConnected ? returnTo : null;
    returnTo = null;
    // focus goes back where the shell was opened from, unless the visitor already moved it elsewhere
    if (restoreFocus && target) target.focus();
    restoreFocus = false;
  });

  key?.addEventListener('click', () => {
    if (dialog.open) close();
    else { open(); returnTo = key; }
  });

  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog.open) { event.preventDefault(); close(true); return; }
    if (event.key !== '/' || !shortcut || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    if (typing(doc.activeElement) || doc.documentElement.hasAttribute('data-menu-open') || !offered()) return;
    event.preventDefault();
    open();
  });

  doc.addEventListener('pointerdown', event => {
    if (dialog.open && !dialog.contains(event.target as Node) && !key?.contains(event.target as Node)) close();
  });

  const syncCursor = () => {
    if (cursorText) cursorText.textContent = input.value;
    entry?.toggleAttribute('data-cursor-end', input.selectionStart === input.value.length && input.selectionEnd === input.value.length && input.scrollLeft === 0);
  };
  input.addEventListener('input', syncCursor);
  input.addEventListener('click', syncCursor);
  input.addEventListener('keyup', syncCursor);
  input.addEventListener('focus', syncCursor);
  input.addEventListener('keydown', event => {
    // Tab completes only when that does something: it extends the command, or (once per command) lists the
    // commands it could become. Otherwise, and always with Shift, Tab moves focus as anywhere else.
    if (event.key === 'Tab' && !event.shiftKey && input.value.trim()) {
      const value = input.value;
      const matches = completions.filter(candidate => candidate.startsWith(value));
      let prefix = matches[0] ?? value;
      for (const match of matches.slice(1)) while (!match.startsWith(prefix)) prefix = prefix.slice(0, -1);
      if (prefix.length > value.length) {
        event.preventDefault();
        input.value = prefix;
        syncCursor();
        listed = '';
      } else if (matches.length > 1 && listed !== value) {
        event.preventDefault();
        say(matches.join('  '));
        listed = value;
      }
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (!history.length) return;
      event.preventDefault();
      if (event.key === 'ArrowUp') {
        if (historyIndex === history.length) unfinished = input.value;
        historyIndex = Math.max(0, historyIndex - 1);
      } else historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = historyIndex === history.length ? unfinished : history[historyIndex];
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const line = input.value;
    input.value = '';
    if (line.trim()) history.push(line);
    historyIndex = history.length; unfinished = '';
    echo(line);
    const reply = answer(line, cwd, status);
    if (!reply) return;
    if (reply.close) { close(true); return; }
    if (reply.clear) { log.replaceChildren(); return; }
    say(reply.text, reply.kind);
    if (reply.cwd) { cwd = reply.cwd; ps.textContent = prompt(cwd); }
    if (reply.keys) setShortcut(reply.keys === 'on');
    if (reply.paused !== undefined) setHeroPaused(doc, reply.paused);
    if (reply.go === 'top') {
      if (win.location.pathname !== '/') win.location.assign('/#top');
      else {
        win.history.pushState(null, '', '/#top');
        win.scrollTo({ top: 0, behavior: 'instant' });
      }
    } else if (reply.go) goToSection(doc, reply.go, { focus: false });
    if (reply.open) win.open(reply.open, '_blank', 'noopener');
  });

  coarse.addEventListener('change', offer);
  offer();
  root.setAttribute('data-shell-ready', '');
}
