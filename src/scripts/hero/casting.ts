import { CanvasTexture, MathUtils, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { ui } from '../../content/ui';
import type { Melt } from './melt';

const WORDS = ui.userSpaceTray;
const TAPS = [-0.29, 0.02, -0.29, -0.28, 0, 0.02, -0.28, -0.25, 0.04, -0.29];
const CHANNEL_S = 0.37;
const RUNNER_SPEED = 0.57;
const FLOW_SETTLE_S = 0.31;
const INLET_COOL_S = 0.78;
const RUNNER_COOL_S = 1.12;

export function createCasting(width: number, { singleInlet = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 220;
  const pen = canvas.getContext('2d')!;
  pen.fillStyle = '#000';
  pen.fillRect(0, 0, canvas.width, canvas.height);
  pen.font = '700 190px "JetBrains Mono", monospace';
  pen.textAlign = 'center';
  const metrics = pen.measureText(WORDS);
  const letterWidthScale = 0.74;
  const baseline = canvas.height / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  pen.fillStyle = '#fff';
  pen.translate(canvas.width / 2, 0);
  pen.scale(letterWidthScale, 1);
  pen.fillText(WORDS, 0, baseline);

  const advance = metrics.width * letterWidthScale / (WORDS.length * canvas.width);
  const textStart = 0.5 - WORDS.length * advance / 2;
  const textBottom = 1 - (baseline + metrics.actualBoundingBoxDescent) / canvas.height;
  const textTop = 1 - (baseline - metrics.actualBoundingBoxAscent) / canvas.height;
  const railLeft = textStart - 0.014;
  const railRight = 1 - railLeft;
  const middle = textStart + 4.5 * advance;
  const inlets = singleInlet ? [middle] : [railLeft, middle, railRight];
  const channelTime = singleInlet ? 0.24 : CHANNEL_S;
  const runnerSpeed = singleInlet ? 1.02 : RUNNER_SPEED;
  const fillTime = singleInlet ? 0.71 : 1.04;
  const worldInlets = inlets.map(inlet => (inlet - 0.5) * width);
  const gates = TAPS.map((offset, i) => textStart + (i + 0.5 + offset) * advance);
  const starts = inlets.map((): number | null => null);
  const uniforms = {
    uMoldAge: { value: 0 },
    uCastCold: { value: 0 },
    uFlow: { value: 0 },
    uInletWarmth: { value: 0 },
    uRunnerWarmth: { value: 0 },
    uInlets: { value: inlets },
    uTravel: { value: inlets.map(() => -1) },
    uTextStart: { value: textStart },
    uTextBottom: { value: textBottom },
    uTextTop: { value: textTop },
    uAdvance: { value: advance },
    uGates: { value: gates },
    uLiquid: { value: gates.map(() => 0) },
  };
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;

  function apply(material: MeshBasicMaterial) {
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uMoldAge, uCastCold, uFlow, uTextStart, uTextBottom, uTextTop, uAdvance;
          uniform float uInletWarmth, uRunnerWarmth;
          uniform float uInlets[${inlets.length}], uTravel[${inlets.length}], uGates[${WORDS.length}], uLiquid[${WORDS.length}];

          float score(float distance, float radius) {
            return 1. - smoothstep(radius * .66, radius, abs(distance));
          }

          float castVoid(vec2 p, vec2 center, vec2 radius) {
            return 1. - smoothstep(.72, 1., length((p - center) / radius));
          }
        `)
        .replace('#include <map_fragment>', `
          vec2 p = vMapUv;
          float grain = .5 + .5 * sin(p.x * 204. + sin(p.y * 29.) * 3.) * cos(p.y * 121. + p.x * 53.);
          float inset = min(min(p.x, 1. - p.x) * 7., min(p.y, 1. - p.y));
          float bevel = smoothstep(.014, .084, inset);
          vec3 surface = mix(vec3(.083, .055, .049), vec3(.021, .018, .018), bevel);
          surface *= .91 + .18 * grain;

          float glyph = texture2D(map, p).r;
          float rim = max(0., texture2D(map, p - vec2(.0011, .014)).r - glyph);
          float upperBevel = max(0., glyph - texture2D(map, p + vec2(0., .013)).r);
          float lowerBevel = max(0., glyph - texture2D(map, p - vec2(0., .016)).r);
          int cell = int(clamp(floor((p.x - uTextStart) / uAdvance), 0., ${WORDS.length - 1}.));
          float fill = uLiquid[cell];
          surface = mix(surface, vec3(.007, .006, .006), glyph);
          surface += rim * vec3(.033, .026, .022);
          surface += upperBevel * vec3(.051, .054, .058) * (1. - .35 * smoothstep(.21, .82, p.x));

          float railY = uTextBottom - .050;
          float rail = smoothstep(.02, .03, p.x - ${railLeft.toFixed(5)} + .03)
                     * smoothstep(.02, .03, ${railRight.toFixed(5)} - p.x + .03);
          rail *= score(p.y - railY, .022);
          float pipes = 0.;
          float wettedPipes = 0.;
          float hotPipes = 0.;
          float hotRail = 0.;
          for (int i = 0; i < ${inlets.length}; i++) {
            float distance = abs(p.x - uInlets[i]);
            float pipe = score(distance, mix(.0031, .0052, p.y)) * smoothstep(railY - .012, railY + .013, p.y);
            float fall = clamp(uTravel[i] / ${channelTime}, 0., 1.);
            float tip = 1. - fall * (1. - railY) + .018 * sin(p.x * 171. + uMoldAge * 8.);
            pipes = max(pipes, pipe);
            float metal = pipe * smoothstep(tip, tip + .045, p.y);
            wettedPipes = max(wettedPipes, metal);
            float surge = .78 + .22 * sin(p.y * 23. + uMoldAge * 9. + float(i) * 2.);
            hotPipes = max(hotPipes, metal * surge);
            float reach = max(0., (uTravel[i] - ${channelTime}) * ${runnerSpeed});
            hotRail = max(hotRail, rail * smoothstep(distance, distance + .019, reach));
          }
          float gate = cell == 4 ? 0. : score(p.x - uGates[cell], .0045)
            * smoothstep(railY - .01, railY + .01, p.y)
            * (1. - smoothstep(uTextBottom + .009, uTextBottom + .025, p.y));
          float grooves = max(max(pipes, rail), gate);
          surface = mix(surface, vec3(.008, .006, .006), grooves * mix(.73, .66, uCastCold));
          float movingHeat = .87 + .13 * sin(p.y * 28. + p.x * 35. + uMoldAge * 10.);
          float fedRunner = max(hotRail, gate * smoothstep(0., .06, fill));
          float route = max(hotPipes, fedRunner);
          surface += route * vec3(.92, .25, .050) * movingHeat * uFlow * (1. - uCastCold);
          // Catch the metal as it crosses from the tray lip into the channel.
          surface += hotPipes * smoothstep(.76, .98, p.y) * vec3(.34, .16, .044) * uFlow * (1. - uCastCold);
          float residual = max(wettedPipes * uInletWarmth, fedRunner * uRunnerWarmth);
          surface += residual * vec3(.59, .135, .022);
          surface += grooves * vec3(.005, .004, .003) * uCastCold;

          // Bottom-fed molds fill unevenly before the surface oxidizes and cools.
          float edge = mix(uTextBottom - .035, uTextTop + .045, fill)
                     + sin(p.x * 183. + uMoldAge * 7.) * .013;
          vec2 letter = vec2((p.x - uTextStart) / uAdvance - float(cell), (p.y - uTextBottom) / (uTextTop - uTextBottom));
          letter.x += .017 * sin(letter.y * 43. + letter.x * 17.);
          // A short fill at two remote tips and a trapped pore stay in the finished casting.
          float defect = cell == 2 ? castVoid(letter, vec2(.89, .99), vec2(.22, .17))
            : cell == 8 ? castVoid(letter, vec2(.85, .84), vec2(.19, .13))
            : cell == 6 ? .66 * castVoid(letter, vec2(.39, .92), vec2(.04, .037))
            : 0.;
          float filledGlyph = glyph * (1. - smoothstep(edge - .028, edge, p.y)) * (1. - defect);
          float meniscus = filledGlyph * score(p.y - edge + .032, .048);
          vec3 hot = mix(vec3(.69, .15, .023), vec3(1., .68, .25), meniscus);
          hot *= .87 + .13 * grain;
          float broadGrain = .5 + .5 * sin(p.x * 101. + sin(p.y * 8.) * 2.2);
          float patina = smoothstep(.28, .82, .68 * broadGrain + .32 * grain);
          float facet = smoothstep(.06, .93, letter.y);
          float highlight = 1. - smoothstep(.06, .52, abs(letter.y - (.74 - .17 * (p.x - .5))));
          vec3 satin = mix(vec3(.27, .28, .29), vec3(.46, .48, .50), facet);
          satin = mix(satin, vec3(.35, .225, .13), patina * mix(.32, .11, facet));
          satin += highlight * vec3(.117, .127, .14);
          vec3 cold = satin * (.95 + .10 * grain) * (1. - .32 * lowerBevel)
                    + upperBevel * vec3(.19, .18, .163);
          surface = mix(surface, mix(hot, cold, uCastCold), filledGlyph);
          diffuseColor.rgb *= surface;
        `);
    };
  }

  return {
    texture,
    apply,
    inlets: worldInlets,
    get flowing() { return uniforms.uFlow.value > 0; },
    get inletWarmth() { return uniforms.uInletWarmth.value; },
    get runnerWarmth() { return uniforms.uRunnerWarmth.value; },
    update(age: number, melt: Pick<Melt, 'end' | 'feedsInlet'>) {
      uniforms.uCastCold.value = MathUtils.smoothstep(age, melt.end + 0.12, melt.end + 2.54);
      const feedReady = 0.95;
      worldInlets.forEach((x, i) => {
        if (starts[i] === null && age >= feedReady + i * 0.10 && melt.feedsInlet(x)) starts[i] = age;
      });
      const fill = uniforms.uLiquid.value;
      let fillEndsAt = 0;
      gates.forEach((gate, i) => {
        let arrival = Infinity;
        inlets.forEach((inlet, j) => {
          const start = starts[j];
          if (start !== null) arrival = Math.min(arrival, start + channelTime + Math.abs(gate - inlet) / runnerSpeed);
        });
        const end = arrival + fillTime + 0.13 * Math.sin(i * 1.8);
        fill[i] = MathUtils.smoothstep(age, arrival + 0.04, end);
        fillEndsAt = Math.max(fillEndsAt, end);
      });
      const feeding = Number.isFinite(fillEndsAt);
      const flowAge = Math.min(age, fillEndsAt);
      uniforms.uMoldAge.value = flowAge;
      starts.forEach((start, i) => {
        uniforms.uTravel.value[i] = start === null ? -1 : flowAge - start;
      });
      // Stop motion at the last full cavity. The wider runner sheds its remaining heat more slowly.
      const settling = feeding ? MathUtils.smoothstep(age, fillEndsAt - FLOW_SETTLE_S, fillEndsAt) : 0;
      const coolingAge = age - fillEndsAt;
      uniforms.uFlow.value = feeding ? 1 - settling : 0;
      uniforms.uInletWarmth.value = 0.34 * settling * (1 - MathUtils.smoothstep(coolingAge, 0.08, INLET_COOL_S));
      uniforms.uRunnerWarmth.value = 0.39 * settling * (1 - MathUtils.smoothstep(coolingAge, 0.20, RUNNER_COOL_S));
      if (coolingAge >= 0) return uniforms.uCastCold.value === 1 && coolingAge >= RUNNER_COOL_S ? 'cooled' : 'filled';
      return feeding ? 'pouring' : 'empty';
    },
  };
}
