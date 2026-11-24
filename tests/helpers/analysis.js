'use strict';
/*
 * Independent measurements for the level tests, run in worker threads. Nothing here reads a value
 * written by tools/gen-levels.js: positions come from the game file, the solver is the QA one
 * (tools/qa/lib.js), the random player is re-implemented here.
 *
 *   first : share of first moves after which the level can no longer be won
 *   win   : win rate of a random player (800 games)
 *   opt   : length of the shortest solution (A*, node-capped)
 */
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const os = require('node:os');
const L = require('../../tools/qa/lib');

function firstMoves(lvl) {
  let legal = 0, fatal = 0, unknown = 0;
  for (const [a, b] of L.legalMoves(lvl.tubes, lvl.caps)) {
    legal++;
    const t = lvl.tubes.map(x => x.slice());
    t[b].push(t[a].pop());
    const r = L.solve(t, lvl.caps, { maxNodes: 300000, weight: 2 });
    if (r.status === 'unsolvable') fatal++; else if (r.status === 'unknown') unknown++;
  }
  return { legal, fatal, unknown };
}
// Random player: picks among the legal moves, never undoes its previous move, prefers to stack on a
// ball (3x) over an empty tube, rarely breaks a tube that is already one colour.
function winRate(lvl, par, seed, games) {
  const rnd = L.rng(seed), cap = Math.max(120, par * 4);
  let won = 0;
  for (let g = 0; g < games; g++) {
    const t = lvl.tubes.map(x => x.slice());
    let prev = null;
    for (let k = 0; ; k++) {
      if (L.isWon(t, lvl.caps)) { won++; break; }
      const mv = L.legalMoves(t, lvl.caps);
      if (!mv.length || k >= cap) break;
      const w = mv.map(([a, b]) => {
        if (prev && a === prev[1] && b === prev[0]) return 0;
        let x = t[b].length ? 3 : 1;
        const same = t[a].every(c => c === t[a][0]);
        if (same && (!t[b].length || t[a].length === t[b].length + 1)) x *= 0.15; else if (same) x *= 0.5;
        return x;
      });
      const sum = w.reduce((p, q) => p + q, 0);
      let pick;
      if (!sum) pick = mv[Math.floor(rnd() * mv.length)];
      else { let r = rnd() * sum, i = 0; while (r >= w[i]) { r -= w[i]; i++; } pick = mv[i]; }
      t[pick[1]].push(t[pick[0]].pop());
      prev = pick;
    }
  }
  return won / games;
}
function run(task) {
  const lvl = L.decode(task.raw);
  if (task.type === 'first') return { id: task.id, ...firstMoves(lvl) };
  if (task.type === 'win') return { id: task.id, win: winRate(lvl, task.par, task.seed, task.games || 800) };
  const r = L.solve(lvl.tubes, lvl.caps, { maxNodes: task.maxNodes || 400000, weight: 1 });
  return { id: task.id, status: r.status, len: r.len };
}
// Runs the tasks on all cores; resolves with the results in task order.
function runAll(tasks) {
  return new Promise((resolve, reject) => {
    const out = new Array(tasks.length);
    let next = 0, done = 0;
    const n = Math.min(os.cpus().length, tasks.length), workers = [];
    const feed = w => { if (next < tasks.length) { w.idx = next; w.postMessage(tasks[next++]); } };
    for (let k = 0; k < n; k++) {
      const w = new Worker(__filename);
      w.on('message', r => {
        out[w.idx] = r;
        if (++done === tasks.length) { workers.forEach(x => x.terminate()); resolve(out); } else feed(w);
      });
      w.on('error', reject);
      workers.push(w); feed(w);
    }
  });
}
if (!isMainThread) parentPort.on('message', t => parentPort.postMessage(run(t)));
module.exports = { runAll };
