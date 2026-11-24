"""Build the 3D glyph file: Space Grotesk Bold outlines for I r o n A F S (the hero) and R u s t (the Rust word),
in three.js typeface format.

Writes ../../src/assets/hero/letters.typeface.json, which the hero loads with FontLoader + TextGeometry
(three 0.187 no longer ships an opentype parser for TTFLoader, and the file keeps only the glyphs
the two words need). Coordinates follow the convention of three's former TTFLoader: font units times 100000 / (unitsPerEm * 72), with "resolution" 1000, rounded to whole units. A glyph is
therefore 1.389 em-fractions tall at TextGeometry size 1, which the word's size and letter spacing are tuned to.
Run with a Python that has fontTools: brand/.venv/bin/python brand/src/glyphs.py
"""
import json
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

HERE = Path(__file__).parent
OUT = HERE.parent.parent / "src" / "assets" / "hero" / "letters.typeface.json"
FONT = TTFont(HERE / "fonts" / "SpaceGrotesk-Bold.woff")
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()
UPM = FONT["head"].unitsPerEm
SCALE = 100000 / (UPM * 72)  # TTFLoader's scale
RESOLUTION = 1000
WORD_GLYPHS = "IronAFSRust"  # the hero's word, then the 3D Rust word's (src/scripts/rustword)


class TypefacePen(BasePen):
    """Records an outline as the typeface format's command string: m x y, l x y, q x y cx cy, b x y c1x c1y c2x c2y."""

    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.cmds = []

    @staticmethod
    def _n(*pts):
        return " ".join(str(round(v * SCALE)) for p in pts for v in p)

    def _moveTo(self, p):
        self.cmds.append("m " + self._n(p))

    def _lineTo(self, p):
        self.cmds.append("l " + self._n(p))

    def _curveToOne(self, c1, c2, p):
        self.cmds.append("b " + self._n(p, c1, c2))

    def _qCurveToOne(self, c, p):
        self.cmds.append("q " + self._n(p, c))

    def _closePath(self):
        pass


def glyph(char):
    name = CMAP[ord(char)]
    pen = TypefacePen(GLYPHS)
    GLYPHS[name].draw(pen)
    xs = [int(t) for cmd in pen.cmds for t in cmd.split()[1::2] if t.lstrip("-").isdigit()]
    return {"ha": round(GLYPHS[name].width * SCALE), "x_min": min(xs), "x_max": max(xs), "o": " ".join(pen.cmds)}


def main():
    data = {
        "glyphs": {c: glyph(c) for c in WORD_GLYPHS},
        "familyName": "Space Grotesk",
        "ascender": round(FONT["hhea"].ascent * SCALE),
        "descender": round(FONT["hhea"].descent * SCALE),
        "underlinePosition": round(FONT["post"].underlinePosition * SCALE),
        "underlineThickness": round(FONT["post"].underlineThickness * SCALE),
        "boundingBox": {k: round(FONT["head"].__dict__[k] * SCALE) for k in ("yMin", "xMin", "yMax", "xMax")},
        "resolution": RESOLUTION,
        "original_font_information": {"fullName": "Space Grotesk Bold", "license": "SIL Open Font License 1.1"},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
