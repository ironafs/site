// The #design connectors, a same-origin module.
// Lines are computed from the boxes' real edges and redrawn on resize, when a scene changes size and after the
// fonts load. Every run-time value goes through the CSSOM (el.style.setProperty): no style= attributes (CSP).
//
// Phases come from wire order: the request's route runs through each box's centre and along each
// line, and each box, line, label and dot takes its slice of the OS's third of the --how timeline in proportion to
// the distance travelled. The values become `--r` ("contain a% contain b%"), read by how.css as animation-range.

export type Box = { left: number; top: number; right: number; bottom: number };
export type Side = 't' | 'b' | 'l' | 'r';
type Wire = [from: string, fromSide: Side, to: string, toSide: Side, label: string, kind: '' | 'net'];
type Point = [number, number];

/** How far inside both boxes a straight vertical line must be. */
const INSET = 16;

/**
 * The route of one connector, from `a`'s `aSide` edge to `b`'s `bSide` edge. Pure. A straight segment when the
 * boxes overlap on the shared axis by at least 16 px inside both (12 px for a horizontal link, 8 px when `narrow`:
 * the single-column layout's boxes are short), else an orthogonal elbow through the midpoint between them.
 */
export function routeConnector(a: Box, aSide: Side, b: Box, bSide: Side, narrow: boolean): Point[] {
  const acx = (a.left + a.right) / 2, acy = (a.top + a.bottom) / 2;
  const bcx = (b.left + b.right) / 2, bcy = (b.top + b.bottom) / 2;
  if (aSide === 't' || aSide === 'b') {
    const y1 = aSide === 'b' ? a.bottom : a.top;
    const y2 = bSide === 't' ? b.top : b.bottom;
    const lo = Math.max(a.left, b.left) + INSET, hi = Math.min(a.right, b.right) - INSET;
    if (lo <= hi) {
      // centred on the box being entered when the line goes up, on the box being left when it goes down
      const x = Math.min(Math.max(aSide === 't' ? bcx : acx, lo), hi);
      return [[x, y1], [x, y2]];
    }
    const my = (y1 + y2) / 2;
    return [[acx, y1], [acx, my], [bcx, my], [bcx, y2]];
  }
  const x1 = aSide === 'r' ? a.right : a.left;
  const x2 = bSide === 'l' ? b.left : b.right;
  const inset = narrow ? 8 : 12;
  const lo = Math.max(a.top, b.top) + inset, hi = Math.min(a.bottom, b.bottom) - inset;
  if (lo <= hi) {
    const y = (lo + hi) / 2;
    return [[x1, y], [x2, y]];
  }
  const mx = (x1 + x2) / 2;
  return [[x1, acy], [mx, acy], [mx, bcy], [x2, bcy]];
}

const NS = 'http://www.w3.org/2000/svg';
const DRAWN = '.wires, .wl, .request-dot';
const animationNames = new WeakMap<HTMLElement, string[]>();

// Insert rules into an existing same-origin sheet: CSP permits CSSOM changes, without an inline style element.
function sheet(): CSSStyleSheet | undefined {
  return [...document.styleSheets].find(s => {
    try { return !!s.cssRules; } catch { return false; }
  });
}

/** Removes what drawConnectors drew (the base layer has no lines). */
export function clearConnectors(scene: HTMLElement): void {
  const css = sheet();
  const names = animationNames.get(scene) ?? [];
  if (css) for (let i = css.cssRules.length - 1; i >= 0; i--) {
    const rule = css.cssRules[i];
    if (rule instanceof CSSKeyframesRule && names.includes(rule.name)) css.deleteRule(i);
  }
  animationNames.delete(scene);
  scene.querySelectorAll(DRAWN).forEach(el => el.remove());
  delete scene.dataset.drawn;
}

const watched = new WeakSet<HTMLElement>();

/**
 * Draws `scene`'s connectors from its `data-wires`: an SVG with arrowheads, one label on each line and one
 * request dot per line, and sets every phase as `--r`. Redraws on resize, on the scene's own size changes and
 * after the fonts load, for as long as it stays drawn (clearConnectors stops that).
 */
export function drawConnectors(scene: HTMLElement): void {
  draw(scene);
  if (watched.has(scene)) return;
  watched.add(scene);
  const again = () => { if (scene.dataset.drawn) draw(scene); };
  let queued = false;
  const soon = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; again(); });
  };
  addEventListener('resize', again);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(soon).observe(scene);
  document.fonts?.ready.then(again);
}

function draw(scene: HTMLElement): void {
  clearConnectors(scene);
  const measured = scene.getBoundingClientRect();
  if (!measured.width) return;
  // Boxes are measured in viewport pixels, but the lines, labels and dots are drawn in the scene's own CSS pixels:
  // under CSS zoom (on the page or an ancestor) those differ by the zoom factor, so every measure is divided by it.
  const zoom = (scene as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? (measured.width / (scene.offsetWidth || measured.width));
  const frame = { left: measured.left, top: measured.top, width: measured.width / zoom, height: measured.height / zoom };
  const wires = JSON.parse(scene.dataset.wires ?? '[]') as Wire[];
  const index = Number(scene.dataset.index ?? 0);
  const narrow = matchMedia('(max-width: 1250px)').matches;
  const os = scene.dataset.os ?? String(index);
  const rel = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { left: (r.left - frame.left) / zoom, top: (r.top - frame.top) / zoom, right: (r.right - frame.left) / zoom, bottom: (r.bottom - frame.top) / zoom };
  };
  const node = (id: string): HTMLElement => {
    const el = scene.ownerDocument.getElementById(id);
    if (!el) throw new Error(`#design: no box ${id}`);
    return el;
  };

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'wires');
  svg.setAttribute('width', String(frame.width));
  svg.setAttribute('height', String(frame.height));
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(NS, 'defs');
  for (const kind of ['request', 'net']) {
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', `arrow-${os}-${kind}`);
    for (const [k, v] of Object.entries({ viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto', markerUnits: 'userSpaceOnUse' })) marker.setAttribute(k, v);
    const head = document.createElementNS(NS, 'polygon');
    head.setAttribute('points', '0,0 10,5 0,10');
    head.setAttribute('class', `head ${kind}`);
    marker.appendChild(head);
    defs.appendChild(marker);
  }
  svg.appendChild(defs);

  // The request's route: through each box's centre, along each line. Distances along it place the phases.
  const route: Point[] = [];
  const visits: { el: HTMLElement; at: number }[] = [];
  const links: { path: SVGPathElement; label: HTMLElement; dot: HTMLElement; start: number; end: number }[] = [];
  const names: string[] = [];
  let distance = 0;
  const add = (p: Point) => {
    const last = route[route.length - 1];
    if (last) distance += Math.hypot(p[0] - last[0], p[1] - last[1]);
    route.push(p);
  };
  const visit = (el: HTMLElement) => {
    const b = rel(el);
    add([(b.left + b.right) / 2, (b.top + b.bottom) / 2]);
    visits.push({ el, at: distance });
  };

  wires.forEach(([from, fromSide, to, toSide, text, kind], j) => {
    const a = node(from), b = node(to);
    const pts = routeConnector(rel(a), fromSide, rel(b), toSide, narrow);
    if (j === 0 || visits[visits.length - 1]?.el !== a) visit(a);
    add(pts[0]);
    const start = distance;
    pts.slice(1).forEach(add);
    const end = distance;
    visit(b);

    const d = 'M' + pts.map(p => `${round(p[0])} ${round(p[1])}`).join(' L');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('pathLength', '1');
    path.setAttribute('class', kind ? `connector ${kind}` : 'connector');
    path.setAttribute('marker-end', `url(#arrow-${os}-${kind || 'request'})`);
    path.dataset.wire = String(j);
    const step = j === 0 ? 1 : j === 1 ? 2 : j === wires.length - 1 ? 4 : 3;
    path.dataset.step = String(step);
    svg.appendChild(path);

    // The label sits on the longest segment's midpoint; a horizontal line's label sits above it, wrapped within the gap.
    let best = 0, mx = 0, my = 0;
    for (let k = 1; k < pts.length; k++) {
      const len = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      if (len > best) { best = len; mx = (pts[k][0] + pts[k - 1][0]) / 2; my = (pts[k][1] + pts[k - 1][1]) / 2; }
    }
    const label = document.createElement('span');
    const horizontal = pts[0][1] === pts[pts.length - 1][1];
    label.className = ['wl', kind, horizontal && 'hz'].filter(Boolean).join(' ');
    label.textContent = text;
    label.dataset.wire = String(j);
    label.dataset.step = String(step);
    label.setAttribute('aria-hidden', 'true');
    label.style.setProperty('left', `${round(mx)}px`);
    label.style.setProperty('top', `${round(my)}px`);
    if (horizontal) label.style.setProperty('max-width', `${round(Math.max(56, best - 10))}px`);

    // One dot per line: it travels only along that line and fades as it reaches a box, so it never crosses one.
    const dot = document.createElement('span');
    dot.className = kind ? `request-dot ${kind}` : 'request-dot';
    dot.dataset.wire = String(j);
    dot.setAttribute('aria-hidden', 'true');
    // Transform keyframes follow the very same points as the SVG, at constant speed along its segments.
    const lengths = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]));
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    let travelled = 0;
    const frames = pts.map((p, k) => {
      if (k) travelled += lengths[k - 1];
      return `${(travelled / total * 100).toFixed(4)}% { transform: translate(${round(p[0])}px, ${round(p[1])}px); }`;
    });
    const name = `ember-${os}-${j}`;
    const css = sheet();
    if (css) {
      css.insertRule(`@keyframes ${name} { ${frames.join(' ')} }`, css.cssRules.length);
      names.push(name);
      dot.style.setProperty('animation-name', `${name}, emberVisibility`);
    }
    // The four quarters are the same steps used by the text and box emphasis.
    const fromStep = step - 1;
    const startAt = (index + (fromStep + 0.06) / 4) * 100 / 3;
    const endAt = (index + (fromStep + 0.94) / 4) * 100 / 3;
    dot.style.setProperty('--ember-range', `contain ${startAt.toFixed(3)}% contain ${endAt.toFixed(3)}%`);
    links.push({ path, label, dot, start, end });
  });
  animationNames.set(scene, names);

  const base = (index * 100) / 3, span = 100 / 3;
  const position = (at: number) => base + span * (0.12 + (0.63 * at) / Math.max(1, distance));
  const range = (el: Element, from: number, to: number) =>
    (el as HTMLElement | SVGElement).style.setProperty('--r', `contain ${from.toFixed(3)}% contain ${to.toFixed(3)}%`);

  for (const { el, at } of visits) range(el, position(at), position(at) + span * 0.025);
  // Linux's FUSE layer sits inside ironafsd: entering it also enters the process, which lights just before.
  const container = scene.querySelector('.g-daemon.wide');
  if (container) {
    const inner = visits.find(v => container.contains(v.el) && v.el !== container);
    if (inner) range(container, position(inner.at) - span * 0.04, position(inner.at));
  }
  for (const { path, label, dot, start, end } of links) {
    range(path, position(start), position(end));
    range(label, position(start), position(end));
    range(dot, position(start), position(end));
    scene.append(label, dot);
  }
  scene.prepend(svg);
  scene.dataset.drawn = '1';
}

const round = (v: number) => Math.round(v * 10) / 10;
