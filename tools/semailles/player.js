'use strict';
/*
 * Test players (never shipped in the game). All of them choose from a reference-engine state.
 *   strongFor(n, level) : deeper and with a larger node budget than the adversary of level n
 *   naive               : takes the biggest capture, else a random legal move
 */
const R = require('./engine');

const G = require('./game-engine').load();
// Same search as the game, but deeper and with a much larger node budget than the adversary.
function strongFor(n, level) {
  const ai = level.ai;
  const depth = Math.min(ai.d + 4, 11), nodes = Math.min(Math.max(ai.n * 25, 40000), 300000);
  return (s, rng, plies) => {
    const b = G.mkBoard(s.pits, s.store);
    return G.bestMoves(b, 0, plies, depth, nodes).moves[0];
  };
}
function naive(s, rng) {
  const mv = R.legalMoves(s);
  let best = -1, pool = [];
  for (const m of mv) {
    const g = R.play(s, m).seeds;
    if (g > best) { best = g; pool = [m]; } else if (g === best) pool.push(m);
  }
  return pool[Math.floor(rng() * pool.length)];
}
module.exports = { strongFor, naive };
