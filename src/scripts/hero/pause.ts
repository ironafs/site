// The visitor's pause for the hero's motion (WCAG 2.2.2): the hero's pause button (#hero-pause) and the shell's
// `pause` and `play` commands. The button is an action button, not a toggle: its label and icon say what it will do
// (pause, or resume), so it carries no aria-pressed. Paused, the 3D scene stops drawing (its last frame stays, or the
// poster), the console's caret stops blinking (hero.css, html[data-hero-paused]) and no scene starts; played again, the
// scene comes back at rest. The choice is remembered for the visit (sessionStorage; where storage is blocked, for the
// page). Under reduced motion nothing moves, so the button is not offered.

import { motion } from '../../content/motion';

const KEY = 'ironafs-hero-paused';
let pageOnly: boolean | null = null; // the choice when sessionStorage is blocked

/** Whether the visitor has paused the hero's motion in this visit. */
export function heroPaused(win: Window): boolean {
  try {
    return win.sessionStorage.getItem(KEY) === '1';
  } catch {
    return pageOnly ?? false;
  }
}

function show(doc: Document, paused: boolean): void {
  doc.documentElement.toggleAttribute('data-hero-paused', paused);
  const button = doc.getElementById('hero-pause');
  button?.setAttribute('aria-label', paused ? motion.resume : motion.pause);
}

/** Pauses or plays the hero's motion, remembers it for the visit, and tells the hero's loader (hero:pause). */
export function setHeroPaused(doc: Document, paused: boolean): void {
  const win = doc.defaultView as Window;
  if (heroPaused(win) === paused) return show(doc, paused);
  pageOnly = paused;
  try {
    if (paused) win.sessionStorage.setItem(KEY, '1');
    else win.sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the choice lasts for this page */
  }
  show(doc, paused);
  doc.getElementById('hero')?.dispatchEvent(new CustomEvent('hero:pause', { detail: { paused } }));
}

/** Wires the hero's pause button: offered once scripts run, and only without reduced motion. */
export function initHeroPause(doc: Document): void {
  const win = doc.defaultView as Window;
  const button = doc.getElementById('hero-pause') as HTMLButtonElement | null;
  show(doc, heroPaused(win));
  if (!button) return;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const offer = () => { button.hidden = motion.matches; };
  offer();
  motion.addEventListener('change', offer);
  button.addEventListener('click', () => setHeroPaused(doc, !heroPaused(win)));
}
