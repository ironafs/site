// The markup is complete in flow. Motion adds sticky travel only where each panel fits between the header and notice.

const SHARE_END = 0.55;
const SWAP = 0.70;
const DENSITY_START = 0.716;
const DENSITY_END = 0.925;
const BAR_STARTS = [0.035, 0.285, 0.535, 0.785];
const BAR_RISE = 0.13;
const XDR_STEPS = [0.16, 0.34, 0.53, 0.72];
const EDGE = 10;
const CLEARANCE = 12;

type Band = { top: number; bottom: number };
type Hold = { track: HTMLElement; start: number; distance: number };

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function measureHold(track: HTMLElement, panelHeight: number, { top, bottom }: Band, inset: number, enabled: boolean): Hold | undefined {
  const spare = bottom - top - panelHeight;
  const fits = enabled && spare >= CLEARANCE && track.scrollWidth <= track.clientWidth + 2;
  track.toggleAttribute('data-sticky', fits);
  if (!fits) return;

  const holdTop = top + Math.min(inset, spare - CLEARANCE);
  track.style.setProperty('--rust-hold-top', `${holdTop}px`);
  const travel = parseFloat(getComputedStyle(track, '::after').height);
  const lead = Math.min(48, Math.max(0, bottom - holdTop - panelHeight - CLEARANCE));
  return { track, start: holdTop + lead, distance: lead + travel * 0.9 };
}

function progressIn({ track, start, distance }: Hold) {
  return clamp((start - track.getBoundingClientRect().top) / distance);
}

export function initRustMotion() {
  const section = document.getElementById('rust');
  if (!section) return;
  const stage = section.querySelector<HTMLElement>('.stage');
  const track = (name: string) => section.querySelector<HTMLElement>(`[data-rust-track="${name}"]`);
  const project = track('project');
  const fixtureTrack = track('fixture');
  const android = track('android');
  const share = track('share');
  const density = track('density');
  const fixture = fixtureTrack?.querySelector<HTMLElement>('.xdr-fixture');
  const shareCard = share?.querySelector<HTMLElement>('.android-card');
  const densityCard = density?.querySelector<HTMLElement>('.android-card');
  if (!stage || !project || !fixtureTrack || !android || !share || !density || !fixture || !shareCard || !densityCard) return;

  const header = document.getElementById('site-header');
  const following = document.getElementById('rust-cards');
  const notice = document.querySelector<HTMLElement>('[data-analytics-banner]');
  const columns = [...share.querySelectorAll<HTMLElement>('.chart-column')];
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const wide = matchMedia('(min-width: 980px)');
  const tall = matchMedia('(min-height: 700px)');
  const viewport = window.visualViewport;
  let fixtureHold: Hold | undefined;
  let androidHold: Hold | undefined;
  let frame = 0;
  let needsMeasure = true;
  let lastShare = -1;
  let lastDensity = -1;

  const measure = (top: number) => {
    const viewportBottom = Math.min(innerHeight, viewport?.height ?? innerHeight);
    const noticeTop = notice && !notice.hidden && getComputedStyle(notice).position === 'fixed'
      ? notice.getBoundingClientRect().top
      : viewportBottom;
    const bottom = Math.min(viewportBottom, noticeTop) - EDGE;
    const band = { top, bottom };
    const inset = wide.matches ? 26 : 12;
    const enabled = motion.matches && (viewport?.scale ?? 1) < 1.02 && !document.documentElement.classList.contains('static');

    // Clear a compact hold before measuring the project that contains it.
    const compact = measureHold(fixtureTrack, fixture.offsetHeight, band, inset, enabled && !wide.matches);
    const projectPanel = project.firstElementChild as HTMLElement;
    fixtureHold = compact ?? measureHold(project, projectPanel.offsetHeight, band, inset, enabled && wide.matches);
    if (compact) project.removeAttribute('data-sticky');

    // Both grid items must fit the same position. If either is too tall, keep both settled in flow.
    const height = Math.max(shareCard.offsetHeight, densityCard.offsetHeight);
    androidHold = measureHold(android, height, band, inset, enabled && tall.matches);
    if (androidHold) section.style.setProperty('--rust-rail-top', `${top + inset}px`);
  };

  const update = () => {
    frame = 0;
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && active.matches(':focus-visible') ? active : null;
    if (needsMeasure) {
      needsMeasure = false;
      const top = Math.ceil(header?.getBoundingClientRect().bottom ?? 0) + EDGE;
      const before = following?.getBoundingClientRect().top;
      const focusedTrack = [fixtureHold, androidHold].find(hold => focused && hold?.track.contains(focused))?.track;
      measure(top);
      if (focusedTrack && !focusedTrack.hasAttribute('data-sticky')) {
        // Releasing a hold can move a keyboard-focused link out of view.
        focused?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      } else if (following && before !== undefined && before <= top) {
        // Keep material below Rust in place as the holds add or remove space.
        const drift = following.getBoundingClientRect().top - before;
        if (Math.abs(drift) > 1) scrollBy({ top: drift, behavior: 'instant' });
      }
    }

    const fixtureProgress = fixtureHold && !fixture.contains(focused) ? progressIn(fixtureHold) : 1;
    const androidProgress = androidHold ? progressIn(androidHold) : 1;
    const focusShare = share.contains(focused);
    const focusDensity = density.contains(focused);
    const shareProgress = androidHold && !focusShare ? clamp(androidProgress / SHARE_END) : 1;
    const densityProgress = androidHold && !focusDensity ? clamp((androidProgress - DENSITY_START) / (DENSITY_END - DENSITY_START)) : 1;

    if (fixtureHold) fixture.dataset.xdrStep = String(XDR_STEPS.filter(step => fixtureProgress >= step).length);
    else fixture.removeAttribute('data-xdr-step');
    if (androidHold) android.dataset.androidPhase = focusDensity || (!focusShare && androidProgress >= SWAP) ? 'density' : 'share';
    else android.removeAttribute('data-android-phase');

    if (shareProgress !== lastShare) {
      lastShare = shareProgress;
      const active = shareProgress === 1 ? -1 : BAR_STARTS.findLastIndex(start => shareProgress >= start);
      columns.forEach((column, index) => {
        const growth = clamp((shareProgress - BAR_STARTS[index]) / BAR_RISE);
        column.toggleAttribute('data-active', index === active);
        column.toggleAttribute('data-pending', growth === 0);
        column.toggleAttribute('data-awaiting-label', growth < 1);
        column.style.setProperty('--bar-growth', String(growth));
      });
    }
    if (densityProgress !== lastDensity) {
      lastDensity = densityProgress;
      density.style.setProperty('--density-progress', String(densityProgress));
    }
  };

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function remeasure() {
    needsMeasure = true;
    schedule();
  }

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', remeasure, { passive: true });
  addEventListener('analytics-clearance-change', remeasure);
  viewport?.addEventListener('resize', remeasure, { passive: true });
  section.addEventListener('focusin', schedule);
  section.addEventListener('focusout', schedule);
  for (const query of [motion, wide, tall]) query.addEventListener('change', remeasure);
  const resize = new ResizeObserver(remeasure);
  for (const element of [stage, header, notice]) if (element) resize.observe(element);
  new MutationObserver(remeasure).observe(document.documentElement, { attributeFilter: ['class'] });
  update();
}
