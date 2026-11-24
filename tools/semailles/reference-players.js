'use strict';
/*
 * Two reference players used to calibrate the curve of the 20 levels (tools/semailles/calibrate.js)
 * and by the test that recomputes the published rates.
 *   debutant   : 1 ply of search, 20 % of random moves
 *   bonJoueur  : 4 plies of search
 *   hasard     : uniformly random moves (a third measure, to tell the very first levels apart)
 * Ties are broken by the seeded generator shared with the adversary, so games vary with the seed.
 */
const G = require('./game-engine').load();

function pickFrom(list, rng) { return list[Math.floor(rng() * list.length)]; }
const debutant = (b, plies, rng) => {
  const mv = G.moves(b, 0);
  if (rng() < 0.2) return pickFrom(mv, rng);
  return pickFrom(G.bestMoves(b, 0, plies, 1, 1e6).moves, rng);
};
const hasard = (b, plies, rng) => pickFrom(G.moves(b, 0), rng);
const bonJoueur = (b, plies, rng) => pickFrom(G.bestMoves(b, 0, plies, 4, 1e6).moves, rng);

// One game of `player` (side 0, moves first) against the adversary of the level; returns the result.
function playGame(level, player, seed) {
  const rng = G.mkRng(seed * 7919 + 13);
  let b = G.mkBoard(level.p, level.s), t = 0, plies = 0, res;
  for (;;) {
    res = G.status(b, t, plies);
    if (res) return { winner: res.winner, mine: res.b[12], theirs: res.b[13], plies };
    const pit = t === 0 ? player(b, plies, rng) : G.aiMove(b, 1, plies, level.ai, rng);
    b = G.play(b, t, pit).b; t = 1 - t; plies++;
  }
}
// Win rate (0..1) over seeds 1..n.
function rate(level, player, n) {
  let w = 0;
  for (let s = 1; s <= n; s++) if (playGame(level, player, s).winner === 0) w++;
  return w / n;
}
module.exports = { G, debutant, bonJoueur, hasard, playGame, rate };
