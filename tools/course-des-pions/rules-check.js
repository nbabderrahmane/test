'use strict';
// Plays random games with the engine of the game and checks every step against the reference rules.
const { loadEngine } = require('./load');
const REF = require('./ref');
const E = loadEngine();

function check(games = 300) {
  let steps = 0, caps = 0, wins = 0;
  for (let g = 0; g < games; g++) {
    const np = 2 + (g % 3), k = 2 + (g % 2);
    const S = E.newGame({ k, seats: E.SEATS[np], tiers: new Array(np).fill(1), seed: 1000 + g });
    for (let t = 0; t < 4000 && !S.over; t++) {
      const p = S.turn, v = E.roll(S);
      const mine = E.legal(S, p, v);
      const ref = REF.distinctResults(S, p, v);
      const got = [...new Set(mine.map(m => { const c = JSON.parse(JSON.stringify(S)); E.apply(c, m); return REF.canon(c.pos); }))].sort();
      if (JSON.stringify(ref) !== JSON.stringify(got)) throw new Error(`game ${g} step ${t}: engine and reference disagree\n${JSON.stringify(S)}\nroll ${v}\n${ref}\n${got}`);
      const mv = mine.length ? E.choose(S, mine, S.tiers[p]) : null;
      if (mv) { if (mv.cap.length) caps++; E.apply(S, mv); }
      const [np2, tr2] = REF.nextTurn(S, p, v, !!mv);
      E.finish(S, !!mv);
      if (!S.over && (S.turn !== np2 || S.tries !== tr2)) throw new Error(`game ${g} step ${t}: turn rule differs (${S.turn},${S.tries}) vs (${np2},${tr2})`);
      if (S.over !== REF.done(S, p) && !(S.over && REF.done(S, S.winner))) throw new Error('end of game differs');
      steps++;
    }
    if (S.over) wins++;
  }
  return { games, steps, caps, finished: wins };
}
if (require.main === module) console.log(check());
module.exports = { check };
