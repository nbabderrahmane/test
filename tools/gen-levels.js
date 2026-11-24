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

// The 10 levels of lot 1: kept as is (positions 1 to 10), with their original solutions.
const FIXED = [
  {cap:3,tubes:[[1,1,0],[0,0,1],[]],solution:[[1,2],[0,1],[2,0]]},
  {cap:3,tubes:[[1,0,1],[1,0,2],[2,2,0],[],[]],solution:[[2,3],[1,2],[1,3],[0,1],[0,3],[0,1]]},
  {cap:4,tubes:[[2,2,3,1],[0,3,0,1],[0,2,0,3],[1,1,3,2],[],[]],solution:[[3,4],[3,5],[1,3],[0,3],[0,5],[4,0],[1,4],[1,5],[2,5],[2,1],[4,1],[2,0],[2,1]]},
  {cap:4,tubes:[[1,1,4,0],[2,1,1,2],[3,0,2,2],[3,4,0,4],[0,3,4,3],[],[]],solution:[[3,5],[2,6],[2,6],[1,6],[3,2],[3,5],[4,3],[4,5],[4,3],[2,4],[2,4],[2,3],[0,4],[0,5],[1,0],[1,0],[1,6]]},
  {cap:4,tubes:[[0,3,2,4],[0,3,1,0],[1,4,1,3],[2,1,2,4],[2,3,4,0],[],[]],solution:[[3,5],[2,6],[0,5],[3,0],[2,3],[2,5],[3,2],[3,2],[0,3],[0,3],[0,6],[4,0],[4,5],[4,6],[4,3],[1,0],[1,2],[1,6],[1,0]]},
  {cap:4,tubes:[[2,5,3,1],[5,5,1,0],[4,2,0,0],[4,3,1,2],[5,3,1,4],[3,0,4,2],[],[]],solution:[[2,6],[2,6],[5,7],[3,7],[2,7],[5,2],[5,6],[4,2],[3,4],[3,5],[3,2],[4,3],[4,3],[4,5],[1,6],[1,3],[4,1],[0,3],[0,5],[0,1],[0,7]]},
  {cap:4,tubes:[[6,6,0,4],[0,4,4,2],[3,2,2,3],[5,0,5,3],[6,4,6,5],[5,3,1,1],[2,1,0,1],[],[]],solution:[[6,7],[5,7],[5,7],[2,5],[1,2],[1,8],[1,8],[6,1],[6,7],[2,6],[2,6],[2,6],[5,2],[5,2],[4,5],[3,2],[3,5],[3,1],[3,5],[0,8],[0,1],[4,0],[4,8],[4,0]]},
  {cap:4,tubes:[[5,4,6,3],[3,0,4,2],[0,2,3,1],[0,1,5,1],[2,6,6,5],[2,3,4,1],[0,6,4,5],[],[]],solution:[[2,7],[0,2],[0,8],[5,7],[0,5],[6,0],[4,0],[4,8],[4,8],[1,4],[6,1],[6,8],[3,7],[3,0],[3,7],[3,6],[5,3],[5,3],[1,3],[1,3],[1,6],[5,1],[5,4],[2,1],[2,1],[2,4],[2,6]]},
  {cap:4,tubes:[[2,1,4,7],[3,0,7,1],[5,4,6,5],[1,6,1,0],[6,3,4,3],[2,0,6,4],[7,7,5,0],[5,2,2,3],[],[]],solution:[[6,8],[5,9],[2,6],[2,5],[2,9],[6,2],[6,2],[3,8],[1,3],[1,6],[1,8],[7,1],[4,1],[4,9],[4,1],[5,4],[5,4],[5,8],[7,5],[7,5],[7,2],[3,7],[3,7],[3,4],[3,7],[0,6],[0,9],[0,7],[0,5]]},
  {cap:4,tubes:[[5,2,4,4],[6,3,7,8],[1,6,0,3],[0,6,8,4],[5,5,8,3],[2,8,7,2],[2,7,1,0],[1,5,4,6],[3,1,7,0],[],[]],solution:[[8,9],[8,10],[6,9],[8,6],[4,8],[2,8],[2,9],[1,4],[1,10],[1,8],[7,1],[2,1],[6,2],[6,2],[6,10],[5,6],[5,10],[3,7],[5,3],[5,6],[4,5],[4,5],[3,5],[3,5],[3,1],[3,9],[7,3],[7,3],[7,4],[7,2],[0,3],[0,3],[0,6],[0,4]]}
];

// Worlds of 20 levels. colors = [first, last] number of colours reached along the world's curve.
const WORLDS = [
  { name: 'Le Tiroir',    mech: 'bases',                       cap: 4, empty: 2, short: 0, mystery: false, colors: [4, 9] },
  { name: "L'Étagère",    mech: 'plus de couleurs',            cap: 4, empty: 2, short: 0, mystery: false, colors: [6, 10] },
  { name: 'Le Grenier',   mech: 'tube haut',                   cap: 5, empty: 2, short: 0, mystery: false, colors: [4, 8] },
  { name: 'Le Placard',   mech: 'un seul tube vide',           cap: 4, empty: 1, short: 0, mystery: false, colors: [4, 8] },
  { name: 'La Cave',      mech: 'tube court',                  cap: 4, empty: 1, short: 1, mystery: false, colors: [4, 8] },
  { name: 'La Brume',     mech: 'billes mystère',              cap: 4, empty: 2, short: 0, mystery: true,  colors: [4, 8] },
  { name: "L'Atelier",    mech: 'haut + un seul vide',         cap: 5, empty: 1, short: 0, mystery: false, colors: [4, 8] },
  { name: 'Le Garage',    mech: 'court + mystère',             cap: 4, empty: 1, short: 1, mystery: true,  colors: [5, 9] },
  { name: 'Le Hangar',    mech: 'un seul vide + mystère',      cap: 4, empty: 1, short: 0, mystery: true,  colors: [5, 9] },
  { name: 'Pile Poil',    mech: 'tout ensemble',               cap: 5, empty: 1, short: 1, mystery: true,  colors: [7, 10] },
];
const DAILY_COUNT = 120;
const DAILY_COLORS = [7, 8, 9];

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

  function search(start, w, budget) {
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
        if (aMono && a.length === caps[i] && !isShort[i]) continue;   // finished tube: never useful to break
        const ball = a[a.length - 1];
        let tried = 0;                                                 // bit per empty-tube capacity already tried
        for (let j = 0; j < tubes.length; j++) {
          if (j === i) continue;
          const b = tubes[j];
          if (b.length >= caps[j]) continue;
          if (b.length === 0) {
            if ((tried >> caps[j]) & 1) continue;                      // symmetric empty tubes
            if (aMono && caps[j] <= caps[i]) continue;                 // pointless shuffle
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
// Candidates of one slot: solved, verified, scored. Pure function of the spec (seeded).
function makePool(spec) {
  const rnd = mulberry32(spec.seed);
  const pool = [], seen = new Set();
  let guard = 0, attempts = 0;
  while (pool.length < spec.tries && guard++ < spec.tries * (spec.empty + spec.short < 2 ? 3000 : 40)) {
    const { tubes, caps } = randomLevel(spec, rnd);
    const sig = JSON.stringify(tubes);
    if (seen.has(sig) || !looksGood(tubes)) continue;
    seen.add(sig);
    attempts++;
    const sol = solve(tubes, caps);
    if (!sol || !verify(tubes, caps, sol.moves)) continue;
    const par = sol.moves.length;
    const dead = deadRate(tubes, caps, par, rnd, 30);
    pool.push({ tubes, caps, moves: sol.moves, par, optimal: sol.optimal, dead });
  }
  return { id: spec.id, attempts, pool };
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
const canon = level => level.tubes.map((t, i) => level.caps[i] + t.join(',')).sort().join('|');

// ---- slots --------------------------------------------------------------------
// Sawtooth: groups of 5 levels; first of a group is a breather, the 5th the group's peak; peaks
// rise through the world and the 20th is its hardest.
function curve(i) {            // i = 0..19 within the world, returns d in [0.1, 1]
  const g = Math.floor(i / 5), j = i % 5;
  const peak = 0.5 + 0.5 * g / 3;
  return 0.1 + (peak - 0.1) * j / 4;
}
function triesFor(tubesN, last) {
  const base = tubesN <= 7 ? 40 : tubesN <= 9 ? 32 : tubesN <= 11 ? 24 : 16;
  return last ? Math.round(base * 1.5) : base;
}
function levelSlots() {
  const slots = [];
  WORLDS.forEach((w, wi) => {
    for (let i = 0; i < 20; i++) {
      const n = wi * 20 + i + 1;
      if (n <= FIXED.length) continue;
      const d = curve(i);
      const colors = w.colors[0] + Math.round(d * (w.colors[1] - w.colors[0]));
      const tubesN = colors + w.empty + w.short;
      slots.push({ id: 'L' + n, kind: 'level', n, world: wi, i, d, colors, cap: w.cap, empty: w.empty, short: w.short,
        mystery: w.mystery, tries: triesFor(tubesN, i === 19), seed: BASE_SEED + n * 7919 });
    }
  });
  return slots;
}
function dailySlots() {
  const slots = [];
  for (let k = 0; k < DAILY_COUNT; k++) {
    const colors = DAILY_COLORS[k % DAILY_COLORS.length];
    slots.push({ id: 'D' + k, kind: 'daily', n: k, colors, cap: 4, empty: 2, short: 0, mystery: false,
      tries: triesFor(colors + 2, false), seed: BASE_SEED + 100000 + k * 7919 });
  }
  return slots;
}

// ---- selection (sequential, uses the pools) ------------------------------------
const scoreOf = c => c.par + 10 * c.dead;
function pick(pool, q) {
  const s = pool.slice().sort((a, b) => scoreOf(a) - scoreOf(b) || a.par - b.par);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}
function select(pools) {
  const warnings = [], used = new Set(), levels = [], solutions = [], optimal = [];
  const take = (cand, spec) => {
    const lv = { par: cand.par, cap: spec.cap, caps: cand.caps, mystery: spec.mystery, tubes: cand.tubes };
    const k = canon(lv);
    if (used.has(k)) throw new Error('duplicate level ' + spec.id);
    used.add(k);
    return lv;
  };
  FIXED.forEach(f => {
    const caps = f.tubes.map(() => f.cap);
    if (!verify(f.tubes, caps, f.solution)) throw new Error('fixed level has an invalid solution');
    const lv = { par: f.solution.length, cap: f.cap, caps, mystery: false, tubes: f.tubes };
    used.add(canon(lv));
    levels.push(lv); solutions.push(f.solution); optimal.push(null);
  });
  const bySlot = {};
  pools.forEach(p => { bySlot[p.id] = p; });
  levelSlots().forEach(spec => {
    const pool = bySlot[spec.id].pool, wStart = spec.world * 20;
    const worldPars = levels.slice(wStart).map(l => l.par);
    const prev = levels[levels.length - 1].par, worldMax = Math.max.apply(null, worldPars);
    const j = spec.i % 5;
    let cands, q;
    if (spec.i === 19) { cands = pool.filter(c => c.par > worldMax); q = 1; }
    else if (j === 0) { cands = pool.filter(c => c.par < prev); q = 0.15; }
    else { cands = pool.filter(c => c.par > prev); q = 0.2 + 0.6 * j / 4; }
    cands = cands.filter(c => !used.has(canon({ caps: c.caps, tubes: c.tubes })));
    if (!cands.length) {
      warnings.push(`level ${spec.n}: no candidate satisfies the curve (prev ${prev}, world max ${worldMax}); relaxed`);
      cands = pool.filter(c => !used.has(canon({ caps: c.caps, tubes: c.tubes })));
      q = j === 0 ? 0.1 : 0.9;
    }
    if (!cands.length) throw new Error('no candidate at all for level ' + spec.n);
    const c = pick(cands, q);
    levels.push(take(c, spec)); solutions.push(c.moves); optimal.push(c.optimal);
  });
  const daily = [], dailySolutions = [];
  dailySlots().forEach(spec => {
    const cands = bySlot[spec.id].pool.filter(c => !used.has(canon({ caps: c.caps, tubes: c.tubes })));
    if (!cands.length) throw new Error('no candidate for ' + spec.id);
    const c = pick(cands, 0.5);
    daily.push(take(c, spec)); dailySolutions.push(c.moves);
  });
  return { levels, solutions, optimal, daily, dailySolutions, warnings };
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
  const out = [];
  WORLDS.forEach((w, wi) => {
    const ls = res.levels.slice(wi * 20, wi * 20 + 20);
    out.push(`World ${wi + 1} ${w.name} (${w.mech}) : ` + ls.map(l => l.par).join(' '));
    const o = res.optimal.slice(wi * 20, wi * 20 + 20).filter(x => x === true).length;
    out.push(`   proven optimal: ${o}/${wi === 0 ? 10 : 20} generated levels`);
    out.push('   colours: ' + ls.map(l => new Set(l.tubes.flat()).size).join(' ') + ' | tubes: ' + ls.map(l => l.tubes.length).join(' '));
  });
  out.push('Daily pars: ' + res.daily.map(l => l.par).join(' '));
  return out.join('\n');
}

// ---- parallel pools -----------------------------------------------------------
function runPools(specs, jobs) {
  return new Promise((resolve, reject) => {
    const results = new Array(specs.length);
    let next = 0, done = 0;
    const workers = [];
    const feed = w => {
      if (next >= specs.length) { w.terminate(); return; }
      const idx = next++;
      w.__idx = idx;
      w.postMessage(specs[idx]);
    };
    for (let k = 0; k < Math.min(jobs, specs.length); k++) {
      const w = new Worker(__filename);
      w.on('message', r => {
        results[w.__idx] = r;
        done++;
        if (done % 25 === 0 || done === specs.length) console.error(`  ${done}/${specs.length} slots solved`);
        if (done === specs.length) { workers.forEach(x => x.terminate()); resolve(results); } else feed(w);
      });
      w.on('error', reject);
      workers.push(w);
      feed(w);
    }
  });
}

if (!isMainThread) {
  parentPort.on('message', spec => parentPort.postMessage(makePool(spec)));
} else if (require.main === module) {
  (async () => {
    const t0 = Date.now();
    const jobsArg = process.argv.indexOf('--jobs');
    const jobs = jobsArg > 0 ? +process.argv[jobsArg + 1] : os.cpus().length;
    const specs = levelSlots().concat(dailySlots());
    console.error(`solving ${specs.length} slots on ${jobs} workers...`);
    const pools = await runPools(specs, jobs);
    const res = select(pools);
    res.warnings.forEach(w => console.error('WARNING ' + w));
    console.log(table(res));
    console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (process.argv.includes('--write')) {
      const file = path.join(__dirname, '..', 'games', 'tri-couleurs', 'index.html');
      const html = fs.readFileSync(file, 'utf8');
      const re = /\/\*LEVELS:BEGIN[\s\S]*?\/\*LEVELS:END\*\//;
      if (!re.test(html)) throw new Error('LEVELS markers not found in ' + file);
      fs.writeFileSync(file, html.replace(re, () => renderBlock(res)));
      fs.writeFileSync(path.join(__dirname, 'solutions.json'),
        JSON.stringify({ levels: res.solutions, daily: res.dailySolutions }) + '\n');
      console.error('written: games/tri-couleurs/index.html and tools/solutions.json');
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
module.exports = { makePool, levelSlots, dailySlots, solve, verify, isWon, canMove, encode, decode, WORLDS };
