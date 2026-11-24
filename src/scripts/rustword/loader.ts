// Starts the 3D Rust word when #rust comes near, and stops it, freeing its renderer, when #rust
// is far again. The scene is its own chunk (a dynamic import) and shares three.js with the hero. It runs only in the
// story's enhanced mode (scroll-driven animation, no reduced motion, wider than 760 px, at least 620 px tall) with #rust
// pinned (not in flow: fit.ts), on the hero's desktop tier
// (a phone or a window under 900 px never starts it), and with WebGL2. The hero needs no pause from here: its loop
// already stops when its canvas is off screen, and #rust is far below it.
//
// While the 3D word is drawn, the host has .has-3d, which hides the CSS word (rust.css); the .sr-only "Rust" stays
// for assistive technology. A lost context, a frame rate below the hero's floor or an error in a frame ends it for
// the rest of the visit: the class goes and the CSS word is back. ?test: no frame-rate
// floor, and the host shows data-frames (frames drawn), data-rust (the rust amount) and data-rw-end (why the word
// ended); ?test&rwfloor=force makes the word fall below its floor.
import { ui } from '../../content/ui';
import { MIN_FPS, tierFor } from '../hero/tier';
import { hasWebGL2 } from '../hero/webgl';
import { onModeChange, storyEnhanced } from '../story/mode';
import type { FitGuard } from '../story/fit';
import type { EndReason, RustWord } from './scene';

/** How near #rust must come for the word to start: half a viewport beyond each edge. */
const ROOT_MARGIN = '50%';

/**
 * `guard` (fit.ts): #rust's fit guard. With it, the word runs only while #rust is pinned: in flow (.story--flow, the
 * base layer) the CSS word stands at its final state, so a scroll-driven canvas must not cover it.
 */
export function startRustWordWhenNear(host: HTMLElement, guard?: FitGuard): void {
  const params = new URLSearchParams(window.location.search);
  const testHook = params.has('test');
  const minFps = testHook ? (params.get('rwfloor') === 'force' ? Infinity : 0) : MIN_FPS.desktop;
  const section = host.closest<HTMLElement>('section') ?? host;
  const cssWord = host.querySelector<HTMLElement>('.rw-css');
  const text = host.querySelector('.sr-only')?.textContent?.trim() || ui.rust;
  let near = false;
  let broken = false; // ended on its own: the CSS word for the rest of the visit
  let webgl: boolean | null = null; // probed once, on the first approach (the probe makes a context)
  let token = 0;
  let live: { word: RustWord | null; canvas: HTMLCanvasElement } | null = null;

  const pinned = () => (guard ? guard.pinned() : storyEnhanced());
  const allowed = () => !broken && pinned() && tierFor(window) === 'desktop' && (webgl ??= hasWebGL2());

  /** #rust's scroll progress: 0 with its top at the viewport's top, 1 with its bottom at the viewport's bottom. */
  function progress(): number {
    const r = section.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    return span > 0 ? Math.min(Math.max(-r.top / span, 0), 1) : 0;
  }

  function stop(): void {
    token++; // a start still loading never mounts
    host.classList.remove('has-3d');
    if (!live) return;
    const { word, canvas } = live;
    live = null;
    word?.dispose();
    canvas.remove();
  }

  function fail(reason: EndReason): void {
    broken = true;
    if (testHook) host.dataset.rwEnd = reason;
    stop();
  }

  async function start(): Promise<void> {
    if (live) return;
    const mine = ++token;
    let mod: typeof import('./scene');
    try {
      mod = await import('./scene');
    } catch {
      return; // the chunk failed to load: the CSS word stays (a later approach tries again)
    }
    if (mine !== token || live || !near || !allowed()) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'rw-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.append(canvas);
    const current: { word: RustWord | null; canvas: HTMLCanvasElement } = { word: null, canvas };
    live = current;
    try {
      current.word = mod.createRustWord(canvas, {
        word: text,
        box() {
          const c = canvas.getBoundingClientRect();
          const w = (cssWord ?? host).getBoundingClientRect();
          return { left: w.left - c.left, top: w.top - c.top, width: w.width, height: w.height };
        },
        progress,
        minFps,
        onEnd: reason => { if (live === current) fail(reason); },
        onFirstFrame: () => { if (live === current) host.classList.add('has-3d'); },
        onFrame: testHook ? rust => {
          host.dataset.frames = String(Number(host.dataset.frames || 0) + 1);
          host.dataset.rust = rust.toFixed(3);
        } : undefined,
      });
    } catch {
      current.word = null;
    }
    if (!current.word) {
      fail('error'); // a word that cannot be built (no WebGL2 after all, a missing glyph): the CSS word
      return;
    }
    current.word.start();
  }

  function sync(): void {
    if (near && allowed()) void start();
    else stop();
  }

  new IntersectionObserver(entries => {
    near = entries[entries.length - 1].isIntersecting;
    sync();
  }, { rootMargin: ROOT_MARGIN }).observe(host);
  // the mode (reduced motion turned on, a narrow window, html.static) and the tier (a window under 900 px) can change
  onModeChange(() => sync());
  // and the fit: a window too short for #rust pinned puts it in flow
  guard?.onChange(() => sync());
  for (const query of ['(pointer: coarse)', '(max-width: 899px)']) window.matchMedia(query).addEventListener('change', () => sync());
}
