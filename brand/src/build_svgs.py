"""Build the IronAFS logo SVGs from the Space Grotesk Bold outlines and the iron cell geometry.

Writes into ../svg:
  ironafs-logo-on-dark.svg   wordmark for dark backgrounds (steel letters)
  ironafs-logo-on-light.svg  wordmark for light backgrounds (gunmetal letters)
  ironafs-mark.svg           the iron cell alone, detailed (64 px and up)
  ironafs-mark-on-light.svg  the same, darker edges for light backgrounds
  ironafs-mark-small.svg     simplified cell for 16-48 px (thicker edges, no diagonals)
  favicon.svg                the small cell; edges follow the browser's light/dark scheme

The letters are real glyph outlines, so no font is needed to display the files.
Run with a Python that has fontTools: python build_svgs.py
"""
import math
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).parent
OUT = HERE.parent / "svg"
FONT = TTFont(HERE / "fonts" / "SpaceGrotesk-Bold.woff")
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()
UPM = FONT["head"].unitsPerEm  # 1000

EM = 1000.0          # we lay out in font units: 1 em = 1000
TRACK = -0.01 * EM   # the wordmark's letter-spacing (-.01em)
CELL = 0.78 * EM     # the cell is .78em square
CELL_MARGIN = 0.015 * EM
CELL_DROP = 0.115 * EM  # the cell's box bottom sits this far below the baseline
CAP = 700

YAW, PITCH = 0.33, 0.30  # the fixed angle for static files: reads as a cube (aspect .95) and no corner atom touches the core (searched)


def glyph_path(ch, x, baseline):
    """SVG path for one character, placed with its origin at (x, baseline), y pointing down."""
    pen = SVGPathPen(GLYPHS)
    GLYPHS[CMAP[ord(ch)]].draw(TransformPen(pen, (1, 0, 0, -1, x, baseline)))
    return pen.getCommands(), FONT["hmtx"][CMAP[ord(ch)]][0]


def project(yaw=YAW, pitch=PITCH, half=27.0, cx=50.0, cy=50.0):
    """The 8 corners of the cube, projected (orthographic) into a 100x100 box: (x, y, depth)."""
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                x, y, z = sx * half, sy * half, sz * half
                x1 = x * math.cos(yaw) + z * math.sin(yaw)
                z1 = -x * math.sin(yaw) + z * math.cos(yaw)
                y2 = y * math.cos(pitch) - z1 * math.sin(pitch)
                z2 = y * math.sin(pitch) + z1 * math.cos(pitch)
                pts.append((sx, sy, sz, cx + x1, cy - y2, z2))
    return pts


def cell_svg(ids, edge, small=False):
    """The iron cell's SVG body in a 100x100 box. ids: prefix for gradient ids. edge: edge colour.
    small: the favicon form, larger in its box, thicker edges, no diagonals."""
    pts = project(half=31.0 if small else 27.0)
    out = []
    if not small:  # body diagonals: thin rust lines from the core to each corner
        for p in pts:
            op = 0.22 + 0.22 * (p[5] + 47) / 94
            out.append(f'<line x1="50" y1="50" x2="{p[3]:.2f}" y2="{p[4]:.2f}" stroke="#d8662a" stroke-opacity="{op:.2f}" stroke-width="1.8"/>')
    for i in range(8):
        for j in range(i + 1, 8):
            if sum(a != b for a, b in zip(pts[i][:3], pts[j][:3])) != 1:
                continue
            z = (pts[i][5] + pts[j][5]) / 2
            op = 1.0 if small else 0.45 + 0.55 * (z + 47) / 94
            w = 7 if small else 4
            out.append(f'<line x1="{pts[i][3]:.2f}" y1="{pts[i][4]:.2f}" x2="{pts[j][3]:.2f}" y2="{pts[j][4]:.2f}" stroke="{edge}" stroke-opacity="{op:.2f}" stroke-width="{w}" stroke-linecap="round"/>')
    atoms = [(p[5], p[3], p[4], (9.0 if small else 6.6 * (1 + p[5] / 300)), f"url(#{ids}fe)") for p in pts]
    atoms.append((0.0, 50.0, 50.0, 17.0 if small else 11.5, f"url(#{ids}core)"))
    atoms.sort(key=lambda a: a[0])
    for z, x, y, r, fill in atoms:
        glow = f' filter="url(#{ids}glow)"' if fill.endswith("core)") else ""
        out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r:.2f}" fill="{fill}"{glow}/>')
    return "\n    ".join(out)


def cell_defs(ids, light=False):
    fe = ("#9aa0a8", "#4a5058", "#1c1e22") if light else ("#e2e5e9", "#868c94", "#2c2f34")
    return f"""
    <radialGradient id="{ids}fe" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="{fe[0]}"/><stop offset=".45" stop-color="{fe[1]}"/><stop offset="1" stop-color="{fe[2]}"/></radialGradient>
    <radialGradient id="{ids}core" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff0c8"/><stop offset=".4" stop-color="#ff9a40"/><stop offset="1" stop-color="#b8400e"/></radialGradient>
    <filter id="{ids}glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feFlood flood-color="#ff7a20" flood-opacity=".85"/><feComposite operator="in" in2="SourceAlpha"/><feGaussianBlur stdDeviation="4" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>"""


def wordmark(light):
    baseline = 0.0
    x = 0.0
    paths_steel, paths_rust = [], []
    for ch in "Ir":
        d, adv = glyph_path(ch, x, baseline)
        paths_steel.append(d)
        x += adv + TRACK
    cell_x = x + CELL_MARGIN
    x = cell_x + CELL + CELL_MARGIN + TRACK
    d, adv = glyph_path("n", x, baseline)
    paths_steel.append(d)
    x += adv + TRACK
    afs_x0 = x
    for ch in "AFS":
        d, adv = glyph_path(ch, x, baseline)
        paths_rust.append(d)
        x += adv + TRACK
    width = x - TRACK
    pad = 0.06 * EM
    top, bottom = -CAP - pad, CELL_DROP + pad
    vb = f"{-pad:.0f} {top:.0f} {width + 2 * pad:.0f} {bottom - top:.0f}"
    cell_y = baseline + CELL_DROP - CELL
    s = CELL / 100.0
    steel = (["#2b2f35", "#6d737c", "#3a3f46", "#50565e", "#24272c"] if light
             else ["#8f959d", "#e6e9ed", "#9aa0a8", "#b9bec5", "#7f858d"])
    edge = "#4a5058" if light else "#9097a0"
    title = "IronAFS"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}">
  <title>{title}</title>
  <defs>
    <linearGradient id="steel" gradientUnits="userSpaceOnUse" x1="0" y1="{-CAP}" x2="{afs_x0:.0f}" y2="0">
      <stop offset="0" stop-color="{steel[0]}"/><stop offset=".3" stop-color="{steel[1]}"/><stop offset=".5" stop-color="{steel[2]}"/><stop offset=".78" stop-color="{steel[3]}"/><stop offset="1" stop-color="{steel[4]}"/>
    </linearGradient>
    <linearGradient id="rust" gradientUnits="userSpaceOnUse" x1="0" y1="{-CAP}" x2="0" y2="0">
      <stop offset="0" stop-color="#c8571f"/><stop offset=".55" stop-color="#a8431a"/><stop offset="1" stop-color="#7c2c0f"/>
    </linearGradient>
    <!-- rust texture: dark pits and bright flecks from noise, kept inside the letters -->
    <filter id="rusty" x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".007 .011" numOctaves="4" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .36  0 0 0 0 .12  0 0 0 0 .04  0 0 0 -2.6 1.45" result="pits"/>
      <feComposite in="pits" in2="SourceGraphic" operator="in" result="pitsIn"/>
      <feTurbulence type="fractalNoise" baseFrequency=".016" numOctaves="3" seed="19" result="n2"/>
      <feColorMatrix in="n2" type="matrix" values="0 0 0 0 .9  0 0 0 0 .45  0 0 0 0 .16  0 0 0 -3 1.6" result="flecks"/>
      <feComposite in="flecks" in2="SourceGraphic" operator="in" result="flecksIn"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="pitsIn"/><feMergeNode in="flecksIn"/></feMerge>
    </filter>{cell_defs("c", light)}
  </defs>
  <path fill="url(#steel)" d="{' '.join(paths_steel)}"/>
  <g transform="translate({cell_x:.1f} {cell_y:.1f}) scale({s:.4f})">
    {cell_svg("c", edge)}
  </g>
  <path fill="url(#rust)" filter="url(#rusty)" d="{' '.join(paths_rust)}"/>
</svg>
"""
    return svg


def mark(light=False, small=False, scheme=False):
    edge = "#4a5058" if light else "#9097a0"
    if scheme:  # favicon: mid-grey edges by default, darker on light browser chrome, lighter on dark
        body = cell_svg("c", "var(--edge)", small=True)
        style = "<style>:root{--edge:#6d737c}@media (prefers-color-scheme: dark){:root{--edge:#a3a9b1}}</style>"
        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  {style}
  <defs>{cell_defs("c")}
  </defs>
  {body}
</svg>
"""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="IronAFS">
  <title>IronAFS</title>
  <defs>{cell_defs("c", light)}
  </defs>
  {cell_svg("c", edge, small=small)}
</svg>
"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        "ironafs-logo-on-dark.svg": wordmark(light=False),
        "ironafs-logo-on-light.svg": wordmark(light=True),
        "ironafs-mark.svg": mark(),
        "ironafs-mark-on-light.svg": mark(light=True),
        "ironafs-mark-small.svg": mark(small=True),
        "favicon.svg": mark(small=True, scheme=True),
    }
    for name, text in files.items():
        (OUT / name).write_text(text)
        print(f"{name}: {len(text.encode())} bytes")


if __name__ == "__main__":
    main()
