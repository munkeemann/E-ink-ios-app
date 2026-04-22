#!/usr/bin/env python3
import io
import json
import logging
import os
import struct
import subprocess
import tempfile
import threading
import requests
from PIL import Image
from flask import Flask, request, jsonify

HOST = "0.0.0.0"
PORT = 5050
SLEEVE_DISPLAY_PATH = "/display"
SLEEVE_TIMEOUT = 5  # seconds
REGISTRY_PATH = "/home/maxja/eink_receiver/registry.json"
PING_INTERVAL = 30  # seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)

app = Flask(__name__)

# sleeve_id -> ip
registry: dict[str, str] = {}
registry_lock = threading.Lock()

# sleeve_id -> zone_name
zone_states: dict[str, str] = {}
zone_lock = threading.Lock()


def _load_registry():
    try:
        with open(REGISTRY_PATH) as f:
            data = json.load(f)
        if isinstance(data, dict):
            registry.update({str(k).strip(): v for k, v in data.items()})
            logging.info(f"Loaded {len(registry)} sleeve(s) from {REGISTRY_PATH}")
    except FileNotFoundError:
        pass
    except Exception as e:
        logging.warning(f"Could not load registry: {e}")


def _save_registry():
    try:
        with open(REGISTRY_PATH, "w") as f:
            json.dump(registry, f, indent=2)
    except Exception as e:
        logging.warning(f"Could not save registry: {e}")


def _ping_loop():
    while True:
        threading.Event().wait(PING_INTERVAL)
        with registry_lock:
            snapshot = dict(registry)
        for sleeve_id, ip in snapshot.items():
            try:
                resp = requests.get(f"http://{ip}/ping", timeout=5)
                if resp.status_code == 200:
                    logging.debug(f"Ping OK: sleeve '{sleeve_id}' at {ip}")
                else:
                    logging.warning(f"Ping non-200 from sleeve '{sleeve_id}' at {ip}: {resp.status_code}")
            except Exception as e:
                logging.warning(f"Ping failed for sleeve '{sleeve_id}' at {ip}: {e}")


ZONE_CELLS = ["LIB", "HND", "BTFLD", "GRV", "EXL"]
ZONE_INDEX = {name: i for i, name in enumerate(ZONE_CELLS)}


def _default_label(sleeve_id: str) -> str:
    try:
        n = int(sleeve_id)
        return "Commander" if n == 1 else f"Card {n - 1}"
    except ValueError:
        return f"Sleeve {sleeve_id}"


def _build_descriptor(sleeve_id: str, card_label: str | None,
                      zone: str | None, face_down: bool) -> dict:
    desc: dict = {"v": 2, "face_down": face_down}
    desc["primary_label"] = card_label if card_label else _default_label(sleeve_id)
    active_index = ZONE_INDEX.get((zone or "LIB").upper(), 0)
    desc["zone_strip"] = {"cells": ZONE_CELLS, "active_index": active_index}
    return desc


def _frame_v2(descriptor: dict, jpeg_bytes: bytes) -> bytes:
    desc_bytes = json.dumps(descriptor, separators=(",", ":")).encode()
    return struct.pack(">H", len(desc_bytes)) + desc_bytes + jpeg_bytes


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


@app.post("/register")
def register():
    data = request.get_json(force=True, silent=True) or {}
    sleeve_id = str(data.get("sleeve_id", "")).strip()
    ip = data.get("ip")
    if not sleeve_id or not ip:
        return jsonify(error="sleeve_id and ip are required"), 400

    with registry_lock:
        registry[sleeve_id] = ip
        _save_registry()

    logging.info(f"Registered sleeve '{sleeve_id}' at {ip}")
    return jsonify(ok=True), 200


@app.post("/display")
def display():
    _raw_id = request.args.get("sleeve_id") or (
        request.get_json(force=True, silent=True) or {}
    ).get("sleeve_id")
    sleeve_id = str(_raw_id).strip() if _raw_id is not None else None

    if not sleeve_id:
        return jsonify(error="sleeve_id query param required"), 400

    with registry_lock:
        ip = registry.get(sleeve_id)

    if ip is None:
        return jsonify(error=f"sleeve '{sleeve_id}' not registered"), 404

    # --- branch: multipart (new iOS path) vs. raw body (legacy fallback) ---
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        # Parse descriptor field
        raw_desc = request.form.get("descriptor")
        if not raw_desc:
            return jsonify(error="multipart 'descriptor' field is required"), 400
        try:
            descriptor = json.loads(raw_desc)
        except json.JSONDecodeError as exc:
            logging.error(f"Descriptor parse error for sleeve '{sleeve_id}': {exc}")
            return jsonify(error=f"descriptor is not valid JSON: {exc}"), 400

        if descriptor.get("v") != 2:
            return jsonify(error=f"unsupported descriptor version: {descriptor.get('v')!r}"), 400

        # Optional image field
        jpeg_bytes = b""
        image_file = request.files.get("image")
        if image_file:
            raw_jpeg = image_file.read()
            try:
                jpeg_bytes = convert_to_baseline(raw_jpeg)
                logging.info(f"Converted multipart image to baseline JPEG ({len(jpeg_bytes)} bytes)")
            except Exception as e:
                logging.error(f"Image conversion failed: {e}")
                return jsonify(error=f"image conversion failed: {e}"), 500

    else:
        # Legacy fallback: synthesize descriptor from query params + raw JPEG body
        card_label = request.args.get("card_label") or None
        zone = request.args.get("zone") or None
        face_down = request.args.get("face_down", "0") not in ("0", "", "false", "False")

        jpeg_bytes = request.get_data()

        if not face_down:
            if not jpeg_bytes:
                return jsonify(error="request body must contain JPEG bytes"), 400
            try:
                jpeg_bytes = convert_to_baseline(jpeg_bytes)
                logging.info(f"Converted to baseline JPEG ({len(jpeg_bytes)} bytes)")
            except Exception as e:
                logging.error(f"Image conversion failed: {e}")
                return jsonify(error=f"image conversion failed: {e}"), 500

        descriptor = _build_descriptor(sleeve_id, card_label, zone, face_down)

    # --- shared send path ---
    payload = _frame_v2(descriptor, jpeg_bytes)
    logging.info(f"v2 descriptor for sleeve '{sleeve_id}': {descriptor}")

    url = f"http://{ip}{SLEEVE_DISPLAY_PATH}"
    try:
        resp = requests.post(
            url,
            data=payload,
            headers={"Content-Type": "application/octet-stream"},
            timeout=SLEEVE_TIMEOUT,
        )
        resp.raise_for_status()
        logging.info(f"Pushed v2 frame to sleeve '{sleeve_id}' at {ip} ({len(payload)} bytes)")
        return jsonify(ok=True, sleeve_id=sleeve_id, ip=ip, descriptor=descriptor), 200
    except requests.exceptions.Timeout:
        logging.error(f"Timeout pushing to sleeve '{sleeve_id}' at {ip}")
        return jsonify(error="sleeve did not respond in time"), 504
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to push to sleeve '{sleeve_id}' at {ip}: {e}")
        return jsonify(error=str(e)), 502


@app.post("/clear")
def clear():
    _raw_id = request.args.get("sleeve_id")
    sleeve_id = str(_raw_id).strip() if _raw_id is not None else None

    if not sleeve_id:
        return jsonify(error="sleeve_id query param required"), 400

    with registry_lock:
        ip = registry.get(sleeve_id)

    if ip is None:
        return jsonify(error=f"sleeve '{sleeve_id}' not registered"), 404

    buf = io.BytesIO()
    Image.new("RGB", (540, 760), color=(255, 255, 255)).save(buf, format="JPEG", quality=85)
    white_jpeg = buf.getvalue()

    url = f"http://{ip}{SLEEVE_DISPLAY_PATH}"
    try:
        resp = requests.post(
            url,
            data=white_jpeg,
            headers={"Content-Type": "image/jpeg"},
            timeout=SLEEVE_TIMEOUT,
        )
        resp.raise_for_status()
        logging.info(f"Cleared sleeve '{sleeve_id}' at {ip}")
        return jsonify(ok=True, sleeve_id=sleeve_id, ip=ip), 200
    except requests.exceptions.Timeout:
        logging.error(f"Timeout clearing sleeve '{sleeve_id}' at {ip}")
        return jsonify(error="sleeve did not respond in time"), 504
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to clear sleeve '{sleeve_id}' at {ip}: {e}")
        return jsonify(error=str(e)), 502


@app.get("/sleeves")
def list_sleeves():
    with registry_lock:
        snap = dict(registry)
    return jsonify(sleeves=snap), 200


@app.post("/zone_update")
def zone_update():
    data = request.get_json(force=True, silent=True) or {}
    sleeve_id = str(data.get("sleeve_id", "")).strip()
    zone = data.get("zone")
    zone_name = data.get("zone_name", "")

    if not sleeve_id or zone is None:
        return jsonify(error="sleeve_id and zone required"), 400

    with zone_lock:
        zone_states[sleeve_id] = zone_name

    logging.info(f"Sleeve '{sleeve_id}' zone updated to {zone_name}")
    return jsonify(ok=True, sleeve_id=sleeve_id, zone=zone_name), 200


@app.get("/zones")
def list_zones():
    with zone_lock:
        snap = dict(zone_states)
    return jsonify(zones=snap), 200


@app.post("/set_zone")
def set_zone():
    sleeve_id = str(request.args.get("sleeve_id", "")).strip()
    zone = request.args.get("zone")
    if not sleeve_id or zone is None:
        return jsonify(error="sleeve_id and zone required"), 400

    with registry_lock:
        ip = registry.get(sleeve_id)
    if ip is None:
        return jsonify(error=f"sleeve '{sleeve_id}' not registered"), 404

    try:
        resp = requests.post(
            f"http://{ip}/zone",
            params={"zone": zone},
            timeout=SLEEVE_TIMEOUT
        )
        resp.raise_for_status()
        with zone_lock:
            zone_states[sleeve_id] = zone
        logging.info(f"Set sleeve '{sleeve_id}' zone to {zone}")
        return jsonify(ok=True), 200
    except requests.exceptions.RequestException as e:
        return jsonify(error=str(e)), 502


@app.post("/zone_update_sleeve")
def zone_update_sleeve():
    data = request.get_json(force=True, silent=True) or {}
    sleeve_id = str(data.get("sleeve_id", "")).strip()
    zone_index = data.get("zone_index")

    if not sleeve_id or zone_index is None:
        return jsonify(error="sleeve_id and zone_index are required"), 400

    with registry_lock:
        ip = registry.get(sleeve_id)

    if ip is None:
        return jsonify(error=f"sleeve '{sleeve_id}' not registered"), 404

    try:
        resp = requests.post(
            f"http://{ip}/zone",
            params={"zone": zone_index},
            timeout=SLEEVE_TIMEOUT,
        )
        resp.raise_for_status()
        logging.info(f"Forwarded zone_index={zone_index} to sleeve '{sleeve_id}' at {ip}")
        return jsonify(ok=True, sleeve_id=sleeve_id, ip=ip, zone_index=zone_index), 200
    except requests.exceptions.Timeout:
        logging.error(f"Timeout forwarding zone to sleeve '{sleeve_id}' at {ip}")
        return jsonify(error="sleeve did not respond in time"), 504
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to forward zone to sleeve '{sleeve_id}' at {ip}: {e}")
        return jsonify(error=str(e)), 502


def configure_network():
    result = subprocess.run(
        ["ip", "addr", "add", "192.168.4.1/24", "dev", "wlan1"],
        capture_output=True,
    )
    if result.returncode == 0:
        logging.info("Assigned 192.168.4.1/24 to wlan1")
    else:
        msg = result.stderr.decode().strip()
        if "RTNETLINK answers: File exists" in msg:
            logging.info("192.168.4.1/24 already assigned to wlan1")
        else:
            logging.warning(f"ip addr add failed: {msg}")


if __name__ == "__main__":
    _load_registry()
    threading.Thread(target=_ping_loop, daemon=True).start()
    configure_network()
    logging.info(f"Begin Game Server listening on {HOST}:{PORT}")
    app.run(host=HOST, port=PORT, threaded=True)
