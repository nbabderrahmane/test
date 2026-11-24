'use strict';
// Real-time length of a game (animations and delays ON), with a human who needs ~0.6 s to throw the die and ~0.9 s
// to pick a pion.   node tools/course-des-pions/duree.js [level ...]      (takes a few minutes: one game per level)
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { FILE } = require('./load');
const PLAYER = require('./player');
const SEEDS = require('./seeds.json');

(async () => {
  const levels = process.argv.slice(2).map(Number).filter(Boolean);
  const browser = await chromium.launch();
  for (const n of levels.length ? levels : [1, 20]) {
    for (const fast of [false, true]) {
      const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 640 } });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(FILE).href);
      await page.waitForFunction(() => !!window.__game);
      await page.evaluate(k => window.__game.loadLevel(k), n);
      await page.evaluate(s => window.__game.seed(s), SEEDS.win[n - 1]);
      if (fast) await page.evaluate(() => document.getElementById('bFast').click());
      const t0 = Date.now();
      let taps = 0;
      for (;;) {
        const r = await page.evaluate(() => {
          const c = e => { const q = e.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; };
          return { s: window.__game.state(), die: c(document.getElementById('die')), go: [...document.querySelectorAll('.pion.go')].map(e => ({ p: +e.dataset.p, i: +e.dataset.i, c: c(e) })) };
        });
        if (r.s.over) break;
        if (r.s.phase === 'roll' && r.s.human) { await page.waitForTimeout(600); await page.touchscreen.tap(r.die[0], r.die[1]); taps++; }
        else if (r.s.phase === 'pick') {
          await page.waitForTimeout(900);
          const i = PLAYER.pick(r.s.game, r.s.turn, r.s.roll);
          const el = r.go.find(g => g.p === r.s.turn && g.i === i) || r.go[0];
          await page.touchscreen.tap(el.c[0], el.c[1]); taps++;
        } else await page.waitForTimeout(40);
      }
      const s = await page.evaluate(() => window.__game.state());
      console.log(`level ${n} ${fast ? 'accelerated' : 'normal    '}: ${((Date.now() - t0) / 1000).toFixed(0)} s, ${s.turns[0]} turns, ${taps} taps, winner ${s.winner}`);
      await ctx.close();
    }
  }
  await browser.close();
})();
