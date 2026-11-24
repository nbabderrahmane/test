'use strict';
// Behaviour checks on a sample of levels (real taps), screens at both sizes, all displayed texts.
// usage: node tools/qa/behaviors.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const L = require('./lib');
const D = L.loadAll();
const URL = 'file://' + L.HTML;
const KEY = 'mj:tri-couleurs:v1';
const SHOTS = path.join(L.SCRATCH, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });
const SIZES = [[360, 640], [320, 568]];
const log = [];       // {check, ok, detail}
const texts = {};     // screen -> list of visible strings
const clip = [];      // clipped / overflowing text findings
const rec = (check, ok, detail) => { log.push({ check, ok: !!ok, detail: detail || '' }); console.log((ok ? ' ok   ' : ' FAIL ') + check + (detail ? ' :: ' + detail : '')); };

async function open(browser, w, h, save, hash, extra) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(({ save, key }) => {
    window.__msgs = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    try { if (save && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }, { save: save || null, key: KEY });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(URL + (hash || ''));
  await page.waitForFunction(() => !!window.__game);
  return { ctx, page };
}
const st = p => p.evaluate(() => window.__game.state());
const tap = (p, i) => p.locator(`[data-tube="${i}"]`).tap();
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name + '.png') });
const msg = p => p.evaluate(() => ({ t: document.querySelector('#msg').textContent, c: document.querySelector('#msg').className }));

// every visible text node + clipped-text detection on the current screen
async function dumpScreen(p, name, size) {
  const r = await p.evaluate(() => {
    const out = [], bad = [];
    const vis = e => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden'; };
    const all = [...document.querySelectorAll('body *')].filter(e => {
      if (!vis(e)) return false;
      for (let n = e; n && n !== document.body; n = n.parentElement) if (n.hidden) return false;
      return true;
    });
    all.forEach(e => {
      const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(Boolean).join(' ');
      if (own) out.push(own);
      const cs = getComputedStyle(e);
      if (own && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2) && cs.display !== 'inline') bad.push({ txt: own, sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight, ov: cs.overflow, to: cs.textOverflow });
      const b = e.getBoundingClientRect();
      if (own && (b.right > innerWidth + 0.5 || b.left < -0.5 || b.bottom > innerHeight + 0.5)) bad.push({ txt: own, off: [b.left, b.right, b.bottom] });
    });
    const aria = [...document.querySelectorAll('[aria-label]')].filter(vis).map(e => e.getAttribute('aria-label'));
    const de = document.documentElement;
    return { out, bad, aria, scroll: [Math.max(de.scrollWidth, document.body.scrollWidth) > innerWidth, Math.max(de.scrollHeight, document.body.scrollHeight) > innerHeight] };
  });
  (texts[name] = texts[name] || new Set());
  r.out.forEach(t => texts[name].add(t));
  r.aria.forEach(t => texts[name].add('[aria] ' + t));
  if (r.bad.length) clip.push({ screen: name, size, bad: r.bad });
  if (r.scroll[0] || r.scroll[1]) clip.push({ screen: name, size, scroll: r.scroll });
  return r;
}

// stars array with a pattern (for rich saves)
function richSave(over) {
  const stars = [], best = [];
  for (let i = 0; i < 200; i++) { stars.push(i < 130 ? 3 : i < 150 ? 2 : 1); best.push(D.levels[i].par); }
  return Object.assign({ level: 200, max: 200, stars, best, cur: null, streak: 30, jokers: 2, lastDay: 0, badges: ['monde1', 'parfait', 'serie7', 'serie30', 'etoiles100', 'defi'], rankSeen: 7, rev: {}, daily: null, chalGame: null }, over || {});
}
function partialSave(n3, extra) { // levels 1..n all 3 stars
  const stars = new Array(200).fill(0), best = new Array(200).fill(0);
  for (let i = 0; i < n3; i++) { stars[i] = 3; best[i] = D.levels[i].par; }
  return Object.assign({ level: n3 + 1, max: Math.min(200, n3 + 1), stars, best, cur: null, streak: 0, jokers: 0, lastDay: 0, badges: [], rankSeen: 0, rev: {}, daily: null, chalGame: null }, extra || {});
}

async function screens(browser) {
  for (const [w, h] of SIZES) {
    const sz = `${w}x${h}`;
    let { ctx, page } = await open(browser, w, h, null);
    await page.evaluate(() => window.__game.state());
    // fresh save: boots on home
    await dumpScreen(page, 'accueil (neuf)', sz); await shot(page, `${sz}-home-new`);
    await page.locator('#bWorlds').tap(); await page.waitForTimeout(150);
    await dumpScreen(page, 'mondes (neuf)', sz); await shot(page, `${sz}-worlds-new`);
    await page.locator('[data-world="0"]').tap(); await page.waitForTimeout(150);
    await dumpScreen(page, 'grille monde 1 (neuf)', sz); await shot(page, `${sz}-grid-new`);
    await page.locator('#bGBack').tap(); await page.locator('#bWBack').tap();
    await page.locator('#bBadges').tap(); await page.waitForTimeout(150);
    await dumpScreen(page, 'badges (neuf)', sz); await shot(page, `${sz}-badges-new`);
    await page.locator('#bBBack').tap();
    await page.locator('#bGo').tap(); await page.waitForTimeout(300);
    await dumpScreen(page, 'jeu niveau 1', sz); await shot(page, `${sz}-game-1`);
    await ctx.close();

    // rich save
    ({ ctx, page } = await open(browser, w, h, richSave()));
    await dumpScreen(page, 'accueil (riche)', sz); await shot(page, `${sz}-home-rich`);
    await page.locator('#bWorlds').tap(); await page.waitForTimeout(150);
    await dumpScreen(page, 'mondes (riche)', sz); await shot(page, `${sz}-worlds-rich`);
    await page.locator('[data-world="9"]').tap(); await page.waitForTimeout(150);
    await dumpScreen(page, 'grille monde 10 (riche)', sz); await shot(page, `${sz}-grid-10-rich`);
    await page.locator('#bGBack').tap(); await page.locator('#bWBack').tap();
    await page.locator('#bBadges').tap(); await page.waitForTimeout(150);
    await dumpScreen(page, 'badges (tous)', sz); await shot(page, `${sz}-badges-all`);
    await ctx.close();

    // partial save: several locked
    ({ ctx, page } = await open(browser, w, h, partialSave(23, { streak: 1, jokers: 0 })));
    await page.locator('#bWorlds').tap(); await page.waitForTimeout(150);
    await shot(page, `${sz}-worlds-partial`); await dumpScreen(page, 'mondes (partiel)', sz);
    await page.locator('[data-world="1"]').tap(); await page.waitForTimeout(150);
    await shot(page, `${sz}-grid-2-partial`); await dumpScreen(page, 'grille monde 2 (partiel)', sz);
    await ctx.close();

    // win screens, cheapest to richest
    // (a) plain 3 stars first win level 1
    ({ ctx, page } = await open(browser, w, h, null));
    await page.evaluate(() => window.__game.loadLevel(1));
    for (const [f, t] of D.sol.levels[0]) { await tap(page, f); await tap(page, t); }
    await page.waitForSelector('#win:not([hidden])'); await page.waitForTimeout(900);
    await dumpScreen(page, 'victoire niveau 1 (3 étoiles)', sz); await shot(page, `${sz}-win-1`);
    await ctx.close();
    // (b) 1 star: play a few useless moves first on level 3 (replay solution after detour)
    ({ ctx, page } = await open(browser, w, h, null));
    await page.evaluate(() => window.__game.loadLevel(5));
    await page.evaluate(sol => {
      const g = window.__game;
      g.applyMove(sol[0][0], sol[0][1]);                       // ball goes into an empty tube (4)
      for (let i = 0; i < 10; i++) { g.applyMove(4, 5); g.applyMove(5, 4); }   // useless shuffle between empty tubes
      sol.slice(1).forEach(([f, t]) => g.applyMove(f, t));
    }, D.sol.levels[4]);
    await page.waitForSelector('#win:not([hidden])'); await page.waitForTimeout(900);
    const s1 = await st(page);
    rec(`victoire à 1 étoile : ${s1.moves} coups -> ${s1.stars} étoile(s) (par ${D.levels[4].par}, limites 3★≤${D.levels[4].par + 2}, 2★≤${D.levels[4].par + 6})`, s1.stars === 1);
    await dumpScreen(page, 'victoire 1 étoile', sz); await shot(page, `${sz}-win-1star`);
    await ctx.close();
    // (c) worst-case news chips: world finished, perfect world, rank up, 100 stars, challenge relevé
    const stars = new Array(200).fill(0), best = new Array(200).fill(0);
    for (let i = 0; i < 19; i++) { stars[i] = 3; best[i] = D.levels[i].par; }
    for (let i = 20; i < 41; i++) { stars[i] = 3; best[i] = D.levels[i].par; }  // 19*3 + 21*3 = 120 -> well above 100
    const save = { level: 20, max: 41, stars, best, cur: null, streak: 6, jokers: 0, lastDay: 0, badges: [], rankSeen: 4, rev: {}, daily: null, chalGame: null };
    ({ ctx, page } = await open(browser, w, h, save, '#defi-20-40'));
    await page.waitForTimeout(300);
    const b0 = await st(page);
    await shot(page, `${sz}-challenge-banner`); await dumpScreen(page, 'jeu avec bandeau défi', sz);
    await page.evaluate(sol => { sol.forEach(([f, t]) => window.__game.applyMove(f, t)); }, D.sol.levels[19]);
    await page.waitForSelector('#win:not([hidden])'); await page.waitForTimeout(900);
    await dumpScreen(page, 'victoire riche (rang + badges + défi)', sz); await shot(page, `${sz}-win-rich`);
    // sharing: stub navigator.share
    const shared = await page.evaluate(async () => {
      const got = []; navigator.share = t => { got.push(t.text); return Promise.resolve(); };
      document.querySelector('#bShare').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      document.querySelector('#bShare').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      document.querySelector('#bChal').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      document.querySelector('#bChal').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      return got;
    });
    if (w === 360) { texts['partage'] = new Set(shared); rec('textes de partage capturés', shared.length === 2, JSON.stringify(shared)); }
    await ctx.close();
    // (d) daily win with streak 7 + serie7 badge
    const today = Math.floor(Date.UTC(2026, 10, 24) / 864e5);
    ({ ctx, page } = await open(browser, w, h, partialSave(0, { streak: 6, lastDay: 0 })));
    await page.evaluate(() => window.__game.setToday('2026-11-24'));
    const s = await st(page);
    await page.evaluate(([i, sol]) => { window.__game.setToday('2026-11-24'); window.__game.loadDaily(i); sol.forEach(([f, t]) => window.__game.applyMove(f, t)); }, [s.todayIndex, D.sol.daily[s.todayIndex]]);
    await page.waitForSelector('#win:not([hidden])'); await page.waitForTimeout(900);
    await dumpScreen(page, 'victoire niveau du jour', sz); await shot(page, `${sz}-win-daily`);
    await ctx.close();
  }
}

async function mechanics(browser) {
  const w = 360, h = 640;
  // ---- illegal move: different colour; full tube; short tube refuses a 3rd ball
  let { ctx, page } = await open(browser, w, h, null);
  await page.evaluate(() => window.__game.loadLevel(22));   // world 2 plain
  let s = await st(page);
  let a = -1, b = -1;
  for (let i = 0; i < s.tubes.length && a < 0; i++) for (let j = 0; j < s.tubes.length; j++) if (i !== j && s.tubes[i].length && s.tubes[j].length && s.tubes[i][s.tubes[i].length - 1] !== s.tubes[j][s.tubes[j].length - 1] && s.tubes[j].length < s.caps[j]) { a = i; b = j; break; }
  // find an *illegal-by-colour* target that is not full
  await page.evaluate(() => window.__game.loadLevel(3));
  s = await st(page);
  // level 3 start: bring a tube to be partially filled
  await page.evaluate(() => { window.__game.applyMove(3, 4); });
  s = await st(page);
  // tube 4 now has 1 ball (top colour x); find a source with different top colour
  let src = s.tubes.findIndex((t, i) => i !== 4 && t.length && t[t.length - 1] !== s.tubes[4][0]);
  await tap(page, src); await tap(page, 4);
  let m = await msg(page); let s2 = await st(page);
  rec('coup interdit (couleur différente) refusé avec message', m.t === 'Même couleur ou tube vide seulement.' && s2.moves === s.moves, `message « ${m.t} », coups ${s2.moves}`);
  await shot(page, 'msg-warn-colour');
  // full tube
  const full = s2.tubes.findIndex((t, i) => t.length === s2.caps[i] && i !== src);
  await tap(page, full);   // the source stays selected after a refused move
  m = await msg(page);
  rec('coup interdit vers un tube plein : message', /plein/.test(m.t), `message « ${m.t} »`);
  await ctx.close();

  // short tube (world 5, level 81+): find a state where short tube holds 2 same-colour balls and another tube top is that colour
  ({ ctx, page } = await open(browser, w, h, null));
  let found = null;
  for (const n of [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 125, 130, 190, 195]) {
    await page.evaluate(k => window.__game.loadLevel(k), n);
    const lvl = D.levels[n - 1];
    // search with the reference solution: play it, and watch for the moment a 3rd ball would be refused
    const sol = D.sol.levels[n - 1];
    const t = lvl.tubes.map(x => x.slice());
    let at = -1, from = -1, shortIdx = -1;
    const shorts = lvl.caps.map((c, i) => c < lvl.cap ? i : -1).filter(i => i >= 0);
    for (let k = 0; k <= sol.length && at < 0; k++) {
      for (const si of shorts) if (t[si].length === 2 && t[si][0] === t[si][1]) {
        const j = t.findIndex((x, i) => i !== si && x.length && x[x.length - 1] === t[si][1]);
        if (j >= 0) { at = k; from = j; shortIdx = si; }
      }
      if (k < sol.length) { const [f, to] = sol[k]; t[to].push(t[f].pop()); }
    }
    if (at >= 0) { found = { n, at, from, shortIdx, mystery: lvl.mystery }; break; }
  }
  if (found) {
    await page.evaluate(([k, sol, at]) => { window.__game.loadLevel(k); for (let i = 0; i < at; i++) window.__game.applyMove(sol[i][0], sol[i][1]); }, [found.n, D.sol.levels[found.n - 1], found.at]);
    const before = await st(page);
    await tap(page, found.from); await tap(page, found.shortIdx);
    const after = await st(page); m = await msg(page);
    rec(`tube court refuse une 3e bille (niveau ${found.n}${found.mystery ? ', mystère' : ''})`, after.tubes[found.shortIdx].length === 2 && after.moves === before.moves && /Tube court/.test(m.t), `message « ${m.t} », billes ${after.tubes[found.shortIdx].length}`);
    await shot(page, 'msg-short-tube');
  } else rec('tube court refuse une 3e bille', false, 'aucune position trouvée sur les niveaux testés');
  await ctx.close();

  // ---- stuck: random walk until no legal move
  ({ ctx, page } = await open(browser, w, h, null));
  const stuckInfo = [];
  for (const n of [105, 110, 115, 120]) {
    const res = await page.evaluate(k => {
      window.__game.loadLevel(k);
      let seed = 12345 + k;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let tries = 0; tries < 400; tries++) {
        const s = window.__game.state();
        const mv = [];
        for (let a = 0; a < s.tubes.length; a++) for (let b = 0; b < s.tubes.length; b++) {
          if (a !== b && s.tubes[a].length && s.tubes[b].length < s.caps[b] && (!s.tubes[b].length || s.tubes[b][s.tubes[b].length - 1] === s.tubes[a][s.tubes[a].length - 1])) mv.push([a, b]);
        }
        if (!mv.length) return { stuck: s.stuck, moves: s.moves };
        const [a, b] = mv[Math.floor(rnd() * mv.length)];
        window.__game.applyMove(a, b);
      }
      return { stuck: false, moves: window.__game.state().moves, note: 'no stuck reached' };
    }, n);
    stuckInfo.push([n, res]);
    if (res.stuck) break;
  }
  const stuckOk = stuckInfo.find(([n, r]) => r.stuck);
  if (stuckOk) {
    m = await msg(page);
    const need = await page.evaluate(() => [document.querySelector('#bUndo').className, document.querySelector('#bReset').className]);
    rec(`impasse signalée (niveau ${stuckOk[0]}, ${stuckOk[1].moves} coups)`, /Plus aucun coup possible/.test(m.t) && need.every(c => /need/.test(c)), `message « ${m.t} », boutons ${need.join(' | ')}`);
    await shot(page, 'stuck-360'); await dumpScreen(page, 'jeu en impasse', '360x640');
    // undo out of the dead end with a real tap
    const before = await st(page);
    await page.locator('#bUndo').tap(); const after = await st(page);
    rec('Annuler depuis l\'impasse : le message disparaît', after.moves === before.moves - 1 && !after.stuck, `coups ${before.moves} -> ${after.moves}, stuck=${after.stuck}`);
  } else rec('impasse signalée', false, JSON.stringify(stuckInfo));
  await ctx.close();

  // ---- undo and reset (real taps)
  ({ ctx, page } = await open(browser, w, h, null));
  await page.evaluate(() => window.__game.loadLevel(30));
  const sol30 = D.sol.levels[29];
  const start = await st(page);
  for (let i = 0; i < 6; i++) { await tap(page, sol30[i][0]); await tap(page, sol30[i][1]); }
  const mid = await st(page);
  await page.locator('#bUndo').tap(); await page.locator('#bUndo').tap();
  const un = await st(page);
  const exp = D.levels[29].tubes.map(x => x.slice());
  for (let i = 0; i < 4; i++) exp[sol30[i][1]].push(exp[sol30[i][0]].pop());
  rec('Annuler x2 : compteur et billes revenus 2 coups en arrière', un.moves === 4 && JSON.stringify(un.tubes) === JSON.stringify(exp), `coups ${mid.moves} -> ${un.moves}`);
  await page.locator('#bReset').tap();
  const rs = await st(page);
  rec('Recommencer : retour à l\'état initial, 0 coup', rs.moves === 0 && JSON.stringify(rs.tubes) === JSON.stringify(start.tubes) && !rs.stuck);
  // undo disabled at 0
  const dis = await page.evaluate(() => [document.querySelector('#bUndo').disabled, document.querySelector('#bReset').disabled]);
  rec('Annuler et Recommencer désactivés à 0 coup', dis[0] && dis[1], JSON.stringify(dis));
  // quit and return (home -> Continuer), reload
  for (let i = 0; i < 5; i++) { await tap(page, sol30[i][0]); await tap(page, sol30[i][1]); }
  const before = await st(page);
  await page.locator('#bMap').tap(); await page.waitForTimeout(100);
  await page.locator('#bGBack').tap(); await page.locator('#bWBack').tap();
  await page.locator('#bGo').tap(); await page.waitForTimeout(200);
  const back = await st(page);
  rec('Quitter vers l\'accueil et « Continuer » reprend la partie (5 coups)', back.moves === 5 && JSON.stringify(back.tubes) === JSON.stringify(before.tubes) && back.level === 30);
  await page.reload(); await page.waitForFunction(() => !!window.__game);
  const home = await st(page);
  await page.locator('#bGo').tap(); await page.waitForTimeout(300);
  const rel = await st(page);
  rec('Fermer/rouvrir la page puis « Continuer » : partie reprise coup pour coup', rel.moves === 5 && JSON.stringify(rel.tubes) === JSON.stringify(before.tubes), `écran après reload : ${home.screen}`);
  await ctx.close();

  // ---- mystery reveal on levels of worlds 6, 8, 9, 10
  for (const n of [45, 130, 145, 185]) {
    ({ ctx, page } = await open(browser, w, h, null));
    await page.evaluate(k => window.__game.loadLevel(k), n);
    const lvl = D.levels[n - 1], sol = D.sol.levels[n - 1];
    const dom = () => page.evaluate(() => {
      const bs = [...document.querySelectorAll('#stage .ball')];
      return bs.map(e => ({ hid: e.classList.contains('hid'), html: e.innerHTML.length, bg: e.style.background }));
    });
    let d0 = await dom();
    const g0 = await st(page);
    // hidden balls: no colour in DOM
    const leak = d0.some(x => x.hid && (x.bg || !/\?|M8\.5/.test('') && false));
    const hidCount = d0.filter(x => x.hid).length;
    const expHid = lvl.tubes.reduce((sum, t) => sum + Math.max(0, t.length - 1), 0);
    rec(`mystère niveau ${n} : seules les billes du dessus visibles au départ (${hidCount} cachées, attendu ${expHid})`, hidCount === expHid && !d0.filter(x => x.hid).some(x => x.bg));
    // play until a first reveal and compare
    let revealedAt = -1;
    for (let k = 0; k < sol.length; k++) {
      const before = await st(page);
      await tap(page, sol[k][0]); await tap(page, sol[k][1]);
      const after = await st(page);
      const hidDom = (await dom()).filter(x => x.hid).length;
      const hidState = after.hidden.reduce((x, y) => x + y, 0);
      if (hidDom !== hidState) { rec(`mystère ${n} coup ${k + 1} : DOM (${hidDom} cachées) différent de l'état (${hidState})`, false); break; }
      if (hidState < expHid && revealedAt < 0) {
        revealedAt = k + 1;
        // revealed ball must be the one that became top of the source tube
        const srcTop = after.tubes[sol[k][0]].length - 1;
        rec(`mystère ${n} : première révélation au coup ${revealedAt} sur le tube source (dessus découvert)`, after.hidden[sol[k][0]] === before.hidden[sol[k][0]] - 1 && after.hidden[sol[k][0]] === Math.max(0, srcTop) );
        // play one more move, then undo it twice: the revealed ball must stay revealed
        await tap(page, sol[k + 1][0]); await tap(page, sol[k + 1][1]);
        const hidNow = (await st(page)).hidden.reduce((x, y) => x + y, 0);
        await page.locator('#bUndo').tap();
        await page.locator('#bUndo').tap();
        const un = await st(page);
        const hu = un.hidden.reduce((x, y) => x + y, 0);
        if (un.moves !== 0) rec(`mystère ${n} : Annuler x2 ramène à 0 coup`, false, 'coups ' + un.moves);
        rec(`mystère ${n} : bille reste révélée après Annuler (retour à 0 coup)`, hu <= hidState && hu === hidNow, `cachées ${hidState} (au coup ${revealedAt}) / ${hidNow} (coup suivant) -> ${hu} après annulation`);
        await tap(page, sol[0][0]); await tap(page, sol[0][1]);
        await page.locator('#bReset').tap();
        const rs = await st(page);
        rec(`mystère ${n} : bille reste révélée après Recommencer`, rs.hidden.reduce((x, y) => x + y, 0) === hu, `cachées ${rs.hidden.reduce((x, y) => x + y, 0)} (attendu ${hu})`);
        await page.reload(); await page.waitForFunction(() => !!window.__game);
        await page.locator('#bGo').tap(); await page.waitForTimeout(250);
        const rl = await st(page);
        rec(`mystère ${n} : bille reste révélée après rechargement`, rl.level === n && rl.hidden.reduce((x, y) => x + y, 0) === hu, `niveau ${rl.level}, cachées ${rl.hidden.reduce((x, y) => x + y, 0)} (attendu ${hu})`);
        await shot(page, `mystery-${n}`);
        break;
      }
    }
    if (revealedAt < 0) rec(`mystère ${n} : aucune révélation observée pendant la solution`, false);
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  await screens(browser);
  await mechanics(browser);
  await browser.close();
  const t = {}; Object.keys(texts).forEach(k => { t[k] = [...texts[k]]; });
  fs.writeFileSync(path.join(L.SCRATCH, 'behaviors.json'), JSON.stringify({ log, texts: t, clip }, null, 1));
  console.log('\nfailed checks:', log.filter(x => !x.ok).length, '/', log.length, ' clip findings:', clip.length);
})();
