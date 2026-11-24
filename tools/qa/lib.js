'use strict';
// QA helpers for Pile Poil (read-only on the game). Pure data side: decode, rules, canonical form, solver.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const HTML = path.join(ROOT, 'games', 'tri-couleurs', 'index.html');
const SOLS = path.join(ROOT, 'tools', 'solutions.json');
const SCRATCH = '/tmp/claude-0/-home-user/3653fa57-520f-59f5-9349-580d753a3fad/scratchpad/qa';
const SHORT_CAP = 2;

function decode(str) {
  const p = str.split('|'), cap = parseInt(p[1], 10), caps = [];
  const tubes = p[2].split('/').map(s => {
    const short = s.charAt(0) === '~', t = [];
    caps.push(short ? SHORT_CAP : cap);
    for (let i = short ? 1 : 0; i < s.length; i++) t.push(s.charCodeAt(i) - 97);
    return t;
  });
  return { par: +p[0], cap, caps, mystery: p[1].indexOf('m') > 0, tubes, raw: str };
}
function loadAll() {
  const html = fs.readFileSync(HTML, 'utf8');
  const grab = name => {
    const m = new RegExp('var ' + name + '=\\[([\\s\\S]*?)\\];').exec(html);
    return JSON.parse('[' + m[1] + ']');
  };
  const sols = JSON.parse(fs.readFileSync(SOLS, 'utf8'));
  return {
    levels: grab('LEVELS').map(decode),
    daily: grab('DAILY').map(decode),
    sol: sols,
  };
}

// ---- rules (same as the game) ----
const canMove = (t, caps, a, b) => a !== b && t[a].length > 0 && t[b].length < caps[b] &&
  (t[b].length === 0 || t[b][t[b].length - 1] === t[a][t[a].length - 1]);
const isWon = (t, caps) => t.every((x, i) => x.length === 0 || (x.length === caps[i] && x.every(c => c === x[0])));
function legalMoves(t, caps) {
  const r = [];
  for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) if (canMove(t, caps, a, b)) r.push([a, b]);
  return r;
}
function replay(level, moves) {
  const t = level.tubes.map(x => x.slice());
  for (let i = 0; i < moves.length; i++) {
    const [a, b] = moves[i];
    if (!canMove(t, level.caps, a, b)) return { ok: false, at: i };
    t[b].push(t[a].pop());
  }
  return { ok: isWon(t, level.caps), at: moves.length, tubes: t };
}

// ---- canonical form (tube order and colour names ignored) ----
// Colour relabel by first appearance over tubes sorted by a colour-blind pattern, iterated; exact check below.
function pattern(tube) { const m = {}; let n = 0; return tube.map(c => (c in m ? m[c] : (m[c] = n++))).join(''); }
function invariant(level) {
  const cnt = {};
  level.tubes.forEach(t => t.forEach(c => { cnt[c] = (cnt[c] || 0) + 1; }));
  return level.caps.join('') + '#' + level.tubes.map((t, i) => level.caps[i] + ':' + pattern(t)).sort().join('|') +
    '#' + Object.values(cnt).sort().join('');
}
// exact isomorphism: bijection of tubes + bijection of colours
function isomorphic(A, B) {
  if (A.tubes.length !== B.tubes.length) return false;
  const n = A.tubes.length, used = new Array(n).fill(false), cm = new Map(), cr = new Map();
  function rec(i) {
    if (i === n) return true;
    for (let j = 0; j < n; j++) {
      if (used[j] || A.caps[i] !== B.caps[j] || A.tubes[i].length !== B.tubes[j].length) continue;
      const added = [];
      let ok = true;
      for (let k = 0; k < A.tubes[i].length && ok; k++) {
        const a = A.tubes[i][k], b = B.tubes[j][k];
        if (cm.has(a)) { if (cm.get(a) !== b) ok = false; }
        else if (cr.has(b)) ok = false;
        else { cm.set(a, b); cr.set(b, a); added.push([a, b]); }
      }
      if (ok) { used[j] = true; if (rec(i + 1)) return true; used[j] = false; }
      added.forEach(([a, b]) => { cm.delete(a); cr.delete(b); });
    }
    return false;
  }
  return rec(0);
}
// near-duplicate: best fraction of tubes equal up to a tube permutation, under identity colours
function sameLabelOverlap(A, B) {
  const m = new Map();
  A.tubes.forEach(t => { const k = t.join(''); m.set(k, (m.get(k) || 0) + 1); });
  let c = 0;
  B.tubes.forEach(t => { const k = t.join(''); if (m.get(k) > 0) { m.set(k, m.get(k) - 1); if (k.length) c++; } });
  return c;
}

// ---- solver: A* with admissible heuristic; states = sorted tubes (tube identity ignored) ----
function h(t, caps) {
  // each ball above the bottom same-colour run needs >= 1 move
  let s = 0;
  for (let i = 0; i < t.length; i++) {
    const x = t[i];
    if (!x.length) continue;
    let k = 1;
    while (k < x.length && x[k] === x[0]) k++;
    s += x.length - k;
  }
  return s;
}
const keyOf = (t, caps) => t.map((x, i) => caps[i] + x.map(c => String.fromCharCode(97 + c)).join('')).sort().join('/');
// mode 'opt': returns {status:'solved', len} | {status:'unsolvable'} | {status:'unknown'}; weight>1 = faster, not optimal
function solve(tubes, caps, opts) {
  const maxNodes = (opts && opts.maxNodes) || 200000, w = (opts && opts.weight) || 1;
  const t0 = tubes.map(x => x.slice());
  if (isWon(t0, caps)) return { status: 'solved', len: 0, nodes: 0 };
  // open as buckets by f
  const seen = new Map();
  const k0 = keyOf(t0, caps);
  seen.set(k0, 0);
  const buckets = new Map();
  let minF = Infinity;
  const push = (state, g) => {
    const f = g + w * h(state, caps);
    let b = buckets.get(f);
    if (!b) { b = []; buckets.set(f, b); }
    b.push([state, g]);
    if (f < minF) minF = f;
  };
  push(t0, 0);
  let nodes = 0;
  while (buckets.size) {
    while (!buckets.has(minF)) minF++;
    const b = buckets.get(minF);
    const [t, g] = b.pop();
    if (!b.length) buckets.delete(minF);
    if (seen.get(keyOf(t, caps)) < g) continue;
    nodes++;
    if (nodes > maxNodes) return { status: 'unknown', nodes };
    const mv = legalMoves(t, caps);
    for (const [a, c] of mv) {
      const n = t.map(x => x.slice());
      n[c].push(n[a].pop());
      if (isWon(n, caps)) return { status: 'solved', len: g + 1, nodes };
      const k = keyOf(n, caps);
      const og = seen.get(k);
      if (og !== undefined && og <= g + 1) continue;
      seen.set(k, g + 1);
      push(n, g + 1);
      if (g + 1 + h(n, caps) < minF) minF = g + 1 + h(n, caps);
    }
    if (!buckets.size) break;
  }
  return { status: 'unsolvable', nodes };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

module.exports = { ROOT, HTML, SOLS, SCRATCH, loadAll, decode, canMove, isWon, legalMoves, replay, invariant, isomorphic, sameLabelOverlap, solve, keyOf, h, rng, median, pattern };

// Same A* as solve(), but returns the move list (real tube indices) so a shorter solution can be replayed in the game.
function solvePath(tubes, caps, maxNodes) {
  const t0 = tubes.map(x => x.slice());
  const seen = new Map();            // key -> {g, t, parent, move}
  const k0 = keyOf(t0, caps);
  seen.set(k0, { g: 0, t: t0, parent: null, move: null });
  const buckets = new Map(); let minF = Infinity;
  const push = (k, g, t) => { const f = g + h(t, caps); let b = buckets.get(f); if (!b) { b = []; buckets.set(f, b); } b.push(k); if (f < minF) minF = f; };
  push(k0, 0, t0);
  let nodes = 0;
  while (buckets.size) {
    while (!buckets.has(minF)) minF++;
    const b = buckets.get(minF); const k = b.pop(); if (!b.length) buckets.delete(minF);
    const rec = seen.get(k);
    if (rec.g + h(rec.t, caps) !== minF) continue;
    if (++nodes > maxNodes) return null;
    for (const [a, c] of legalMoves(rec.t, caps)) {
      const n = rec.t.map(x => x.slice()); n[c].push(n[a].pop());
      const nk = keyOf(n, caps);
      if (isWon(n, caps)) {
        const path = [[a, c]]; let r = rec;
        while (r.parent) { path.push(r.move); r = seen.get(r.parent); }
        return path.reverse();
      }
      const o = seen.get(nk);
      if (o && o.g <= rec.g + 1) continue;
      seen.set(nk, { g: rec.g + 1, t: n, parent: k, move: [a, c] });
      push(nk, rec.g + 1, n);
    }
  }
  return null;
}
module.exports.solvePath = solvePath;
