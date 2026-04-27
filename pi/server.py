"""
E-Cards Pi Server
=================
Flask server running on the Raspberry Pi (port 5050).

Sleeve registry: dict mapping sleeve_id (int) -> IP address (str).
Updated when sleeves check in at startup.

Endpoints
---------
GET  /sleeves               — return {"sleeves": {id: ip, ...}}
POST /display?sleeve_id=N   — forward JPEG body to sleeve /display
POST /clear?sleeve_id=N     — tell sleeve to blank its display
POST /set_zone              — forward a zone-index update to a sleeve's /zone endpoint
POST /zone_update           — sleeve reports its current zone (active_idx, cell)
GET  /zones                 — return per-sleeve zone state as seen by the Pi
"""

import threading
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# sleeve_id (int) -> IP address (str)
sleeves: dict[int, str] = {}
sleeves_lock = threading.Lock()

# sleeve_id (int) -> {"active_idx": int, "cell": str} — last zone reported or set
sleeve_zones: dict[int, dict] = {}
zones_lock = threading.Lock()

# SAM1-68: CMD appended at index 5 (matches MTG_ZONE_CELLS in src/api/sleeveService.ts)
ZONE_INDEX_TO_NAME: dict[int, str] = {4: "LIB", 3: "HND", 2: "BTFLD", 1: "GRV", 0: "EXL", 5: "CMD"}


# ── Registry ────────────────────────────────────────────────────────────────

@app.route("/sleeves", methods=["GET"])
def get_sleeves():
    with sleeves_lock:
        return jsonify({"sleeves": {str(k): v for k, v in sleeves.items()}})


@app.route("/register", methods=["POST"])
def register_sleeve():
    data = request.get_json(force=True)
    sleeve_id = int(data["sleeve_id"])
    ip = data["ip"]
    with sleeves_lock:
        sleeves[sleeve_id] = ip
    return jsonify({"ok": True})


# ── Display / Clear ─────────────────────────────────────────────────────────

@app.route("/display", methods=["POST"])
def display():
    sleeve_id = int(request.args.get("sleeve_id", 0))
    with sleeves_lock:
        ip = sleeves.get(sleeve_id)
    if not ip:
        return jsonify({"error": "unknown sleeve"}), 404
    try:
        r = requests.post(
            f"http://{ip}/display",
            data=request.data,
            headers={"Content-Type": "image/jpeg"},
            timeout=10,
        )
        return (r.content, r.status_code, {"Content-Type": r.headers.get("Content-Type", "application/json")})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/clear", methods=["POST"])
def clear():
    sleeve_id = int(request.args.get("sleeve_id", 0))
    with sleeves_lock:
        ip = sleeves.get(sleeve_id)
    if not ip:
        return jsonify({"error": "unknown sleeve"}), 404
    try:
        r = requests.post(f"http://{ip}/clear", timeout=5)
        return (r.content, r.status_code)
    except Exception as e:
        return jsonify({"error": str(e)}), 502


# ── Zone update (app → Pi → sleeve) ─────────────────────────────────────────

@app.route("/set_zone", methods=["POST"])
def set_zone():
    """
    Query params: sleeve_id=<int>&zone=<int 0-4>
    Looks up the sleeve IP from the registry and POSTs {"zone": zone_index}
    to the sleeve's /zone endpoint.
    Zone index mapping: LIB=4, HND=3, BTFLD/TKN/CMD=2, GRV=1, EXL=0
    """
    sleeve_id = int(request.args["sleeve_id"])
    zone_index = int(request.args["zone"])

    with sleeves_lock:
        ip = sleeves.get(sleeve_id)
    if not ip:
        return jsonify({"error": "unknown sleeve"}), 404

    zone_name = ZONE_INDEX_TO_NAME.get(zone_index, "EXL")
    with zones_lock:
        sleeve_zones[sleeve_id] = {"active_idx": zone_index, "cell": zone_name}

    try:
        requests.post(
            f"http://{ip}/zone",
            json={"zone": zone_index},
            timeout=3,
        )
    except Exception:
        pass  # sleeve offline — not fatal

    return jsonify({"ok": True})


# ── Zone state (sleeve → Pi → app) ──────────────────────────────────────────

@app.route("/zone_update", methods=["POST"])
def zone_update():
    """
    Called by a sleeve when its physical zone sensor changes (SAM1-71).
    Body: {"sleeve_id": <int>, "active_idx": <int>, "cell": <str>}
    Updates the Pi's in-memory zone state so /zones reflects the change.
    """
    data = request.get_json(force=True)
    sleeve_id = int(data["sleeve_id"])
    active_idx = int(data["active_idx"])
    cell = str(data["cell"])
    with zones_lock:
        sleeve_zones[sleeve_id] = {"active_idx": active_idx, "cell": cell}
    return jsonify({"ok": True})


@app.route("/zones", methods=["GET"])
def get_zones():
    """
    Returns the last-known zone for every registered sleeve.
    Response: {"zones": {"2": {"active_idx": 0, "cell": "EXL"}, ...}}
    Sleeves with no recorded zone default to LIB (active_idx=4).
    """
    with sleeves_lock:
        registered = set(sleeves.keys())
    with zones_lock:
        result = {
            str(sid): sleeve_zones.get(sid, {"active_idx": 4, "cell": "LIB"})
            for sid in registered
        }
    return jsonify({"zones": result})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050)
