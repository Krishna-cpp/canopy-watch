import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import SwipeMap from "./components/SwipeMap.jsx";
import { Figure, AnnualChart, LayerPicker, TimeControls, DistrictTable, TopCells, CellCard } from "./components/Panels.jsx";
import { loadData, forestAt, lossBetween, BASE_YEAR } from "./lib/data.js";
import { giStar, percentRank, fmt, compact } from "./lib/stats.js";
import { ramp, RAMPS, hotspotColor } from "./lib/colors.js";

const median = (arr) => { const s = Float64Array.from(arr).sort(); return s.length ? s[s.length >> 1] : 0; };
const LAYER_NAME = { cover: "Forest cover", loss: "Loss", hotspot: "Hotspots", risk: "Risk forecast" };

export default function App() {
  const [D, setD] = useState(null);
  const [error, setError] = useState(null);
  const [a, setA] = useState(BASE_YEAR);
  const [b, setB] = useState(2024);
  const [layer, setLayer] = useState("hotspot");
  const [district, setDistrict] = useState(-1);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState("cells");
  const [tour, setTour] = useState(null);

  useEffect(() => { loadData().then(setD).catch((e) => setError(e.message)); }, []);

  // play: sweep the AFTER year forward to the last year
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
    const z = giStar(loss, D.nbrsGi);
    const posLoss = Array.from(loss).filter((v) => v > 0.05).sort((x, y) => x - y);
    const lossMax = posLoss.length ? Math.max(1, Math.round(posLoss[Math.floor(posLoss.length * 0.95)])) : 1;
    const left = new Array(n), right = new Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = fA[i] > 0.5 ? ramp(RAMPS.cover, fA[i] / area) : null;
      if (layer === "cover") right[i] = fB[i] > 0.5 ? ramp(RAMPS.cover, fB[i] / area) : null;
      else if (layer === "loss") right[i] = loss[i] > 0.05 ? ramp(RAMPS.loss, Math.sqrt(loss[i] / lossMax)) : null;
      else if (layer === "hotspot") right[i] = loss[i] > 0.05 || z[i] <= -1.96 ? hotspotColor(z[i]) : null;
      else right[i] = fB[i] >= 15 ? ramp(RAMPS.risk, D.risk[i]) : null;
    }
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
    let hot99 = 0, hot99Loss = 0, riskHigh = 0;
    const riskByDist = new Array(D.districts.length).fill(0);
    for (let i = 0; i < n; i++) if (inD(i)) {
      if (z[i] >= 1.65 && loss[i] > 0.05) top.push(i);
      if (z[i] >= 2.58 && loss[i] > 0.05) { hot99++; hot99Loss += loss[i]; }
      if (D.risk[i] >= 0.7 && fB[i] >= 15) { riskHigh++; riskByDist[D.district[i]]++; }
    }
    top.sort((x, y) => z[y] - z[x] || loss[y] - loss[x]);
    const topCells = top.slice(0, 10).map((i) => ({ i, z: z[i], loss: loss[i], district: D.districts[D.district[i]], lat: D.lat[i], lng: D.lng[i] }));
    let peak = -1, peakV = 0;
    for (let k = 0; k < D.Y; k++) { const y = meta.years[k]; if (y > a && y <= b && annual[k] > peakV) { peakV = annual[k]; peak = y; } }
    const riskTop = riskByDist.indexOf(Math.max(...riskByDist));
    const riskSorted = Float64Array.from(D.risk).sort();
    const feat = [0, 1, 2].map((c) => median(D.feat.map((f) => f[c])));
    return { fA, fB, loss, z, left, right, lossMax, sA, sB, sL, annual, dRows, topCells, riskSorted, feat, hot99, hot99Loss, riskHigh, riskTopName: riskHigh ? D.districts[riskTop] : null, peak, peakV };
  }, [D, a, b, layer, district]);

  const cellInfo = useMemo(() => {
    if (!D || !calc || selected == null) return null;
    const i = selected, z = calc.z[i], f = D.feat[i];
    const hot = z >= 2.58 ? `99% hot spot (z = ${z.toFixed(1)})` : z >= 1.96 ? `95% hot spot (z = ${z.toFixed(1)})` : z >= 1.65 ? `90% hot spot (z = ${z.toFixed(1)})` : z <= -1.96 ? `Cold spot (z = ${z.toFixed(1)})` : `Not significant (z = ${z.toFixed(1)})`;
    const nbIdx = D.nbrs[i].filter((j) => j !== i);
    const nbAvg = nbIdx.reduce((s, j) => s + calc.loss[j], 0) / Math.max(1, nbIdx.length);
    const why = [
      `It lost ${fmt(calc.loss[i], 1)} ha in ${a} to ${b}; the hexagons around it averaged ${fmt(nbAvg, 1)} ha. A hot spot needs high loss here and high loss nearby.`,
      `For the risk score: the last 3 years removed ${fmt(f[1] * 100, 1)}% of its original forest (study-area median ${fmt(calc.feat[1] * 100, 1)}%), and ${fmt(f[0] * 100, 1)}% has gone since 2000 (median ${fmt(calc.feat[0] * 100, 1)}%).`,
    ];
    return {
      id: D.ids[i], lat: D.lat[i], lng: D.lng[i], district: D.districts[D.district[i]], f2000: D.forest[i], fA: calc.fA[i], fB: calc.fB[i],
      loss: calc.loss[i], lossPct: calc.fA[i] > 0 ? (100 * calc.loss[i]) / calc.fA[i] : 0, hotspot: hot, risk: D.risk[i],
      riskRank: percentRank(calc.riskSorted, D.risk[i]), riskYear: D.meta.risk_year, a, b, why,
    };
  }, [D, calc, selected, a, b]);

  const pickCell = (i) => { setSelected(i); setFocus({ latlng: [D.lat[i], D.lng[i]], n: Math.random() }); };
  const pickDistrict = (j) => {
    setDistrict(j); setSelected(null);
    if (j < 0) { const [w, s, e, n] = D.meta.bbox; setFocus({ bounds: [[s, w], [n, e]], n: Math.random() }); return; }
    const pts = []; for (let i = 0; i < D.n; i++) if (D.district[i] === j) pts.push([D.lat[i], D.lng[i]]);
    if (pts.length) setFocus({ bounds: L.latLngBounds(pts).pad(0.15), n: Math.random() });
  };

  const tooltip = (i) => {
    if (!calc) return "";
    const r = layer === "hotspot" ? `Gi* z = ${calc.z[i].toFixed(1)}` : layer === "risk" ? `${fmt(D.risk[i] * 100)}% risk in ${D.meta.risk_year}` : `${fmt(calc.loss[i], 1)} ha lost`;
    return `<b>${D.districts[D.district[i]]}</b><span>${a}: ${fmt(calc.fA[i])} ha &nbsp; ${b}: ${fmt(calc.fB[i])} ha</span><span>${r}</span>`;
  };

  const exportCsv = () => {
    const rows = [["hex_id", "district", "lat", "lng", `forest_ha_${a}`, `forest_ha_${b}`, `loss_ha_${a}_${b}`, "gi_star_z", `risk_${D.meta.risk_year}`]];
    for (let i = 0; i < D.n; i++) if (district < 0 || D.district[i] === district)
      rows.push([D.ids[i], D.districts[D.district[i]], D.lat[i], D.lng[i], calc.fA[i].toFixed(1), calc.fB[i].toFixed(1), calc.loss[i].toFixed(1), calc.z[i].toFixed(2), D.risk[i]]);
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `canopywatch_${a}_${b}.csv`; el.click();
  };

  const TOUR = [
    { title: "See it", text: "Left is the forest in 2000. Right shows the same forest as the years pass. Drag the divider to compare." },
    { title: "Pinpoint it", text: "Getis-Ord Gi* tests which loss clusters are statistically significant. Red cells are 99% hot spots; they hold most of the loss." },
    { title: "Explain one cell", text: "Every hexagon is about 520 ha. Click one to see its forest, its loss, and why it was flagged." },
    { title: "Predict it", text: "A Random Forest scores each cell for next year. Tested on years it never saw, it beats the simple baseline." },
  ];
  const goTour = (k) => {
    if (k < 0 || k >= TOUR.length) { setTour(null); setPlaying(false); return; }
    setTour(k); setPlaying(false); setDistrict(-1); setSelected(null); setA(BASE_YEAR);
    const [w, s0, e, n] = D.meta.bbox; setFocus({ bounds: [[s0, w], [n, e]], n: Math.random() });
    if (k === 0) { setLayer("cover"); setB(BASE_YEAR + 1); setTimeout(() => setPlaying(true), 50); }
    else if (k === 1) { setLayer("hotspot"); setB(2024); }
    else if (k === 2) { setLayer("hotspot"); setB(2024); const t = calc.topCells[0]; if (t) setTimeout(() => { pickCell(t.i); setTimeout(() => document.getElementById("selected-cell")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150); }, 50); }
    else { setLayer("risk"); setB(2024); }
  };
  useEffect(() => {
    if (tour == null) return;
    const h = (e) => { if (e.key === "Escape") goTour(-1); else if (e.key === "ArrowRight") goTour(tour + 1); else if (e.key === "ArrowLeft" && tour > 0) goTour(tour - 1); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }); // eslint-disable-line

  if (error) return <div className="boot err"><h2>CanopyWatch could not load its data</h2><p>{error}</p></div>;
  if (!D || !calc) return <div className="boot"><div className="spinner" />Loading forest data</div>;

  const m = D.meta, md = m.model;
  const pct = calc.sA > 0 ? (100 * calc.sL) / calc.sA : 0;
  const scope = district < 0 ? "the study area" : D.districts[district];
  const hotShare = calc.sL > 0 ? (100 * calc.hot99Loss) / calc.sL : 0;

  return (
    <div className="app">
      <section className="stage">
        <SwipeMap D={D} leftColors={calc.left} rightColors={calc.right} selected={selected} onSelect={pickCell} focus={focus} tooltip={tooltip}
          leftLabel={<>Before<b>{a}</b></>} rightLabel={<>After<b>{b}</b><em>{LAYER_NAME[layer]}</em></>}>
          <TimeControls years={m.years} a={a} b={b} setA={setA} setB={setB} playing={playing} setPlaying={setPlaying} />
        </SwipeMap>
        {tour == null ? (
          <button className="tour-start" onClick={() => goTour(0)}>Take the 1-minute tour</button>
        ) : (
          <div className="tour-card" role="dialog" aria-label="Guided tour">
            <div className="tour-step">Step {tour + 1} of {TOUR.length}</div>
            <h3>{TOUR[tour].title}</h3>
            <p>{TOUR[tour].text}</p>
            <div className="tour-actions">
              <button className="btn ghost" onClick={() => goTour(-1)}>Exit</button>
              <span />
              {tour > 0 && <button className="btn ghost" onClick={() => goTour(tour - 1)}>Back</button>}
              <button className="btn" onClick={() => goTour(tour + 1)}>{tour === TOUR.length - 1 ? "Finish" : "Next"}</button>
            </div>
          </div>
        )}
      </section>

      <aside className="side">
        <div className="brand">
          <svg width="34" height="34" viewBox="0 0 100 100" aria-hidden="true"><polygon points="25,6 75,6 100,50 75,94 25,94 0,50" fill="#1f7a45" /><path d="M50 24c14 10 20 24 14 40-4 2-9 2-14-2-5 4-10 4-14 2-6-16 0-30 14-40z" fill="#e3efc6" /></svg>
          <div><h1>CanopyWatch</h1><p>Forest cover change in Karnataka and Kerala</p></div>
        </div>

        {m.synthetic && <div className="demo"><b>Demo data.</b> These numbers are synthetic. Run the pipeline on real Hansen data before presenting.</div>}

        <section className="block">
          <label className="select"><span>Region</span>
            <select value={district} onChange={(e) => pickDistrict(+e.target.value)}>
              <option value={-1}>All study districts</option>
              {D.districts.map((n, j) => <option key={n} value={j}>{n}</option>)}
            </select>
          </label>
          <p className="lead">
            {calc.sL > 0
              ? <>From {a} to {b}, {scope} lost <strong>{compact(calc.sL)} ha</strong> of forest, {fmt(pct, 1)}% of what stood in {a}.</>
              : <>From {a} to {b}, {scope} lost no mapped forest.</>}
          </p>
          <ul className="notes">
            {calc.peak > 0 && <li>Loss peaked in <b>{calc.peak}</b> at {fmt(calc.peakV)} ha.</li>}
            {calc.hot99 > 0 && <li><b>{fmt(calc.hot99)}</b> hexagons are 99% hot spots and hold {fmt(hotShare)}% of all loss.</li>}
            {calc.riskHigh > 0 && <li><b>{fmt(calc.riskHigh)}</b> hexagons carry a modelled risk above 70% for {m.risk_year}, most in {calc.riskTopName}.</li>}
          </ul>
        </section>

        <section className="block">
          <div className="figures">
            <Figure label={`Forest in ${a}`} value={compact(calc.sA)} unit=" ha" />
            <Figure label={`Forest in ${b}`} value={compact(calc.sB)} unit=" ha" />
            <Figure label="Lost" value={compact(calc.sL)} unit=" ha" tone="loss" />
            <Figure label="Change" value={`−${fmt(pct, 1)}`} unit="%" tone="loss" />
          </div>
          <AnnualChart years={m.years} values={calc.annual} a={a} b={b} />
        </section>

        <section className="block">
          <h2>Map layer</h2>
          <LayerPicker layer={layer} setLayer={setLayer} lossMax={calc.lossMax} riskYear={m.risk_year} />
        </section>

        <section className="block">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "cells"} className={tab === "cells" ? "on" : ""} onClick={() => setTab("cells")}>Top hotspots</button>
            <button role="tab" aria-selected={tab === "districts"} className={tab === "districts" ? "on" : ""} onClick={() => setTab("districts")}>Loss by district</button>
          </div>
          {tab === "cells" ? <TopCells cells={calc.topCells} onPick={pickCell} selected={selected} /> : <DistrictTable rows={calc.dRows} selected={district} onPick={pickDistrict} />}
        </section>

        <section className="block" id="selected-cell">
          <h2>Selected hexagon</h2>
          <CellCard info={cellInfo} onClose={() => setSelected(null)} />
        </section>

        <details className="block about">
          <summary>How this works</summary>
          <p>Forest is tree canopy of at least {m.canopy_threshold_pct}% in 2000, from Hansen's 30 m global forest change data. Loss is the year a forest pixel was cleared. Pixels are summed into {m.n_cells.toLocaleString("en-US")} hexagons of about {fmt(m.cell_area_ha)} ha.</p>
          <p>Hotspots use the Getis-Ord Gi* statistic over each hexagon and its neighbours within {m.gi_ring || 1} {(m.gi_ring || 1) === 1 ? "ring" : "rings"}.</p>
          <p>The risk score is a Random Forest trained on {md.train_years[0]} to {md.train_years[1]} and tested on unseen years {md.test_years[0]} to {md.test_years[1]}{m.synthetic ? " (demo data, so the scores mean nothing)" : ""}.
            {md.auc != null ? <> It scored AUC <b>{md.auc}</b>; a plain "same as the last 3 years" rule scored <b>{md.baseline_auc}</b>.</> : " There was too little variation to test it."}
            {" "}A high-loss event is {md.event_threshold_ha} ha or more lost in one hexagon in one year.</p>
          <button className="btn" onClick={exportCsv}>Download data for {scope} (CSV)</button>
          <p className="credit">{m.attribution}</p>
        </details>
      </aside>
    </div>
  );
}
