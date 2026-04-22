#!/usr/bin/env python3
"""
Match the 318 nBeebz spell-card PNGs to SRD spell metadata.

Inputs:
    /tmp/srd_spells_raw.json          (from fetch_srd.py)
    ~/spell-cards-raw/Spell Cards/*.png

Outputs (written alongside this script in scripts/spells/):
    spells.json            — matched spells with {level, school, classes, png_filename}
    unmatched_pngs.txt     — PNGs with no API match (likely non-SRD)
    missing_from_pack.txt  — SRD spells with no PNG (absent from the pack)

Matching:
    1. Normalize both sides: strip .png, replace '_' with '/', trim, lowercase.
    2. First pass: case-insensitive exact match on the normalized form.
    3. Second pass for leftovers: Levenshtein distance ≤ 2.
    4. Anything still unmatched → unmatched_pngs.txt / missing_from_pack.txt.
"""

import json
import os
import sys
from pathlib import Path

import Levenshtein

HERE = Path(__file__).resolve().parent
SRC_PNG_DIR = Path(os.path.expanduser("~/spell-cards-raw/Spell Cards"))
SRD_CACHE = Path("/tmp/srd_spells_raw.json")

SPELLS_JSON = HERE / "spells.json"
UNMATCHED_TXT = HERE / "unmatched_pngs.txt"
MISSING_TXT = HERE / "missing_from_pack.txt"
OVERRIDES_JSON = HERE / "rename_overrides.json"


def normalize(s: str) -> str:
    """Both-sides normalizer: underscore→slash, collapse whitespace, lowercase."""
    s = s.replace("_", "/").strip().lower()
    # Some filenames have doubled whitespace from filesystems; collapse.
    while "  " in s:
        s = s.replace("  ", " ")
    return s


def load_srd() -> list[dict]:
    if not SRD_CACHE.exists():
        print(f"ERROR: {SRD_CACHE} missing. Run fetch_srd.py first.", file=sys.stderr)
        sys.exit(2)
    return json.loads(SRD_CACHE.read_text())


def list_pngs() -> list[str]:
    if not SRC_PNG_DIR.is_dir():
        print(f"ERROR: {SRC_PNG_DIR} missing.", file=sys.stderr)
        sys.exit(2)
    return sorted(p.name for p in SRC_PNG_DIR.iterdir() if p.suffix.lower() == ".png")


def main() -> int:
    srd = load_srd()
    pngs = list_pngs()
    print(f"SRD spells: {len(srd)}")
    print(f"Pack PNGs:  {len(pngs)}\n")

    # Optional rename overrides: {png_stem: canonical_srd_name}
    overrides: dict[str, str] = {}
    if OVERRIDES_JSON.exists():
        overrides = json.loads(OVERRIDES_JSON.read_text())
        print(f"Loaded {len(overrides)} rename overrides from {OVERRIDES_JSON.name}\n")

    # Normalized-name lookup tables
    png_by_norm: dict[str, str] = {}     # norm-name → filename
    for fn in pngs:
        stem = fn[:-4] if fn.lower().endswith(".png") else fn  # strip .png
        # If an override maps this stem to a canonical SRD name, normalize the
        # override value instead so Pass 1 exact-matches against the SRD entry.
        lookup_stem = overrides.get(stem, stem)
        png_by_norm[normalize(lookup_stem)] = fn

    srd_by_norm: dict[str, dict] = {}    # norm-name → srd entry
    for entry in srd:
        name = entry.get("name") or ""
        srd_by_norm[normalize(name)] = entry

    matched: dict[str, dict] = {}        # spell canonical name → detail (with png_filename)
    fuzzy_matches: list[tuple[str, str, int]] = []  # (png_filename, srd_name, distance)
    unmatched_pngs: list[str] = []
    png_norm_claimed: set[str] = set()
    srd_norm_claimed: set[str] = set()

    # Pass 1: exact case-insensitive on normalized form
    for png_norm, png_fn in png_by_norm.items():
        if png_norm in srd_by_norm:
            entry = srd_by_norm[png_norm]
            matched[entry["name"]] = {
                "level": entry["level"],
                "school": entry["school"],
                "classes": entry["classes"],
                "png_filename": png_fn,
            }
            png_norm_claimed.add(png_norm)
            srd_norm_claimed.add(png_norm)

    # Pass 2: Levenshtein ≤ 2 on remaining names
    remaining_png = [(n, fn) for n, fn in png_by_norm.items() if n not in png_norm_claimed]
    remaining_srd = [(n, e) for n, e in srd_by_norm.items() if n not in srd_norm_claimed]
    for png_norm, png_fn in remaining_png:
        best: tuple[int, str, dict] | None = None  # (distance, srd_norm, srd_entry)
        for srd_norm, srd_entry in remaining_srd:
            if srd_norm in srd_norm_claimed:
                continue
            d = Levenshtein.distance(png_norm, srd_norm)
            if d <= 2 and (best is None or d < best[0]):
                best = (d, srd_norm, srd_entry)
        if best is not None:
            d, srd_norm, srd_entry = best
            matched[srd_entry["name"]] = {
                "level": srd_entry["level"],
                "school": srd_entry["school"],
                "classes": srd_entry["classes"],
                "png_filename": png_fn,
            }
            fuzzy_matches.append((png_fn, srd_entry["name"], d))
            png_norm_claimed.add(png_norm)
            srd_norm_claimed.add(srd_norm)
        else:
            unmatched_pngs.append(png_fn)

    # SRD spells with no PNG
    missing_from_pack = sorted(
        entry["name"] for norm, entry in srd_by_norm.items()
        if norm not in srd_norm_claimed
    )

    # Sort outputs
    matched_sorted = dict(sorted(matched.items()))
    unmatched_pngs.sort()

    # Write outputs
    SPELLS_JSON.write_text(json.dumps(matched_sorted, indent=2) + "\n")
    UNMATCHED_TXT.write_text("\n".join(unmatched_pngs) + ("\n" if unmatched_pngs else ""))
    MISSING_TXT.write_text("\n".join(missing_from_pack) + ("\n" if missing_from_pack else ""))

    # Report
    print(f"Matched (exact + fuzzy): {len(matched_sorted)}")
    print(f"  of which fuzzy:        {len(fuzzy_matches)}")
    print(f"Unmatched PNGs:          {len(unmatched_pngs)}")
    print(f"Missing from pack:       {len(missing_from_pack)}")
    print()

    if fuzzy_matches:
        print("── Fuzzy matches (verify manually) ──")
        for png_fn, srd_name, d in fuzzy_matches:
            print(f"  distance={d}  '{png_fn}'  →  '{srd_name}'")
        print()

    def head(label: str, path: Path, n: int = 10) -> None:
        lines = path.read_text().splitlines() if path.exists() else []
        print(f"── First {min(n, len(lines))} lines of {path.name} ──")
        for line in lines[:n]:
            print(f"  {line}")
        print()

    head("spells.json", SPELLS_JSON, n=10)
    head("unmatched_pngs.txt", UNMATCHED_TXT, n=10)
    head("missing_from_pack.txt", MISSING_TXT, n=10)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
