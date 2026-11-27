// Header behaviour: frosted glass after scroll, the current-section marker, and the mobile menu sheet.

/**
 * Scrolls to a section of the home page the way a menu row does: a history entry for `/#id`, the section's heading
 * at the section's start (the page's scroll padding accounts for the header),
 * and, unless `focus` is false, focus on its heading for screen readers: the section's `#<id>-h` (an h2, or #why's
 * restart message, which stands in for a heading there). Off the home page it navigates there.
 */
export function goToSection(doc: Document, id: string, { focus = true }: { focus?: boolean } = {}): void {
  const win = doc.defaultView as Window;
  const section = doc.getElementById(id);
  if (!section || win.location.pathname !== '/') { win.location.assign(`/#${id}`); return; }
  win.history.pushState(null, '', `/#${id}`);
  section.scrollIntoView({ behavior: 'instant' });
  if (focus) doc.getElementById(`${id}-h`)?.focus({ preventScroll: true });
}

function alignInitialStoryFragment(doc: Document, win: Window, header: HTMLElement): void {
  const hash = win.location.hash;
  const target = doc.getElementById(hash.slice(1));
  const heading = target?.querySelector('h2');
  const navigation = win.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (navigation?.type !== 'navigate' || !target?.matches('main > .story') || !heading) return;

  const pending = new AbortController();
  const cancel = () => pending.abort();
  for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'hashchange', 'popstate', 'pagehide']) {
    win.addEventListener(event, cancel, { capture: true, passive: true, signal: pending.signal });
  }

  const align = async () => {
    await doc.fonts.ready;
    // The pinned fit guard and compact scenes settle on successive frames after fonts load.
    for (let frame = 0; frame < 3 && !pending.signal.aborted; frame++) {
      await new Promise(resolve => win.requestAnimationFrame(resolve));
    }
    if (!pending.signal.aborted && win.location.hash === hash &&
      heading.getBoundingClientRect().top < header.getBoundingClientRect().bottom - 1) {
      target.scrollIntoView({ behavior: 'instant' });
    }
    cancel();
  };

  if (doc.readyState === 'complete') void align();
  else win.addEventListener('load', align, { once: true, signal: pending.signal });
}

export function initMenu(doc: Document): void {
  const win = doc.defaultView as Window;
  const root = doc.documentElement;
  const header = doc.getElementById('site-header');
  const button = doc.getElementById('menu-button') as HTMLButtonElement | null;
  const dialog = doc.getElementById('menu') as HTMLDialogElement | null;
  const closeButton = doc.getElementById('menu-close');

  // Frosted glass after 10 px of scroll.
  if (header) {
    const update = () => header.toggleAttribute('data-solid', win.scrollY > 10);
    win.addEventListener('scroll', update, { passive: true });
    update();
    // The header wraps at large text sizes or narrow widths: keep --header-live equal to its real height (--header-h is the header's min-height, so it must not be fed back), so
    // scroll-padding leaves normal targets below the bar.
    if ('ResizeObserver' in win) {
      const measure = () => root.style.setProperty('--header-live', `${Math.ceil(header.getBoundingClientRect().height)}px`);
      new win.ResizeObserver(measure).observe(header);
      measure();
    }
    alignInitialStoryFragment(doc, win, header);
  }

  // The visible section marks its link: a thin band across the middle of the viewport.
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('.site-nav a'));
  const byId = new Map(links.map(a => [new URL(a.href).hash.slice(1), a]));
  const menuSections = Array.from(dialog?.querySelectorAll<HTMLAnchorElement>('.menu-paths a') ?? []).map(link => ({
    link, id: new URL(link.href).hash.slice(1),
  }));
  const destinations = new Set([...byId.keys(), ...menuSections.map(({ id }) => id)]);
  const sections = Array.from(destinations, id => doc.getElementById(id)).filter((el): el is HTMLElement => !!el);
  let current = '';
  if (sections.length && 'IntersectionObserver' in win) {
    const mark = (id: string) => {
      current = id;
      for (const [key, a] of byId) {
        if (key === id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      }
    };
    const observer = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) mark(entry.target.id);
        else if (current === entry.target.id) mark('');
      }
    }, { rootMargin: '-50% 0px -49% 0px' });
    sections.forEach(s => observer.observe(s));
  }

  if (button && dialog) {
    const desktop = win.matchMedia('(min-width: 900px)');
    let pending: (() => void) | null = null;

    const goTo = (id: string) => goToSection(doc, id);

    // The browser restores the old scroll position after a history pop; scroll once that has happened.
    const later = (fn: () => void) => win.requestAnimationFrame(() => win.setTimeout(fn, 0));
    // Each opening pushes an entry with its own token; only that entry is "ours". A stale entry restored by
    // Forward (or surviving a reload) carries another token and is never mistaken for the current one.
    let token = 0;
    const ours = () => token > 0 && win.history.state?.ironafsMenu === token;
    let closing = false;
    let afterPop: (() => void) | null = null;

    // Every way of closing (button, Escape, row tap, back gesture, resize, a native close) ends here.
    dialog.addEventListener('close', () => {
      root.removeAttribute('data-menu-open');
      button.setAttribute('aria-expanded', 'false');
      button.focus();
      const after = pending;
      pending = null;
      if (ours()) {
        // Closed before the pop landed. Pop only if no pop is already in flight; the work waits for it.
        afterPop = after;
        if (!closing) { closing = true; win.history.back(); }
      } else {
        closing = false;
        if (after) later(after);
      }
    });

    // Closing pops the history entry that opening pushed, and the pop closes the dialog. A second
    // request while one is in flight only updates what runs afterwards.
    const requestClose = (after?: () => void) => {
      if (!dialog.open) return;
      if (after) pending = after;
      if (closing) return;
      closing = true;
      if (ours()) win.history.back();
      else dialog.close();
    };

    button.addEventListener('click', () => {
      if (dialog.open) return;
      // Freeze the last observed location for this opening, without forcing layout during the tap.
      for (const { link, id } of menuSections) {
        if (id === current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
      if (win.history.state?.ironafsMenu) win.history.replaceState(null, ''); // a stale menu entry, e.g. after Forward
      win.history.pushState({ ironafsMenu: ++token }, '');
      dialog.showModal();
      root.setAttribute('data-menu-open', '');
      button.setAttribute('aria-expanded', 'true');
      dialog.scrollTop = 0;
    });
    closeButton?.addEventListener('click', () => requestClose());
    dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
    win.addEventListener('popstate', () => {
      if (dialog.open) dialog.close();
      else {
        closing = false;
        if (afterPop) { const after = afterPop; afterPop = null; later(after); }
      }
    });
    desktop.addEventListener('change', () => { if (desktop.matches) requestClose(); });


    dialog.addEventListener('click', event => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="/#"]');
      if (!link || win.location.pathname !== '/') return;
      event.preventDefault();
      const id = new URL(link.href).hash.slice(1);
      requestClose(() => goTo(id));
    });

    // Keep Tab inside the sheet in every engine.
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button')).filter(el => el.offsetParent !== null);
      if (!items.length) return;
      // Move focus ourselves: some engines let Tab leave a modal dialog.
      const index = items.indexOf(doc.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (index <= 0 ? items.length - 1 : index - 1)
        : (index === -1 || index === items.length - 1 ? 0 : index + 1);
      event.preventDefault();
      items[next].focus();
    });
  }

  root.setAttribute('data-menu-ready', '');
}
