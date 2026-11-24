'use strict';
// After winning a mystery level, does "Rejouer" bring the mystery back? (spec: revealed balls stay revealed)
const { chromium } = require('playwright');
const L = require('./lib'); const D = L.loadAll();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); await p.goto('file://' + L.HTML); await p.waitForFunction(() => !!window.__game);
  for (const n of [101, 150, 185]) {
    await p.evaluate(k => window.__game.loadLevel(k), n);
    const h0 = (await p.evaluate(() => window.__game.state())).hidden.reduce((a, c) => a + c, 0);
    for (const [f, t] of D.sol.levels[n - 1]) { await p.locator(`[data-tube="${f}"]`).tap(); await p.locator(`[data-tube="${t}"]`).tap(); }
    await p.waitForSelector('#win:not([hidden])');
    await p.locator('#bAgain').tap(); await p.waitForTimeout(300);
    const s = await p.evaluate(() => window.__game.state());
    const dom = await p.evaluate(() => document.querySelectorAll('#stage .ball.hid').length);
    console.log(`N${n}: cachées au 1er départ ${h0}, après victoire puis Rejouer : état ${s.hidden.reduce((a, c) => a + c, 0)}, DOM ${dom}`);
  }
  await b.close();
})();
