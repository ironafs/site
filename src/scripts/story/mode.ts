// The story's mode predicate. The enhancement (pins, scroll-driven animation) is on
// only where motion.css's selector matches: scroll-driven animation, scripting enabled, no reduced motion, wider
// than 760 px, at least 620 px tall, and no `.static` on <html> (the test switch). Every module that behaves
// differently with and without the enhancement asks this and nothing else (a section too big for its pinned stage:
// fit.ts, which asks it too). `scripting: enabled` is in the query for the CSS's sake: with JavaScript off the
// sheets fall back to the base, since the enhancement needs the modules that set its values and run its fit guards.

const QUERY = '(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)';

export function storyEnhanced(): boolean {
  return typeof CSS !== 'undefined'
    && CSS.supports('animation-timeline: view()')
    && matchMedia(QUERY).matches
    && !document.documentElement.classList.contains('static');
}

/** Calls `cb` with the new value each time the mode changes (not at registration: read storyEnhanced() for that). */
export function onModeChange(cb: (enhanced: boolean) => void): void {
  let last = storyEnhanced();
  const check = () => {
    const now = storyEnhanced();
    if (now !== last) { last = now; cb(now); }
  };
  matchMedia(QUERY).addEventListener('change', check);
  new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}
