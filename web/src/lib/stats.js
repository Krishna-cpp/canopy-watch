// Getis-Ord Gi* (Ord & Getis, 1995) with binary contiguity weights.
// nbrs[i] must include i itself. Mirrors pipeline/gi_star.py (checked by tests/check_gi.*).
export function giStar(values, nbrs) {
  const n = values.length;
  const z = new Float64Array(n);
  let sum = 0, sum2 = 0;
  for (let i = 0; i < n; i++) { sum += values[i]; sum2 += values[i] * values[i]; }
  const mean = sum / n;
  const s = Math.sqrt(sum2 / n - mean * mean);
  if (!(s > 0) || n < 3) return z;
  for (let i = 0; i < n; i++) {
    const nb = nbrs[i];
    const w = nb.length;
    let acc = 0;
    for (let k = 0; k < w; k++) acc += values[nb[k]];
    const den = s * Math.sqrt((n * w - w * w) / (n - 1));
    z[i] = den > 0 ? (acc - mean * w) / den : 0;
  }
  return z;
}

export function percentRank(sortedAsc, v) {
  // share of values strictly below v
  let lo = 0, hi = sortedAsc.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sortedAsc[m] < v) lo = m + 1; else hi = m; }
  return sortedAsc.length ? lo / sortedAsc.length : 0;
}

export const fmt = (v, d = 0) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
