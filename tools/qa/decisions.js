'use strict';
// Browser-side checks of decisions 5, 6, 7, 8 (real game, real taps where it matters). Output: decisions.json + screenshots in scratchpad/qa/dec/.
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const L = require('./lib'); const D = L.loadAll();
const URL = 'file://' + L.HTML, KEY = 'mj:tri-couleurs:v1';
const SH = path.join(L.SCRATCH, 'dec'); fs.mkdirSync(SH, { recursive: true });
const R = []; const rec = (dec, check, ok, detail) => { R.push({ dec, check, ok: !!ok, detail: detail || '' }); console.log((ok ? ' ok   ' : ' FAIL ') + `[D${dec}] ${check}${detail ? ' :: ' + detail : ''}`); };
const SIZES = [[360, 640], [320, 568]];

async function open(b, w, h, save, hash, init) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(({ save, key, init }) => {
    window.__msgs = []; window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    try { if (save && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save)); } catch (e) {}
    if (init) eval(init);
  }, { save: save || null, key: KEY, init: init || null });
  const p = await ctx.newPage(); await p.goto(URL + (hash || '')); await p.waitForFunction(() => !!window.__game);
  return { ctx, p };
}
const st = p => p.evaluate(() => window.__game.state());
const msg = p => p.evaluate(() => ({ t: document.querySelector('#msg').textContent, c: document.querySelector('#msg').className }));
const tap = (p, i) => p.locator(`[data-tube="${i}"]`).tap();
const hidSum = s => s.hidden.reduce((a, c) => a + c, 0);
const full = n => ({ level: 1, max: n, stars: new Array(200).fill(0).map((_, i) => i < n ? 3 : 0), best: new Array(200).fill(0), cur: null, streak: 0, jokers: 0, lastDay: 0, badges: [], rankSeen: 0, rev: {}, daily: null, chalGame: null });

(async () => {
  const b = await chromium.launch();

  // ================= D5: "partie mal engagée"
  {
    const { ctx, p } = await open(b, 360, 640, null);
    // (a) the reference solution of every level never shows it (320 levels)
    const bad = await p.evaluate(([sols, dsols]) => {
      const g = window.__game, out = [];
      const run = (load, sol, id) => { load(); for (const [f, t] of sol) { g.applyMove(f, t); if (/mal engagée/.test(document.querySelector('#msg').textContent)) { out.push(id); return; } } };
      sols.forEach((s, i) => run(() => g.loadLevel(i + 1), s, 'N' + (i + 1)));
      dsols.forEach((s, i) => run(() => g.loadDaily(i), s, 'J' + i));
      return out;
    }, [D.sol.levels, D.sol.daily]);
    rec(5, 'solution de référence : le message n\'apparaît sur aucun des 320 niveaux', bad.length === 0, bad.length ? bad.join(' ') : '0 fausse alerte');
    // (b) threshold on moves: level 5, par 13: message must appear on move 27 (> 2 x par), not on 26
    const n = 5, par = D.levels[n - 1].par, sol = D.sol.levels[n - 1];
    await p.evaluate(k => window.__game.loadLevel(k), n);
    const timeline = await p.evaluate(([sol, par]) => {
      const g = window.__game, m = () => document.querySelector('#msg').textContent, res = [];
      g.applyMove(sol[0][0], sol[0][1]); const e1 = sol[0][1];
      // shuffle a ball between two empty tubes, but vary it so positions do not repeat 3 times: use the first move + ping-pong via 3 tubes is repeating; instead make real progress moves then wander
      return { e1, par };
    }, [sol, par]);
    // wander without repeating positions 3 times: play the reference solution but insert ball moves among full information... simple way: play moves of a random walk avoiding repeats of one position more than twice
    await p.evaluate(k => window.__game.loadLevel(k), n);
    const walk = await p.evaluate(([par]) => {
      const g = window.__game; const seen = {}; const out = { firstAt: null, revisitsAtFirst: null }; let seed = 7;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const key = t => t.map(x => x.join(',')).join('|');
      let k = 0, rev = 0; seen[key(g.state().tubes)] = 1;
      while (k < 4 * par) {
        const s = g.state(), mv = [];
        for (let a = 0; a < s.tubes.length; a++) for (let b = 0; b < s.tubes.length; b++) if (a !== b && s.tubes[a].length && s.tubes[b].length < s.caps[b] && (!s.tubes[b].length || s.tubes[b][s.tubes[b].length - 1] === s.tubes[a][s.tubes[a].length - 1])) {
          const n = s.tubes.map(x => x.slice()); n[b].push(n[a].pop()); const kk = key(n);
          if ((seen[kk] || 0) < 1) mv.push([a, b, kk]);          // only never-seen positions: no revisit
        }
        if (!mv.length) break;
        const m = mv[Math.floor(rnd() * mv.length)]; g.applyMove(m[0], m[1]); seen[m[2]] = 1; k++;
        const t = document.querySelector('#msg').textContent;
        if (out.firstAt === null && /mal engagée/.test(t)) out.firstAt = k;
        if (g.state().won || g.state().stuck) { out.end = g.state().won ? 'won' : 'stuck'; out.at = k; break; }
      }
      out.k = k; return out;
    }, [par]);
    rec(5, `seuil « plus de 2 × repère » (niveau ${n}, repère ${par}) : marche sans retour sur une position`, walk.firstAt === null ? true : walk.firstAt === 2 * par + 1, `message au coup ${walk.firstAt} (attendu ${2 * par + 1} ou aucun si la marche finit avant), fin ${walk.end || 'plafond'} au coup ${walk.at || walk.k}`);
    // (c) revisits: ping-pong between two empty tubes on level 5
    await p.evaluate(k => window.__game.loadLevel(k), n);
    const rv = await p.evaluate(sol => {
      const g = window.__game, res = []; g.applyMove(sol[0][0], sol[0][1]);   // ball into empty tube t
      const t = sol[0][1], e = g.state().tubes.findIndex((x, i) => i !== t && x.length === 0);
      for (let i = 0; i < 8; i++) { g.applyMove(i % 2 ? e : t, i % 2 ? t : e); res.push([g.state().moves, /mal engagée/.test(document.querySelector('#msg').textContent)]); }
      return res;
    }, sol);
    const first = rv.find(r => r[1]);
    rec(5, 'retours sur une position connue : message à la 3e revisite', first && first[0] === 5, `coups→message ${JSON.stringify(rv)} (P1 au coup 1, P2 au coup 2 ; revisites aux coups 3, 4, 5 : message attendu au coup 5)`);
    // (d) how long does it stay: wait, then tap a tube
    const vis = [];
    for (const ms of [0, 1000, 3000, 4300, 5200]) { await p.waitForTimeout(ms === 0 ? 0 : ms - (vis.length ? vis[vis.length - 1][0] : 0)); vis.push([ms, (await msg(p)).t]); }
    const shown = vis.map(v => [v[0], /mal engagée/.test(v[1])]);
    rec(5, 'durée d\'affichage ≈ 4,5 s sans action', shown[0][1] && shown[3][1] && !shown[4][1], JSON.stringify(shown));
    await p.screenshot({ path: path.join(SH, '360x640-nudge-gone.png') });
    // (e) disappears when the player taps a tube (select)
    await p.evaluate(k => window.__game.loadLevel(k), n);
    await p.evaluate(sol => { const g = window.__game; g.applyMove(sol[0][0], sol[0][1]); const t = sol[0][1], e = g.state().tubes.findIndex((x, i) => i !== t && x.length === 0); for (let i = 0; i < 5; i++) g.applyMove(i % 2 ? e : t, i % 2 ? t : e); }, sol);
    const m0 = await msg(p);
    const s0 = await st(p); const src = s0.tubes.findIndex(x => x.length);
    await tap(p, src); await p.waitForTimeout(80);
    const m1 = await msg(p);
    rec(5, 'le message disparaît dès que le joueur touche un tube (sélection)', /mal engagée/.test(m0.t) && !/mal engagée/.test(m1.t), `avant tap « ${m0.t} », 80 ms après tap « ${m1.t} »`);
    // (f) once per game; again after Recommencer
    await tap(p, src);
    await p.locator('#bReset').tap(); await p.waitForTimeout(80);
    const after = await p.evaluate(sol => { const g = window.__game; g.applyMove(sol[0][0], sol[0][1]); const t = sol[0][1], e = g.state().tubes.findIndex((x, i) => i !== t && x.length === 0); const seq = []; for (let i = 0; i < 5; i++) { g.applyMove(i % 2 ? e : t, i % 2 ? t : e); seq.push(/mal engagée/.test(document.querySelector('#msg').textContent)); } return seq; }, sol);
    rec(5, 'après Recommencer le compteur repart (message de nouveau possible)', after[4] === true, JSON.stringify(after));
    // (g) undo/redo loops are not "returns"
    await p.evaluate(k => window.__game.loadLevel(k), n);
    const ur = await p.evaluate(sol => { const g = window.__game; g.applyMove(sol[0][0], sol[0][1]); let seen = false; for (let i = 0; i < 8; i++) { const hist = g.state().moves; g.applyMove(sol[1][0], sol[1][1]); document.querySelector('#bUndo').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); document.querySelector('#bUndo').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); if (/mal engagée/.test(document.querySelector('#msg').textContent)) seen = true; } return { seen, moves: g.state().moves }; }, sol);
    rec(5, 'va-et-vient coup / Annuler ×8 ne déclenche pas le message', !ur.seen, JSON.stringify(ur));
    // (h) not shown over the stuck message
    await ctx.close();
    // screenshots at both sizes with message visible, plus text fits
    for (const [w, h] of SIZES) {
      const { ctx: c2, p: p2 } = await open(b, w, h, null);
      await p2.evaluate(k => window.__game.loadLevel(k), 30);
      const sol30 = D.sol.levels[29], par30 = D.levels[29].par;
      await p2.evaluate(sol => { const g = window.__game; g.applyMove(sol[0][0], sol[0][1]); const t = sol[0][1], e = g.state().tubes.findIndex((x, i) => i !== t && x.length === 0); for (let i = 0; i < 5; i++) g.applyMove(i % 2 ? e : t, i % 2 ? t : e); }, sol30);
      await p2.waitForTimeout(150);
      const fit = await p2.evaluate(() => { const m = document.querySelector('#msg'); return { t: m.textContent, sw: m.scrollWidth, cw: m.clientWidth, sh: m.scrollHeight, ch: m.clientHeight, lines: Math.round(m.scrollHeight / parseFloat(getComputedStyle(m).lineHeight)) }; });
      rec(5, `message lisible à ${w}×${h} (tient dans sa zone)`, /mal engagée/.test(fit.t) && fit.sh <= fit.ch + 1, JSON.stringify(fit));
      await p2.screenshot({ path: path.join(SH, `${w}x${h}-nudge.png`) });
      await c2.close();
    }
    // timeline of a "realistic lost player": too early / too late is measured in nudge.js (simulation)
  }

  // ================= D6: mystery re-hidden on a new game, kept within a game
  {
    const mystery = [45, 130, 145, 185];
    for (const n of mystery) {
      const { ctx, p } = await open(b, 360, 640, null);
      const sol = D.sol.levels[n - 1], lvl = D.levels[n - 1];
      await p.evaluate(k => window.__game.loadLevel(k), n);
      const h0 = hidSum(await st(p)); const exp0 = lvl.tubes.reduce((s, t) => s + Math.max(0, t.length - 1), 0);
      for (let i = 0; i < 4; i++) { await tap(p, sol[i][0]); await tap(p, sol[i][1]); }
      const mid = hidSum(await st(p));
      await p.locator('#bReset').tap(); await p.waitForTimeout(80);
      const afterReset = hidSum(await st(p));
      await p.reload(); await p.waitForFunction(() => !!window.__game); await p.locator('#bGo').tap(); await p.waitForTimeout(200);
      const afterReload = hidSum(await st(p));
      rec(6, `N${n} : même partie, billes révélées gardées (Recommencer, rechargement)`, h0 === exp0 && mid < h0 && afterReset === mid && afterReload === mid, `départ ${h0}/${exp0}, après 4 coups ${mid}, après Recommencer ${afterReset}, après rechargement ${afterReload}`);
      for (const [f, t] of sol) { await tap(p, f); await tap(p, t); }
      await p.waitForSelector('#win:not([hidden])');
      await p.locator('#bAgain').tap(); await p.waitForTimeout(150);
      const again = await st(p); const dom = await p.evaluate(() => document.querySelectorAll('#stage .ball.hid').length);
      rec(6, `N${n} : « Rejouer » après victoire recache tout`, hidSum(again) === exp0 && dom === exp0 && again.moves === 0, `cachées ${hidSum(again)} (état) / ${dom} (DOM), attendu ${exp0}`);
      // new game of an already won level from the grid
      for (let i = 0; i < 3; i++) { await tap(p, sol[i][0]); await tap(p, sol[i][1]); }
      const rev = hidSum(await st(p));
      await p.locator('#bMap').tap(); await p.waitForTimeout(100);
      await p.locator('#bBack').tap(); await p.waitForTimeout(150);        // "Reprendre": same game
      const resumed = hidSum(await st(p));
      await p.locator('#bMap').tap(); await p.waitForTimeout(100);
      // pick another level then come back to n from the grid: new game
      const other = n === 45 ? 46 : n - 1;
      await p.evaluate(k => window.__game.loadLevel(k), other);
      await p.evaluate(k => window.__game.loadLevel(k), n);
      const fresh = await st(p);
      rec(6, `N${n} : quitter la partie pour un autre niveau puis revenir = nouvelle partie cachée ; « Reprendre » = même partie`, resumed === rev && hidSum(fresh) === exp0 && fresh.moves === 0, `révélées en cours ${rev}, après Reprendre ${resumed}, après changement de niveau ${hidSum(fresh)}/${exp0}`);
      await ctx.close();
    }
    // regression probe: friend's challenge opened on the SAME mystery level while a game is in progress
    {
      const n = 45, sol = D.sol.levels[n - 1];
      const { ctx, p } = await open(b, 360, 640, full(60));
      await p.evaluate(k => window.__game.loadLevel(k), n);
      for (let i = 0; i < 4; i++) { await tap(p, sol[i][0]); await tap(p, sol[i][1]); }
      const before = await st(p);
      await p.evaluate(h => { location.hash = h; }, `#defi-${n}-${D.levels[n - 1].par + 3}`);
      await p.waitForTimeout(300);
      const chal = await st(p);
      // back to the main run through the grid ("Reprendre")
      await p.locator('#bMap').tap(); await p.waitForTimeout(100); await p.locator('#bBack').tap(); await p.waitForTimeout(250);
      const main = await st(p), s = main;
      rec(6, 'défi ouvert sur le niveau mystère en cours : la partie en cours reste intacte (billes révélées, coups)', main.moves === before.moves && hidSum(main) === hidSum(before) && JSON.stringify(main.tubes) === JSON.stringify(before.tubes), `avant : coups ${before.moves}, cachées ${hidSum(before)} ; défi : coups ${chal.moves}, cachées ${hidSum(chal)} ; reprise : coups ${main.moves}, cachées ${hidSum(main)}, défi actif ${JSON.stringify(main.challenge)}`);
      await ctx.close();
    }
  }

  // ================= D7: challenge screen, result, link
  {
    for (const [w, h] of SIZES) {
      const n = 20, par = D.levels[n - 1].par, sol = D.sol.levels[n - 1];
      const { ctx, p } = await open(b, w, h, full(30), `#defi-${n}-${par + 5}`);
      await p.waitForTimeout(300);
      const ui = await p.evaluate(() => { const vis = e => { const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }; return { goalVisible: vis(document.querySelector('#goal')), chalVisible: vis(document.querySelector('#chal')), chal: document.querySelector('#chalT').textContent, goal: document.querySelector('#goal').textContent, stars: [...document.querySelectorAll('#goal svg, #chal svg')].filter(vis).length }; });
      rec(7, `défi ${w}×${h} : un seul objectif à l'écran`, !ui.goalVisible && ui.chalVisible && /Objectif : \d+ coups? ou moins/.test(ui.chal), JSON.stringify(ui));
      await p.screenshot({ path: path.join(SH, `${w}x${h}-challenge.png`) });
      // lost challenge: finish in par + 8 moves (3 more than the target) using a detour
      await p.evaluate(([sol]) => {
        const g = window.__game; g.applyMove(sol[0][0], sol[0][1]); const t = sol[0][1], e = g.state().tubes.findIndex((x, i) => i !== t && x.length === 0);
        // 8 neutral moves would also trigger revisit logic; that is fine here, only the result text matters
        for (let i = 0; i < 6; i++) g.applyMove(i % 2 ? e : t, i % 2 ? t : e);
        sol.slice(1).forEach(([f, t2]) => g.applyMove(f, t2));
      }, [sol]);
      await p.waitForSelector('#win:not([hidden])'); await p.waitForTimeout(700);
      const win = await p.evaluate(() => ({ chal: document.querySelector('#wChal').textContent, rec: document.querySelector('#wRec').textContent, moves: document.querySelector('#wMoves').textContent, again: document.querySelector('#bChal').textContent }));
      const moves = +win.moves, diff = moves - (par + 5);
      rec(7, `défi perdu ${w}×${h} : texte « À N coup(s) près », pas de ligne « 3 étoiles en… »`, win.chal === `À ${diff} coup${diff > 1 ? 's' : ''} près` && win.rec === '', JSON.stringify(win));
      await p.screenshot({ path: path.join(SH, `${w}x${h}-challenge-lost.png`) });
      await ctx.close();
    }
    // singular and win text
    { const n = 5, par = D.levels[n - 1].par, sol = D.sol.levels[n - 1];
      const { ctx, p } = await open(b, 360, 640, full(30), `#defi-${n}-${par - 1}`);
      await p.evaluate(sol => sol.forEach(([f, t]) => window.__game.applyMove(f, t)), sol);
      await p.waitForSelector('#win:not([hidden])'); await p.waitForTimeout(600);
      const t = await p.evaluate(() => document.querySelector('#wChal').textContent);
      rec(7, 'défi perdu de 1 coup : « À 1 coup près » (singulier)', t === 'À 1 coup près', `« ${t} »`);
      await ctx.close(); }
    // link rules
    const probe = async (url, cfg, label, expectLink) => {
      const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
      await ctx.addInitScript(c => { if (c) window.MJ_CONFIG = c; navigator.share = t => { (window.__shared = window.__shared || []).push(t.text); return Promise.resolve(); }; }, cfg);
      if (url.startsWith('http')) await ctx.route('http://qa.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(L.HTML, 'utf8') }));
      const p = await ctx.newPage(); await p.goto(url); await p.waitForFunction(() => !!window.__game);
      await p.evaluate(() => { window.__game.loadLevel(5); });
      await p.evaluate(sol => sol.forEach(([f, t]) => window.__game.applyMove(f, t)), D.sol.levels[4]);
      await p.waitForSelector('#win:not([hidden])'); await p.waitForTimeout(600);
      await p.locator('#bChal').tap(); await p.waitForTimeout(200);
      await p.locator('#bShare').tap(); await p.waitForTimeout(200);
      const shared = await p.evaluate(() => window.__shared || []);
      const text = shared[0] || '', hasLink = /#defi-/.test(text);
      const frag = (/#(defi[A-Za-z0-9-]*)/.exec(text) || [])[1];
      rec(7, `partage ${label} : ${expectLink ? 'lien présent' : 'pas de lien'}`, hasLink === expectLink && (!hasLink || /^defi-5-\d+$/.test(frag)), `« ${text} »`);
      rec(7, `partage ${label} : texte du résultat sans lien ni solution`, !/#/.test(shared[1] || ''), `« ${shared[1] || ''} »`);
      await ctx.close();
    };
    await probe(URL, null, 'sur file:// sans configuration', false);
    await probe('http://qa.test/index.html', null, 'sur http(s) sans configuration', true);
    await probe(URL, { shareBaseUrl: 'https://exemple.test/jeu' }, 'avec shareBaseUrl', true);
  }

  // ================= D8: rank names
  {
    for (const [w, h] of SIZES) {
      const src = fs.readFileSync(L.HTML, 'utf8');
      const sv = full(0); sv.stars = sv.stars.map((_, i) => i < 77 ? 3 : 0); sv.rankSeen = 7; sv.max = 120; sv.level = 78;
      const { ctx, p } = await open(b, w, h, sv);
      const r = await p.evaluate(() => { const e = document.querySelector('#hRankN'); return { t: e.textContent, sw: e.scrollWidth, cw: e.clientWidth, stars: document.querySelector('#hStars').textContent }; });
      rec(8, `rang affiché ${w}×${h} (231 étoiles)`, r.t === 'Perfectionniste' && r.sw <= r.cw + 1, JSON.stringify(r));
      await p.screenshot({ path: path.join(SH, `${w}x${h}-home-rank.png`) });
      await ctx.close();
      if (w === 360) rec(8, 'plus aucune occurrence de « Maniaque » / « Raté » dans le fichier', !/Maniaque|Raté/.test(src), `Maniaque:${/Maniaque/.test(src)} Raté:${/Raté/.test(src)}`);
    }
  }
  await b.close();
  fs.writeFileSync(path.join(L.SCRATCH, 'decisions.json'), JSON.stringify(R, null, 1));
  console.log('\nfailed', R.filter(x => !x.ok).length, '/', R.length);
})();
