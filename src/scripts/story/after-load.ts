// Work that waits for the page's `load` event (the story's pictures load after the page, never
// competing with its first load). A browser fetches a lazy image that lies within its load-in distance of the
// viewport at once (Chromium: 1250 px on 4G), so the chip in #numbers, just below the fold on a phone, would load
// with the page; held in a <template> until `load`, it cannot.

/** Runs `cb` once the page has loaded: at once if it already has, else on the `load` event. */
export function afterLoad(cb: () => void): void {
  if (document.readyState === 'complete') cb();
  else addEventListener('load', () => cb(), { once: true });
}

/** After `load`, puts each held picture (Art.astro's `afterLoad`) in its place. */
export function revealHeldArt(root: ParentNode = document): void {
  afterLoad(() => {
    for (const held of root.querySelectorAll<HTMLTemplateElement>('template.art-held')) held.replaceWith(held.content.cloneNode(true));
  });
}
