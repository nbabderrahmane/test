'use strict';
// New level 1: animated hand (hint of the first move). Position, visibility, and what happens after a tap, at both sizes.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const L = require('./lib'); const D = L.loadAll(); const SH = path.join(L.SCRATCH, 'dec'); fs.mkdirSync(SH, { recursive: true });
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const [w, h] of [[360, 640], [320, 568]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); await p.goto('file://' + L.HTML); await p.waitForFunction(() => !!window.__game);
    await p.locator('#bGo').tap(); await p.waitForTimeout(400);
    const info = () => p.evaluate(() => { const hd = document.querySelector('#hand'), r = e => { const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]; };
      return { handHidden: hd.hidden, hand: hd.hidden ? null : r(hd), tubes: [...document.querySelectorAll('[data-tube]')].map(r), board: r(document.querySelector('#board')), iw: innerWidth, ih: innerHeight, sel: window.__game.state().selected, moves: window.__game.state().moves }; });
    const a = await info(); await p.screenshot({ path: path.join(SH, `${w}x${h}-N1-hand-1.png`) });
    await p.locator('[data-tube="0"]').tap(); await p.waitForTimeout(350);
    const b2 = await info(); await p.screenshot({ path: path.join(SH, `${w}x${h}-N1-hand-2.png`) });
    const sol = D.sol.levels[0]; await p.locator(`[data-tube="${sol[0][1]}"]`).tap(); await p.waitForTimeout(500);
    const c = await info(); await p.screenshot({ path: path.join(SH, `${w}x${h}-N1-hand-3.png`) });
    const inside = hd => hd && hd[0] >= 0 && hd[2] <= a.iw && hd[3] <= a.ih && hd[1] >= a.board[1];
    const center = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    const tubeOfHand = (hd, tubes) => hd ? tubes.findIndex(t => (hd[0] + hd[2]) / 2 >= t[0] && (hd[0] + hd[2]) / 2 <= t[2]) : -1;
    out.push({ size: `${w}x${h}`, step1: { hidden: a.handHidden, inside: inside(a.hand), overTube: tubeOfHand(a.hand, a.tubes) }, step2: { hidden: b2.handHidden, sel: b2.sel, inside: inside(b2.hand), overTube: tubeOfHand(b2.hand, b2.tubes) }, step3: { hidden: c.handHidden, moves: c.moves }, solFirst: sol[0], levelPar: D.levels[0].par });
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); fs.writeFileSync(path.join(L.SCRATCH, 'hand.json'), JSON.stringify(out, null, 1)); await b.close();
})();
