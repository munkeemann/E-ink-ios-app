#!/usr/bin/env python3
"""
SAM1-62: preprocess the 318 nBeebz D&D spell PNGs into 540×760 JPEGs.

Source:   ~/spell-cards-raw/Spell Cards/<png_filename>
           (downloaded in SAM1-59; png_filename comes from spells.json)
Metadata: scripts/spells/spells.json  (SAM1-59 output)
Output:   src/assets/dnd/spells/<safe_name>.jpg  (540×760 JPEG, q=95)

Pipeline (Option 3 per SAM1-62 discovery, with SAM1-77 text-crispness tuning):
  - Flatten RGBA onto white (PNG sources may carry alpha).
  - Proportional shrink + center-crop to 540×760 via Lanczos.
    Source 822×1122 (aspect 0.733) vs target 540×760 (aspect 0.711):
    scale-by-width then crop ~4px horizontally off each side.
  - SAM1-77: post-resize UnsharpMask + gamma 1.15. Lanczos downscale
    smears 2-source-pixel text strokes into mid-grey AA bands; an
    unsharp pass restores stroke definition and the gamma push pulls
    residual mid-grey toward black where e-ink renders crisply. White
    backgrounds are preserved (gamma>1 leaves 1.0→1.0). Measured impact:
    +5–8 units of body-region contrast std, −3pp midtone smear, on
    representative spells (Dancing Lights / Fireball / Polymorph).
  - Save JPEG at quality 95 with PIL's default subsampling (4:2:0).
    Quality and chroma subsampling were measured to have no effect on
    body text rendering — the bottleneck was Lanczos AA, not JPEG.

Filename: lowercase, spaces→underscores, apostrophes stripped, slashes→
underscores. "Bigby's Hand" → "bigbys_hand", "Antipathy/Sympathy" →
"antipathy_sympathy".

Usage: python3 scripts/spells/preprocess.py
"""

import json
import os
import re
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
SPELLS_JSON = HERE / 'spells.json'
SRC_DIR = Path(os.path.expanduser('~/spell-cards-raw/Spell Cards'))
DEST_DIR = REPO_ROOT / 'src' / 'assets' / 'dnd' / 'spells'

JPEG_QUALITY = 95
TARGET_W = 540
TARGET_H = 760

# SAM1-77: text-crispness tuning (variant VS2).
UNSHARP_RADIUS = 1.0
UNSHARP_PERCENT = 75
UNSHARP_THRESHOLD = 2
GAMMA = 1.15


def safe_filename(spell_name: str) -> str:
    s = spell_name.lower()
    s = s.replace("'", '')
    s = re.sub(r'[\s/]+', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    return s


def flatten_to_rgb(img: Image.Image) -> Image.Image:
    if img.mode == 'RGB':
        return img
    bg = Image.new('RGB', img.size, (255, 255, 255))
    if img.mode == 'RGBA' or 'transparency' in img.info:
        bg.paste(img, mask=img.convert('RGBA').split()[-1])
    else:
        bg.paste(img.convert('RGB'))
    return bg


def resize_to_target(img: Image.Image) -> Image.Image:
    src_w, src_h = img.size
    src_aspect = src_w / src_h
    tgt_aspect = TARGET_W / TARGET_H
    if src_aspect > tgt_aspect:
        new_h = TARGET_H
        new_w = round(TARGET_H * src_aspect)
    else:
        new_w = TARGET_W
        new_h = round(TARGET_W / src_aspect)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - TARGET_W) // 2
    top = (new_h - TARGET_H) // 2
    return resized.crop((left, top, left + TARGET_W, top + TARGET_H))


def luma_mean(img: Image.Image) -> float:
    # Quick mean-luma sampler for reporting only.
    arr = np.array(img, dtype=float)
    return float((0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]).mean())


def apply_gamma(img: Image.Image, gamma: float) -> Image.Image:
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = np.clip(arr ** gamma, 0, 1) * 255.0
    return Image.fromarray(arr.astype(np.uint8))


def process(src_path: Path, dest_path: Path) -> float:
    img = flatten_to_rgb(Image.open(src_path))
    img = resize_to_target(img)
    img = img.filter(ImageFilter.UnsharpMask(
        radius=UNSHARP_RADIUS, percent=UNSHARP_PERCENT, threshold=UNSHARP_THRESHOLD,
    ))
    img = apply_gamma(img, GAMMA)
    img.save(dest_path, 'JPEG', quality=JPEG_QUALITY)
    return luma_mean(img)


def main() -> int:
    if not SPELLS_JSON.exists():
        print(f'ERROR: {SPELLS_JSON} missing', file=sys.stderr)
        return 2
    if not SRC_DIR.is_dir():
        print(f'ERROR: {SRC_DIR} missing', file=sys.stderr)
        return 2
    DEST_DIR.mkdir(parents=True, exist_ok=True)

    spells = json.loads(SPELLS_JSON.read_text())
    names = sorted(spells.keys())
    total = len(names)
    print(f'[DND-PREP] start — {total} spells, q={JPEG_QUALITY}, no luma transform')

    lumas = []
    skipped = []

    for i, name in enumerate(names, 1):
        entry = spells[name]
        png_fn = entry.get('png_filename')
        if not png_fn:
            skipped.append((name, 'png_filename missing in spells.json'))
            continue
        src = SRC_DIR / png_fn
        if not src.exists():
            skipped.append((name, f'source PNG not found: {src}'))
            continue
        stem = safe_filename(name)
        dest = DEST_DIR / f'{stem}.jpg'
        try:
            me = process(src, dest)
            lumas.append((name, me))
        except Exception as e:
            skipped.append((name, f'process ERROR: {e}'))
            continue
        if i % 20 == 0 or i == total:
            cur_luma = lumas[-1][1] if lumas else 0.0
            print(f'[DND-PREP] {i}/{total} done — current spell: {name} — luma {cur_luma:.1f}')

    # ── Report ──
    print(f'\n[DND-PREP] processed: {len(lumas)}  skipped: {len(skipped)}')
    if skipped:
        print('\nSkipped spells:')
        for nm, reason in skipped:
            print(f'  {nm}: {reason}')
    if lumas:
        vals = [v for _, v in lumas]
        print(f'\nLuma distribution (native, no transform):')
        print(f'  min:  {min(vals):.2f}')
        print(f'  max:  {max(vals):.2f}')
        print(f'  mean: {sum(vals) / len(vals):.2f}')
    total_bytes = sum(p.stat().st_size for p in DEST_DIR.glob('*.jpg'))
    print(f'\nTotal output size: {total_bytes:,} bytes  ({total_bytes / 1024 / 1024:.2f} MB)')
    print(f'File count:        {sum(1 for _ in DEST_DIR.glob("*.jpg"))}')

    return 0 if not skipped else 1


if __name__ == '__main__':
    raise SystemExit(main())
