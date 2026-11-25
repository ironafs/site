// #platforms: places the timeline and keeps it usable.
// - Each marker, card and year tick carries its xFor(date) fraction in data-x (and a card the room to its lane's next
//   event in data-gap), set here as --x and --gap through the CSSOM: platforms.css positions them from these. The
//   track's data-end (where the IronAFS card starts, past every lane card) becomes --end the same way.
// - The fit guard (fit.ts): pinned only while the head, the lanes and every card fit the stage, each card inside its
//   lane's row and clear of the next card in its lane, and the IronAFS card clear of every lane card; otherwise the
//   section is the base layer, a vertical list.
// - The keyboard: while pinned, the track is wider than the screen and only part of it is shown. Focusing an event's
//   link scrolls the page to the point of the slide where that event is centred in the window, so a focused link is
//   never off screen. The mapping is the CSS's: the slide runs over `contain 4%` to `contain 96%` of the section's
//   view timeline (inset 0), translating the track by --pf-d (a registered <length>, read here in px).
import { boxIn, guardFit, stageBand, type Box, type FitGuard } from './fit';
import { TABLET_STORY_QUERY } from './mode';

/** The slide's animation-range in platforms.css, as fractions of the section's contain range. */
const RANGE: [number, number] = [0.04, 0.96];
const SLACK = 1;

/** Whether two boxes in one frame overlap by more than the slack. */
const overlap = (a: Box, b: Box) => a.left < b.right - SLACK && b.left < a.right - SLACK
  && a.top < b.bottom - SLACK && b.top < a.bottom - SLACK;

/** Every card inside its lane's row and clear of the next card in its lane, the IronAFS card clear of every lane card;
 *  the head and the track inside the stage. */
export function platformsFits(section: HTMLElement): boolean {
  if (matchMedia(TABLET_STORY_QUERY).matches) return false;
  const stage = section.querySelector<HTMLElement>(':scope > .stage');
  const tl = stage?.querySelector<HTMLElement>('.tl');
  if (!stage || !tl) return true;
  const [header, bottom] = stageBand(stage);
  for (const el of stage.querySelectorAll<HTMLElement>(':scope > .eyebrow, :scope > h2, :scope > .tl')) {
    const b = boxIn(el, stage);
    if (!b || b.top < header - SLACK || b.bottom > bottom + SLACK || b.right > stage.offsetWidth + SLACK) return false;
  }
  for (const evs of tl.querySelectorAll<HTMLElement>('.lane:not(.fin-lane) .evs')) {
    const h = evs.clientHeight;
    let right = -Infinity;
    for (const ev of evs.querySelectorAll<HTMLElement>(':scope > .ev')) {
      const card = ev.querySelector<HTMLElement>('.card');
      const b = card && boxIn(card, evs);
      if (!b || b.bottom > h + SLACK || b.left < right - SLACK) return false;
      right = b.right;
    }
  }
  // the lane names fit their column
  for (const h3 of tl.querySelectorAll<HTMLElement>('.lane > h3')) if (h3.scrollWidth > h3.clientWidth + SLACK) return false;
  // the IronAFS card: inside the lanes' height, above the axis
  const fin = tl.querySelector<HTMLElement>('.fin .card');
  const finEvs = tl.querySelector<HTMLElement>('.fin-lane .evs');
  const axis = tl.querySelector<HTMLElement>('.axis');
  if (fin && finEvs && axis) {
    const b = boxIn(fin, finEvs);
    if (!b || b.top < -SLACK || b.bottom > axis.offsetTop + SLACK) return false;
  }
  // the IronAFS card (in its overlay lane) clear of every lane card: both measured in the track's frame, which both
  // tracks share (they slide together)
  if (fin) {
    const f = boxIn(fin, tl);
    if (!f) return false;
    for (const card of tl.querySelectorAll<HTMLElement>('.lane:not(.fin-lane) .card')) {
      const b = boxIn(card, tl);
      if (!b || overlap(b, f)) return false;
    }
  }
  return true;
}

/** Scrolls the page to the point of the slide where `ev` is centred in its window. */
function show(section: HTMLElement, ev: HTMLElement): void {
  const tl = section.querySelector<HTMLElement>('.tl');
  const win = ev.closest<HTMLElement>('.win');
  const card = ev.querySelector<HTMLElement>('.card');
  if (!tl || !win || !card) return;
  const d = parseFloat(getComputedStyle(tl).getPropertyValue('--pf-d'));
  const b = boxIn(card, win);
  if (!b || !(d > 0)) return;
  const f = Math.min(1, Math.max(0, ((b.left + b.right) / 2 - win.clientWidth / 2) / d));
  const p = RANGE[0] + f * (RANGE[1] - RANGE[0]);
  const top = section.getBoundingClientRect().top + scrollY;
  scrollTo({ top: top + p * Math.max(0, section.offsetHeight - innerHeight), behavior: 'instant' });
}

export function initPlatforms(): FitGuard | undefined {
  const section = document.getElementById('platforms');
  if (!section) return undefined;
  const tl = section.querySelector<HTMLElement>('.tl');
  if (tl?.dataset.end) tl.style.setProperty('--end', tl.dataset.end);
  for (const el of section.querySelectorAll<HTMLElement>('[data-x]')) {
    el.style.setProperty('--x', el.dataset.x ?? '0');
    if (el.dataset.gap) el.style.setProperty('--gap', el.dataset.gap);
  }
  const guard = guardFit(section, platformsFits);
  section.addEventListener('focusin', event => {
    if (!guard.pinned()) return;
    const ev = (event.target as Element | null)?.closest<HTMLElement>('.ev');
    if (ev) show(section, ev);
  });
  return guard;
}
