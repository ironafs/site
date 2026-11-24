// The 3D Rust word: "Rust" in three.js, in the hero's cast iron with rust (makeLetterMaterial, the
// same glyph file, the same room environment, tone mapping and spotlight), over the CSS word's box. It starts as
// polished steel with a sheen sweeping across it, then rust breaks out in four spots (where the CSS word's radial
// masks are) and spreads over the word as #rust scrolls: the loader passes the section's progress, and the rust
// amount is that progress over its first 40%. It renders straight to a transparent canvas (no bloom: nothing here
// glows), so the section's art shows around the letters.
import {
  ACESFilmicToneMapping, type CanvasTexture, Group, HemisphereLight, MathUtils, Mesh, type MeshStandardMaterial,
  PerspectiveCamera, PMREMGenerator, Scene, SpotLight, Vector2, Vector4, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import typeface from '../../assets/hero/letters.typeface.json';
import { type IronTextures, ironTextures, makeLetterMaterial } from '../hero/letters';
import { FPS_WINDOW_S, type FpsWatch, watchFps } from '../hero/scene';

/** Why the word ended on its own: below the frame-rate floor, a lost WebGL context, or an error in a frame. */
export type EndReason = 'floor' | 'context' | 'error';
/** A box in the canvas's CSS pixels. */
export type Box = { left: number; top: number; width: number; height: number };

export type RustWordOptions = {
  /** The word (story.rust.word). Every glyph must be in letters.typeface.json (brand/src/glyphs.py WORD_GLYPHS). */
  word: string;
  /** Where the CSS word sits, relative to the canvas: the 3D word is framed to fill its width there. */
  box(): Box;
  /** #rust's scroll progress, 0 (its top at the viewport's top) to 1 (its bottom at the viewport's bottom). */
  progress(): number;
  /** The word ends ('floor') if its first two seconds average below this frame rate. 0: no watch. */
  minFps: number;
  /** Called once if the word ends on its own (never after dispose()). */
  onEnd(reason: EndReason): void;
  /** Called once, after the first frame has been drawn (the CSS word can give way). */
  onFirstFrame?(): void;
  /** The ?test hook: called every drawn frame with the rust amount. */
  onFrame?(rust: number): void;
};

export type RustWord = { start(): void; dispose(): void };

/** The rust amount over scroll: 0 -> 1 over the first 40% of #rust (the CSS word's spread, rust.css). */
export const RUST_SPAN = 0.4;
/** The sheen sweeps across the steel over this part of #rust (the CSS word's sheen, contain 0% to 18%). */
const SHEEN_SPAN = 0.18;
/** The compile before the first frame must settle within this long, or the word ends ('error'): the CSS word stays. */
const COMPILE_TIMEOUT_MS = 5000;

const SIZE = 1.5;
/** The CSS word's letter-spacing, -0.06em; a glyph file em is 100000 / 72 / resolution of the size (glyphs.py). */
const TRACK = -0.06 * (100000 / 72 / typeface.resolution) * SIZE;
const DEPTH = 0.5;
const FOV = 22;
/** The word leans back a little, so its bevel and top faces catch the light. */
const TILT = 0.14;

/**
 * The four rust spots, where the CSS word's radial masks are (x, y from the top-left of its box, in parts of it),
 * and their radii over the rust amount: the CSS keyframes rs-rwSpread, at 0, 25, 55 and 100%.
 */
const SPOTS: Array<[x: number, y: number]> = [[0.18, 0.7], [0.46, 0.3], [0.7, 0.75], [0.9, 0.35]];
const RADII_AT = [0, 0.25, 0.55, 1];
const RADII: number[][] = [[0, 14, 34, 80], [0, 0, 18, 70], [0, 4, 22, 70], [0, 0, 8, 60]];

/** Each spot's radius (in parts of the CSS gradient's reference length) at rust amount `t`. */
export function spotRadii(t: number): number[] {
  const x = MathUtils.clamp(t, 0, 1);
  let k = 0;
  while (k < RADII_AT.length - 2 && x > RADII_AT[k + 1]) k++;
  const f = (x - RADII_AT[k]) / (RADII_AT[k + 1] - RADII_AT[k]);
  return RADII.map(r => (r[k] + (r[k + 1] - r[k]) * f) / 100);
}

export function createRustWord(canvas: HTMLCanvasElement, opts: RustWordOptions): RustWord | null {
  let renderer: WebGLRenderer;
  try { // no WebGL at all: the renderer throws (the loader has already probed)
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  try {
    if (!renderer.capabilities.isWebGL2) throw new Error('not WebGL2');
    return build(canvas, opts, renderer);
  } catch {
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
}

/** uSheen: the sheen band's centre (x, in parts of the word's width) and strength. */
type Shared = { uR: { value: Vector4 }; uBox: { value: Vector4 }; uSheen: { value: Vector2 } };

/**
 * The iron maps, drawn once per page (a 512 px fbm is a long task): each start clones them per letter, and only the
 * clones are ever uploaded, so a stop frees the GPU copies and leaves these for the next approach.
 */
let ironCache: IronTextures | null = null;

function build(canvas: HTMLCanvasElement, opts: RustWordOptions, renderer: WebGLRenderer): RustWord {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  // A shader that fails to compile or link draws nothing and throws nothing: three.js reports it here, and the
  // frame that used it ends the word, so the CSS word comes back instead of an empty canvas.
  let shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };
  renderer.toneMapping = ACESFilmicToneMapping;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTarget = pmrem.fromScene(envScene, 0.04);
  const envMap = envTarget.texture;
  scene.environment = envMap;
  envScene.dispose();
  pmrem.dispose();

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  // the hero's light: its warm spotlight from the upper left and its faint fill
  const spot = new SpotLight(0xfff1e0, 420, 60, 0.5, 0.65, 2);
  spot.position.set(-2.5, 9, 6);
  scene.add(spot, spot.target, new HemisphereLight(0x8090a0, 0x100804, 0.25));

  // ---- the word: one mesh per letter, each the hero's iron at its own offset, tracked as the CSS word is
  const font = new FontLoader().parse(typeface as never);
  const iron = (ironCache ??= ironTextures(512));
  const textures: CanvasTexture[] = [];
  const materials: MeshStandardMaterial[] = [];
  const word = new Group();
  const shared: Shared = { uR: { value: new Vector4() }, uBox: { value: new Vector4() }, uSheen: { value: new Vector2() } };
  let cursor = 0;
  let minY = Infinity, maxY = -Infinity;
  [...opts.word].forEach((ch, i) => {
    const glyph = typeface.glyphs[ch as keyof typeof typeface.glyphs];
    if (!glyph) throw new Error(`no glyph for ${ch}`);
    const g = new TextGeometry(ch, {
      font, size: SIZE, depth: DEPTH, curveSegments: 12,
      bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 6,
    });
    g.translate(cursor, 0, -DEPTH / 2);
    g.computeBoundingBox();
    g.computeVertexNormals();
    minY = Math.min(minY, g.boundingBox!.min.y);
    maxY = Math.max(maxY, g.boundingBox!.max.y);
    cursor += (glyph.ha * SIZE) / typeface.resolution + TRACK;
    const { mat, textures: own } = makeLetterMaterial({ iron, envMap, index: i });
    textures.push(...own);
    patch(mat, shared);
    materials.push(mat);
    word.add(new Mesh(g, mat));
  });
  const width = cursor - TRACK;
  const height = maxY - minY;
  for (const mesh of word.children as Mesh[]) mesh.geometry.translate(-width / 2, -(minY + maxY) / 2, 0);
  // the spots' box, in the word's own space: x from the left, y from the top, as the CSS masks are placed
  shared.uBox.value.set(-width / 2, height / 2, width, height);
  word.rotation.x = TILT;
  scene.add(word);

  let disposed = false;
  let ended = false;
  let running = false;
  let compiled = false; // the compile before the first frame has settled: the loop may run
  let compileTimer = 0;
  let raf = 0;
  let drawn = false;
  let fps: FpsWatch | null = null;

  /**
   * Frames the word over the CSS word's box: the camera's distance makes the word as wide as the box, and the word
   * moves to the box's centre. The canvas is larger than the box (room for the lean and the light), so the box is
   * read from the page each time the canvas changes size.
   */
  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false); // false: the stylesheet sizes the canvas (no inline style under the CSP)
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const box = opts.box();
    const tanHalf = Math.tan(MathUtils.degToRad(FOV / 2));
    const distance = (width * h) / (Math.max(1, box.width) * 2 * tanHalf);
    const ppu = h / (2 * distance * tanHalf); // canvas pixels per scene unit, at the word's plane
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    word.position.set((box.left + box.width / 2 - w / 2) / ppu, -(box.top + box.height / 2 - h / 2) / ppu, 0);
    spot.target.position.copy(word.position);
    spot.position.set(word.position.x - 2.5, word.position.y + 9, 6);
  }

  function frame() {
    const p = MathUtils.clamp(opts.progress(), 0, 1);
    const rust = MathUtils.clamp(p / RUST_SPAN, 0, 1);
    const [r1, r2, r3, r4] = spotRadii(rust);
    shared.uR.value.set(r1, r2, r3, r4);
    // the sheen crosses the word once, left to right, as the CSS word's gradient does (a band in the shader: a light
    // would leave a pinpoint highlight on the polished steel)
    const sh = MathUtils.clamp(p / SHEEN_SPAN, 0, 1);
    shared.uSheen.value.set(sh * 1.4 - 0.2, sh > 0 && sh < 1 ? Math.sin(sh * Math.PI) : 0);
    renderer.render(scene, camera);
    // a frame counts as drawn only if its programs compiled and linked, on a context still there
    if (shaderFailed) throw new Error('a shader failed to compile or link');
    if (renderer.getContext().isContextLost()) return; // webglcontextlost is on its way: it ends the word
    fps?.frame();
    if (!drawn) {
      drawn = true;
      opts.onFirstFrame?.();
      if (opts.minFps) {
        fps = watchFps(FPS_WINDOW_S, opts.minFps, () => end('floor'));
        fps.setActive(drawing());
      }
    }
    opts.onFrame?.(rust);
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    try {
      frame();
    } catch (error) {
      console.warn('IronAFS: a frame of the 3D Rust word failed; showing the CSS word instead.', error);
      end('error');
    }
  }

  /** Whether frames can run: started, its first compile settled, the tab shown (the loader stops the word when #rust is far off). */
  function drawing() {
    return running && compiled && !document.hidden && !disposed;
  }

  /** Runs the loop only while drawing() holds; the frame-rate watch counts only that time. */
  function sync() {
    const should = drawing();
    fps?.setActive(should);
    if (should && !raf) raf = requestAnimationFrame(tick);
    else if (!should && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  const resizeObserver = new ResizeObserver(() => resize());
  const onHidden = () => sync();
  let contextLost = false;
  const onLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    end('context');
  };

  function end(reason: EndReason) {
    if (ended || disposed) return;
    ended = true;
    dispose();
    opts.onEnd(reason);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    running = false;
    sync();
    window.clearTimeout(compileTimer);
    fps?.stop();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', onHidden);
    canvas.removeEventListener('webglcontextlost', onLost);
    for (const mesh of word.children as Mesh[]) mesh.geometry.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    envTarget.dispose();
    renderer.dispose();
    if (!contextLost) renderer.forceContextLoss(); // free the GL context now (browsers cap live contexts)
  }

  canvas.addEventListener('webglcontextlost', onLost);
  document.addEventListener('visibilitychange', onHidden);
  try {
    resizeObserver.observe(canvas);
    resize();
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    start() {
      if (running || disposed) return;
      running = true;
      // compile before the first frame, so the word appears whole. A throw, a rejection, or a compile that has not
      // settled in COMPILE_TIMEOUT_MS is a failed start; no frame runs before it settles (sync() waits on `compiled`).
      const failed = () => end('error');
      compileTimer = window.setTimeout(failed, COMPILE_TIMEOUT_MS);
      try {
        renderer.compileAsync(scene, camera).then(() => {
          window.clearTimeout(compileTimer);
          compiled = true;
          sync();
        }, failed);
      } catch {
        failed();
      }
    },
    dispose,
  };
}

/**
 * The steel and the rust. Outside the spots the letter is polished steel (the hero's "clean" iron under the pointer:
 * steel grey, smooth, fully metallic, brushed a little); inside them, the hero's rust: its colours, roughness and
 * metalness (ironTextures, makeLetterMaterial), with its iron in the crevices and a darker band along the front where
 * it eats into the steel. The spots' edges are broken by noise, so rust breaks out rather than growing in circles.
 */
function patch(m: MeshStandardMaterial, shared: Shared): void {
  const spots = SPOTS.map(([x, y]) => `vec2(${x.toFixed(2)}, ${y.toFixed(2)})`).join(', ');
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vL; uniform vec4 uR, uBox; uniform vec2 uSheen;
        float rwHash(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float rwNoise(vec3 x){
          vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
          return mix(mix(mix(rwHash(i), rwHash(i+vec3(1,0,0)), f.x), mix(rwHash(i+vec3(0,1,0)), rwHash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(rwHash(i+vec3(0,0,1)), rwHash(i+vec3(1,0,1)), f.x), mix(rwHash(i+vec3(0,1,1)), rwHash(i+vec3(1,1,1)), f.x), f.y), f.z);
        }
        float rwFbm(vec3 p){ float t = 0., a = .5; for (int o = 0; o < 4; o++){ t += a*rwNoise(p); p *= 2.07; a *= .5; } return t; }
        float gRust, gFront;
        void rustField(){
          vec2 q = vec2((vL.x - uBox.x)/uBox.z, (uBox.y - vL.y)/uBox.w); // the CSS box's x, y from the top-left
          float ref = sqrt((uBox.z*uBox.z + uBox.w*uBox.w)*.5); // a CSS radial-gradient's percentage reference
          vec2 spots[4] = vec2[4](${spots});
          float r[4] = float[4](uR.x, uR.y, uR.z, uR.w);
          float n = (rwFbm(vL*3.1) - .5)*.55 + (rwNoise(vL*14.) - .5)*.12;
          gRust = 0.; gFront = 0.;
          for (int i = 0; i < 4; i++){
            if (r[i] < .025) continue; // a spot starts at a size that reads (a pinpoint caught the light as a white speck)
            vec2 d = (q - spots[i])*vec2(uBox.z, uBox.w)/ref;
            float edge = length(d) + n*min(r[i]*1.6, .3);
            gRust = max(gRust, 1. - smoothstep(r[i] - .015, r[i] + .005, edge));
            gFront = max(gFront, 1. - smoothstep(.0, .035, abs(edge - r[i] - .006))); // tarnish: a dark ring just outside the rust
          }
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        rustField();
        float grain = rwNoise(vL*vec3(5., 70., 70.)); // brushed along the word: fine across, long along
        vec3 steel = vec3(.56,.58,.61)*(.94 + .08*grain);
        // the hero's rust (ironTextures in hero/letters.ts): sRGB (92 + 70 pit, 38 + 28 pit, 16 + 10 pit) / 255 over
        // pitted fbm, the iron (52..76 grey) showing in its crevices; here it covers the whole spot
        float f = rwFbm(vL*4.1), fine = rwNoise(vL*23.);
        float pit = smoothstep(.3, .72, rwFbm(vL*9.7 + 5.)); // the hero's pit range, spread wider over the full spot
        float crevice = 1. - smoothstep(.2, .36, f + (fine - .5)*.25); // edges in order: GLSL leaves reversed ones undefined
        vec3 rustSrgb = vec3(92. + pit*70., 38. + pit*28., 16. + pit*10.)/255.;
        vec3 ironSrgb = vec3(52. + fine*20., 54. + fine*20., 58. + fine*20.)/255.;
        vec3 rusted = pow(mix(rustSrgb, ironSrgb, crevice*.8), vec3(2.2)); // to linear, as the map's sRGB texels are
        // tarnish darkens the polished steel just ahead of the rust (rougher steel there blurred the room into a pale ring)
        diffuseColor.rgb = mix(steel*(1. - .7*gFront), rusted, gRust);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // the hero's roughness map: (90 + 150 rust + 20 grain) / 255
        roughnessFactor = mix(.2 + .05*grain, clamp((90. + 150.*(1. - crevice) + 20.*fine)/255., 0., 1.), gRust);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(1., .85, gRust); // the hero letters' metalness`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // the sheen: a soft diagonal band across the steel (never on the rust)
        vec2 q2 = vec2((vL.x - uBox.x)/uBox.z, (uBox.y - vL.y)/uBox.w);
        float bx = (q2.x - .25*q2.y - uSheen.x)/.07;
        float band = exp(-bx*bx); // a square, not pow(): GLSL leaves pow() of a negative base undefined
        totalEmissiveRadiance += vec3(.55)*band*uSheen.y*(1. - gRust);`);
  };
}
