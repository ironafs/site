import { consent } from '../content/privacy';
import { choiceKey, cookieDays, grantDays, noticeKey } from '../data/analytics';

type Choice = { value: 'denied' } | { value: 'granted'; expires: number };
type AnalyticsWindow = Window & { dataLayer?: IArguments[] } & Partial<Record<`ga-disable-${string}`, boolean>>;

const grantLifetime = grantDays * 24 * 60 * 60 * 1000;

function readChoice(): Choice | null {
  try {
    const saved = JSON.parse(localStorage.getItem(choiceKey) ?? 'null');
    if (saved?.value === 'denied') return { value: 'denied' };
    if (saved?.value === 'granted' && Number.isFinite(saved.expires) && saved.expires > Date.now()) return saved;
  } catch { /* storage blocked or choice invalid */ }
  return null;
}

function saveChoice(choice: Choice): void {
  try {
    localStorage.setItem(choiceKey, JSON.stringify(choice));
  } catch { /* keep the choice in this document when storage is blocked */ }
}

function clearCookies(): void {
  // The tag uses Path=/ and can set cookies on this host or its parent domain.
  const labels = location.hostname.split('.');
  const domains = labels.map((_, i) => labels.slice(i).join('.')).slice(0, -1);
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0].trim();
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    const expired = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = expired;
    for (const domain of domains) document.cookie = `${expired}; Domain=${domain}`;
  }
}

function command(win: AnalyticsWindow): (...command: unknown[]) => void {
  const dataLayer = win.dataLayer ??= [];
  return function gtag(..._command: unknown[]): void { dataLayer.push(arguments); };
}

function loadTag(doc: Document, win: AnalyticsWindow, id: string): HTMLScriptElement {
  const gtag = command(win);
  win[`ga-disable-${id}`] = false;
  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  const page = {
    page_location: location.origin + location.pathname,
    page_referrer: doc.referrer ? new URL(doc.referrer).origin + '/' : '',
  };
  gtag('config', id, {
    ...page,
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: cookieDays * 24 * 60 * 60,
    cookie_update: false,
    cookie_path: '/',
  });
  // The stream measures scroll, outbound links and downloads. Send one sanitized view for this page load.
  gtag('event', 'page_view', { ...page, page_title: doc.title });

  const tag = doc.createElement('script');
  tag.async = true;
  tag.referrerPolicy = 'no-referrer';
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  doc.head.append(tag);
  return tag;
}

export function initAnalyticsConsent(doc: Document): void {
  const notice = doc.querySelector<HTMLElement>('[data-analytics-banner]');
  const preferences = doc.querySelector<HTMLDialogElement>('[data-analytics-preferences]');
  const toggle = preferences?.querySelector<HTMLInputElement>('[data-analytics-toggle]');
  const allow = preferences?.querySelector<HTMLButtonElement>('[data-analytics-allow]');
  const decline = preferences?.querySelector<HTMLButtonElement>('[data-analytics-decline]');
  const win = doc.defaultView as AnalyticsWindow | null;
  if (!notice || !preferences || !toggle || !allow || !decline || !win) return;

  const id = notice.dataset.measurementId ?? '';
  const configured = /^G-[A-Z0-9]+$/.test(id);
  const status = doc.querySelectorAll<HTMLElement>('[data-analytics-status]');
  const showStatus = (key: keyof typeof consent.status) => {
    for (const node of status) node.textContent = consent.status[key];
  };
  if (!configured || typeof preferences.showModal !== 'function') {
    showStatus('inactive');
    return;
  }

  let choice = readChoice();
  let dismissed = false;
  try { dismissed = sessionStorage.getItem(noticeKey) === '1'; } catch { /* storage blocked */ }
  let gpc = false;
  let tag: HTMLScriptElement | undefined;
  let policyPending = choice === null;
  let defaultOn = false;
  let acknowledging = false;
  let toggleEdited = false;
  const noticeStatus = notice.querySelector<HTMLElement>('[data-analytics-notice-status]');
  const noticeAllow = notice.querySelector<HTMLButtonElement>('[data-notice-allow]');
  const noticeDecline = notice.querySelector<HTMLButtonElement>('[data-notice-decline]');
  const noticeActions = notice.querySelector<HTMLElement>('[data-analytics-notice-actions]');
  const noted = notice.querySelector<HTMLElement>('[data-analytics-noted]');
  let timer: number | undefined;
  let returnFocus: HTMLElement | undefined;
  // set below where adopted style sheets are supported: publishes the open notice's height as --analytics-clearance
  let updateClearance = () => {};

  const focusMain = () => {
    const main = doc.getElementById('main');
    main?.setAttribute('tabindex', '-1');
    main?.focus({ preventScroll: true });
  };

  const enabled = () => !gpc && (choice?.value === 'granted' || (choice === null && !policyPending && defaultOn));
  const showChoice = () => { if (!toggleEdited) toggle.checked = enabled(); };

  const refresh = () => {
    gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    if (gpc && choice?.value !== 'denied') {
      choice = { value: 'denied' };
      saveChoice(choice);
    }
    win.clearTimeout(timer);
    if (choice?.value === 'granted') {
      const remaining = choice.expires - Date.now();
      if (remaining <= 0) choice = null;
      else timer = win.setTimeout(refresh, Math.min(remaining, 2 ** 31 - 1));
    }

    const hadFocus = notice.contains(doc.activeElement);
    notice.hidden = !acknowledging && (gpc || choice !== null || dismissed);
    const visible = doc.documentElement.classList.contains('analytics-notice-visible');
    doc.documentElement.classList.toggle('analytics-notice-visible', !notice.hidden);
    if (visible !== !notice.hidden) {
      // measured now, not on the resize observer's first frame, which a busy page can hold back for seconds
      updateClearance();
      win.dispatchEvent(new Event('analytics-clearance-change'));
    }
    if (noticeStatus) noticeStatus.textContent = gpc ? consent.noticeGpc : policyPending && choice === null ? consent.pending : choice?.value === 'granted' ? consent.enabled : choice?.value === 'denied' ? consent.notice : defaultOn ? consent.defaultOn : consent.notice;
    if (notice.hidden && hadFocus) focusMain();
    // Under GPC neither choice applies: both are shown locked, never one more available than the other.
    toggle.disabled = allow.disabled = decline.disabled = gpc;
    showStatus(gpc ? 'gpc' : choice?.value ?? (policyPending ? 'pending' : defaultOn ? 'defaultOn' : 'undecided'));

    if (enabled()) {
      if (!tag) tag = loadTag(doc, win, id);
      else if (!tag.isConnected && readChoice()?.value === 'granted') location.reload();
      else if (!tag.isConnected) {
        win[`ga-disable-${id}`] = false;
        command(win)('consent', 'update', { analytics_storage: 'granted' });
      }
      return;
    }
    win[`ga-disable-${id}`] = true;
    clearCookies();
    if (tag?.isConnected) {
      tag.remove();
      command(win)('consent', 'update', { analytics_storage: 'denied' });
      // Reload to discard the already executed tag and its listeners. The disable flag blocks unload events.
      // Only a saved denial survives the reload: without one (storage blocked) the next page could apply the
      // regional default again, so the tag stays disabled in this page instead.
      if (readChoice()?.value === 'denied') { if (acknowledging) win.setTimeout(() => location.reload(), 1000); else location.reload(); }
    }
  };

  const choose = (value: Choice['value']) => {
    choice = value === 'granted' && !gpc ? { value, expires: Date.now() + grantLifetime } : { value: 'denied' };
    saveChoice(choice);
    const fromNotice = !preferences.open && !notice.hidden;
    if (preferences.open) preferences.close();
    if (fromNotice) {
      acknowledging = true;
      if (notice.contains(doc.activeElement)) focusMain();
      if (noticeActions) noticeActions.hidden = true;
      if (noted) { noted.textContent = value === 'granted' && !gpc ? consent.enabled : consent.noted; noted.hidden = false; }
      win.setTimeout(() => { acknowledging = false; if (noticeActions) noticeActions.hidden = false; if (noted) noted.hidden = true; refresh(); }, 1000);
    }
    refresh();
  };
  noticeAllow?.addEventListener('click', () => choose('granted'));
  noticeDecline?.addEventListener('click', () => choose('denied'));
  toggle.addEventListener('change', () => { toggleEdited = true; });
  allow.addEventListener('click', () => choose('granted'));
  decline.addEventListener('click', () => choose('denied'));
  // Saving without touching the switch keeps the current choice.
  preferences.querySelector('[data-analytics-save]')?.addEventListener('click', () => {
    if (toggleEdited) choose(toggle.checked ? 'granted' : 'denied');
    else preferences.close();
  });
  preferences.querySelector('[data-analytics-close]')?.addEventListener('click', () => preferences.close());
  const policyLink = preferences.querySelector<HTMLAnchorElement>('.analytics-policy-link');
  policyLink?.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || policyLink.pathname !== location.pathname) return;
    returnFocus = doc.getElementById(policyLink.hash.slice(1)) ?? undefined;
    preferences.close();
  });

  for (const opener of doc.querySelectorAll<HTMLButtonElement>('[data-analytics-settings]')) {
    opener.hidden = false;
    opener.addEventListener('click', () => {
      refresh();
      returnFocus = opener;
      toggleEdited = false;
      showChoice();
      preferences.showModal();
      const body = preferences.querySelector<HTMLElement>('.analytics-dialog-body');
      if (body) body.scrollTop = 0;
    });
  }
  notice.querySelector('[data-analytics-dismiss]')?.addEventListener('click', () => {
    dismissed = true;
    try { sessionStorage.setItem(noticeKey, '1'); } catch { /* storage blocked */ }
    notice.hidden = true;
    doc.documentElement.classList.remove('analytics-notice-visible');
    win.dispatchEvent(new Event('analytics-clearance-change'));
    focusMain();
  });
  preferences.addEventListener('close', () => {
    if (returnFocus?.getClientRects().length) returnFocus.focus({ preventScroll: true });
    else focusMain();
    returnFocus = undefined;
  });

  // Dismiss only a full click on the backdrop, including its release.
  let backdropPressed = false;
  const onBackdrop = (event: MouseEvent) => {
    if (event.target !== preferences) return false;
    const { left, right, top, bottom } = preferences.getBoundingClientRect();
    return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
  };
  preferences.addEventListener('pointerdown', event => { backdropPressed = event.button === 0 && onBackdrop(event); });
  preferences.addEventListener('pointercancel', () => { backdropPressed = false; });
  preferences.addEventListener('click', event => {
    if (backdropPressed && onBackdrop(event)) preferences.close();
    backdropPressed = false;
  });
  preferences.addEventListener('keydown', event => {
    if (event.key === 'Escape') event.stopPropagation();
    if (event.key !== 'Tab') return;
    // Include every visible control even when the OS limits the browser's default tab order.
    const controls = [...preferences.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], summary')]
      .filter(el => el.getClientRects().length);
    const current = controls.indexOf(doc.activeElement as HTMLElement);
    const next = current + (event.shiftKey ? -1 : 1);
    const index = current === -1 && event.shiftKey ? controls.length - 1 : (next + controls.length) % controls.length;
    event.preventDefault();
    controls[index]?.focus();
  });

  // The fixed notice leaves room at the bottom of the page and clears a focused target it would cover.
  if ('adoptedStyleSheets' in doc && 'replaceSync' in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet();
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    let previous = -1;
    updateClearance = () => {
      const height = getComputedStyle(notice).position === 'fixed' ? notice.getBoundingClientRect().height : 0;
      const clearance = Math.ceil(height);
      if (clearance === previous) return;
      previous = clearance;
      sheet.replaceSync(`:root { --analytics-clearance: ${clearance}px }`);
      win.dispatchEvent(new Event('analytics-clearance-change'));
    };
    new ResizeObserver(updateClearance).observe(notice);
    updateClearance();
  }
  doc.addEventListener('focusin', event => {
    const target = event.target;
    if (notice.hidden || preferences.open || !(target instanceof HTMLElement) || notice.contains(target)
      || target.tabIndex < 0 || getComputedStyle(notice).position !== 'fixed') return;
    const box = target.getBoundingClientRect();
    const { top } = notice.getBoundingClientRect();
    if (box.bottom > top && box.top < win.innerHeight) win.scrollBy({ top: box.bottom - top + 8, behavior: 'instant' });
  });

  const sync = () => {
    choice = readChoice();
    refresh();
    if (preferences.open) showChoice();
  };
  win.addEventListener('storage', event => {
    if (event.storageArea === localStorage && (event.key === choiceKey || event.key === null)) sync();
  });
  win.addEventListener('pageshow', event => { if (event.persisted) sync(); });
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) refresh(); });
  refresh();
  if (!gpc && choice === null) {
    Promise.resolve().then(() => fetch('/privacy/analytics-policy', {
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(3000),
    })).then(response => response.ok && response.headers.get('content-type')?.includes('application/json') ? response.json() : null)
      .catch(() => null)
      .then(policy => {
        policyPending = false;
        defaultOn = policy?.mode === 'opt-out';
        refresh();
        if (preferences.open) showChoice();
      });
  }
}
