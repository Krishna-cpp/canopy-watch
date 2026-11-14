import { fmt } from "../lib/stats.js";
import { RAMPS, HOTSPOT_CLASSES, COLD_SPOT } from "../lib/colors.js";

export function Stat({ label, value, unit, tone }) {
  return (
    <div className={`stat ${tone || ""}`}>
      <div className="stat-value">{value}<span className="stat-unit">{unit}</span></div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** Bar chart of annual loss (ha); bars inside the selected period are highlighted. */
export function AnnualChart({ years, values, a, b }) {
  const W = 320, H = 118, padL = 4, padB = 18, padT = 20;
  const max = Math.max(1, ...values);
  const bw = (W - padL) / values.length;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Forest loss per year">
      {values.map((v, i) => {
        const h = ((H - padB - padT) * v) / max;
        const inside = years[i] > a && years[i] <= b;
        return (
          <rect key={years[i]} x={padL + i * bw + 1} y={H - padB - h} width={Math.max(1, bw - 2)} height={h}
            rx="1.5" className={inside ? "bar on" : "bar"}>
            <title>{years[i]}: {fmt(v)} ha</title>
          </rect>
        );
      })}
      {[0, 11, values.length - 1].map((k) => (
        <text key={k} x={padL + k * bw + bw / 2} y={H - 4} textAnchor={k === 0 ? "start" : k === values.length - 1 ? "end" : "middle"} className="axis">{years[k]}</text>
      ))}
      <text x={W - 2} y={9} textAnchor="end" className="axis">max {fmt(max)} ha/yr</text>
    </svg>
  );
}

const LAYERS = [
  { id: "cover", name: "Forest cover", desc: "Forest remaining in the AFTER year" },
  { id: "loss", name: "Loss", desc: "Hectares lost between the two years" },
  { id: "hotspot", name: "Hotspots", desc: "Getis-Ord Gi*: statistically significant loss clusters" },
  { id: "risk", name: "Risk forecast", desc: "Machine-learning risk of high loss in the next year" },
];
export function LayerPicker({ layer, setLayer }) {
  return (
    <div>
      <div className="seg" role="tablist">
        {LAYERS.map((l) => (
          <button key={l.id} role="tab" aria-selected={layer === l.id} className={layer === l.id ? "on" : ""} onClick={() => setLayer(l.id)}>{l.name}</button>
        ))}
      </div>
      <p className="hint">{LAYERS.find((l) => l.id === layer).desc}</p>
    </div>
  );
}

export function Legend({ layer, lossMax, riskYear }) {
  const grad = (stops) => `linear-gradient(90deg, ${stops.join(",")})`;
  return (
    <div className="legend">
      {layer === "hotspot" ? (
        <>
          {[...HOTSPOT_CLASSES, COLD_SPOT].map((c) => (
            <div key={c.label} className="legend-row"><i style={{ background: c.color }} />{c.label}</div>
          ))}
        </>
      ) : (
        <>
          <div className="legend-title">{layer === "cover" ? "Forest cover of each hexagon" : layer === "loss" ? "Forest lost (ha per hexagon)" : `Risk of high loss in ${riskYear}`}</div>
          <div className="legend-bar" style={{ background: grad(RAMPS[layer]) }} />
          <div className="legend-scale">
            <span>{layer === "cover" ? "0%" : layer === "loss" ? "0" : "low"}</span>
            <span>{layer === "cover" ? "100%" : layer === "loss" ? `${fmt(lossMax)}+` : "high"}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function TimeControls({ years, a, b, setA, setB, playing, setPlaying }) {
  const first = years[0] - 1, last = years[years.length - 1];
  return (
    <div className="time">
      <div className="time-top">
        <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play timeline"}>{playing ? "❚❚" : "▶"}</button>
        <div className="time-years"><b>{a}</b> → <b>{b}</b> <span>({b - a} years)</span></div>
        <div className="presets">
          <button onClick={() => { setA(first); setB(last); }}>All years</button>
          <button onClick={() => { setA(last - 10); setB(last); }}>Last 10</button>
          <button onClick={() => { setA(last - 5); setB(last); }}>Last 5</button>
        </div>
      </div>
      <div className="sliders">
        <label>BEFORE<input type="range" min={first} max={last - 1} value={a} onChange={(e) => { const v = +e.target.value; setA(v); if (v >= b) setB(v + 1); }} /></label>
        <label>AFTER<input type="range" min={first + 1} max={last} value={b} onChange={(e) => { const v = +e.target.value; setB(v); if (v <= a) setA(v - 1); }} /></label>
      </div>
    </div>
  );
}

export function DistrictTable({ rows, selected, onPick }) {
  const max = Math.max(1, ...rows.map((r) => r.lost));
  return (
    <div className="table">
      {rows.map((r) => (
        <button key={r.i} className={`row ${selected === r.i ? "on" : ""}`} onClick={() => onPick(r.i)}>
          <span className="row-name">{r.name}</span>
          <span className="row-bar"><i style={{ width: `${(100 * r.lost) / max}%` }} /></span>
          <span className="row-num">{fmt(r.lost)} ha <em>{fmt(r.pct, 1)}%</em></span>
        </button>
      ))}
    </div>
  );
}

export function TopCells({ cells, onPick, selected }) {
  if (!cells.length) return <p className="hint">No statistically significant hotspots in this period and area.</p>;
  return (
    <ol className="cells">
      {cells.map((c, k) => (
        <li key={c.i}>
          <button className={selected === c.i ? "on" : ""} onClick={() => onPick(c.i)}>
            <span className="rank">{k + 1}</span>
            <span className="cell-name">{c.district}<small>{c.lat.toFixed(2)}°N, {c.lng.toFixed(2)}°E</small></span>
            <span className="cell-num">{fmt(c.loss)} ha<small>z = {c.z.toFixed(1)}</small></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function CellCard({ info, onClose }) {
  if (!info) return <p className="hint">Click any hexagon on the map to see why it is flagged.</p>;
  return (
    <div className="card">
      <div className="card-head">
        <div><b>{info.district}</b><small>{info.lat.toFixed(3)}°N, {info.lng.toFixed(3)}°E · hexagon {info.id}</small></div>
        <button onClick={onClose} aria-label="Clear selection">✕</button>
      </div>
      <div className="kv">
        <span>Forest in 2000</span><b>{fmt(info.f2000)} ha</b>
        <span>Forest in {info.a}</span><b>{fmt(info.fA)} ha</b>
        <span>Forest in {info.b}</span><b>{fmt(info.fB)} ha</b>
        <span>Lost {info.a}→{info.b}</span><b>{fmt(info.loss)} ha ({fmt(info.lossPct, 1)}%)</b>
        <span>Hotspot (Gi*)</span><b>{info.hotspot}</b>
        <span>Risk in {info.riskYear}</span><b>{fmt(info.risk * 100)}% · higher than {fmt(info.riskRank * 100)}% of hexagons</b>
      </div>
      <ul className="why">{info.why.map((w, k) => <li key={k}>{w}</li>)}</ul>
    </div>
  );
}
