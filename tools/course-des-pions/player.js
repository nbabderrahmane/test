'use strict';
// The test player (NOT in the game): chooses the pion to move with the reference rules.
// Plain heuristics: capture, bring home, enter, avoid cells an opponent can hit, otherwise advance.
const REF = require('./ref');

function hitChance(S, p, pos) {      // chance that an opponent can land on this ring cell with its next throw
  const cell = REF.whereIs(S.seats[p], pos);
  if (!cell || cell.lane || REF.SAFE.has(REF.key(cell.xy))) return 0;
  const hits = new Set();
  for (let q = 0; q < S.np; q++) if (q !== p) for (let j = 0; j < S.ks[q]; j++) {
    const s = S.pos[q][j];
    for (let d = 1; d <= 6; d++) {
      const c = REF.whereIs(S.seats[q], s + d);
      if (s >= 0 && s + d <= 25 && c && !c.lane && REF.key(c.xy) === REF.key(cell.xy)) hits.add(d);
    }
  }
  return hits.size / 6;
}
// returns the pion index to move among the legal moves of player p, or -1 when there is none
function pick(S, p, v, opts = {}) {
  const ms = REF.moves(S, p, v);
  if (!ms.length) return -1;
  if (opts.first) return ms[0].i;
  let best = -1, bs = -1e9;
  ms.forEach(m => {
    let sc = (m.to - m.from) * 1.0;
    if (m.from === -1) sc += 9;
    if (m.to === 26) sc += 9;
    if (m.to > 23 && m.from <= 23) sc += 3;
    m.captured.forEach(([q, j]) => { sc += 12 + 0.7 * (S.pos[q][j] + 1); });
    const lose = (m.from >= 0 ? hitChance(S, p, m.from) * (m.from + 1) : 0) - hitChance(S, p, m.to) * (m.to + 1);
    sc += lose * 0.6;
    sc -= m.i * 1e-3;
    if (sc > bs) { bs = sc; best = m.i; }
  });
  return best;
}
module.exports = { pick };
