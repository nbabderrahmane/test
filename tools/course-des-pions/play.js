'use strict';
// Plays one whole game with the game's engine (dice, opponents) and the test player for seat 0.
const { loadEngine } = require('./load');
const PLAYER = require('./player');
const E = loadEngine();

function playGame(S, opts = {}) {
  const stats = { rolls: 0, humanRolls: 0, humanAutos: 0, humanPicks: 0, botRolls: 0 };
  while (!S.over && stats.rolls < 20000) {
    const p = S.turn, v = E.roll(S);
    stats.rolls++;
    const mine = E.legal(S, p, v);
    let mv = null;
    if (S.tiers[p] === null) {
      stats.humanRolls++;
      if (mine.length === 1) { mv = mine[0]; stats.humanAutos++; }
      else if (mine.length > 1) {
        stats.humanPicks++;
        const i = PLAYER.pick(S, p, v, opts);
        mv = mine.find(m => S.pos[p][m.i] === S.pos[p][i]) || mine[0];
      }
    } else { stats.botRolls++; if (mine.length) mv = E.choose(S, mine, S.tiers[p]); }
    if (mv) E.apply(S, mv);
    E.finish(S, !!mv);
  }
  return stats;
}
module.exports = { playGame, E };
