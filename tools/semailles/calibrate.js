'use strict';
/*
 * Win rates of the two reference players against the 20 adversaries (node tools/semailles/calibrate.js [games]).
 * Prints the table that goes to docs/contenu/semailles.md.
 */
const { G, debutant, bonJoueur, rate } = require('./reference-players');
const N = +process.argv[2] || 200;
const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const rows = [];
for (let n = 1; n <= 20; n++) {
  if (only && !only.includes(n)) continue;
  const L = G.LEVELS[n - 1], t0 = Date.now();
  const d = Math.round(100 * rate(L, debutant, N)), b = Math.round(100 * rate(L, bonJoueur, N));
  rows.push([n, d, b]);
  console.log(String(n).padStart(2), L.nm.padEnd(12), JSON.stringify(L.ai), 'start', JSON.stringify(L.s), ' debutant', String(d).padStart(3) + '%', ' bon', String(b).padStart(3) + '%', ' ' + (Date.now() - t0) + 'ms');
}
if (process.env.JSON) console.log(JSON.stringify(rows));
