'use strict';
// Head-to-head of the opponent strengths (2 pions or 3, 2 players, alternating who starts): proves "more and more clever".
const { loadEngine } = require('./load');
const E = loadEngine();

function duel(a, b, k, games, seed0 = 1) {
  let wa = 0;
  for (let g = 0; g < games; g++) {
    const swap = g % 2 === 1;
    const S = E.newGame({ k, seats: E.SEATS[2], tiers: swap ? [b, a] : [a, b], seed: seed0 + g * 7919 });
    while (!S.over) {
      const p = S.turn, v = E.roll(S), mv = E.legal(S, p, v);
      const m = mv.length ? E.choose(S, mv, S.tiers[p]) : null;
      if (m) E.apply(S, m);
      E.finish(S, !!m);
    }
    if ((S.winner === 0) !== swap) wa++;
  }
  return wa / games;
}
module.exports = { duel };
if (require.main === module) {
  const games = +process.argv[2] || 4000;
  for (const k of [2, 3]) {
    const row = [];
    for (let t = 1; t <= 5; t++) row.push(`T${t} vs T${t - 1}: ${(100 * duel(t, t - 1, k, games)).toFixed(0)}%`);
    row.push(`T5 vs T0: ${(100 * duel(5, 0, k, games)).toFixed(0)}%`);
    console.log(`k=${k}  ` + row.join('  '));
  }
}
