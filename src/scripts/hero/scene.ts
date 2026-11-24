// The hero's 3D scene shell: renderer, ACES tone mapping, one
// spotlight with soft shadows, the iron floor, the room environment, the fixed camera, the fog tied to
// the camera distance and the bloom. The chip and letters, the melt, fire and embers, and the phone
// tier plug in as modules (see SceneModule): they get the scene's objects and run from its clock.
import {
  ACESFilmicToneMapping, Color, Fog, HemisphereLight, MathUtils, Mesh, MeshStandardMaterial, type Object3D, PCFShadowMap,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, SpotLight, Texture, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type Phase = 'chip' | 'drop' | 'melt' | 'cooled';
export type Tier = 'desktop' | 'phone';
/** 'intro': the whole sequence from the chip alone; 'finished': straight to the cooled word at rest (a return visit). */
export type StartAt = 'intro' | 'finished';

export type SceneContext = {
  tier: Tier;
  startAt: StartAt;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  spot: SpotLight;
  /** The room environment. Assign it to a material together with its envMapIntensity (see the floor). */
  envMap: Texture;
  /** Sets the phase (once per change) and reports it to onPhase. */
  setPhase(phase: Phase): void;
  /** The word's width in scene units: sets how far back the camera sits. Called once the letters exist. */
  setWordWidth(width: number): void;
  /** The scene clock in seconds: advances only while the loop runs (never while off screen or hidden). */
  readonly clock: number;
  /** Shakes the camera: `amount` decays on its own (a landing is about 0.1, a strike 0.2). */
  shake(amount: number): void;
  /** Ends the scene (the poster returns): the same path as stop(). */
  end(): void;
  /**
   * While the scene is being built: gives the main thread back (one task per part of the build, the
   * long-task budget) and rejects if the build is no longer wanted (createScene then frees what was built).
   */
  pause(): Promise<void>;
};

/** A part of the scene (chip, letters, melt, fire, embers, haze) that runs from the scene's loop. */
export type SceneModule = {
  update?(t: number, dt: number): void;
  resize?(width: number, height: number): void;
  dispose?(): void;
};

export type SceneOptions = {
  tier: Tier;
  startAt?: StartAt;
  onPhase: (phase: Phase, t: number) => void;
  /** Called once when the scene ends for any reason: stop, dispose or a lost WebGL context. */
  onEnd?: () => void;
  modules?: Array<(ctx: SceneContext) => SceneModule | Promise<SceneModule>>;
  /** Between the parts of the build: yields to the main thread, and rejects to abandon the build. Default: none. */
  pause?: () => Promise<void>;
  /** The scene stops (the poster returns) if its first two seconds average below this frame rate. 0: no watch. */
  minFps?: number;
  /** The ?test hook: called every frame with the scene clock. */
  onTick?: (t: number) => void;
  /** Called once, after the first frame has been drawn and its shaders checked (the poster can give way to the canvas). */
  onFirstFrame?: () => void;
};

/** The first window's length for the frame-rate fallback. */
export const FPS_WINDOW_S = 2;
/** The frame-rate window opens after the warm-up compile, or after this long if that compile never settles. */
const WARM_TIMEOUT_MS = 3000;

/** A frame-rate watch: count each completed render with frame(); setActive(false) while nothing can be drawn. */
export type FpsWatch = { frame(): void; setActive(active: boolean): void; stop(): void };

/**
 * Watches the frame rate over one window of `seconds` and calls `onLow` if the renders it was told of (frame())
 * averaged below `minFps`. Only time in which the scene could draw counts: while it is inactive (off screen, stopped,
 * paused) or the tab is hidden, the window is put aside and starts over when drawing can resume, so a window spent
 * off screen is never a verdict. A window in which no frame ran proves nothing either, so it starts over too. The
 * check runs on a timer, so a main thread too slow to draw frames still gets its verdict.
 */
export function watchFps(seconds: number, minFps: number, onLow: () => void): FpsWatch {
  let frames = 0;
  let start = 0;
  let timer = 0;
  let active = true;
  let done = false;
  const counting = () => active && !document.hidden && !done;
  function open() {
    window.clearTimeout(timer);
    timer = 0;
    frames = 0;
    if (!counting()) return;
    start = performance.now();
    timer = window.setTimeout(check, seconds * 1000);
  }
  function check() {
    timer = 0;
    if (!counting() || frames === 0) return open();
    const fps = frames / ((performance.now() - start) / 1000);
    stop();
    if (fps < minFps) onLow();
  }
  function stop() {
    done = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', open);
  }
  document.addEventListener('visibilitychange', open); // hidden: the window is set aside; shown: a new one opens
  open();
  return {
    frame() { if (timer) frames++; },
    setActive(next) {
      if (next === active) return;
      active = next;
      open();
    },
    stop,
  };
}

/** setPaused: the visitor's pause control; a paused scene keeps its last frame and its clock stands still. */
export type HeroScene = { start(): void; stop(): void; dispose(): void; setPaused(paused: boolean): void };

const BG = 0x0a0a0b;
const LOOK = new Vector3(0, 1.55, 0); // aim above the word, so the scene sits lower, under the console
const CAMERA_Y = 2.6;
/**
 * The camera frames the full-width word.
 * The room comes from the console (four lines) and the one-line headline: the floor line sits this share of the 16:10
 * picture lower than the original framing had it, so the chip-and-letters stack of the intro, ~41% of the picture tall, tops out
 * under the console panel (tests/e2e/hero-console-clear.spec.mjs) and the word at rest ends just above the status
 * line. The poster is rendered with the same framing.
 */
const FLOOR_DROP = 0.04;

const FOV = 22;
// Until the letters report their width the shell frames the word at its design size.
const DEFAULT_WORD_WIDTH = 6.6;
const MAX_DT = 0.1; // a stalled frame never jumps the clock
/** The poster's shape (2880x1800): the camera frames for it (see frame()). */
export const POSTER_ASPECT = 2880 / 1800;

/**
 * Builds the scene in parts, a task each (opts.pause between them): on a phone the whole build in one task was
 * Resolves to null when there is no drawable scene.
 * WebGL2, when the build fails, or when a pause rejects (the build is abandoned): the renderer and its context are
 * freed in each case.
 */
export async function createScene(canvas: HTMLCanvasElement, opts: SceneOptions): Promise<HeroScene | null> {
  let renderer: WebGLRenderer;
  try { // no WebGL at all: the renderer throws (the loader has already probed; no second throwaway context here)
    renderer = new WebGLRenderer({ canvas, antialias: true });
  } catch {
    return null;
  }
  try {
    if (!renderer.capabilities.isWebGL2) throw new Error('not WebGL2');
    return await build(canvas, opts, renderer);
  } catch {
    // Anything failing while the scene is built frees the renderer and its context: the caller falls back to the poster.
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
}

async function build(canvas: HTMLCanvasElement, opts: SceneOptions, renderer: WebGLRenderer): Promise<HeroScene> {
  let ended = false;
  // Between the parts of the build: the caller's pause, then a check that the scene has not ended and its context
  // is still there (lost while a part was waiting): the build is abandoned like one the caller no longer wants.
  const pause = async () => {
    await opts.pause?.();
    if (ended || renderer.getContext().isContextLost()) throw new Error('IronAFS hero: the context was lost while the scene was being built');
  };
  // A shader that fails to compile or link draws nothing and throws nothing: three.js reports it here, and the
  // next frame ends the scene (the poster returns) instead of leaving a blank canvas live.
  let shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.tier === 'phone' ? 1.5 : 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const phoneTier = opts.tier === 'phone';

  await pause(); // the renderer and its context
  const scene = new Scene();
  scene.background = new Color(BG);
  scene.fog = new Fog(BG, 16, 34);
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTarget = pmrem.fromScene(envScene, 0.04);
  const envMap = envTarget.texture;
  scene.environment = envMap;
  envScene.dispose();
  pmrem.dispose();
  await pause(); // the room environment, one synchronous render

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);

  // lighting: a spotlight pool on the floor (casts the shadows) + a faint fill
  const spot = new SpotLight(0xfff1e0, 420, 30, 0.5, 0.65, 2);
  spot.position.set(-2.5, 9, 6);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(phoneTier ? 1024 : 2048, phoneTier ? 1024 : 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.radius = 6;
  scene.add(spot, spot.target);
  scene.add(new HemisphereLight(0x8090a0, 0x100804, 0.25));

  const floor = new Mesh(
    new PlaneGeometry(80, 40),
    // three r163+: envMapIntensity scales only a material's own envMap, never scene.environment (which
    // lights at full strength). The mockup's values were tuned on r160, so each material that sets an
    // envMapIntensity must also get ctx.envMap.
    new MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.3, roughness: 0.85, envMap, envMapIntensity: 0.1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // phones: the canvas is small (a 16:10 band 390 px wide), so the same bloom spreads over most of it and greys
  // the fire's peak; a weaker, tighter bloom keeps it as rich as on the desktop
  const bloom = new UnrealBloomPass(new Vector2(1, 1), phoneTier ? 0.36 : 0.5, phoneTier ? 0.22 : 0.35, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  await pause();

  let wordWidth = DEFAULT_WORD_WIDTH;
  let baseZ = 16;
  const look = LOOK.clone();
  let clock = 0;
  let phase: Phase | null = null;
  let disposed = false;
  let contextLost = false;
  let running = false;
  let compiled = false; // the first compile has settled: the loop may run
  let paused = false; // the visitor's pause control (setPaused)
  let visible = true;
  let raf = 0;
  let last = 0;
  let shake = 0;
  let drawn = false;
  let fps: FpsWatch | null = null;
  const modules: SceneModule[] = [];

  const ctx: SceneContext = {
    tier: opts.tier, startAt: opts.startAt ?? 'intro', renderer, scene, camera, composer, bloom, spot, envMap,
    setPhase(next) {
      if (next === phase || ended) return;
      phase = next;
      opts.onPhase(next, clock);
    },
    setWordWidth(w) { wordWidth = w; frame(); },
    get clock() { return clock; },
    shake(amount) { shake = Math.max(shake, amount); },
    end() { end(); },
    pause,
  };

  /**
   * The camera frames the word as the poster does (a 16:10 picture, the word ~65% of its width), and a canvas
   * of another shape shows that frame the way `object-fit: cover` crops the poster: a narrower box loses the
   * sides (same camera), a wider one loses top and bottom (a narrower field of view). So the poster and the
   * canvas line up at every size, and the swap between them does not move.
   */
  function frame() {
    const tanHalf = Math.tan(MathUtils.degToRad(FOV / 2));
    const fitW = wordWidth * 1.45 + 1;
    const wordFit = (wordWidth * 1.1 + 0.4) / 2 / tanHalf / camera.aspect; // only a very narrow box needs this (never in the layout)
    baseZ = Math.max(16, fitW / 2 / tanHalf / POSTER_ASPECT, wordFit); // where the original framing's camera stood
    camera.fov = camera.aspect > POSTER_ASPECT ? MathUtils.radToDeg(2 * Math.atan((tanHalf * POSTER_ASPECT) / camera.aspect)) : FOV;
    // the fog moves with the camera: a narrow window pulls the camera back, which must not push the word into the fog
    (scene.fog as Fog).near = baseZ + 2;
    (scene.fog as Fog).far = baseZ + 20;
    // aim so the floor line sits FLOOR_DROP of the picture's height below where the original framing's camera had it: on the
    // picture's centre line a point's height is the tangent of its angle below the view axis, over tanHalf
    const mockupBelowLook = Math.atan(CAMERA_Y / baseZ) - Math.atan((CAMERA_Y - LOOK.y) / baseZ);
    const floorBelowLook = Math.atan(Math.tan(mockupBelowLook) + 2 * tanHalf * FLOOR_DROP);
    look.y = CAMERA_Y - baseZ * Math.tan(Math.atan(CAMERA_Y / baseZ) - floorBelowLook);
    camera.position.set(0, CAMERA_Y, baseZ);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false); // false: the stylesheet sizes the canvas (no inline style under the CSP)
    composer.setSize(w, h);
    bloom.setSize(phoneTier ? w / 2 : w, phoneTier ? h / 2 : h); // phones: bloom at half resolution
    camera.aspect = w / h;
    frame();
    for (const m of modules) m.resize?.(w, h);
  }

  const resizeObserver = new ResizeObserver(resize);
  const visibility = new IntersectionObserver(entries => {
    visible = entries[entries.length - 1].isIntersecting;
    sync();
  });
  const onHidden = () => sync();
  const onLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    dispose();
  };

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    try {
      frameAt(now);
    } catch (error) {
      console.warn('IronAFS hero: a frame of the 3D scene failed; showing the poster instead.', error);
      dispose(); // an error in a frame ends the scene like a lost context: the poster and a complete console
    }
  }

  function frameAt(now: number) {
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    clock += dt;
    for (const m of modules) {
      m.update?.(clock, dt);
      if (ended) return; // a module ended the scene (and, through onEnd, may have disposed it and the rest)
    }
    // fixed camera: the pointer never moves the view; only a landing or a strike shakes it
    shake *= 0.87;
    camera.position.set((Math.random() - 0.5) * shake, CAMERA_Y + (Math.random() - 0.5) * shake, baseZ);
    camera.lookAt(look);
    composer.render();
    // a frame counts as drawn only if every program it used compiled and linked, on a context still there
    if (shaderFailed) throw new Error('a shader failed to compile or link');
    if (renderer.getContext().isContextLost()) return; // webglcontextlost is on its way: it ends the scene
    fps?.frame();
    if (!drawn) {
      drawn = true;
      opts.onFirstFrame?.();
      // the two seconds of drawing after the warm-up compile decide whether the device can play the scene at all
      // (a shader-link hitch in that compile is no verdict on the frame rate)
      void warmLater().then(() => {
        if (!opts.minFps || ended) return;
        fps = watchFps(FPS_WINDOW_S, opts.minFps, end);
        fps.setActive(drawing());
      });
    }
    opts.onTick?.(clock);
  }

  /** Whether frames can run: started (its first compile settled), not paused, on screen, the tab shown. */
  function drawing() {
    return running && compiled && !paused && visible && !document.hidden && !ended;
  }

  /** Runs the loop only while drawing() holds; the frame-rate watch counts only that time. */
  function sync() {
    const should = drawing();
    fps?.setActive(should);
    if (should && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!should && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  /**
   * The first frame compiles only what it shows. Everything still hidden (the pool, the beads, the fire, the
   * embers) is compiled once the browser is idle after it, long before the melt needs it, so the melt starts
   * without a hitch and the first frame comes sooner. Resolves when that compile is done, or after
   * WARM_TIMEOUT_MS if it never settles (the frame-rate watch waits on it and must always open).
   */
  function warmLater(): Promise<void> {
    const idle = (run: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(run, { timeout: 1000 }) : window.setTimeout(run, 50));
    return new Promise<void>(resolve => idle(() => {
      if (ended) return resolve();
      const hidden: Object3D[] = [];
      scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
      if (!hidden.length) return resolve();
      // compile() reads visibility now, synchronously: no frame is drawn before it is restored. A throw (compileAsync
      // compiles before it returns its promise) or a rejection is a failed compile: the next frame ends the scene.
      let warmed: Promise<unknown>;
      try {
        warmed = renderer.compileAsync(scene, camera).catch(() => { shaderFailed = true; });
      } catch {
        shaderFailed = true;
        warmed = Promise.resolve();
      } finally {
        for (const o of hidden) o.visible = false;
      }
      window.setTimeout(resolve, WARM_TIMEOUT_MS);
      void warmed.then(() => resolve());
    }));
  }

  function end() {
    if (ended) return;
    ended = true;
    running = false;
    sync();
    opts.onEnd?.();
  }

  function disposeModules() {
    for (const m of modules) m.dispose?.();
    modules.length = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    end();
    resizeObserver.disconnect();
    visibility.disconnect();
    document.removeEventListener('visibilitychange', onHidden);
    fps?.stop();
    canvas.removeEventListener('webglcontextlost', onLost);
    disposeModules();
    scene.traverse(o => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) m.dispose();
    });
    envTarget.dispose();
    for (const pass of composer.passes) pass.dispose?.();
    composer.dispose();
    renderer.dispose();
    if (!contextLost) renderer.forceContextLoss(); // free the GL context now (browsers cap live contexts)
  }

  canvas.addEventListener('webglcontextlost', onLost);
  document.addEventListener('visibilitychange', onHidden);
  try {
    for (const make of opts.modules ?? []) {
      modules.push(await make(ctx));
      if (ended) throw new Error('IronAFS hero: the context was lost while the scene was being built');
    }
    await pause();
    resizeObserver.observe(canvas);
    visibility.observe(canvas);
    resize();
  } catch (error) {
    // A module factory (or the first resize) threw, or the scene ended (its context lost) while a part was being
    // built: release the listeners and the modules built so far, including one that finished after the scene ended,
    // without reporting an end (the caller falls back like any build failure).
    ended = true;
    dispose();
    disposeModules();
    throw error;
  }

  return {
    start() {
      if (running || ended) return;
      running = true;
      ctx.setPhase(ctx.startAt === 'finished' ? 'cooled' : 'chip');
      // compile what the first frame shows before it, so the intro never starts with a hitch (the rest: warmLater).
      // compileAsync compiles synchronously before it returns its promise: a throw there, or a rejection, ends the
      // scene; the loop starts only once it has settled.
      const failed = (error: unknown) => {
        console.warn('IronAFS hero: the 3D scene failed to compile; showing the poster instead.', error);
        dispose();
      };
      try {
        renderer.compileAsync(scene, camera).then(() => { compiled = true; sync(); }, failed);
      } catch (error) {
        failed(error);
      }
    },
    stop() { end(); },
    dispose,
    setPaused(next) {
      paused = next;
      sync();
    },
  };
}
