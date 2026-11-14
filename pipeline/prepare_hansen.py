#!/usr/bin/env python3
"""
Step 1 (real data): read Hansen Global Forest Change tiles and aggregate them to a
0.005-degree (~550 m) block grid.

Reads ONLY the window covering your study area straight from Google Cloud Storage
(HTTP range requests), so there is no multi-GB download and no Earth Engine login.

    python pipeline/prepare_hansen.py                    # Western Ghats districts (default)
    python pipeline/prepare_hansen.py --quick            # Kodagu + Chikmagalur only (fast)
    python pipeline/prepare_hansen.py --districts "Kodagu,Hassan"
    python pipeline/prepare_hansen.py --bbox 75.0 12.0 76.0 13.0
    python pipeline/prepare_hansen.py --local-dir ~/hansen_tiles   # tiles already downloaded

Output: pipeline/out/blocks.npz  (consumed by build_hexes.py)

Data: Hansen/UMD/Google/USGS/NASA, Global Forest Change v1.12 (2000-2024), CC BY 4.0.
Forest = tree canopy cover in 2000 >= --canopy percent (default 30). Loss = stand-replacement
disturbance (first year), counted only on forest pixels.
"""
import argparse
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window, from_bounds

from common import (BLOCK_DEG, DEFAULT_DISTRICTS, FIRST_YEAR, N_YEARS, PIXEL_DEG,
                    load_districts, pixel_area_ha, snapped_bbox)

URL = "https://storage.googleapis.com/earthenginepartners-hansen/GFC-2024-v1.12/Hansen_GFC-2024-v1.12_{layer}_{tile}.tif"
BLOCK_PX = int(round(BLOCK_DEG / PIXEL_DEG))   # 20 pixels per block side
CHUNK_BLOCK_ROWS = 50                          # 50 block rows (=1000 pixel rows) per read


def tile_name(lat_top, lon_left):
    ns = "N" if lat_top >= 0 else "S"
    ew = "E" if lon_left >= 0 else "W"
    return f"{abs(lat_top):02d}{ns}_{abs(lon_left):03d}{ew}"


def tiles_for_bbox(w, s, e, n):
    tops = range(int(math.ceil((s + 1e-9) / 10.0)) * 10, int(math.ceil((n - 1e-9) / 10.0)) * 10 + 1, 10)
    lefts = range(int(math.floor(w / 10.0)) * 10, int(math.floor((e - 1e-9) / 10.0)) * 10 + 1, 10)
    return [(t, l) for t in tops for l in lefts]


def source_path(layer, tile, local_dir):
    if local_dir:
        p = Path(local_dir).expanduser() / f"Hansen_GFC-2024-v1.12_{layer}_{tile}.tif"
        if not p.exists():
            raise SystemExit(f"Missing local file: {p}")
        return str(p)
    return URL.format(layer=layer, tile=tile)


def process_tile(tc_path, ly_path, bbox, canopy, out):
    w, s, e, n = bbox
    with rasterio.open(tc_path) as tc, rasterio.open(ly_path) as ly:
        if tc.transform != ly.transform or tc.shape != ly.shape:
            raise SystemExit("treecover2000 and lossyear tiles do not share a grid.")
        # Clip bbox to this tile, keep on the 0.01 deg grid
        tb = tc.bounds
        cw, cs = max(w, math.ceil(tb.left / BLOCK_DEG - 1e-9) * BLOCK_DEG), max(s, math.ceil(tb.bottom / BLOCK_DEG - 1e-9) * BLOCK_DEG)
        ce, cn = min(e, math.floor(tb.right / BLOCK_DEG + 1e-9) * BLOCK_DEG), min(n, math.floor(tb.top / BLOCK_DEG + 1e-9) * BLOCK_DEG)
        if ce <= cw or cn <= cs:
            return
        win = from_bounds(cw, cs, ce, cn, transform=tc.transform)
        col0, row0 = int(round(win.col_off)), int(round(win.row_off))
        n_bc = int(round((ce - cw) / BLOCK_DEG))
        n_br = int(round((cn - cs) / BLOCK_DEG))
        t0 = time.time()
        for br0 in range(0, n_br, CHUNK_BLOCK_ROWS):
            nbr = min(CHUNK_BLOCK_ROWS, n_br - br0)
            window = Window(col0, row0 + br0 * BLOCK_PX, n_bc * BLOCK_PX, nbr * BLOCK_PX)
            tcv = tc.read(1, window=window)
            lyr = ly.read(1, window=window)
            forest = tcv >= canopy
            lyr = np.where(forest, lyr, 0).astype(np.uint8)
            shp = (nbr, BLOCK_PX, n_bc, BLOCK_PX)
            forest_cnt = forest.reshape(shp).sum(axis=(1, 3)).astype(np.float64)
            loss_cnt = np.stack([(lyr == k).reshape(shp).sum(axis=(1, 3)) for k in range(1, N_YEARS + 1)], axis=-1).astype(np.float64)
            # block centres
            lat_c = tc.transform.f + (row0 + (br0 + np.arange(nbr) + 0.5) * BLOCK_PX) * tc.transform.e
            lon_c = tc.transform.c + (col0 + (np.arange(n_bc) + 0.5) * BLOCK_PX) * tc.transform.a
            area = np.array([pixel_area_ha(la) for la in lat_c])[:, None]
            f_ha = forest_cnt * area
            l_ha = loss_cnt * area[:, :, None]
            keep = (f_ha > 0) | (l_ha.sum(axis=-1) > 0)
            ri, ci = np.nonzero(keep)
            out["lat"].append(lat_c[ri]); out["lon"].append(lon_c[ci])
            out["forest"].append(f_ha[ri, ci]); out["loss"].append(l_ha[ri, ci])
            done = (br0 + nbr) / n_br
            print(f"  {done*100:5.1f}%  ({time.time()-t0:5.0f}s)", end="\r", flush=True)
        print()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--districts", default=",".join(DEFAULT_DISTRICTS), help="comma list, or 'all'")
    ap.add_argument("--quick", action="store_true", help="Kodagu + Chikmagalur only")
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"))
    ap.add_argument("--canopy", type=int, default=30, help="min canopy cover %% in 2000 to count as forest")
    ap.add_argument("--local-dir", help="folder with already-downloaded Hansen tiles")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "out" / "blocks.npz"))
    a = ap.parse_args()

    names = ["Kodagu", "Chikmagalur"] if a.quick else [x.strip() for x in a.districts.split(",") if x.strip()]
    if a.bbox:
        bbox = tuple(round(round(v / BLOCK_DEG) * BLOCK_DEG, 6) for v in a.bbox)
    else:
        bbox = snapped_bbox(load_districts(names).values())
    w, s, e, n = bbox
    print(f"Study area bbox: W{w} S{s} E{e} N{n}   canopy>={a.canopy}%")
    print(f"~{(e-w)/PIXEL_DEG*(n-s)/PIXEL_DEG/1e6:.0f} million pixels per band")

    out = {k: [] for k in ("lat", "lon", "forest", "loss")}
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
               GDAL_HTTP_MAX_RETRY="6", GDAL_HTTP_RETRY_DELAY="3", GDAL_HTTP_TIMEOUT="60",
               VSI_CACHE="TRUE", VSI_CACHE_SIZE=str(256 * 1024 * 1024))
    with rasterio.Env(**env):
        for lat_top, lon_left in tiles_for_bbox(w, s, e, n):
            tile = tile_name(lat_top, lon_left)
            print(f"Tile {tile}")
            try:
                process_tile(source_path("treecover2000", tile, a.local_dir),
                             source_path("lossyear", tile, a.local_dir), bbox, a.canopy, out)
            except rasterio.errors.RasterioIOError as ex:
                sys.exit(f"\nCould not read tile {tile}: {ex}\n"
                         "Check your internet connection, or download the two tiles manually from\n"
                         "https://storage.googleapis.com/earthenginepartners-hansen/GFC-2024-v1.12/download.html\n"
                         "and re-run with --local-dir <folder>.")
    if not out["lat"]:
        sys.exit("No forest found in the study area (check --bbox / --districts).")

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        a.out,
        lat=np.concatenate(out["lat"]).astype(np.float32), lon=np.concatenate(out["lon"]).astype(np.float32),
        forest=np.concatenate(out["forest"]).astype(np.float32), loss=np.concatenate(out["loss"]).astype(np.float32),
        source=np.array("Hansen Global Forest Change v1.12 (2000-2024)"), canopy=np.array(a.canopy),
        synthetic=np.array(False), districts=np.array(names), bbox=np.array(bbox),
    )
    tot_f = np.concatenate(out["forest"]).sum(); tot_l = np.concatenate(out["loss"]).sum()
    print(f"Saved {a.out}: forest(2000)={tot_f:,.0f} ha, loss 2001-2024={tot_l:,.0f} ha")
    print("Next: python pipeline/build_hexes.py")


if __name__ == "__main__":
    main()
