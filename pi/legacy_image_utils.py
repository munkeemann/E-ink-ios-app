"""Image normalisation utilities — used by /bake (deck-save-time, low-frequency),
NOT by /display (per-push hot path).

Normalises a JPEG into the format the ESP32 esp_jpg_decode accepts:
baseline (non-progressive) + sRGB + TrueColor + 4:2:0 chroma subsampling,
resized and centered to fit the sleeve display.
"""
import logging
import os
import subprocess
import tempfile


def convert_to_baseline(jpeg_bytes: bytes, width: int = 540, height: int = 760) -> bytes:
    """Convert JPEG to baseline (non-progressive) and resize for sleeve display."""
    geom = f"{width}x{height}"
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as fin:
        fin.write(jpeg_bytes)
        fin_path = fin.name

    fout_path = fin_path.replace(".jpg", "_baseline.jpg")

    try:
        result = subprocess.run([
            "convert", fin_path,
            "-resize", f"{geom}^",
            "-gravity", "North",
            "-extent", geom,
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
