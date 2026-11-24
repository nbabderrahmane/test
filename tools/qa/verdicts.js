'use strict';
// Merges every measurement into one verdict per level. Thresholds are mine (documented in the report), not the spec's.
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const S = L.SCRATCH;
const rd = f => JSON.parse(fs.readFileSync(path.join(S, f), 'utf8'));
const an = rd('analyze.json'), sim = rd('sim.json'), opt = rd('opt.json'), p360 = rd('play-360x640.json'), p320 = rd('play-320x568.json'), rend = rd('render.json');
const pct = x => Math.round(x * 100);

const T = { trap: 0.5, trapWatch: 0.3, silent: 0.9, easy: 0.9, jump: 1.4, star: 2, dEasy: 0.85, dHard: 0.02 };
const rows = [];
an.all.forEach(a => {
  const s = sim.find(x => x.id === a.id), o = opt.find(x => x.id === a.id);
  const pl = ['360', '320'].map(k => (k === '360' ? p360 : p320).results.find(r => (r.kind === 'level' ? 'N' + r.n : 'J' + r.n) === a.id));
  const rr = [360, 320].map(w => rend.out.find(r => r.id === a.id && r.w === w));
  const row = {
    id: a.id, kind: a.kind, n: a.n, world: a.world, pos: a.pos, par: a.par, tubes: a.tubes, cap: a.cap, colors: a.colors, mystery: a.mystery, empties: a.empties, shorts: a.shorts,
    played360: pl[0].ok, played320: pl[1].ok, geo360: rr[0].m.f.length === 0, geo320: rr[1].m.f.length === 0, ball320: rr[1].m.ball, sym320: rr[1].m.sym,
    optLen: o.len, naiveWin: s.naive.won, naiveStuck: s.naive.stuck, stuckMin: s.naive.stuckDepthMin, stuckMed: s.naive.stuckMedianDepth, uniWin: s.uniform.won,
    win3: s.naive.win3, doomed: s.probe.doomed, lost40: s.probe.stuck + s.probe.doomed, firstDoomedMed: s.probe.firstDoomedMedian,
    legal: s.first.legal, fatal1: s.first.fatal, imm1: s.first.immediateStuck, trap1: s.first.fatal / s.first.legal, ply2: s.ply2.fatal / Math.max(1, s.ply2.pairs), unkProbe: s.probe.unknown, unk2: s.ply2.unknown / Math.max(1, s.ply2.pairs),
    flags: [], notes: [], sev: 0,
  };
  rows.push(row);
});
const byId = id => rows.find(r => r.id === id);
const N = rows.filter(r => r.kind === 'level');

rows.forEach(r => {
  const f = (sev, code, txt) => { r.flags.push({ sev, code, txt }); r.sev = Math.max(r.sev, sev); };
  // data validity (none expected)
  const a = an.all.find(x => x.id === r.id);
  if (a.problems.length) f(3, 'DONNEES', a.problems.join('; '));
  if (!r.played360 || !r.played320) f(3, 'INJOUABLE', 'solution de référence non gagnée par taps');
  if (!r.geo360 || !r.geo320) f(2, 'RENDU', 'anomalie de géométrie');
  if (r.kind === 'level') {
    if (r.trap1 >= T.trap) f(2, 'PIEGE', `${r.fatal1}/${r.legal} premiers coups rendent le niveau ingagnable (prouvé)` +
      (r.imm1 ? ` ; ${r.imm1} ${r.imm1 > 1 ? 'affichent' : 'affiche'} « Plus aucun coup possible » dès le coup 1` : '') + (r.mystery ? ' ; billes cachées : non devinable' : ''));
    else if (r.trap1 >= T.trapWatch) r.notes.push(`à surveiller : ${r.fatal1}/${r.legal} premiers coups fatals`);
    if (r.doomed >= T.silent) f(1, 'SILENCE', `${pct(r.doomed)} % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message)`);
    if (r.n > 5 && r.pos % 5 !== 1 && r.naiveWin >= T.easy) f(1, 'FACILE', `joueur au hasard gagne ${pct(r.naiveWin)} % des parties (solution ${r.par} coups) : trop simple pour la place ${r.pos} du monde ${r.world}`);
    const prev = r.pos > 1 ? byId('N' + (r.n - 1)) : null;
    if (prev && [3, 4, 0].includes(r.pos % 5) && r.n > 10 && r.par >= prev.par * T.jump) f(1, 'COURBE', `pic : ${r.par} coups après ${prev.par} (+${Math.round((r.par / prev.par - 1) * 100)} %) au sein du même groupe de 5`);
    if (r.optLen !== null && r.par - r.optLen >= T.star) f(1, 'ETOILES', `repère d'étoiles ${r.par} coups, optimum réel ${r.optLen} (A* complet) : le repère 3★ n'est pas l'optimum`);
  } else {
    if (r.naiveWin >= T.dEasy) f(1, 'FACILE', `niveau du jour : joueur au hasard gagne ${pct(r.naiveWin)} % des parties (solution ${r.par} coups, ${r.colors} couleurs)`);
    if (r.naiveWin <= T.dHard) f(1, 'DUR', `niveau du jour : joueur au hasard ne gagne que ${pct(r.naiveWin)} % des parties, ${pct(r.lost40)} % perdues avant le coup 40 (solution ${r.par} coups, ${r.colors} couleurs)`);
    if (r.optLen !== null && r.par - r.optLen >= T.star) f(1, 'ETOILES', `repère ${r.par}, optimum ${r.optLen}`);
  }
});
// world-level peak order (levels 15, 20 ... of each group must grow)
for (let w = 2; w <= 10; w++) {
  const peaks = [5, 10, 15, 20].map(p => byId('N' + ((w - 1) * 20 + p)));
  for (let i = 1; i < 4; i++) if (peaks[i].par < peaks[i - 1].par - 2) {
    const r = peaks[i], q = peaks[i - 1];
    r.flags.push({ sev: 1, code: 'COURBE', txt: `pointe plus basse que la pointe précédente : ${r.par} coups contre ${q.par} au niveau ${q.n} (la fiche demande des pointes croissantes)` }); r.sev = Math.max(r.sev, 1);
  }
}
rows.forEach(r => { r.verdict = r.sev >= 3 ? 'À retirer' : r.sev >= 1 ? 'À revoir' : 'OK'; });
module.exports = { rows, T };

if (require.main === module) {
  const c = { OK: 0, 'À revoir': 0, 'À retirer': 0 };
  rows.forEach(r => c[r.verdict]++);
  console.log(JSON.stringify(c));
  const codes = {};
  rows.forEach(r => r.flags.forEach(f => { (codes[f.code] = codes[f.code] || []).push(r.id); }));
  Object.entries(codes).forEach(([k, v]) => console.log(k, v.length, v.join(' ')));
  console.log('levels', N.filter(r => r.verdict !== 'OK').length, 'daily', rows.filter(r => r.kind === 'daily' && r.verdict !== 'OK').length);
}
