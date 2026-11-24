#!/usr/bin/env node
'use strict';
/*
 * Offline level generator + solver for games/tri-couleurs (lot A: 200 levels + 120 daily levels).
 *
 *   node tools/gen-levels.js            -> generates, prints the table of worlds, writes nothing
 *   node tools/gen-levels.js --write    -> rewrites the LEVELS block of games/tri-couleurs/index.html
 *                                          and writes tools/solutions.json (solutions are NOT in the game)
 *   options: --jobs N (worker threads, default = CPU count)
 *
 * Rules modelled (single-ball moves): take the top ball of a tube, drop it on a ball of the same
 * colour or into an empty tube, never into a full tube. A tube has its own capacity (a "short" tube
 * holds 2). Won when every tube is empty or full (to its own capacity) with one colour. Mystery balls
 * only change what the player sees, not the rules, so the solver ignores them.
 *
 * Solver: weighted A* (weight 1 = optimal) with an admissible heuristic. Small levels are solved
 * optimally; bigger ones fall back to heavier weights, so their solution is valid but maybe not
 * the shortest (the star reference is the length of the solution found). Budgets are counted in
 * expanded nodes, never in seconds, so the output is reproducible on any machine.
 *
 * Level string format (one per level):  "<par>|<cap>[m]|<tube>/<tube>/..."
 *   tube = letters a..j, bottom to top; "~" prefix = short tube (capacity 2); empty string = empty tube.
 *   "m" after cap = mystery level.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const BASE_SEED = 20261124;
const SHORT_CAP = 2;

// Worlds of 20 levels, in the order they are played (reordered after the level QA so that the
// measured difficulty never goes down from one world to the next).
//   colors = [fewest, most] colours; m = target median of the composite difficulty.
const WORLDS = [
  { name: 'Le Tiroir',    mech: 'bases',                       cap: 4, empty: 2, short: 0, mystery: false, colors: [2, 7],  m: 30 },
  { name: 'Le Grenier',   mech: 'tube haut',                   cap: 5, empty: 2, short: 0, mystery: false, colors: [4, 7],  m: 31 },
  { name: 'La Brume',     mech: 'billes mystère',              cap: 4, empty: 2, short: 0, mystery: true,  colors: [5, 8],  m: 38 },
  { name: 'La Cave',      mech: 'tube court',                  cap: 4, empty: 1, short: 1, mystery: false, colors: [5, 8],  m: 46 },
  { name: "L'Étagère",    mech: 'plus de couleurs',            cap: 4, empty: 2, short: 0, mystery: false, colors: [7, 10], m: 55 },
  { name: 'Le Placard',   mech: 'un seul tube vide',           cap: 4, empty: 1, short: 0, mystery: false, colors: [4, 7],  m: 62 },
  { name: 'Le Garage',    mech: 'court + mystère',             cap: 4, empty: 1, short: 1, mystery: true,  colors: [7, 10], m: 66 },
  { name: 'Le Hangar',    mech: 'un seul vide + mystère',      cap: 4, empty: 1, short: 0, mystery: true,  colors: [6, 9],  m: 68 },
  { name: "L'Atelier",    mech: 'haut + un seul vide',         cap: 5, empty: 1, short: 0, mystery: false, colors: [5, 8],  m: 83 },
  { name: 'Pile Poil',    mech: 'tout ensemble',               cap: 5, empty: 1, short: 1, mystery: true,  colors: [7, 10], m: 95 },
];
// World 1: levels 1 to 5 can be small (height 3, so that the first steps stay gentle), levels 4 to 10 climb slowly (a random player loses
// more and more often as colours are added, so 6 colours is already a lot for a first world).
const W1_COLORS = [2, 3, 4, 4, 5, 5, 5, 6, 6, 6];
const W1_TARGETS = [5, 8, 10, 12, 15, 18, 21, 24, 27, 30];
const DAILY_COUNT = 120;
const DAILY_COLORS = [6, 7, 8];
const DAILY_BAND = [0.30, 0.55];          // random-player win rate of a daily level (spec: 25 % to 60 %)
const GAMES = 400;                        // random games per win-rate measurement
const FATAL_MAX = 0.25;                   // share of first moves that may lose the level

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- rules -----------------------------------------------------------------
function isWon(tubes, caps) {
  return tubes.every((t, i) => t.length === 0 || (t.length === caps[i] && t.every(c => c === t[0])));
}
function canMove(tubes, caps, from, to) {
  if (from === to) return false;
  const a = tubes[from], b = tubes[to];
  if (!a.length || b.length >= caps[to]) return false;
  return b.length === 0 || b[b.length - 1] === a[a.length - 1];
}
function verify(tubesArr, caps, moves) {
  const t = tubesArr.map(x => x.slice());
  for (const [f, to] of moves) {
    if (!canMove(t, caps, f, to)) return false;
    t[to].push(t[f].pop());
  }
  return isWon(t, caps);
}

// ---- solver (tubes are strings, one char per ball, bottom -> top) ------------
const mono = t => { for (let i = 1; i < t.length; i++) if (t[i] !== t[0]) return false; return true; };

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(x, y) { return x.f < y.f || (x.f === y.f && x.h < y.h); }
  push(n) {
    const a = this.a; let i = a.push(n) - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

function makeSearcher(caps) {
  const maxCap = Math.max.apply(null, caps);
  const uniform = caps.every(c => c === caps[0]);
  const pre = caps.map(c => String.fromCharCode(48 + c));
  const isShort = caps.map(c => c < maxCap);
  const keyOf = uniform ? t => t.slice().sort().join('|') : t => t.map((s, i) => pre[i] + s).sort().join('|');
  // Lower bound on remaining moves. Every ball above the bottom single-colour run must move at least
  // once; among tubes sharing a bottom colour only one run can stay; every ball in a short tube
  // must leave it (a colour never fits in it).
  function heuristic(tubes) {
    let h = 0;
    const sum = {}, max = {};
    for (let i = 0; i < tubes.length; i++) {
      const t = tubes[i];
      if (!t.length) continue;
      if (isShort[i]) { h += t.length; continue; }
      let run = 1;
      while (run < t.length && t[run] === t[0]) run++;
      h += t.length - run;
      sum[t[0]] = (sum[t[0]] || 0) + run;
      if (!(max[t[0]] >= run)) max[t[0]] = run;
    }
    for (const c in sum) h += sum[c] - max[c];
    return h;
  }
  const goalT = (t, i) => t.length === 0 || (t.length === caps[i] && mono(t));

  // exact = no pruning heuristics (only the symmetry of equal empty tubes): needed to prove an optimum.
  function search(start, w, budget, exact) {
    const open = new Heap(), best = new Map();
    let expanded = 0;
    const h0 = heuristic(start), k0 = keyOf(start);
    open.push({ tubes: start, g: 0, h: h0, f: w * h0, key: k0, parent: null, move: null });
    best.set(k0, 0);
    while (open.size) {
      const node = open.pop();
      if (best.get(node.key) < node.g) continue;       // stale
      const tubes = node.tubes;
      if (tubes.every(goalT)) {
        const moves = [];
        for (let n = node; n.parent; n = n.parent) moves.push(n.move);
        return { moves: moves.reverse(), expanded };
      }
      if (++expanded > budget) return { moves: null, expanded, exhausted: false };
      for (let i = 0; i < tubes.length; i++) {
        const a = tubes[i];
        if (!a.length) continue;
        const aMono = mono(a);
        if (!exact && aMono && a.length === caps[i] && !isShort[i]) continue;   // finished tube: never useful to break
        const ball = a[a.length - 1];
        let tried = 0;                                                 // bit per empty-tube capacity already tried
        for (let j = 0; j < tubes.length; j++) {
          if (j === i) continue;
          const b = tubes[j];
          if (b.length >= caps[j]) continue;
          if (b.length === 0) {
            if ((tried >> caps[j]) & 1) continue;                      // symmetric empty tubes
            if (!exact && aMono && caps[j] <= caps[i]) continue;       // pointless shuffle
            tried |= 1 << caps[j];
          } else if (b[b.length - 1] !== ball) continue;
          const next = tubes.slice();
          next[i] = a.slice(0, -1);
          next[j] = b + ball;
          const g = node.g + 1, k = keyOf(next), seen = best.get(k);
          if (seen !== undefined && seen <= g) continue;
          best.set(k, g);
          const h = heuristic(next);
          open.push({ tubes: next, g, h, f: g + w * h, key: k, parent: node, move: [i, j] });
        }
      }
    }
    return { moves: null, expanded, exhausted: true };
  }
  return { search, heuristic };
}

// Status of a position: 'yes' (solvable), 'no' (proved unsolvable: the whole reachable space was
// explored) or 'unknown' (node budget exhausted). Weighted search, only the status matters.
function status(tubesArr, caps, budget, weight) {
  const start = tubesArr.map(t => t.map(c => String.fromCharCode(97 + c)).join(''));
  const r = makeSearcher(caps).search(start, weight || 3, budget || 150000);
  return r.moves ? 'yes' : r.exhausted ? 'no' : 'unknown';
}
// First legal moves of a position and how many of them lose the level for good.
function firstMoves(tubesArr, caps, budget) {
  let legal = 0, fatal = 0, unknown = 0;
  for (let a = 0; a < tubesArr.length; a++) for (let b = 0; b < tubesArr.length; b++) {
    if (!canMove(tubesArr, caps, a, b)) continue;
    legal++;
    const t = tubesArr.map(x => x.slice());
    t[b].push(t[a].pop());
    const st = isWon(t, caps) ? 'yes' : status(t, caps, budget);
    if (st === 'no') fatal++; else if (st === 'unknown') unknown++;
  }
  return { legal, fatal, unknown };
}
// Random player (same policy as tools/qa/sim.js "naive"): never undoes the previous move, likes
// stacking on a colour, dislikes breaking a tube that is already one colour. Returns the win rate.
function naiveWinRate(tubesArr, caps, par, rnd, games) {
  const cap = Math.max(120, par * 4);
  let won = 0;
  for (let g = 0; g < games; g++) {
    const t = tubesArr.map(x => x.slice());
    let prev = null, k = 0;
    for (;;) {
      if (isWon(t, caps)) { won++; break; }
      const mv = [];
      for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) if (canMove(t, caps, a, b)) mv.push([a, b]);
      if (!mv.length || k >= cap) break;
      const wts = mv.map(([a, b]) => {
        if (prev && a === prev[1] && b === prev[0]) return 0;
        let w = t[b].length ? 3 : 1;
        const m = t[a].every(c => c === t[a][0]);
        if (m && (t[b].length === 0 || t[a].length === t[b].length + 1)) w *= 0.15;
        else if (m) w *= 0.5;
        return w;
      });
      const sum = wts.reduce((x, y) => x + y, 0);
      let pick;
      if (sum === 0) pick = mv[Math.floor(rnd() * mv.length)];
      else { let r = rnd() * sum, i = 0; while (r >= wts[i]) { r -= wts[i]; i++; } pick = mv[i]; }
      t[pick[1]].push(t[pick[0]].pop());
      prev = pick; k++;
    }
  }
  return won / games;
}
// Composite difficulty: solution length + 40 x (1 - random-player win rate).
const difficulty = (par, win) => par + 40 * (1 - win);

// Returns {moves, optimal, expanded} or null (unsolvable, or too hard for the budgets below).
function solve(tubesArr, caps) {
  const start = tubesArr.map(t => t.map(c => String.fromCharCode(97 + c)).join(''));
  const balls = start.reduce((s, t) => s + t.length, 0);
  const stages = balls <= 36
    ? [[1, 400000], [1.5, 150000], [2.5, 200000], [5, 250000], [10, 300000]]
    : [[1.5, 200000], [2, 200000], [3, 250000], [6, 250000], [12, 400000]];
  const S = makeSearcher(caps);
  for (const [w, budget] of stages) {
    const r = S.search(start, w, budget);
    if (r.exhausted) return null;
    if (r.moves) return { moves: r.moves, optimal: w === 1, expanded: r.expanded };
  }
  return null;
}

// Share of random playouts (random legal moves, 2 x par moves at most) that end stuck: how
// treacherous the level is. Deterministic given the rnd.
function deadRate(tubesArr, caps, par, rnd, runs) {
  let dead = 0;
  for (let r = 0; r < runs; r++) {
    const t = tubesArr.map(x => x.slice());
    for (let step = 0; step < par * 2; step++) {
      if (isWon(t, caps)) break;
      const opts = [];
      for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) if (canMove(t, caps, a, b)) opts.push([a, b]);
      if (!opts.length) { dead++; break; }
      const [a, b] = opts[Math.floor(rnd() * opts.length)];
      t[b].push(t[a].pop());
    }
  }
  return dead / runs;
}


// ---- generation --------------------------------------------------------------
function randomLevel(spec, rnd) {
  const balls = [];
  for (let c = 0; c < spec.colors; c++) for (let k = 0; k < spec.cap; k++) balls.push(c);
  for (let i = balls.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [balls[i], balls[j]] = [balls[j], balls[i]];
  }
  const tubes = [], caps = [];
  for (let c = 0; c < spec.colors; c++) { tubes.push(balls.slice(c * spec.cap, (c + 1) * spec.cap)); caps.push(spec.cap); }
  for (let e = 0; e < spec.empty; e++) { tubes.push([]); caps.push(spec.cap); }
  for (let s = 0; s < spec.short; s++) { tubes.push([]); caps.push(SHORT_CAP); }
  return { tubes, caps };
}
function looksGood(tubes) {
  for (const t of tubes) {
    if (!t.length) continue;
    // no tube already sorted, no long same-colour block: it must look mixed
    let run = 1, longest = 1;
    for (let i = 1; i < t.length; i++) { run = t[i] === t[i - 1] ? run + 1 : 1; if (run > longest) longest = run; }
    if (longest >= Math.min(3, t.length)) return false;
  }
  return true;
}
// Candidates of one pool (a world at a given colour count): solvable, verified, no trap at the first
// move (spec decision 1), scored with the composite difficulty. Pure function of the spec (seeded).
function makePool(spec) {
  const rnd = mulberry32(spec.seed);
  const pool = [], seen = new Set();
  let attempts = 0;
  while (pool.length < spec.tries && attempts < spec.maxAttempts) {
    attempts++;
    const { tubes, caps } = randomLevel(spec, rnd);
    const sig = JSON.stringify(tubes);
    if (seen.has(sig) || !looksGood(tubes)) continue;
    seen.add(sig);
    const sol = solve(tubes, caps);
    if (!sol || !verify(tubes, caps, sol.moves)) continue;
    const fm = firstMoves(tubes, caps, 60000);
    if (fm.unknown || fm.fatal / fm.legal > spec.maxFatal) continue;
    const par = sol.moves.length;
    const win = naiveWinRate(tubes, caps, par, mulberry32(spec.seed ^ (attempts * 2654435761)), GAMES);
    pool.push({ tubes, caps, moves: sol.moves, par, optimal: sol.optimal, fatal: fm.fatal / fm.legal, win, d: difficulty(par, win) });
  }
  return { id: spec.id, attempts, pool };
}
// Daily pool: plain levels whose random-player win rate sits well inside the band (two independent
// measurements, so that a recount with other seeds stays inside it too).
function makeDailyPool(spec) {
  const rnd = mulberry32(spec.seed);
  const pool = [], seen = new Set();
  let attempts = 0;
  while (pool.length < spec.tries && attempts < spec.maxAttempts) {
    attempts++;
    const { tubes, caps } = randomLevel(spec, rnd);
    const sig = JSON.stringify(tubes);
    if (seen.has(sig) || !looksGood(tubes)) continue;
    seen.add(sig);
    const sol = solve(tubes, caps);
    if (!sol || !verify(tubes, caps, sol.moves)) continue;
    const par = sol.moves.length;
    const w1 = naiveWinRate(tubes, caps, par, mulberry32(spec.seed + attempts * 7919), GAMES);
    if (w1 < DAILY_BAND[0] - 0.04 || w1 > DAILY_BAND[1] + 0.04) continue;
    const w2 = naiveWinRate(tubes, caps, par, mulberry32(spec.seed + attempts * 104729 + 1), GAMES);
    const win = (w1 + w2) / 2;
    if (win < DAILY_BAND[0] || win > DAILY_BAND[1]) continue;
    const fm = firstMoves(tubes, caps, 60000);
    if (fm.unknown || fm.fatal / fm.legal > FATAL_MAX) continue;
    pool.push({ tubes, caps, moves: sol.moves, par, optimal: sol.optimal, fatal: fm.fatal / fm.legal, win, d: difficulty(par, win) });
  }
  return { id: spec.id, attempts, pool };
}
// Shortest solution we can prove (spec decision 4: the star reference is the best known solution).
function optimize(tubesArr, caps, par) {
  const start = tubesArr.map(t => t.map(c => String.fromCharCode(97 + c)).join(''));
  const r = makeSearcher(caps).search(start, 1, 6000000, true);
  return r.moves && r.moves.length < par && verify(tubesArr, caps, r.moves) ? r.moves : null;
}

// ---- level strings -----------------------------------------------------------
function encode(level) {
  const tubes = level.tubes.map((t, i) => (level.caps[i] < level.cap ? '~' : '') + t.map(c => String.fromCharCode(97 + c)).join(''));
  return `${level.par}|${level.cap}${level.mystery ? 'm' : ''}|${tubes.join('/')}`;
}
function decode(str) {
  const [par, head, body] = str.split('|');
  const cap = parseInt(head, 10);
  const caps = [], tubes = body.split('/').map(s => {
    caps.push(s[0] === '~' ? SHORT_CAP : cap);
    return s.replace('~', '').split('').filter(Boolean).map(ch => ch.charCodeAt(0) - 97);
  });
  return { par: +par, cap, caps, mystery: /m/.test(head), tubes };
}
const canon = c => c.tubes.map((t, i) => c.caps[i] + t.join(',')).sort().join('|');

// ---- pools and slots -------------------------------------------------------------
// Sawtooth: groups of 5 levels; the first of a group is a breather, the 5th the group's peak; peaks
// rise through the world and the 20th is its hardest. curve(i) is in [0.1, 1].
function curve(i) {
  const g = Math.floor(i / 5), j = i % 5;
  const peak = 0.5 + 0.5 * g / 3;
  return 0.1 + (peak - 0.1) * j / 4;
}
const targetOf = (w, i) => (w === 0 && i < 10) ? W1_TARGETS[i] : (w === 0 ? 30 : WORLDS[w].m) * (0.84 + 0.36 * curve(i));
function poolSpecs() {
  const specs = [];
  const add = (w, colors, cap, empty, tries) => {
    const W = WORLDS[w], tubesN = colors + empty + W.short;
    const heavy = tubesN >= 12 || (cap === 5 && tubesN >= 10);
    specs.push({ id: `P${w}:${colors}:${cap}:${empty}`, kind: 'pool', world: w, colors, cap, empty, short: W.short, mystery: W.mystery,
      maxFatal: W.mystery ? 0 : FATAL_MAX, tries: tries || (heavy || (empty + W.short < 2 && W.mystery && colors >= 8) ? 16 : tubesN >= 9 ? 24 : 30),
      maxAttempts: 300000, seed: BASE_SEED + 1000 * w + 31 * colors + cap + 7 * empty });
  };
  add(0, 2, 3, 1, 12); add(0, 3, 3, 2, 12); add(0, 4, 3, 2, 12); add(0, 5, 3, 2, 12);
  for (let c = 4; c <= 7; c++) add(0, c, 4, 2);
  for (let w = 1; w < 10; w++) for (let c = WORLDS[w].colors[0]; c <= WORLDS[w].colors[1]; c++) add(w, c, WORLDS[w].cap, WORLDS[w].empty);
  for (const c of DAILY_COLORS) specs.push({ id: 'D' + c, kind: 'daily', colors: c, cap: 4, empty: 2, short: 0, mystery: false,
    tries: 70, maxAttempts: 200000, seed: BASE_SEED + 500000 + c * 977 });
  return specs;
}
// Pools a level may draw from.
function allowed(w, i) {
  if (w === 0) {
    if (i === 0) return [`P0:2:3:1`];
    if (i === 1) return [`P0:3:3:2`];
    if (i === 2) return [`P0:4:3:2`];
    if (i === 3) return [`P0:4:3:2`, `P0:5:3:2`];
    if (i === 4) return [`P0:5:3:2`, `P0:4:4:2`, `P0:5:4:2`];
    const out = [], c0 = i < 10 ? W1_COLORS[i] : 0;
    for (let c = 4; c <= 7; c++) if (i < 10 ? Math.abs(c - c0) <= 1 : c >= 5 && c <= (i >= 15 ? 7 : 6)) out.push(`P0:${c}:4:2`);
    return out;
  }
  const out = [];
  for (let c = WORLDS[w].colors[0]; c <= WORLDS[w].colors[1]; c++) out.push(`P${w}:${c}:${WORLDS[w].cap}:${WORLDS[w].empty}`);
  return out;
}

// ---- selection (sequential, uses the pools) -------------------------------------
const STEP = 1.17, STEP_ABS = 2.9;             // generator margins; the check allows 1.25 and +3
function select(results) {
  const warnings = [], used = new Set(), byId = {};
  results.forEach(r => { byId[r.id] = r; });
  const levels = [], meta = [];
  let prevD = 0;
  for (let w = 0; w < 10; w++) {
    const W = WORLDS[w], worldD = [], worldPar = [];
    for (let i = 0; i < 20; i++) {
      const n = w * 20 + i + 1, target = targetOf(w, i);
      const rising = (w === 0 && i > 0 && i < 10) || (i % 5 > 0), last = i === 19;
      const maxD = Math.max.apply(null, worldD.concat([0])), maxPar = Math.max.apply(null, worldPar.concat([0]));
      const maxFatal = i < 3 ? 0 : (W.mystery ? 0 : FATAL_MAX);
      let cands = [];
      allowed(w, i).forEach(id => byId[id].pool.forEach((c, k) => cands.push({ c, id, k })));
      cands = cands.filter(x => x.c.fatal <= maxFatal && !used.has(canon(x.c)));
      const rules = [
        x => last ? (x.c.d > maxD + 3 && x.c.par > maxPar)
          : rising ? (x.c.d > prevD + 0.5 && x.c.d <= Math.max(prevD * STEP, prevD + STEP_ABS))
            : (i === 0 && w === 0) || x.c.d < prevD - 1,
      ];
      let pickFrom = cands.filter(rules[0]), relaxed = false;
      if (!pickFrom.length) {
        relaxed = true;
        warnings.push(`level ${n}: no candidate satisfies the curve (previous ${prevD.toFixed(1)}, target ${target.toFixed(1)}); relaxed`);
        pickFrom = last ? cands.filter(x => x.c.par > maxPar).sort((a, b) => b.c.d - a.c.d) : rising ? cands.filter(x => x.c.d > prevD) : cands.filter(x => x.c.d < prevD);
        if (!pickFrom.length) pickFrom = cands;
      }
      if (!pickFrom.length) throw new Error('no candidate at all for level ' + n);
      if (!(last && relaxed)) pickFrom.sort((a, b) => Math.abs(a.c.d - target) - Math.abs(b.c.d - target) || a.c.fatal - b.c.fatal || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.k - b.k));
      const ch = pickFrom[0].c;
      used.add(canon(ch));
      levels.push({ par: ch.par, cap: Math.max.apply(null, ch.caps), caps: ch.caps, mystery: W.mystery, tubes: ch.tubes, moves: ch.moves, optimal: ch.optimal });
      meta.push({ d: ch.d, win: ch.win, fatal: ch.fatal, world: w, i });
      worldD.push(ch.d); worldPar.push(ch.par);
      prevD = ch.d;
    }
  }
  // daily levels: spread over the colour counts, deterministic order
  const dailyPools = DAILY_COLORS.map(c => byId['D' + c].pool.filter(x => !used.has(canon(x))));
  const daily = [], dailyMeta = [];
  for (let k = 0; k < DAILY_COUNT; k++) {
    const pool = dailyPools[k % DAILY_COLORS.length];
    const ch = pool.shift();
    if (!ch) throw new Error('daily pool exhausted at ' + k);
    used.add(canon(ch));
    daily.push({ par: ch.par, cap: 4, caps: ch.caps, mystery: false, tubes: ch.tubes, moves: ch.moves, optimal: ch.optimal });
    dailyMeta.push({ d: ch.d, win: ch.win, fatal: ch.fatal });
  }
  return { levels, meta, daily, dailyMeta, warnings };
}
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Checks the curve rules on the final numbers (after the solutions were shortened). Returns problems.
function check(res) {
  const out = [];
  let prev = null;
  const meds = [];
  for (let w = 0; w < 10; w++) {
    const m = res.meta.slice(w * 20, w * 20 + 20), p = res.levels.slice(w * 20, w * 20 + 20).map(l => l.par);
    const d = m.map((x, i) => x.d - (res.levels[w * 20 + i].par0 - res.levels[w * 20 + i].par));   // par shrank: so does d
    meds.push(median(d));
    for (let i = 0; i < 20; i++) {
      if (prev !== null && i < 19 && d[i] > Math.max(prev * 1.25, prev + 3)) out.push(`level ${w * 20 + i + 1}: peak ${d[i].toFixed(1)} after ${prev.toFixed(1)}`);
      prev = d[i];
    }
    if (Math.max.apply(null, d) !== d[19] || Math.max.apply(null, p) !== p[19]) out.push(`world ${w + 1}: level 20 is not the hardest`);
  }
  for (let w = 1; w < 10; w++) if (meds[w] < meds[w - 1] || meds[w] > 1.3 * meds[w - 1]) out.push(`worlds ${w}-${w + 1}: median ${meds[w - 1].toFixed(1)} -> ${meds[w].toFixed(1)}`);
  return out;
}

// ---- output -------------------------------------------------------------------
function renderBlock(res) {
  const L = res.levels.map(l => '  ' + JSON.stringify(encode(l))).join(',\n');
  const D = res.daily.map(l => '  ' + JSON.stringify(encode(l))).join(',\n');
  return `/*LEVELS:BEGIN (generated by tools/gen-levels.js, do not edit by hand)*/\n` +
    `var LEVELS=[\n${L}\n];\n` +
    `var DAILY=[\n${D}\n];\n` +
    `/*LEVELS:END*/`;
}
function table(res) {
  const out = ['| Monde | Nom | Mécaniques | Hauteur | Vides | Couleurs | Solution min / médiane / max | Difficulté médiane | Victoire au hasard (moy.) | Premiers coups fatals (max) |', '|---|---|---|---|---|---|---|---|---|---|'];
  WORLDS.forEach((w, wi) => {
    const ls = res.levels.slice(wi * 20, wi * 20 + 20), m = res.meta.slice(wi * 20, wi * 20 + 20);
    const pars = ls.map(l => l.par), cols = ls.map(l => new Set(l.tubes.flat()).size);
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    out.push(`| ${wi + 1} | ${w.name} | ${w.mech} | ${wi === 0 ? '4 (3 aux niveaux 1 à 4)' : w.cap} | ${w.empty}${w.short ? ' + 1 tube court' : ''} | ${Math.min(...cols)}-${Math.max(...cols)} | ${Math.min(...pars)} / ${median(pars)} / ${Math.max(...pars)} | ${median(m.map(x => x.d)).toFixed(0)} | ${(100 * avg(m.map(x => x.win))).toFixed(0)} % | ${(100 * Math.max(...m.map(x => x.fatal))).toFixed(0)} % |`);
  });
  const dp = res.daily.map(l => l.par), dm = res.dailyMeta;
  out.push(`| Jour (120) | | 4 de haut, 2 vides | 4 | 2 | ${Math.min(...res.daily.map(l => new Set(l.tubes.flat()).size))}-${Math.max(...res.daily.map(l => new Set(l.tubes.flat()).size))} | ${Math.min(...dp)} / ${median(dp)} / ${Math.max(...dp)} | ${median(dm.map(x => x.d)).toFixed(0)} | ${(100 * Math.min(...dm.map(x => x.win))).toFixed(0)}-${(100 * Math.max(...dm.map(x => x.win))).toFixed(0)} % | ${(100 * Math.max(...dm.map(x => x.fatal))).toFixed(0)} % |`);
  out.push('', 'Difficulté par niveau : ' + res.meta.map(x => x.d.toFixed(0)).join(' '));
  return out.join('\n');
}

// ---- parallel work: pools, then optimal solutions ------------------------------------
function runJobs(jobs, nWorkers, label) {
  return new Promise((resolve, reject) => {
    if (!jobs.length) return resolve([]);
    const results = new Array(jobs.length);
    let next = 0, done = 0;
    const workers = [];
    const feed = w => {
      if (next >= jobs.length) return;
      w.__idx = next;
      w.postMessage(jobs[next++]);
    };
    for (let k = 0; k < Math.min(nWorkers, jobs.length); k++) {
      const w = new Worker(__filename);
      w.on('message', r => {
        results[w.__idx] = r;
        done++;
        if (done % 10 === 0 || done === jobs.length) console.error(`  ${label}: ${done}/${jobs.length}`);
        if (done === jobs.length) { workers.forEach(x => x.terminate()); resolve(results); } else feed(w);
      });
      w.on('error', reject);
      workers.push(w);
      feed(w);
    }
  });
}

if (!isMainThread) {
  parentPort.on('message', job => {
    if (job.kind === 'opt') parentPort.postMessage({ id: job.id, moves: optimize(job.tubes, job.caps, job.par) });
    else parentPort.postMessage(job.kind === 'daily' ? makeDailyPool(job) : makePool(job));
  });
} else if (require.main === module) {
  (async () => {
    const t0 = Date.now();
    const jobsArg = process.argv.indexOf('--jobs');
    const jobs = jobsArg > 0 ? +process.argv[jobsArg + 1] : os.cpus().length;
    const specs = poolSpecs();
    console.error(`solving ${specs.length} pools on ${jobs} workers...`);
    const pools = await runJobs(specs, jobs, 'pools');
    pools.forEach(p => { const s = specs.find(x => x.id === p.id); if (p.pool.length < s.tries) console.error(`WARNING pool ${p.id}: ${p.pool.length}/${s.tries} candidates after ${p.attempts} attempts`); });
    const res = select(pools);
    // spec decision 4: shortest known solution as the star reference
    const all = res.levels.concat(res.daily);
    all.forEach(l => { l.par0 = l.par; });
    const shorter = await runJobs(all.map((l, k) => ({ kind: 'opt', id: k, tubes: l.tubes, caps: l.caps, par: l.par })), jobs, 'optimal');
    let improved = 0;
    shorter.forEach((r, k) => { if (r.moves) { all[k].moves = r.moves; all[k].par = r.moves.length; improved++; } });
    console.error(`${improved} of ${all.length} reference solutions shortened by the optimal search`);
    res.warnings.concat(check(res).map(x => 'CHECK ' + x)).forEach(w => console.error('WARNING ' + w));
    console.log(table(res));
    console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (process.argv.includes('--write')) {
      const file = path.join(__dirname, '..', 'games', 'tri-couleurs', 'index.html');
      const html = fs.readFileSync(file, 'utf8');
      const re = /\/\*LEVELS:BEGIN[\s\S]*?\/\*LEVELS:END\*\//;
      if (!re.test(html)) throw new Error('LEVELS markers not found in ' + file);
      fs.writeFileSync(file, html.replace(re, () => renderBlock(res)));
      fs.writeFileSync(path.join(__dirname, 'solutions.json'),
        JSON.stringify({ levels: res.levels.map(l => l.moves), daily: res.daily.map(l => l.moves) }) + '\n');
      console.error('written: games/tri-couleurs/index.html and tools/solutions.json');
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
module.exports = { status, firstMoves, naiveWinRate, difficulty, mulberry32, randomLevel, looksGood, makePool, solve, optimize, verify, isWon, canMove, encode, decode, WORLDS };
