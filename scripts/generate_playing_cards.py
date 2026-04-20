#!/usr/bin/env python3
"""
Generate 52 standard playing card JPEGs for e-ink sleeves.

Output : assets/images/playing_cards/card_{rank}{suit}.jpg
Ranks  : A 2 3 4 5 6 7 8 9 T J Q K   (T = Ten)
Suits  : S H D C

SPDX-License-Identifier: CC0-1.0
These images are original programmatic works. No existing card art was
incorporated or derived. The output files are released to the public domain
under the Creative Commons Zero v1.0 Universal (CC0-1.0) dedication.

Requires: Pillow  (pip install Pillow)
System fonts (macOS): /System/Library/Fonts/Helvetica.ttc
                      /System/Library/Fonts/Symbol.ttf

Design notes:
  - All suits rendered black for 4-bit grayscale e-ink panels (no color).
    Hearts/diamonds are distinguishable from spades/clubs by shape alone,
    matching Piatnik-style tournament card convention.
  - Inverted (bottom-half) pips rotated with BICUBIC resampling to preserve
    anti-aliased edges, matching visual weight of upright pips.
"""

from PIL import Image, ImageDraw, ImageFont
import os

# ── dimensions ────────────────────────────────────────────────────────
W, H   = 600, 840
MARGIN = 28

RANK_FONT = '/System/Library/Fonts/Helvetica.ttc'
SUIT_FONT = '/System/Library/Fonts/Symbol.ttf'

SUIT_CHAR  = {'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣'}
SUIT_COLOR = {'S': (0, 0, 0), 'H': (0, 0, 0), 'D': (0, 0, 0), 'C': (0, 0, 0)}
RANK_DISPLAY = {'T': '10'}   # show "10" in corners; filename rank stays "T"

RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K']
SUITS = ['S', 'H', 'D', 'C']

# ── pip layout tables ─────────────────────────────────────────────────
# (fraction-x, fraction-y, inverted?) within the pip area
PIP_LAYOUTS: dict[str, list[tuple[float, float, bool]]] = {
    '2': [(0.5, 0.18, False), (0.5, 0.82, True)],
    '3': [(0.5, 0.18, False), (0.5, 0.50, False), (0.5, 0.82, True)],
    '4': [(0.25, 0.18, False), (0.75, 0.18, False),
          (0.25, 0.82, True),  (0.75, 0.82, True)],
    '5': [(0.25, 0.18, False), (0.75, 0.18, False), (0.5, 0.50, False),
          (0.25, 0.82, True),  (0.75, 0.82, True)],
    '6': [(0.25, 0.18, False), (0.75, 0.18, False),
          (0.25, 0.50, False), (0.75, 0.50, False),
          (0.25, 0.82, True),  (0.75, 0.82, True)],
    '7': [(0.25, 0.18, False), (0.75, 0.18, False), (0.50, 0.33, False),
          (0.25, 0.50, False), (0.75, 0.50, False),
          (0.25, 0.82, True),  (0.75, 0.82, True)],
    '8': [(0.25, 0.18, False), (0.75, 0.18, False), (0.50, 0.33, False),
          (0.25, 0.50, False), (0.75, 0.50, False), (0.50, 0.67, True),
          (0.25, 0.82, True),  (0.75, 0.82, True)],
    '9': [(0.25, 0.14, False), (0.75, 0.14, False),
          (0.25, 0.37, False), (0.75, 0.37, False), (0.50, 0.50, False),
          (0.25, 0.63, True),  (0.75, 0.63, True),
          (0.25, 0.86, True),  (0.75, 0.86, True)],
    'T': [(0.25, 0.14, False), (0.75, 0.14, False), (0.50, 0.26, False),
          (0.25, 0.38, False), (0.75, 0.38, False),
          (0.25, 0.62, True),  (0.75, 0.62, True),  (0.50, 0.74, True),
          (0.25, 0.86, True),  (0.75, 0.86, True)],
}

# ── font helpers ──────────────────────────────────────────────────────

def rank_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(RANK_FONT, size, index=0)

def suit_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(SUIT_FONT, size)

def text_dims(font: ImageFont.FreeTypeFont, text: str) -> tuple[int, int, int, int]:
    bb = font.getbbox(text)
    return bb[2] - bb[0], bb[3] - bb[1], bb[0], bb[1]  # w, h, ox, oy

# ── drawing primitives ────────────────────────────────────────────────

def draw_corner_block(img: Image.Image, rank: str, suit_char: str,
                      color: tuple[int, int, int], cx: int, cy: int,
                      flip: bool = False) -> None:
    display_rank = RANK_DISPLAY.get(rank, rank)
    rf = rank_font(72)
    sf = suit_font(56)
    rw, rh, rox, roy = text_dims(rf, display_rank)
    sw, sh, sox, soy = text_dims(sf, suit_char)
    gap = 4
    bw = max(rw, sw) + 16
    bh = rh + sh + gap + 16

    tmp = Image.new('RGBA', (bw, bh), (255, 255, 255, 0))
    td  = ImageDraw.Draw(tmp)
    td.text((bw // 2 - rw // 2 - rox, 8 - roy),            display_rank, font=rf, fill=color + (255,))
    td.text((bw // 2 - sw // 2 - sox, 8 + rh + gap - soy), suit_char,    font=sf, fill=color + (255,))
    if flip:
        tmp = tmp.rotate(180, resample=Image.Resampling.BICUBIC)
    img.paste(tmp, (cx - bw // 2, cy - bh // 2), tmp)


def draw_pip(img: Image.Image, cx: float, cy: float, size: int,
             suit_char: str, color: tuple[int, int, int],
             inverted: bool = False) -> None:
    font = suit_font(size)
    w, h, ox, oy = text_dims(font, suit_char)
    if inverted:
        # BICUBIC resampling preserves anti-aliased edges through the 180° rotation,
        # matching the visual weight of upright pips (nearest-neighbour drops them).
        tmp = Image.new('RGBA', (w + 4, h + 4), (255, 255, 255, 0))
        ImageDraw.Draw(tmp).text((2 - ox, 2 - oy), suit_char, font=font, fill=color + (255,))
        tmp = tmp.rotate(180, resample=Image.Resampling.BICUBIC)
        img.paste(tmp, (int(cx - w / 2 - 2), int(cy - h / 2 - 2)), tmp)
    else:
        ImageDraw.Draw(img).text((cx - w / 2 - ox, cy - h / 2 - oy), suit_char, font=font, fill=color)


# ── card generator ────────────────────────────────────────────────────

def generate_card(rank: str, suit: str) -> Image.Image:
    img   = Image.new('RGB', (W, H), 'white')
    draw  = ImageDraw.Draw(img)
    char  = SUIT_CHAR[suit]
    color = SUIT_COLOR[suit]

    draw.rounded_rectangle([3, 3, W - 4, H - 4], radius=28, outline='black', width=4)

    draw_corner_block(img, rank, char, color, MARGIN + 44, MARGIN + 56,  flip=False)
    draw_corner_block(img, rank, char, color, W - MARGIN - 44, H - MARGIN - 56, flip=True)

    # pip area
    px0, py0 = 130, 200
    px1, py1 = W - 130, H - 200
    pw, ph   = px1 - px0, py1 - py0

    if rank == 'A':
        draw_pip(img, W / 2, H / 2, 200, char, color)

    elif rank in PIP_LAYOUTS:
        for fx, fy, inv in PIP_LAYOUTS[rank]:
            draw_pip(img, px0 + pw * fx, py0 + ph * fy, 68, char, color, inverted=inv)

    else:  # J, Q, K
        rf  = rank_font(210)
        sf  = suit_font(100)
        rw, rh, rox, roy = text_dims(rf, rank)
        sw, sh, sox, soy = text_dims(sf, char)
        total_h = rh + 20 + sh
        draw.text((W // 2 - rw // 2 - rox, H // 2 - total_h // 2 - roy), rank, font=rf, fill=color)
        suit_y = H // 2 - total_h // 2 + rh + 20
        draw.text((W // 2 - sw // 2 - sox, suit_y - soy), char, font=sf, fill=color)

    return img


# ── main ──────────────────────────────────────────────────────────────

def main() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir    = os.path.normpath(os.path.join(script_dir, '..', 'assets', 'images', 'playing_cards'))
    os.makedirs(out_dir, exist_ok=True)

    total = len(RANKS) * len(SUITS)
    done  = 0
    for suit in SUITS:
        for rank in RANKS:
            img  = generate_card(rank, suit)
            path = os.path.join(out_dir, f'card_{rank}{suit}.jpg')
            img.save(path, 'JPEG', quality=92)
            done += 1
            print(f'[{done:2d}/{total}] {os.path.basename(path)}')

    print(f'\nDone — {done} cards written to {out_dir}')


if __name__ == '__main__':
    main()
