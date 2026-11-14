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
  cover: ["#e3efc6", "#a9d184", "#58a863", "#1f7a45", "#0b4a2a"],
  loss: ["#fbe3a6", "#f2a541", "#dd5a28", "#a8281c", "#4d0f0f"],
  risk: ["#fbeab0", "#f0b34a", "#e0662f", "#b3261e", "#4d0f0f"],
};

export const HOTSPOT_CLASSES = [
  { min: 2.58, color: "#a8281c", label: "Hot spot, 99% confidence" },
  { min: 1.96, color: "#dd5a28", label: "Hot spot, 95% confidence" },
  { min: 1.65, color: "#f2a541", label: "Hot spot, 90% confidence" },
];
export const COLD_SPOT = { max: -1.96, color: "#2a7f8e", label: "Cold spot, less loss than expected" };

export function hotspotColor(z) {
  for (const c of HOTSPOT_CLASSES) if (z >= c.min) return c.color;
  if (z <= COLD_SPOT.max) return COLD_SPOT.color;
  return null;
}
