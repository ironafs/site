// Starts the 3D hero after the page has loaded and the browser is idle, so the text and the poster are
// never waiting on three.js. The scene lives in its own chunk (a dynamic import). A first visit plays the
// intro; a return visit starts the scene at its finished state; reduced motion keeps the poster.
import type { HeroScene, Phase, StartAt } from './scene';
import { heroPaused, setHeroPaused } from './pause';
import { MIN_FPS, tierFor } from './tier';
import { hasWebGL2 } from './webgl';

export { MIN_FPS, tierFor };

type Live = { scene: HeroScene | null; canvas: HTMLCanvasElement; released: boolean };

const IDLE_TIMEOUT_MS = 1500;
/**
 * The console waits at most this long for the page load (an image that never answers), and then this long again
 * for the intro scene's first frame (a chunk request that never answers, a compile that hangs); past either, the
 * intro is given up: the poster returns, the console completes, and the late scene never starts. Only time with
 * the page shown and the hero on screen counts: no frame can be drawn otherwise. The intro needs 6.8 s before the
 * melt; this covers loading and compiling on a slow phone.
 */
export const WATCHDOG_MS = 12_000;

/**
 * A one-shot timer of `ms` that counts only while the tab is shown and its target is on screen, so a background tab
 * or a page scrolled past the hero never runs it out. arm() starts it over; disarm() stops it; watch() moves it to
 * another target (the scene's canvas, once there is one: the render loop runs only while the canvas is on screen).
 */
function visibleTimer(target: Element, ms: number, onFire: () => void): { arm(): void; disarm(): void; watch(el: Element): void } {
  let armed = false;
  let onScreen = true; // until the observer's first report
  let left = ms;
  let since = 0;
  let timer = 0;
  function pause() {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = 0;
    left -= performance.now() - since;
  }
  function sync() {
    pause();
    if (!armed || !onScreen || document.hidden) return;
    since = performance.now();
    timer = window.setTimeout(() => {
      timer = 0;
      armed = false;
      onFire();
    }, Math.max(0, left));
  }
  const observer = new IntersectionObserver(entries => {
    onScreen = entries[entries.length - 1].isIntersecting;
    sync();
  });
  observer.observe(target);
  document.addEventListener('visibilitychange', sync);
  return {
    arm() { pause(); armed = true; left = ms; sync(); },
    disarm() { armed = false; sync(); },
    watch(el) {
      if (el === target) return;
      observer.unobserve(target);
      target = el;
      observer.observe(el); // its first report comes at once and sets onScreen
    },
  };
}

/** Gives the main thread back (to paint, to type the console, to take a touch) before the next heavy step. */
function yieldToMain(): Promise<void> {
  const scheduler = (window as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise(resolve => window.setTimeout(resolve));
}

function onLoad(run: () => void): void {
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

function whenIdle(run: () => void): void {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
  else window.setTimeout(run, 200);
}

/**
 * While a scene is live it owns #hero[data-phase] and, from its first drawn frame, sets #hero[data-scene="live"]
 * (the poster gives way to the canvas). When an intro scene is on its way, #hero[data-await-melt] tells the
 * console to wait: it types when the melt starts (a hero:melt event). When a scene ends (stop, dispose, WebGL
 * context lost, an error in a frame, reduced motion turned on) or cannot start, the poster returns, data-phase is
 * "cooled" and #hero gets a hero:scene-end event, so the console completes at once. If no intro scene can run (no
 * WebGL2, found at idle), a hero:no-scene event lets the console type on its own.
 *
 * Every start (a first visit's, a return visit's, a replay's) takes a run token when it is decided; a later start
 * or a fallback takes a new one, so a start still waiting (for load, idle, the chunk, the fonts) finds itself stale
 * and never builds a scene.
 */
export function startHeroWhenIdle(hero: HTMLElement): void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const testHook = new URLSearchParams(window.location.search).has('test'); // the spec hook, never otherwise
  let current: Live | null = null;
  let token = 0;
  // the intro gave no frame in time: nothing still loading may start, and the visitor has not seen the intro
  const watchdog = visibleTimer(hero, WATCHDOG_MS, () => {
    if (current) release(current, false);
    fallBack(false);
  });

  /**
   * The poster is back, the phase is cooled and the console completes at once (marking the intro seen unless
   * `seen` is false). Final until the next replay: a start still under way finds itself stale.
   */
  function fallBack(seen = true): void {
    token++;
    watchdog.disarm();
    watchdog.watch(hero);
    delete hero.dataset.scene;
    delete hero.dataset.awaitMelt;
    hero.dataset.phase = 'cooled';
    hero.dispatchEvent(new CustomEvent('hero:scene-end', { detail: { seen } }));
  }

  /** Ends a scene for good: its canvas, listeners and GPU context go; the poster returns if it was the live one. */
  function release(live: Live, notify = true): void {
    if (live.released) return;
    live.released = true;
    live.canvas.remove();
    watchdog.watch(hero); // a removed canvas is never on screen: until the next one, the hero is what counts
    const wasCurrent = current === live;
    if (wasCurrent) {
      current = null;
      delete hero.dataset.scene; // no drawn scene is on the stage any more (a replay's comes with its first frame)
    }
    live.scene?.dispose(); // idempotent; its onEnd comes back here and returns at once
    if (wasCurrent && notify) fallBack();
  }

  /** An intro scene is on its way: the console waits for its melt, and the watchdog counts from now. */
  function awaitIntro(): void {
    hero.dataset.awaitMelt = '';
    watchdog.arm();
  }

  async function run(startAt: StartAt, mine: number): Promise<void> {
    const awaited = startAt === 'intro'; // the console is waiting for this scene's melt
    // The page load had its own WATCHDOG_MS; the scene's chunks, build and first frame get theirs from here.
    if (awaited) watchdog.arm();
    const started = performance.now();
    // ?test: when the chunks and fonts were in, the scene built, the first frame drawn (ms from the run's start)
    const stamps: Record<string, number> = {};
    const stamp = (name: string) => { if (testHook) { stamps[name] = Math.round(performance.now() - started); hero.dataset.timings = JSON.stringify(stamps); } };
    let mod: typeof import('./scene');
    let stage: typeof import('./stage');
    try {
      [mod, stage] = await Promise.all([import('./scene'), import('./stage')]);
      await stage.preloadLabelFonts();
      stamp('loaded');
    } catch {
      if (mine === token && awaited) fallBack(); // the chunk failed to load: the poster and a complete console
      return;
    }
    if (mine !== token) return;
    // The chunk's evaluation and the scene's build are each long on a phone: never one task
    await yieldToMain();
    if (mine !== token) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'hero-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    hero.prepend(canvas);
    watchdog.watch(canvas); // the first frame can come only while the canvas itself is on screen
    const live: Live = { scene: null, canvas, released: false };
    const tier = tierFor(window);
    // Software GL (the specs) is far below 30 fps: under ?test the watch is off unless ?test&fps=<n> asks for it.
    const fpsParam = new URLSearchParams(window.location.search).get('fps');
    const minFps = testHook ? Number(fpsParam) || 0 : MIN_FPS[tier];
    if (testHook) hero.dataset.fpsFloor = String(MIN_FPS[tier]); // the floor a visitor gets on this tier
    let scene: HeroScene | null = null;
    try {
      scene = await mod.createScene(canvas, {
        tier,
        minFps,
        startAt,
        onPhase: (phase: Phase, t: number) => {
          hero.dataset.phase = phase;
          if (testHook) hero.dataset[`t${phase[0].toUpperCase()}${phase.slice(1)}`] = t.toFixed(3);
          if (phase === 'melt' && current === live && mine === token) {
            delete hero.dataset.awaitMelt;
            hero.dispatchEvent(new CustomEvent('hero:melt')); // the console types now
          }
        },
        modules: [stage.createStage(testHook ? hero : undefined)],
        onEnd: () => {
          const building = current !== live && mine === token && !live.released;
          release(live);
          // the scene ended before it was installed (its context lost during the build): abandon the build now
          // (the run token), and an awaited intro falls back at once instead of waiting for the watchdog
          if (building) {
            if (awaited) fallBack();
            else token++;
          }
        },
        onFirstFrame: () => {
          if (current !== live || mine !== token) return;
          if (awaited) watchdog.disarm();
          hero.dataset.scene = 'live';
          stamp('frame');
          if (testHook) hero.dataset.firstFrameMs = String(Math.round(performance.now() - started));
        },
        // ?test: the scene clock, and data-frames, a count of drawn frames (the Rust word's spec checks it holds)
        onTick: testHook ? t => { hero.dataset.t = t.toFixed(3); hero.dataset.frames = String(Number(hero.dataset.frames || 0) + 1); } : undefined,
        // The build runs a task per part; between parts a replay, reduced motion or the watchdog may
        // have moved on (the token): the build is then abandoned and frees what it made.
        pause: async () => {
          await yieldToMain();
          if (mine !== token) throw new Error('IronAFS hero: build abandoned');
        },
      });
    } catch {
      scene = null;
    }
    if (mine !== token) { // a newer run (or a fallback) owns the hero now: leave its state alone
      scene?.dispose();
      canvas.remove();
      return;
    }
    if (!scene) {
      canvas.remove();
      if (awaited) fallBack(); // a scene that cannot start leaves the poster and a complete console
      return;
    }
    live.scene = scene;
    current = live;
    stamp('built');
    try {
      scene.setPaused(heroPaused(window));
      scene.start();
    } catch (error) {
      console.warn('IronAFS hero: the 3D scene failed to start; showing the poster instead.', error);
      release(live); // a scene that throws as it starts ends like any other: the poster and a complete console
    }
  }

  // The pre-paint gate decided whether this is a first visit. Read it now: the console rewrites data-intro
  // when it starts and marks the intro seen when it ends, so recomputing wantsFullIntro later would be wrong.
  // A first visit marks the wait at once (the console starts before the scene can), on a cheap check: the real
  // WebGL2 probe makes a context, so it waits for idle, off the first paint. A return visit starts at the finished
  // state, with the poster shown until the scene's first frame; without WebGL2 it never downloads the 3D chunk.
  // The watchdog counts from the moment the console waits, so a load event that never comes is covered too.
  // The head gate ran before this module: reduced motion (or the visitor's pause) may have been turned on since, so
  // both are read again now. Either keeps the poster; the console leaves its finished text (console.ts).
  const still = () => motion.matches || heroPaused(window);
  if (document.documentElement.dataset.intro === 'play' && !still()) {
    if ('WebGL2RenderingContext' in window) {
      awaitIntro();
      const mine = ++token;
      onLoad(() => whenIdle(() => {
        if (mine !== token) return; // a replay or a fallback came first
        if (hasWebGL2()) void run('intro', mine);
        else {
          watchdog.disarm();
          delete hero.dataset.awaitMelt;
          hero.dispatchEvent(new CustomEvent('hero:no-scene')); // the console types on its own
        }
      }));
    }
  } else if (!still()) {
    const mine = ++token;
    onLoad(() => whenIdle(() => { if (mine === token && hasWebGL2()) void run('finished', mine); }));
  }

  hero.addEventListener('hero:replay', () => {
    if (motion.matches) return;
    // the visitor asked for the intro: that ends a pause (its own start, below, is then overtaken by this one)
    if (heroPaused(window)) setHeroPaused(document, false);
    const mine = ++token; // a start still waiting (the return visit's, an earlier replay's) never runs
    // One live context at a time, and none beside the probe: the old scene goes now, silently (the console is
    // replaying), so it can neither melt nor end into the new run.
    if (current) release(current, false);
    if (hasWebGL2()) {
      awaitIntro();
      void run('intro', mine);
    } else {
      watchdog.disarm();
      delete hero.dataset.awaitMelt; // the console types on its own
    }
  });

  // The visitor's pause control (pause.ts). Paused: a scene at rest keeps its last frame and stops; an intro still
  // on its way to its melt goes as under reduced motion (the poster and a complete console), and nothing still
  // loading starts. Played again: the scene comes back at rest, as on a return visit.
  hero.addEventListener('hero:pause', event => {
    const paused = (event as CustomEvent<{ paused: boolean }>).detail.paused;
    if (paused) {
      if (hero.dataset.awaitMelt !== undefined) {
        if (current) release(current);
        else fallBack();
      } else if (current) current.scene?.setPaused(true);
      else token++;
      return;
    }
    if (current) current.scene?.setPaused(false);
    else if (!motion.matches) {
      const mine = ++token;
      if (hasWebGL2()) void run('finished', mine);
    }
  });

  // Reduced motion turned on mid-session: the scene goes,
  // and nothing still loading starts.
  motion.addEventListener('change', () => {
    if (!motion.matches) return;
    if (current) release(current); // the poster and a complete console
    else if (hero.dataset.awaitMelt !== undefined) fallBack();
    else token++; // a return visit's start still waiting
  });
}
