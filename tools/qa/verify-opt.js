'use strict';
// Replays, with real taps in the game, the shorter-than-reference solutions found by tools/qa/opt.js.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const D = L.loadAll();
const opt = JSON.parse(fs.readFileSync(path.join(L.SCRATCH, 'opt.json'), 'utf8')).filter(r => r.status === 'solved' && r.len < r.par);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); await p.goto('file://' + L.HTML); await p.waitForFunction(() => !!window.__game);
  const out = [];
  for (const r of opt) {
    const n = +r.id.slice(1), lvl = r.id[0] === 'N' ? D.levels[n - 1] : D.daily[n];
    const pathMoves = L.solvePath(lvl.tubes, lvl.caps, 900000);
    const rp = L.replay(lvl, pathMoves);
    await p.evaluate(([k, i]) => k === 'N' ? window.__game.loadLevel(i) : window.__game.loadDaily(i), [r.id[0], n]);
    for (const [f, t] of pathMoves) { await p.locator(`[data-tube="${f}"]`).tap(); await p.locator(`[data-tube="${t}"]`).tap(); }
    const st = await p.evaluate(() => window.__game.state());
    out.push({ id: r.id, par: r.par, found: pathMoves.length, replayOk: rp.ok, gameWon: st.won, gameMoves: st.moves, stars: st.stars });
    console.log(JSON.stringify(out[out.length - 1]));
    await p.waitForTimeout(50);
  }
  fs.writeFileSync(path.join(L.SCRATCH, 'verify-opt.json'), JSON.stringify(out, null, 1));
  await b.close();
})();
