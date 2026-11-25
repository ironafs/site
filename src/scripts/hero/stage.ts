// Puts the chip, the letters, the melt, the fire and the embers in the scene and runs their sequence (design
// 5.1): the chip alone for 3.4 s, then the letters drop one every 0.24 s, then (all landed + 0.35 s) the melt,
// then (melted + 3.5 s) cooled. After that the scene stays live at rest: embers drift, a letter warms under
// the pointer and takes a strike. A return visit starts at that finished state directly.
import { Plane, Raycaster, Vector3 } from 'three';
import { CHIP_TOP, createChip } from './chip';
import { createEmbers } from './embers';
import { createFire } from './fire';
import { chipTopUnder } from './footprint';
import { createLetters, CHIP_ALONE_S } from './letters';
import { COOL_S, createMelt } from './melt';
import type { SceneContext, SceneModule } from './scene';

const MELT_AFTER_LANDING_S = 0.35;
const EMBERS_FADE_S = 2.5;

/**
 * The module factory for createScene. `hook`: the #hero element under ?test, which then shows the letters'
 * screen boxes (data-letters), the canvas box (data-canvas), the least gap seen between a rendered letter's
 * lowest point and the chip's rendered top under it until the melt (data-min-clear), the pointer light
 * (data-forge), the embers' opacity and stir speed (data-embers), whether the pool is drawn (data-pool),
 * each letter's lowest point (data-base), the melt's length (data-melt-end), the chip's warning light (data-warn)
 * and the tier's limits (data-limits).
 */
export function createStage(hook?: HTMLElement): (ctx: SceneContext) => Promise<SceneModule> {
  return async ctx => {
    const phone = ctx.tier === 'phone';
    const letters = await createLetters(ctx);
    const built: SceneModule[] = [letters];
    try {
      await ctx.pause(); // a task each: the letters, the chip and the melt, the fire and the embers
      const chip = createChip(ctx, letters.total / 2 + 0.4); // every letter lands on it
      built.push(chip);
      letters.land(chip);
      ctx.setWordWidth(letters.total);
      const melt = createMelt(ctx, chip, letters);
      built.push(melt);
      await ctx.pause();
      const fire = createFire(ctx, {
        count: phone ? 400 : 900, haze: !phone, chipHalf: chip.halfWidth,
        field: melt.field, top: m => CHIP_TOP * (1 - Math.pow(m, 1.3)), // a flame stands on the slumping metal
        sparks: letters.sparks,
      });
      built.push(fire);
      const embers = createEmbers(ctx.scene, { count: phone ? 120 : 220 });

      // the pointer stirs the air: where its ray meets the plane of the word, and how fast that point moves
      const ray = new Raycaster();
      const plane = new Plane(new Vector3(0, 0, 1), 0);
      const pointerW = new Vector3(), pointerPrev = new Vector3(), pointerVel = new Vector3();
      let pointerSeen = false;

      let meltStart: number | null = null;
      let minClear = Infinity;
      if (ctx.startAt === 'finished') letters.settle();

      return {
        resize(w, h) { fire.resize?.(w, h); },
        update(t, dt) {
          if (ctx.startAt === 'finished' && meltStart === null) melt.begin((meltStart = t - (melt.end + COOL_S + 1)));
          if (meltStart === null) chip.update?.(t, dt); // the warning light pulses until the melt, which then puts it out for good
          if (meltStart === null && t >= CHIP_ALONE_S) ctx.setPhase('drop');
          if (meltStart === null && letters.landedAt !== null && t >= letters.landedAt + MELT_AFTER_LANDING_S) {
            melt.begin((meltStart = t));
            ctx.setPhase('melt');
          }
          melt.update?.(t, dt);
          letters.update?.(t, dt);
          if (melt.age === null || melt.age < melt.end + 2) fire.update?.(t, dt); // the last flames are out by then
          if (meltStart !== null && t - meltStart > melt.end + COOL_S) ctx.setPhase('cooled');

          const ndc = letters.pointer;
          if (ndc && dt > 0) {
            ray.setFromCamera(ndc, ctx.camera);
            if (ray.ray.intersectPlane(plane, pointerW)) {
              if (pointerSeen) pointerVel.copy(pointerW).sub(pointerPrev).divideScalar(dt).clampLength(0, 25);
              else pointerVel.set(0, 0, 0);
              pointerPrev.copy(pointerW);
              pointerSeen = true;
            } else pointerSeen = false;
          } else pointerSeen = false;
          if (!pointerSeen) pointerVel.set(0, 0, 0);
          embers.setVisible(meltStart === null ? 0 : (t - meltStart) / EMBERS_FADE_S);
          embers.update(dt, t, pointerSeen ? pointerW : null, pointerVel);

          if (hook) {
            const r = ctx.renderer.domElement.getBoundingClientRect();
            hook.dataset.letters = JSON.stringify(letters.screenBoxes());
            hook.dataset.canvas = JSON.stringify([r.left, r.top, r.right, r.bottom].map(v => Math.round(v * 10) / 10));
            const bottoms = letters.bottoms();
            // until the melt: once it starts, the letters sink into the molten metal by design
            if (meltStart === null) {
              const top = () => chip.worldTop();
              for (const l of bottoms) minClear = Math.min(minClear, l.bottom - chipTopUnder(l, chip.halfWidth, top));
            }
            hook.dataset.minClear = minClear.toFixed(4);
            hook.dataset.forge = letters.forgeIntensity.toFixed(3);
            hook.dataset.embers = JSON.stringify([+embers.opacity.toFixed(3), +embers.stir.toFixed(4)]);
            hook.dataset.pool = melt.poolDrawn ? '1' : '0';
            hook.dataset.base = JSON.stringify(bottoms.map(l => +l.bottom.toFixed(4)));
            hook.dataset.meltEnd = melt.end.toFixed(3);
            hook.dataset.flames = String(fire.flames);
            hook.dataset.warn = chip.parts.warn.intensity.toFixed(3);
            hook.dataset.limits = JSON.stringify({ tier: ctx.tier, dpr: ctx.renderer.getPixelRatio(), embers: embers.count, fire: fire.capacity, haze: fire.hazePass, shadow: ctx.spot.shadow.mapSize.x });
          }
        },
        dispose() {
          for (const m of built) m.dispose?.();
          embers.dispose();
        },
      };
    } catch (error) {
      for (const m of built) m.dispose?.(); // something failed to build: free what was made, and let the scene fall back
      throw error;
    }
  };
}
