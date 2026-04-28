"""
Regenerate assets/images/card_back.jpg from the 960x540 landscape greyscale
source.

The source is a 960x540 landscape canvas with the portrait-shaped card-back
design (480x540) centered horizontally, black bars on the left and right.
The design is upright in landscape view — its top is at the source's top
edge, not rotated within the canvas. So we just crop the design region (no
rotation), scale to fit a 540x760 portrait canvas with aspect preserved,
and letterbox top/bottom with black.

The firmware applies its own 90° rotation to every JPEG it decodes, but
that rotation cancels with the panel's physical mounting orientation —
every other image pipeline (D&D spells, Hold'em playing cards, CAH text,
avatar/LOTR skins) preserves source orientation without rotating, and they
render upright on the sleeve. card_back follows the same pattern.

Output: 540x760 portrait, mode L, JPEG quality=90. For a 480x540 design in
a 540x760 canvas the binding axis is width (scale = 540/480 = 1.125), so
the design lands at 540x608 with ~76px black letterbox top and bottom.
"""
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "assets" / "images" / "card_back_source_960x540.jpg"
DST = REPO / "assets" / "images" / "card_back.jpg"

CANVAS_W, CANVAS_H = 540, 760


def main() -> None:
    src = Image.open(SRC).convert("L")
    sw, sh = src.size  # expected 960x540

    # Crop the middle 480x540 portrait-shaped design region, dropping the
    # black side bars. No rotation — source design is already upright.
    content = src.crop((sw // 4, 0, 3 * sw // 4, sh))
    cw, ch = content.size

    # Fit-to-canvas, aspect preserved. Letterbox the leftover axis with black.
    scale = min(CANVAS_W / cw, CANVAS_H / ch)
    new_size = (round(cw * scale), round(ch * scale))
    scaled = content.resize(new_size, Image.LANCZOS)

    canvas = Image.new("L", (CANVAS_W, CANVAS_H), 0)
    offset = ((CANVAS_W - new_size[0]) // 2, (CANVAS_H - new_size[1]) // 2)
    canvas.paste(scaled, offset)

    canvas.save(DST, "JPEG", quality=90)
    print(f"wrote {DST} {canvas.size} {canvas.mode}")


if __name__ == "__main__":
    main()
