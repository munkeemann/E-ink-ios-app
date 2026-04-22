#!/usr/bin/env python3
"""
Adaptive luminance correction for e-ink sleeve skin images.

Per-image: compute average BT.709 luminance, derive a per-image gamma so
that the corrected average lands at TARGET_AVG (≈140). Images already at or
below TARGET_AVG are left unchanged.

Usage:
    python3 scripts/preprocess_skin.py <skin_name>

Reads config from scripts/skins/<skin_name>.py which must define:
    SRC_DIR       — raw source directory
    DEST_SUBDIR   — subdir under src/assets/skins/ for output
    SRC_TEMPLATE  — filename template with '{seq}' placeholder
    SEQ_TO_CARD   — dict mapping '0001'-style seq keys → card name or None
                    (None means front-matter; skipped)

Algorithm, constants, and output format are preserved verbatim from the
pre-SAM1-58 hardcoded Avatar-only version, so rerunning with 'avatar'
produces byte-identical output to the checked-in src/assets/skins/avatar/.
"""

import importlib.util
import os
import sys
import numpy as np
from PIL import Image

TARGET_AVG = 140.0
JPEG_QUALITY = 90


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


def load_config(skin_name: str):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(script_dir, 'skins', f'{skin_name}.py')
    if not os.path.exists(config_path):
        raise FileNotFoundError(f'no skin config at {config_path}')
    spec = importlib.util.spec_from_file_location(f'skins.{skin_name}', config_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for attr in ('SRC_DIR', 'DEST_SUBDIR', 'SRC_TEMPLATE', 'SEQ_TO_CARD'):
        if not hasattr(mod, attr):
            raise AttributeError(f'skin config {skin_name} missing required attribute {attr}')
    return mod


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    skin_name = sys.argv[1]
    cfg = load_config(skin_name)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    dest_dir = os.path.join(script_dir, '..', 'src', 'assets', 'skins', cfg.DEST_SUBDIR)
    os.makedirs(dest_dir, exist_ok=True)

    results = []
    missing_src = []

    # Only entries with a non-None card name; sort by card name for stable stdout
    # (matches pre-refactor iteration order: sorted(SEQ_TO_CARD.items(), key=lambda x: x[1]))
    entries = [(seq, card) for seq, card in cfg.SEQ_TO_CARD.items() if card is not None]
    for seq, card in sorted(entries, key=lambda x: x[1]):
        src = os.path.join(cfg.SRC_DIR, cfg.SRC_TEMPLATE.format(seq=seq))
        dest = os.path.join(dest_dir, f'{card}.jpg')
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
        if not rows:
            continue
        print(f'── {suit.upper()} ──')
        for card, before, after, gamma in rows:
            stem = card.replace(f'_of_{suit}', '')
            tag = '' if abs(after - TARGET_AVG) < 10 else '  ← off-target'
            print(f'  {stem:<6}  before={before:6.1f}  after={after:6.1f}  γ={gamma:.3f}{tag}')
        avgs = [a for _, _, _, a, _ in [(c,s,b,a,g) for c,s,b,a,g in results if s == suit]]
        print(f'  avg after = {sum(avgs)/len(avgs):.1f}\n')

    all_after = [a for _, _, _, a, _ in [(c,s,b,a,g) for c,s,b,a,g in results]]
    if all_after:
        print(f'Overall after-range: {min(all_after):.1f} – {max(all_after):.1f}')
        in_band = sum(1 for a in all_after if 130 <= a <= 150)
        print(f'In target band 130-150: {in_band}/{len(all_after)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
