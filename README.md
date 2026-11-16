# 🌲 CanopyWatch — Forest Cover Monitor

**IEEE GeoAI Hackathon 2026 · Problem Statement 04 · Team "Top to bottom"**
U Srikar Datta (Lead) · Krishna Kumar · Aman Varun Ekka

> See where forests are vanishing, and where they will vanish next.

CanopyWatch is a web dashboard for tracking forest-cover change across the forested districts of Karnataka (the Western Ghats and Malnad, plus Chamarajanagar, Mysore, Belgaum and Dharwad)
(Kodagu, Chikmagalur, Hassan, Dakshina Kannada, Udupi, Uttara Kannada, Shimoga). It turns 30 m satellite-derived
forest data into something an officer, NGO or student can read in seconds.

**Live demo:** https://canopy-watch-three.vercel.app

## Features (mapped to the brief)

| Brief requirement | What CanopyWatch does |
|---|---|
| Map layers for forest cover in two selected years | **Swipe compare**: drag the divider to compare any BEFORE and AFTER year (2000–2024) |
| Loss hotspots highlighted by region | **Hotspots layer**: Getis-Ord Gi\* finds *statistically significant* loss clusters (90/95/99% confidence) on an H3 hex grid; Top-10 hotspot list and loss-by-district ranking |
| Statistics panel: hectares lost, % change | Live stats for the whole study area or any district, plus an annual-loss chart |
| Year selector / time slider | Two sliders, presets (All years / Last 10 / Last 5) and a ▶ play button |
| *Beyond the brief* | **Risk forecast**: a Random Forest estimates each hexagon's risk of high loss next year, with held-out validation shown in the app; click any hexagon to see *why* it is flagged; CSV export |

## How it works

```
Hansen GFC tiles ──► prepare_hansen.py ──► blocks.npz ──► build_hexes.py ──► hexes.json ──► React + Leaflet app
(30 m, 2000–2024)    window read, 1 km      (forest &       H3 res-6 hexes,    (static)       Gi* computed live in the
                     block aggregation      loss per        districts,                        browser for the chosen
                                            year)           Random Forest                     period
```

* **Forest** = tree canopy cover in 2000 ≥ 30 %. **Loss** = Hansen's stand-replacement disturbance, by year (2001–2024), counted on forest pixels.
* **Hex grid**: H3 resolution 7 (~5 km² per cell), assigned to districts using geoBoundaries ADM2 polygons.
* **Hotspots**: Getis-Ord Gi\* (Ord & Getis 1995) with binary contiguity weights over each hexagon and its two rings of neighbours (19 cells). `z ≥ 1.96` ≈ 95 % confidence.
  The reference implementation is `pipeline/gi_star.py`; the browser re-computes it for whatever period you select
  (`web/src/lib/stats.js`). `tests/check_gi.py` verifies the two agree.
* **Risk model**: `RandomForestClassifier` predicting "≥ 1.5 ha lost in this hexagon next year" from information available
  *before* that year (forest left, cumulative loss, last-3-year loss, last-year loss, neighbours' recent and cumulative loss).
  Trained on target years 2008–2020, **tested on unseen 2021–2024**, compared with a naive "same as the last 3 years" baseline. Scores for 2025 use data through 2024.
  Metrics are written to `hexes.json` and shown in the app.
* **No backend**: everything heavy is pre-computed, so the deployed site is a fast static page that cannot fail during a demo.

## Results (real data, 11 Karnataka districts)

**What happened (Hansen GFC v1.12, 2000-2024).** The study area held about 2.26 M ha of forest in 2000 and lost about 56.8 K ha (2.5%) by 2024.
Annual loss peaked in 2023 (about 5,000 ha). 1,577 of 8,142 hexagons are 99%-confidence hot spots (Getis-Ord Gi*) and hold 61% of all loss.
Dakshina Kannada lost the most forest (about 17,200 ha, 5.5% of its 2000 forest); Hassan lost the highest share (7.1%).
The seven Western Ghats / Malnad districts account for 99% of all loss; the four added districts (Chamarajanagar, Mysore, Belgaum, Dharwad) lost very little.

**Can the risk model predict it?** Trained on 2008-2020 and tested on 2021-2024, years it never saw:

| | Risk model | "Same as last 3 years" baseline |
|---|---|---|
| ROC AUC | **0.891** | 0.855 |
| Average precision | **0.447** (base rate 0.097, about 4.6x) | - |

Test set: 30,514 hexagon-years (about 2,960 high-loss events). The model is a Random Forest on 7 spatial and temporal features;
it ranks cells better than simple persistence, but it is a screening tool, not a prediction of exactly where clearing will happen.
576 hexagons carry a modelled risk above 70% for 2025, most of them in Dakshina Kannada and Udupi.

**Caveat.** Hansen "loss" is any stand-replacing tree-cover removal. In coffee, eucalyptus and acacia areas it includes plantation harvest and
replanting, not only deforestation. Read the hot spots as "where canopy is being removed", then check with imagery (Satellite basemap).

## Run it

### A. Web app only
```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in web/dist
```
The repo ships with **real Hansen data** for the eleven study districts (`web/public/data/`), so the app runs out of the box.
(`pipeline/synthetic_blocks.py` can generate a clearly labelled synthetic dataset for testing; the app then shows a red DEMO DATA banner.)

### B. Rebuild the dataset yourself (Hansen 2000–2024)
```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python pipeline/prepare_hansen.py --quick    # Kodagu + Chikmagalur, a few minutes: good first test
python pipeline/prepare_hansen.py            # full 11-district region (more data, longer)
python pipeline/build_hexes.py               # writes web/public/data/hexes.json + districts.geojson
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
pipeline/   prepare_hansen.py · synthetic_blocks.py (demo fallback) · build_hexes.py · gi_star.py · data/ (district polygons)
web/        React + Vite + Leaflet app (src/App.jsx, components/, lib/) · public/data/ (generated)
tests/      Gi* cross-check
```

## Limitations (honest notes)
* Hansen "loss" is *stand-replacement* tree-cover loss. It includes plantation harvest and fire, not only deforestation, and it does not capture gradual degradation. Forest gain is not tracked, so "change in forest" reflects loss only.
* 30 m Landsat-based data; results aggregate to ~5 km² hexagons for readability. Treat hotspots as *where to look*, not legal evidence.
* The risk model is a statistical indicator trained on past loss, not a prediction of any specific event. Its accuracy depends on the data and is reported in the app.

## Data & credits
* Hansen, M. C., et al. (2013), *High-resolution global maps of 21st-century forest cover change*, Science 342. Global Forest Change v1.12 (2000–2024), UMD / Google / USGS / NASA, **CC BY 4.0**.
* District boundaries: [geoBoundaries](https://www.geoboundaries.org) (gbOpen, ADM2), **CC BY 4.0**.
* Basemaps: © OpenStreetMap contributors; satellite imagery © Esri, Maxar, Earthstar Geographics. Built with React, Leaflet, H3, scikit-learn, rasterio.
