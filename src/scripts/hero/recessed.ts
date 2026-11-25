import {
  BoxGeometry, CanvasTexture, ExtrudeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Plane, PointLight, Raycaster, RepeatWrapping, Shape, SRGBColorSpace, Vector3, type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ui } from '../../content/ui';
import { createChip, CHIP_TOP, type Chip } from './chip';
import { createLetters } from './letters';
import { chipTopUnder } from './footprint';
import { createEmbers } from './embers';
import { COOL_S, createMelt } from './melt';
import { createCasting } from './casting';
import type { SceneContext, SceneModule } from './scene';

export { preloadLabelFonts } from './chip';

const KERNEL_DECK = 0.578;
const CHIP_NOSE = 0.39;
const OPENING_S = 1.05;
const HEATING_S = 1.96;

function block(parent: Group, material: Material, w: number, h: number, d: number, y: number, z = 0, x = 0) {
  const mesh = new Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.05, h / 3)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function machinedFinish() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const pen = canvas.getContext('2d')!;
  const grains = pen.createImageData(canvas.width, canvas.height);
  let seed = 42;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      const machining = 14 * Math.sin(y * 0.42) + 14 * Math.sin(y * 0.91 + x * 0.11);
      const level = 170 + machining + (seed / 0x100000000 - 0.5) * 51;
      grains.data.set([level, level, level, 255], (y * canvas.width + x) * 4);
    }
  }
  pen.putImageData(grains, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function wording(
  text: string,
  body: string,
  edge: string,
  ink: string,
  { signal = false, fontSize = 158, finish = 'plate', maxWidth }: {
    signal?: boolean;
    fontSize?: number;
    finish?: 'plate' | 'printed' | 'engraved';
    maxWidth?: number;
  } = {},
) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 220;
  const pen = canvas.getContext('2d')!;
  pen.fillStyle = body;
  pen.fillRect(0, 0, canvas.width, canvas.height);
  if (finish === 'plate') {
    pen.strokeStyle = edge;
    pen.lineWidth = 6;
    pen.strokeRect(11, 11, canvas.width - 22, canvas.height - 22);
  } else if (finish === 'engraved') {
    pen.fillStyle = '#24282c';
    pen.fillRect(16, 15, canvas.width - 32, canvas.height - 30);
    pen.strokeStyle = edge;
    pen.lineWidth = 4;
    pen.strokeRect(16, 15, canvas.width - 32, canvas.height - 30);
  }
  pen.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
  pen.textAlign = 'center';
  pen.textBaseline = 'middle';
  if (finish === 'engraved') {
    pen.fillStyle = '#101215';
    pen.fillText(text, canvas.width / 2, 114);
  }
  pen.fillStyle = ink;
  pen.fillText(text, signal ? 745 : canvas.width / 2, 112, maxWidth ?? (signal ? 1296 : 1370));
  if (signal) {
    pen.fillStyle = '#ff663a';
    pen.beginPath();
    pen.arc(1447, 110, 16, 0, Math.PI * 2);
    pen.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function face(parent: Group, texture: CanvasTexture, w: number, h: number, y: number, z: number) {
  const plate = new Mesh(new BoxGeometry(w, h, 0.004), new MeshBasicMaterial({ map: texture, toneMapped: false }));
  plate.position.set(0, y, z);
  parent.add(plate);
  return plate;
}

function kernelBase(ctx: SceneContext, w: number, engraved: boolean, finish: CanvasTexture) {
  const foundation = new Group();
  const iron = new MeshStandardMaterial({
    color: engraved ? 0x373c42 : 0x454246, metalness: 0.64, roughness: 0.63,
    roughnessMap: finish, bumpMap: finish, bumpScale: 0.017,
  });
  block(foundation, iron, w + 1.12, 0.51, 2.68, 0.287);
  block(foundation, iron, w + 1.04, 0.090, 2.57, 0.045);
  block(foundation, iron, w + 1.05, 0.082, 2.60, KERNEL_DECK - 0.041);
  const label = wording(ui.kernelDeck, '#26292d', '#52575c', '#e3e6e8', {
    fontSize: 167, finish: engraved ? 'engraved' : 'plate',
  });
  face(foundation, label, w * 0.68, 0.420, 0.282, 1.342);
  ctx.scene.add(foundation);
  return { foundation, iron, label };
}

function moduleSurface(
  ctx: SceneContext, halfWidth: number, finish: CanvasTexture,
  { deck, top = CHIP_TOP }: { deck?: number; top?: number } = {},
): Chip {
  const w = halfWidth * 2;
  const recessed = deck !== undefined;
  const seat = recessed ? deck + 0.043 : top - 0.88;
  const height = top - seat;
  const chip = createChip(ctx, halfWidth, recessed ? { width: w * 0.86, height: height - 0.033 } : undefined);
  const { body, face: moduleFace, pins, group } = chip.parts;
  const shellMaterial = body.material as MeshStandardMaterial;
  shellMaterial.color.setHex(0x25272b);
  shellMaterial.roughness = 0.66;
  shellMaterial.roughnessMap = shellMaterial.bumpMap = finish;
  shellMaterial.bumpScale = 0.014;
  const nose = recessed ? CHIP_NOSE : 1;
  const depth = nose + 1;
  const geometry = recessed
    ? bronzeShell(w, height, depth)
    : new BoxGeometry(w, height, depth, 96, 14, 20);
  if (top > CHIP_TOP) {
    // Set the top row in slightly to catch light on the upper edge.
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      if (vertices.getY(i) < height / 2 - 0.001) continue;
      vertices.setX(i, vertices.getX(i) * (1 - 0.040 / halfWidth));
      vertices.setZ(i, vertices.getZ(i) * 0.96);
    }
    geometry.computeVertexNormals();
  }
  body.geometry.dispose();
  body.geometry = geometry;
  body.position.set(0, top - height / 2, nose - depth / 2);
  moduleFace.position.set(0, recessed ? body.position.y + 0.003 : body.position.y, nose + 0.003);
  if (!recessed) moduleFace.scale.y = 0.70;
  for (const metalPin of pins) metalPin.removeFromParent();
  pins.length = 0;
  if (recessed) chip.parts.warn.position.set(w * 0.36, top - 0.06, nose + 0.12);
  const moduleLabel = recessed ? null : wording(ui.chip.toUpperCase(), '#302b2a', '#8b583d', '#f5d4b4', {
    signal: true,
  });
  if (moduleLabel) (moduleFace.material as MeshBasicMaterial).map = moduleLabel;
  const { foundation, iron, label: kernelLabel } = kernelBase(ctx, w, recessed, finish);
  const copper = new MeshStandardMaterial({ color: 0x9b4a25, metalness: 0.68, roughness: 0.43, emissive: 0xd84c1b, emissiveIntensity: 0.14 });
  if (!recessed) block(foundation, copper, w + 1.02, 0.034, 0.053, 0.486, 1.286);
  for (const direction of [-1, 1]) {
    if (recessed) {
      block(foundation, iron, 0.38, 0.37, 2.46, KERNEL_DECK + 0.185, -0.012, direction * (halfWidth + 0.187));
      block(foundation, copper, 0.13, 0.027, 0.024, KERNEL_DECK + 0.285, 1.224, direction * (halfWidth + 0.187));
      const socketHeight = seat - KERNEL_DECK + 0.012;
      block(foundation, iron, 0.31, socketHeight, 0.97, KERNEL_DECK + socketHeight / 2, -0.56, direction * (halfWidth + 0.133));
    } else {
      block(foundation, iron, 0.32, 0.33, 2.47, 0.6, 0, direction * (halfWidth + 0.21));
      block(group, copper, 0.29, 0.19, 0.17, 1.03, 1.04, direction * (halfWidth - 0.23));
    }
  }
  const dispose = chip.dispose;
  chip.dispose = () => {
    dispose?.();
    // The original texture belongs to createChip; the mock owns these two.
    moduleLabel?.dispose();
    kernelLabel.dispose();
  };
  return chip;
}

function bronzeShell(w: number, h: number, d: number) {
  const gauge = 0.055;
  const top = new BoxGeometry(w, gauge, d, 96, 2, 20).translate(0, (h - gauge) / 2, 0);
  const walls = [top];
  for (const side of [-1, 1]) {
    walls.push(new BoxGeometry(w, h - gauge, gauge, 96, 12, 2)
      .translate(0, -gauge / 2, side * (d - gauge) / 2));
    walls.push(new BoxGeometry(gauge, h - gauge, d - 2 * gauge, 2, 12, 20)
      .translate(side * (w - gauge) / 2, -gauge / 2, 0));
  }
  const shell = mergeGeometries(walls)!;
  for (const wall of walls) wall.dispose();
  return shell;
}

function castingTray(stage: Group, width: number, top: number, steel: MeshStandardMaterial, rim: MeshStandardMaterial, singleInlet = false) {
  const topZ = 0.88;
  const lipZ = 1.155;
  const depth = 0.465;
  const rise = 0.427;
  const profile = new Shape()
    .moveTo(-1.14, top - depth)
    .lineTo(lipZ, top - depth)
    .lineTo(lipZ, top - rise)
    .lineTo(topZ, top)
    .lineTo(-1.14, top)
    .closePath();
  const tray = new Mesh(new ExtrudeGeometry(profile, { depth: width, bevelEnabled: false }), steel);
  tray.position.x = width / 2;
  tray.rotation.y = -Math.PI / 2;
  tray.castShadow = tray.receiveShadow = true;
  stage.add(tray);

  const moldWidth = width - 0.28;
  const casting = createCasting(moldWidth, { singleInlet });
  const mold = face(stage, casting.texture, moldWidth, Math.hypot(rise, lipZ - topZ), top - rise / 2 + 0.004, (topZ + lipZ) / 2 + 0.004);
  mold.rotation.x = -Math.atan2(lipZ - topZ, rise);
  casting.apply(mold.material);

  // The gaps in the upper rim connect the pool to the mold. The lower rim closes the runner.
  const notch = 0.055;
  let start = -width / 2;
  for (const end of [...casting.inlets, width / 2 + notch]) {
    const length = end - notch - start;
    block(stage, rim, length, 0.047, 0.073, top + 0.017, topZ - 0.01, start + length / 2);
    start = end + notch;
  }
  const runway = topZ - CHIP_NOSE;
  for (const x of casting.inlets) {
    const rampZ = CHIP_NOSE + runway / 2;
    const floor = block(stage, rim, 0.148, 0.018, runway, top + 0.014, rampZ, x);
    floor.rotation.x = 0.108;
    for (const side of [-1, 1]) {
      const edge = block(stage, steel, 0.026, 0.028, runway, top + 0.018, rampZ, x + side * 0.075);
      edge.rotation.x = floor.rotation.x;
    }
  }
  block(stage, rim, width, 0.045, 0.069, top - rise - 0.014, lipZ + 0.013);
  block(stage, rim, width, 0.073, 0.083, top + 0.031, -1.097);
  for (const side of [-1, 1]) {
    block(stage, steel, 0.10, 0.083, 2.05, top + 0.031, -0.113, side * (width / 2 - 0.05));
  }
  return { casting, poolHalfDepth: topZ, underside: top - depth };
}

function filesystemSocket(ctx: SceneContext, underside: number) {
  const socket = new Group();
  const housing = new MeshStandardMaterial({ color: 0x26262b, metalness: 0.55, roughness: 0.42 });
  const connector = new MeshStandardMaterial({ color: 0x47454a, metalness: 0.64, roughness: 0.4 });
  const contact = new MeshStandardMaterial({ color: 0xba7e47, emissive: 0xcc6328, emissiveIntensity: 0.38, roughness: 0.45 });
  const height = underside - KERNEL_DECK;
  block(socket, housing, 0.84, 0.075, 0.75, KERNEL_DECK + 0.03, 0.515);
  block(socket, connector, 0.54, height - 0.05, 0.63, KERNEL_DECK + height / 2 + 0.004, 0.51);
  block(socket, housing, 0.70, 0.066, 0.70, underside - 0.027, 0.51);
  block(socket, contact, 0.225, 0.033, 0.022, KERNEL_DECK + height / 2, 0.828);
  ctx.scene.add(socket);
}

function heatingFixture(ctx: SceneContext, trayTop: number, width: number) {
  const equipment = new Group();
  const refractory = new MeshStandardMaterial({ color: 0x272625, roughness: 0.86 });
  const element = new MeshStandardMaterial({ color: 0x34231c, emissive: 0xff490e, emissiveIntensity: 0, roughness: 0.56 });
  block(equipment, refractory, width + 0.06, 0.13, 0.19, trayTop - 0.079, -1.157);
  block(equipment, element, width - 0.25, 0.025, 0.048, trayTop + 0.005, -1.165);
  const lamp = new PointLight(0xff6a2d, 0, 4.5, 2);
  lamp.position.set(0, trayTop + 0.12, -1.47);
  ctx.scene.add(equipment, lamp);

  return (power: number) => {
    element.emissiveIntensity = power * 0.96;
    lamp.intensity = power * 1.45;
  };
}

export function createRecessedStage(hook?: HTMLElement): (ctx: SceneContext) => Promise<SceneModule> {
  return async ctx => {
    const platformTop = CHIP_TOP - 0.15;
    const moduleTop = CHIP_TOP + 0.32;
    const rustProgress = { value: ctx.startAt === 'finished' ? 1 : 0 };
    const letters = await createLetters(ctx, OPENING_S, { rustProgress });
    const built: SceneModule[] = [letters];
    try {
      await ctx.pause();
      const finish = machinedFinish();
      built.push({ dispose: () => finish.dispose() });
      const insert = moduleSurface(ctx, letters.total / 2 + 0.4, finish, { deck: platformTop, top: moduleTop });
      built.push(insert);
      const setHeaterPower = heatingFixture(ctx, platformTop, letters.total);
      const storedHeat = { value: 0 };
      const contactHeat = { value: 0 };
      ctx.setWordWidth(letters.total);
      await ctx.pause();

      const platform = new Group();
      const steel = new MeshStandardMaterial({
        color: 0x3e3939, metalness: 0.66, roughness: 0.64, roughnessMap: finish, bumpMap: finish, bumpScale: 0.016,
      });
      const rim = new MeshStandardMaterial({
        color: 0x654334, metalness: 0.73, roughness: 0.59, roughnessMap: finish, bumpMap: finish, bumpScale: 0.01,
      });
      const width = insert.halfWidth * 2 - 0.50;
      const { casting, poolHalfDepth, underside } = castingTray(platform, width, platformTop, steel, rim);
      built.push({ dispose: () => casting.texture.dispose() });
      filesystemSocket(ctx, underside);
      ctx.scene.add(platform);
      await ctx.pause();

      const melt = createMelt(ctx, insert, letters, {
        top: platformTop, moduleTop, underside, halfDepth: poolHalfDepth, halfWidth: width / 2, inlets: casting.inlets,
        storedHeat,
        contactHeat,
      });
      built.push(melt);
      letters.land(insert);
      letters.heatTo.fill(0.80);
      const embers = createEmbers(ctx.scene, { count: ctx.tier === 'phone' ? 88 : 120 });
      built.push(embers);
      const emberRay = new Raycaster();
      const emberPlane = new Plane(new Vector3(0, 0, 1), 0);
      const pointerWorld = new Vector3(), previousPointer = new Vector3(), pointerSpeed = new Vector3();
      let pointerTracked = false;
      let minClear = Infinity;
      if (hook) {
        hook.dataset.limits = JSON.stringify({
          tier: ctx.tier, dpr: ctx.renderer.getPixelRatio(), embers: embers.count, fire: 0, haze: false,
          shadow: ctx.spot.shadow.mapSize.x,
        });
      }

      let start: number | null = null;
      // Step through the casting history on return visits to set up the same filled and cooled mold.
      if (ctx.startAt === 'finished') {
        letters.settle();
        const duration = melt.end + COOL_S + 1;
        melt.begin(-duration);
        for (let age = 0; age <= duration; age += 0.1) {
          melt.update?.(age - duration, 0.1);
          casting.update(age, melt);
        }
        start = -duration;
      }

      return {
        update(t, dt) {
          const landedAt = letters.landedAt;
          if (start === null) {
            insert.update?.(t, dt);
            if (landedAt !== null) ctx.setPhase('heating');
            else if (t >= OPENING_S) ctx.setPhase('drop');
            if (landedAt !== null && t >= landedAt + HEATING_S) {
              start = t;
              melt.begin(t);
              ctx.setPhase('melt');
            }
          }

          const age = start === null ? 0 : t - start;
          rustProgress.value = MathUtils.smoothstep(age, 0.30, melt.end + 1.25);
          const timeSinceLanding = t - (landedAt ?? t);
          const power = MathUtils.smoothstep(timeSinceLanding, 0.11, 0.61);
          const heaterPower = power * (1 - MathUtils.smoothstep(age, 0.18, 1.32));
          const warmth = MathUtils.smoothstep(timeSinceLanding, 0.40, HEATING_S - 0.07);
          const heatLevel = warmth * (1 - MathUtils.smoothstep(age, 1.20, 4.45));
          setHeaterPower(heaterPower);
          storedHeat.value = heatLevel;
          contactHeat.value = MathUtils.smoothstep(timeSinceLanding, 0.025, 0.74)
            * (1 - MathUtils.smoothstep(age, 0.14, 1.45));

          if (start !== null) {
            melt.update?.(t, dt);
            const cast = casting.update(age, melt);
            if (hook) {
              if (hook.dataset.cast !== cast) hook.dataset.cast = cast;
              const flow = casting.flowing ? 'active' : 'stopped';
              if (hook.dataset.castFlow !== flow) hook.dataset.castFlow = flow;
              hook.dataset.castWarmth = JSON.stringify([casting.inletWarmth, casting.runnerWarmth]);
            }
            if (age > melt.end + COOL_S) ctx.setPhase('cooled');
          }

          letters.update?.(t, dt);
          const lifted = MathUtils.smoothstep(age, 0.1, 1.7);
          const cooling = MathUtils.smoothstep(age, melt.end + 1, melt.end + COOL_S);
          const emberVisibility = lifted * MathUtils.lerp(1, 0.64, cooling);
          const pointer = emberVisibility > 0 ? letters.pointer : null;
          if (pointer && dt > 0) {
            emberRay.setFromCamera(pointer, ctx.camera);
            const hit = emberRay.ray.intersectPlane(emberPlane, pointerWorld);
            if (hit && pointerTracked) pointerSpeed.copy(pointerWorld).sub(previousPointer).divideScalar(dt).clampLength(0, 25);
            else pointerSpeed.set(0, 0, 0);
            if (hit) previousPointer.copy(pointerWorld);
            pointerTracked = hit !== null;
          } else pointerTracked = false;
          embers.setVisible(emberVisibility);
          embers.update(dt, t, pointerTracked ? pointerWorld : null, pointerSpeed);
          if (hook) {
            const rect = ctx.renderer.domElement.getBoundingClientRect();
            const feet = letters.bottoms();
            if (start === null) {
              const renderedTop = insert.worldTop();
              for (const foot of feet) {
                minClear = Math.min(minClear, foot.bottom - chipTopUnder(foot, insert.halfWidth, () => renderedTop));
              }
            }
            hook.dataset.canvas = JSON.stringify([rect.left, rect.top, rect.right, rect.bottom].map(n => Math.round(n * 10) / 10));
            hook.dataset.minClear = minClear.toFixed(4);
            hook.dataset.forge = letters.forgeIntensity.toFixed(3);
            hook.dataset.pool = melt.poolDrawn ? '1' : '0';
            hook.dataset.base = JSON.stringify(feet.map(foot => +foot.bottom.toFixed(4)));
            hook.dataset.meltEnd = melt.end.toFixed(3);
            hook.dataset.warn = insert.parts.warn.intensity.toFixed(3);
            hook.dataset.motion = JSON.stringify({
              t, feet: feet.map(foot => foot.bottom), landedAt, heaterPower, heatLevel, contactHeat: contactHeat.value,
              rustProgress: rustProgress.value,
            });
            hook.dataset.letters = JSON.stringify(letters.screenBoxes());
            hook.dataset.embers = JSON.stringify([+embers.opacity.toFixed(3), +embers.stir.toFixed(4)]);
          }
        },
        dispose() { for (const m of built) m.dispose?.(); },
      };
    } catch (error) {
      for (const m of built) m.dispose?.();
      throw error;
    }
  };
}
