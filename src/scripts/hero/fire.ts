// The fire: it rises only where the chip is melting at that moment. The mockup's soft additive
// blobs read as glow, not fire, so each particle here is a flame: a billboard whose shader draws a
// tongue (round at the base, pointed at the tip) licked away by rising noise, hot yellow at the core, red at
// the edges. A warm light follows the amount of fire, and on desktop a heat-haze pass shimmers above it.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, MathUtils, PointLight, Points, ShaderMaterial, Vector2, Vector3,
} from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CHIP_DEPTH } from './chip';
import type { SceneContext, SceneModule } from './scene';

export type Fire = SceneModule & {
  /** The share of the chip that is burning now (0..1). */
  readonly coverage: number;
  /** Flames alive now (?test hook). */
  readonly flames: number;
  /** The most flames it can have alive, and whether it has a heat-haze pass (?test hook). */
  readonly capacity: number;
  readonly hazePass: boolean;
};

export type FireOptions = {
  /** The most flames alive at once (phones: 400 at most). */
  count: number;
  /** The heat-haze pass (never on phones). */
  haze: boolean;
  chipHalf: number;
  /** How far (x, z) has melted now; 0 before the melt. */
  field: (x: number, z: number) => number;
  /** The height of the melting surface at x for a melt amount m. */
  top: (m: number) => number;
  /** Throws a few sparks from a flame. */
  sparks?: (p: Vector3, n: number, power: number, spread: number) => void;
};

const SAMPLES_PER_S = 1500; // candidate spots tried per second, desktop (phones half)
const BURN = [0.04, 0.92] as const; // a spot burns while its melt is between these

const vertexShader = `
  attribute float aLife; attribute float aSize; attribute float aSeed; attribute float aHeat;
  uniform float uScale;
  varying float vLife; varying float vSeed; varying float vHeat;
  void main(){
    vLife = aLife; vSeed = aSeed; vHeat = aHeat;
    float s = aSize * (.55 + .45*smoothstep(0., .25, aLife)) * (1. - .3*aLife);
    vec4 mv = modelViewMatrix * vec4(position + vec3(0., s*.42, 0.), 1.); // the flame's base stands on its point
    gl_PointSize = aLife >= 1. ? 0. : s * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = `
  uniform float uTime, uGain;
  varying float vLife; varying float vSeed; varying float vHeat;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h21(i), h21(i + vec2(1.,0.)), f.x), mix(h21(i + vec2(0.,1.)), h21(i + vec2(1.,1.)), f.x), f.y);
  }
  void main(){
    vec2 uv = vec2(gl_PointCoord.x, 1. - gl_PointCoord.y);
    float y = uv.y;
    float x = (uv.x - .5) * 2.;
    float t = uTime + vSeed * 9.;
    // rising noise: it sways the tongue (more towards the tip) and licks pieces off it
    float n = .6*vn(vec2(x*1.7 + vSeed*13., y*2.4 - t*3.1)) + .4*vn(vec2(x*3.9 - vSeed*5., y*5.3 - t*5.7));
    x += (n - .5) * 1.1 * y;
    float w = 1.2 * pow(max(y, 0.), .42) * (1. - y);
    float d = abs(x) / max(w, .001);
    float body = (1. - smoothstep(.45, 1., d)) * smoothstep(0., .05, y);
    float lick = smoothstep(.2, .55, n + (1. - y)*.75 - .38);
    float k = body * lick * smoothstep(0., .12, vLife) * (1. - smoothstep(.6, 1., vLife)) * vHeat;
    float T = clamp(k * (1.25 - .7*y) * (1. - .4*d), 0., 1.);
    if (T < .01) discard;
    vec3 col = mix(vec3(.5,.04,.0), vec3(1.,.28,.02), smoothstep(.05, .4, T));
    col = mix(col, vec3(1.,.6,.16), smoothstep(.4, .75, T));
    col = mix(col, vec3(1.,.82,.5), smoothstep(.85, 1., T));
    gl_FragColor = vec4(col * T * uGain, 1.);
  }`;

export function createFire(ctx: SceneContext, opts: FireOptions): Fire {
  const { scene, camera, composer } = ctx;
  const max = opts.count;
  const pos = new Float32Array(max * 3), life = new Float32Array(max).fill(1), size = new Float32Array(max);
  const seed = new Float32Array(max), heat = new Float32Array(max), vel = new Float32Array(max * 3), span = new Float32Array(max).fill(1);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aLife', new BufferAttribute(life, 1));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
  geo.setAttribute('aHeat', new BufferAttribute(heat, 1));
  const mat = new ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uTime: { value: 0 }, uGain: { value: ctx.tier === 'phone' ? 0.65 : 0.75 } },
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false; // compiled after the first frame (scene warmLater)
  scene.add(points);
  let next = 0;
  let alive = 0;

  const light = new PointLight(0xff7a2a, 0, 10, 1.5);
  light.position.set(0, 1.4, 1.4);
  scene.add(light);

  // the heat haze: a shimmer above the fire, pass skipped while there is none
  let haze: ShaderPass | null = null;
  if (opts.haze) {
    haze = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uPos: { value: new Vector2(-9, -9) }, uAmt: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uPos; uniform float uAmt, uTime, uAspect; varying vec2 vUv;
        void main(){
          vec2 d = vUv - uPos; d.x *= uAspect;
          float up = smoothstep(-.03, .02, d.y) * exp(-max(d.y,0.)/.22);
          float m = exp(-d.x*d.x/(.004 + max(d.y,0.)*.03)) * up * uAmt;
          vec2 o = vec2(sin(vUv.y*90. - uTime*14.) + sin(vUv.y*37. - uTime*9.), cos(vUv.x*70. + uTime*11.)) * .0016 * m;
          gl_FragColor = texture2D(tDiffuse, vUv + o);
        }`,
    });
    haze.enabled = false;
    composer.insertPass(haze, 1); // after the render, before the bloom
  }
  const centre = new Vector3();
  const at = new Vector3();
  let coverage = 0;
  let carry = 0;

  function resize(w: number, h: number) {
    // pixels per world unit at distance 1, in drawing-buffer pixels (gl_PointSize is in those)
    mat.uniforms.uScale.value = (h * ctx.renderer.getPixelRatio()) / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)));
    if (haze) haze.uniforms.uAspect.value = w / h;
  }

  return {
    get coverage() { return coverage; },
    get flames() { return alive; },
    get capacity() { return max; },
    get hazePass() { return haze !== null; },
    resize,
    update(t, dt) {
      mat.uniforms.uTime.value = t;
      // try spots across the chip: a flame starts where the metal is melting right now
      carry += SAMPLES_PER_S * (ctx.tier === 'phone' ? 0.5 : 1) * dt;
      const tries = Math.floor(carry);
      carry -= tries;
      let burning = 0;
      for (let i = 0; i < tries; i++) {
        const x = (Math.random() - 0.5) * opts.chipHalf * 2, z = (Math.random() - 0.5) * CHIP_DEPTH;
        const m = opts.field(x, z);
        if (m < BURN[0] || m > BURN[1]) continue;
        burning++;
        if (Math.random() > 0.22) continue; // most tries only measure how much is burning
        const k = next++ % max;
        const strong = Math.sin(m * Math.PI);
        pos[k * 3] = x; pos[k * 3 + 1] = opts.top(m) - 0.02; pos[k * 3 + 2] = z * 0.8 + 0.15;
        vel[k * 3] = (Math.random() - 0.5) * 0.15; vel[k * 3 + 1] = 0.25 + Math.random() * 0.35; vel[k * 3 + 2] = (Math.random() - 0.5) * 0.1;
        span[k] = 0.55 + Math.random() * 0.5;
        life[k] = 0;
        size[k] = (0.45 + Math.random() * 0.45) * (0.7 + 0.6 * strong);
        seed[k] = Math.random();
        heat[k] = 0.65 + 0.35 * strong;
        if (opts.sparks && Math.random() < 0.03) opts.sparks(at.set(x, pos[k * 3 + 1], z * 0.8 + 0.2), 4, 0.5, 0.1);
      }
      coverage = tries ? burning / tries : coverage;
      alive = 0;
      for (let i = 0; i < max; i++) {
        if (life[i] >= 1) continue;
        alive++;
        life[i] = Math.min(1, life[i] + dt / span[i]);
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      points.visible = alive > 0;
      if (alive > 0) {
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aLife.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aSeed.needsUpdate = true;
        geo.attributes.aHeat.needsUpdate = true;
      }
      light.intensity += (coverage * 18 - light.intensity) * (1 - Math.exp(-6 * dt));
      if (haze) {
        const amt = haze.uniforms.uAmt;
        amt.value = Math.max(amt.value * Math.pow(0.92, dt * 60), Math.min(coverage * 3.3, 1));
        haze.enabled = amt.value > 0.002;
        centre.set(0, 0.5, 0).project(camera);
        haze.uniforms.uPos.value.set(centre.x * 0.5 + 0.5, centre.y * 0.5 + 0.5);
        haze.uniforms.uTime.value = t;
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      if (haze) {
        composer.removePass(haze);
        haze.dispose();
      }
    },
  };
}
