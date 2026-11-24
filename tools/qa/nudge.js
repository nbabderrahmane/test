'use strict';
// Decision 5: when does the "Partie mal engagée ?" message appear? Rules replicated from the game (read in index.html):
//   shown once per game when moves > 2 x par  OR  a known position is met for the 3rd time (undo is not a return).
// Measured on naive walks: false alarms on the reference solutions, share of walks nudged, and delay between the moment a walk is lost and the message.
const { Worker, isMainThread, parentPort } = require('worker_threads');
const fs = require('fs'); const path = require('path');
const L = require('./lib');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const key = t => t.map(x => x.join(',')).join('|');
function run(job) {
  const lvl = L.decode(job.raw), caps = lvl.caps, par = lvl.par;
  const out = { id: job.id, par, ref: null, games: job.games, nudged: 0, nudgedBeforeWin: 0, won: 0, lost: 0, lostNudged: 0, lostNever: 0, gaps: [], nudgeAt: [], stuckNoNudge: 0, stuck: 0, lostStuck: 0, lostNeverSilent: 0, tooEarly: 0 };
  // reference solution must never trigger
  { const t = lvl.tubes.map(x => x.slice()), seen = { [key(t)]: 1 }; let rev = 0, hit = false;
    job.sol.forEach(([a, b], i) => { t[b].push(t[a].pop()); const k = key(t); seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) rev++; if (i + 1 > 2 * par || rev >= 3) hit = true; });
    out.ref = hit; }
  const rand = L.rng(0xA11CE + job.seed);
  const cap = 4 * par + 20;
  for (let g = 0; g < job.games; g++) {
    const t = lvl.tubes.map(x => x.slice()); const seen = { [key(t)]: 1 }; let rev = 0, prev = null, nud = null, doomAt = null, k = 0, end = 'cap';
    for (;;) {
      if (L.isWon(t, caps)) { end = 'won'; break; }
      const mv = L.legalMoves(t, caps);
      if (!mv.length) { end = 'stuck'; break; }
      if (k >= cap) break;
      const w = mv.map(([a, b]) => (prev && a === prev[1] && b === prev[0]) ? 0 : (t[b].length ? 3 : 1) * (t[a].every(c => c === t[a][0]) ? (t[b].length === 0 || t[a].length === t[b].length + 1 ? 0.15 : 0.5) : 1));
      const sum = w.reduce((s, x) => s + x, 0); let pick;
      if (!sum) pick = mv[Math.floor(rand() * mv.length)]; else { let r = rand() * sum, i = 0; while (r >= w[i]) { r -= w[i]; i++; } pick = mv[i]; }
      t[pick[1]].push(t[pick[0]].pop()); prev = pick; k++;
      const kk = key(t); seen[kk] = (seen[kk] || 0) + 1; if (seen[kk] > 1) rev++;
      if (nud === null && !L.isWon(t, caps) && (k > 2 * par || rev >= 3)) { nud = k; const sv = L.solve(t, caps, { maxNodes: 4000, weight: 2 }).status; out.atNudge = out.atNudge || { lost: 0, winnable: 0, unknown: 0, byRevisit: 0 }; out.atNudge[sv === 'unsolvable' ? 'lost' : sv === 'solved' ? 'winnable' : 'unknown']++; if (rev >= 3 && k <= 2 * par) out.atNudge.byRevisit++; }
      if (doomAt === null && k % 4 === 0 && !L.isWon(t, caps)) { if (L.solve(t, caps, { maxNodes: 4000, weight: 2 }).status === 'unsolvable') doomAt = k; }
    }
    if (end === 'stuck') { out.stuck++; if (nud === null) out.stuckNoNudge++; }
    if (end === 'won') { out.won++; if (nud !== null) out.nudgedBeforeWin++; }
    if (nud !== null) { out.nudged++; out.nudgeAt.push(nud); }
    const lost = doomAt !== null || end === 'stuck';
    if (lost) { out.lost++; if (end === 'stuck' && doomAt === null) { out.lostStuck++; } else { if (nud !== null) { out.lostNudged++; out.gaps.push(nud - doomAt); } else { out.lostNever++; if (end !== 'stuck') out.lostNeverSilent = (out.lostNeverSilent || 0) + 1; } } }
  }
  return out;
}
if (isMainThread) {
  const D = L.loadAll(); const queue = [];
  D.levels.forEach((l, i) => queue.push({ id: 'N' + (i + 1), raw: l.raw, sol: D.sol.levels[i], seed: i + 1 }));
  D.daily.forEach((l, i) => queue.push({ id: 'J' + i, raw: l.raw, sol: D.sol.daily[i], seed: 1000 + i }));
  const res = []; let live = 0; const games = opt('games', 60);
  for (let i = 0; i < opt('threads', 4); i++) {
    const w = new Worker(__filename); live++;
    const next = () => { const j = queue.shift(); if (!j) { w.terminate(); if (--live === 0) fin(); return; } w.postMessage({ ...j, games }); };
    w.on('message', r => { res.push(r); if (res.length % 40 === 0) console.log(res.length); next(); }); next();
  }
  function fin() {
    res.sort((a, b) => (a.id[0] === b.id[0] ? +a.id.slice(1) - +b.id.slice(1) : a.id[0] < b.id[0] ? -1 : 1));
    fs.writeFileSync(path.join(L.SCRATCH, 'nudge.json'), JSON.stringify(res, null, 1));
    console.log('refs triggering:', res.filter(r => r.ref).map(r => r.id).join(' ') || 'none');
  }
} else parentPort.on('message', j => parentPort.postMessage(run(j)));
