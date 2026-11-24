'use strict';
/*
 * Tuning of the 20 adversaries (node tools/semailles/tune.js [seeds]).
 * Prints, per level: the win rate of the strong test player (tools/semailles/player.js), of a
 * naive player (takes the biggest capture, else plays at random), and how the adversary of
 * level n fares against the one of level n-1 on the standard start.
 */
const G = require('./game-engine').load();
const R = require('./engine');
const { strongFor, naive } = require('./player');
const SEEDS = +process.argv[2] || 12;

// one game; pick0(refState, rng) chooses for the player, the game's own AI plays side 1
function game(level, pick0, seed, ai1 = level.ai) {
  const rng = G.mkRng(seed);
  let b = G.mkBoard(level.p, level.s), t = 0, plies = 0, mv0 = 0;
  for (;;) {
    const st = G.status(b, t, plies);
    if (st) return { winner: st.winner, mine: st.b[12], theirs: st.b[13], moves: mv0, plies };
    let pit;
    if (t === 0) {
      pit = pick0(R.initial(Array.from(b.slice(0, 12)), [b[12], b[13]], 0), rng, plies);
      mv0++;
    } else pit = G.aiMove(b, 1, plies, ai1, rng);
    b = G.play(b, t, pit).b; t = 1 - t; plies++;
  }
}
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('lvl', 4), pad('adversary', 12), 'strong  naive(win, moves)   vs previous');
for (let n = 1; n <= 20; n++) {
  const L = G.LEVELS[n - 1], sp = strongFor(n, L);
  let sw = 0, nw = 0, nm = 0, nwins = 0, tl = 0;
  const t0 = Date.now();
  for (let s = 1; s <= SEEDS; s++) {
    const a = game(L, sp, s); if (a.winner === 0) sw++; tl += a.moves;
    const b = game(L, naive, s + 100); if (b.winner === 0) { nw++; nm += b.moves; }
  }
  // adversary n against adversary n-1 on the standard start (strong player replaced by the weaker AI)
  let vs = '';
  if (n > 1) {
    let w = 0, tot = 0;
    for (let s = 1; s <= SEEDS; s++) for (const side of [0, 1]) {
      const rng = G.mkRng(s * 7 + side), A = [G.LEVELS[n - 1].ai, G.LEVELS[n - 2].ai]; // A[0] = level n, A[1] = n-1
      let b = G.mkBoard(new Array(12).fill(4), [0, 0]), t = 0, plies = 0, res;
      for (;;) {
        res = G.status(b, t, plies); if (res) break;
        const who = (t === side) ? 0 : 1;   // side `side` is played by level n
        b = G.play(b, t, G.aiMove(b, t, plies, A[who], rng)).b; t = 1 - t; plies++;
      }
      tot++; if (res.winner === side) w++; else if (res.winner === -1) w += 0.5;
    }
    vs = (100 * w / tot).toFixed(0) + '%';
  }
  console.log(pad(n, 4), pad(L.nm, 12), pad(sw + '/' + SEEDS, 7), pad(nw + '/' + SEEDS + ' ' + (nw ? (nm / nw).toFixed(1) : '-'), 14), '  ', vs, '  (' + (Date.now() - t0) + ' ms, avg ' + (tl / SEEDS).toFixed(0) + ' moves)');
}
