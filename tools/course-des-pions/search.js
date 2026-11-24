'use strict';
// Looks for a winning seed of the test player on each of the 20 levels (and a few special seeds).
// Writes seeds.json, read by tests/course-des-pions.spec.js.      node tools/course-des-pions/search.js
const fs = require('node:fs');
const path = require('node:path');
const { playGame, E } = require('./play');

const outcome = (n, seed, opts) => { const S = E.levelGame(n, seed); playGame(S, opts); return S; };
const seeds = { win: [], expect: [], stars: {}, lose: {}, tries: [] };
for (let n = 1; n <= 20; n++) {
  let s = 1, S;
  for (;; s++) { S = outcome(n, s); if (S.winner === 0) break; }
  seeds.win.push(s);
  seeds.expect.push({ turns: S.turns[0], stars: E.starsFor(S), rank: E.ranking(S).indexOf(0) + 1 });
  seeds.tries.push(s);
}
// every number of stars on level 6, and a lost game on levels 6 and 20
for (let s = 1; Object.keys(seeds.stars).length < 3 && s < 5000; s++) {
  const S = outcome(6, s);
  if (S.winner === 0 && !seeds.stars[E.starsFor(S)]) seeds.stars[E.starsFor(S)] = { seed: s, turns: S.turns[0] };
}
for (const n of [6, 7, 20]) {
  for (let s = 1; s < 5000; s++) { const S = outcome(n, s); if (S.winner !== 0) { seeds.lose[n] = { seed: s, winner: S.winner, rank: E.ranking(S).indexOf(0) + 1, turns: S.turns[0] }; break; } }
}
fs.writeFileSync(path.join(__dirname, 'seeds.json'), JSON.stringify(seeds, null, 1) + '\n');
console.log('winning seed per level:', seeds.win.join(' '));
console.log('expected:', seeds.expect.map(e => `${e.turns}t/${e.stars}*`).join(' '));
console.log('stars on level 6:', JSON.stringify(seeds.stars), ' lost games:', JSON.stringify(seeds.lose));
