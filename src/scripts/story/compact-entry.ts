// SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com>
// SPDX-License-Identifier: GPL-3.0-or-later

export function initCompactEntries(): void {
  const targets = [...document.querySelectorAll<HTMLElement>('#what .what-diagram, #rust .rust-word')];
  const root = document.documentElement;
  const header = document.getElementById('site-header');
  if (!targets.length || !header || !('IntersectionObserver' in window)) return;

  const media = matchMedia('(max-width: 69.999rem) and (prefers-reduced-motion: no-preference)');
  const rust = document.getElementById('rust');
  const rustStage = rust?.querySelector<HTMLElement>('.stage');
  const viewport = window.visualViewport;
  const seen = new WeakSet<Element>();
  const visible = 0.97;
  let observer: IntersectionObserver | undefined;
  let frame = 0;

  const measure = () => {
    frame = 0;
    observer?.disconnect();
    const top = Math.ceil(header.getBoundingClientRect().height) + 6;
    const clearance = parseFloat(getComputedStyle(root).getPropertyValue('--analytics-clearance')) || 0;
    const height = Math.min(innerHeight, viewport?.height ?? innerHeight);
    const bottom = Math.ceil(clearance + innerHeight - height) + 6;
    const enabled = media.matches && !root.classList.contains('static') && (viewport?.scale ?? 1) <= 1.01;
    const rustPinned = rustStage && getComputedStyle(rustStage).position === 'sticky';
    const eligible = targets.filter(target => {
      const isRust = target.classList.contains('rust-word');
      const fits = enabled && (!isRust || !rustPinned) && target.getBoundingClientRect().height <= innerHeight - top - bottom;
      if (!fits) delete target.dataset.compactEntry;
      return fits && !seen.has(target);
    });
    if (!eligible.length) return;

    observer = new IntersectionObserver(entries => {
      for (const { target, intersectionRatio } of entries) {
        if (intersectionRatio < visible || seen.has(target)) continue;
        seen.add(target);
        (target as HTMLElement).dataset.compactEntry = 'entered';
        observer?.unobserve(target);
      }
    }, { rootMargin: `-${top}px 0px -${bottom}px`, threshold: visible });
    for (const target of eligible) {
      target.dataset.compactEntry = 'waiting';
      observer.observe(target);
    }
  };

  const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
  const resize = new ResizeObserver(schedule);
  resize.observe(header);
  for (const target of targets) resize.observe(target);
  const mode = new MutationObserver(schedule);
  mode.observe(root, { attributes: true, attributeFilter: ['class'] });
  if (rust) mode.observe(rust, { attributes: true, attributeFilter: ['class'] });
  media.addEventListener('change', schedule);
  viewport?.addEventListener('resize', schedule);
  addEventListener('resize', schedule);
  addEventListener('analytics-clearance-change', schedule);
  measure();
}
