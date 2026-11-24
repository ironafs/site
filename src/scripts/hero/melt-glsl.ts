// The shaders' copy of the melt field (melt-field.ts), generated from the same constants so the two cannot
// drift: `meltAt(x, z)` and `slumpAt(x, z)` at the melt's age `uA`, with the hot letters' x in `uHot`.
import { DUR_WAVE, EDGE, HOT_SOFT, type MELT, SLUMP, WAVES } from './melt-field.ts';

/** A GLSL float literal (1 -> "1.0"). */
const f = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export function meltGlsl(m: typeof MELT, chipHalf: number): string {
  const ripple = WAVES.map(([amp, fx, fz, phase]) => `${f(amp)}*sin(x*${f(fx)} + z*${f(fz)} + ${f(phase)})`).join(' + ');
  const slump = SLUMP.map(([dx, w]) => `sum += ${f(w)}*(meltAt(x - ${f(dx)}, z) + meltAt(x + ${f(dx)}, z));`).join('\n    ');
  const weights = 1 + 2 * SLUMP.reduce((sum, [, w]) => sum + w, 0);
  return `
  uniform float uA; uniform vec4 uHot;
  float mSmin(float a, float b){ float h = max(${f(HOT_SOFT)} - abs(a - b), 0.) / ${f(HOT_SOFT)}; return min(a, b) - h*h*${f(HOT_SOFT)}*.25; }
  float meltAt(float x, float z){
    float dh = mSmin(mSmin(abs(x - uHot.x), abs(x - uHot.y)), mSmin(abs(x - uHot.z), abs(x - uHot.w)));
    float T = max(0., ${f(m.base)} + ${f(m.noise)}*(.5 + ${ripple}) + ${f(m.hotDistance)}*dh
      - ${f(m.edgeEarly)}*smoothstep(${f(EDGE[0])}, ${f(EDGE[1])}, abs(x) / ${f(chipHalf)}));
    float D = ${f(m.durBase)} + ${f(m.durSpread)}*(.5 + .5*sin(x*${f(DUR_WAVE[0])} + z*${f(DUR_WAVE[1])} + ${f(DUR_WAVE[2])}));
    return smoothstep(T, T + D, uA);
  }
  float slumpAt(float x, float z){
    float own = meltAt(x, z);
    float sum = own;
    ${slump}
    return max(own, sum / ${f(+weights.toFixed(4))});
  }`;
}
