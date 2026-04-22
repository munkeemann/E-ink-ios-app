#!/usr/bin/env python3
"""
Scrape every image in a Piwigo public category to a local directory.

Usage:
    python3 scripts/scrape_piwigo.py <category_id> <output_dir>
    python3 scripts/scrape_piwigo.py 1202 ~/lotr-raw-backup

Uses only the Python stdlib (urllib). Targets the Piwigo JSON web service
`pwg.categories.getImages`, which is open on public-read galleries such as
cardscans.piwigo.com. Each image's `xxlarge` derivative is downloaded — the
true originals are gated behind `download_url: null` for this host, and
xxlarge (typically 889x1242) is already equivalent to the Avatar-skin
source quality used by preprocess_skin.py.

Files are written to <output_dir>/<original_filename> to preserve Piwigo's
`<PackName>_NNNN copy.jpg` sequence numbering, which preprocess_skin.py
matches via a SEQ_TO_CARD dict.

Flags HTML-fallback as TODO: if the JSON endpoint ever 401s on a future
host we'd add it here, but on cardscans.piwigo.com the JSON is open.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HOST = "https://cardscans.piwigo.com"
USER_AGENT = "MTGSleeves-skin-fetcher/1.0 (contact maxjbjb@gmail.com)"
PER_PAGE = 100
INTER_REQUEST_SLEEP_SEC = 0.2  # be polite
DERIVATIVE_KEY = "xxlarge"     # 889x1242 on this host; matches Avatar pipeline


def build_opener() -> urllib.request.OpenerDirector:
    opener = urllib.request.build_opener()
    opener.addheaders = [("User-Agent", USER_AGENT)]
    return opener


def fetch_json(opener: urllib.request.OpenerDirector, url: str) -> dict:
    with opener.open(url, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    payload = json.loads(raw)
    if payload.get("stat") != "ok":
        raise RuntimeError(f"Piwigo API returned non-ok status: {payload}")
    return payload["result"]


def list_category_images(opener: urllib.request.OpenerDirector, category_id: int) -> list[dict]:
    images: list[dict] = []
    page = 0
    while True:
        params = urllib.parse.urlencode({
            "method": "pwg.categories.getImages",
            "cat_id": category_id,
            "per_page": PER_PAGE,
            "page": page,
            "format": "json",
        })
        url = f"{HOST}/ws.php?{params}"
        result = fetch_json(opener, url)
        batch = result.get("images", [])
        if not batch:
            break
        images.extend(batch)
        paging = result.get("paging", {})
        total = paging.get("total_count", len(images))
        print(f"  fetched page {page}: +{len(batch)} images ({len(images)}/{total})")
        if len(images) >= total:
            break
        page += 1
        time.sleep(INTER_REQUEST_SLEEP_SEC)
    return images


def download_image(opener: urllib.request.OpenerDirector, url: str, dest: str) -> int:
    with opener.open(url, timeout=60) as resp:
        data = resp.read()
    with open(dest, "wb") as f:
        f.write(data)
    return len(data)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        category_id = int(sys.argv[1])
    except ValueError:
        print(f"category_id must be an integer, got {sys.argv[1]!r}", file=sys.stderr)
        return 2
    out_dir = os.path.expanduser(sys.argv[2])
    os.makedirs(out_dir, exist_ok=True)

    opener = build_opener()
    print(f"Listing category {category_id} from {HOST} …")
    images = list_category_images(opener, category_id)
    print(f"Found {len(images)} images. Downloading to {out_dir} …")

    failures: list[tuple[str, str]] = []
    for i, img in enumerate(images, 1):
        filename = img.get("file") or f"image_{img.get('id')}.jpg"
        derivatives = img.get("derivatives") or {}
        chosen = derivatives.get(DERIVATIVE_KEY)
        if not chosen:
            # Fall back through largest available in a sensible order.
            for key in ("4xlarge", "3xlarge", "xlarge", "large", "medium"):
                if key in derivatives:
                    chosen = derivatives[key]
                    break
        if not chosen:
            failures.append((filename, "no derivative URL"))
            print(f"  [{i:>3}/{len(images)}] SKIP {filename} — no usable derivative")
            continue

        url = chosen["url"]
        dest = os.path.join(out_dir, filename)
        try:
            n_bytes = download_image(opener, url, dest)
            print(f"  [{i:>3}/{len(images)}] {filename}  {chosen['width']}x{chosen['height']}  {n_bytes} bytes")
        except urllib.error.HTTPError as e:
            failures.append((filename, f"HTTP {e.code}"))
            print(f"  [{i:>3}/{len(images)}] FAIL {filename} — HTTP {e.code}")
        except Exception as e:
            failures.append((filename, str(e)))
            print(f"  [{i:>3}/{len(images)}] FAIL {filename} — {e}")
        time.sleep(INTER_REQUEST_SLEEP_SEC)

    print()
    print(f"Downloaded {len(images) - len(failures)}/{len(images)} images to {out_dir}")
    if failures:
        print("Failures:")
        for fn, reason in failures:
            print(f"  {fn}: {reason}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
