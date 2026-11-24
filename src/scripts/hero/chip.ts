// The kernel chip: a dark block labelled "kernel module", two rows of
// pins and a red warning LED. The word lands on it. The label is a 2048x520 canvas texture, drawn once,
// lit but never emissive, so the bloom pass cannot soften the text.
import { ui } from '../../content/ui';
import {
  Box3, BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, SRGBColorSpace,
} from 'three';
import type { SceneContext, SceneModule } from './scene';

export const CHIP_HEIGHT = 1.25;
export const CHIP_DEPTH = 2.0;
const CHIP_LIFT = 0.12; // pins stand under the body
/** The chip's top surface above the floor. */
export const CHIP_TOP = CHIP_HEIGHT + CHIP_LIFT;
const PINS_PER_SIDE = 14;

/** The label's fonts, as CSS font shorthands: the page's own JetBrains Mono, loaded before the texture is drawn. */
export const LABEL_FONTS = ['700 210px "JetBrains Mono"', '500 64px "JetBrains Mono"'];

export type Chip = SceneModule & {
  halfWidth: number;
  /** The chip's top height at x: flat until the melt replaces it with the slumping surface (melt.ts). */
  topAt: (x: number) => number;
  /** The parts the melt reshapes: the group, the body and label (their materials get the melt shader), the pins, the LED's light. */
  parts: { group: Group; body: Mesh; face: Mesh; pins: Mesh[]; warn: PointLight };
  /** The ?test hook: the top of the chip body as rendered (from its mesh and matrix, not from the constants). */
  worldTop(): number;
};

function mulberry(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The label is authored at the brightness it is shown at (text about 210 of 255 on a dark ground)
 * and drawn with a basic material: no light, tone mapping or the pulsing warning light can change it, and its
 * linear luminance stays under the bloom threshold (0.85), so it is crisp and never haloed. The plane is about
 * 2.2x wider than the texture, so on the phone tier the one line is drawn twice as tall (and the sub-line,
 * unreadable at that size, is left out).
 */
function labelTexture(maxAnisotropy: number, phone: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 520;
  const x = canvas.getContext('2d')!;
  x.fillStyle = '#363436';
  x.fillRect(0, 0, 2048, 520);
  x.strokeStyle = '#62666e';
  x.lineWidth = 8;
  x.strokeRect(28, 28, 1992, 464);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#ece8e2';
  x.font = `${LABEL_FONTS[0]}, monospace`;
  if (phone) {
    x.save();
    x.translate(1024, 262);
    x.scale(1, 1.9);
    x.fillText(ui.chip, 0, 0);
    x.strokeStyle = '#ece8e2'; // a thicker stem: the glyphs shrink to a few pixels on a phone
    x.lineWidth = 7;
    x.strokeText(ui.chip, 0, 0);
    x.restore();
  } else {
    x.fillText(ui.chip, 1024, 215);
    x.fillStyle = '#d4d1cb';
    x.font = `${LABEL_FONTS[1]}, monospace`;
    x.fillText(ui.chipPlatforms, 1024, 392);
  }
  x.fillStyle = '#ff3b2f'; // the LED
  x.beginPath();
  x.arc(1930, 92, 26, 0, 7);
  x.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/** `halfWidth`: the word's half-width + 0.4, so every letter lands on the chip. */
export function createChip(ctx: SceneContext, halfWidth: number): Chip {
  const width = halfWidth * 2;
  const group = new Group();
  const label = labelTexture(ctx.renderer.capabilities.getMaxAnisotropy(), ctx.tier === 'phone');

  const dark = new MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.6, roughness: 0.45 });
  const front = new MeshBasicMaterial({ map: label, toneMapped: false });
  const body = new Mesh(new BoxGeometry(width, CHIP_HEIGHT, CHIP_DEPTH, 96, 14, 20), dark);
  body.position.y = CHIP_HEIGHT / 2 + CHIP_LIFT;
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const face = new Mesh(new PlaneGeometry(width * 0.94, CHIP_HEIGHT * 0.82, 96, 12), front);
  face.position.set(0, CHIP_HEIGHT / 2 + CHIP_LIFT, CHIP_DEPTH / 2 + 0.003);
  group.add(face);

  const pinGeometry = new BoxGeometry(0.08, 0.2, 0.12);
  const pinMaterial = new MeshStandardMaterial({ color: 0xb9b2a4, metalness: 1, roughness: 0.3, emissive: 0xff4a0c, emissiveIntensity: 0 });
  const random = mulberry(11);
  const pins: Mesh[] = [];
  for (let i = 0; i < PINS_PER_SIDE; i++) {
    for (const side of [-1, 1]) {
      const pin = new Mesh(pinGeometry, pinMaterial);
      pin.position.set(-width / 2 + 0.25 + (i * (width - 0.5)) / (PINS_PER_SIDE - 1), 0.1, side * (CHIP_DEPTH / 2 + 0.02));
      pin.rotation.z = (random() - 0.5) * 0.02; // a hair off true, like soldered pins
      pin.castShadow = true;
      group.add(pin);
      pins.push(pin);
    }
  }
  ctx.scene.add(group);
  const bodyBox = new Box3();

  // the warning LED throws a red pulse on the chip's corner
  const warn = new PointLight(0xff2a1a, 0, 6, 1.6);
  warn.position.set(1.9, 1.4, 1.6);
  ctx.scene.add(warn);

  return {
    halfWidth,
    topAt: () => CHIP_TOP,
    parts: { group, body, face, pins, warn },
    worldTop() {
      body.updateMatrixWorld();
      return bodyBox.setFromObject(body).max.y;
    },
    update(t) { warn.intensity = 2.5 + 2.5 * Math.sin(t * 6); },
    dispose() {
      label.dispose();
      dark.dispose();
      front.dispose();
      pinMaterial.dispose();
      pinGeometry.dispose();
    },
  };
}
