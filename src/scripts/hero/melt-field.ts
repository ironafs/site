// The melt field. Each point (x, z) of the chip starts melting at its
// own time T and takes its own time D: hottest under the letters on top, early at the thin ends, uneven
// everywhere else. Pure: no three.js, so a node test imports it as it is. melt-glsl.ts builds
// the shaders' copy from the same constants, so the chip's shape, the letters, the pins and the fire agree.

export const MELT = { base: 0.1, noise: 1.5, hotDistance: 0.9, edgeEarly: 0.9, durBase: 0.8, durSpread: 1.6 } as const;

/** The x of the (up to) four hot letters; an unused slot is far off the chip (99). */
export type Hot = readonly [number, number, number, number];

/** The ripple that makes the start uneven, around 0.5: [amplitude, x frequency, z frequency, phase]. */
export const WAVES = [[0.25, 2.3, 0, 1.7], [0.15, 5.1, 0, 0.3], [0.1, 1.3, 4, 0]] as const;
/** The ripple of the duration: sin(x * a + z * b + c). */
export const DUR_WAVE = [3.7, 2.1, 0.9] as const;
/** The thin ends start early between these fractions of the half-width. */
export const EDGE = [0.6, 0.97] as const;
/**
 * The distance to the nearest hot letter is a smooth minimum over this width, so the last part to melt
 * (midway between two hot letters) is a rounded hump, not a knife-edge ridge.
 */
export const HOT_SOFT = 0.6;
/**
 * The slump: molten metal drags its neighbours down along x. A point slumps by its own melt or by the weighted
 * mean of the melt around it ([offset, weight]; 0.4 units each way), whichever is more, so where melted meets
 * unmelted the surface falls away over a short rounded shoulder instead of a sharp peak.
 */
export const SLUMP = [[0.12, 0.8], [0.25, 0.55], [0.4, 0.3]] as const;
const SLUMP_SUM = 1 + 2 * SLUMP.reduce((sum, [, w]) => sum + w, 0);

export const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** A polynomial smooth minimum (equal to min when a and b are more than k apart). */
const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

function ripple(x: number, z: number): number {
  let n = 0.5;
  for (const [amp, fx, fz, phase] of WAVES) n += amp * Math.sin(x * fx + z * fz + phase);
  return n;
}

/** When the point (x, z) starts melting, in seconds after the melt begins. */
export function meltStart(x: number, z: number, hot: Hot, chipHalf: number): number {
  const dh = smin(smin(Math.abs(x - hot[0]), Math.abs(x - hot[1]), HOT_SOFT), smin(Math.abs(x - hot[2]), Math.abs(x - hot[3]), HOT_SOFT), HOT_SOFT);
  return Math.max(0, MELT.base + MELT.noise * ripple(x, z) + MELT.hotDistance * dh - MELT.edgeEarly * smoothstep(EDGE[0], EDGE[1], Math.abs(x) / chipHalf));
}

/** How long the point (x, z) takes to melt, in seconds. */
export function meltDuration(x: number, z: number): number {
  return MELT.durBase + MELT.durSpread * (0.5 + 0.5 * Math.sin(x * DUR_WAVE[0] + z * DUR_WAVE[1] + DUR_WAVE[2]));
}

/** How far the point (x, z) has melted `t` seconds after the melt began: 0 solid, 1 liquid. */
export function meltAt(x: number, z: number, t: number, hot: Hot, chipHalf: number): number {
  const start = meltStart(x, z, hot, chipHalf);
  return smoothstep(start, start + meltDuration(x, z), t);
}

/** How far the point has slumped: its own melt, or the weighted mean of the melt around it along x (see SLUMP). */
export function slumpAt(x: number, z: number, t: number, hot: Hot, chipHalf: number): number {
  const own = meltAt(x, z, t, hot, chipHalf);
  let sum = own;
  for (const [dx, w] of SLUMP) sum += w * (meltAt(x - dx, z, t, hot, chipHalf) + meltAt(x + dx, z, t, hot, chipHalf));
  return Math.max(own, sum / SLUMP_SUM);
}

/** The time by which every point of the chip (half-width chipHalf, depth chipDepth) has melted. */
export function meltEnd(hot: Hot, chipHalf: number, chipDepth: number): number {
  let end = 0;
  // fine enough that the worst gap (a kink of slope ~1 between samples) is well under 0.01 s
  for (let x = -chipHalf; x <= chipHalf + 1e-9; x += 0.005) {
    for (let k = 0; k <= 40; k++) {
      const z = -chipDepth / 2 + (chipDepth * k) / 40;
      end = Math.max(end, meltStart(x, z, hot, chipHalf) + meltDuration(x, z));
    }
  }
  return end + 0.005;
}
