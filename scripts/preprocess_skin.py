#!/usr/bin/env python3
"""
Adaptive luminance correction for e-ink sleeve skin images.

Per-image: compute average BT.709 luminance, derive a per-image gamma so
that the corrected average lands at TARGET_AVG (≈140). Images already at or
below TARGET_AVG are left unchanged.

Source: ~/avatar-raw-backup/ (originals)
Output: src/assets/skins/avatar/ (overwrites)
"""

import os
import sys
import glob
import math
import numpy as np
from PIL import Image

SRC_DIR  = os.path.expanduser('~/avatar-raw-backup')
DEST_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'skins', 'avatar')
TARGET_AVG = 140.0
JPEG_QUALITY = 90

# Maps source filename sequence numbers to dest card names (derived from
# the mapping established when the skin was built).
# Keys: zero-padded 4-digit index; values: card name stem.
SEQ_TO_CARD = {
    '0004': 'ace_of_spades',   '0005': '2_of_spades',   '0006': '3_of_spades',
    '0007': '4_of_spades',     '0008': '5_of_spades',   '0009': '6_of_spades',
    '0010': '7_of_spades',     '0011': '8_of_spades',   '0012': '9_of_spades',
    '0013': '10_of_spades',    '0014': 'jack_of_spades','0015': 'queen_of_spades',
    '0016': 'king_of_spades',

    '0017': 'ace_of_diamonds', '0018': '2_of_diamonds', '0019': '3_of_diamonds',
    '0020': '4_of_diamonds',   '0021': '5_of_diamonds', '0022': '6_of_diamonds',
    '0023': '7_of_diamonds',   '0024': '8_of_diamonds', '0025': '9_of_diamonds',
    '0026': '10_of_diamonds',  '0027': 'jack_of_diamonds','0028': 'queen_of_diamonds',
    '0029': 'king_of_diamonds',

    '0030': 'ace_of_clubs',    '0031': '2_of_clubs',    '0032': '3_of_clubs',
    '0033': '4_of_clubs',      '0034': '5_of_clubs',    '0035': '6_of_clubs',
    '0036': '7_of_clubs',      '0037': '8_of_clubs',    '0038': '9_of_clubs',
    '0039': '10_of_clubs',     '0040': 'jack_of_clubs', '0041': 'queen_of_clubs',
    '0042': 'king_of_clubs',

    '0043': 'ace_of_hearts',   '0044': '2_of_hearts',   '0045': '3_of_hearts',
    '0046': '4_of_hearts',     '0047': '5_of_hearts',   '0048': '6_of_hearts',
    '0049': '7_of_hearts',     '0050': '8_of_hearts',   '0051': '9_of_hearts',
    '0052': '10_of_hearts',    '0053': 'jack_of_hearts','0054': 'queen_of_hearts',
    '0055': 'king_of_hearts',
}


def avg_lum(arr: np.ndarray) -> float:
    r, g, b = arr[:,:,0].astype(float), arr[:,:,1].astype(float), arr[:,:,2].astype(float)
    return float((0.2126*r + 0.7152*g + 0.0722*b).mean())


def apply_gamma(arr: np.ndarray, gamma: float) -> np.ndarray:
    norm = (arr / 255.0) ** gamma
    return np.clip(norm * 255.0, 0, 255).astype(np.uint8)


def find_gamma(arr: np.ndarray, target: float, tol: float = 0.5) -> float:
    """Binary-search the gamma that actually produces target average luminance."""
    before = avg_lum(arr)
    if before <= target:
        return 1.0
    lo, hi = 1.0, 8.0
    for _ in range(30):  # converges in <10 iters
        mid = (lo + hi) / 2.0
        result = avg_lum(apply_gamma(arr, mid).astype(float))
        if abs(result - target) < tol:
            return mid
        if result > target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def process(src_path: str, dest_path: str) -> tuple[float, float, float]:
    img = Image.open(src_path).convert('RGB')
    arr = np.array(img, dtype=np.float32)
    before = avg_lum(arr)

    gamma = find_gamma(arr, TARGET_AVG)

    arr_out = arr.astype(np.uint8) if gamma == 1.0 else apply_gamma(arr, gamma)
    after = avg_lum(arr_out.astype(np.float32))
    Image.fromarray(arr_out).save(dest_path, 'JPEG', quality=JPEG_QUALITY)
    return before, after, gamma


def main():
    results = []
    missing_src = []

    for seq, card in sorted(SEQ_TO_CARD.items(), key=lambda x: x[1]):
        src = os.path.join(SRC_DIR, f'Avatar The Last Airbender_{seq} copy.jpg')
        dest = os.path.join(DEST_DIR, f'{card}.jpg')
        if not os.path.exists(src):
            missing_src.append(src)
            continue
        before, after, gamma = process(src, dest)
        suit = card.split('_of_')[1]
        results.append((card, suit, before, after, gamma))

    if missing_src:
        print(f'WARNING: {len(missing_src)} source files not found:')
        for p in missing_src: print(f'  {p}')

    print(f'\nProcessed {len(results)} files.\n')

    for suit in ('spades', 'diamonds', 'clubs', 'hearts'):
        rows = [(c, b, a, g) for c, s, b, a, g in results if s == suit]
        print(f'── {suit.upper()} ──')
        for card, before, after, gamma in rows:
            stem = card.replace(f'_of_{suit}', '')
            tag = '' if abs(after - TARGET_AVG) < 10 else '  ← off-target'
            print(f'  {stem:<6}  before={before:6.1f}  after={after:6.1f}  γ={gamma:.3f}{tag}')
        avgs = [a for _, _, _, a, _ in [(c,s,b,a,g) for c,s,b,a,g in results if s == suit]]
        print(f'  avg after = {sum(avgs)/len(avgs):.1f}\n')

    all_after = [a for _, _, _, a, _ in [(c,s,b,a,g) for c,s,b,a,g in results]]
    print(f'Overall after-range: {min(all_after):.1f} – {max(all_after):.1f}')
    in_band = sum(1 for a in all_after if 130 <= a <= 150)
    print(f'In target band 130-150: {in_band}/{len(all_after)}')


if __name__ == '__main__':
    main()
