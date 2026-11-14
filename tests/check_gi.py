#!/usr/bin/env python3
"""Cross-check: the browser's Getis-Ord Gi* (web/src/lib/stats.js) must equal the Python reference (pipeline/gi_star.py)."""
import json, subprocess, sys
from pathlib import Path
import h3, numpy as np
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from gi_star import gi_star

d = json.loads((ROOT / "web/public/data/hexes.json").read_text())
ids = d["ids"]; idx = {c: i for i, c in enumerate(ids)}
nbrs = [np.array([idx[c] for c in h3.grid_disk(i, 1) if c in idx]) for i in ids]
L = np.array(d["loss"])
cases = {"all": L.sum(1), "last10": L[:, -10:].sum(1), "2005_2012": L[:, 4:12].sum(1)}
payload = {"nbrs": [n.tolist() for n in nbrs], "cases": {k: v.tolist() for k, v in cases.items()},
           "expected": {k: gi_star(v, nbrs).tolist() for k, v in cases.items()}}
tmp = ROOT / "tests" / "_gi_payload.json"; tmp.write_text(json.dumps(payload))
r = subprocess.run(["node", str(ROOT / "tests" / "check_gi.mjs"), str(tmp)], capture_output=True, text=True)
tmp.unlink(missing_ok=True)
print(r.stdout.strip() or r.stderr.strip()); sys.exit(r.returncode)
