// Intro memory: the typed console plays once per browser. Every storage access can throw
// (Safari private mode, blocked site data), so each one is guarded; a failure means "not seen".

const KEY = 'ironafs-intro-seen';

/** @param {Storage | null | undefined} [storage] @returns {boolean} */
export function introSeen(storage) {
  try {
    return !!storage && storage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** @param {Storage | null | undefined} [storage] @returns {void} */
export function markIntroSeen(storage) {
  try {
    storage?.setItem(KEY, '1');
  } catch {
    /* storage unavailable: the intro simply plays again next time */
  }
}

/** @param {Window} win @returns {Storage | null} */
export function safeStorage(win) {
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
}

/** @param {Window} win @returns {boolean} */
export function wantsFullIntro(win) {
  let reduced = false;
  try {
    reduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* no matchMedia: treat as no preference */
  }
  return !introSeen(safeStorage(win)) && !reduced;
}
