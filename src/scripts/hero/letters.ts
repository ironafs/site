// The word "IronAFS": Space Grotesk Bold letters of cast iron with a
// rust texture, standing on the floor. They fall onto the chip one after another (a bounce on landing, a
// squash and a shake), cool from white-hot, warm under the pointer and take a strike when clicked. The
// glyphs come from src/assets/hero/letters.typeface.json (brand/src/glyphs.py), not from a font at runtime.
import { ui } from '../../content/ui';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, type Material, Mesh, MeshStandardMaterial,
  PointLight, Points, PointsMaterial, Raycaster, RepeatWrapping, SRGBColorSpace, type Texture, Vector2, Vector3, Vector4,
} from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import typeface from '../../assets/hero/letters.typeface.json';
import { chipTopUnder } from './footprint';
import type { Chip } from './chip';
import type { SceneContext, SceneModule } from './scene';

export const WORD = ui.wordmark;
export const CHIP_ALONE_S = 3.4; // the chip is on screen alone until then
export const LETTER_GAP_S = 0.24; // one letter every 0.24 s
export const FALL_S = 1.35; // each falls this long, with a bounce
const SIZE = 1.5;
const TRACK = 0.07 * SIZE;
const DROP_HEIGHT = 10;
const TRAIL = 64; // the heat trail: recent pointer contacts on the iron (world position + time)

/** A letter's weld band: its top (world y, 0 = none) and its glow (1 hot, 0 cooled). */
export type Weld = { top: { value: number }; glow: { value: number } };

type Letter = {
  mesh: Mesh;
  mat: MeshStandardMaterial;
  weld: Weld;
  bx: number;
  half: number;
  start: number;
  landed: boolean;
  heat: number;
  squash: number;
  ring: number;
  y: number;
  rest: number;
};

export type Letters = SceneModule & {
  /** The word's width in scene units. */
  total: number;
  /** Lets the letters rest on the chip (until then they land on the floor). */
  land(chip: Chip): void;
  /** The scene time when the last letter landed, or null. */
  readonly landedAt: number | null;
  /** The ?test hook: every letter's screen box [left, top, right, bottom] in viewport pixels, then 1 once it has landed. */
  screenBoxes(): number[][];
  /** The ?test hook: each letter's footprint and the lowest point of its rendered mesh (world y, from the live matrix). */
  bottoms(): Array<{ x: number; half: number; bottom: number }>;
  /** The ?test hook: the pointer light's intensity (it must stay 0 unless the pointer is over a letter). */
  readonly forgeIntensity: number;
  /** Each letter's x, footprint half-width and weld band (melt.ts drives the band). */
  readonly feet: ReadonlyArray<{ x: number; half: number; weld: Weld }>;
  /** The heat each landed letter eases towards (0 = cold iron; the melt warms the letters it is eating into). */
  heatTo: number[];
  /** The pointer in normalised device coordinates while it is over the hero, else null (the embers follow it). */
  readonly pointer: Vector2 | null;
  /** Sparks at p (the fire throws a few). */
  sparks(p: Vector3, n: number, power?: number, spread?: number): void;
  /** The finished state at once: every letter landed and cold, no sparks, no shake (a return visit). */
  settle(): void;
};

function mulberry(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type IronTextures = { map: CanvasTexture; rmap: CanvasTexture };

/** Cast iron with rust: a colour map and a roughness map, shared, each letter samples a different offset. */
export function ironTextures(size: number): IronTextures {
  const rnd = mulberry(7);
  const G = 64;
  const grid = new Float32Array(G * G).map(() => rnd());
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const g = (a: number, b: number) => grid[(((b % G) + G) % G) * G + (((a % G) + G) % G)];
    return (g(xi, yi) * (1 - u) + g(xi + 1, yi) * u) * (1 - v) + (g(xi, yi + 1) * (1 - u) + g(xi + 1, yi + 1) * u) * v;
  };
  const fbm = (x: number, y: number) => {
    let t = 0, a = 0.5;
    for (let o = 0; o < 6; o++) { t += a * vn(x, y); x *= 2.03; y *= 2.03; a *= 0.5; }
    return t;
  };
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  const col = document.createElement('canvas'), rough = document.createElement('canvas');
  col.width = col.height = rough.width = rough.height = size;
  const c = col.getContext('2d')!, r = rough.getContext('2d')!;
  const img = c.createImageData(size, size), rimg = r.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, u = (x / size) * 16, v = (y / size) * 16;
      const n = fbm(u, v), fine = vn(u * 9, v * 9), grain = rnd();
      const rust = sm(0.5, 0.62, n + (fine - 0.5) * 0.18), pit = sm(0.55, 0.75, fbm(u * 3 + 5, v * 3 + 9));
      const iron = 52 + grain * 14 + fine * 10;
      img.data.set([iron + rust * (92 + pit * 70 - iron), iron + 2 + rust * (38 + pit * 28 - iron - 2), iron + 6 + rust * (16 + pit * 10 - iron - 6), 255], i * 4);
      const rv = 90 + rust * 150 + grain * 20;
      rimg.data.set([rv, rv, rv, 255], i * 4);
    }
  }
  c.putImageData(img, 0, 0);
  r.putImageData(rimg, 0, 0);
  const map = new CanvasTexture(col);
  map.colorSpace = SRGBColorSpace;
  const rmap = new CanvasTexture(rough);
  for (const t of [map, rmap]) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(0.35, 0.35); }
  return { map, rmap };
}

const easeOutBounce = (t: number) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

export type LetterMaterialOptions = {
  /** The shared iron maps (ironTextures): each material samples its own clones of them. */
  iron: IronTextures;
  /** The room environment: envMapIntensity scales only a material's own envMap (three r163+). */
  envMap: Texture;
  /** The letter's place in its word: each letter samples the iron at a different offset. */
  index: number;
};

/**
 * One letter's cast iron with rust (the hero's look): the iron maps cloned at the letter's offset, rough and metallic,
 * lit by the room environment. `textures` are the clones, for the caller to dispose. The hero adds its heat trail and
 * weld band (onBeforeCompile); the Rust word (src/scripts/rustword/scene.ts) adds its polished steel and rust spread.
 */
export function makeLetterMaterial({ iron, envMap, index }: LetterMaterialOptions): { mat: MeshStandardMaterial; textures: CanvasTexture[] } {
  const map = iron.map.clone(), rmap = iron.rmap.clone();
  map.offset.set(index * 0.37, index * 0.61);
  rmap.offset.copy(map.offset);
  map.needsUpdate = rmap.needsUpdate = true;
  const mat = new MeshStandardMaterial({ map, roughnessMap: rmap, roughness: 1, metalness: 0.85, envMap, envMapIntensity: 1.3 });
  return { mat, textures: [map, rmap] };
}

const INTERACTIVE = 'a, button, input, textarea, select, summary, label, [role="button"], [role="menuitem"]';

export async function createLetters(ctx: SceneContext): Promise<Letters> {
  const phone = ctx.tier === 'phone';
  const { scene, camera } = ctx;
  const canvas = ctx.renderer.domElement;
  const hero = canvas.parentElement;

  // ---- the heat trail: the pointer warms the iron where it passes (desktop; a touch screen has no hover)
  const trail = Array.from({ length: TRAIL }, () => new Vector4(0, 0, 0, -999));
  let trailNext = 0;
  const shared = { uTrail: { value: trail }, uNow: { value: 0 } };
  // The shader: the heat trail (desktop) and the weld band, where the pool fused to the letter's foot (melt.ts
  // sets each letter's band top and glow): dark glossy metal under a wavy edge, glowing while it is hot.
  const patch = (m: MeshStandardMaterial, weld: Weld) => {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, shared, { uWeld: weld.top, uWGlow: weld.glow });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vW; uniform vec4 uTrail[${TRAIL}]; uniform float uNow, uWeld, uWGlow;
          float gHeat, gClean, gWB;
          void trailField(){
            gHeat = 0.; gClean = 0.;
            ${phone ? '' : `for (int i=0;i<${TRAIL};i++){
              vec4 p = uTrail[i]; float age = uNow - p.w;
              if (age < 0. || age > 16.) continue;
              float d = distance(vW, p.xyz); float f = exp(-d*d/.016);
              gHeat = max(gHeat, f*exp(-age*1.6));
              gClean = max(gClean, f*(1. - smoothstep(5., 15., age))); // fades out from 5 s to 15 s (edges in order: GLSL leaves reversed ones undefined)
            }`}
          }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          trailField();
          float rustAmt = smoothstep(.03,.14, diffuseColor.r - diffuseColor.b);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62,.64,.67), gClean*(.35 + .65*rustAmt));
          float wave = .06*sin(vW.x*11.+1.3) + .04*sin(vW.x*23.+vW.z*7.) + .03*sin(vW.z*17.);
          gWB = uWeld > .001 ? 1. - smoothstep(uWeld + wave - .07, uWeld + wave, vW.y) : 0.;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.075,.078,.085), gWB);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(mix(roughnessFactor, .16, gClean), .2, gWB);`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = mix(clamp(mix(metalnessFactor, 1., gClean) - gHeat*.6, 0., 1.), 1., gWB);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 hc = mix(vec3(.9,.12,.01), vec3(1.,.55,.12), smoothstep(.4,.9,gHeat));
          hc = mix(hc, vec3(1.,.9,.6), smoothstep(.85,1.,gHeat));
          totalEmissiveRadiance += hc * pow(gHeat,1.6) * .55;
          totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(0.), gWB);
          totalEmissiveRadiance += vec3(1.,.3,.04) * gWB * uWGlow * (1.1 - .6*clamp(vW.y/max(uWeld,.01),0.,1.));`);
    };
  };

  // ---- sparks (landings, strikes, a warm pointer)
  const MAX = phone ? 600 : 1600;
  const sPos = new Float32Array(MAX * 3), sCol = new Float32Array(MAX * 3), sVel = new Float32Array(MAX * 3), sLife = new Float32Array(MAX);
  const sGeo = new BufferGeometry();
  sGeo.setAttribute('position', new BufferAttribute(sPos, 3));
  sGeo.setAttribute('color', new BufferAttribute(sCol, 3));
  const sMat = new PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
  const sparks = new Points(sGeo, sMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sNext = 0;
  function emit(p: Vector3, n: number, power = 1, spread = 0.5) {
    for (let i = 0; i < n; i++) {
      const k = sNext++ % MAX;
      sPos[k * 3] = p.x + (Math.random() - 0.5) * spread; sPos[k * 3 + 1] = p.y; sPos[k * 3 + 2] = p.z + 0.25;
      const a = Math.random() * Math.PI, sp = (1.5 + Math.random() * 5) * power;
      sVel[k * 3] = Math.cos(a) * sp * 0.8; sVel[k * 3 + 1] = Math.sin(a) * sp; sVel[k * 3 + 2] = (Math.random() - 0.1) * sp * 0.7;
      sLife[k] = 0.5 + Math.random() * 1.0;
    }
  }
  for (let i = 0; i < MAX; i++) sPos[i * 3 + 1] = -99;

  // ---- the letters
  const font = new FontLoader().parse(typeface as never);
  const iron = ironTextures(phone ? 256 : 512);
  await ctx.pause(); // the iron maps and the glyphs are a task each (before any listener: nothing to undo here)
  const textures: CanvasTexture[] = [iron.map, iron.rmap];
  const materials: Material[] = [];
  const parts: Array<{ g: TextGeometry; x: number; adv: number }> = [];
  let cursor = 0;
  for (const ch of WORD) {
    const adv = (typeface.glyphs[ch as keyof typeof typeface.glyphs].ha * SIZE) / typeface.resolution;
    const g = new TextGeometry(ch, {
      font, size: SIZE, depth: 0.5, curveSegments: phone ? 8 : 12,
      bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: phone ? 3 : 6,
    });
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    g.translate(-adv / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); // pivot: the glyph's advance centre, on the floor
    g.computeBoundingBox();
    g.computeVertexNormals();
    parts.push({ g, x: cursor + adv / 2, adv });
    cursor += adv + TRACK;
  }
  const total = cursor - TRACK;
  let chip: Chip | null = null;
  const letters: Letter[] = parts.map(({ g, x, adv }, i) => {
    // envMapIntensity only scales a material's own envMap (three r163+), so the letters carry the room map
    const { mat, textures: own } = makeLetterMaterial({ iron, envMap: ctx.envMap, index: i });
    textures.push(...own);
    const weld: Weld = { top: { value: 0 }, glow: { value: 0 } };
    patch(mat, weld);
    materials.push(mat);
    const mesh = new Mesh(g, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.i = i;
    const bx = x - total / 2;
    mesh.position.set(bx, 12, 0);
    scene.add(mesh);
    const half = adv / 2 - 0.08; // the glyph's footprint, a little inside its advance
    return { mesh, mat, weld, bx, half, start: CHIP_ALONE_S + i * LETTER_GAP_S, landed: false, heat: 0.85, squash: 0, ring: 0, y: 12, rest: 0 };
  });

  const forgeLight = new PointLight(0xff5a14, 0, 8, 1.8);
  scene.add(forgeLight);

  // ---- pointer: warmth under it, a strike on a click
  const ndc = new Vector2(9, 9);
  const ray = new Raycaster();
  const meshes = letters.map(l => l.mesh);
  let overUI = false;
  let overHero = false;
  let lastTrail = 0;
  let hovering = false;
  const aim = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    overUI = !inside || !!(e.target as Element | null)?.closest?.(INTERACTIVE);
    overHero = inside && !!hero && e.target instanceof Node && hero.contains(e.target);
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const onMove = (e: PointerEvent) => aim(e);
  const onOut = (e: PointerEvent) => { if (!e.relatedTarget) { overUI = true; overHero = false; } };
  const onDown = (e: PointerEvent) => {
    aim(e);
    if (overUI) return;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return;
    const L = letters[hit.object.userData.i];
    if (!L.landed) return;
    L.heat = 0.8; L.squash = 1;
    ctx.shake(0.2);
    for (const o of letters) if (o !== L) o.ring = Math.max(o.ring, 0.5 / (1 + Math.abs(o.bx - L.bx)));
    emit(hit.point, phone ? 90 : 220, 1.25, 0.3);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerout', onOut);

  const hot = new Color(), cRed = new Color(1, 0.2, 0.02), cWhite = new Color(1, 0.85, 0.55);
  const corner = new Vector3();
  const lightOffset = new Vector3(0, 0, 0.6);
  let landedAt: number | null = null;
  const heatTo = letters.map(() => 0);
  const feet = letters.map(L => ({ x: L.bx, half: L.half, weld: L.weld }));

  return {
    total,
    feet,
    heatTo,
    get pointer() { return overHero ? ndc : null; },
    sparks: emit,
    settle() {
      for (const L of letters) { L.start = -1e3; L.landed = true; L.heat = 0; }
      landedAt = -1e3;
    },
    land(c) { chip = c; },
    get landedAt() { return landedAt; },
    get forgeIntensity() { return forgeLight.intensity; },
    bottoms() {
      return letters.map(L => {
        L.mesh.updateMatrixWorld();
        const bb = L.mesh.geometry.boundingBox!;
        let bottom = Infinity;
        for (let k = 0; k < 8; k++) {
          corner.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(L.mesh.matrixWorld);
          bottom = Math.min(bottom, corner.y);
        }
        return { x: L.bx, half: L.half, bottom };
      });
    },
    screenBoxes() {
      const r = canvas.getBoundingClientRect();
      return letters.map(L => {
        L.mesh.updateMatrixWorld();
        const bb = L.mesh.geometry.boundingBox!;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let k = 0; k < 8; k++) {
          corner.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z)
            .applyMatrix4(L.mesh.matrixWorld).project(camera);
          const px = r.left + ((corner.x + 1) / 2) * r.width, py = r.top + ((1 - corner.y) / 2) * r.height;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
        return [x0, y0, x1, y1].map(v => Math.round(v * 10) / 10).concat(L.landed ? 1 : 0);
      });
    },
    update(t, dt) {
      shared.uNow.value = t;
      const frameDecay = Math.pow(0.85, dt * 60);

      // pointer: a ray against the letters; where it touches the iron, the iron warms
      let hit: ReturnType<Raycaster['intersectObjects']>[number] | undefined;
      if (!overUI && ndc.x < 2) {
        ray.setFromCamera(ndc, camera);
        hit = ray.intersectObjects(meshes, false)[0];
      }
      if (!!hit !== hovering) { hovering = !!hit; hero?.toggleAttribute('data-hover', hovering); }
      if (hit) {
        const prev = trail[(trailNext + TRAIL - 1) % TRAIL];
        if (t - lastTrail > 0.03 && (Math.hypot(prev.x - hit.point.x, prev.y - hit.point.y, prev.z - hit.point.z) > 0.06 || t - prev.w > 0.25)) {
          trail[trailNext++ % TRAIL].set(hit.point.x, hit.point.y, hit.point.z, t);
          lastTrail = t;
          if (Math.random() < 0.35) emit(hit.point, 2, 0.45, 0.05);
        }
        forgeLight.position.copy(hit.point).add(lightOffset);
        forgeLight.intensity += (0.7 - forgeLight.intensity) * 0.15;
      } else forgeLight.intensity *= 0.9;

      for (const L of letters) {
        const p = Math.min(Math.max((t - L.start) / FALL_S, 0), 1);
        L.rest = chip ? chipTopUnder({ x: L.bx, half: L.half }, chip.halfWidth, chip.topAt) : 0;
        L.y = L.rest + (1 - easeOutBounce(p)) * DROP_HEIGHT;
        if (p >= 1 && !L.landed) {
          L.landed = true;
          ctx.shake(0.1);
          emit(new Vector3(L.bx, L.rest + 0.05, 0), phone ? 30 : 60, 0.8, 0.9);
          if (landedAt === null && letters.every(o => o.landed)) landedAt = t;
        }
        if (L.landed) L.heat += (heatTo[L.mesh.userData.i] - L.heat) * (1 - Math.exp(-0.45 * dt));
        L.squash *= frameDecay;
        L.ring *= Math.pow(0.9, dt * 60);
        const wob = Math.sin(t * 38) * L.ring * 0.05;
        L.mesh.scale.set(1 + L.squash * 0.16 + wob, 1 - L.squash * 0.22 - wob, 1 + L.squash * 0.16);
        L.mesh.position.set(L.bx, L.y, 0);
        const k = Math.min(L.heat, 1.25);
        hot.copy(cRed).lerp(cWhite, Math.min(Math.max(0, k - 0.6) / 0.65, 1));
        L.mat.emissive.copy(hot).multiplyScalar(Math.pow(k, 1.7) * 1.6);
        L.mat.color.setScalar(1 - Math.min(k, 1) * 0.85);
      }

      for (let i = 0; i < MAX; i++) {
        if (sLife[i] <= 0) { sPos[i * 3 + 1] = -99; continue; }
        sLife[i] -= dt;
        sVel[i * 3 + 1] -= 9.8 * dt * 0.9;
        sPos[i * 3] += sVel[i * 3] * dt; sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt; sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
        if (sPos[i * 3 + 1] < 0.01) { sPos[i * 3 + 1] = 0.01; sVel[i * 3 + 1] *= -0.3; sVel[i * 3] *= 0.55; sVel[i * 3 + 2] *= 0.55; }
        const f = Math.max(sLife[i], 0);
        sCol[i * 3] = 1.6 * f + 0.2; sCol[i * 3 + 1] = 0.7 * f * f + 0.05; sCol[i * 3 + 2] = 0.25 * f * f * f;
      }
      sGeo.attributes.position.needsUpdate = true;
      sGeo.attributes.color.needsUpdate = true;
    },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerout', onOut);
      hero?.removeAttribute('data-hover');
      for (const L of letters) L.mesh.geometry.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      sGeo.dispose();
      sMat.dispose();
    },
  };
}
