// The #design OS tabs: the ARIA tabs pattern, only while the enhancement is on.
// Scrolling moves through the three OSes (each owns a third of the pinned scroll, the same thirds the connector
// phases use); a click or an arrow key scrolls to the middle of that OS's third; aria-selected, the roving
// tabindex and the inactive panels' aria-hidden and inert follow the scroll position. A chosen tab takes effect at
// once and holds through its scroll, so focus never sits in a panel that is about to go inert; focus inside a panel
// that the scroll hides moves to the selected tab.
// In the base layer (phones, reduced motion, no scroll-driven animation, html.static) and when #design is too big
// for its pinned stage (.story--flow, fit.ts) there are no tabs: the tablist is hidden, every panel and scene is
// plain content, and nothing listens. The caller says which: the returned function turns the tabs on or off.

export function initOsTabs(section: HTMLElement, on: boolean): (on: boolean) => void {
  const tablist = section.querySelector<HTMLElement>('[role="tablist"]');
  const tabs = [...section.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = [...section.querySelectorAll<HTMLElement>('.osp')];
  const scenes = [...section.querySelectorAll<HTMLElement>('.scene')];
  if (!tablist || tabs.length !== panels.length || panels.length !== scenes.length) return () => {};
  const count = tabs.length;
  const marker = section.querySelector<HTMLElement>('[data-step-current]');
  let stop: (() => void) | null = null;
  let frame = 0;
  // the tab chosen by a click or a key, held until the scroll reaches its third (or gives up)
  let chosen: number | null = null;
  let chosenTimer = 0;

  /** 0..1 through the pinned scroll: the section's top at the viewport's top to its bottom at the bottom. */
  const progress = () => Math.max(0, Math.min(1, -section.getBoundingClientRect().top / Math.max(1, section.offsetHeight - innerHeight)));

  const sync = () => {
    // a frame queued before the tabs went off must not re-hide panels in the base layer
    if (!stop) return;
    const position = progress() * count;
    const scrolled = Math.min(count - 1, Math.floor(position));
    if (chosen === scrolled) chosen = null;
    const active = chosen ?? scrolled;
    const step = Math.min(4, Math.floor((position - active) * 4) + 1);
    section.dataset.step = String(step);
    section.dataset.platform = String(active);
    if (marker) marker.textContent = String(step);
    panels.forEach((panel, i) => panel.querySelectorAll('.short > li').forEach((li, j) => {
      li.classList.toggle('is-current', i === active && j === step - 2);
    }));
    const selected = tabs[active];
    tablist.style.setProperty('--tab-left', `${selected.offsetLeft}px`);
    tablist.style.setProperty('--tab-width', `${selected.offsetWidth}px`);
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === active));
      tab.tabIndex = i === active ? 0 : -1;
    });
    for (const list of [panels, scenes]) list.forEach((el, i) => {
      // hand focus to the selected tab before its panel goes inert, which would drop it to the page
      if (i !== active && el.contains(document.activeElement)) selected.focus({ preventScroll: true });
      el.setAttribute('aria-hidden', String(i !== active));
      el.inert = i !== active;
    });
  };

  const select = (i: number) => {
    chosen = i;
    clearTimeout(chosenTimer);
    chosenTimer = window.setTimeout(() => { chosen = null; sync(); }, 2000);
    sync();
    const top = scrollY + section.getBoundingClientRect().top;
    scrollTo({ top: top + (section.offsetHeight - innerHeight) * (i + 0.5) / count, behavior: 'smooth' });
  };

  const enable = () => {
    if (stop) return;
    tablist.hidden = false;
    panels.forEach((panel, i) => {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabs[i].id);
      // the panel is the text column's scroll area when its disclosure is open: keyboard-reachable
      panel.tabIndex = 0;
    });
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; sync(); });
    };
    const onClick = (event: MouseEvent) => {
      const i = tabs.indexOf((event.target as Element).closest('[role="tab"]') as HTMLButtonElement);
      if (i >= 0) select(i);
    };
    const onKey = (event: KeyboardEvent) => {
      const i = tabs.indexOf(event.target as HTMLButtonElement);
      if (i < 0) return;
      const next = ({ ArrowRight: (i + 1) % count, ArrowLeft: (i + count - 1) % count, Home: 0, End: count - 1 } as Record<string, number>)[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(next);
      tabs[next].focus();
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    tablist.addEventListener('click', onClick);
    tablist.addEventListener('keydown', onKey);
    section.dataset.tabs = 'on';
    stop = () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      tablist.removeEventListener('click', onClick);
      tablist.removeEventListener('keydown', onKey);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      clearTimeout(chosenTimer);
      chosen = null;
      stop = null;
    };
    sync();
  };

  const disable = () => {
    stop?.();
    tablist.hidden = true;
    delete section.dataset.tabs;
    delete section.dataset.step;
    delete section.dataset.platform;
    panels.forEach(panel => panel.querySelectorAll('.short > li').forEach(li => li.classList.remove('is-current')));
    for (const el of [...panels, ...scenes]) {
      el.removeAttribute('aria-hidden');
      el.inert = false;
      el.removeAttribute('inert');
    }
    for (const panel of panels) {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-labelledby');
      panel.removeAttribute('tabindex');
    }
  };

  const set = (on: boolean) => { if (on) enable(); else disable(); };
  set(on);
  return set;
}
