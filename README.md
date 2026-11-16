# 🌲 CanopyWatch — Forest Cover Monitor

**IEEE GeoAI Hackathon 2026 · Problem Statement 04 · Team "Top to bottom"**
U Srikar Datta (Lead) · Krishna Kumar · Aman Varun Ekka

> See where forests are vanishing, and where they will vanish next.

CanopyWatch is a web dashboard for tracking forest-cover change across **all of India**, summed by the 36 states and union territories.
It turns 30 m satellite-derived forest data into something an officer, NGO or student can read in seconds. The same pipeline also runs
at a much finer 515 ha scale for any list of districts; we validated that on 24 districts of Karnataka and Kerala (see Results).

**Live demo:** https://canopy-watch-three.vercel.app

## Features (mapped to the brief)

| Brief requirement | What CanopyWatch does |
|---|---|
| Map layers for forest cover in two selected years | **Swipe compare**: drag the divider to compare any BEFORE and AFTER year (2000–2024) |
| Loss hotspots highlighted by region | **Hotspots layer**: Getis-Ord Gi\* finds *statistically significant* loss clusters (90/95/99% confidence) on an H3 hex grid; Top-10 hotspot list and loss-by-state ranking |
| Statistics panel: hectares lost, % change | Live stats for all of India or any state, plus an annual-loss chart |
| Year selector / time slider | Two sliders, presets (All years / Last 10 / Last 5) and a ▶ play button |
| *Beyond the brief* | **Risk forecast**: a Random Forest estimates each hexagon's risk of high loss next year, with held-out validation shown in the app; click any hexagon to see *why* it is flagged; CSV export |

## How it works

```
Hansen GFC tiles ──► prepare_hansen.py ──► blocks.npz ──► build_hexes.py ──► hexes.json ──► React + Leaflet app
(30 m, 2000–2024)    window read, 2 km     (forest &       H3 res-5 hexes,    (static)       Gi* computed live in the
                     block aggregation      loss per        states,                           browser for the chosen
                                            year)           Random Forest                     period
```

* **Forest** = tree canopy cover in 2000 ≥ 30 %. **Loss** = Hansen's stand-replacement disturbance, by year (2001–2024), counted on forest pixels.
* **Hex grid**: H3 resolution 5 (about 26,000 ha per cell) for the India overview, assigned to states using geoBoundaries ADM1 polygons. The detailed run uses resolution 7 (about 515 ha) and ADM2 districts.
* **Hotspots**: Getis-Ord Gi\* (Ord & Getis 1995) with binary contiguity weights over each hexagon and its two rings of neighbours (19 cells). `z ≥ 1.96` ≈ 95 % confidence.
  The reference implementation is `pipeline/gi_star.py`; the browser re-computes it for whatever period you select
  (`web/src/lib/stats.js`). `tests/check_gi.py` verifies the two agree.
* **Risk model**: `RandomForestClassifier` predicting "a high-loss year" (≥ 1.5 ha in a 515 ha cell, scaled to 73.5 ha for the 26,000 ha India cells) from information available
  *before* that year (forest left, cumulative loss, last-3-year loss, last-year loss, neighbours' recent and cumulative loss).
  Trained on target years 2008–2020, **tested on unseen 2021–2024**, compared with a naive "same as the last 3 years" baseline. Scores for 2025 use data through 2024.
  Metrics are written to `hexes.json` and shown in the app.
* **No backend**: everything heavy is pre-computed, so the deployed site is a fast static page that cannot fail during a demo.

## Results (real data)

### All of India (live app, coarse overview, 36 states and UTs)

**What happened (Hansen GFC v1.12, 2000-2024).** India held about 38.7 M ha of tree cover ("forest") in 2000 and about 36.3 M ha in 2024, a loss of about 2.44 M ha (6.3%).
Annual loss peaked in 2017 (about 189,000 ha). 529 hexagons are 99%-confidence hot spots (Getis-Ord Gi*) and hold 71% of all loss; the strongest clusters are in the North-East: the seven North-Eastern states (Mizoram, Assam, Arunachal Pradesh, Nagaland, Manipur, Meghalaya, Tripura)
hold about 76% of the loss on 42% of the forest, and 94% of the hot spots. Mizoram and Assam lost the most area (about 340,000 ha each); Tripura (21%), Nagaland (20%) and Mizoram (18%) lost the biggest share of their own forest. 588 hexagons carry a modelled risk above 70% for 2025, most of them in Mizoram.
The map uses 4,327 hexagons of about 26,000 ha each.

**Can the risk model predict it?** Trained on 2008-2020 and tested on 2021-2024, years it never saw:

| | Risk model | "Same as last 3 years" baseline |
|---|---|---|
| ROC AUC (India, 26,000 ha cells) | **0.991** | 0.977 |
| Average precision | **0.954** (base rate 0.143) | - |

Test set: 14,587 hexagon-years. At this coarse scale loss repeats in the same places, so the simple baseline is already very strong and the model adds only a little.
The harder test is the fine scale below.

### Fine scale: 24 districts of Karnataka and Kerala (515 ha cells)

The study area held about 4.87 M ha of tree cover in 2000 and lost about 165 K ha (3.4%) by 2024; loss peaked in 2023 (about 17,500 ha).
2,622 of 15,322 hexagons are 99% hot spots and hold 56% of the loss. By area, Dakshina Kannada (about 17,200 ha), Idukki (14,100) and Kollam (13,500) lost the most; Hassan lost the highest share (7.1%).
Kerala's 13 districts account for about 66% of the loss. Same train/test split:

| | Risk model | "Same as last 3 years" baseline |
|---|---|---|
| ROC AUC | **0.894** | 0.855 |
| Average precision | **0.611** (base rate 0.162, about 3.8x) | - |

Test set: 59,090 hexagon-years (about 9,600 high-loss events). The model is a Random Forest on 7 spatial and temporal features;
it ranks cells better than simple persistence, but it is a screening tool, not a prediction of exactly where clearing will happen.

**Caveat.** Hansen "loss" is any stand-replacing tree-cover removal, and "forest" here means tree canopy of at least 30%. That includes plantation and
tree-crop harvest and replanting (coffee, rubber, eucalyptus, arecanut) and shifting cultivation (jhum) in the North-East, not only deforestation.
Read hot spots as "canopy removed", and check them with imagery (Satellite basemap) or a plantation / land-cover mask (planned).

## Run it

### A. Web app only
```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in web/dist
```
The repo ships with **real Hansen data** for all of India (`web/public/data/`), so the app runs out of the box.
(`pipeline/synthetic_blocks.py` can generate a clearly labelled synthetic dataset for testing; the app then shows a red DEMO DATA banner.)

### B. Rebuild the dataset yourself (Hansen 2000–2024)
```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python pipeline/prepare_hansen.py --quick    # Kodagu + Chikmagalur, a few minutes: good first test
python pipeline/prepare_hansen.py            # default detailed region: 24 districts of Karnataka + Kerala (two Hansen tiles)
python pipeline/build_hexes.py               # writes web/public/data/hexes.json + districts.geojson

# whole India by state (14 Hansen tiles, several GB, takes a while; uses a coarse 2 km grid)
python pipeline/prepare_hansen.py --region india
python pipeline/build_hexes.py --region india   # writes web/public/data/india/; copy its two files to web/public/data/ to make India the main view
cd web && npm run build
```
`prepare_hansen.py` reads only your study-area window from Google Cloud Storage, so there is no multi-GB download and no
Earth Engine login. Other options: `--districts "Kodagu,Hassan"`, `--bbox W S E N`, `--canopy 30`, `--local-dir <folder>`
(if you downloaded the tiles manually from the [Hansen download page](https://storage.googleapis.com/earthenginepartners-hansen/GFC-2024-v1.12/download.html)).

### C. Tests
```bash
python tests/check_gi.py        # browser Gi* == Python Gi*
```

## Deploy (static site, any of these)

* **Vercel**: import the repo → *Root Directory* `web` → framework *Vite* (build `npm run build`, output `dist`).
* **Netlify**: base directory `web`, build command `npm run build`, publish directory `web/dist` (or drag-and-drop the `web/dist` folder at app.netlify.com/drop).
* **GitHub Pages**: Settings → Pages → Source: *GitHub Actions*; the included workflow `.github/workflows/pages.yml` does the rest.

## Project layout
```
pipeline/   prepare_hansen.py · synthetic_blocks.py (demo fallback) · build_hexes.py · gi_star.py · data/ (district and state polygons)
web/        React + Vite + Leaflet app (src/App.jsx, components/, lib/) · public/data/ (generated)
tests/      Gi* cross-check
```

## Limitations (honest notes)
* Hansen "loss" is *stand-replacement* tree-cover loss. It includes plantation harvest and fire, not only deforestation, and it does not capture gradual degradation. Forest gain is not tracked, so "change in forest" reflects loss only. In the India overview, state-level cells are large, so use the 515 ha district run for local detail.
* 30 m Landsat-based data; results aggregate to hexagons (about 515 ha for districts, 26,000 ha for the India overview) for readability. Treat hotspots as *where to look*, not legal evidence.
* The risk model is a statistical indicator trained on past loss, not a prediction of any specific event. Its accuracy depends on the data and is reported in the app.

## Data & credits
* Hansen, M. C., et al. (2013), *High-resolution global maps of 21st-century forest cover change*, Science 342. Global Forest Change v1.12 (2000–2024), UMD / Google / USGS / NASA, **CC BY 4.0**.
* State and district boundaries: [geoBoundaries](https://www.geoboundaries.org) (gbOpen, ADM1 and ADM2), **CC BY 4.0**.
* Basemaps: © OpenStreetMap contributors; satellite imagery © Esri, Maxar, Earthstar Geographics. Built with React, Leaflet, H3, scikit-learn, rasterio.
