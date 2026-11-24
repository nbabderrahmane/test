'use strict';
// Second pass of behaviour checks: at least 2 levels per mechanic (tall tube, single empty tube, short tube, mystery), real taps, 360x640.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const L = require('./lib');
const D = L.loadAll();
const URL = 'file://' + L.HTML;
const log = [];
const rec = (mech, level, check, ok, detail) => { log.push({ mech, level, check, ok: !!ok, detail: detail || '' }); console.log((ok ? ' ok   ' : ' FAIL ') + `[${mech}] N${level} ${check}${detail ? ' :: ' + detail : ''}`); };
const MECH = { 'tube haut': [25, 35, 170], 'un seul tube vide': [105, 110, 150], 'tube court': [65, 70, 125, 190], 'mystère': [45, 55, 130, 185] };

(async () => {
  const b = await chromium.launch();
  const open = async () => { const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }); const p = await ctx.newPage(); await p.goto(URL); await p.waitForFunction(() => !!window.__game); return { ctx, p }; };
  const st = p => p.evaluate(() => window.__game.state());
  const tap = (p, i) => p.locator(`[data-tube="${i}"]`).tap();
  const msg = p => p.evaluate(() => document.querySelector('#msg').textContent);
  const pairs = [];
  for (const [mech, lv] of Object.entries(MECH)) for (const n of lv) pairs.push([mech, n]);
  for (const [mech, n] of pairs) {
    const { ctx, p } = await open();
    const lvl = D.levels[n - 1], sol = D.sol.levels[n - 1];
    await p.evaluate(k => window.__game.loadLevel(k), n);
    // 1. colour mismatch refused with a French message (after the first reference move so that a non-full non-empty target exists)
    await p.evaluate(m => window.__game.applyMove(m[0], m[1]), sol[0]);
    let s = await st(p), a = -1, c = -1;
    for (let i = 0; i < s.tubes.length && a < 0; i++) for (let j = 0; j < s.tubes.length; j++)
      if (i !== j && s.tubes[i].length && s.tubes[j].length && s.tubes[j].length < s.caps[j] && s.tubes[i][s.tubes[i].length - 1] !== s.tubes[j][s.tubes[j].length - 1]) { a = i; c = j; break; }
    if (a >= 0) {
      await tap(p, a); await tap(p, c);
      const s2 = await st(p), m = await msg(p);
      rec(mech, n, 'couleur différente refusée + message', s2.moves === s.moves && m === 'Même couleur ou tube vide seulement.', `« ${m} », coups ${s.moves} -> ${s2.moves}`);
      await tap(p, a);   // deselect
    } else rec(mech, n, 'couleur différente refusée + message', false, 'aucune paire trouvée');
    // 2. move into a full tube refused with message
    s = await st(p);
    const src = s.tubes.findIndex(t => t.length), full = s.tubes.findIndex((t, i) => t.length === s.caps[i] && i !== src && t.length);
    if (full >= 0 && src >= 0) {
      const sel = (await st(p)).selected; if (sel >= 0) await tap(p, sel);
      await tap(p, src); await tap(p, full);
      const s2 = await st(p), m = await msg(p);
      rec(mech, n, 'tube plein refusé + message', s2.moves === s.moves && /plein|Tube court/.test(m), `« ${m} »`);
      await tap(p, src);
    }
    // 3. undo / reset (real taps)
    await p.evaluate(() => { /* reset to a clean state */ });
    await p.locator('#bReset').tap(); await p.waitForTimeout(80);
    const s0 = await st(p);
    const k = Math.min(6, sol.length - 1);
    for (let i = 0; i < k; i++) { await tap(p, sol[i][0]); await tap(p, sol[i][1]); }
    const mid = await st(p);
    await p.locator('#bUndo').tap(); await p.locator('#bUndo').tap();
    const un = await st(p);
    rec(mech, n, 'Annuler x2 (compteur -2, billes revenues)', un.moves === k - 2 && mid.moves === k, `coups ${mid.moves} -> ${un.moves}`);
    // 4. quit and return, reload
    const before = await st(p);
    await p.locator('#bMap').tap(); await p.waitForTimeout(80); await p.locator('#bGBack').tap(); await p.locator('#bWBack').tap();
    await p.locator('#bGo').tap(); await p.waitForTimeout(150);
    const back = await st(p);
    rec(mech, n, 'quitter puis « Continuer » : partie reprise', back.moves === before.moves && JSON.stringify(back.tubes) === JSON.stringify(before.tubes) && JSON.stringify(back.hidden) === JSON.stringify(before.hidden), `coups ${back.moves}/${before.moves}`);
    await p.reload(); await p.waitForFunction(() => !!window.__game);
    await p.locator('#bGo').tap(); await p.waitForTimeout(250);
    const rel = await st(p);
    rec(mech, n, 'recharger la page puis « Continuer » : partie reprise', rel.level === n && rel.moves === before.moves && JSON.stringify(rel.tubes) === JSON.stringify(before.tubes), `niveau ${rel.level}, coups ${rel.moves}`);
    await p.locator('#bReset').tap();
    // 5. dead end signalled (random walk with a fixed seed until no legal move)
    const res = await p.evaluate(() => {
      let seed = 987654321;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let run = 0; run < 60; run++) {
        window.__game.loadLevel(window.__game.state().level);
        for (let t = 0; t < 400; t++) {
          const s = window.__game.state(), mv = [];
          for (let x = 0; x < s.tubes.length; x++) for (let y = 0; y < s.tubes.length; y++)
            if (x !== y && s.tubes[x].length && s.tubes[y].length < s.caps[y] && (!s.tubes[y].length || s.tubes[y][s.tubes[y].length - 1] === s.tubes[x][s.tubes[x].length - 1])) mv.push([x, y]);
          if (!mv.length) return { stuck: s.stuck, moves: s.moves, msg: document.querySelector('#msg').textContent, undo: document.querySelector('#bUndo').className, reset: document.querySelector('#bReset').className, run };
          const m = mv[Math.floor(rnd() * mv.length)];
          window.__game.applyMove(m[0], m[1]);
        }
      }
      return null;
    });
    if (res) {
      rec(mech, n, `impasse signalée (partie ${res.run + 1}, ${res.moves} coups)`, res.stuck && /Plus aucun coup possible/.test(res.msg) && /need/.test(res.undo) && /need/.test(res.reset), `« ${res.msg} », Annuler ${res.undo}, Recommencer ${res.reset}`);
      await p.locator('#bUndo').tap();
      const u = await st(p);
      rec(mech, n, 'Annuler depuis l\'impasse : message effacé', !u.stuck && (await msg(p)) === '', `coups ${res.moves} -> ${u.moves}`);
    } else rec(mech, n, 'impasse signalée', false, 'pas d\'impasse atteinte en 60 parties au hasard');
    await ctx.close();
  }
  // short tube: third ball refused, on 2 levels without and 2 with mystery
  const shortLevels = [];
  for (let n = 1; n <= 200; n++) if (D.levels[n - 1].caps.some(c => c < D.levels[n - 1].cap)) shortLevels.push(n);
  const found = [];
  for (const n of shortLevels) {
    const lvl = D.levels[n - 1], sol = D.sol.levels[n - 1], t = lvl.tubes.map(x => x.slice());
    const shorts = lvl.caps.map((c, i) => c < lvl.cap ? i : -1).filter(i => i >= 0);
    for (let k = 0; k <= sol.length; k++) {
      let hit = null;
      for (const si of shorts) if (t[si].length === 2 && t[si][0] === t[si][1]) {
        const j = t.findIndex((x, i) => i !== si && x.length && x[x.length - 1] === t[si][1]);
        if (j >= 0) hit = { n, k, from: j, si, mystery: lvl.mystery };
      }
      if (hit) { found.push(hit); break; }
      if (k < sol.length) { const [f, to] = sol[k]; t[to].push(t[f].pop()); }
    }
  }
  const pickW = (f) => found.filter(f).slice(0, 2);
  const chosen = [...pickW(h => !h.mystery), ...pickW(h => h.mystery)];
  for (const h of chosen) {
    const { ctx, p } = await open();
    await p.evaluate(([n, sol, k]) => { window.__game.loadLevel(n); for (let i = 0; i < k; i++) window.__game.applyMove(sol[i][0], sol[i][1]); }, [h.n, D.sol.levels[h.n - 1], h.k]);
    const before = await st(p);
    await tap(p, h.from); await tap(p, h.si);
    const after = await st(p), m = await msg(p);
    rec('tube court' + (h.mystery ? ' + mystère' : ''), h.n, '3e bille refusée dans le tube court', after.tubes[h.si].length === 2 && after.moves === before.moves && /Tube court : 2 billes au plus\./.test(m), `« ${m} », billes ${after.tubes[h.si].length}`);
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(path.join(L.SCRATCH, 'behaviors2.json'), JSON.stringify({ log, shortCandidates: found.length }, null, 1));
  console.log('\nfailed:', log.filter(x => !x.ok).length, '/', log.length, ' short-tube candidates:', found.length);
})();
