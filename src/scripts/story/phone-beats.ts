// SPDX-FileCopyrightText: 2026 Adrian Ana <adrian@adrianana.com>
// SPDX-License-Identifier: GPL-3.0-or-later

import { onModeChange, PHONE_STORY_QUERY, TABLET_STORY_QUERY, storyEnhanced } from './mode';

interface Hold {
  beat: HTMLElement;
  distance: number;
  lead: number;
  progress: number;
}

export function initPhoneBeats(): void {
  const beats = [...document.querySelectorAll<HTMLElement>('.phone-beat')];
  const header = document.getElementById('site-header');
  if (!beats.length || !header) return;
  const root = document.documentElement;
  const phone = matchMedia(PHONE_STORY_QUERY);
  const tablet = matchMedia(TABLET_STORY_QUERY);
  const viewport = window.visualViewport;
  const sections = [...document.querySelectorAll<HTMLElement>('#cost, #platforms, #design, #rust')];
  const terminal = document.querySelector<HTMLElement>('#cost .afs');
  let holds: Hold[] = [];
  let top = 0;
  let bottom = 0;
  let scrollFrame = 0;

  const paint = () => {
    scrollFrame = 0;
    // Read the geometry together before writing the progress of any scene.
    const progress = holds.map(({ beat, distance, lead }) => {
      const approach = top + lead - beat.getBoundingClientRect().top;
      return Math.round(1000 * Math.max(0, Math.min(1, approach / (0.9 * distance + lead)))) / 1000;
    });
    const terminalBox = terminal?.dataset.terminal === 'waiting' ? terminal.getBoundingClientRect() : undefined;
    holds.forEach((hold, i) => {
      if (progress[i] === hold.progress) return;
      hold.beat.style.setProperty('--phone-beat-progress', String(progress[i]));
      if (hold.beat.firstElementChild?.matches('#rust .ph1')) {
        hold.beat.dataset.chartStep = String(Math.min(4, Math.floor(progress[i] / 0.22) + 1));
      }
      hold.progress = progress[i];
    });
    if (terminal && terminalBox) {
      if (terminalBox.top < top - 1) terminal.dataset.terminal = 'done';
      else if (terminalBox.bottom <= bottom) terminal.dataset.terminal = 'playing';
    }
  };
  const onScroll = () => {
    if ((holds.length || terminal?.dataset.terminal === 'waiting') && !scrollFrame) scrollFrame = requestAnimationFrame(paint);
  };
  terminal?.addEventListener('animationend', event => {
    if (event.animationName === 'compact-terminal-output' && (event.target as Element).matches('.design')) {
      terminal.dataset.terminal = 'done';
    }
  });

  for (const beat of beats) {
    const steps = [...beat.querySelectorAll<HTMLElement>('[data-step]')];
    const total = Math.max(1, ...steps.map(step => Number(step.dataset.step) + Number(step.dataset.span ?? 1)));
    for (const step of steps) {
      const start = Number(step.dataset.step);
      step.style.setProperty('--beat-start', String(start / total));
      step.style.setProperty('--beat-end', String((start + Number(step.dataset.span ?? 1)) / total));
    }
  }

  const measure = () => {
    const enabled = storyEnhanced(true) && (phone.matches || tablet.matches) && (viewport?.scale ?? 1) <= 1.01;
    root.toggleAttribute('data-phone-story', enabled);
    for (const section of sections) {
      if (enabled && (phone.matches || ['cost', 'platforms'].includes(section.id) || section.classList.contains('story--flow'))) {
        section.dataset.compactScenes = phone.matches ? 'phone' : 'tablet';
      } else delete section.dataset.compactScenes;
    }
    const style = getComputedStyle(root);
    const stableHeight = parseFloat(style.getPropertyValue('--phone-beat-viewport')) || innerHeight;
    const notice = parseFloat(style.getPropertyValue('--analytics-clearance')) || 0;
    top = Math.ceil(header.getBoundingClientRect().height) + 8;
    bottom = Math.min(stableHeight, innerHeight, viewport?.height ?? innerHeight) - notice - 8;
    const available = bottom - top - 8;
    holds = [];
    for (const beat of beats) {
      const panel = beat.firstElementChild as HTMLElement | null;
      const fits = beat.closest('[data-compact-scenes]') && panel
        && panel.offsetHeight <= available && panel.scrollWidth <= panel.clientWidth + 2;
      beat.toggleAttribute('data-hold', !!fits);
    }
    for (const beat of beats) {
      if (!beat.hasAttribute('data-hold')) continue;
      const distance = parseFloat(getComputedStyle(beat, '::after').height);
      const lead = Math.max(0, available - (beat.firstElementChild as HTMLElement).offsetHeight);
      if (distance > 0) holds.push({ beat, distance, lead, progress: -1 });
    }
    if (terminal && terminal.dataset.terminal !== 'done') {
      const fits = terminal.closest('[data-compact-scenes]') && terminal.offsetHeight <= available;
      if (fits) terminal.dataset.terminal ??= 'waiting';
      else if (terminal.dataset.terminal === 'playing') terminal.dataset.terminal = 'done';
      else delete terminal.dataset.terminal;
    }
    if (holds.length || terminal?.dataset.terminal === 'waiting') addEventListener('scroll', onScroll, { passive: true });
    else removeEventListener('scroll', onScroll);
    onScroll();
  };

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(header);
  for (const beat of beats) if (beat.firstElementChild) observer.observe(beat.firstElementChild);
  const modes = new MutationObserver(schedule);
  for (const section of sections) modes.observe(section, { attributes: true, attributeFilter: ['class'] });
  phone.addEventListener('change', schedule);
  tablet.addEventListener('change', schedule);
  viewport?.addEventListener('resize', schedule);
  addEventListener('resize', schedule);
  addEventListener('analytics-clearance-change', schedule);
  onModeChange(schedule, true);
  document.fonts?.ready.then(schedule);
  measure();
}
