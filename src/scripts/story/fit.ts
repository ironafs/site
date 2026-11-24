// Measured fit guards for the pinned sections that hold more than one screen of text (#design, #rust, and the hero's
// headline block below its risen word; #cost's stack has its own in stack.ts). The enhancement's selector already
// needs a window at least 620 px tall, but that alone does not mean a section fits: its pinned stage is one viewport high with overflow hidden, and its panels
// have fixed heights. So each section is measured in its pinned layout, and when anything it holds would be cut
// (under the header, past the stage's bottom, past a fixed-height panel's edge), the section gets .story--flow:
// every enhanced rule in motion.css, how.css and rust.css skips it, so it is the base layer (normal flow, every
// phase at its final state), and the modules that follow the layout (tabs.ts, connectors.ts) treat it as such.
// Between the two, a section that opts in is measured once more with .story--snug (how.css, rust.css: tighter
// spacing, a smaller word), and stays pinned in it if that fits: body text in a wider system font than the layout
// was drawn with (DejaVu Sans, the usual Linux fallback for system-ui, against San Francisco) wraps to more lines,
// and the snug layout takes them back, where flow would give up the pin for a few pixels.
// Measured again on resize, after the fonts load, when a <details> in it opens or closes, and on a mode change.
// Positions come from layout offsets: a phase on its way out is translated by its animation, but its layout box
// is where it would sit. Inline fragments are measured relative to their first fragment, in the same layout box.
import { storyEnhanced, onModeChange } from './mode';

export const FLOW = 'story--flow';
export const SNUG = 'story--snug';

/** Room for rounding. */
const SLACK = 1;

export type Box = { top: number; bottom: number; left: number; right: number };

/** `el`'s layout box (no transforms) in `frame`'s border-box coordinates; `frame` must be one of its offset parents. */
export function boxIn(el: HTMLElement, frame: HTMLElement): Box | null {
  let top = 0, left = 0;
  let a: HTMLElement | null = el;
  for (; a && a !== frame; a = a.offsetParent as HTMLElement | null) {
    top += a.offsetTop + (a === el ? 0 : a.clientTop);
    left += a.offsetLeft + (a === el ? 0 : a.clientLeft);
  }
  if (a !== frame) return null;
  top += frame.clientTop;
  left += frame.clientLeft;
  return { top, left, bottom: top + el.offsetHeight, right: left + el.offsetWidth };
}

/** Whether every one of `els` that is laid out lies inside `frame`'s [top, bottom] and its width. */
function inside(els: Iterable<HTMLElement>, frame: HTMLElement, top: number, bottom: number): boolean {
  const fits = (b: Box) => b.top >= top - SLACK && b.bottom <= bottom + SLACK
    && b.left >= -SLACK && b.right <= frame.offsetWidth + SLACK;
  for (const el of els) {
    const style = getComputedStyle(el);
    if (!el.offsetParent && style.position !== 'fixed') continue; // display: none
    const b = boxIn(el, frame);
    if (!b) return false;
    if (style.display === 'inline') {
      // offsetLeft/Top locate the first line. The other lines start at their own offsets. Rebasing their
      // client rects to the first line cancels the phase's scroll-driven translation.
      const rects = el.getClientRects();
      const first = rects[0];
      if (!first) continue;
      for (const rect of rects) {
        if (!fits({
          top: b.top + rect.top - first.top, bottom: b.top + rect.bottom - first.top,
          left: b.left + rect.left - first.left, right: b.left + rect.right - first.left,
        })) return false;
      }
    } else if (!fits(b)) return false;
  }
  return true;
}

/** The fixed header's height: a pinned stage's top lies under it. */
const headerBottom = () => document.getElementById('site-header')?.getBoundingClientRect().bottom ?? 0;

/** The pinned stage's visible band: below the header, above the stage’s (one viewport’s) bottom. */
export function stageBand(stage: HTMLElement): [number, number] {
  return [headerBottom(), stage.clientHeight + stage.clientTop];
}

/**
 * #design: the eyebrow, the note, the tabs, every OS's text panel and every OS's diagram (the inactive ones too)
 * inside the stage; each panel's text, with its disclosure closed, inside the panel (an open disclosure scrolls in
 * the panel, which is not cut text); and each diagram's boxes and labels inside its fixed-height, clipped frame, the
 * kernel band's boxes above the status line.
 */
export function designFits(section: HTMLElement): boolean {
  const stage = section.querySelector<HTMLElement>(':scope > .stage');
  if (!stage) return true;
  const [top, bottom] = stageBand(stage);
  const parts = [...stage.querySelectorAll<HTMLElement>('.eyebrow, .note, .tabs, .step-progress, .osp, .scene')];
  if (!inside(parts, stage, top, bottom)) return false;

  for (const panel of stage.querySelectorAll<HTMLElement>('.osp')) {
    // the height an open disclosure adds: what its summary does not account for
    let open = 0;
    for (const d of panel.querySelectorAll<HTMLDetailsElement>('details[open]')) {
      const summary = d.querySelector<HTMLElement>('summary');
      open += d.offsetHeight - (summary?.offsetHeight ?? 0);
    }
    if (panel.scrollHeight - open > panel.clientHeight + SLACK) return false;
  }

  for (const scene of stage.querySelectorAll<HTMLElement>('.scene')) {
    const h = scene.clientHeight + scene.clientTop;
    if (!inside(scene.querySelectorAll<HTMLElement>('.uband, .kl, .kr, .ostat, .nd, .kband'), scene, scene.clientTop, h)) return false;
    // the kernel band's boxes clear the status line drawn over the band's bottom
    const stat = scene.querySelector<HTMLElement>('.ostat');
    const statTop = stat ? boxIn(stat, scene)?.top ?? h : h;
    for (const nd of scene.querySelectorAll<HTMLElement>('.kband > .nd')) {
      const b = boxIn(nd, scene);
      if (nd.offsetParent && b && b.bottom > statTop + SLACK) return false;
    }
  }
  return true;
}

/**
 * #rust: the word, the intro, both phases' texts and both phases' panels inside the stage, and everything in each
 * panel (overflow hidden) inside the panel.
 */
export function rustFits(section: HTMLElement): boolean {
  const stage = section.querySelector<HTMLElement>(':scope > .stage');
  if (!stage) return true;
  const [top, bottom] = stageBand(stage);
  if (!inside(stage.querySelectorAll<HTMLElement>('.rust-word, .rw-intro, .rphase, .ph'), stage, top, bottom)) return false;
  for (const ph of stage.querySelectorAll<HTMLElement>('.ph')) {
    // The measured boxes must fit, and a crowded panel must still have room for its bottom padding.
    if (ph.scrollHeight > ph.clientHeight) return false;
    if (!inside(ph.querySelectorAll<HTMLElement>('*'), ph, 0, ph.clientHeight + ph.clientTop)) return false;
  }
  return true;
}

/**
 * The hero (`.hero-pin`): only the desktop hero (900 px and wider, hero.css) has the hand-off layout,
 * and in it the headline block's box starts at the risen word's bottom and ends at the stage's (hero.css): every
 * part of the block (the h1, the subline, the pills row) must lie inside that band, or it would cover the letters
 * or be cut at the stage's bottom.
 */
export function heroFits(pin: HTMLElement): boolean {
  if (!matchMedia('(min-width: 900px)').matches) return false;
  const hero = pin.querySelector<HTMLElement>(':scope > .hero');
  const copy = hero?.querySelector<HTMLElement>('.hero-copy');
  if (!hero || !copy) return true;
  const band = boxIn(copy, hero);
  if (!band) return false;
  return inside(copy.querySelectorAll<HTMLElement>(':scope > *'), hero, band.top, hero.clientHeight + hero.clientTop);
}

export interface FitGuard {
  /** Whether the section is pinned now: the enhancement is on and everything fits. */
  pinned(): boolean;
  /** Calls `cb` with the new value each time it changes (not at registration: read pinned() for that). */
  onChange(cb: (pinned: boolean) => void): void;
}

/**
 * Keeps `section` pinned only while `fits(section)` holds in its pinned layout. `prepare` runs just before each
 * measurement and returns its undo: for anything the pinned layout shows that the flow layout hides (the tabs).
 * With `snug`, a pinned layout that does not fit is measured again with .story--snug, which stays if it fits.
 * The measurement takes the classes off for one synchronous layout and puts them back as measured: no frame is
 * drawn in between.
 */
export function guardFit(section: HTMLElement, fits: (section: HTMLElement) => boolean, prepare?: () => () => void, snug = false): FitGuard {
  const listeners: ((pinned: boolean) => void)[] = [];
  let pinned = false;

  const check = () => {
    let next = false;
    if (storyEnhanced()) {
      section.classList.remove(FLOW, SNUG);
      const undo = prepare?.();
      next = fits(section);
      if (!next && snug) {
        section.classList.add(SNUG);
        next = fits(section);
        section.classList.toggle(SNUG, next);
      }
      undo?.();
      section.classList.toggle(FLOW, !next);
    } else {
      section.classList.remove(FLOW, SNUG);
    }
    if (next !== pinned) {
      pinned = next;
      for (const cb of listeners) cb(pinned);
    }
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; check(); });
  };

  check();
  addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);
  // toggle does not bubble: listen in the capture phase
  section.addEventListener('toggle', schedule, true);
  // at once, not a frame later: the tabs must not keep a panel hidden in the base layer for a frame
  onModeChange(check);

  return { pinned: () => pinned, onChange: cb => { listeners.push(cb); } };
}
