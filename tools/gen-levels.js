#!/usr/bin/env node
'use strict';
/*
 * Offline level generator + solver for games/tri-couleurs.
 *
 *   node tools/gen-levels.js            -> prints the chosen levels and solution lengths
 *   node tools/gen-levels.js --write    -> also rewrites the LEVELS block of games/tri-couleurs/index.html
 *
 * Rules modelled (single-ball moves): take the top ball of a tube, drop it on a
 * ball of the same colour or into an empty tube, never into a full tube.
 * Solver: A* with an admissible heuristic (optimal). If the node budget is
 * exceeded, it falls back to weighted A* and the level is flagged "non-optimal".
 * Everything is seeded, so the output is reproducible.
 */
const fs = require('fs');
const path = require('path');

// One entry per level: colours, empty tubes, tube height, candidates to try, pick rule.
const SPECS = [
  { colors: 2, empty: 1, cap: 3, tries: 60, pick: 'min' },
  { colors: 3, empty: 2, cap: 3, tries: 60, pick: 'low' },
  { colors: 4, empty: 2, cap: 4, tries: 40, pick: 'low' },
  { colors: 5, empty: 2, cap: 4, tries: 40, pick: 'low' },
  { colors: 5, empty: 2, cap: 4, tries: 40, pick: 'high' },
  { colors: 6, empty: 2, cap: 4, tries: 30, pick: 'mid' },
  { colors: 7, empty: 2, cap: 4, tries: 24, pick: 'low' },
  { colors: 7, empty: 2, cap: 4, tries: 24, pick: 'high' },
  { colors: 8, empty: 2, cap: 4, tries: 16, pick: 'mid' },
  { colors: 9, empty: 2, cap: 4, tries: 16, pick: 'mid' },
];
const BASE_SEED = 20261124;
const NODE_BUDGET = 1500000;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- rules -----------------------------------------------------------------
function isWon(tubes, cap) {
  return tubes.every(t => t.length === 0 ||
    (t.length === cap && t.every(c => c === t[0])));
}
function canMove(tubes, cap, from, to) {
  if (from === to) return false;
  const a = tubes[from], b = tubes[to];
  if (!a.length || b.length >= cap) return false;
  return b.length === 0 || b[b.length - 1] === a[a.length - 1];
}

// ---- solver (tubes are strings, one char per ball, bottom -> top) ------------
function heuristic(tubes) {
  // Every ball above the bottom single-colour run must move at least once.
  // Among tubes sharing a bottom colour, at most one run can stay in place.
  let h = 0;
  const sum = {}, max = {};
  for (const t of tubes) {
    if (!t.length) continue;
    let run = 1;
    while (run < t.length && t[run] === t[0]) run++;
    h += t.length - run;
    sum[t[0]] = (sum[t[0]] || 0) + run;
    if (!(max[t[0]] >= run)) max[t[0]] = run;
  }
  for (const c in sum) h += sum[c] - max[c];
  return h;
}
const keyOf = tubes => tubes.slice().sort().join('|');
const mono = t => { for (let i = 1; i < t.length; i++) if (t[i] !== t[0]) return false; return true; };

function search(start, cap, weight, budget) {
  const goal = t => t.length === 0 || (t.length === cap && mono(t));
  const buckets = [];
  let minF = 0, expanded = 0;
  const best = new Map(); // key -> g
  const push = (node, f) => { (buckets[f] || (buckets[f] = [])).push(node); if (f < minF) minF = f; };
  const h0 = heuristic(start);
  minF = Math.floor(weight * h0);
  push({ tubes: start, g: 0, parent: null, move: null }, minF);
  best.set(keyOf(start), 0);
  for (;;) {
    while (minF < buckets.length && !(buckets[minF] && buckets[minF].length)) minF++;
    if (minF >= buckets.length) return null;
    const node = buckets[minF].pop();
    const tubes = node.tubes;
    if (best.get(keyOf(tubes)) < node.g) continue; // stale
    if (tubes.every(goal)) {
      const moves = [];
      for (let n = node; n.parent; n = n.parent) moves.push(n.move);
      return { moves: moves.reverse(), expanded };
    }
    if (++expanded > budget) return { moves: null, expanded };
    for (let i = 0; i < tubes.length; i++) {
      const a = tubes[i];
      if (!a.length) continue;
      const aMono = mono(a);
      if (aMono && a.length === cap) continue;        // finished tube: never useful to break
      const ball = a[a.length - 1];
      let emptyTried = false;
      for (let j = 0; j < tubes.length; j++) {
        if (j === i) continue;
        const b = tubes[j];
        if (b.length >= cap) continue;
        if (b.length === 0) {
          if (emptyTried || aMono) continue;          // symmetric / pointless
          emptyTried = true;
        } else if (b[b.length - 1] !== ball) continue;
        const next = tubes.slice();
        next[i] = a.slice(0, -1);
        next[j] = b + ball;
        const g = node.g + 1, k = keyOf(next);
        const seen = best.get(k);
        if (seen !== undefined && seen <= g) continue;
        best.set(k, g);
        push({ tubes: next, g, parent: node, move: [i, j] }, g + Math.floor(weight * heuristic(next)));
      }
    }
  }
}

function solve(tubesArr, cap) {
  const start = tubesArr.map(t => t.map(c => String.fromCharCode(97 + c)).join(''));
  for (const w of [1, 1.25, 1.5, 2, 3]) {
    const r = search(start, cap, w, NODE_BUDGET);
    if (r === null) return null;                      // exhausted: unsolvable
    if (r.moves) return { moves: r.moves, optimal: w === 1, expanded: r.expanded };
  }
  return null;
}

function verify(tubesArr, cap, moves) {
  const t = tubesArr.map(x => x.slice());
  for (const [f, to] of moves) {
    if (!canMove(t, cap, f, to)) return false;
    t[to].push(t[f].pop());
  }
  return isWon(t, cap);
}

// ---- generation --------------------------------------------------------------
function randomLevel(spec, rnd) {
  const balls = [];
  for (let c = 0; c < spec.colors; c++) for (let k = 0; k < spec.cap; k++) balls.push(c);
  for (let i = balls.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [balls[i], balls[j]] = [balls[j], balls[i]];
  }
  const tubes = [];
  for (let c = 0; c < spec.colors; c++) tubes.push(balls.slice(c * spec.cap, (c + 1) * spec.cap));
  for (let e = 0; e < spec.empty; e++) tubes.push([]);
  return tubes;
}
function looksGood(tubes, spec) {
  for (const t of tubes) {
    if (!t.length) continue;
    // no tube already sorted, no long same-colour block: it must look mixed
    let run = 1, longest = 1;
    for (let i = 1; i < t.length; i++) { run = t[i] === t[i - 1] ? run + 1 : 1; if (run > longest) longest = run; }
    if (longest >= (spec.cap >= 4 ? 3 : spec.cap)) return false;
  }
  return true;
}

function build() {
  const out = [];
  let prevLen = 0;
  SPECS.forEach((spec, idx) => {
    const rnd = mulberry32(BASE_SEED + idx * 7919);
    const cands = [];
    const seen = new Set();
    let guard = 0;
    while (cands.length < spec.tries && guard++ < spec.tries * 50) {
      const tubes = randomLevel(spec, rnd);
      const sig = JSON.stringify(tubes);
      if (seen.has(sig) || !looksGood(tubes, spec)) continue;
      seen.add(sig);
      const sol = solve(tubes, spec.cap);
      if (!sol || !verify(tubes, spec.cap, sol.moves)) continue;
      cands.push({ tubes, sol });
    }
    let pool = cands.filter(c => c.sol.moves.length > prevLen);
    if (!pool.length) throw new Error('level ' + (idx + 1) + ': no candidate longer than ' + prevLen);
    pool.sort((a, b) => a.sol.moves.length - b.sol.moves.length || (a.sol.optimal ? -1 : 1));
    const at = { min: 0, low: Math.floor(pool.length * 0.25), mid: Math.floor(pool.length * 0.5), high: Math.floor(pool.length * 0.8) }[spec.pick];
    const chosen = pool[at];
    prevLen = chosen.sol.moves.length;
    out.push({ cap: spec.cap, tubes: chosen.tubes, par: prevLen, solution: chosen.sol.moves, optimal: chosen.sol.optimal });
    console.error(`level ${idx + 1}: ${spec.colors} colours, ${spec.colors + spec.empty} tubes, cap ${spec.cap} -> ${prevLen} moves` +
      ` (${chosen.sol.optimal ? 'optimal' : 'not proven optimal'}; ${cands.length} candidates, range ${Math.min(...cands.map(c => c.sol.moves.length))}-${Math.max(...cands.map(c => c.sol.moves.length))})`);
  });
  return out;
}

function render(levels) {
  const L = levels.map(l => `  {cap:${l.cap},par:${l.par},tubes:${JSON.stringify(l.tubes)}}`).join(',\n');
  const S = levels.map(l => `  ${JSON.stringify(l.solution)}`).join(',\n');
  return `/*LEVELS:BEGIN (generated by tools/gen-levels.js, do not edit by hand)*/\n` +
    `var LEVELS=[\n${L}\n];\n` +
    `/* Solver solutions, [from,to] per move. Test use only. */\n` +
    `var SOLUTIONS=[\n${S}\n];\n` +
    `/*LEVELS:END*/`;
}

if (require.main === module) {
  const levels = build();
  const block = render(levels);
  if (process.argv.includes('--write')) {
    const file = path.join(__dirname, '..', 'games', 'tri-couleurs', 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const re = /\/\*LEVELS:BEGIN[\s\S]*?\/\*LEVELS:END\*\//;
    if (!re.test(html)) throw new Error('LEVELS markers not found in ' + file);
    fs.writeFileSync(file, html.replace(re, () => block));
    console.error('written to ' + file);
  } else {
    console.log(block);
  }
}
module.exports = { solve, verify, isWon, canMove, heuristic, build, render };
