"""Shared helpers for the CanopyWatch data pipeline."""
import json
import math
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
DISTRICTS_FILE = HERE / "data" / "karnataka_districts.geojson"

# Western Ghats / Malnad districts of Karnataka (the default study region)
DEFAULT_DISTRICTS = [
    "Kodagu", "Chikmagalur", "Hassan", "Dakshina Kannada",
    "Udupi", "Uttara Kannada", "Shimoga",
]

N_YEARS = 24            # Hansen 2024 v1.12: loss years 2001..2024
FIRST_YEAR = 2001
BLOCK_DEG = 0.005       # intermediate grid: 0.005 deg (~550 m)
PIXEL_DEG = 0.00025     # Hansen pixel size (~30 m)


def load_districts(names=None):
    """Return {name: shapely geometry} for the requested district names (None/'all' = all)."""
    fc = json.loads(DISTRICTS_FILE.read_text())
    out = {f["properties"]["name"]: shape(f["geometry"]).buffer(0) for f in fc["features"]}
    if names is None or [n.lower() for n in names] == ["all"]:
        return out
    wanted = {n.lower(): n for n in names}
    sel = {k: v for k, v in out.items() if k.lower() in wanted}
    missing = set(wanted) - {k.lower() for k in sel}
    if missing:
        raise SystemExit(f"Unknown district(s): {sorted(missing)}. Available: {sorted(out)}")
    return sel


def snapped_bbox(geoms, pad=0.0):
    """(west, south, east, north) of the union, snapped outward to the 0.01 deg block grid."""
    u = unary_union(list(geoms))
    w, s, e, n = u.bounds
    f = lambda v, fn: round(fn(round(v / BLOCK_DEG, 6)) * BLOCK_DEG, 6)
    return (f(w - pad, math.floor), f(s - pad, math.floor), f(e + pad, math.ceil), f(n + pad, math.ceil))


def pixel_area_ha(lat):
    """Area of one 0.00025 deg Hansen pixel at a given latitude, in hectares."""
    km_x = PIXEL_DEG * 111.320 * math.cos(math.radians(lat))
    km_y = PIXEL_DEG * 110.574
    return km_x * km_y * 100.0
