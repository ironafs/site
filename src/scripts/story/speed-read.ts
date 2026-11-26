import { onModeChange, storyEnhanced } from './mode';

/** Two successful examples of the same request path. Normal flow shows both. */
export function initSpeedRead(): void {
  const track = document.querySelector<HTMLElement>('#speed [data-read-track]');
  const card = track?.querySelector<HTMLElement>('.speed-read');
  const controls = card?.querySelector<HTMLFieldSetElement>('fieldset');
  const heading = card?.querySelector<HTMLElement>('h3');
  const reply = card?.querySelector<HTMLElement>('.speed-read-return');
  const header = document.getElementById('site-header');
  if (!track || !card || !controls || !heading || !reply || !header) return;

  const radios = [...controls.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const cases = [...card.querySelectorAll<HTMLElement>('[data-read-case]')];
  const status = card.querySelector<HTMLElement>('[data-read-announcement]');
  const banner = document.querySelector<HTMLElement>('[data-analytics-banner]');
  const viewport = window.visualViewport;
  let frame = 0;
  let measureNext = true;
  let holdTop = 0;
  let visibleTop = 0;
  let visibleBottom = 0;
  let distance = 0;
  let manual = false;

  const show = (path: string) => {
    const radio = radios.find(input => input.value === path);
    if (!radio) return;
    radio.checked = true;
    card.dataset.readPath = path;
  };

  const clearChoice = () => {
    if (!manual) return;
    manual = false;
    if (status) status.textContent = '';
  };

  const measure = () => {
    visibleTop = Math.ceil(header.getBoundingClientRect().bottom) + 10;
    const height = Math.min(innerHeight, viewport?.height ?? innerHeight);
    visibleBottom = Math.min(height, banner && !banner.hidden ? banner.getBoundingClientRect().top : height) - 10;
    const focusedControl = controls.contains(document.activeElement);
    let fits = storyEnhanced() && (viewport?.scale ?? 1) <= 1.01;
    if (fits) {
      // Measure the compact layout, with both outcomes occupying the same grid cell.
      track.setAttribute('data-read-hold', '');
      const spare = visibleBottom - visibleTop - card.offsetHeight;
      fits = spare >= 0 && card.scrollWidth <= card.clientWidth + 2;
      if (fits) {
        holdTop = visibleTop + Math.min(20, spare);
        track.style.setProperty('--speed-read-top', `${holdTop}px`);
        distance = parseFloat(getComputedStyle(track, '::after').height);
      }
    }
    track.toggleAttribute('data-read-hold', fits);
    if (!fits) {
      distance = 0;
      clearChoice();
      if (focusedControl) {
        heading.focus({ preventScroll: true });
        // Earlier story holds can collapse in the same mode change.
        requestAnimationFrame(() => {
          if (document.activeElement === heading) heading.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        });
      }
    }
  };

  const update = () => {
    frame = 0;
    if (measureNext) {
      measureNext = false;
      measure();
    }
    if (!distance) {
      track.removeAttribute('data-read-in-frame');
      return;
    }
    const bounds = track.getBoundingClientRect();
    const progress = (holdTop - bounds.top) / distance;
    const replyBounds = reply.getBoundingClientRect();
    track.toggleAttribute('data-read-in-frame', replyBounds.top >= visibleTop && replyBounds.bottom <= visibleBottom);
    if (bounds.bottom < visibleTop || bounds.top > visibleBottom) clearChoice();
    if (!manual) show(progress >= 0.53 ? 'server' : 'cache');
  };

  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const remeasure = () => { measureNext = true; schedule(); };

  controls.addEventListener('click', event => {
    if (event.target instanceof HTMLInputElement && radios.includes(event.target)) manual = true;
  });
  controls.addEventListener('change', event => {
    const radio = event.target;
    if (!(radio instanceof HTMLInputElement) || !radio.checked) return;
    manual = true;
    show(radio.value);
    if (status) status.textContent = cases.find(note => note.dataset.readCase === radio.value)?.querySelector('p')?.textContent ?? '';
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', remeasure);
  addEventListener('pageshow', remeasure);
  addEventListener('analytics-clearance-change', remeasure);
  viewport?.addEventListener('resize', remeasure);
  onModeChange(remeasure);
  const resize = new ResizeObserver(remeasure);
  for (const element of [card, header, banner]) if (element) resize.observe(element);
  document.fonts?.ready.then(remeasure);
  update();
}
