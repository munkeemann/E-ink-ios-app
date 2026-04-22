#!/usr/bin/env python3
"""
Fetch SRD spell metadata from dnd5eapi.co and cache to /tmp/srd_spells_raw.json.

Rerun-safe: if the cache file exists, skip all network calls and just
re-print the summary from the cached data.

Output per spell:
    {
        "index": "acid-splash",
        "name": "Acid Splash",
        "level": 0,
        "school": "Conjuration",
        "classes": ["Sorcerer", "Wizard"]
    }

Usage: python3 scripts/spells/fetch_srd.py
"""

import json
import os
import sys
import time
import urllib.request
from collections import Counter

API_BASE = "https://www.dnd5eapi.co/api/2014/spells"
CACHE_PATH = "/tmp/srd_spells_raw.json"
USER_AGENT = "MTGSleeves-srd-fetcher/1.0 (contact maxjbjb@gmail.com)"
SLEEP_SEC = 0.15


def _fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_all() -> list[dict]:
    print(f"Listing spells at {API_BASE} …")
    index = _fetch_json(API_BASE)
    refs = index.get("results", [])
    print(f"  {len(refs)} spell references")
    out: list[dict] = []
    for i, ref in enumerate(refs, 1):
        detail = _fetch_json(f"https://www.dnd5eapi.co{ref['url']}")
        out.append({
            "index": detail.get("index"),
            "name": detail.get("name"),
            "level": detail.get("level"),
            "school": (detail.get("school") or {}).get("name"),
            "classes": [c.get("name") for c in detail.get("classes") or [] if c.get("name")],
        })
        if i % 20 == 0 or i == len(refs):
            print(f"  [{i:>3}/{len(refs)}] {detail.get('name')}")
        time.sleep(SLEEP_SEC)
    return out


def summarize(spells: list[dict]) -> None:
    print(f"\nTotal spells: {len(spells)}\n")
    by_level = Counter(s["level"] for s in spells)
    print("By level:")
    for lvl in sorted(by_level):
        tag = "cantrip" if lvl == 0 else f"level {lvl}"
        print(f"  {tag:>8}: {by_level[lvl]}")
    by_class: Counter = Counter()
    for s in spells:
        for c in s["classes"]:
            by_class[c] += 1
    print("\nBy class:")
    for cls, n in sorted(by_class.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {cls:<12} {n}")


def main() -> int:
    if os.path.exists(CACHE_PATH):
        print(f"Cache hit: {CACHE_PATH} — skipping network.")
        with open(CACHE_PATH) as f:
            spells = json.load(f)
    else:
        spells = fetch_all()
        with open(CACHE_PATH, "w") as f:
            json.dump(spells, f, indent=2)
        print(f"\nWrote cache: {CACHE_PATH}")
    summarize(spells)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
