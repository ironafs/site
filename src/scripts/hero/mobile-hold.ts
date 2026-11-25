// SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com>
// SPDX-License-Identifier: GPL-3.0-or-later

export function initMobileHeroHold(hero: HTMLElement): void {
  const doc = hero.ownerDocument;
  const win = doc.defaultView;
  const stage = hero.querySelector<HTMLElement>('.hero-intro');
  const header = doc.getElementById('site-header');
  if (!win || !stage || !header || !('ResizeObserver' in win)) return;

  const portrait = win.matchMedia('(max-width: 899px) and (min-height: 620px) and (orientation: portrait) and (prefers-reduced-motion: no-preference)');
  const viewport = win.visualViewport;
  const update = () => {
    if (!portrait.matches || (viewport?.scale ?? 1) > 1.01) {
      hero.removeAttribute('data-mobile-hold');
      return;
    }
    const notice = doc.querySelector<HTMLElement>('.analytics-notice:not([hidden])');
    const height = Math.min(win.innerHeight, viewport?.height ?? win.innerHeight);
    const available = height - header.getBoundingClientRect().height - (notice?.getBoundingClientRect().height ?? 0);
    hero.toggleAttribute('data-mobile-hold', stage.getBoundingClientRect().height + 12 <= available);
  };

  const observer = new win.ResizeObserver(update);
  observer.observe(stage);
  observer.observe(header);
  const notice = doc.querySelector<HTMLElement>('.analytics-notice');
  if (notice) observer.observe(notice);
  portrait.addEventListener('change', update);
  viewport?.addEventListener('resize', update);
  win.addEventListener('resize', update);
  win.addEventListener('analytics-clearance-change', update);
  update();
}
