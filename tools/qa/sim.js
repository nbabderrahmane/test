'use strict';
// Naive-player simulation + winnability probes, run in parallel (worker_threads) over the 200 levels + 120 daily levels.
// usage: node tools/qa/sim.js [--threads 4] [--games 200] [--probe 40]
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const SEEDOFF = opt('seedoff', 0);   // different offsets = independent runs of the same simulation

function playGame(lvl, rand, policy, cap) {
  // returns {end:'won'|'stuck'|'cap', moves, trace:[tubes at move k] (only if wanted)}
  const t = lvl.tubes.map(x => x.slice());
  let prev = null, k = 0;
  const caps = lvl.caps;
  for (;;) {
    if (L.isWon(t, caps)) return { end: 'won', moves: k };
    const mv = L.legalMoves(t, caps);
    if (!mv.length) return { end: 'stuck', moves: k };
    if (k >= cap) return { end: 'cap', moves: k };
    let pick;
    if (policy === 'uniform') pick = mv[Math.floor(rand() * mv.length)];
    else {
      // plausible naive player: never undo the previous move, likes stacking on the same colour,
      // dislikes breaking a tube that is already one colour
      const wts = mv.map(([a, b]) => {
        if (prev && a === prev[1] && b === prev[0]) return 0;
        let w = t[b].length ? 3 : 1;
        const mono = t[a].every(c => c === t[a][0]);
        if (mono && (t[b].length === 0 || t[a].length === t[b].length + 1)) w *= 0.15;
        else if (mono) w *= 0.5;
        return w;
      });
      const sum = wts.reduce((s, x) => s + x, 0);
      if (sum === 0) pick = mv[Math.floor(rand() * mv.length)];
      else { let r = rand() * sum, i = 0; while (r >= wts[i]) { r -= wts[i]; i++; } pick = mv[i]; }
    }
    t[pick[1]].push(t[pick[0]].pop());
    prev = pick; k++;
  }
}

function analyseLevel(job) {
  const lvl = L.decode(job.raw);
  const out = { id: job.id, par: lvl.par, mystery: lvl.mystery };
  const GAMES = job.games, cap = Math.max(120, lvl.par * 4);
  for (const policy of ['uniform', 'naive']) {
    const rand = L.rng(0xC0FFEE + job.seed * 7919 + (policy === 'naive' ? 1 : 0));
    let won = 0, stuck = 0, capped = 0, w3 = 0, w2 = 0; const depths = [], winMoves = [];
    const l3 = lvl.par + Math.max(2, Math.ceil(lvl.par * 0.15)), l2 = lvl.par + Math.max(4, Math.ceil(lvl.par * 0.5));
    for (let g = 0; g < GAMES; g++) {
      const r = playGame(lvl, rand, policy, cap);
      if (r.end === 'won') { won++; winMoves.push(r.moves); if (r.moves <= l3) w3++; if (r.moves <= l2) w2++; } else if (r.end === 'stuck') { stuck++; depths.push(r.moves); } else capped++;
    }
    out[policy] = { win3: w3 / GAMES, win2: w2 / GAMES, won: won / GAMES, stuck: stuck / GAMES, capped: capped / GAMES, stuckMedianDepth: depths.length ? L.median(depths) : null,
      stuckDepthMin: depths.length ? Math.min(...depths) : null, winMedian: winMoves.length ? L.median(winMoves) : null };
  }
  // winnability probes along naive trajectories: is the position still winnable after 8, 16, 24 ... moves?
  const rand = L.rng(0xBEEF + job.seed);
  const PROBES = job.probe, CH = [4, 8, 12, 16, 20, 24, 32, 40];
  let doomedGames = 0, stuckGames = 0, unknownGames = 0, firstDoomed = [], checked = 0, solveMs = 0;
  for (let g = 0; g < PROBES; g++) {
    const t = lvl.tubes.map(x => x.slice());
    let prev = null, doomedAt = null, unk = false, stuckAt = null;
    for (let k = 1; k <= CH[CH.length - 1]; k++) {
      const mv = L.legalMoves(t, lvl.caps);
      if (L.isWon(t, lvl.caps)) break;
      if (!mv.length) { stuckGames++; stuckAt = k - 1; break; }
      const wts = mv.map(([a, b]) => (prev && a === prev[1] && b === prev[0]) ? 0 : (t[b].length ? 3 : 1));
      const sum = wts.reduce((s, x) => s + x, 0) || 1; let r = rand() * sum, i = 0;
      while (i < wts.length - 1 && r >= wts[i]) { r -= wts[i]; i++; }
      const pick = mv[i]; t[pick[1]].push(t[pick[0]].pop()); prev = pick;
      if (CH.includes(k)) {
        const t0 = Date.now();
        const s = L.solve(t, lvl.caps, { maxNodes: job.nodes, weight: 2 });
        solveMs += Date.now() - t0; checked++;
        if (s.status === 'unsolvable') { doomedAt = k; break; }
        if (s.status === 'unknown') unk = true;
      }
    }
    if (doomedAt !== null) { doomedGames++; firstDoomed.push(doomedAt); }
    else if (unk) unknownGames++;
  }
  out.probe = { games: PROBES, stuck: stuckGames / PROBES, doomed: doomedGames / PROBES, unknown: unknownGames / PROBES, firstDoomedMedian: firstDoomed.length ? L.median(firstDoomed) : null, checks: checked, ms: solveMs };
  // first-move analysis (what a player must decide at the start)
  const mv0 = L.legalMoves(lvl.tubes, lvl.caps);
  const onto = mv0.filter(([a, b]) => lvl.tubes[b].length).length;
  let fatal = 0, unk0 = 0, imm = 0;
  mv0.forEach(([a, b]) => {
    const t = lvl.tubes.map(x => x.slice()); t[b].push(t[a].pop());
    if (!L.legalMoves(t, lvl.caps).length) imm++;
    const s = L.solve(t, lvl.caps, { maxNodes: job.nodes * 4, weight: 2 });
    if (s.status === 'unsolvable') fatal++; else if (s.status === 'unknown') unk0++;
  });
  out.first = { immediateStuck: imm, legal: mv0.length, ontoSameColour: onto, intoEmpty: mv0.length - onto, fatal, unknown: unk0 };
  // second-ply: fraction of (first,second) move pairs after which the position is lost
  let pairs = 0, fatalPairs = 0, unkPairs = 0;
  mv0.forEach(([a, b]) => {
    const t = lvl.tubes.map(x => x.slice()); t[b].push(t[a].pop());
    L.legalMoves(t, lvl.caps).forEach(([c, d]) => {
      if (c === b && d === a) return;
      const u = t.map(x => x.slice()); u[d].push(u[c].pop());
      pairs++;
      const s = L.solve(u, lvl.caps, { maxNodes: job.nodes, weight: 2 });
      if (s.status === 'unsolvable') fatalPairs++; else if (s.status === 'unknown') unkPairs++;
    });
  });
  out.ply2 = { pairs, fatal: fatalPairs, unknown: unkPairs };
  return out;
}

if (isMainThread) {
  const D = L.loadAll();
  const jobs = [];
  D.levels.forEach((l, i) => jobs.push({ id: 'N' + (i + 1), raw: l.raw, seed: i + 1 }));
  D.daily.forEach((l, i) => jobs.push({ id: 'J' + i, raw: l.raw, seed: 1000 + i }));
  const only = args.indexOf('--ids') >= 0 ? new Set(args[args.indexOf('--ids') + 1].split(',')) : null;
  const queue = jobs.filter(j => !only || only.has(j.id));
  const threads = opt('threads', 4), games = opt('games', 200), probe = opt('probe', 40), nodes = opt('nodes', 4000);
  const results = []; let done = 0;
  const outFile = path.join(L.SCRATCH, args.indexOf('--out') >= 0 ? args[args.indexOf('--out') + 1] : 'sim.json');
  let live = 0;
  const startWorker = () => {
    const w = new Worker(__filename, { workerData: {} });
    live++;
    const next = () => { const j = queue.shift(); if (!j) { w.terminate(); if (--live === 0) finish(); return; } w.postMessage({ ...j, seed: j.seed + SEEDOFF, games, probe, nodes }); };
    w.on('message', r => { results.push(r); if (++done % 20 === 0) console.log(done + '/' + (done + queue.length)); next(); });
    w.on('error', e => { console.error('worker error', e); });
    next();
  };
  const finish = () => {
    results.sort((a, b) => (a.id[0] === b.id[0] ? +a.id.slice(1) - +b.id.slice(1) : a.id[0] < b.id[0] ? -1 : 1));
    fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
    console.log('done', results.length);
  };
  for (let i = 0; i < threads; i++) startWorker();
} else {
  parentPort.on('message', job => parentPort.postMessage(analyseLevel(job)));
}
