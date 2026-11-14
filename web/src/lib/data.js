import { cellToBoundary, gridDisk } from "h3-js";

export const BASE_YEAR = 2000; // tree cover baseline year in the Hansen data

/** Load hexes.json and precompute geometry, neighbours and cumulative loss. */
export async function loadData() {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}data/hexes.json`);
  if (!res.ok) throw new Error(`Could not load data/hexes.json (HTTP ${res.status}). Run the pipeline first.`);
  const d = await res.json();
  let districtsGeo = null;
  try { districtsGeo = await (await fetch(`${base}data/districts.geojson`)).json(); } catch { /* optional */ }

  const n = d.ids.length;
  const Y = d.meta.years.length;
  const stride = Y + 1;
  const index = new Map(d.ids.map((id, i) => [id, i]));
  const bounds = d.ids.map((id) => cellToBoundary(id)); // [[lat,lng], ...]
  const nbrs = d.ids.map((id) => gridDisk(id, 1).map((c) => index.get(c)).filter((j) => j !== undefined));
  // cum[i*stride + k] = hectares lost between 2001 and (2000 + k), inclusive
  const cum = new Float32Array(n * stride);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < Y; k++) { s += d.loss[i][k]; cum[i * stride + k + 1] = s; }
  }
  return { ...d, n, Y, stride, bounds, nbrs, cum, districtsGeo };
}

/** Forest area (ha) of cell i at the end of `year` (2000..2024). */
export const forestAt = (D, i, year) => Math.max(0, D.forest[i] - D.cum[i * D.stride + (year - BASE_YEAR)]);
/** Hectares lost in cell i during years (a, b], i.e. a+1 .. b. */
export const lossBetween = (D, i, a, b) => D.cum[i * D.stride + (b - BASE_YEAR)] - D.cum[i * D.stride + (a - BASE_YEAR)];
