'use strict';
// Static analysis of the 200 levels + 120 daily levels: validity, spec conformity, duplicates, curve, stars.
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const D = L.loadAll();
const OUT = {};
const all = [];
D.levels.forEach((l, i) => all.push({ id: 'N' + (i + 1), kind: 'level', n: i + 1, world: Math.floor(i / 20) + 1, pos: i % 20 + 1, l, sol: D.sol.levels[i] }));
D.daily.forEach((l, i) => all.push({ id: 'J' + i, kind: 'daily', n: i, l, sol: D.sol.daily[i] }));

// ---- A. per-level facts
const WORLD_SPEC = [ // cap, empties(full-height), short, mystery, colours [min,max], par [min,max], first, last
  [4, 2, 0, false, [2, 9], [3, 35], 3, 35], [4, 2, 0, false, [6, 10], [19, 41], 20, 41], [5, 2, 0, false, [4, 8], [17, 46], 17, 46],
  [4, 1, 0, false, [4, 8], [16, 42], 16, 42], [4, 1, 1, false, [4, 8], [13, 37], 13, 37], [4, 2, 0, true, [4, 8], [13, 34], 13, 34],
  [5, 1, 0, false, [4, 8], [21, 70], 23, 70], [4, 1, 1, true, [5, 9], [18, 39], 18, 39], [4, 1, 0, true, [5, 9], [19, 53], 21, 53],
  [5, 1, 1, true, [7, 10], [39, 72], 40, 72]];
all.forEach(o => {
  const l = o.l, cnt = {};
  l.tubes.forEach(t => t.forEach(c => { cnt[c] = (cnt[c] || 0) + 1; }));
  o.colors = Object.keys(cnt).length;
  o.empties = l.tubes.filter((t, i) => !t.length && l.caps[i] === l.cap).length;
  o.shorts = l.caps.filter(c => c < l.cap).length;
  o.shortEmpty = l.tubes.filter((t, i) => !t.length && l.caps[i] < l.cap).length;
  o.par = l.par; o.solLen = o.sol.length;
  o.problems = [];
  // colour counts must be fillable: each colour's count must be a sum of tube capacities
  const caps = [...new Set(l.caps)];
  Object.entries(cnt).forEach(([c, k]) => { if (k !== l.cap && k !== 2) o.problems.push(`colour ${c} has ${k} balls`); });
  const balls = l.tubes.reduce((s, t) => s + t.length, 0);
  const capTot = l.caps.reduce((s, c, i) => s + (l.tubes[i].length ? c : 0), 0);
  o.balls = balls;
  const rp = L.replay(l, o.sol);
  if (!rp.ok) o.problems.push('reference solution does not win in my own replay');
  if (o.par !== o.solLen) o.problems.push(`par ${o.par} != solution length ${o.solLen}`);
  // balls/tube overfill
  l.tubes.forEach((t, i) => { if (t.length > l.caps[i]) o.problems.push('tube ' + i + ' overfull'); });
  // start already won?
  o.startWon = L.isWon(l.tubes, l.caps);
  // solved tubes at start
  o.doneAtStart = l.tubes.filter((t, i) => t.length === l.caps[i] && t.every(c => c === t[0])).length;
  o.h0 = L.h(l.tubes, l.caps);
  o.blockedBalls = o.h0;                 // balls sitting above a different colour
  if (o.kind === 'level') {
    const sp = WORLD_SPEC[o.world - 1];
    const sc = o.l.cap, se = o.empties, ss = o.shorts;
    const lowLevel = o.n <= 2; // spec: world 1 levels 1-2 use cap 3
    if (!lowLevel && sc !== sp[0]) o.problems.push(`cap ${sc} != spec ${sp[0]}`);
    if (!lowLevel && o.empties !== sp[1]) o.problems.push(`${o.empties} empty full tubes != spec ${sp[1]}`);
    if (o.shorts !== sp[2]) o.problems.push(`${o.shorts} short tubes != spec ${sp[2]}`);
    if (l.mystery !== sp[3]) o.problems.push(`mystery ${l.mystery} != spec ${sp[3]}`);
    if (o.colors < sp[4][0] && o.n > 10) o.problems.push(`colours ${o.colors} < spec min ${sp[4][0]}`);
    if (o.colors > sp[4][1]) o.problems.push(`colours ${o.colors} > spec max ${sp[4][1]}`);
    if (o.par < sp[5][0] || o.par > sp[5][1]) o.problems.push(`par ${o.par} outside spec range ${sp[5]}`);
  } else {
    if (l.cap !== 4 || o.empties !== 2 || o.shorts !== 0 || l.mystery) o.problems.push('daily is not plain 4-high / 2 empty / no mechanic');
    if (o.colors < 7 || o.colors > 9) o.problems.push(`daily colours ${o.colors} outside 7-9`);
    if (o.par < 24 || o.par > 37) o.problems.push(`daily par ${o.par} outside 24-37`);
  }
});

// ---- B. per-world table + curve
const worldRows = [];
const parsOf = w => all.filter(o => o.kind === 'level' && o.world === w).map(o => o.par);
for (let w = 1; w <= 10; w++) {
  const p = parsOf(w);
  worldRows.push({ world: w, min: Math.min(...p), med: L.median(p), max: Math.max(...p), first: p[0], last: p[19], pars: p });
}
OUT.worldRows = worldRows;
const dpar = D.daily.map(l => l.par);
OUT.dailyRow = { min: Math.min(...dpar), med: L.median(dpar), max: Math.max(...dpar), pars: dpar };

// curve flags
const curve = [];
all.filter(o => o.kind === 'level').forEach(o => {
  const p = parsOf(o.world), i = o.pos - 1, f = [];
  const nb = [p[i - 1], p[i + 1]].filter(x => x !== undefined);
  // local spike: much longer than both neighbours
  if (i > 0 && i < 19 && p[i] >= p[i - 1] + 8 && p[i] >= p[i + 1] + 8) f.push(`pic isolé : ${p[i]} coups contre ${p[i - 1]} avant et ${p[i + 1]} après`);
  if (i < 19 && i > 0 && p[i] >= p[i - 1] + 10) f.push(`saut de +${p[i] - p[i - 1]} coups par rapport au niveau précédent`);
  // last of world should be max and unique
  if (i === 19) {
    const mx = Math.max(...p);
    if (p[19] !== mx) f.push(`20e niveau (${p[19]}) n'est pas le plus long du monde (max ${mx})`);
    else if (p.filter(x => x === mx).length > 1) f.push(`20e niveau pas seul à sa longueur (${mx} se répète)`);
  }
  // breathing: first of each group of 5 expected as relief
  if (i % 5 === 0 && i > 0 && p[i] >= p[i - 1]) f.push(`pas de respiration au ${o.pos}e niveau (${p[i]} ≥ ${p[i - 1]} avant)`);
  if (i % 5 === 4 && i < 19) { /* peak */ }
  o.curveFlags = f;
});
// world transitions
OUT.transitions = [];
for (let w = 1; w < 10; w++) {
  const a = parsOf(w), b = parsOf(w + 1);
  OUT.transitions.push({ from: w, to: w + 1, lastPar: a[19], firstPar: b[0], jump: b[0] - a[19], medianJump: L.median(b) - L.median(a) });
}
// unusually hard vs rolling median of the world
all.filter(o => o.kind === 'level').forEach(o => {
  const p = parsOf(o.world), i = o.pos - 1;
  const win = p.slice(Math.max(0, i - 3), Math.min(20, i + 4)).filter((x, k, a) => true);
  const med = L.median(win);
  o.localMedian = med;
  if (o.n > 10 && o.par > med * 1.35 && o.pos !== 20 && o.pos % 5 !== 0) o.curveFlags.push(`${o.par} coups vs médiane locale ${med} (×${(o.par / med).toFixed(2)}) hors pointe attendue`);
});

// ---- C. trivial / easy for its place
all.forEach(o => {
  o.trivial = [];
  if (o.startWon) o.trivial.push('déjà gagné au départ');
  if (o.kind === 'level') {
    const p = parsOf(o.world);
    const wmed = L.median(p);
    if (o.n > 10 && o.par < 0.6 * wmed && o.pos !== 1) o.trivial.push(`solution ${o.par} < 60 % de la médiane du monde (${wmed})`);
    if (o.n > 10 && o.doneAtStart >= 2) o.trivial.push(`${o.doneAtStart} tubes déjà rangés au départ`);
    // vs. previous world's median: lower than the previous world's first
  }
  // very short relative to the number of balls
  if (o.balls > 0 && o.par / o.balls < 0.9 && o.n > 10) o.trivial.push(`seulement ${o.par} coups pour ${o.balls} billes (${(o.par / o.balls).toFixed(2)} coup/bille)`);
});

// ---- D. duplicates (exact up to tube order and colour renaming)
const groups = new Map();
all.forEach(o => { const k = L.invariant(o.l); (groups.get(k) || groups.set(k, []).get(k)).push(o); });
const dups = [];
groups.forEach(g => {
  if (g.length < 2) return;
  const done = new Array(g.length).fill(false);
  for (let i = 0; i < g.length; i++) {
    if (done[i]) continue;
    const cls = [g[i]];
    for (let j = i + 1; j < g.length; j++) if (!done[j] && L.isomorphic(g[i].l, g[j].l)) { cls.push(g[j]); done[j] = true; }
    if (cls.length > 1) dups.push(cls.map(o => o.id));
  }
});
OUT.exactDuplicates = dups;
// near duplicates: share most tubes verbatim (same letters, any tube order)
const near = [];
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  const A = all[i], B = all[j];
  if (A.l.tubes.length !== B.l.tubes.length || A.l.cap !== B.l.cap) continue;
  const c = L.sameLabelOverlap(A.l, B.l), nonEmpty = A.l.tubes.filter(t => t.length).length;
  if (c >= Math.max(4, nonEmpty - 2)) near.push([A.id, B.id, c, nonEmpty]);
}
OUT.nearDuplicates = near;
// the same level with only a small difference is also visible when 2 levels share the same tube multiset up to colour renaming for >= 70 % of tubes: use invariant on tube-patterns
const patKey = o => o.l.tubes.map(t => L.pattern(t)).filter(x => x).sort().join('|');
const pk = new Map();
all.forEach(o => { const k = patKey(o); (pk.get(k) || pk.set(k, []).get(k)).push(o.id); });
OUT.samePatternMultiset = [...pk.values()].filter(g => g.length > 1);

// ---- F. stars
OUT.stars = all.map(o => {
  const p = o.par, l0 = p + Math.max(2, Math.ceil(p * 0.15)), l1 = p + Math.max(4, Math.ceil(p * 0.5));
  return { id: o.id, par: p, three: l0, two: l1, slack3: l0 - p, ratio3: l0 / p };
});

OUT.all = all.map(o => ({ id: o.id, kind: o.kind, n: o.n, world: o.world, pos: o.pos, par: o.par, solLen: o.solLen, tubes: o.l.tubes.length, cap: o.l.cap,
  colors: o.colors, empties: o.empties, shorts: o.shorts, mystery: o.l.mystery, balls: o.balls, doneAtStart: o.doneAtStart, h0: o.h0,
  problems: o.problems, trivial: o.trivial, curveFlags: o.curveFlags || [] }));
fs.writeFileSync(path.join(L.SCRATCH, 'analyze.json'), JSON.stringify(OUT, null, 1));

// ---- print summary
console.log('levels with data problems:', all.filter(o => o.problems.length).length);
all.filter(o => o.problems.length).forEach(o => console.log(' ', o.id, o.problems.join('; ')));
console.log('exact duplicates (up to tube order + colour renaming):', JSON.stringify(dups));
console.log('near duplicates (>= tubes verbatim shared):', JSON.stringify(near.slice(0, 40)), near.length);
console.log('same tube-pattern multiset:', JSON.stringify(OUT.samePatternMultiset));
console.log('trivial flags:'); all.filter(o => o.trivial.length).forEach(o => console.log(' ', o.id, 'par', o.par, o.trivial.join('; ')));
console.log('curve flags:'); all.filter(o => o.curveFlags && o.curveFlags.length).forEach(o => console.log(' ', o.id, o.curveFlags.join('; ')));
console.log('world rows:'); worldRows.forEach(r => console.log(r.world, r.min, r.med, r.max, r.pars.join(',')));
console.log('transitions:', JSON.stringify(OUT.transitions));
console.log('daily', JSON.stringify({ min: OUT.dailyRow.min, med: OUT.dailyRow.med, max: OUT.dailyRow.max }));
