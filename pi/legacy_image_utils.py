"""Offline image utilities. NOT on the /display request path.

Kept for one-off scripts that still need to normalise a non-baseline JPEG
into the format the ESP32 esp_jpg_decode accepts (baseline + sRGB +
TrueColor + 4:2:0 chroma subsampling). Production /display assumes the
client (iOS app) pre-bakes the JPEG and is a thin proxy.
"""
import logging
import os
import subprocess
import tempfile


def convert_to_baseline(jpeg_bytes: bytes) -> bytes:
    """Convert JPEG to baseline (non-progressive) and resize for sleeve display."""
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as fin:
        fin.write(jpeg_bytes)
        fin_path = fin.name

    fout_path = fin_path.replace(".jpg", "_baseline.jpg")

    try:
        result = subprocess.run([
            "convert", fin_path,
            "-resize", "540x760^",
            "-gravity", "North",
            "-extent", "540x760",
            "-colorspace", "sRGB",
            "-type", "TrueColor",
            "-strip",
            "-sampling-factor", "4:2:0",
            "-level", "10%,100%",
            "-interlace", "none",
            "-quality", "85",
            fout_path
        ], check=True, capture_output=True)
        if result.stderr:
            logging.info(f"ImageMagick stderr: {result.stderr.decode().strip()}")

        identify = subprocess.run([
            "identify", "-format", "%[jpeg:sampling-factor] %[colorspace]", fout_path
        ], capture_output=True)
        logging.info(f"JPEG properties: {identify.stdout.decode().strip()}")

        with open(fout_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(fin_path)
        if os.path.exists(fout_path):
            os.unlink(fout_path)
