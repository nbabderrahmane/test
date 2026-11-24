'use strict';
// Real-tap playthrough: replays tools/solutions.json with locator.tap() on the tubes, like a player.
// usage: node tools/qa/play.js [--w 360 --h 640] [--workers 4] [--only levels|daily] [--range a-b] [--out file.json]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const L = require('./lib');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = +opt('w', 360), H = +opt('h', 640), WORKERS = +opt('workers', 4), ONLY = opt('only', 'all');
const range = opt('range', '').split('-').map(Number);
const OUT = opt('out', path.join(L.SCRATCH, `play-${W}x${H}.json`));
const SHOTDIR = path.join(L.SCRATCH, 'win-' + W + 'x' + H);
fs.mkdirSync(SHOTDIR, { recursive: true });
const URL = 'file://' + L.HTML;
const D = L.loadAll();

const jobs = [];
if (ONLY !== 'daily') for (let n = 1; n <= 200; n++) jobs.push({ kind: 'level', n });
if (ONLY !== 'levels') for (let i = 0; i < 120; i++) jobs.push({ kind: 'daily', n: i });
const sel = range.length === 2 && !isNaN(range[0]) ? jobs.filter(j => j.n >= range[0] && j.n <= range[1]) : jobs;
const results = [];
const problems = [];

async function runJob(page, job) {
  const sol = job.kind === 'level' ? D.sol.levels[job.n - 1] : D.sol.daily[job.n];
  const lvl = job.kind === 'level' ? D.levels[job.n - 1] : D.daily[job.n];
  const res = { kind: job.kind, n: job.n, par: lvl.par, solLen: sol.length, tubes: lvl.tubes.length, mystery: lvl.mystery, ok: false, notes: [] };
  const t0 = Date.now();
  await page.evaluate(([k, n]) => k === 'level' ? window.__game.loadLevel(n) : window.__game.loadDaily(n), [job.kind, job.n]);
  const st0 = await page.evaluate(() => window.__game.state());
  if (st0.moves !== 0 || st0.won) res.notes.push('start state not clean');
  for (let m = 0; m < sol.length; m++) {
    const [f, t] = sol[m];
    try {
      await page.locator(`[data-tube="${f}"]`).tap({ timeout: 6000 });
      await page.locator(`[data-tube="${t}"]`).tap({ timeout: 6000 });
    } catch (e) { res.notes.push(`tap error at move ${m + 1}: ${String(e.message).split('\n')[0]}`); break; }
    const mv = await page.evaluate(() => window.__game.state().moves);
    if (mv !== m + 1) { res.notes.push(`move ${m + 1} (${f}->${t}) not applied (moves=${mv})`); break; }
  }
  const st = await page.evaluate(() => window.__game.state());
  res.won = st.won; res.moves = st.moves; res.stars = st.stars; res.stuck = st.stuck;
  if (st.won) {
    try { await page.waitForSelector('#win:not([hidden])', { timeout: 4000 }); } catch (e) { res.notes.push('win screen not shown'); }
    const ui = await page.evaluate(() => {
      const q = s => document.querySelector(s), r = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      const win = q('#win');
      const card = q('#win .card');
      const btns = [...document.querySelectorAll('#win .btn')].filter(b => b.offsetParent).map(b => ({ txt: b.textContent.trim(), ...r(b) }));
      return {
        shown: !win.hidden,
        on: q('#wStars').querySelectorAll('svg.on').length, total: q('#wStars').querySelectorAll('svg').length,
        wMoves: q('#wMoves').textContent, mv: q('#mv').textContent,
        title: q('#wTitle').textContent, sub: q('#wSub').textContent, rec: q('#wRec').textContent,
        news: [...document.querySelectorAll('#wNews span')].map(s => s.textContent),
        card: r(card), btns, iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
      };
    });
    res.ui = ui;
    res.ok = ui.shown && ui.on === 3 && +ui.wMoves === sol.length && +ui.mv === sol.length && st.stars === 3 && st.moves === sol.length;
    if (!ui.shown) res.notes.push('win overlay hidden');
    if (ui.on !== 3) res.notes.push('stars displayed = ' + ui.on);
    if (+ui.wMoves !== sol.length) res.notes.push('win moves ' + ui.wMoves + ' != ' + sol.length);
    if (+ui.mv !== sol.length) res.notes.push('header counter ' + ui.mv + ' != ' + sol.length);
    const c = ui.card;
    if (c.l < 0 || c.t < 0 || c.r > ui.iw || c.b > ui.ih) res.notes.push('win card out of screen');
    ui.btns.forEach(b => { if (b.h < 44 || b.w < 44 || b.b > ui.ih || b.r > ui.iw) res.notes.push('win button "' + b.txt + '" ' + Math.round(b.w) + 'x' + Math.round(b.h) + ' / out'); });
    if (ui.sw > ui.iw || ui.sh > ui.ih) res.notes.push('page scrolls on win');
    const keep = job.kind === 'level' ? (job.n % 20 === 0 || job.n % 20 === 1 || [5, 45, 87, 130, 173].includes(job.n)) : job.n % 12 === 0;
    if (keep) await page.screenshot({ path: path.join(SHOTDIR, `win-${job.kind}-${String(job.n).padStart(3, '0')}.png`) });
  } else res.notes.push('NOT WON after replaying the reference solution');
  res.ms = Date.now() - t0;
  return res;
}

(async () => {
  const browser = await chromium.launch();
  const queue = sel.slice();
  let done = 0;
  const worker = async id => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('request', r => { if (r.url().split('#')[0] !== URL) problems.push('request: ' + r.url()); });
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__game);
    while (queue.length) {
      const job = queue.shift();
      try { results.push(await runJob(page, job)); }
      catch (e) { results.push({ kind: job.kind, n: job.n, ok: false, notes: ['exception: ' + e.message.split('\n')[0]] }); }
      if (++done % 20 === 0) console.log(`${done}/${sel.length}`);
    }
    await ctx.close();
  };
  await Promise.all(Array.from({ length: WORLDERS() }, (_, i) => worker(i)));
  function WORLDERS() { return WORKERS; }
  await browser.close();
  results.sort((a, b) => (a.kind === b.kind ? a.n - b.n : a.kind < b.kind ? -1 : 1));
  fs.writeFileSync(OUT, JSON.stringify({ viewport: [W, H], results, problems }, null, 1));
  const ok = results.filter(r => r.ok).length;
  console.log(`played ${results.length}, ok ${ok}, fail ${results.length - ok}, problems ${problems.length}`);
  results.filter(r => !r.ok || r.notes.length).forEach(r => console.log(r.kind, r.n, r.notes.join('; ')));
  problems.slice(0, 10).forEach(p => console.log(p));
})();
