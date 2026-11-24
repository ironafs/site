// The 3D tier and its frame-rate floor. Shared by the hero's loader and the Rust word's (src/scripts/rustword), in
// a module of their own so the Rust word's page script never carries the hero's loader.

/**
 * Below this over the first two seconds the scene stops and the poster returns. Phones 30, as
 * the spec says; the desktop 24, so a display whose frames are capped at 30 Hz (macOS Low Power Mode) never falls
 * back on a rate it holds.
 */
export const MIN_FPS: Record<'desktop' | 'phone', number> = { desktop: 24, phone: 30 };

/**
 * Phone when the pointer is coarse or the window is under 900 px wide. Decided once, when a scene is created: a
 * rotation during the intro never swaps tiers (the scene keeps its counts; the layout follows the window).
 */
export function tierFor(win: Window): 'desktop' | 'phone' {
  return win.matchMedia('(pointer: coarse)').matches || win.matchMedia('(max-width: 899px)').matches ? 'phone' : 'desktop';
}
