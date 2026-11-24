'use strict';
// Second recette: one verdict per level from my own measurements. Thresholds are the tester's, except where a decision of the sheet sets one.
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const S = L.SCRATCH;
const rd = f => JSON.parse(fs.readFileSync(path.join(S, f), 'utf8'));
const an = rd('analyze.json'), sim = rd('sim.json'), opt = rd('opt.json'), p360 = rd('play-360x640.json'), p320 = rd('play-320x568.json'), rend = rd('render.json');
const smart = rd('smart.json'), deep = rd('deep.json'), nudge = rd('nudge.json');
const pct = x => Math.round(x * 100);
const T = { trap: 0.25, silent: 0.9, easy: 0.9, hard: 0.05, jump: 0.25, jumpFloor: 3 };
const rows = [];
an.all.forEach(a => {
  const s = sim.find(x => x.id === a.id), o = opt.find(x => x.id === a.id), sm = smart.find(x => x.id === a.id), nd = nudge.find(x => x.id === a.id);
  const dp = deep.find(x => x.id === a.id);
  const key = r => (r.kind === 'level' ? 'N' + r.n : 'J' + r.n);
  const pl = [p360, p320].map(p => p.results.find(r => key(r) === a.id));
  const rr = [360, 320].map(w => rend.out.find(r => r.id === a.id && r.w === w));
  const row = {
    id: a.id, kind: a.kind, n: a.n, world: a.world, pos: a.pos, par: a.par, tubes: a.tubes, cap: a.cap, colors: a.colors, mystery: a.mystery, empties: a.empties, shorts: a.shorts,
    played360: pl[0].ok, played320: pl[1].ok, geo360: rr[0].m.f.length === 0, geo320: rr[1].m.f.length === 0, ball320: rr[1].m.ball, sym320: rr[1].m.sym,
    optLen: o.len, naiveWin: s.naive.won, naiveStuck: s.naive.stuck, uniWin: s.uniform.won, win3: s.naive.win3, doomed: s.probe.doomed, lost40: s.probe.stuck + s.probe.doomed,
    legal: s.first.legal, fatal1: s.first.fatal, unk1: s.first.unknown, imm1: s.first.immediateStuck, trap1: s.first.fatal / s.first.legal, ply2: s.ply2.fatal / Math.max(1, s.ply2.pairs),
    smartWin: sm.win, nudgeShare: nd.nudged / nd.games, flags: [], notes: [], sev: 0,
  };
  row.diff = row.par + 40 * (1 - row.naiveWin);
  if (dp) { const t2 = dp.p2[0] + dp.p2[1] + dp.p2[2], t3 = dp.p3[0] + dp.p3[1] + dp.p3[2]; row.ply2d = dp.p2[1] / Math.max(1, t2); row.ply3d = dp.p3[1] / Math.max(1, t3); row.ply2unk = dp.p2[2] / Math.max(1, t2); row.ply3unk = dp.p3[2] / Math.max(1, t3); }
  rows.push(row);
});
const byId = id => rows.find(r => r.id === id);
rows.forEach(r => {
  const f = (sev, code, txt) => { r.flags.push({ sev, code, txt }); r.sev = Math.max(r.sev, sev); };
  const a = an.all.find(x => x.id === r.id);
  if (a.problems.length) f(3, 'DONNEES', a.problems.join('; '));
  if (!r.played360 || !r.played320) f(3, 'INJOUABLE', 'solution de référence non gagnée par taps');
  if (!r.geo360 || !r.geo320) f(2, 'RENDU', 'anomalie de géométrie');
  if (r.optLen !== null && r.par !== r.optLen) f(1, 'ETOILES', `repère ${r.par}, optimum calculé ${r.optLen}`);
  if (r.kind === 'level') {
    if (r.trap1 > T.trap) f(2, 'PIEGE', `${r.fatal1}/${r.legal} premiers coups fatals (> 25 % de la décision 1)`);
    if (r.pos <= 3 && r.fatal1 > 0) f(2, 'PIEGE', `niveau d'introduction (place ${r.pos}) avec ${r.fatal1}/${r.legal} premiers coups fatals`);
    if (r.mystery && r.fatal1 > 0) f(2, 'PIEGE', `niveau mystère avec ${r.fatal1}/${r.legal} premiers coups fatals`);
    if (r.doomed >= T.silent) f(1, 'SILENCE', `${pct(r.doomed)} % des parties naïves sont, avant le coup 40, dans une position perdue mais encore jouable (aucun message)`);
    if (r.n > 5 && r.pos % 5 !== 1 && r.naiveWin >= T.easy) f(1, 'FACILE', `joueur au hasard gagne ${pct(r.naiveWin)} % (solution ${r.par} coups) en place ${r.pos} du monde ${r.world}`);
    if (r.pos !== 20 && r.pos !== 1) {
      const prev = byId('N' + (r.n - 1));
      if (r.diff > Math.max(prev.diff * (1 + T.jump), prev.diff + T.jumpFloor)) f(1, 'COURBE', `difficulté ${r.diff.toFixed(0)} après ${prev.diff.toFixed(0)} (+${Math.round((r.diff / prev.diff - 1) * 100)} %) ; solution ${r.par} après ${prev.par}`);
    }
    if (r.smartWin <= T.hard) f(1, 'MUR', `joueur « attentif » simulé : ${pct(r.smartWin)} % de victoires (au hasard : ${pct(r.naiveWin)} %)`);
  } else {
    if (r.naiveWin < 0.25 || r.naiveWin > 0.60) f(1, r.naiveWin < 0.25 ? 'DUR' : 'FACILE', `niveau du jour : joueur au hasard gagne ${pct(r.naiveWin)} % (décision 3 : 25 à 60 %)`);
  }
});
rows.forEach(r => { r.verdict = r.sev >= 3 ? 'À retirer' : r.sev >= 1 ? 'À revoir' : 'OK'; });
module.exports = { rows, T };
if (require.main === module) {
  const c = {}; rows.forEach(r => { c[r.verdict] = (c[r.verdict] || 0) + 1; });
  console.log(JSON.stringify(c));
  const codes = {}; rows.forEach(r => r.flags.forEach(f => { (codes[f.code] = codes[f.code] || []).push(r.id); }));
  Object.entries(codes).forEach(([k, v]) => console.log(k, v.length, v.join(' ')));
}
