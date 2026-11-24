// The #cost stack's phases, measured from the layout instead of hard-coded percentages.
//
// The stack is a column of sticky cards with a named view timeline (--stack, inset 0) on the stack itself. Card i
// sticks at its own `top` (T) once its natural top in the stack (y) reaches it, and the next card starts to cover
// it when that card's top reaches T + the card's height. Between those two points the card is pinned and alone:
// its beats ([data-step]) play there, one after another. While the next card slides from the viewport's bottom
// to its own pin, the card sinks back. Every range is written as `cover A% cover B%` of the stack's timeline into
// the element's --r, and the dim hold before it (from the stack's arrival to the beat) into --d (style.setProperty;
// cost.css reads them as animation ranges), and recomputed whenever the
// stack's size or the viewport changes. Nothing here runs when the enhancement is off: the base layer is static.
import { storyEnhanced, onModeChange } from './mode';

/** Of a card's pinned window, the share before its first beat starts and after its last beat ends. */
const LEAD = 0.08;
const TAIL = 0.12;

const pct = (px: number, cover: number) => `${((px / cover) * 100).toFixed(3)}%`;

export function phaseStack(stack: HTMLElement): void {
  const cards = [...stack.querySelectorAll<HTMLElement>(':scope > .scard')];
  if (!cards.length) return;
  const vh = document.documentElement.clientHeight;

  // Pinned layout only when every card fits: below the fixed header, and whole above the viewport's bottom. A short
  // window (a landscape phone, a small laptop window) gets the cards in normal flow at their final state instead
  // (.stack--flow in cost.css), so no line stays under the fold until the next card covers it. Before that, the
  // snug cards (.stack--snug, less padding): body text in a wider system font than the layout was drawn with wraps to
  // more lines, and the snug cards take them back (as fit.ts's .story--snug).
  stack.classList.remove('stack--flow', 'stack--snug');
  if (!stackFits(stack, cards, vh)) {
    stack.classList.add('stack--snug');
    if (!stackFits(stack, cards, vh)) {
      stack.classList.replace('stack--snug', 'stack--flow');
      return;
    }
  }

  // Natural positions: measured with the cards unstuck for one synchronous layout (no frame is drawn in between).
  stack.classList.add('is-measuring');
  const ys = cards.map(card => card.offsetTop);
  stack.classList.remove('is-measuring');
  const heights = cards.map(card => card.offsetHeight);
  const tops = cards.map(card => parseFloat(getComputedStyle(card).top) || 0);
  const stackH = stack.offsetHeight;
  // cover 0% is the stack's top at the viewport's bottom: scroll offsets below are measured from there.
  const cover = stackH + vh;
  const range = (from: number, to: number) => `cover ${pct(from, cover)} cover ${pct(to, cover)}`;

  cards.forEach((card, i) => {
    const pinAt = ys[i] - tops[i] + vh;
    const last = i === cards.length - 1;
    // pinned and alone until the next card reaches this one's bottom (the last: until the stack ends)
    const coveredAt = last ? stackH - tops[i] - heights[i] + vh : ys[i + 1] - (tops[i] + heights[i]) + vh;
    if (!last) card.style.setProperty('--r', range(ys[i + 1], ys[i + 1] - tops[i + 1] + vh));
    else card.style.removeProperty('--r');

    const beats = [...card.querySelectorAll<HTMLElement>('[data-step]')];
    const count = Math.max(0, ...beats.map(el => Number(el.dataset.step) + Number(el.dataset.span ?? 1)));
    const from = pinAt + LEAD * (coveredAt - pinAt);
    const each = ((1 - LEAD - TAIL) * (coveredAt - pinAt)) / Math.max(count, 1);
    for (const el of beats) {
      const k = Number(el.dataset.step);
      const span = Number(el.dataset.span ?? 1);
      el.style.setProperty('--r', range(from + k * each, from + (k + span) * each));
      // the dim hold before it: from the stack's arrival to the beat's start (cost.css: .on)
      el.style.setProperty('--d', range(0, from + k * each));
    }
  });
}

/** The bottom of `el`'s layout box (no transforms) measured from the top of `card`'s border box. */
function bottomIn(el: HTMLElement, card: HTMLElement): number {
  let y = el.offsetHeight;
  for (let a: HTMLElement | null = el; a && a !== card; a = a.offsetParent as HTMLElement | null) y += a.offsetTop;
  return y;
}

/** Whether every card, stuck at its own top, lies below the header and ends inside the viewport. */
function stackFits(stack: HTMLElement, cards: HTMLElement[], vh: number): boolean {
  const header = document.getElementById('site-header')?.getBoundingClientRect().bottom ?? 0;
  return cards.every(card => {
    const cs = getComputedStyle(card);
    const top = parseFloat(cs.top) || 0;
    const content = Math.max(0, ...[...card.querySelectorAll<HTMLElement>('.copy, .vis, .vis > *, .vis > * > *')]
      .map(el => bottomIn(el, card))) + parseFloat(cs.paddingBottom);
    return top >= header && Math.max(card.offsetHeight, content) <= vh - top;
  });
}

/** Phases every stack under `root` now (when enhanced) and again on every resize or mode change. */
export function initStacks(root: ParentNode = document): void {
  const stacks = [...root.querySelectorAll<HTMLElement>('.stack[data-stack]')];
  if (!stacks.length) return;
  let queued = false;
  const run = () => {
    queued = false;
    if (storyEnhanced()) for (const stack of stacks) phaseStack(stack);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  run();
  const observer = new ResizeObserver(schedule);
  for (const stack of stacks) observer.observe(stack);
  addEventListener('resize', schedule);
  onModeChange(schedule);

  // A command cursor blinks for five seconds (cost.css), then holds still: each time it comes into view, it blinks
  // again from the start, so the blink is seen where it is read and never runs on past five seconds.
  const blink = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const animation of entry.target.getAnimations()) {
        if ((animation as CSSAnimation).animationName !== 'cs-blink') continue;
        animation.currentTime = 0;
        animation.play();
      }
    }
  });
  for (const stack of stacks) for (const cursor of stack.querySelectorAll('.cur')) blink.observe(cursor);
}
