'use strict';
// Is the par (star reference) the true optimum? A* with an admissible heuristic, node-capped.
// usage: node tools/qa/opt.js [--threads 4] [--nodes 600000]
const { Worker, isMainThread, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
if (isMainThread) {
  const D = L.loadAll();
  const queue = [];
  D.levels.forEach((l, i) => queue.push({ id: 'N' + (i + 1), raw: l.raw }));
  D.daily.forEach((l, i) => queue.push({ id: 'J' + i, raw: l.raw }));
  const res = []; let live = 0;
  const nodes = opt('nodes', 600000);
  for (let i = 0; i < opt('threads', 4); i++) {
    const w = new Worker(__filename); live++;
    const next = () => { const j = queue.shift(); if (!j) { w.terminate(); if (--live === 0) fin(); return; } w.postMessage({ ...j, nodes }); };
    w.on('message', r => { res.push(r); if (res.length % 20 === 0) console.log(res.length); next(); });
    next();
  }
  function fin() {
    res.sort((a, b) => (a.id[0] === b.id[0] ? +a.id.slice(1) - +b.id.slice(1) : a.id[0] < b.id[0] ? -1 : 1));
    fs.writeFileSync(path.join(L.SCRATCH, 'opt.json'), JSON.stringify(res, null, 1));
    const c = { optimal: 0, shorter: 0, unknown: 0 };
    res.forEach(r => { if (r.status === 'solved') { if (r.len < r.par) c.shorter++; else c.optimal++; } else c.unknown++; });
    console.log(JSON.stringify(c));
  }
} else {
  parentPort.on('message', j => {
    const l = L.decode(j.raw), t0 = Date.now();
    const r = L.solve(l.tubes, l.caps, { maxNodes: j.nodes, weight: 1 });
    parentPort.postMessage({ id: j.id, par: l.par, status: r.status, len: r.len || null, nodes: r.nodes, ms: Date.now() - t0 });
  });
}
