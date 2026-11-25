// Scroll-driven scenes follow motion.css's desktop query. The restart and numbers stages also opt into the
// portrait phone query in crash.css. Both require scripting, scroll-driven animation, and no reduced motion or
// .static test switch. Individual fit guards can keep a scene in normal flow if its pinned layout is too crowded.

const QUERY = '(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (min-height: 620px)';
export const PHONE_STORY_QUERY = '(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 320px) and (max-width: 760px) and (min-height: 560px) and (orientation: portrait)';
export const TABLET_STORY_QUERY = '(scripting: enabled) and (prefers-reduced-motion: no-preference) and (min-width: 761px) and (max-width: 1100px) and (min-height: 620px) and (pointer: coarse)';
const query = (phone: boolean) => phone ? `${QUERY}, ${PHONE_STORY_QUERY}` : QUERY;

export function storyEnhanced(phone = false): boolean {
  return typeof CSS !== 'undefined'
    && CSS.supports('animation-timeline: view()')
    && matchMedia(query(phone)).matches
    && !document.documentElement.classList.contains('static');
}

/** Calls `cb` with the new value each time the mode changes (not at registration: read storyEnhanced() for that). */
export function onModeChange(cb: (enhanced: boolean) => void, phone = false): void {
  let last = storyEnhanced(phone);
  const check = () => {
    const now = storyEnhanced(phone);
    if (now !== last) { last = now; cb(now); }
  };
  matchMedia(query(phone)).addEventListener('change', check);
  new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}
