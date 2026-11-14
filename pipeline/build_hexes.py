#!/usr/bin/env python3
"""
Step 2: blocks.npz  ->  H3 hex grid + district assignment + forest-loss RISK MODEL  ->  web/public/data/

    python pipeline/build_hexes.py

What it does
  1. Aggregates the ~1 km blocks into H3 resolution-6 hexagons (~36 km2 each).
  2. Assigns each hexagon to a Karnataka district (point-in-polygon, geoBoundaries ADM2).
  3. Trains a Random Forest that predicts whether a hexagon suffers a high-loss event in year T from
     information available BEFORE year T (past loss, neighbour loss, forest left ...).
       - trained on 2008-2020, tested on the unseen years 2021-2024 (temporal hold-out)
       - compared with a naive "same as the last 3 years" baseline
     then scores every hexagon for the NEXT year (2025) using data through 2024.
  4. Writes hexes.json (+ district outlines) for the web app. Hot-spot (Gi*) maps are computed live
     in the browser for whatever period the user selects; gi_star.py is the reference implementation.
"""
import argparse
import json
import time
from pathlib import Path

import h3
import numpy as np
from scipy import sparse
from shapely.geometry import Point, mapping
from shapely.ops import unary_union
from shapely.prepared import prep
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import average_precision_score, roc_auc_score

from common import FIRST_YEAR, N_YEARS, load_districts

H3_RES = 6
MIN_FOREST_HA = 20          # drop hexes with almost no forest in 2000
MIN_REMAINING_HA = 50       # only model hexes that still have >=50 ha forest
FEATURES = ["forest_frac_2000", "remaining_frac", "cum_loss_frac", "last3_loss_frac",
            "prev1_loss_frac", "nbr_last3_density", "nbr_cum_loss_frac"]


def build_cells(blocks, dist_geoms):
    lat, lon, forest, loss = blocks["lat"], blocks["lon"], blocks["forest"], blocks["loss"]
    ids = np.array([h3.latlng_to_cell(float(a), float(b), H3_RES) for a, b in zip(lat, lon)])
    uniq, inv = np.unique(ids, return_inverse=True)
    F = np.bincount(inv, weights=forest, minlength=len(uniq))
    L = np.stack([np.bincount(inv, weights=loss[:, k], minlength=len(uniq)) for k in range(N_YEARS)], axis=1)
    union = prep(unary_union(list(dist_geoms.values())))
    names = list(dist_geoms)
    keep, dist = [], []
    for i, c in enumerate(uniq):
        if F[i] < MIN_FOREST_HA:
            continue
        la, lo = h3.cell_to_latlng(c)
        p = Point(lo, la)
        if not union.contains(p):
            continue
        for j, nm in enumerate(names):
            if dist_geoms[nm].contains(p):
                keep.append(i); dist.append(j); break
    keep = np.array(keep)
    return uniq[keep], F[keep], L[keep], np.array(dist), names


def adjacency(ids):
    index = {c: i for i, c in enumerate(ids)}
    rows, cols, nbrs = [], [], []
    for i, c in enumerate(ids):
        ring = [index[d] for d in h3.grid_disk(c, 1) if d in index]   # includes self
        nbrs.append(np.array(ring))
        for j in ring:
            if j != i:
                rows.append(i); cols.append(j)
    A = sparse.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(ids), len(ids)))
    deg = np.asarray(A.sum(axis=1)).ravel(); deg[deg == 0] = 1
    return sparse.diags(1 / deg) @ A, nbrs      # row-normalised, excluding self


def features(F, L, area, A, t):
    """Feature matrix using only years strictly BEFORE index t (t = 0..N_YEARS; N_YEARS = next year)."""
    cum = L[:, :t].sum(axis=1)
    last3 = L[:, max(0, t - 3):t].sum(axis=1)
    prev1 = L[:, t - 1] if t >= 1 else np.zeros(len(F))
    Fs = np.maximum(F, 1.0)
    cols = [F / area, np.clip(F - cum, 0, None) / area, cum / Fs, last3 / Fs, prev1 / Fs,
            A @ (last3 / area), A @ (cum / Fs)]
    return np.column_stack(cols), np.clip(F - cum, 0, None)


def make_rf():
    return RandomForestClassifier(n_estimators=300, min_samples_leaf=5, max_features="sqrt",
                                  class_weight="balanced_subsample", n_jobs=-1, random_state=0)


def train_and_score(F, L, area, A, event_ha):
    t_train = list(range(7, 20))          # target years 2008..2020
    t_test = list(range(20, N_YEARS))     # target years 2021..2024
    def stack(ts):
        X, y, base = [], [], []
        for t in ts:
            Xt, rem = features(F, L, area, A, t)
            m = rem >= MIN_REMAINING_HA
            X.append(Xt[m]); y.append(L[m, t] >= event_ha); base.append(Xt[m][:, 3])
        return np.vstack(X), np.concatenate(y), np.concatenate(base)
    Xtr, ytr, _ = stack(t_train)
    Xte, yte, bte = stack(t_test)
    info = {"event_threshold_ha": event_ha, "train_years": [FIRST_YEAR + 7, FIRST_YEAR + 19],
            "test_years": [FIRST_YEAR + 20, FIRST_YEAR + N_YEARS - 1], "n_train": int(len(ytr)), "n_test": int(len(yte)),
            "base_rate_test": round(float(yte.mean()), 4) if len(yte) else None}
    if len(set(ytr)) < 2 or len(set(yte)) < 2:
        info.update(auc=None, average_precision=None, baseline_auc=None)
    else:
        rf = make_rf().fit(Xtr, ytr)
        p = rf.predict_proba(Xte)[:, 1]
        info.update(auc=round(float(roc_auc_score(yte, p)), 3),
                    average_precision=round(float(average_precision_score(yte, p)), 3),
                    baseline_auc=round(float(roc_auc_score(yte, bte)), 3))
    # final model: all years, then score the next year (2025)
    Xall, yall, _ = stack(t_train + t_test)
    rf = make_rf().fit(Xall, yall)
    Xn, rem = features(F, L, area, A, N_YEARS)
    risk = rf.predict_proba(Xn)[:, 1]
    risk[rem < MIN_REMAINING_HA] = 0.0
    info["feature_importance"] = {k: round(float(v), 3) for k, v in zip(FEATURES, rf.feature_importances_)}
    return risk, Xn, info


def main():
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parent
    ap.add_argument("--blocks", default=str(root / "out" / "blocks.npz"))
    ap.add_argument("--out", default=str(root.parent / "web" / "public" / "data"))
    ap.add_argument("--event-ha", type=float, default=10.0, help="hectares lost in one year that count as a high-loss event")
    a = ap.parse_args()
    t0 = time.time()
    z = np.load(a.blocks, allow_pickle=False)
    names = [str(x) for x in z["districts"]]
    dist_geoms = load_districts(names)
    print(f"Source: {z['source']}  | districts: {', '.join(names)}")
    ids, F, L, dist, dnames = build_cells(z, dist_geoms)
    print(f"{len(ids)} hexagons (res {H3_RES}) in {time.time()-t0:.0f}s")
    area = np.array([h3.cell_area(c, "km^2") * 100.0 for c in ids])   # hectares
    A, nbrs = adjacency(ids)
    risk, Xn, info = train_and_score(F, L, area, A, a.event_ha)
    print("Model:", json.dumps({k: v for k, v in info.items() if k != "feature_importance"}))
    print("Feature importance:", info["feature_importance"])

    lat = np.array([h3.cell_to_latlng(c)[0] for c in ids]); lon = np.array([h3.cell_to_latlng(c)[1] for c in ids])
    synthetic = bool(z["synthetic"])
    meta = {
        "name": "CanopyWatch", "source": str(z["source"]), "synthetic": synthetic,
        "canopy_threshold_pct": int(z["canopy"]), "h3_resolution": H3_RES,
        "cell_area_ha": round(float(area.mean()), 1), "years": list(range(FIRST_YEAR, FIRST_YEAR + N_YEARS)),
        "bbox": [float(v) for v in z["bbox"]], "model": info, "risk_year": FIRST_YEAR + N_YEARS,
        "generated": time.strftime("%Y-%m-%d"), "n_cells": int(len(ids)),
        "feature_names": FEATURES,
        "attribution": "Hansen/UMD/Google/USGS/NASA (CC BY 4.0); district boundaries: geoBoundaries (CC BY 4.0); basemap: OpenStreetMap, CARTO",
    }
    data = {
        "meta": meta, "districts": dnames, "ids": [str(c) for c in ids],
        "lat": [round(float(v), 4) for v in lat], "lng": [round(float(v), 4) for v in lon],
        "forest": [round(float(v), 1) for v in F], "district": [int(v) for v in dist],
        "loss": [[round(float(v), 1) for v in row] for row in L],
        "risk": [round(float(v), 3) for v in risk],
        "feat": [[round(float(v), 4) for v in (Xn[i, 2], Xn[i, 3], Xn[i, 5])] for i in range(len(ids))],
    }
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / "hexes.json").write_text(json.dumps(data, separators=(",", ":")))
    gj = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": n}, "geometry": mapping(dist_geoms[n])} for n in dnames]}
    (out / "districts.geojson").write_text(json.dumps(gj, separators=(",", ":")))
    kb = (out / "hexes.json").stat().st_size / 1024
    print(f"Wrote {out}/hexes.json ({kb:,.0f} KB) and districts.geojson in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
