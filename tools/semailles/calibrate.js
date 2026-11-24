'use strict';
/*
 * Win rates of the two reference players against the 20 adversaries (node tools/semailles/calibrate.js [games]).
 * Prints the table that goes to docs/contenu/semailles.md.
 */
const { G, debutant, bonJoueur, hasard, rate } = require('./reference-players');
const N = +process.argv[2] || 200;
const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const rows = [];
for (let n = 1; n <= 20; n++) {
  if (only && !only.includes(n)) continue;
  const L = G.LEVELS[n - 1], t0 = Date.now();
  const d = Math.round(100 * rate(L, debutant, N)), b = Math.round(100 * rate(L, bonJoueur, N));
  const h = Math.round(100 * rate(L, hasard, N)), D = Math.round((300 - h - d - b) / 3);   // D: difficulty index, 0 = trivial
  rows.push([n, h, d, b, D]);
  const prev = rows.length > 1 ? rows[rows.length - 2][4] : null;
  console.log(String(n).padStart(2), L.nm.padEnd(12), JSON.stringify(L.ai).padEnd(34), 'start', JSON.stringify(L.s).padEnd(8), 'hasard', String(h).padStart(3), 'debutant', String(d).padStart(3), 'bon', String(b).padStart(3), ' D', String(D).padStart(3), prev === null ? '' : ' step ' + (D - prev), ' ' + (Date.now() - t0) + 'ms');
}
if (process.env.JSON) console.log(JSON.stringify(rows));
