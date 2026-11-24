// The animated wordmark: steel "Ir", the iron cell as the "o" (turning slowly, its core
// breathing), steel "n", and "AFS" drawn on a canvas so rust can grow over it: about two seconds, once, on load.
// Hovering the logo burns the rust off with a glowing edge; it creeps back after. Reduced motion: the finished,
// rusted wordmark, still. Under the CSP nothing here sets a style attribute: sizes and the core's glow are CSSOM
// writes (custom properties and element.style), the cell is built from SVG nodes once and only its attributes move.

export type RustLogoOptions = { theme: 'dark' | 'light' };
/** setTheme re-colours a mounted logo in place (its canvas and cell), in the same animation loop. */
export type RustLogoHandle = { setTheme(theme: 'dark' | 'light'): void };

const SVG = 'http://www.w3.org/2000/svg';
const RUST_PER_S = 0.5; // ~2 s to rust over
const BURN_PER_S = 1.1; // under a second to burn off
const MAX_DT = 0.5; // the rust keeps to the clock through long frames (the hero's 3D loads at the same time)
const FONT = '"Space Grotesk"';

// ---------- value noise for the rust (seeded) ----------
function makeNoise(seed: number): (x: number, y: number) => number {
  let a = seed;
  const rand = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const G = 64;
  const g = new Float32Array(G * G).map(rand);
  const q = (i: number, j: number) => g[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (q(xi, yi) * (1 - u) + q(xi + 1, yi) * u) * (1 - v) + (q(xi, yi + 1) * (1 - u) + q(xi + 1, yi + 1) * u) * v;
  };
  return (x, y) => {
    let t = 0, amp = 0.5;
    for (let o = 0; o < 5; o++) { t += amp * vn(x, y); x *= 2.03; y *= 2.03; amp *= 0.5; }
    return t;
  };
}
const fbm = makeNoise(7);
const fbm2 = makeNoise(19);

// ---------- the cell (the "o"): a body-centred cube, eight steel atoms and a glowing core ----------
const CORNERS: [number, number, number][] = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push([x, y, z]);
const EDGES: [number, number][] = [];
for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
  if (CORNERS[i].reduce((n, c, k) => n + (c !== CORNERS[j][k] ? 1 : 0), 0) === 1) EDGES.push([i, j]);
}
let uid = 0;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function radial(id: string, stops: [number, string][]): SVGRadialGradientElement {
  const g = el('radialGradient', { id, cx: '38%', cy: '32%', r: '70%' });
  for (const [offset, colour] of stops) g.append(el('stop', { offset, 'stop-color': colour }));
  return g;
}

const PITCH = 0.5, SIDE = 27, CX = 50, CY = 50;
/** The cell's eight corners at a turn `yaw`, projected into its 100x100 box: [x, y, depth]. */
function corners(yaw: number): number[][] {
  return CORNERS.map(([x, y, z]) => {
    x *= SIDE; y *= SIDE; z *= SIDE;
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw), z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return [CX + x1, CY - (y * Math.cos(PITCH) - z1 * Math.sin(PITCH)), y * Math.sin(PITCH) + z1 * Math.cos(PITCH)];
  });
}
const spokeOpacity = (p: number[]) => (0.22 + (0.22 * (p[2] + 47)) / 94).toFixed(3);
const edgeOpacity = (z: number) => (0.45 + (0.55 * (z + 47)) / 94).toFixed(3);
const atomR = (p: number[]) => (6.6 * (1 + p[2] / 300)).toFixed(2);
const atomStops = (light: boolean): [number, string][] => light ? [[0, '#9aa0a8'], [0.45, '#4a5058'], [1, '#1c1e22']] : [[0, '#e2e5e9'], [0.45, '#868c94'], [1, '#2c2f34']];
const CORE_STOPS: [number, string][] = [[0, '#fff0c8'], [0.4, '#ff9a40'], [1, '#b8400e']];
const edgeColour = (light: boolean) => (light ? '#4a5058' : '#9097a0');

/** The still cell (the reduced-motion and no-JavaScript one) as SVG markup, for the server render. */
export function stillCellMarkup(light: boolean, id: string): string {
  const P = corners(0.62);
  const stops = (list: [number, string][]) => list.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  let h = `<defs><radialGradient id="${id}a" cx="38%" cy="32%" r="70%">${stops(atomStops(light))}</radialGradient>`
    + `<radialGradient id="${id}c" cx="38%" cy="32%" r="70%">${stops(CORE_STOPS)}</radialGradient></defs>`;
  for (const p of P) h += `<line x1="${CX}" y1="${CY}" x2="${p[0].toFixed(2)}" y2="${p[1].toFixed(2)}" stroke="#d8662a" stroke-opacity="${spokeOpacity(p)}" stroke-width="1.8"/>`;
  for (const [a, b] of EDGES) h += `<line x1="${P[a][0].toFixed(2)}" y1="${P[a][1].toFixed(2)}" x2="${P[b][0].toFixed(2)}" y2="${P[b][1].toFixed(2)}" stroke="${edgeColour(light)}" stroke-opacity="${edgeOpacity((P[a][2] + P[b][2]) / 2)}" stroke-width="4" stroke-linecap="round"/>`;
  const items = P.map(p => ({ p, core: false })).concat([{ p: [CX, CY, 0], core: true }]).sort((m, n) => m.p[2] - n.p[2]);
  for (const { p, core } of items) h += `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${core ? '11.36' : atomR(p)}" fill="url(#${id}${core ? 'c' : 'a'})"${core ? ' class="rl-core"' : ''}/>`;
  return h;
}

function buildCell(svg: SVGSVGElement, light: boolean): (yaw: number, pulse: number) => void {
  const id = `rl${++uid}`;
  const defs = el('defs');
  defs.append(radial(`${id}a`, atomStops(light)), radial(`${id}c`, CORE_STOPS));
  svg.append(defs);
  const spokes = CORNERS.map(() => el('line', { stroke: '#d8662a', 'stroke-width': 1.8 }));
  const edges = EDGES.map(() => el('line', { stroke: edgeColour(light), 'stroke-width': 4, 'stroke-linecap': 'round' }));
  const atoms = CORNERS.map(() => el('circle', { fill: `url(#${id}a)` }));
  const core = el('circle', { fill: `url(#${id}c)`, class: 'rl-core' });
  const layer = el('g');
  svg.append(...spokes, ...edges, layer);
  for (const l of spokes) { l.setAttribute('x1', String(CX)); l.setAttribute('y1', String(CY)); }
  let order: SVGCircleElement[] = [];
  return (yaw, pulse) => {
    const P = corners(yaw);
    P.forEach((p, i) => {
      spokes[i].setAttribute('x2', p[0].toFixed(2)); spokes[i].setAttribute('y2', p[1].toFixed(2));
      spokes[i].setAttribute('stroke-opacity', spokeOpacity(p));
    });
    EDGES.forEach(([a, b], i) => {
      const l = edges[i];
      l.setAttribute('x1', P[a][0].toFixed(2)); l.setAttribute('y1', P[a][1].toFixed(2));
      l.setAttribute('x2', P[b][0].toFixed(2)); l.setAttribute('y2', P[b][1].toFixed(2));
      l.setAttribute('stroke-opacity', edgeOpacity((P[a][2] + P[b][2]) / 2));
    });
    atoms.forEach((atom, i) => {
      atom.setAttribute('cx', P[i][0].toFixed(2)); atom.setAttribute('cy', P[i][1].toFixed(2)); atom.setAttribute('r', atomR(P[i]));
    });
    core.setAttribute('cx', String(CX)); core.setAttribute('cy', String(CY)); core.setAttribute('r', (11 + pulse * 1.2).toFixed(2));
    // atoms and the core drawn far to near; the DOM order changes only when the depth order does
    const next = [...atoms.map((node, i) => ({ node, z: P[i][2] })), { node: core, z: 0 }].sort((m, n) => m.z - n.z).map(o => o.node);
    if (next.some((node, i) => node !== order[i])) { layer.replaceChildren(...next); order = next; }
    svg.style.setProperty('--pulse', pulse.toFixed(3)); // the core's glow (logo.css)
  };
}

// ---------- AFS on a canvas ----------
type Afs = { draw(level: number, burning: boolean): void };

function buildAfs(canvas: HTMLCanvasElement, fs: number, light: boolean): Afs | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const probe = document.createElement('canvas').getContext('2d');
  const ctx = canvas.getContext('2d');
  if (!probe || !ctx) return null;
  probe.font = `700 ${fs}px ${FONT}`;
  const asc = fs * 0.95, desc = fs * 0.22;
  const W = Math.ceil(probe.measureText('AFS').width + fs * 0.04), H = Math.ceil(asc + desc);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  // in the flex row the canvas's bottom edge sits on the baseline: drop it by the descent so the baselines meet
  canvas.style.transform = `translateY(${desc}px)`;
  // the letter shape as a mask
  const shape = document.createElement('canvas');
  shape.width = canvas.width;
  shape.height = canvas.height;
  const sc = shape.getContext('2d', { willReadFrequently: true }); // read back once (getImageData): a CPU canvas, no GPU readback
  if (!sc) return null;
  sc.scale(dpr, dpr);
  sc.font = `700 ${fs}px ${FONT}`;
  sc.textBaseline = 'alphabetic';
  sc.fillStyle = '#fff';
  sc.fillText('AFS', fs * 0.01, asc);
  const w = shape.width, h = shape.height;
  const A = sc.getImageData(0, 0, w, h).data;
  // per pixel: when it rusts (low parts, letter edges and noise first), its rust colour and its steel colour
  const N = w * h, when = new Float32Array(N), rust = new Uint8ClampedArray(N * 3), steel = new Uint8ClampedArray(N * 3);
  const k = 7 / (fs * dpr);
  const reach = Math.max(1, Math.round(fs * 0.023 * dpr)); // 3 px at 132 px type
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (A[i * 4 + 3] < 8) { when[i] = 9; continue; }
    let edge = 0;
    for (const [dx, dy] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || A[(yy * w + xx) * 4 + 3] < 8) edge = 1;
    }
    when[i] = 0.62 * fbm(x * k, y * k) + 0.32 * (1 - y / h) - 0.14 * edge + 0.06 * fbm2(x * k * 6, y * k * 6);
    const p = fbm2(x * k * 2.2, y * k * 2.2), d = fbm(x * k * 9 + 3, y * k * 9);
    rust[i * 3] = 96 + 110 * p + 30 * d; rust[i * 3 + 1] = 34 + 42 * p + 12 * d; rust[i * 3 + 2] = 14 + 14 * p;
    const s = 1 - y / h, sh = (light ? 44 + 70 * s : 128 + 110 * s) + 14 * (fbm2(x * k * 20, y * k * 1.5) - 0.5);
    steel[i * 3] = sh * 0.95; steel[i * 3 + 1] = sh * 0.98; steel[i * 3 + 2] = sh;
  }
  // the level 0..1 maps onto the real spread of rust times, so the rust grows evenly from the first spot to the last
  let wMin = 9, wMax = -9;
  for (let i = 0; i < N; i++) if (when[i] < 9) { wMin = Math.min(wMin, when[i]); wMax = Math.max(wMax, when[i]); }
  const out = ctx.createImageData(w, h), O = out.data;
  return {
    draw(level, burning) {
      const front = wMin + (wMax - wMin) * level;
      for (let i = 0; i < N; i++) {
        const a = A[i * 4 + 3];
        if (a < 8) { O[i * 4 + 3] = 0; continue; }
        const r = front - when[i]; // > 0: rusted
        const f = Math.min(Math.max(r / 0.03, 0), 1);
        let R = steel[i * 3] + (rust[i * 3] - steel[i * 3]) * f;
        let G = steel[i * 3 + 1] + (rust[i * 3 + 1] - steel[i * 3 + 1]) * f;
        let B = steel[i * 3 + 2] + (rust[i * 3 + 2] - steel[i * 3 + 2]) * f;
        if (burning && Math.abs(r) < 0.025) { const g = 1 - Math.abs(r) / 0.025; R += 255 * g; G += 140 * g; B += 40 * g; } // the burning edge glows
        O[i * 4] = R; O[i * 4 + 1] = G; O[i * 4 + 2] = B; O[i * 4 + 3] = a;
      }
      ctx.putImageData(out, 0, 0);
    },
  };
}

/**
 * Turns the server-rendered wordmark in `host` (RustLogo.astro: .rl-steel "Ir", svg.rl-cell, .rl-steel "n",
 * .rl-afs "AFS") into the animated one. Waits for Space Grotesk, since the canvas draws with it; if that font cannot
 * load, the server-rendered wordmark stays. The handle's setTheme re-colours it later (a live theme change): the
 * canvas and the cell are rebuilt in their new palette and the running loop draws them; no second loop starts. The
 * canvas follows the host's type size: when it changes (a breakpoint, the 404 mark's fluid size), AFS is rebuilt at it.
 */
export function mountRustLogo(host: HTMLElement, opts: RustLogoOptions): RustLogoHandle {
  const win = window;
  let light = opts.theme === 'light';
  let recolour: (() => void) | null = null; // set once mounted; before that the mount reads `light` itself
  const handle: RustLogoHandle = {
    setTheme(theme) {
      if ((theme === 'light') === light) return;
      light = theme === 'light';
      recolour?.();
    },
  };
  const cellSvg = host.querySelector<SVGSVGElement>('svg.rl-cell');
  const text = host.querySelector<HTMLElement>('.rl-afs');
  if (!cellSvg || !text) return handle;
  const testHook = new URLSearchParams(win.location.search).has('test'); // the spec hook (data-frames), never otherwise
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const fontSize = () => parseFloat(getComputedStyle(host).fontSize);
  let fs = fontSize();

  document.fonts.load(`700 ${fs}px ${FONT}`).then(() => {
    const canvas = document.createElement('canvas');
    canvas.className = 'rl-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    fs = fontSize();
    let afs: Afs | null = null;
    try { afs = buildAfs(canvas, fs, light); } catch { afs = null; }
    if (!afs) return; // no 2D canvas: the server-rendered wordmark stays
    cellSvg.replaceChildren();
    let drawCell = buildCell(cellSvg, light);
    text.replaceWith(canvas);
    host.dataset.rust = 'mounted';

    const hoverTarget = host.closest('a') ?? host;
    let level = 0, burning = false, raf = 0, last = 0, start = 0, drawnLevel = NaN, drawnBurning = false;
    const still = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      level = 1.03;
      afs!.draw(level, false);
      drawCell(0.62, 0.3);
      host.dataset.rust = 'still';
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      const target = burning ? -0.05 : 1.03;
      const speed = target < level ? BURN_PER_S : RUST_PER_S;
      level += Math.sign(target - level) * Math.min(Math.abs(target - level), speed * dt);
      const glowing = speed === BURN_PER_S;
      if (level !== drawnLevel || glowing !== drawnBurning) { // the canvas only redraws while the rust moves
        afs!.draw(level, glowing);
        drawnLevel = level;
        drawnBurning = glowing;
      }
      drawCell((now - start) / 3200, 0.5 + 0.5 * Math.sin((now - start) / 700));
      if (testHook) host.dataset.frames = String(Number(host.dataset.frames || 0) + 1);
      host.dataset.rust = burning ? 'burning' : level >= 1.03 ? 'rusted' : 'rusting';
    };
    const play = () => {
      if (raf) return;
      last = start = performance.now();
      raf = requestAnimationFrame(tick);
    };
    hoverTarget.addEventListener('pointerenter', () => { if (!motion.matches) burning = true; });
    hoverTarget.addEventListener('pointerleave', () => { burning = false; });
    motion.addEventListener('change', () => { if (motion.matches) still(); else { burning = false; play(); } });
    /** Rebuilds AFS at the host's type size now, in the current palette; the loop (or, still, this) redraws it. */
    const rebuild = () => {
      fs = fontSize();
      let next: Afs | null = null;
      try { next = buildAfs(canvas, fs, light); } catch { next = null; }
      if (next) afs = next;
      drawnLevel = NaN; // the running loop redraws on its next frame
      if (!raf) afs!.draw(level, false); // still: no loop, redraw now
    };
    recolour = () => {
      cellSvg.replaceChildren();
      drawCell = buildCell(cellSvg, light);
      rebuild();
      if (!raf) drawCell(0.62, 0.3);
    };
    // the host's type size can change after mounting (a breakpoint, a fluid size): its box changes with it
    let resizing = 0;
    new ResizeObserver(() => {
      if (resizing) return;
      resizing = requestAnimationFrame(() => {
        resizing = 0;
        if (fontSize() !== fs) rebuild();
      });
    }).observe(host);
    if (motion.matches) still();
    else { afs.draw(0, false); drawCell(0, 0.5); play(); }
  }, () => {
    // the font could not load: the server-rendered wordmark stays, as without a 2D canvas
  });
  return handle;
}
