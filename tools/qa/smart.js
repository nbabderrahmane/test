'use strict';
// "Attentive player" proxy (not a human): greedy on visible information, small noise, never plays a move that leaves no legal move,
// uses Undo (backtracks up to 3 moves) when stuck or when it loops. Moves + undos count against a budget of 4 x par + 30.
// Mystery levels: the policy only sees tops and revealed balls (hidden bottoms are never read).
// usage: node tools/qa/smart.js [--threads 4] [--games 100]
const { Worker, isMainThread, parentPort } = require('worker_threads');
const fs = require('fs'); const path = require('path');
const L = require('./lib');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const key = t => t.map(x => x.join(',')).join('|');

function play(lvl, rand, mode) {
  const caps = lvl.caps, t = lvl.tubes.map(x => x.slice());
  const hid = t.map(x => lvl.mystery ? Math.max(0, x.length - 1) : 0);
  const hist = []; const seen = new Map(); let used = 0; const budget = 4 * lvl.par + 30;
  const known = (i, k) => k >= hid[i];
  const score = (a, b) => {
    const A = t[a], B = t[b], c = A[A.length - 1];
    let s = rand() * 0.9;                             // noise
    if (B.length) s += 3; else s += 0;               // stack on same colour rather than fill an empty tube
    const mono = A.every((x, k) => known(a, k) && x === A[0]);
    if (mono && A.length === caps[a]) s -= 6;       // never break a finished tube
    else if (mono && !B.length) s -= 3;
    if (A.length === 1) s += 2;                       // empties a tube
    if (!lvl.mystery) {
      // full information: count balls above the bottom run (same quantity as the admissible heuristic) before/after
      const n = t.map(x => x.slice()); n[b].push(n[a].pop());
      s += (L.h(t, caps) - L.h(n, caps)) * 2.5;
    } else if (A.length >= 2 && known(a, A.length - 2) && A[A.length - 2] === c && B.length) s -= 1;   // visibly uncovers the same colour: pointless
    return s;
  };
  for (;;) {
    if (L.isWon(t, caps)) return { won: true, used };
    if (used >= budget) return { won: false, used, why: 'budget' };
    const mv = L.legalMoves(t, caps).filter(([a, b]) => !(hist.length && hist[hist.length - 1][0] === b && hist[hist.length - 1][1] === a));
    // never play into a position with no legal move (unless it wins)
    const safe = mv.filter(([a, b]) => { const n = t.map(x => x.slice()); n[b].push(n[a].pop()); return L.isWon(n, caps) || L.legalMoves(n, caps).length > 0; });
    const k0 = key(t); seen.set(k0, (seen.get(k0) || 0) + 1);
    if (!safe.length || seen.get(k0) > 2) {   // dead end or loop: undo up to 3 moves
      let u = Math.min(3, hist.length);
      if (!u) return { won: false, used, why: 'stuck-at-start' };
      while (u--) { const [a, b] = hist.pop(); t[a].push(t[b].pop()); used++; }
      continue;
    }
    let best = null, bs = -1e9;
    for (const [a, b] of safe) { const s = score(a, b); if (s > bs) { bs = s; best = [a, b]; } }
    if (rand() < 0.1) best = safe[Math.floor(rand() * safe.length)];
    const [a, b] = best; t[b].push(t[a].pop()); hist.push([a, b]); used++;
    if (hid[a] > 0 && hid[a] === t[a].length) hid[a]--;
  }
}
if (isMainThread) {
  const D = L.loadAll(); const queue = [];
  D.levels.forEach((l, i) => queue.push({ id: 'N' + (i + 1), raw: l.raw, seed: i + 1 }));
  D.daily.forEach((l, i) => queue.push({ id: 'J' + i, raw: l.raw, seed: 1000 + i }));
  const res = []; let live = 0; const games = opt('games', 100);
  for (let i = 0; i < opt('threads', 4); i++) {
    const w = new Worker(__filename); live++;
    const next = () => { const j = queue.shift(); if (!j) { w.terminate(); if (--live === 0) fin(); return; } w.postMessage({ ...j, games }); };
    w.on('message', r => { res.push(r); if (res.length % 40 === 0) console.log(res.length); next(); }); next();
  }
  function fin() { res.sort((a, b) => (a.id[0] === b.id[0] ? +a.id.slice(1) - +b.id.slice(1) : a.id[0] < b.id[0] ? -1 : 1)); fs.writeFileSync(path.join(L.SCRATCH, 'smart.json'), JSON.stringify(res, null, 1)); console.log('done', res.length); }
} else parentPort.on('message', j => {
  const lvl = L.decode(j.raw), rand = L.rng(0x5EED + j.seed); let won = 0; const used = [];
  for (let g = 0; g < j.games; g++) { const r = play(lvl, rand); if (r.won) { won++; used.push(r.used); } }
  parentPort.postMessage({ id: j.id, par: lvl.par, win: won / j.games, medUsed: used.length ? L.median(used) : null });
});
