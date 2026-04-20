#!/usr/bin/env bash
# Generate 52 playing card JPEGs for e-ink sleeves.
# Output: assets/images/playing_cards/card_{rank}{suit}.jpg
# Requires Python 3 + Pillow. System fonts: macOS only (Helvetica.ttc, Symbol.ttf).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! python3 -c "import PIL" 2>/dev/null; then
  echo "Pillow not found — installing..."
  pip3 install --break-system-packages Pillow
fi

mkdir -p assets/images/playing_cards
python3 scripts/generate_playing_cards.py
