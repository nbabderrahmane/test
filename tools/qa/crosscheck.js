'use strict';
// Independent exhaustive reachability (no tube sorting, plain BFS) to cross-check the "fatal first move" figures of sim.js.
const L = require('./lib'); const D = L.loadAll();
function reach(tubes, caps, limit) {
  // Independent of lib.solve: plain iterative DFS, no tube sorting (positions keyed by tube order), random move order.
  const key = t => t.map(x => x.join(',')).join('|');
  const seen = new Set([key(tubes)]); const stack = [tubes]; let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  while (stack.length) {
    const t = stack.pop();
    if (t.every((x, i) => x.length === 0 || (x.length === caps[i] && x.every(c => c === x[0])))) return { win: true, states: seen.size };
    const mv = [];
    for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) {
      if (a === b || !t[a].length || t[b].length >= caps[b]) continue;
      if (t[b].length && t[b][t[b].length - 1] !== t[a][t[a].length - 1]) continue;
      mv.push([a, b]);
    }
    mv.sort(() => rnd() - 0.5);
    for (const [a, b] of mv) {
      const n = t.map(x => x.slice()); n[b].push(n[a].pop());
      const k = key(n); if (seen.has(k)) continue; seen.add(k); stack.push(n);
      if (seen.size > limit) return { win: null, states: seen.size };
    }
  }
  return { win: false, states: seen.size };
}
const sim = require(L.SCRATCH + '/sim.json');
let agree = 0, disagree = 0, unknown = 0; const bad = [];
const ids = process.argv.includes('--all') ? D.levels.map((l, i) => 'N' + (i + 1)) : ['N61', 'N63', 'N64', 'N65', 'N67', 'N71', 'N75', 'N124', 'N131', 'N136', 'N162', 'N165', 'N172', 'N180', 'N5', 'N22'];
const t0 = Date.now(); const maxFatal = {};
for (const id of ids) {
  const lvl = id[0] === 'N' ? D.levels[+id.slice(1) - 1] : D.daily[+id.slice(1)];
  let fatal = 0, unk = 0;
  L.legalMoves(lvl.tubes, lvl.caps).forEach(([a, b]) => {
    const t = lvl.tubes.map(x => x.slice()); t[b].push(t[a].pop());
    const r = reach(t, lvl.caps, 1500000);
    if (r.win === false) fatal++; else if (r.win === null) unk++;
  });
  const s = sim.find(x => x.id === id).first;
  const ok = fatal === s.fatal && unk === 0;
  if (!process.argv.includes('--all')) console.log(id, 'independent fatal', fatal, 'unknown', unk, '| sim.js fatal', s.fatal, '/', s.legal, ok ? 'AGREE' : 'DIFFER');
  if (process.argv.includes('--all')) console.log(id, ok ? 'same' : 'DIFFERENT', 'independent', fatal, 'unknown', unk, 'sim.js', s.fatal, '/', s.legal);
  if (ok) agree++; else if (unk) unknown++; else { disagree++; bad.push(id); }
}
console.log(JSON.stringify({ agree, disagree, unknown, bad, seconds: Math.round((Date.now() - t0) / 1000) }));
