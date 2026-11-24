'use strict';
// Opponent tuning: win rate of the test player, game length, stars, per level.   node tools/course-des-pions/sim.js [games]
const { playGame, E } = require('./play');
const games = +process.argv[2] || 600;
// seconds per action: what a human needs per throw (tap + choice) and what the game spends per opponent throw
const HUMAN_S = 1.6, BOT_S = 0.85, BOT_S_FAST = 0.35;
console.log('lvl  k opp         win%  turns  rolls  caps  3*/2*/1*%   est.min (normal / fast)');
for (let n = 1; n <= 20; n++) {
  let win = 0, turns = 0, rolls = 0, caps = 0, humanRolls = 0, botRolls = 0, st = [0, 0, 0, 0];
  for (let s = 1; s <= games; s++) {
    const S = E.levelGame(n, s * 7919 + n);
    const r = playGame(S);
    rolls += r.rolls; humanRolls += r.humanRolls; botRolls += r.botRolls; caps += S.caps;
    if (S.winner === 0) { win++; turns += S.turns[0]; st[E.starsFor(S)]++; }
  }
  const L = E.LEVELS[n - 1];
  const est = x => ((humanRolls / games * HUMAN_S + botRolls / games * x) / 60).toFixed(1);
  console.log(String(n).padStart(3), ' ', L.k, String(L.opp).padEnd(10), ' ', (100 * win / games).toFixed(0).padStart(3), '  ',
    (turns / Math.max(1, win)).toFixed(1).padStart(5), ' ', (rolls / games).toFixed(0).padStart(5), ' ', (caps / games).toFixed(1).padStart(5), '  ',
    [3, 2, 1].map(k => (100 * st[k] / Math.max(1, win)).toFixed(0).padStart(3)).join('/'), '  ', est(BOT_S), '/', est(BOT_S_FAST));
}
