#!/usr/bin/env python3
"""
DEMO FALLBACK: writes a SYNTHETIC blocks.npz with the same format as prepare_hansen.py.

It exists so the web app can be built and deployed even when the real Hansen download is not
available. The app shows a red "DEMO DATA" banner whenever the data is synthetic. Replace it with
real data by running prepare_hansen.py + build_hexes.py.
"""
import argparse
from pathlib import Path

import numpy as np

from common import (BLOCK_DEG, DEFAULT_DISTRICTS, N_YEARS, load_districts, pixel_area_ha, snapped_bbox)


def smooth_noise(rng, shape, scale):
    """Cheap smooth random field via sum of random plane waves."""
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(float)
    f = np.zeros(shape)
    for _ in range(14):
        k = rng.normal(0, 1 / scale, 2); ph = rng.uniform(0, 6.283)
        f += np.cos(k[0] * yy + k[1] * xx + ph)
    return (f - f.mean()) / (f.std() + 1e-9)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--districts", default=",".join(DEFAULT_DISTRICTS))
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "out" / "blocks.npz"))
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    names = [x.strip() for x in a.districts.split(",") if x.strip()]
    w, s, e, n = snapped_bbox(load_districts(names).values())
    lons = np.arange(w + BLOCK_DEG / 2, e, BLOCK_DEG); lats = np.arange(s + BLOCK_DEG / 2, n, BLOCK_DEG)
    LON, LAT = np.meshgrid(lons, lats)
    shp = LON.shape
    # forest: dense along a Ghats ridge, patchy inland
    ridge = 75.2 + 0.15 * (LAT - 12.0)
    base = 0.75 * np.exp(-((LON - ridge) / 0.45) ** 2) + 0.12 * smooth_noise(rng, shp, 50) + 0.25
    frac = np.clip(base + 0.1 * smooth_noise(rng, shp, 16), 0, 0.97)
    frac[frac < 0.25] = 0
    area = np.vectorize(pixel_area_ha)(LAT) * (round(BLOCK_DEG / 0.00025)) ** 2
    forest = frac * area
    # loss: a few hotspot centres whose intensity grows over time + persistence + noise
    nh = 9
    ci = rng.choice(np.flatnonzero(frac.ravel() > 0.5), nh, replace=False)
    centres = np.c_[LAT.ravel()[ci], LON.ravel()[ci]]
    start = rng.integers(0, 12, nh); radius = rng.uniform(0.12, 0.3, nh); peak = rng.uniform(0.012, 0.035, nh)
    loss = np.zeros(shp + (N_YEARS,))
    background = 0.0006 * (1 + 0.5 * smooth_noise(rng, shp, 30).clip(-1, 2))
    for t in range(N_YEARS):
        rate = background * (1 + 0.04 * t)
        for k in range(nh):
            if t >= start[k]:
                d2 = (LAT - centres[k, 0]) ** 2 + (LON - centres[k, 1]) ** 2
                rate = rate + peak[k] * np.exp(-d2 / (2 * radius[k] ** 2)) * min(1.0, 0.25 + 0.15 * (t - start[k]))
        loss[:, :, t] = forest * rate * rng.gamma(2.0, 0.5, shp)
    # forest cannot be lost twice
    cum = np.cumsum(loss, axis=2); over = cum.sum(axis=2) > forest
    loss[over] *= (forest[over] / cum.sum(axis=2)[over])[:, None] * 0.98
    keep = (forest > 0).ravel()
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        a.out, lat=LAT.ravel()[keep].astype(np.float32), lon=LON.ravel()[keep].astype(np.float32),
        forest=forest.ravel()[keep].astype(np.float32), loss=loss.reshape(-1, N_YEARS)[keep].astype(np.float32),
        source=np.array("SYNTHETIC DEMO DATA (not real)"), canopy=np.array(30), synthetic=np.array(True),
        districts=np.array(names), bbox=np.array((w, s, e, n)),
    )
    print(f"Wrote synthetic demo blocks -> {a.out}  ({keep.sum():,} blocks)")


if __name__ == "__main__":
    main()
