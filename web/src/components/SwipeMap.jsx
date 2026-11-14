import { useEffect, useRef, useState } from "react";
import L from "leaflet";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
export const BASES = {
  light: { label: "Light", url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, attr: "Esri, HERE, Garmin, © OpenStreetMap contributors", maxNativeZoom: 16 },
  sat: { label: "Satellite", url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attr: "Imagery © Esri, Maxar, Earthstar Geographics", maxNativeZoom: 17 },
  streets: { label: "Streets", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap contributors", maxNativeZoom: 19 },
};

/**
 * Two synchronised Leaflet maps stacked on top of each other. The top map (BEFORE) is clipped with
 * CSS clip-path up to the draggable divider, the bottom map (AFTER) shows through on the right.
 */
export default function SwipeMap({ D, leftColors, rightColors, selected, onSelect, focus, tooltip, leftLabel, rightLabel, children }) {
  const wrapEl = useRef(null), topEl = useRef(null), botEl = useRef(null), tipEl = useRef(null);
  const S = useRef({ polys: [[], []], maps: [], tiles: [null, null], cols: [[], []], sel: null, hov: null });
  const [pos, setPos] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const [base, setBase] = useState("sat");
  const tipRef = useRef(tooltip); tipRef.current = tooltip;
  const selectRef = useRef(onSelect); selectRef.current = onSelect;

  const paint = (mi, i) => {
    const s = S.current, p = s.polys[mi][i];
    if (!p) return;
    const c = s.cols[mi][i];
    if (s.sel === i) p.setStyle({ fillColor: c || "#ffffff", fillOpacity: c ? 0.92 : 0.15, color: "#12281c", weight: 2.5, opacity: 1 });
    else if (s.hov === i) p.setStyle({ fillColor: c || "#ffffff", fillOpacity: c ? 0.98 : 0.25, color: "#ffffff", weight: 1.6, opacity: 1 });
    else if (c) p.setStyle({ fillColor: c, fillOpacity: 0.86, color: c, weight: 0.8, opacity: 0.86 });
    else p.setStyle({ fillOpacity: 0, opacity: 0, weight: 0 });
  };

  // ---- one-time map setup
  useEffect(() => {
    const [w, s, e, n] = D.meta.bbox;
    const bounds = L.latLngBounds([[s, w], [n, e]]);
    const maps = [topEl.current, botEl.current].map((el) =>
      L.map(el, { preferCanvas: true, zoomControl: false, attributionControl: false, zoomSnap: 0.25, minZoom: 6, maxZoom: 14 }));
    maps.forEach((m, mi) => {
      const polys = D.bounds.map((ring, i) => {
        const p = L.polygon(ring, { stroke: true, weight: 0, opacity: 0, fillOpacity: 0, smoothFactor: 0.6, interactive: true });
        p.on("click", () => selectRef.current(i));
        const place = (ev) => {
          const tip = tipEl.current, r = wrapEl.current.getBoundingClientRect();
          if (!tip || !ev.originalEvent) return;
          const x = Math.min(r.width - 130, Math.max(130, ev.originalEvent.clientX - r.left));
          tip.style.left = `${x}px`; tip.style.top = `${ev.originalEvent.clientY - r.top - 14}px`;
        };
        p.on("mouseover", (ev) => {
          const prev = S.current.hov; S.current.hov = i;
          if (prev != null) { paint(0, prev); paint(1, prev); }
          paint(0, i); paint(1, i);
          tipEl.current.innerHTML = tipRef.current(i); tipEl.current.style.display = "block"; place(ev);
        });
        p.on("mousemove", place);
        p.on("mouseout", () => {
          if (S.current.hov === i) { S.current.hov = null; paint(0, i); paint(1, i); }
          tipEl.current.style.display = "none";
        });
        p.addTo(m);
        return p;
      });
      S.current.polys[mi] = polys;
      if (D.districtsGeo) {
        L.geoJSON(D.districtsGeo, { interactive: false, style: { color: "#12281c", weight: 1, fill: false, opacity: 0.45, dashArray: "4 3" } }).addTo(m);
        D.districtsGeo.features.forEach((f) => {
          const c = L.geoJSON(f).getBounds().getCenter();
          L.marker(c, { interactive: false, keyboard: false, icon: L.divIcon({ className: "district-label", html: `<span>${f.properties.name}</span>`, iconSize: [0, 0] }) }).addTo(m);
        });
      }
    });
    maps.forEach((m) => m.fitBounds(bounds, { animate: false }));
    let lock = false;
    const link = (a, b) => a.on("move", () => {
      if (lock) return; lock = true;
      b.setView(a.getCenter(), a.getZoom(), { animate: false });
      lock = false;
    });
    link(maps[0], maps[1]); link(maps[1], maps[0]);
    S.current.maps = maps; S.current.bounds = bounds;
    const ro = new ResizeObserver(() => maps.forEach((m) => m.invalidateSize()));
    ro.observe(wrapEl.current);
    return () => { ro.disconnect(); maps.forEach((m) => m.remove()); };
  }, [D]);

  // ---- basemap; tiles sit below the hexagons
  useEffect(() => {
    const cfg = BASES[base];
    S.current.maps.forEach((m, mi) => {
      if (S.current.tiles[mi]) m.removeLayer(S.current.tiles[mi]);
      S.current.tiles[mi] = L.tileLayer(cfg.url, { maxZoom: 18, maxNativeZoom: cfg.maxNativeZoom, crossOrigin: true }).addTo(m);
    });
    wrapEl.current.dataset.base = base;
  }, [base, D]);

  // ---- colours
  useEffect(() => {
    S.current.cols = [leftColors, rightColors];
    for (let mi = 0; mi < 2; mi++) for (let i = 0; i < D.n; i++) paint(mi, i);
    // eslint-disable-next-line
  }, [leftColors, rightColors]);

  // ---- selection
  useEffect(() => {
    const prev = S.current.sel;
    S.current.sel = selected;
    [prev, selected].forEach((i) => { if (i != null) { paint(0, i); paint(1, i); } });
    if (selected != null) S.current.polys.forEach((polys) => polys[selected] && polys[selected].bringToFront());
    // eslint-disable-next-line
  }, [selected]);

  // ---- fly to a district / cell
  useEffect(() => {
    if (!focus || !S.current.maps.length) return;
    const m = S.current.maps[0];
    if (focus.bounds) m.fitBounds(focus.bounds, { padding: [24, 24], animate: true });
    else if (focus.latlng) m.setView(focus.latlng, Math.max(m.getZoom(), 10), { animate: true });
  }, [focus]);

  // ---- divider dragging
  useEffect(() => {
    if (!dragging) return;
    const move = (ev) => {
      const r = wrapEl.current.getBoundingClientRect();
      setPos(Math.min(0.97, Math.max(0.03, (ev.clientX - r.left) / r.width)));
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [dragging]);

  const zoom = (d) => S.current.maps[0] && S.current.maps[0].setZoom(S.current.maps[0].getZoom() + d);
  const reset = () => S.current.maps[0] && S.current.maps[0].fitBounds(S.current.bounds);
  const nudge = (ev) => {
    if (ev.key === "ArrowLeft") setPos((p) => Math.max(0.03, p - 0.03));
    if (ev.key === "ArrowRight") setPos((p) => Math.min(0.97, p + 0.03));
  };

  return (
    <div className="swipe" ref={wrapEl} data-base={base}>
      <div className="swipe-map swipe-bottom" ref={botEl} />
      <div className="swipe-map swipe-top" ref={topEl} style={{ clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)` }} />
      <div className="swipe-divider" style={{ left: `${pos * 100}%` }}>
        <button className="swipe-handle" aria-label="Drag to compare before and after" onKeyDown={nudge} onPointerDown={(e) => { e.preventDefault(); setDragging(true); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" /></svg>
        </button>
      </div>
      <div className="swipe-tag swipe-tag-left">{leftLabel}</div>
      <div className="swipe-tag swipe-tag-right">{rightLabel}</div>
      <div className="map-tools">
        <button onClick={() => zoom(1)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(-1)} aria-label="Zoom out">−</button>
        <button onClick={reset} aria-label="Reset view" title="Reset view">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /></svg>
        </button>
      </div>
      <div className="basemaps" role="group" aria-label="Basemap">
        {Object.entries(BASES).map(([k, v]) => (
          <button key={k} className={base === k ? "on" : ""} onClick={() => setBase(k)}>{v.label}</button>
        ))}
      </div>
      <div className="cw-tip" ref={tipEl} />
      <div className="attrib">{BASES[base].attr}</div>
      {children}
    </div>
  );
}
