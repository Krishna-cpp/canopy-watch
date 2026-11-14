import { readFileSync } from "node:fs";
import { giStar } from "../web/src/lib/stats.js";
const p = JSON.parse(readFileSync(process.argv[2], "utf8"));
let worst = 0;
for (const k of Object.keys(p.cases)) {
  const z = giStar(Float64Array.from(p.cases[k]), p.nbrs);
  let m = 0; z.forEach((v, i) => { m = Math.max(m, Math.abs(v - p.expected[k][i])); });
  console.log(`${k}: max |JS - Python| = ${m.toExponential(2)} over ${z.length} cells`);
  worst = Math.max(worst, m);
}
if (worst > 1e-9) { console.log("FAIL"); process.exit(1); }
console.log("PASS: JS and Python Gi* agree");
