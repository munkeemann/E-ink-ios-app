"""
Regenerate assets/images/card_back.jpg from the 960x540 landscape greyscale
source.

The firmware (sleeve_firmware.ino, my_jpg_writer) applies its own 90° rotation
to every image it renders. The card_back preprocess step must rotate 90° CCW
so the firmware's rotation lands the design upright on the sleeve.

Output: 540x760 portrait, mode L, JPEG quality=90, design centered on a black
background with the long side scaled to 700px.
"""
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "assets" / "images" / "card_back_source_960x540.jpg"
DST = REPO / "assets" / "images" / "card_back.jpg"

CANVAS_W, CANVAS_H = 540, 760
LONGEST = 700


def main() -> None:
    src = Image.open(SRC).convert("L")
    rotated = src.rotate(-90, expand=True)  # PIL positive = CCW, negative = CW

    w, h = rotated.size
    scale = LONGEST / max(w, h)
    new_size = (round(w * scale), round(h * scale))
    scaled = rotated.resize(new_size, Image.LANCZOS)

    canvas = Image.new("L", (CANVAS_W, CANVAS_H), 0)
    offset = ((CANVAS_W - new_size[0]) // 2, (CANVAS_H - new_size[1]) // 2)
    canvas.paste(scaled, offset)

    canvas.save(DST, "JPEG", quality=90)
    print(f"wrote {DST} {canvas.size} {canvas.mode}")


if __name__ == "__main__":
    main()
