'use strict';
// Exhaustive-ish look at the first 3 plies: share of 2-move sequences (all) and 3-move sequences (sample of 150) that lose the level.
const { Worker, isMainThread, parentPort } = require('worker_threads');
const fs = require('fs'); const path = require('path');
const L = require('./lib');
function lose(t, caps, nodes) { const r = L.solve(t, caps, { maxNodes: nodes, weight: 2 }); return r.status === 'unsolvable' ? 1 : r.status === 'unknown' ? 2 : 0; }
function run(j) {
  const lvl = L.decode(j.raw), caps = lvl.caps, rand = L.rng(99 + j.seed);
  const o = { id: j.id, p1: [0, 0, 0], p2: [0, 0, 0], p3: [0, 0, 0] };
  const step = (t, a, b) => { const n = t.map(x => x.slice()); n[b].push(n[a].pop()); return n; };
  const m1 = L.legalMoves(lvl.tubes, caps);
  m1.forEach(([a, b]) => {
    const t1 = step(lvl.tubes, a, b); o.p1[lose(t1, caps, 16000)]++;
    L.legalMoves(t1, caps).forEach(([c, d]) => { if (c === b && d === a) return; o.p2[lose(step(t1, c, d), caps, 6000)]++; });
  });
  for (let i = 0; i < 150; i++) {
    let t = lvl.tubes, pm = null, ok = true;
    for (let k = 0; k < 3 && ok; k++) { const mv = L.legalMoves(t, caps).filter(([a, b]) => !(pm && a === pm[1] && b === pm[0])); if (!mv.length) { ok = false; break; } pm = mv[Math.floor(rand() * mv.length)]; t = step(t, pm[0], pm[1]); }
    if (ok) o.p3[lose(t, caps, 4000)]++;
  }
  return o;
}
if (isMainThread) {
  const D = L.loadAll(); const queue = D.levels.map((l, i) => ({ id: 'N' + (i + 1), raw: l.raw, seed: i + 1 })); const res = []; let live = 0;
  for (let i = 0; i < 4; i++) { const w = new Worker(__filename); live++; const next = () => { const j = queue.shift(); if (!j) { w.terminate(); if (--live === 0) fin(); return; } w.postMessage(j); }; w.on('message', r => { res.push(r); if (res.length % 40 === 0) console.log(res.length); next(); }); next(); }
  function fin() { res.sort((a, b) => +a.id.slice(1) - +b.id.slice(1)); fs.writeFileSync(path.join(L.SCRATCH, 'deep.json'), JSON.stringify(res, null, 1)); console.log('done'); }
} else parentPort.on('message', j => parentPort.postMessage(run(j)));
