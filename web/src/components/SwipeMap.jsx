import { useEffect, useRef, useState } from "react";
import L from "leaflet";

const BASES = {
  osm: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap contributors", maxZoom: 19 },
  sat: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imagery © Esri, Maxar, Earthstar Geographics", maxZoom: 18 },
};

/**
 * Two synchronised Leaflet maps stacked on top of each other. The top map (BEFORE) is clipped with
 * CSS clip-path up to the draggable divider, the bottom map (AFTER) shows through on the right.
 */
export default function SwipeMap({ D, leftColors, rightColors, selected, onSelect, focus, tooltip, leftLabel, rightLabel, children }) {
  const wrapEl = useRef(null), topEl = useRef(null), botEl = useRef(null);
  const S = useRef({ polys: [[], []], maps: [], tiles: [null, null], sel: null });
  const [pos, setPos] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const [base, setBase] = useState("osm");
  const tipRef = useRef(tooltip); tipRef.current = tooltip;
  const selectRef = useRef(onSelect); selectRef.current = onSelect;

  // ---- one-time map setup
  useEffect(() => {
    const [w, s, e, n] = D.meta.bbox;
    const bounds = L.latLngBounds([[s, w], [n, e]]);
    const maps = [topEl.current, botEl.current].map((el) =>
      L.map(el, { preferCanvas: true, zoomControl: false, attributionControl: false, zoomSnap: 0.25, minZoom: 6, maxZoom: 14 }));
    maps.forEach((m, mi) => {
      const polys = D.bounds.map((ring, i) => {
        const p = L.polygon(ring, { weight: 0.6, color: "#ffffff", opacity: 0.35, fillOpacity: 0 });
        p.on("click", () => selectRef.current(i));
        p.bindTooltip(() => tipRef.current(i), { sticky: true, direction: "top", className: "cw-tip" });
        p.addTo(m);
        return p;
      });
      S.current.polys[mi] = polys;
      if (D.districtsGeo) L.geoJSON(D.districtsGeo, { interactive: false, style: { color: "#0b1f14", weight: 1.2, fill: false, opacity: 0.55 } }).addTo(m);
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

  // ---- basemap (OpenStreetMap or Esri satellite); tiles sit below the hexagons
  useEffect(() => {
    const cfg = BASES[base];
    S.current.maps.forEach((m, mi) => {
      if (S.current.tiles[mi]) m.removeLayer(S.current.tiles[mi]);
      S.current.tiles[mi] = L.tileLayer(cfg.url, { maxZoom: cfg.maxZoom, crossOrigin: true }).addTo(m);
    });
  }, [base, D]);

  // ---- colours
  useEffect(() => {
    [leftColors, rightColors].forEach((cols, mi) => {
      S.current.polys[mi].forEach((p, i) => {
        const c = cols[i];
        p.setStyle(c ? { fillColor: c, fillOpacity: 0.8 } : { fillOpacity: 0 });
      });
    });
  }, [leftColors, rightColors]);

  // ---- selection highlight
  useEffect(() => {
    const prev = S.current.sel;
    S.current.polys.forEach((polys) => {
      if (prev != null && polys[prev]) polys[prev].setStyle({ weight: 0.6, color: "#ffffff", opacity: 0.35 });
      if (selected != null && polys[selected]) { polys[selected].setStyle({ weight: 3, color: "#0b1f14", opacity: 1 }); polys[selected].bringToFront(); }
    });
    S.current.sel = selected;
  }, [selected, leftColors, rightColors]);

  // ---- fly to a district / cell
  useEffect(() => {
    if (!focus || !S.current.maps.length) return;
    const m = S.current.maps[0];
    if (focus.bounds) m.fitBounds(focus.bounds, { padding: [24, 24], animate: true });
    else if (focus.latlng) m.setView(focus.latlng, Math.max(m.getZoom(), 9.5), { animate: true });
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

  return (
    <div className="swipe" ref={wrapEl}>
      <div className="swipe-map swipe-bottom" ref={botEl} />
      <div className="swipe-map swipe-top" ref={topEl} style={{ clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)` }} />
      <div className="swipe-divider" style={{ left: `${pos * 100}%` }}>
        <button className="swipe-handle" aria-label="Drag to compare before and after" onPointerDown={(e) => { e.preventDefault(); setDragging(true); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" /></svg>
        </button>
      </div>
      <div className="swipe-badge swipe-badge-left">{leftLabel}</div>
      <div className="swipe-badge swipe-badge-right">{rightLabel}</div>
      <div className="map-buttons">
        <button onClick={() => zoom(1)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(-1)} aria-label="Zoom out">−</button>
        <button onClick={reset} aria-label="Reset view" title="Reset view">⟲</button>
        <button className="base-btn" onClick={() => setBase(base === "osm" ? "sat" : "osm")}>{base === "osm" ? "Satellite" : "Map"}</button>
      </div>
      <div className="attrib">{BASES[base].attr}</div>
      {children}
    </div>
  );
}
