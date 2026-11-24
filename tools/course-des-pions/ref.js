'use strict';
/*
 * Reference rules of the pawn race, written apart from the game (board coordinates instead of ring indices),
 * used to cross-check the engine of the game and by the test player.
 *
 * Board: 7x7 squares. The ring is the outer border (24 cells, clockwise from the top-left corner).
 * Each side has a gate at the middle of the side; a pion enters on the cell right after its gate (clockwise),
 * goes once round the ring, ends on its gate, then walks 2 lane cells towards the centre, then home (exact count).
 * Refuges (no capture): the 4 corners and the 4 entry cells.
 */
const RING_XY = [];
for (let x = 0; x <= 6; x++) RING_XY.push([x, 0]);
for (let y = 1; y <= 6; y++) RING_XY.push([6, y]);
for (let x = 5; x >= 0; x--) RING_XY.push([x, 6]);
for (let y = 5; y >= 1; y--) RING_XY.push([0, y]);
const key = ([x, y]) => x + ',' + y;
const GATE_XY = [[3, 0], [6, 3], [3, 6], [0, 3]];             // top, right, bottom, left
const LANE_XY = [[[3, 1], [3, 2]], [[5, 3], [4, 3]], [[3, 5], [3, 4]], [[1, 3], [2, 3]]];
const CORNERS = [[0, 0], [6, 0], [6, 6], [0, 6]];

// The cells walked by a pion of a side, from its entry cell to its home: 24 ring cells, 2 lane cells.
function path(side) {
  const g = RING_XY.findIndex(c => key(c) === key(GATE_XY[side]));
  const cells = [];
  for (let k = 1; k <= 24; k++) cells.push({ xy: RING_XY[(g + k) % 24], lane: false });
  LANE_XY[side].forEach(xy => cells.push({ xy, lane: true }));
  return cells;                       // index = position 0..25 ; 26 = home
}
const PATHS = [0, 1, 2, 3].map(path);
const ENTRY = PATHS.map(p => key(p[0].xy));
const SAFE = new Set(CORNERS.map(key).concat(ENTRY));

function whereIs(side, pos) { return pos >= 0 && pos <= 25 ? PATHS[side][pos] : null; }

// All the single-pion moves of player p with die v ({i, to, captured: [[q, j]]}); same-cell pions are NOT merged.
function moves(S, p, v) {
  const out = [];
  for (let i = 0; i < S.k; i++) {
    const pos = S.pos[p][i];
    let to;
    if (pos === 26) continue;
    if (pos === -1) { if (v !== 6) continue; to = 0; }
    else { to = pos + v; if (to > 26) continue; }
    const captured = [];
    const cell = whereIs(S.seats[p], to);
    if (cell && !cell.lane && !SAFE.has(key(cell.xy))) {
      for (let q = 0; q < S.np; q++) if (q !== p) for (let j = 0; j < S.k; j++) {
        const c = whereIs(S.seats[q], S.pos[q][j]);
        if (c && !c.lane && key(c.xy) === key(cell.xy)) captured.push([q, j]);
      }
    }
    out.push({ p, i, from: pos, to, captured });
  }
  return out;
}
function after(S, mv) {               // new position (pure)
  const pos = S.pos.map(r => r.slice());
  pos[mv.p][mv.i] = mv.to;
  mv.captured.forEach(([q, j]) => { pos[q][j] = -1; });
  return pos;
}
// canonical form of a position (pions of a player are interchangeable)
const canon = pos => pos.map(r => r.slice().sort((a, b) => a - b).join(',')).join('|');
function distinctResults(S, p, v) {
  return [...new Set(moves(S, p, v).map(m => canon(after(S, m))))].sort();
}
function done(S, p) { return S.pos[p].every(x => x === 26); }
function nextTurn(S, p, v, moved) {    // [nextPlayer, triesAfter] according to the written rules
  if (v === 6) return [p, 0];
  const onTrack = S.pos[p].some(x => x >= 0 && x < 26);
  if (!moved && !onTrack) return S.tries + 1 < 3 ? [p, S.tries + 1] : [(p + 1) % S.np, 0];
  return [(p + 1) % S.np, 0];
}
module.exports = { moves, after, canon, distinctResults, done, nextTurn, PATHS, SAFE, key, whereIs, ENTRY };
