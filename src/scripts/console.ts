import { CONSOLE_LINES } from '../content/console';
import type { ConsoleLine } from '../lib/types';
// The hero console types into an aria-hidden layer. The complete text sits in a visually
// hidden layer (#console-sr) from the start, so screen readers get it without a live region.
import { heroPaused } from './hero/pause';
import { markIntroSeen, safeStorage, wantsFullIntro } from './intro';

type Options = { instant: boolean; signal?: AbortSignal };

function span(cls: string, text = ''): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/** Fills `el` with the lines. instant: all at once. A signal abort stops typing (the caller clears or refills). */
export async function typeConsole(el: HTMLElement, lines: ConsoleLine[], opts: Options): Promise<void> {
  el.replaceChildren();
  const caret = span('caret');
  for (const line of lines) {
    const row = document.createElement('div');
    row.className = `line ${line.cls}`;
    const pre = span('pre');
    const msg = span('msg');
    row.append(pre, msg);
    el.append(row);
    if (opts.instant) {
      pre.textContent = line.prefix;
      msg.textContent = line.text;
      if (line.note) row.append(span('note', line.note));
      continue;
    }
    row.append(caret);
    const full = line.prefix + line.text;
    for (let i = 1; i <= full.length; i++) {
      if (opts.signal?.aborted) return;
      pre.textContent = full.slice(0, Math.min(i, line.prefix.length));
      msg.textContent = i > line.prefix.length ? full.slice(line.prefix.length, i) : '';
      await sleep(1000 / line.cps, opts.signal);
    }
    if (opts.signal?.aborted) return;
    if (line.note) row.insertBefore(span('note', line.note), caret);
    await sleep(line.pauseAfterMs, opts.signal);
    if (opts.signal?.aborted) return; // aborted during the pause: never start the next row
  }
  if (opts.signal?.aborted) return;
  el.lastElementChild?.append(caret); // the caret stays, blinking, after the last line
}

export function initConsole(doc: Document): void {
  const win = doc.defaultView as Window;
  const hero = doc.getElementById('hero');
  const typedEl = doc.getElementById('console-typed');
  const replay = doc.getElementById('replay');
  if (!hero || !typedEl) return;

  // While the 3D scene is live it owns data-phase; the console only types.
  const setPhase = (phase: string) => { if (hero.dataset.scene !== 'live') hero.dataset.phase = phase; };

  let run: AbortController | null = null;
  const play = async (instant: boolean) => {
    run?.abort();
    const mine = (run = new AbortController());
    setPhase('chip');
    doc.documentElement.dataset.intro = 'typing'; // typed layer visible, poster waits for 'cooled'
    if (!instant && hero.hasAttribute('data-await-melt')) {
      // A 3D intro is on its way: the panel shows empty with the caret until its melt starts (hero:melt).
      const row = doc.createElement('div');
      row.className = 'line a';
      row.append(span('caret'));
      typedEl.replaceChildren(row);
      return;
    }
    if (instant) await typeConsole(typedEl, CONSOLE_LINES, { instant: true });
    else await typeConsole(typedEl, CONSOLE_LINES, { instant: false, signal: mine.signal });
    if (mine.signal.aborted) return;
    setPhase('cooled');
    markIntroSeen(safeStorage(win));
  };

  // A return visit, reduced motion or the visitor's pause keeps the server-rendered, finished console untouched.
  // The head gate ran before this module: reduced motion or the pause may have been turned on since, so both are
  // read again here, and the gate's mark goes (the poster and the finished text show at once).
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches || heroPaused(win)) delete doc.documentElement.dataset.intro;
  else if (doc.documentElement.dataset.intro === 'play' || wantsFullIntro(win)) void play(false);

  // The scene's melt started: type now. Or no scene can run after all: type now, as without one.
  hero.addEventListener('hero:melt', () => void play(false));
  hero.addEventListener('hero:no-scene', () => void play(false));

  /** The finished console at once (the poster is back or stays). `seen`: the visitor has had the intro. */
  const complete = (seen: boolean) => {
    run?.abort();
    run = null;
    void typeConsole(typedEl, CONSOLE_LINES, { instant: true });
    doc.documentElement.dataset.intro = 'typing';
    setPhase('cooled');
    if (seen) markIntroSeen(safeStorage(win));
  };

  // The scene ended (context lost, stopped) or never drew in time (the loader's watchdog: then the intro is not
  // marked seen, so the next visit plays it): the console completes at once, the poster is back.
  hero.addEventListener('hero:scene-end', event => complete((event as CustomEvent<{ seen?: boolean }>).detail?.seen !== false));

  // Reduced motion turned on mid-session: no typing. A live scene is released by the loader.
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', () => { if (motion.matches && run) complete(true); });

  replay?.addEventListener('click', () => {
    hero.dispatchEvent(new CustomEvent('hero:replay')); // the hero loader (re)starts the 3D scene
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    void play(reduced);
  });
}
