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
const TRAY_POOL = { start: 0.62, spread: 0.48, ripple: 0.048, inlet: 0.09 };

export type Melt = SceneModule & {
  /** Seconds from the melt's start until every part of the chip has melted. */
  readonly end: number;
  /** Starts the melt at scene time t (a return visit starts it far enough back that it is over). */
  begin(t: number): void;
  /** Seconds since the melt began, or null before it. */
  readonly age: number | null;
  /** How far (x, z) on the chip has melted now (0 before the melt). */
  field(x: number, z: number): number;
  /** Whether the pool has reached the lip at a mold inlet. */
  feedsInlet(x: number): boolean;
  /** The height of the chip's top at x for a melt amount (where the fire stands). */
  surface(x: number): number;
  /** Whether the molten pool is drawn this frame (?test hook). */
  readonly poolDrawn: boolean;
  readonly weldComplete: boolean;
};

type Landing = {
  top: number;
  moduleTop: number;
  underside: number;
  halfDepth: number;
  halfWidth: number;
  inlets: readonly number[];
  separateCharge?: boolean;
  storedHeat?: { value: number };
  contactHeat?: { value: number };
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

export function createMelt(ctx: SceneContext, chip: Chip, letters: Letters, landing?: Landing): Melt {
  const { scene } = ctx;
  const chipHalf = chip.halfWidth;
  const feet = letters.feet;
  // the hottest parts are under letters 0, 2, 4 and 6: the I, the o, the A and the S
  const hotX = [0, 2, 4, 6].map(i => feet[i]?.x ?? 99) as unknown as Hot;
  const end = meltEnd(hotX, chipHalf, CHIP_DEPTH);
  const GLSL = meltGlsl(MELT, chipHalf);
  const halfD = f2(CHIP_DEPTH / 2);
  const weldBase = landing?.top ?? 0;
  const moduleTop = landing?.moduleTop ?? CHIP_TOP;
  // The insert and the letters follow the same local slump. The front skirt curls
  // away from the viewer as its hotter sections soften, exposing the fixed mold.
  const trayVarying = landing ? ' varying float vDryShell, vSoftness; varying vec3 vMeltOrigin;' : '';
  const meltEdge = landing ? `
    float edgeRip = .055 * sin(vMeltOrigin.x * 13.4 + vMeltOrigin.y * 28.4)
                  + .034 * sin(vMeltOrigin.x * 31.2 - vMeltOrigin.z * 24.5 + vMeltOrigin.y * 11.3);
    float underTray = 1. - smoothstep(${f2(landing.underside - .034)}, ${f2(landing.underside + .074)}, vMeltOrigin.y);
    float skinLimit = mix(.62, .16, underTray);
    float shellCut = vMelt + .29 * vDryShell * vSoftness
                   + edgeRip * smoothstep(.08, .48, vSoftness) - mix(.985, skinLimit, vDryShell);
    if (shellCut > 0.) discard;
    float erosionRim = smoothstep(-.10, -.012, shellCut) * smoothstep(.13, .54, vSoftness) * (1. - underTray);
  ` : 'if (vMelt > .985) discard;';
  const settle = landing ? `
    float basin = ${f2(landing.top)};
    vDryShell = 1. - smoothstep(basin - .14, basin + .012, h);
    vSoftness = s;
    wp.y = mix(h, min(h, basin), pow(s, ${SAG_POWER.toFixed(1)}));
    float liquid = smoothstep(.17, .89, s);
    float skirt = vDryShell * smoothstep(.04, .80, s) * smoothstep(.55, .96, abs(zc));
    float rolled = min(abs(wp.z), ${f2(landing.halfDepth)});
    wp.z = mix(wp.z, sign(zc) * rolled, liquid);
    wp.z *= 1. - .37 * skirt;
    wp.x = mix(wp.x, clamp(wp.x, -${f2(landing.halfWidth)}, ${f2(landing.halfWidth)}), liquid);
  ` : `
    wp.y = mix(h, .015 + h*.02, pow(s, ${SAG_POWER.toFixed(1)}));
    float low = 1. - clamp(h / ${f2(CHIP_TOP)}, 0., 1.);
    wp.z += sign(wp.z) * s * (.25 + .45*low);
    wp.x += sign(wp.x) * s * .12 * low;
  `;
  const random = mulberry(23); // the same welds and beads on every visit (the poster is this finished state)

  const meltU = {
    uA: { value: -1 }, uHot: { value: new Vector4(...hotX) }, uCool: { value: 0 }, uReach: { value: 9 },
    uLX: { value: feet.map(l => l.x) }, uLH: { value: feet.map(l => l.half) },
    uStoredHeat: landing?.storedHeat ?? { value: 0 },
    uContactHeat: landing?.contactHeat ?? { value: 0 },
  };
  const materials: Material[] = [];

  // ---- the chip: deformed in world space. Molten parts slump to the floor, bulge outward and spread; the slump
  // (slumpAt) drags each point's neighbours down a short way, so the surface falls away instead of leaving peaks.
  // Flat shading takes its normals from the deformed surface, so the light follows the slumping shape. Fully
  // melted parts are discarded: by then the pool under them has taken over.
  const vertexMelt = `
    vec4 wp = modelMatrix * vec4(transformed, 1.);
    float zc = clamp(wp.z, -${halfD}, ${halfD});
    ${landing ? 'vMeltOrigin = vec3(wp.x, wp.y, zc);' : ''}
    float s = slumpAt(wp.x, zc);
    float h = wp.y;
    ${settle}
    vMelt = meltAt(${landing ? 'vMeltOrigin.x' : 'wp.x'}, zc);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;`;
  const glowColor = `
    float glow = smoothstep(.04, .35, vMelt) * (1. - .55*smoothstep(.8, 1., vMelt))${landing ? ' * (1. - vDryShell)' : ''};
    vec3 mc = mix(vec3(.85,.12,.01), ${landing ? 'vec3(1.,.36,.06)' : 'vec3(1.,.55,.12)'}, smoothstep(.3,.7,vMelt) * (1.-smoothstep(.85,1.,vMelt)));
    ${landing ? 'glow *= mix(.8, 1., smoothstep(.03, .18, vMelt));' : ''}`;
  const erosionLight = landing ? '+ vec3(.66, .15, .021) * erosionRim * (1. - uCool)' : '';
  const preheat = landing?.storedHeat ? `
    float heatFront = mix(-.90, .39, uStoredHeat);
    float rearHeat = 1. - smoothstep(heatFront - .29, heatFront + .27, vMeltOrigin.z);
    float hotDeck = mix(.16, 1., smoothstep(${f2(landing.top)}, ${f2(landing.moduleTop - .05)}, vMeltOrigin.y));
    float spreadHeat = rearHeat * hotDeck * pow(uStoredHeat, 1.45) * (1. - smoothstep(.03, .35, vMelt));
    totalEmissiveRadiance += vec3(.39, .062, .007) * spreadHeat;
  ` : '';
  const transferHeat = landing?.contactHeat ? `
    vec4 distanceToFeet = abs(vec4(vMeltOrigin.x) - uHot);
    float nearestFoot = min(min(distanceToFeet.x, distanceToFeet.y), min(distanceToFeet.z, distanceToFeet.w));
    float radial = length(vec2(nearestFoot, vMeltOrigin.z * .64));
    float spread = mix(.19, .54, uContactHeat);
    float contactPatch = 1. - smoothstep(.065, spread, radial);
    float topSkin = smoothstep(${f2(moduleTop - .13)}, ${f2(moduleTop - .020)}, vMeltOrigin.y);
    float contactGlow = contactPatch * topSkin * uContactHeat * (1. - smoothstep(.05, .48, vMelt));
    totalEmissiveRadiance += contactGlow * vec3(.64, .148, .018);
  ` : '';
  const bodyGlow = landing ? '1.01' : '1.6';
  const meltable = (m: MeshStandardMaterial | MeshBasicMaterial) => {
    if (m instanceof MeshStandardMaterial) m.flatShading = true;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, meltU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${GLSL}\nvarying float vMelt;${trayVarying}`)
        .replace('#include <project_vertex>', vertexMelt);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vMelt; uniform float uCool, uStoredHeat;
          ${landing?.contactHeat ? 'uniform float uContactHeat; uniform vec4 uHot;' : ''}${trayVarying}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n    ${meltEdge}`);
      sh.fragmentShader = m instanceof MeshStandardMaterial
        ? sh.fragmentShader
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            ${landing ? 'roughnessFactor = mix(roughnessFactor, .22, smoothstep(.14, .70, vMelt) * (1. - vDryShell) * (1. - uCool));' : ''}`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${glowColor}
            totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(0.), smoothstep(.1,.5,vMelt))
              + mc * glow * ${bodyGlow} * (1. - uCool) ${erosionLight};
            ${preheat}${transferHeat}`)
        // the label is unlit (crisp until it melts): it darkens to molten metal and glows the same way
        : sh.fragmentShader.replace('#include <opaque_fragment>', `${glowColor}
            outgoingLight = mix(outgoingLight, vec3(.02), smoothstep(.04,.4,vMelt))
              + mc * glow * ${bodyGlow} * (1. - uCool) ${erosionLight};
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
    return {
      pin, mat, x: pin.position.x, y: pin.position.y, z: pin.position.z, scale: pin.scale.clone(),
      side: Math.sign(pin.position.z), tilt: (random() - 0.5) * 1.4, rz: pin.rotation.z,
    };
  });

  // ---- the pool: a thin sheet on the floor, drawn only where the chip above it has melted. It swells a little
  // (a meniscus that catches the light), crusts in a slow pattern and, after the melt, draws back to the letters' feet.
  const n = feet.length;
  // its own dim room reflection: at full strength the glossy sheet mirrors the bright room and reads pale
  const pool = new MeshStandardMaterial({ color: 0x111214, metalness: 0.7, roughness: 0.3, envMap: ctx.envMap, envMapIntensity: 0.18 });
  materials.push(pool);
  const spread = `${halfD} * (1. + .9*pm) + .08*sin(x*9.)`;
  const inletSeries = landing?.inlets.map(x => `abs(x - (${f2(x)}))`).reduce((a, b) => `min(${a}, ${b})`);
  const poolReach = landing ? `
    float inletFlow(float x) { return 1. - smoothstep(.028, .116, ${inletSeries}); }
    float poolReach(float x, float pm) {
      return min(${f2(landing.halfDepth)}, ${TRAY_POOL.start} + ${TRAY_POOL.spread}*pm
        + ${TRAY_POOL.ripple}*sin(x*7.1 - uA*3.2) + ${TRAY_POOL.inlet}*inletFlow(x));
    }
  ` : `float poolReach(float x, float pm){ return ${spread}; }`;
  const thickness = `
    ${poolReach}
    float poolH(float x, float z){
      float pm = meltAt(x, 0.);
      float r = poolReach(x, pm);
      return .045 * pm * (1. - smoothstep(r*.45, r, abs(z))) + .006 * pm * sin(x*6.3 + z*4.1 - uA*1.7)
        ${landing ? `+ inletFlow(x) * smoothstep(.37, .51, z) * pm
          * mix(.092, .024, smoothstep(.49, .88, z))` : ''};
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
        ${poolReach}
        float pHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float pNoise(vec2 p){
          vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(pHash(i), pHash(i + vec2(1.,0.)), f.x), mix(pHash(i + vec2(0.,1.)), pHash(i + vec2(1.,1.)), f.x), f.y);
        }
        float gCrust, gEdge;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float pm = meltAt(vWP.x, 0.);
        float reach = poolReach(vWP.x, pm);
        if (pm < .25 || abs(vWP.z) > reach || abs(vWP.x) > ${f2(chipHalf)} + .25*pm) discard;
        ${landing ? `if (abs(vWP.x) > ${f2(landing.halfWidth)}) discard;` : ''}
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
        totalEmissiveRadiance += hot * (.15 + .85*(1.-gCrust)) * (.3 + .7*gEdge) * .9 * (1. - uCool);
        ${landing ? `float feed = inletFlow(vWP.x) * smoothstep(.46, .83, vWP.z);
        float ripple = .71 + .29*sin(vWP.z*46. - uA*9. + vWP.x*4.);
        totalEmissiveRadiance += vec3(.89, .27, .049) * feed * ripple * smoothstep(.34,.57,pm) * (1. - uCool);` : ''}`);
  };
  const puddle = new Mesh(new PlaneGeometry(chipHalf * 2 + 1, CHIP_DEPTH * 2.4, ctx.tier === 'phone' ? 96 : 192, 48), pool);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = weldBase + 0.006;
  puddle.receiveShadow = true;
  puddle.visible = false; // compiled after the first frame (scene warmLater)
  puddle.frustumCulled = false; // the vertex shader lifts it
  scene.add(puddle);

  // ---- the welds and slag beads at each letter's foot, where the pool fused to it
  const beadGeometry = new SphereGeometry(1, 20, 12);
  const beadMaterial = new MeshStandardMaterial({ color: 0x121315, metalness: 1, roughness: 0.22, emissive: 0xff3a06, emissiveIntensity: 0 });
  materials.push(beadMaterial);
  const weldTops = feet.map(() => landing ? 0.045 + random() * 0.10 : 0.18 + random() * 0.32);
  const beads: Array<{ mesh: Mesh; r: number }> = [];
  for (const L of feet) {
    L.weld.base.value = weldBase;
    for (let k = 0; k < BEADS_PER_LETTER; k++) {
      const mesh = new Mesh(beadGeometry, beadMaterial);
      mesh.position.set(L.x + (random() - 0.5) * L.half * 1.8, weldBase, (k % 2 ? 1 : -1) * (0.26 + random() * 0.06));
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
  const surface = (x: number) => {
    if (age === null) return moduleTop;
    if (age >= end) return weldBase;
    const sag = Math.pow(slumpAt(x, 0, age, hotX, chipHalf), SAG_POWER);
    return weldBase + (moduleTop - weldBase) * (1 - sag);
  };
  let rested = false;
  // letters rest on the slumping surface (the same slump the vertex shader uses), so they sink as it gives way
  chip.topAt = surface;

  return {
    end,
    field,
    surface,
    feedsInlet(x) {
      if (!landing || age === null) return false;
      const amount = field(x, 0);
      const edge = TRAY_POOL.start + TRAY_POOL.spread * amount
        + TRAY_POOL.ripple * Math.sin(x * 7.1 - age * 3.2) + TRAY_POOL.inlet;
      return amount >= 0.34 && edge >= landing.halfDepth - 0.01;
    },
    get age() { return age; },
    get poolDrawn() { return puddle.visible; },
    get weldComplete() { return age !== null && age >= end + 1.4 && !puddle.visible && beads.every(({ mesh }) => mesh.visible); },
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
        const m = meltAt(p.x, landing ? p.z : p.side * CHIP_DEPTH / 2, a, hotX, chipHalf);
        p.pin.position.y = landing ? p.y + (weldBase - p.y) * m : 0.1 - m * 0.09;
        p.pin.position.z = landing
          ? p.z + (p.side * landing.halfDepth - p.z) * m * 0.64
          : p.side * (CHIP_DEPTH / 2 + 0.02 + m * 0.35);
        p.pin.rotation.z = p.rz + p.tilt * m;
        p.pin.rotation.x = p.side * m * 1.2;
        const sink = 1 - smoothstep(0.8, 0.98, m);
        p.pin.scale.set(p.scale.x * sink, p.scale.y * (1 - m * 0.6) * sink, p.scale.z * sink);
        p.mat.emissiveIntensity = Math.sin(Math.min(m, 1) * Math.PI) * 1.2 * (1 - cool);
      }
      group.visible = a <= end + 0.3; // every part has joined the pool by then
      const fuse = smoothstep(landing ? 0.68 : end * 0.55, end + 1.4, a);
      // the pool draws back past the letters' footprints (its wavy rim reaches 0.11 beyond uReach), so its last
      // ring shrinks to nothing before the sheet is hidden: nothing pops out of existence
      meltU.uReach.value = 2.77 * (1 - fuse) - 0.15;
      puddle.visible = meltU.uReach.value > -0.14;
      const glow = 1 - cool;
      if (!landing?.separateCharge) {
        feet.forEach((L, i) => {
          L.weld.top.value = fuse > 0 ? weldBase + weldTops[i] * fuse : 0;
          L.weld.glow.value = glow;
        });
        // Each letter warms over its local melt and then cools.
        feet.forEach((L, i) => {
          let top = 0;
          for (let k = 0; k <= 6; k++) top = Math.max(top, surface(L.x - L.half + (L.half * 2 * k) / 6));
          letters.heatTo[i] = top > weldBase + (landing ? (moduleTop - weldBase) * 0.3 : 0.05) && a < end ? 0.6 : 0;
        });
      }
      const beadHeight = landing ? 0.45 - 0.17 * cool : 0.45;
      for (const b of beads) {
        b.mesh.visible = fuse > 0;
        b.mesh.scale.set(b.r * fuse, b.r * beadHeight * fuse, b.r * 0.8 * fuse);
      }
      if (landing) beadMaterial.roughness = 0.22 + 0.34 * cool;
      beadMaterial.emissiveIntensity = 1.3 * glow;
    },
    dispose() {
      for (const m of materials) m.dispose();
      beadGeometry.dispose();
      puddle.geometry.dispose();
    },
  };
}
