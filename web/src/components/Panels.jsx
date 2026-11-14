import { useState } from "react";
import { fmt } from "../lib/stats.js";
import { RAMPS, HOTSPOT_CLASSES, COLD_SPOT } from "../lib/colors.js";

export function Figure({ label, value, unit, tone }) {
  return (
    <div className={`figure ${tone || ""}`}>
      <div className="figure-value">{value}<span>{unit}</span></div>
      <div className="figure-label">{label}</div>
    </div>
  );
}

/** Annual loss. Bars inside the selected period are coloured; hover shows the exact value. */
export function AnnualChart({ years, values, a, b }) {
  const [hover, setHover] = useState(null);
  const W = 340, H = 96, padB = 16, padT = 4;
  const max = Math.max(1, ...values);
  const bw = W / values.length;
  const k = hover ?? null;
  return (
    <div>
      <div className="chart-read">
        {k != null ? <><b>{years[k]}</b> lost {fmt(values[k])} ha</> : <span>Hectares lost each year (hover a bar)</span>}
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Forest loss per year" onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 1.5 : 0, ((H - padB - padT) * v) / max);
          const inside = years[i] > a && years[i] <= b;
          return (
            <g key={years[i]} onMouseEnter={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H - padB} fill="transparent" />
              <rect x={i * bw + 1.2} y={H - padB - h} width={Math.max(1, bw - 2.4)} height={h} rx="1.2" className={`bar ${inside ? "on" : ""} ${hover === i ? "hot" : ""}`} />
            </g>
          );
        })}
        {[0, 6, 12, 18, values.length - 1].map((t) => (
          <text key={t} x={t * bw + bw / 2} y={H - 3} textAnchor={t === 0 ? "start" : t === values.length - 1 ? "end" : "middle"} className="axis">{years[t]}</text>
        ))}
      </svg>
    </div>
  );
}

const LAYERS = [
  { id: "cover", name: "Forest cover", desc: "Forest still standing in the AFTER year." },
  { id: "loss", name: "Loss", desc: "Hectares lost between the two years." },
  { id: "hotspot", name: "Hotspots", desc: "Clusters where loss is higher than chance would explain (Getis-Ord Gi*)." },
  { id: "risk", name: "Risk forecast", desc: "Modelled chance of a high-loss event in the next year." },
];

export function Legend({ layer, lossMax, riskYear }) {
  const grad = (stops) => `linear-gradient(90deg, ${stops.join(",")})`;
  if (layer === "hotspot") {
    return (
      <ul className="legend-list">
        {[...HOTSPOT_CLASSES, COLD_SPOT].map((c) => <li key={c.label}><i style={{ background: c.color }} />{c.label}</li>)}
      </ul>
    );
  }
  const lo = layer === "cover" ? "0%" : layer === "loss" ? "0 ha" : "Low";
  const hi = layer === "cover" ? "100% of hexagon" : layer === "loss" ? `${fmt(lossMax)} ha or more` : `High, ${riskYear}`;
  return (
    <div className="legend-ramp">
      <div className="legend-bar" style={{ background: grad(RAMPS[layer]) }} />
      <div className="legend-scale"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

export function LayerPicker({ layer, setLayer, lossMax, riskYear }) {
  const cur = LAYERS.find((l) => l.id === layer);
  return (
    <div>
      <div className="seg" role="tablist" aria-label="Map layer">
        {LAYERS.map((l) => (
          <button key={l.id} role="tab" aria-selected={layer === l.id} className={layer === l.id ? "on" : ""} onClick={() => setLayer(l.id)}>{l.name}</button>
        ))}
      </div>
      <p className="hint">{cur.desc}</p>
      <Legend layer={layer} lossMax={lossMax} riskYear={riskYear} />
    </div>
  );
}

/** Floating timeline: one track, two handles (BEFORE and AFTER year). */
export function TimeControls({ years, a, b, setA, setB, playing, setPlaying }) {
  const min = years[0] - 1, max = years[years.length - 1];
  const pct = (v) => ((v - min) / (max - min)) * 100;
  return (
    <div className="timebar">
      <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play through the years"}>
        {playing
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>}
      </button>
      <div className="time-main">
        <div className="time-readout">
          <span className="yr">{a}</span><span className="to">to</span><span className="yr">{b}</span><span className="span">{b - a} years</span>
        </div>
        <div className="dual">
          <div className="track" />
          <div className="fill" style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }} />
          <input className="ia" type="range" min={min} max={max} value={a} aria-label="Before year"
            onChange={(e) => setA(Math.min(+e.target.value, b - 1))} />
          <input className="ib" type="range" min={min} max={max} value={b} aria-label="After year"
            onChange={(e) => setB(Math.max(+e.target.value, a + 1))} />
        </div>
        <div className="ticks">{[min, min + 6, min + 12, min + 18, max].map((y) => <span key={y}>{y}</span>)}</div>
      </div>
      <div className="presets">
        <button onClick={() => { setA(min); setB(max); }}>All</button>
        <button onClick={() => { setA(max - 10); setB(max); }}>10 yrs</button>
        <button onClick={() => { setA(max - 5); setB(max); }}>5 yrs</button>
      </div>
    </div>
  );
}

export function DistrictTable({ rows, selected, onPick }) {
  const max = Math.max(1, ...rows.map((r) => r.lost));
  return (
    <div className="rows">
      {rows.map((r) => (
        <button key={r.i} className={`row ${selected === r.i ? "on" : ""}`} onClick={() => onPick(r.i)}>
          <span className="row-name">{r.name}</span>
          <span className="row-bar"><i style={{ width: `${(100 * r.lost) / max}%` }} /></span>
          <span className="row-num">{fmt(r.lost)} ha<small>{fmt(r.pct, 1)}% of forest</small></span>
        </button>
      ))}
    </div>
  );
}

export function TopCells({ cells, onPick, selected }) {
  if (!cells.length) return <p className="hint">No statistically significant hotspots for this period and area. Try a longer period.</p>;
  const max = Math.max(1, ...cells.map((c) => c.loss));
  return (
    <div className="rows">
      {cells.map((c, k) => (
        <button key={c.i} className={`row ${selected === c.i ? "on" : ""}`} onClick={() => onPick(c.i)}>
          <span className="rank">{k + 1}</span>
          <span className="row-name wide">{c.district}<small>{c.lat.toFixed(2)}°N, {c.lng.toFixed(2)}°E</small></span>
          <span className="row-bar"><i style={{ width: `${(100 * c.loss) / max}%` }} /></span>
          <span className="row-num">{fmt(c.loss)} ha<small>z = {c.z.toFixed(1)}</small></span>
        </button>
      ))}
    </div>
  );
}

export function CellCard({ info, onClose }) {
  if (!info) return <p className="hint">Click a hexagon on the map to see how much forest it holds, how much it lost, and why it is flagged.</p>;
  return (
    <div className="cell">
      <div className="cell-head">
        <div><b>{info.district}</b><small>{info.lat.toFixed(3)}°N, {info.lng.toFixed(3)}°E</small></div>
        <button onClick={onClose} aria-label="Clear selection">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
      </div>
      <dl className="kv">
        {info.a !== 2000 && <><dt>Forest in 2000</dt><dd>{fmt(info.f2000)} ha</dd></>}
        <dt>Forest in {info.a}</dt><dd>{fmt(info.fA)} ha</dd>
        <dt>Forest in {info.b}</dt><dd>{fmt(info.fB)} ha</dd>
        <dt>Lost in {info.a} to {info.b}</dt><dd>{fmt(info.loss)} ha ({fmt(info.lossPct, 1)}%)</dd>
        <dt>Hotspot test</dt><dd>{info.hotspot}</dd>
      </dl>
      <div className="meter">
        <div className="meter-top"><span>Risk in {info.riskYear}</span><b>{fmt(info.risk * 100)}%</b></div>
        <div className="meter-bar"><i style={{ width: `${Math.max(2, info.risk * 100)}%` }} /></div>
        <div className="meter-note">Higher than {fmt(info.riskRank * 100)}% of hexagons in the study area.</div>
      </div>
      <ul className="why">{info.why.map((w, k) => <li key={k}>{w}</li>)}</ul>
    </div>
  );
}
