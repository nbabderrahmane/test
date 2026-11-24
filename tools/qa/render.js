'use strict';
// Start-of-level rendering audit, 360x640 and 320x568: geometry by getBoundingClientRect + one screenshot per level.
// usage: node tools/qa/render.js [--workers 2]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const L = require('./lib');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const WORKERS = +opt('workers', 2);
const SIZES = [[360, 640], [320, 568]];
const URL = 'file://' + L.HTML;
const D = L.loadAll();
const SHOTS = path.join(L.SCRATCH, 'start');
fs.mkdirSync(SHOTS, { recursive: true });

const jobs = [];
SIZES.forEach(([w, h]) => {
  for (let n = 1; n <= 200; n++) jobs.push({ kind: 'level', n, w, h });
  for (let i = 0; i < 120; i++) jobs.push({ kind: 'daily', n: i, w, h });
});

function measure() {
  const R = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const q = s => document.querySelector(s);
  const iw = innerWidth, ih = innerHeight, de = document.documentElement;
  window.scrollTo(40, 40);
  const out = { iw, ih, scrollW: Math.max(de.scrollWidth, document.body.scrollWidth), scrollH: Math.max(de.scrollHeight, document.body.scrollHeight), sx: scrollX, sy: scrollY, vv: visualViewport ? visualViewport.scale : 1, f: [] };
  const header = R(q('header')), goal = R(q('#goal')), board = R(q('#board')), msg = R(q('#msg')), footer = R(q('footer'));
  out.layout = { header, goal, board, msg, footer };
  const chal = q('#chal');
  const bands = [['header', header], ['goal', goal], ['board', board], ['msg', msg], ['footer', footer]];
  for (let i = 0; i < bands.length - 1; i++) if (bands[i][1].b > bands[i + 1][1].t + 0.5) out.f.push(`bandes ${bands[i][0]}/${bands[i + 1][0]} se chevauchent (${(bands[i][1].b - bands[i + 1][1].t).toFixed(1)} px)`);
  if (footer.b > ih + 0.5) out.f.push('pied de page hors écran');
  const tubes = [...document.querySelectorAll('[data-tube]')];
  const trs = tubes.map(R), bodies = tubes.map(t => R(t.firstChild));
  out.tubeW = Math.min(...trs.map(r => r.w)); out.tubeBodyW = Math.min(...bodies.map(r => r.w));
  out.nTubes = tubes.length;
  trs.forEach((r, i) => {
    if (r.w < 44 || r.h < 44) out.f.push(`tube ${i} ${r.w.toFixed(0)}x${r.h.toFixed(0)} < 44 px`);
    if (r.l < board.l - 0.5 || r.r > board.r + 0.5 || r.t < board.t - 0.5 || r.b > board.b + 0.5) out.f.push(`tube ${i} dépasse la zone de jeu`);
    if (r.l < 0 || r.r > iw || r.t < 0 || r.b > ih) out.f.push(`tube ${i} hors écran`);
  });
  for (let i = 0; i < trs.length; i++) for (let j = i + 1; j < trs.length; j++) {
    const a = trs[i], b = trs[j];
    if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) out.f.push(`tubes ${i} et ${j} se chevauchent`);
  }
  // visual lips (the 6 px side notches drawn with :before/:after) must not touch the neighbour
  let minGap = 1e9;
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    if (a.t < b.b && b.t < a.b) { const gap = Math.max(b.l - 6 - (a.r + 6), a.l - 6 - (b.r + 6)); if (gap < minGap) minGap = gap; }
  }
  out.lipGap = minGap === 1e9 ? null : +minGap.toFixed(1);
  const balls = [...document.querySelectorAll('#stage .ball')];
  let minBall = 1e9, minSym = 1e9;
  balls.forEach((e, k) => {
    const r = R(e);
    minBall = Math.min(minBall, r.w);
    const s = e.querySelector('svg');
    if (s) minSym = Math.min(minSym, R(s).w);
    if (r.l < board.l - 0.5 || r.r > board.r + 0.5 || r.t < board.t - 0.5 || r.b > board.b + 0.5) out.f.push(`bille ${k} hors zone de jeu`);
    if (r.l < 0 || r.r > iw || r.t < 0 || r.b > ih) out.f.push(`bille ${k} hors écran`);
  });
  out.nBalls = balls.length; out.ball = +minBall.toFixed(1); out.sym = +minSym.toFixed(1);
  // ball inside its tube body
  const st = window.__game.state();
  let kk = 0;
  const els = [...document.querySelectorAll('#stage .ball')];
  st.tubes.forEach((t, i) => {
    for (let k = 0; k < t.length; k++) {
      const r = R(els[kk++]), b = bodies[i];
      if (r.l < b.l - 0.5 || r.r > b.r + 0.5 || r.b > b.b + 0.5 || r.t < b.t - 0.5) out.f.push(`bille ${k} du tube ${i} déborde du tube`);
    }
  });
  // text clipped in the header
  const lvlE = q('#lvl'), br = q('#brand');
  out.brandClipped = br.scrollWidth > br.clientWidth + 1; out.brandText = br.textContent; out.lvlText = lvlE.textContent;
  out.goalText = q('#goal').textContent;
  out.msgText = q('#msg').textContent;
  if (out.brandClipped) out.f.push('titre du monde tronqué (« ' + out.brandText + ' »)');
  out.stage = R(q('#stage'));
  return out;
}

async function run(page, job) {
  await page.evaluate(([k, n]) => k === 'level' ? window.__game.loadLevel(n) : window.__game.loadDaily(n), [job.kind, job.n]);
  await page.waitForTimeout(60);
  const m = await page.evaluate(measure);
  // lift the first non-empty tube: the lifted ball must stay on screen
  const st = await page.evaluate(() => window.__game.state());
  const first = st.tubes.findIndex(t => t.length);
  const pre = path.join(SHOTS, `${job.w}x${job.h}-${job.kind === 'level' ? 'N' + job.n : 'J' + job.n}.png`);
  await page.screenshot({ path: pre });
  await page.locator(`[data-tube="${first}"]`).tap();
  await page.waitForTimeout(40);
  const lift = await page.evaluate(() => {
    const b = document.querySelector('#board').getBoundingClientRect(), g = window.__game.state();
    const f = [];
    document.querySelectorAll('#stage .ball').forEach((e, k) => { const r = e.getBoundingClientRect(); if (r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5 || r.left < b.left - 0.5 || r.right > b.right + 0.5) f.push('bille ' + k + ' hors zone après sélection'); });
    return { sel: g.selected, f };
  });
  await page.locator(`[data-tube="${first}"]`).tap();
  m.f.push(...lift.f);
  return { id: job.kind === 'level' ? 'N' + job.n : 'J' + job.n, w: job.w, h: job.h, m };
}

(async () => {
  const browser = await chromium.launch();
  const out = [];
  const LIM = +opt('limit', 0);
  const queue = (LIM ? jobs.filter(j => j.n <= LIM) : jobs).slice(); let done = 0;
  const problems = [];
  const worker = async () => {
    const ctxs = {}, pages = {};
    for (const [w, h] of SIZES) {
      ctxs[w] = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      pages[w] = await ctxs[w].newPage();
      pages[w].on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
      pages[w].on('pageerror', e => problems.push(e.message));
      await pages[w].goto(URL); await pages[w].waitForFunction(() => !!window.__game);
    }
    while (queue.length) {
      const job = queue.shift();
      try { out.push(await run(pages[job.w], job)); } catch (e) { out.push({ id: job.kind[0] === 'l' ? 'N' + job.n : 'J' + job.n, w: job.w, h: job.h, err: e.message.split('\n')[0] }); }
      if (++done % 40 === 0) console.log(done + '/' + jobs.length);
    }
    for (const w in ctxs) await ctxs[w].close();
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  await browser.close();
  fs.writeFileSync(path.join(L.SCRATCH, 'render.json'), JSON.stringify({ out, problems }, null, 1));
  const bad = out.filter(o => o.err || (o.m && o.m.f.length));
  console.log('measured', out.length, 'with findings', bad.length, 'console problems', problems.length);
})();
