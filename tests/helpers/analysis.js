'use strict';
/*
 * Independent measurements for the level tests, run in worker threads. Nothing here reads a value
 * written by tools/gen-levels.js: positions come from the game file, the solver is the QA one
 * (tools/qa/lib.js), the random player is re-implemented here.
 *
 *   first : share of first moves after which the level can no longer be won
 *   win   : win rate of a random player (800 games)
 *   opt   : length of the shortest solution (A*, node-capped)
 *   att   : win rate of an "attentive" simulated player (greedy on the visible information, a little
 *           noise, uses Undo when stuck; on mystery levels it only reads tops and revealed balls)
 *   two   : share of two-move openings after which the level is lost for good
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
// Attentive player (same description as tools/qa/smart.js, written again here).
function heuristicAbove(t) {
  let s = 0;
  for (const x of t) { let k = 1; while (k < x.length && x[k] === x[0]) k++; if (x.length) s += x.length - k; }
  return s;
}
function attentive(lvl, seed, games) {
  const rnd = L.rng(seed), caps = lvl.caps, budget = 4 * lvl.par + 30;
  let won = 0;
  for (let g = 0; g < games; g++) {
    const t = lvl.tubes.map(x => x.slice());
    const hid = t.map(x => lvl.mystery ? Math.max(0, x.length - 1) : 0);
    const hist = [], seen = new Map();
    let used = 0;
    for (;;) {
      if (L.isWon(t, caps)) { won++; break; }
      if (used >= budget) break;
      const last = hist.length ? hist[hist.length - 1] : null;
      const mv = L.legalMoves(t, caps).filter(([a, b]) => !(last && last[0] === b && last[1] === a));
      const safe = mv.filter(([a, b]) => {
        const n = t.map(x => x.slice()); n[b].push(n[a].pop());
        return L.isWon(n, caps) || L.legalMoves(n, caps).length > 0;
      });
      const key = t.map(x => x.join(',')).join('|');
      seen.set(key, (seen.get(key) || 0) + 1);
      if (!safe.length || seen.get(key) > 2) {
        let u = Math.min(3, hist.length);
        if (!u) break;
        while (u--) { const [a, b] = hist.pop(); t[a].push(t[b].pop()); used++; }
        continue;
      }
      let best = null, bs = -1e9;
      for (const [a, b] of safe) {
        const A = t[a], B = t[b], c = A[A.length - 1];
        let sc = rnd() * 0.9 + (B.length ? 3 : 0);
        const mono = A.every((x, k) => k >= hid[a] && x === A[0]);
        if (mono && A.length === caps[a]) sc -= 6; else if (mono && !B.length) sc -= 3;
        if (A.length === 1) sc += 2;
        if (!lvl.mystery) { const n = t.map(x => x.slice()); n[b].push(n[a].pop()); sc += (heuristicAbove(t) - heuristicAbove(n)) * 2.5; }
        else if (A.length >= 2 && A.length - 2 >= hid[a] && A[A.length - 2] === c && B.length) sc -= 1;
        if (sc > bs) { bs = sc; best = [a, b]; }
      }
      if (rnd() < 0.1) best = safe[Math.floor(rnd() * safe.length)];
      const [a, b] = best;
      t[b].push(t[a].pop()); hist.push([a, b]); used++;
      if (hid[a] > 0 && hid[a] === t[a].length) hid[a]--;
    }
  }
  return won / games;
}
function twoMoves(lvl) {
  let pairs = 0, fatal = 0, unknown = 0;
  for (const [a, b] of L.legalMoves(lvl.tubes, lvl.caps)) {
    const t = lvl.tubes.map(x => x.slice());
    t[b].push(t[a].pop());
    for (const [c, d] of L.legalMoves(t, lvl.caps)) {
      if (c === b && d === a) continue;
      const u = t.map(x => x.slice());
      u[d].push(u[c].pop());
      pairs++;
      const r = L.solve(u, lvl.caps, { maxNodes: 300000, weight: 2 });
      if (r.status === 'unsolvable') fatal++; else if (r.status === 'unknown') unknown++;
    }
  }
  return { pairs, fatal, unknown };
}
function run(task) {
  const lvl = L.decode(task.raw);
  if (task.type === 'first') return { id: task.id, ...firstMoves(lvl) };
  if (task.type === 'att') return { id: task.id, win: attentive(lvl, task.seed, task.games || 200) };
  if (task.type === 'two') return { id: task.id, ...twoMoves(lvl) };
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
