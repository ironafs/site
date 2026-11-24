// The uneven melt: the chip slumps, bulges and spreads
// into a molten pool, each part on its own clock (melt-field.ts); the pins tilt and sink; the letters sink as
// the metal under them gives way. Then the pool draws back and fuses to the letters' feet (a wavy weld band
// and slag beads, glowing, then cooling) and nothing is left on the floor. Fire and embers: fire.ts, embers.ts.
import {
  type Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, Vector4,
} from 'three';
import { CHIP_DEPTH, CHIP_TOP, type Chip } from './chip';
import type { Letters } from './letters';
import { type Hot, MELT, meltAt, meltEnd, slumpAt, smoothstep } from './melt-field';
import { meltGlsl } from './melt-glsl';
import type { SceneContext, SceneModule } from './scene';

/** After the last part has melted, the metal cools for this long (then the phase is `cooled`). */
export const COOL_S = 3.5;
const BEADS_PER_LETTER = 5;
const SAG_POWER = 1.3;

export type Melt = SceneModule & {
  /** Seconds from the melt's start until every part of the chip has melted. */
  readonly end: number;
  /** Starts the melt at scene time t (a return visit starts it far enough back that it is over). */
  begin(t: number): void;
  /** Seconds since the melt began, or null before it. */
  readonly age: number | null;
  /** How far (x, z) on the chip has melted now (0 before the melt). */
  field(x: number, z: number): number;
  /** The height of the chip's top at x for a melt amount (where the fire stands). */
  surface(x: number): number;
  /** Whether the molten pool is drawn this frame (?test hook). */
  readonly poolDrawn: boolean;
};

function mulberry(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f2 = (v: number) => v.toFixed(3);

export function createMelt(ctx: SceneContext, chip: Chip, letters: Letters): Melt {
  const { scene } = ctx;
  const chipHalf = chip.halfWidth;
  const feet = letters.feet;
  // the hottest parts are under letters 0, 2, 4 and 6: the I, the o, the A and the S
  const hotX = [0, 2, 4, 6].map(i => feet[i]?.x ?? 99) as unknown as Hot;
  const end = meltEnd(hotX, chipHalf, CHIP_DEPTH);
  const GLSL = meltGlsl(MELT, chipHalf);
  const halfD = f2(CHIP_DEPTH / 2);
  const random = mulberry(23); // the same welds and beads on every visit (the poster is this finished state)

  const meltU = {
    uA: { value: -1 }, uHot: { value: new Vector4(...hotX) }, uCool: { value: 0 }, uReach: { value: 9 },
    uLX: { value: feet.map(l => l.x) }, uLH: { value: feet.map(l => l.half) },
  };
  const materials: Material[] = [];

  // ---- the chip: deformed in world space. Molten parts slump to the floor, bulge outward and spread; the slump
  // (slumpAt) drags each point's neighbours down a short way, so the surface falls away instead of leaving peaks.
  // Flat shading takes its normals from the deformed surface, so the light follows the slumping shape. Fully
  // melted parts are discarded: by then the pool under them has taken over.
  const vertexMelt = `
    vec4 wp = modelMatrix * vec4(transformed, 1.);
    float zc = clamp(wp.z, -${halfD}, ${halfD});
    float s = slumpAt(wp.x, zc);
    float h = wp.y;
    wp.y = mix(h, .015 + h*.02, pow(s, ${SAG_POWER.toFixed(1)}));
    float low = 1. - clamp(h / ${f2(CHIP_TOP)}, 0., 1.);
    wp.z += sign(wp.z) * s * (.25 + .45*low);
    wp.x += sign(wp.x) * s * .12 * low;
    vMelt = meltAt(wp.x, zc);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;`;
  const glowColor = `
    float glow = smoothstep(.04, .35, vMelt) * (1. - .55*smoothstep(.8, 1., vMelt));
    vec3 mc = mix(vec3(.85,.12,.01), vec3(1.,.55,.12), smoothstep(.3,.7,vMelt) * (1.-smoothstep(.85,1.,vMelt)));`;
  const meltable = (m: MeshStandardMaterial | MeshBasicMaterial) => {
    if (m instanceof MeshStandardMaterial) m.flatShading = true;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, meltU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${GLSL}\nvarying float vMelt;`)
        .replace('#include <project_vertex>', vertexMelt);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vMelt; uniform float uCool;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n    if (vMelt > .985) discard;');
      sh.fragmentShader = m instanceof MeshStandardMaterial
        ? sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${glowColor}
            totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(0.), smoothstep(.1,.5,vMelt)) + mc * glow * 1.6 * (1. - uCool);`)
        // the label is unlit (crisp until it melts): it darkens to molten metal and glows the same way
        : sh.fragmentShader.replace('#include <opaque_fragment>', `${glowColor}
            outgoingLight = mix(outgoingLight, vec3(.02), smoothstep(.04,.4,vMelt)) + mc * glow * 1.6 * (1. - uCool);
            #include <opaque_fragment>`);
    };
  };
  const { group, body, face, pins, warn } = chip.parts;
  meltable(body.material as MeshStandardMaterial);
  meltable(face.material as MeshBasicMaterial);

  // the pins: each gets its own material (its own glow), tilts and sinks where the chip above it melts
  const pinState = pins.map(pin => {
    const mat = (pin.material as MeshStandardMaterial).clone();
    materials.push(mat);
    pin.material = mat;
    return { pin, mat, x: pin.position.x, side: Math.sign(pin.position.z), tilt: (random() - 0.5) * 1.4, rz: pin.rotation.z };
  });

  // ---- the pool: a thin sheet on the floor, drawn only where the chip above it has melted. It swells a little
  // (a meniscus that catches the light), crusts in a slow pattern and, after the melt, draws back to the letters' feet.
  const n = feet.length;
  // its own dim room reflection: at full strength the glossy sheet mirrors the bright room and reads pale
  const pool = new MeshStandardMaterial({ color: 0x111214, metalness: 0.7, roughness: 0.3, envMap: ctx.envMap, envMapIntensity: 0.18 });
  materials.push(pool);
  const thickness = `
    float poolReach(float x, float pm){ return ${halfD} * (1. + .9*pm) + .08*sin(x*9.); }
    float poolH(float x, float z){
      float pm = meltAt(x, 0.);
      float r = poolReach(x, pm);
      return .045 * pm * (1. - smoothstep(r*.45, r, abs(z))) + .006 * pm * sin(x*6.3 + z*4.1 - uA*1.7);
    }`;
  pool.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, meltU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL}\n${thickness}\nvarying vec3 vWP;`)
      .replace('#include <beginnormal_vertex>', `
        vec3 pw = (modelMatrix * vec4(position, 1.)).xyz;
        float e = .03;
        float gx = (poolH(pw.x + e, pw.z) - poolH(pw.x - e, pw.z)) / (2.*e);
        float gz = (poolH(pw.x, pw.z + e) - poolH(pw.x, pw.z - e)) / (2.*e);
        vec3 nw = normalize(vec3(-gx, 1., -gz));
        vec3 objectNormal = vec3(nw.x, -nw.z, nw.y); // the plane lies flat: local z is world y, local y is -world z`)
      .replace('#include <project_vertex>', `
        vec4 wp = modelMatrix * vec4(transformed, 1.);
        wp.y += poolH(wp.x, wp.z);
        vWP = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP; uniform float uCool, uReach; uniform float uLX[${n}], uLH[${n}];\n${GLSL}
        float pHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float pNoise(vec2 p){
          vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(pHash(i), pHash(i + vec2(1.,0.)), f.x), mix(pHash(i + vec2(0.,1.)), pHash(i + vec2(1.,1.)), f.x), f.y);
        }
        float gCrust, gEdge;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float pm = meltAt(vWP.x, 0.);
        float reach = ${halfD} * (1. + .9*pm) + .08*sin(vWP.x*9.);
        if (pm < .25 || abs(vWP.z) > reach || abs(vWP.x) > ${f2(chipHalf)} + .25*pm) discard;
        float dl = 99.;
        for (int i=0;i<${n};i++){ vec2 q = max(abs(vWP.xz - vec2(uLX[i], 0.)) - vec2(uLH[i], .32), 0.); dl = min(dl, length(q)); }
        if (dl > uReach + .06*sin(vWP.x*13.) + .05*sin(vWP.z*9.+vWP.x*3.)) discard;
        // a slow crust: dark skin drifting over the glowing metal, thicker towards the rim and as it cools
        vec2 cp = vWP.xz * vec2(3.2, 4.5) + vec2(uA*.35, -uA*.2);
        float cn = .65*pNoise(cp) + .35*pNoise(cp*2.3 + 7.);
        gEdge = 1. - smoothstep(reach - .3, reach, abs(vWP.z));
        gCrust = smoothstep(.42, .62, cn + .25*(1. - gEdge) + .5*uCool);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 1. - .35*gCrust;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(.18, .5, gCrust);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // deep orange at most, never paler than the chip's own glow: the brightest metal is in the cracks of the crust
        vec3 hot = mix(vec3(.75,.1,.01), vec3(1.,.32,.04), smoothstep(.3, 1., gEdge*(1.-gCrust)));
        totalEmissiveRadiance += hot * (.15 + .85*(1.-gCrust)) * (.3 + .7*gEdge) * .9 * (1. - uCool);`);
  };
  const puddle = new Mesh(new PlaneGeometry(chipHalf * 2 + 1, CHIP_DEPTH * 2.4, ctx.tier === 'phone' ? 96 : 192, 48), pool);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.006;
  puddle.receiveShadow = true;
  puddle.visible = false; // compiled after the first frame (scene warmLater)
  puddle.frustumCulled = false; // the vertex shader lifts it
  scene.add(puddle);

  // ---- the welds and slag beads at each letter's foot, where the pool fused to it
  const beadGeometry = new SphereGeometry(1, 20, 12);
  const beadMaterial = new MeshStandardMaterial({ color: 0x121315, metalness: 1, roughness: 0.22, emissive: 0xff3a06, emissiveIntensity: 0 });
  materials.push(beadMaterial);
  const weldTops = feet.map(() => 0.18 + random() * 0.32);
  const beads: Array<{ mesh: Mesh; r: number }> = [];
  for (const L of feet) {
    for (let k = 0; k < BEADS_PER_LETTER; k++) {
      const mesh = new Mesh(beadGeometry, beadMaterial);
      mesh.position.set(L.x + (random() - 0.5) * L.half * 1.8, 0, (k % 2 ? 1 : -1) * (0.26 + random() * 0.06));
      mesh.scale.setScalar(0);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      beads.push({ mesh, r: 0.1 + random() * 0.12 });
    }
  }

  let start: number | null = null;
  let age: number | null = null;
  let melting = false;

  // after the melt the field is constant (all molten): no need to evaluate it every frame at rest
  const field = (x: number, z: number) => (age === null ? 0 : age >= end ? 1 : meltAt(x, z, age, hotX, chipHalf));
  const surface = (x: number) => (age === null ? CHIP_TOP : age >= end ? 0 : CHIP_TOP * (1 - Math.pow(slumpAt(x, 0, age, hotX, chipHalf), SAG_POWER)));
  let rested = false;
  // letters rest on the slumping surface (the same slump the vertex shader uses), so they sink as it gives way
  chip.topAt = surface;

  return {
    end,
    field,
    surface,
    get age() { return age; },
    get poolDrawn() { return puddle.visible; },
    begin(t) { start = t; },
    update(t) {
      if (start === null || t < start) {
        return;
      }
      const a = (age = t - start);
      if (rested) return; // cooled and fused: nothing changes any more
      rested = a > end + COOL_S + 0.1;
      meltU.uA.value = a;
      const cool = smoothstep(end, end + COOL_S, a);
      meltU.uCool.value = cool;
      if (!melting) { melting = true; body.castShadow = false; } // the shadow pass does not see the slump
      warn.intensity = Math.max(0, 3 * (1 - a * 1.5));
      for (const p of pinState) {
        const m = meltAt(p.x, p.side * CHIP_DEPTH / 2, a, hotX, chipHalf);
        p.pin.position.y = 0.1 - m * 0.09;
        p.pin.position.z = p.side * (CHIP_DEPTH / 2 + 0.02 + m * 0.35);
        p.pin.rotation.z = p.rz + p.tilt * m;
        p.pin.rotation.x = p.side * m * 1.2;
        const sink = 1 - smoothstep(0.8, 0.98, m);
        p.pin.scale.set(sink, (1 - m * 0.6) * sink, sink);
        p.mat.emissiveIntensity = Math.sin(Math.min(m, 1) * Math.PI) * 1.2 * (1 - cool);
      }
      group.visible = a <= end + 0.3; // every part has joined the pool by then
      const fuse = smoothstep(end * 0.55, end + 1.4, a);
      // the pool draws back past the letters' footprints (its wavy rim reaches 0.11 beyond uReach), so its last
      // ring shrinks to nothing before the sheet is hidden: nothing pops out of existence
      meltU.uReach.value = 2.77 * (1 - fuse) - 0.15;
      puddle.visible = meltU.uReach.value > -0.14;
      const glow = 1 - cool;
      feet.forEach((L, i) => { L.weld.top.value = weldTops[i] * fuse; L.weld.glow.value = glow; });
      for (const b of beads) {
        b.mesh.visible = fuse > 0;
        b.mesh.scale.set(b.r * fuse, b.r * 0.45 * fuse, b.r * 0.8 * fuse);
      }
      beadMaterial.emissiveIntensity = 1.3 * glow;
      // a letter glows while the metal under it is still melting, then cools to rusted iron
      feet.forEach((L, i) => {
        let top = 0;
        for (let k = 0; k <= 6; k++) top = Math.max(top, surface(L.x - L.half + (L.half * 2 * k) / 6));
        letters.heatTo[i] = top > 0.05 && a < end ? 0.6 : 0;
      });
    },
    dispose() {
      for (const m of materials) m.dispose();
      beadGeometry.dispose();
      puddle.geometry.dispose();
    },
  };
}
