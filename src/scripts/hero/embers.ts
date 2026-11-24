// Drifting embers: they appear only once the fire starts
// (the stage fades them in over 2.5 s), drift up, and the pointer stirs the air: embers near it are pushed
// aside and pulled along in its wake, then settle as the stir damps away.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Points, PointsMaterial, type Scene, type Vector3,
} from 'three';

export const EMBER_PUSH_RADIUS = 1.8;
export const EMBER_WAKE = 0.9;
export const EMBER_DAMPING = 2.2; // per second

export type Embers = {
  update(dt: number, t: number, pointer: Vector3 | null, pointerVel: Vector3): void;
  /** 0 hidden .. 1 fully shown. */
  setVisible(f: number): void;
  /** The ?test hook: the opacity now and the mean stir speed (the pointer's share of their motion). */
  readonly opacity: number;
  readonly stir: number;
  /** The ?test hook: how many embers there are. */
  readonly count: number;
  dispose(): void;
};

/** A soft round dot, for the ember sprites. */
function dot(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export function createEmbers(scene: Scene, opts: { count: number }): Embers {
  const n = opts.count;
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    seed[i] = Math.random() * 10;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const map = dot();
  const mat = new PointsMaterial({ size: 0.11, map, color: 0xff8a3a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false; // compiled after the first frame (scene warmLater) unless shown at once
  scene.add(points);
  let shown = 0;
  let stir = 0;

  return {
    get opacity() { return points.visible ? mat.opacity : 0; },
    get stir() { return stir; },
    get count() { return n; },
    setVisible(f) { shown = Math.min(Math.max(f, 0), 1); },
    update(dt, t, pointer, pointerVel) {
      const damp = Math.exp(-EMBER_DAMPING * dt);
      let speed = 0;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        if (pointer) {
          const dx = pos[k] - pointer.x, dy = pos[k + 1] - pointer.y, dz = (pos[k + 2] - pointer.z) * 0.5;
          const dist = Math.hypot(dx, dy, dz);
          if (dist < EMBER_PUSH_RADIUS) {
            const f = (1 - dist / EMBER_PUSH_RADIUS) ** 2, inv = 1 / Math.max(dist, 0.05);
            vel[k] += (dx * inv * 5 + pointerVel.x * EMBER_WAKE) * f * dt * 3;
            vel[k + 1] += (dy * inv * 5 + pointerVel.y * EMBER_WAKE) * f * dt * 3;
            vel[k + 2] += dz * inv * 3 * f * dt * 3;
          }
        }
        vel[k] *= damp; vel[k + 1] *= damp; vel[k + 2] *= damp;
        speed += Math.hypot(vel[k], vel[k + 1], vel[k + 2]);
        pos[k + 1] += dt * (0.25 + 0.15 * Math.sin(t + seed[i])) + vel[k + 1] * dt;
        pos[k] += Math.sin(t * 0.7 + seed[i]) * dt * 0.15 + vel[k] * dt;
        pos[k + 2] += vel[k + 2] * dt;
        if (pos[k + 1] > 6 || pos[k + 1] < -0.2 || Math.abs(pos[k]) > 10) {
          pos[k + 1] = 0; pos[k] = (Math.random() - 0.5) * 16; pos[k + 2] = (Math.random() - 0.5) * 6;
          vel[k] = vel[k + 1] = vel[k + 2] = 0;
        }
      }
      stir = speed / n;
      geo.attributes.position.needsUpdate = true;
      mat.opacity = (0.78 + 0.18 * Math.sin(t * 3)) * shown;
      points.visible = shown > 0;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      map.dispose();
    },
  };
}
