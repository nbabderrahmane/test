'use strict';
/*
 * Reference rules of "Petit Mil" (semailles), written independently of the game file: plain
 * objects, no typed arrays, ring walking by position instead of index arithmetic in the sower.
 * The tests compare it with the game's engine move by move, and the strong test player uses it.
 *
 *   state = { pits: [12], store: [mine, theirs], turn: 0|1, plies: n }
 *   side 0 owns pits 0..5, side 1 owns pits 6..11; sowing goes 0 -> 1 -> ... -> 11 -> 0.
 */
const WIN = 25, PLY_CAP = 200;

const initial = (pits, store, turn = 0) => ({ pits: pits.slice(), store: store.slice(), turn, plies: 0 });
const standard = () => initial(new Array(12).fill(4), [0, 0]);
const clone = s => ({ pits: s.pits.slice(), store: s.store.slice(), turn: s.turn, plies: s.plies });
const ownedBy = pit => (pit < 6 ? 0 : 1);
const seedsOf = (s, side) => s.pits.slice(side * 6, side * 6 + 6).reduce((a, b) => a + b, 0);

// the pits (in order) that receive a seed when `count` seeds are sown from `from`
function sowTargets(from, count) {
  const out = [];
  let pos = from;
  while (out.length < count) {
    pos = (pos + 1) % 12;
    if (pos !== from) out.push(pos);
  }
  return out;
}
function legalMoves(s) {
  const me = s.turn, res = [];
  const hungry = seedsOf(s, 1 - me) === 0;
  for (let pit = me * 6; pit < me * 6 + 6; pit++) {
    if (s.pits[pit] === 0) continue;
    if (hungry && !sowTargets(pit, s.pits[pit]).some(p => ownedBy(p) !== me)) continue;
    res.push(pit);
  }
  return res;
}
// Returns the next state (turn flipped, plies + 1, end of game NOT applied) and what happened.
function play(s, pit) {
  const me = s.turn, n = clone(s);
  const targets = sowTargets(pit, n.pits[pit]);
  n.pits[pit] = 0;
  for (const p of targets) n.pits[p]++;
  const last = targets[targets.length - 1];
  const taken = [];
  if (ownedBy(last) !== me) {
    for (let p = last; p >= 0 && ownedBy(p) !== me && (n.pits[p] === 2 || n.pits[p] === 3); p--) taken.push(p);
  }
  let seeds = taken.reduce((a, p) => a + n.pits[p], 0);
  let grandSlam = false;
  if (taken.length && seeds === seedsOf(n, 1 - me)) { grandSlam = true; seeds = 0; taken.length = 0; }
  for (const p of taken) n.pits[p] = 0;
  n.store[me] += seeds;
  n.turn = 1 - me;
  n.plies = s.plies + 1;
  return { state: n, taken, seeds, grandSlam, last, sown: targets };
}
// null while the game goes on; else the final state (seeds left on a side go to its owner).
function ending(s) {
  if (s.store[0] >= WIN) return { winner: 0, why: 'win', store: s.store.slice() };
  if (s.store[1] >= WIN) return { winner: 1, why: 'win', store: s.store.slice() };
  let why = null;
  if (s.plies >= PLY_CAP) why = 'cap';
  else if (!legalMoves(s).length) why = 'stuck';
  if (!why) return null;
  const store = [s.store[0] + seedsOf(s, 0), s.store[1] + seedsOf(s, 1)];
  return { winner: store[0] > store[1] ? 0 : store[1] > store[0] ? 1 : -1, why, store };
}

// ---- strong player (alpha-beta, iterative deepening, node-bounded) --------------------------
function evaluate(s, me) {
  const u = 1 - me;
  let v = (s.store[me] - s.store[u]) * 12 + seedsOf(s, me) - seedsOf(s, u);
  for (let i = 0; i < 6; i++) {
    if (s.pits[me * 6 + i] === 1 || s.pits[me * 6 + i] === 2) v -= 2;
    if (s.pits[u * 6 + i] === 1 || s.pits[u * 6 + i] === 2) v += 2;
  }
  return v;
}
function search(s, depth, alpha, beta, cx) {
  if (++cx.nodes > cx.max) { cx.abort = true; return 0; }
  const end = ending(s), me = s.turn;
  if (end) {
    const d = end.store[me] - end.store[1 - me];
    return end.winner === me ? 100000 - s.plies + d : end.winner === -1 ? 0 : -100000 + s.plies + d;
  }
  if (depth === 0) return evaluate(s, me);
  const kids = legalMoves(s).map(m => play(s, m)).sort((a, b) => b.seeds - a.seeds);
  let best = -1e9;
  for (const k of kids) {
    const v = -search(k.state, depth - 1, -beta, -alpha, cx);
    if (cx.abort) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}
// Best pit of the side to move: deepest complete iteration within maxNodes (and maxDepth).
function choose(s, { depth = 8, nodes = 200000 } = {}) {
  const mv = legalMoves(s);
  if (mv.length === 1) return { pit: mv[0], depth: 0, nodes: 0 };
  const kids = mv.map(m => ({ m, r: play(s, m) })).sort((a, b) => b.r.seeds - a.r.seeds);
  const cx = { nodes: 0, max: nodes, abort: false };
  let pick = kids[0].m, reached = 0;
  for (let d = 1; d <= depth; d++) {
    let best = -1e9, bm = null;
    for (const k of kids) {
      const v = -search(k.r.state, d - 1, -1e9, -(best - 1), cx);
      if (cx.abort) break;
      if (v > best) { best = v; bm = k.m; }
    }
    if (cx.abort) break;
    pick = bm; reached = d;
  }
  return { pit: pick, depth: reached, nodes: cx.nodes };
}

module.exports = { WIN, PLY_CAP, initial, standard, clone, seedsOf, sowTargets, legalMoves, play, ending, evaluate, choose };
