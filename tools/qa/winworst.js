'use strict';
// Worst-case win card: rank-up + 5 badges + challenge result, at both sizes.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const D = L.loadAll();
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 640], [320, 568]]) {
    const stars = new Array(200).fill(0), best = new Array(200).fill(0);
    for (let i = 0; i < 19; i++) { stars[i] = 3; best[i] = 1; }
    for (let i = 20; i < 41; i++) { stars[i] = 3; best[i] = 1; }
    for (let i = 41; i < 46; i++) { stars[i] = 3; best[i] = 1; }
    // rankSeen 0, streak 29 -> badges: monde1, parfait, etoiles100, defi; rank up
    const save = { level: 20, max: 46, stars, best, cur: null, streak: 29, jokers: 0, lastDay: 0, badges: [], rankSeen: 0, rev: {}, daily: null, chalGame: null };
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(({ save }) => { try { if (!localStorage.getItem('mj:tri-couleurs:v1')) localStorage.setItem('mj:tri-couleurs:v1', JSON.stringify(save)); } catch (e) {} }, { save });
    const p = await ctx.newPage();
    await p.goto('file://' + L.HTML + '#defi-20-40'); await p.waitForFunction(() => !!window.__game);
    await p.evaluate(sol => sol.forEach(([f, t]) => window.__game.applyMove(f, t)), D.sol.levels[19]);
    await p.waitForSelector('#win:not([hidden])'); await p.waitForTimeout(900);
    const m = await p.evaluate(() => { const c = document.querySelector('#win .card').getBoundingClientRect(); const chips = [...document.querySelectorAll('#wNews span')].map(s => s.textContent); const btn = [...document.querySelectorAll('#win .btn')].map(e => { const r = e.getBoundingClientRect(); return [e.textContent, Math.round(r.top), Math.round(r.bottom)]; }); return { top: c.top, bottom: c.bottom, ih: innerHeight, chips, btn }; });
    console.log(w + 'x' + h, JSON.stringify(m));
    await p.screenshot({ path: path.join(L.SCRATCH, 'screens', `${w}x${h}-win-worst.png`) });
    await ctx.close();
  }
  await b.close();
})();
