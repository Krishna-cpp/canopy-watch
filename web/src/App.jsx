import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import SwipeMap from "./components/SwipeMap.jsx";
import { Stat, AnnualChart, LayerPicker, Legend, TimeControls, DistrictTable, TopCells, CellCard } from "./components/Panels.jsx";
import { loadData, forestAt, lossBetween, BASE_YEAR } from "./lib/data.js";
import { giStar, percentRank, fmt } from "./lib/stats.js";
import { ramp, RAMPS, hotspotColor } from "./lib/colors.js";

const median = (arr) => { const s = Float64Array.from(arr).sort(); return s.length ? s[s.length >> 1] : 0; };

export default function App() {
  const [D, setD] = useState(null);
  const [error, setError] = useState(null);
  const [a, setA] = useState(BASE_YEAR);
  const [b, setB] = useState(2024);
  const [layer, setLayer] = useState("cover");
  const [district, setDistrict] = useState(-1);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState("cells");

  useEffect(() => { loadData().then(setD).catch((e) => setError(e.message)); }, []);

  // play: sweep the AFTER year from a+1 to the last year
  useEffect(() => {
    if (!playing || !D) return;
    const last = D.meta.years[D.Y - 1];
    const id = setInterval(() => setB((cur) => { if (cur >= last) { setPlaying(false); return cur; } return cur + 1; }), 650);
    if (b >= last) setB(a + 1);
    return () => clearInterval(id);
  }, [playing]); // eslint-disable-line

  const calc = useMemo(() => {
    if (!D) return null;
    const { n, meta } = D;
    const area = meta.cell_area_ha;
    const fA = new Float64Array(n), fB = new Float64Array(n), loss = new Float64Array(n);
    for (let i = 0; i < n; i++) { fA[i] = forestAt(D, i, a); fB[i] = forestAt(D, i, b); loss[i] = lossBetween(D, i, a, b); }
    const z = giStar(loss, D.nbrs);
    const pos = Array.from(loss).filter((v) => v > 0).sort((x, y) => x - y);
    const lossMax = pos.length ? pos[Math.floor(pos.length * 0.95)] : 1;
    const left = new Array(n), right = new Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = fA[i] > 0 ? ramp(RAMPS.cover, fA[i] / area) : null;
      if (layer === "cover") right[i] = fB[i] > 0 ? ramp(RAMPS.cover, fB[i] / area) : null;
      else if (layer === "loss") right[i] = loss[i] > 0 ? ramp(RAMPS.loss, Math.sqrt(loss[i] / lossMax)) : null;
      else if (layer === "hotspot") right[i] = loss[i] > 0 || z[i] <= -1.96 ? hotspotColor(z[i]) : null;
      else right[i] = fB[i] >= 50 ? ramp(RAMPS.risk, D.risk[i]) : null;
    }
    // filtered statistics
    const inD = (i) => district < 0 || D.district[i] === district;
    let sA = 0, sB = 0, sL = 0;
    const annual = new Array(D.Y).fill(0);
    for (let i = 0; i < n; i++) if (inD(i)) {
      sA += fA[i]; sB += fB[i]; sL += loss[i];
      for (let k = 0; k < D.Y; k++) annual[k] += D.loss[i][k];
    }
    const dRows = D.districts.map((name, j) => {
      let f = 0, l = 0;
      for (let i = 0; i < n; i++) if (D.district[i] === j) { f += fA[i]; l += loss[i]; }
      return { i: j, name, lost: l, pct: f > 0 ? (100 * l) / f : 0 };
    }).filter((r) => r.lost > 0).sort((x, y) => y.lost - x.lost);
    const top = [];
    for (let i = 0; i < n; i++) if (inD(i) && z[i] >= 1.65 && loss[i] > 0) top.push(i);
    top.sort((x, y) => z[y] - z[x] || loss[y] - loss[x]);
    const topCells = top.slice(0, 10).map((i) => ({ i, z: z[i], loss: loss[i], district: D.districts[D.district[i]], lat: D.lat[i], lng: D.lng[i] }));
    const riskSorted = Float64Array.from(D.risk).sort();
    const feat = [0, 1, 2].map((c) => median(D.feat.map((f) => f[c])));
    return { fA, fB, loss, z, left, right, lossMax, sA, sB, sL, annual, dRows, topCells, riskSorted, feat, avgLoss: median(Array.from(loss).filter((v) => v > 0)) };
  }, [D, a, b, layer, district]);

  const cellInfo = useMemo(() => {
    if (!D || !calc || selected == null) return null;
    const i = selected, z = calc.z[i], f = D.feat[i];
    const area = D.meta.cell_area_ha;
    const hot = z >= 2.58 ? `99% confidence hot spot (z = ${z.toFixed(1)})` : z >= 1.96 ? `95% confidence hot spot (z = ${z.toFixed(1)})` : z >= 1.65 ? `90% confidence hot spot (z = ${z.toFixed(1)})` : z <= -1.96 ? `cold spot (z = ${z.toFixed(1)})` : `not significant (z = ${z.toFixed(1)})`;
    const why = [];
    const nbAvg = D.nbrs[i].filter((j) => j !== i).reduce((s, j) => s + calc.loss[j], 0) / Math.max(1, D.nbrs[i].length - 1);
    why.push(`Lost ${fmt(calc.loss[i])} ha in ${a}–${b}; its neighbouring hexagons averaged ${fmt(nbAvg)} ha. Hot spots need both high loss here and high loss around.`);
    why.push(`Risk drivers: last 3 years lost ${fmt(f[1] * 100, 1)}% of the original forest (region median ${fmt(calc.feat[1] * 100, 1)}%); ${fmt(f[0] * 100, 1)}% lost since 2000 (median ${fmt(calc.feat[0] * 100, 1)}%); neighbours' recent loss ${fmt(f[2] * 100, 2)} ha per 100 ha (median ${fmt(calc.feat[2] * 100, 2)}).`);
    return {
      id: D.ids[i], lat: D.lat[i], lng: D.lng[i], district: D.districts[D.district[i]], f2000: D.forest[i], fA: calc.fA[i], fB: calc.fB[i],
      loss: calc.loss[i], lossPct: calc.fA[i] > 0 ? (100 * calc.loss[i]) / calc.fA[i] : 0, hotspot: hot, risk: D.risk[i],
      riskRank: percentRank(calc.riskSorted, D.risk[i]), riskYear: D.meta.risk_year, a, b, why,
    };
  }, [D, calc, selected, a, b]);

  const pickCell = (i) => { setSelected(i); setFocus({ latlng: [D.lat[i], D.lng[i]], n: Math.random() }); };
  const pickDistrict = (j) => {
    setDistrict(j);
    if (j < 0) { const [w, s, e, n] = D.meta.bbox; setFocus({ bounds: [[s, w], [n, e]], n: Math.random() }); return; }
    const pts = []; for (let i = 0; i < D.n; i++) if (D.district[i] === j) pts.push([D.lat[i], D.lng[i]]);
    if (pts.length) setFocus({ bounds: L.latLngBounds(pts).pad(0.15), n: Math.random() });
  };

  const tooltip = (i) => {
    if (!calc) return "";
    const r = layer === "hotspot" ? `Gi* z = ${calc.z[i].toFixed(1)}` : layer === "risk" ? `risk ${fmt(D.risk[i] * 100)}%` : `${fmt(calc.loss[i])} ha lost`;
    return `<b>${D.districts[D.district[i]]}</b><br/>Forest ${a}: ${fmt(calc.fA[i])} ha · ${b}: ${fmt(calc.fB[i])} ha<br/>${r}`;
  };

  const exportCsv = () => {
    const rows = [["hex_id", "district", "lat", "lng", `forest_ha_${a}`, `forest_ha_${b}`, `loss_ha_${a}_${b}`, "gi_star_z", `risk_${D.meta.risk_year}`]];
    for (let i = 0; i < D.n; i++) if (district < 0 || D.district[i] === district)
      rows.push([D.ids[i], D.districts[D.district[i]], D.lat[i], D.lng[i], calc.fA[i].toFixed(1), calc.fB[i].toFixed(1), calc.loss[i].toFixed(1), calc.z[i].toFixed(2), D.risk[i]]);
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `canopywatch_${a}_${b}.csv`; el.click();
  };

  if (error) return <div className="boot err"><h2>CanopyWatch could not load its data</h2><p>{error}</p></div>;
  if (!D || !calc) return <div className="boot"><div className="spinner" />Loading forest data…</div>;

  const m = D.meta, md = m.model;
  const pct = calc.sA > 0 ? (100 * (calc.sB - calc.sA)) / calc.sA : 0;
  const scope = district < 0 ? "all study districts" : D.districts[district];

  return (
    <div className="app">
      <header>
        <div className="brand">
          <svg width="30" height="30" viewBox="0 0 100 100"><polygon points="25,6 75,6 100,50 75,94 25,94 0,50" fill="#2f8f4e" /><polygon points="50,28 70,62 30,62" fill="#b6e04a" /></svg>
          <div><h1>CanopyWatch</h1><p>Forest Cover Monitor · Karnataka's Western Ghats</p></div>
        </div>
        <div className="head-meta">
          <span>{m.source}</span>
          <span>canopy ≥ {m.canopy_threshold_pct}% · {m.n_cells} hexagons (≈{fmt(m.cell_area_ha)} ha each)</span>
        </div>
      </header>
      {m.synthetic && <div className="demo-banner">⚠ DEMO DATA — this build uses synthetic numbers so the app can be tested. Run the data pipeline with real Hansen data (see README) before presenting results.</div>}

      <main>
        <section className="map-col">
          <SwipeMap D={D} leftColors={calc.left} rightColors={calc.right} selected={selected} onSelect={pickCell} focus={focus} tooltip={tooltip}
            leftLabel={`BEFORE · ${a}`} rightLabel={`AFTER · ${b}`}>
            <Legend layer={layer} lossMax={calc.lossMax} riskYear={m.risk_year} />
          </SwipeMap>
          <TimeControls years={m.years} a={a} b={b} setA={setA} setB={setB} playing={playing} setPlaying={setPlaying} />
        </section>

        <aside>
          <div className="panel">
            <label className="select">Region
              <select value={district} onChange={(e) => pickDistrict(+e.target.value)}>
                <option value={-1}>All study districts</option>
                {D.districts.map((n, j) => <option key={n} value={j}>{n}</option>)}
              </select>
            </label>
            <div className="stats">
              <Stat label={`Forest in ${a}`} value={fmt(calc.sA)} unit=" ha" />
              <Stat label={`Forest in ${b}`} value={fmt(calc.sB)} unit=" ha" />
              <Stat label="Hectares lost" value={fmt(calc.sL)} unit=" ha" tone="loss" />
              <Stat label="Change in forest" value={`${pct > 0 ? "+" : ""}${fmt(pct, 1)}`} unit="%" tone="loss" />
            </div>
            <h3>Forest loss per year · {scope}</h3>
            <AnnualChart years={m.years} values={calc.annual} a={a} b={b} />
          </div>

          <div className="panel">
            <h3>Map layer (AFTER side)</h3>
            <LayerPicker layer={layer} setLayer={setLayer} />
          </div>

          <div className="panel">
            <div className="tabs">
              <button className={tab === "cells" ? "on" : ""} onClick={() => setTab("cells")}>Top 10 hotspots</button>
              <button className={tab === "districts" ? "on" : ""} onClick={() => setTab("districts")}>Loss by district</button>
            </div>
            {tab === "cells" ? <TopCells cells={calc.topCells} onPick={pickCell} selected={selected} /> : <DistrictTable rows={calc.dRows} selected={district} onPick={pickDistrict} />}
          </div>

          <div className="panel">
            <h3>Selected area</h3>
            <CellCard info={cellInfo} onClose={() => setSelected(null)} />
          </div>

          <div className="panel small">
            <h3>About the risk model</h3>
            <p>Random Forest trained on {md.train_years[0]}–{md.train_years[1]}, tested on unseen years {md.test_years[0]}–{md.test_years[1]}
              {m.synthetic ? " (demo data: scores are not meaningful)" : ""}:
              {" "}{md.auc != null ? <>AUC <b>{md.auc}</b> vs <b>{md.baseline_auc}</b> for a “same as last 3 years” baseline.</> : "not enough variation to evaluate."}
              {" "}A high-loss event = ≥ {md.event_threshold_ha} ha lost in a hexagon in one year.</p>
            <button className="btn" onClick={exportCsv}>⬇ Download data for {scope} (CSV)</button>
            <p className="credit">{m.attribution}</p>
          </div>
        </aside>
      </main>
    </div>
  );
}
