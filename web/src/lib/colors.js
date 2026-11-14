const lerp = (a, b, t) => a + (b - a) * t;
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function ramp(stops, t) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const a = hex2rgb(stops[i]), b = hex2rgb(stops[i + 1]);
  return rgb2hex(a.map((v, k) => lerp(v, b[k], x - i)));
}

export const RAMPS = {
  cover: ["#eef3e4", "#c4dd8c", "#6fb454", "#2f8f4e", "#0f4d2a"],
  loss: ["#fde9b0", "#f6a43c", "#e8590c", "#b01e1e", "#5c0a0a"],
  risk: ["#fff3c4", "#f9c74f", "#f3722c", "#c1121f", "#5c0a0a"],
};

export const HOTSPOT_CLASSES = [
  { min: 2.58, color: "#b01e1e", label: "Hot spot, 99% confidence" },
  { min: 1.96, color: "#e8590c", label: "Hot spot, 95% confidence" },
  { min: 1.65, color: "#f6a43c", label: "Hot spot, 90% confidence" },
];
export const COLD_SPOT = { max: -1.96, color: "#3b7a8c", label: "Cold spot (less loss than expected)" };

export function hotspotColor(z) {
  for (const c of HOTSPOT_CLASSES) if (z >= c.min) return c.color;
  if (z <= COLD_SPOT.max) return COLD_SPOT.color;
  return null;
}
