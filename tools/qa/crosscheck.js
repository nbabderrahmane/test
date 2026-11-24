'use strict';
// Independent exhaustive reachability (no tube sorting, plain BFS) to cross-check the "fatal first move" figures of sim.js.
const L = require('./lib'); const D = L.loadAll();
function reach(tubes, caps, limit) {
  const key = t => t.map(x => x.join(',')).join('|');
  const seen = new Set([key(tubes)]); let fr = [tubes];
  while (fr.length) {
    const nx = [];
    for (const t of fr) {
      if (t.every((x, i) => x.length === 0 || (x.length === caps[i] && x.every(c => c === x[0])))) return { win: true, states: seen.size };
      for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) {
        if (a === b || !t[a].length || t[b].length >= caps[b]) continue;
        if (t[b].length && t[b][t[b].length - 1] !== t[a][t[a].length - 1]) continue;
        const n = t.map(x => x.slice()); n[b].push(n[a].pop());
        const k = key(n); if (seen.has(k)) continue; seen.add(k); nx.push(n);
        if (seen.size > limit) return { win: null, states: seen.size };
      }
    }
    fr = nx;
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
    const r = reach(t, lvl.caps, 3000000);
    if (r.win === false) fatal++; else if (r.win === null) unk++;
  });
  const s = sim.find(x => x.id === id).first;
  const ok = fatal === s.fatal && unk === 0;
  if (!process.argv.includes('--all')) console.log(id, 'independent fatal', fatal, 'unknown', unk, '| sim.js fatal', s.fatal, '/', s.legal, ok ? 'AGREE' : 'DIFFER');
  if (!ok) console.log(id, 'DIFFERENT', fatal, unk, s.fatal);
  if (ok) agree++; else if (unk) unknown++; else { disagree++; bad.push(id); }
}
console.log(JSON.stringify({ agree, disagree, unknown, bad, seconds: Math.round((Date.now() - t0) / 1000) }));
