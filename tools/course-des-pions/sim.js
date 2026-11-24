'use strict';
// Opponent / handicap tuning: win rate of the test player per level, game length, stars.
//   node tools/course-des-pions/sim.js [games] [--md]      (--md prints the table of docs/contenu)
const { playGame, E } = require('./play');
const games = +process.argv[2] || 1000;
const md = process.argv.includes('--md');
const HUMAN_S = 1.2, BOT_S = (230 + 300 + 100) / 1000;
if (md) console.log('| Niveau | Toi (pions) | Adversaires : pions chacun (force) | Victoires mesurées | Étoiles 3/2/1 (% des victoires) | Durée estimée |\n|---|---|---|---|---|---|');
else console.log('lvl  you vs  opp(force)   win%  turns  rolls  caps  3*/2*/1*%   est.min');
const out = [];
for (let n = 1; n <= 20; n++) {
  let win = 0, turns = 0, rolls = 0, caps = 0, hr = 0, br = 0; const st = [0, 0, 0, 0];
  for (let s = 1; s <= games; s++) {
    const S = E.levelGame(n, s * 7919 + n);
    const r = playGame(S);
    rolls += r.rolls; hr += r.humanRolls; br += r.botRolls; caps += S.caps;
    if (S.winner === 0) { win++; turns += S.turns[0]; st[E.starsFor(S)]++; }
  }
  const L = E.LEVELS[n - 1], w = 100 * win / games;
  const est = ((hr / games * HUMAN_S + br / games * BOT_S) / 60).toFixed(1);
  const sp = [3, 2, 1].map(k => (100 * st[k] / Math.max(1, win)).toFixed(0));
  out.push(w);
  if (md) console.log(`| ${n} | ${L.h} | ${L.opp.length} × ${L.o} pions (${L.opp.join('·')}) | ${w.toFixed(0)} % | ${sp.join(' / ')} | ${est} min |`);
  else console.log(String(n).padStart(3), ' ', L.h, 'v', L.o, String(L.opp).padEnd(8), ' ', w.toFixed(0).padStart(3), '  ', (turns / Math.max(1, win)).toFixed(1).padStart(5), ' ',
    (rolls / games).toFixed(0).padStart(5), ' ', (caps / games).toFixed(1).padStart(5), '  ', sp.join('/'), '  ', est);
}
module.exports = { out };
