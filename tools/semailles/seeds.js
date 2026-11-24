'use strict';
/*
 * Finds, for each level, the first seed (1, 2, 3...) for which the test player wins against the
 * adversary of the level (node tools/semailles/seeds.js). The tests fix these seeds. It also
 * prints how many of the 40 seeds from 100+n the test player wins, as a measure of how safe a level is.
 */
const G = require('./game-engine').load();
const R = require('./engine');
const { strongFor } = require('./player');
const out = [];
for (let n = 1; n <= 20; n++) {
  const L = G.LEVELS[n - 1], sp = strongFor(n, L);
  let first = 0, wins = 0;
  for (let seed = 100 + n; seed < 140 + n; seed++) {
    const rng = G.mkRng(seed);
    let b = G.mkBoard(L.p, L.s), t = 0, plies = 0, res;
    for (;;) {
      res = G.status(b, t, plies); if (res) break;
      const pit = t === 0 ? sp(R.initial(Array.from(b.slice(0, 12)), [b[12], b[13]], 0), rng, plies) : G.aiMove(b, 1, plies, L.ai, rng);
      b = G.play(b, t, pit).b; t = 1 - t; plies++;
    }
    if (res.winner === 0) { wins++; if (!first) first = seed; }
  }
  out.push(first);
  console.log(n, L.nm.padEnd(12), 'first winning seed', first, ' wins on seeds 100+n..139+n:', wins);
}
console.log('SEEDS =', JSON.stringify(out));
