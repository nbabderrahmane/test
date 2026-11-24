'use strict';
/*
 * Mobile acceptance tests for games/tri-couleurs, lot A (plain node + playwright + node:assert).
 * Run with `npm test`. Set SHOTS=<dir> to also write screenshots.
 * Solutions live in tools/solutions.json (the game never embeds them).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const FILE = process.env.GAME_FILE || path.join(__dirname, '..', 'games', 'tri-couleurs', 'index.html');
const URL = pathToFileURL(FILE).href;
const KEY = 'mj:tri-couleurs:v1';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const SOL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'solutions.json'), 'utf8'));
const P = n => SOL.levels[n - 1].length;     // moves of the reference solution of level n

// What each world adds, in play order: [cap, empty tubes, short tubes, mystery].
const WORLD_RULES = [
  [4, 2, 0, false], [5, 2, 0, false], [4, 2, 0, true], [4, 1, 1, false], [4, 2, 0, false],
  [4, 1, 0, false], [4, 1, 1, true], [4, 1, 0, true], [5, 1, 0, false], [5, 1, 1, true],
];
const QA = require('../tools/qa/lib');
const { runAll } = require('./helpers/analysis');

let browser;
const problems = [];   // console errors, page errors, unexpected requests (all pages)
const results = [];

// Opens the game. opts.save seeds localStorage once (a reload keeps what the game stored);
// opts.config sets window.MJ_CONFIG; opts.hash opens a link. Every message to the host is
// collected in window.__msgs (the page is its own parent here).
async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = await browser.newContext({ ...MOBILE, viewport, ...(opts.extra || {}) });
  await context.addInitScript(({ save, key, config }) => {
    window.__msgs = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    try { if (save && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save)); } catch (e) { /* ignore */ }
    if (config) window.MJ_CONFIG = config;
  }, { save: opts.save || null, key: KEY, config: opts.config || null });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('request', r => { if (r.url().split('#')[0] !== URL) problems.push('request: ' + r.url()); });
  await page.goto(URL + (opts.hash || ''));
  await page.waitForFunction(() => !!window.__game);
  return { context, page };
}
const state = page => page.evaluate(() => window.__game.state());
// messages are delivered asynchronously: let the queue drain before reading them
const msgs = page => page.evaluate(() => new Promise(r => setTimeout(() => r(window.__msgs), 40)));
const events = async (page, name) => (await msgs(page)).filter(m => m.event === name);
const tube = (page, i) => page.locator(`[data-tube="${i}"]`);
async function tapMove(page, from, to) {
  await tube(page, from).tap();
  await tube(page, to).tap();
}
// Fast real taps: touchscreen taps at the centre of the tubes (the layout is fixed during a level).
async function tapMoves(page, moves) {
  const c = await page.evaluate(() => [...document.querySelectorAll('[data-tube]')].map(e => {
    const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];
  }));
  for (const [f, t] of moves) {
    await page.touchscreen.tap(c[f][0], c[f][1]);
    await page.touchscreen.tap(c[t][0], c[t][1]);
  }
}
const playLevel = (page, n) => page.evaluate(([k, sol]) => {
  window.__game.loadLevel(k);
  sol.forEach(([f, t]) => window.__game.applyMove(f, t));
  return window.__game.state();
}, [n, SOL.levels[n - 1]]);
const playToday = page => page.evaluate(sol => {
  const g = window.__game, i = g.state().todayIndex;
  g.loadDaily(i);
  sol[i].forEach(([f, t]) => g.applyMove(f, t));
  return g.state();
}, SOL.daily);
const dateOf = n => new Date(Date.UTC(2026, 0, 1) + n * 864e5).toISOString().slice(0, 10);
const dayNum = n => Math.floor(Date.UTC(2026, 0, 1) / 864e5) + n;
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}
async function test(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(true);
    console.log(`  ok    ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    results.push(false);
    console.log(`  FAIL  ${name}\n        ${String(e && e.stack || e).split('\n').join('\n        ')}`);
  }
}
const stars = (n, v) => new Array(n).fill(v);

// Pure-JS model of the rules, used to find specific positions (illegal moves, dead ends).
const canMove = (t, caps, a, b) => a !== b && t[a].length > 0 && t[b].length < caps[b] &&
  (t[b].length === 0 || t[b][t[b].length - 1] === t[a][t[a].length - 1]);
function bfs(tubes, caps, goal, limit = 200000) {
  // BFS to the nearest position satisfying goal(tubes) ; returns the move path or null.
  const key = t => t.map(x => x.join('')).join('|');
  const seen = new Set([key(tubes)]);
  let frontier = [{ t: tubes, path: [] }];
  while (frontier.length && seen.size < limit) {
    const next = [];
    for (const node of frontier) {
      if (goal(node.t)) return node.path;
      for (let a = 0; a < node.t.length; a++) for (let b = 0; b < node.t.length; b++) {
        if (!canMove(node.t, caps, a, b)) continue;
        const t = node.t.map(x => x.slice());
        t[b].push(t[a].pop());
        const k = key(t);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ t, path: node.path.concat([[a, b]]) });
      }
    }
    frontier = next;
  }
  return null;
}
const done = (t, caps) => t.every((x, i) => x.length === 0 || (x.length === caps[i] && x.every(c => c === x[0])));
const noMove = (t, caps) => { for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) if (canMove(t, caps, a, b)) return false; return true; };

// Layout metrics of the current screen.
const measure = (page, sel) => page.evaluate(selector => {
  const de = document.documentElement, b = document.body;
  window.scrollTo(50, 50);
  const r = el => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const vis = el => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  return {
    iw: window.innerWidth, ih: window.innerHeight,
    sw: Math.max(de.scrollWidth, b.scrollWidth), sh: Math.max(de.scrollHeight, b.scrollHeight),
    sx: window.scrollX, sy: window.scrollY,
    vv: window.visualViewport ? window.visualViewport.scale : 1,
    targets: [...document.querySelectorAll(selector)].filter(vis).map(r),
  };
}, sel);
function checkFit(m, tag) {
  assert.ok(m.sw <= m.iw, `${tag}: horizontal scroll (${m.sw} > ${m.iw})`);
  assert.ok(m.sh <= m.ih, `${tag}: vertical scroll (${m.sh} > ${m.ih})`);
  assert.equal(m.sx, 0, tag + ': scrolled x'); assert.equal(m.sy, 0, tag + ': scrolled y');
  assert.equal(m.vv, 1, tag + ': zoomed');
  assert.ok(m.targets.length > 0, tag + ': no target found');
  m.targets.forEach((q, i) => {
    assert.ok(q.w >= 44 && q.h >= 44, `${tag}: target ${i} is ${Math.round(q.w)}x${Math.round(q.h)}`);
    assert.ok(q.l >= -0.5 && q.t >= -0.5 && q.r <= m.iw + 0.5 && q.b <= m.ih + 0.5, `${tag}: target ${i} out of screen`);
  });
}

(async () => {
  browser = await chromium.launch();
  console.log('tri-couleurs (lot A)');

  // ---------------------------------------------------------------- weight, network, data
  await test('file is a single HTML under 150 KB, no external reference, no solutions inside', async () => {
    const size = fs.statSync(FILE).size;
    assert.ok(size < 150 * 1024, `index.html is ${size} bytes`);
    const html = fs.readFileSync(FILE, 'utf8');
    assert.ok(!/(src|href)\s*=\s*["'](https?:)?\/\//i.test(html), 'external src/href found');
    assert.ok(!/url\(\s*["']?(https?:)?\/\//i.test(html), 'external css url found');
    assert.ok(!/@import|<link\b/i.test(html), 'stylesheet link/import found');
    assert.ok(!/SOLUTIONS/.test(html), 'solutions are embedded in the game');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(html), 'network API used');
    console.log(`        size: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);
  });

  await test('hooks: 200 levels in 10 worlds, 120 daily levels, world rules, curve shape, no solutions in __game', async () => {
    const { context, page } = await open();
    const info = await page.evaluate(() => ({
      levels: window.__game.levels, daily: window.__game.daily, solutions: window.__game.solutions,
      fns: ['loadLevel', 'loadDaily', 'applyMove', 'setToday', 'state'].map(k => typeof window.__game[k]),
      st: window.__game.state(),
    }));
    assert.equal(info.levels.length, 200);
    assert.equal(info.daily.length, 120);
    assert.equal(info.solutions, undefined, '__game.solutions must be gone');
    assert.deepEqual(info.fns, new Array(5).fill('function'));
    for (const k of ['level', 'tubes', 'moves', 'won']) assert.ok(k in info.st, 'state() lacks ' + k);
    assert.equal(info.st.level, 1, 'fresh start is level 1');
    assert.equal(SOL.levels.length, 200);
    assert.equal(SOL.daily.length, 120);

    // consistency of every level / daily level
    const all = info.levels.concat(info.daily);
    const seen = new Set();
    all.forEach((l, i) => {
      const tag = i < 200 ? 'level ' + (i + 1) : 'daily ' + (i - 200);
      const count = {};
      l.tubes.flat().forEach(c => { count[c] = (count[c] || 0) + 1; });
      for (const c in count) assert.equal(count[c], l.cap, `${tag}: colour ${c} count`);
      assert.ok(Object.keys(count).every(c => +c >= 0 && +c <= 9), tag + ': colour out of the 10 available');
      assert.equal(l.caps.length, l.tubes.length);
      l.tubes.forEach((t, k) => assert.ok(t.length <= l.caps[k], `${tag}: tube ${k} over capacity`));
      const key = l.tubes.map((t, k) => l.caps[k] + t.join(',')).sort().join('|');
      assert.ok(!seen.has(key), tag + ': duplicate');
      seen.add(key);
      {
        assert.ok(l.tubes.every(t => t.length === 0 || new Set(t).size > 1 || t.length < 3), tag + ': looks sorted');
      }
    });
    // world rules: tall tubes, empty tubes, short tube, mystery, colour count
    let maxColors = 0;
    info.levels.forEach((l, i) => {
      const w = Math.floor(i / 20);
      if (i < 5) { assert.ok(l.cap === (i < 2 ? 3 : l.cap) && (l.cap === 3 || l.cap === 4), `level ${i + 1}: the first levels are 3 or 4 high`); return; }
      const [cap, empty, short, myst] = WORLD_RULES[w];
      assert.equal(l.cap, cap, `level ${i + 1}: height`);
      assert.equal(l.tubes.filter((t, k) => !t.length && l.caps[k] === cap).length, empty, `level ${i + 1}: empty tubes`);
      assert.equal(l.caps.filter(c => c < cap).length, short, `level ${i + 1}: short tubes`);
      if (short) assert.ok(l.caps.every(c => c === cap || c === 2));
      assert.equal(l.mystery, myst, `level ${i + 1}: mystery`);
      maxColors = Math.max(maxColors, new Set(l.tubes.flat()).size);
    });
    assert.equal(maxColors, 10, 'ten colours are used');
    info.daily.forEach((l, i) => assert.ok(!l.mystery && l.cap === 4 && l.caps.every(c => c === 4), `daily ${i}: plain level`));
    // solutions agree with the levels
    info.levels.forEach((l, i) => assert.equal(SOL.levels[i].length, l.par, `level ${i + 1}: par = solution length`));
    info.daily.forEach((l, i) => assert.equal(SOL.daily[i].length, l.par, `daily ${i}: par = solution length`));
    // sawtooth: the 20th is the hardest of its world, the first is gentle, breathers inside the world
    const pars = info.levels.map(l => l.par);
    for (let w = 0; w < 10; w++) {
      const p = pars.slice(w * 20, w * 20 + 20);
      assert.equal(Math.max(...p), p[19], `world ${w + 1}: level 20 is not the hardest (${p})`);
      assert.equal(p.filter(x => x === p[19]).length, 1, `world ${w + 1}: hardest level is not unique`);
      let breathers = 0;
      for (let i = 1; i < 20; i++) if (p[i] < p[i - 1]) breathers++;
      assert.ok(breathers >= 2, `world ${w + 1}: no breathing space (${p})`);
      assert.ok(Math.max(...p.slice(0, 5)) < p[19]);
    }
    const dpars = info.daily.map(l => l.par);
    console.log(`        pars: world 1 ${pars.slice(0, 20)} | world 10 ${pars.slice(180)} | daily ${Math.min(...dpars)}-${Math.max(...dpars)}`);
    await context.close();
  });

  // ---------------------------------------------------------------- level quality (decisions after the level QA)
  // Independent recount on the data embedded in the game file: first moves and optimal length with the
  // QA solver, win rate of a random player with another implementation and other seeds.
  const DATA = QA.loadAll();
  const ALL = DATA.levels.map((l, i) => ({ id: 'N' + (i + 1), n: i + 1, w: Math.floor(i / 20), pos: i % 20, l, par: DATA.sol.levels[i].length }))
    .concat(DATA.daily.map((l, i) => ({ id: 'J' + i, daily: true, l, par: DATA.sol.daily[i].length })));
  let measured = null;
  const recount = async () => {
    if (measured) return measured;
    const t = Date.now();
    const [first, win, opt] = await Promise.all([
      runAll(ALL.map(x => ({ type: 'first', id: x.id, raw: x.l.raw }))),
      runAll(ALL.map((x, k) => ({ type: 'win', id: x.id, raw: x.l.raw, par: x.par, seed: 90001 + 17 * k, games: 800 }))),
      runAll(ALL.map(x => ({ type: 'opt', id: x.id, raw: x.l.raw, maxNodes: 400000 }))),
    ]);
    measured = ALL.map((x, k) => ({ ...x, first: first[k], win: win[k].win, opt: opt[k], d: x.par + 40 * (1 - win[k].win) }));
    console.log(`        recount of ${ALL.length} levels: ${((Date.now() - t) / 1000).toFixed(0)} s`);
    return measured;
  };
  const median = a => { const v = a.slice().sort((x, y) => x - y), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

  await test('decision 1: no trap at the first move (<= 25 % of first moves lose, 0 % for the first 3 levels of a world and for mystery levels)', async () => {
    const M = await recount();
    const worst = {};
    M.forEach(x => {
      assert.equal(x.first.unknown, 0, `${x.id}: a first move could not be decided`);
      const frac = x.first.fatal / x.first.legal;
      const limit = x.daily ? 0.25 : (x.pos < 3 || x.l.mystery) ? 0 : 0.25;
      assert.ok(frac <= limit, `${x.id}: ${x.first.fatal}/${x.first.legal} first moves lose (limit ${limit * 100} %)`);
      if (!x.daily) worst[x.w] = Math.max(worst[x.w] || 0, frac);
    });
    console.log('        worst first-move trap per world: ' + Object.keys(worst).map(w => `${+w + 1}:${Math.round(worst[w] * 100)}%`).join(' '));
  });

  await test('decision 2: the measured difficulty (length + random-player win rate) climbs in steps with breathers, worlds never get easier', async () => {
    const M = (await recount()).filter(x => !x.daily);
    const TOL = 1.5;                                       // sampling noise of the recount
    const med = [];
    for (let w = 0; w < 10; w++) {
      const W = M.slice(w * 20, w * 20 + 20), d = W.map(x => x.d);
      med.push(median(d));
      assert.ok(d[19] >= Math.max(...d) - TOL, `world ${w + 1}: level 20 is not the hardest (${d.map(Math.round)})`);
      assert.equal(Math.max(...W.map(x => x.par)), W[19].par, `world ${w + 1}: level 20 is not the longest`);
      for (let i = 0; i < 20; i++) {
        const prev = w * 20 + i > 0 ? M[w * 20 + i - 1].d : null;
        if (prev === null) continue;
        const x = d[i];
        if (i < 19) assert.ok(x <= Math.max(prev * 1.25, prev + 3) + TOL, `level ${w * 20 + i + 1}: difficulty ${x.toFixed(1)} after ${prev.toFixed(1)} (peak of more than 25 %)`);
        if (i % 5 === 0 && !(w === 0 && i < 10)) assert.ok(x < prev + TOL, `level ${w * 20 + i + 1}: no breather (${x.toFixed(1)} after ${prev.toFixed(1)})`);
        else if (i < 19) assert.ok(x > prev - TOL, `level ${w * 20 + i + 1}: difficulty drops inside a rising run`);
      }
    }
    for (let w = 1; w < 10; w++) {
      assert.ok(med[w] >= med[w - 1], `median of world ${w + 1} (${med[w].toFixed(1)}) is below world ${w} (${med[w - 1].toFixed(1)})`);
      assert.ok(med[w] <= 1.3 * med[w - 1], `median of world ${w + 1} (${med[w].toFixed(1)}) is more than 30 % above world ${w} (${med[w - 1].toFixed(1)})`);
    }
    console.log('        median difficulty per world: ' + med.map(m => m.toFixed(0)).join(' '));
  });

  await test('decision 3: daily levels are homogeneous (random player wins 25 % to 60 % of the games)', async () => {
    const D = (await recount()).filter(x => x.daily);
    assert.equal(D.length, 120);
    D.forEach(x => assert.ok(x.win >= 0.25 && x.win <= 0.60, `${x.id}: random player wins ${(100 * x.win).toFixed(1)} %`));
    console.log(`        daily win rates: ${Math.round(100 * Math.min(...D.map(x => x.win)))}-${Math.round(100 * Math.max(...D.map(x => x.win)))} %`);
  });

  await test('decision 4: the star reference is the shortest solution (A* recount)', async () => {
    const M = await recount();
    let proven = 0;
    M.forEach(x => {
      if (x.opt.status !== 'solved') return;
      proven++;
      assert.ok(x.par <= x.opt.len, `${x.id}: reference ${x.par} is longer than the optimum ${x.opt.len}`);
      assert.equal(x.par, x.opt.len, `${x.id}: reference ${x.par} is shorter than the optimum ${x.opt.len}?!`);
    });
    assert.ok(proven >= 0.9 * M.length, `only ${proven}/${M.length} optima could be recomputed`);
    console.log(`        optimum recomputed and equal to the reference on ${proven}/${M.length} levels`);
  });

  // ---------------------------------------------------------------- every level is winnable
  await test('all 200 levels and 120 daily levels are won by replaying their solution (applyMove)', async () => {
    const { context, page } = await open();
    const r = await page.evaluate(sol => {
      const g = window.__game, bad = [];
      sol.levels.forEach((s, i) => {
        const s0 = g.loadLevel(i + 1);
        if (s0.won || s0.moves !== 0) bad.push('level ' + (i + 1) + ' not fresh');
        s.forEach(([f, t], k) => { if (!g.applyMove(f, t)) bad.push('level ' + (i + 1) + ' move ' + k + ' refused'); });
        const st = g.state();
        const caps = st.caps;
        if (!st.won) bad.push('level ' + (i + 1) + ' not won');
        if (st.moves !== s.length) bad.push('level ' + (i + 1) + ' moves ' + st.moves);
        if (st.stars !== 3) bad.push('level ' + (i + 1) + ' stars ' + st.stars);
        if (!st.tubes.every((t, k) => !t.length || (t.length === caps[k] && new Set(t).size === 1))) bad.push('level ' + (i + 1) + ' tubes not sorted');
        if (g.applyMove(0, 1)) bad.push('level ' + (i + 1) + ' accepts moves after the win');
      });
      sol.daily.forEach((s, i) => {
        g.loadDaily(i);
        s.forEach(([f, t], k) => { if (!g.applyMove(f, t)) bad.push('daily ' + i + ' move ' + k + ' refused'); });
        const st = g.state();
        if (!st.won || st.moves !== s.length) bad.push('daily ' + i + ' not won');
      });
      return bad;
    }, SOL);
    assert.deepEqual(r, []);
    const m = await msgs(page);
    assert.equal(m.filter(x => x.event === 'level_complete').length, 200);
    await context.close();
  });

  await test('real taps win one level per world (all mechanics: tall, one empty tube, short, mystery)', async () => {
    const { context, page } = await open();
    const picks = [1, 21, 41, 61, 81, 101, 121, 141, 161, 181, 200];   // first level of each world + the last one
    for (const n of picks) {
      const s0 = await page.evaluate(k => window.__game.loadLevel(k), n);
      assert.equal(s0.level, n);
      assert.equal(await page.locator('[data-tube]').count(), s0.tubes.length);
      const sol = SOL.levels[n - 1];
      await tapMoves(page, sol.slice(0, -1));
      assert.equal((await state(page)).won, false, `level ${n} won too early`);
      await tapMoves(page, sol.slice(-1));
      const s = await state(page);
      assert.equal(s.won, true, `level ${n} not won by taps`);
      assert.equal(s.moves, sol.length);
      assert.equal(s.stars, 3);
      await page.locator('#win').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#wStars svg.on').count(), 3);
      assert.equal((await page.locator('#wMoves').textContent()).trim(), String(sol.length));
    }
    await context.close();
  });

  await test('real taps win a daily level', async () => {
    const { context, page } = await open();
    await page.evaluate(() => window.__game.setToday('2026-02-10'));
    const i = (await state(page)).todayIndex;
    await page.evaluate(k => window.__game.loadDaily(k), i);
    await tapMoves(page, SOL.daily[i]);
    const s = await state(page);
    assert.equal(s.won, true);
    assert.equal(s.mode, 'daily');
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#bNext').textContent()).trim(), 'Accueil');
    await context.close();
  });

  // ---------------------------------------------------------------- mechanics
  await test('mystery: a hidden ball shows no colour and no symbol, is revealed when uncovered and stays revealed', async () => {
    const { context, page } = await open();
    const n = 41;                                           // first level of the first mystery world
    const s0 = await page.evaluate(k => window.__game.loadLevel(k), n);
    assert.equal(s0.mystery, true);
    assert.deepEqual(s0.hidden, s0.tubes.map(t => Math.max(0, t.length - 1)), 'only the top ball is visible');
    const dom = () => page.evaluate(() => ({
      hid: [...document.querySelectorAll('.ball.hid')].map(e => ({ look: e.className + '|' + e.innerHTML, style: e.getAttribute('style') })),
      open: [...document.querySelectorAll('.ball:not(.hid)')].map(e => ({ look: e.innerHTML, style: e.getAttribute('style') })),
      labels: [...document.querySelectorAll('[data-tube]')].map(e => e.getAttribute('aria-label')),
    }));
    let d = await dom();
    const sumHidden = s => s.hidden.reduce((a, b) => a + b, 0);
    assert.equal(d.hid.length, sumHidden(s0));
    assert.equal(new Set(d.hid.map(h => h.look)).size, 1, 'hidden balls must all look the same (no colour, no symbol leaked)');
    assert.ok(d.hid.every(h => !/background/.test(h.style)), 'hidden ball carries a colour style');
    assert.ok(!/fill="#/.test(d.hid[0].look), 'hidden ball carries a symbol fill');
    assert.ok(d.open.every(h => /background/.test(h.style) && /<path/.test(h.look)));
    assert.equal(d.open.length, s0.tubes.filter(t => t.length).length, 'one visible ball per tube');
    // the aria labels name only the top ball
    d.labels.forEach((l, i) => assert.ok((l.match(/, (rouge|bleu|jaune|vert|violet|orange|rose|turquoise|gris|citron)\b/g) || []).length <= 1, 'label leaks: ' + l));

    // Play the solution: hidden never grows (a revealed ball stays revealed, even when covered or after undo)
    const sol = SOL.levels[n - 1];
    let prev = sumHidden(s0);
    let reveals = 0;
    for (const [f, t] of sol.slice(0, 12)) {
      await page.evaluate(([a, b]) => window.__game.applyMove(a, b), [f, t]);
      const s = await state(page);
      assert.ok(sumHidden(s) <= prev, 'a ball was hidden again');
      s.tubes.forEach((tb, i) => assert.ok(s.hidden[i] <= Math.max(0, tb.length - 1), 'top ball must be visible'));
      if (sumHidden(s) < prev) reveals++;
      prev = sumHidden(s);
      d = await dom();
      assert.equal(d.hid.length, prev, 'DOM and state agree on the hidden balls');
      assert.ok(d.hid.every(h => h.look === d.hid[0].look && !/background/.test(h.style)));
    }
    assert.ok(reveals >= 1, 'no ball was revealed by the first moves');
    for (let k = 0; k < 12; k++) await page.locator('#bUndo').tap();
    let s = await state(page);
    assert.equal(s.moves, 0);
    assert.equal(sumHidden(s), prev, 'undo keeps revealed balls revealed');
    assert.deepEqual(s.tubes, s0.tubes);
    // Restart keeps what was revealed
    const revealed = s.hidden.slice();
    await page.evaluate(([a, b]) => window.__game.applyMove(a, b), sol[0]);
    await page.locator('#bReset').tap();
    s = await state(page);
    assert.deepEqual(s.hidden, revealed, 'restart must not hide the balls again');
    assert.deepEqual(s.tubes, s0.tubes);
    // A full solution wins and shows every ball
    await page.evaluate(sl => sl.forEach(([f, t]) => window.__game.applyMove(f, t)), sol);
    s = await state(page);
    assert.equal(s.won, true);
    assert.equal((await page.locator('.ball.hid').count()), 0, 'win reveals every ball');
    await shot(page, 'mystery-won');
    await context.close();
  });

  await test('short tube: holds 2 balls, refuses a third one (state and taps)', async () => {
    const { context, page } = await open();
    const levels = await page.evaluate(() => window.__game.levels);
    const n = 61;                                           // first level of the short-tube world
    const L = levels[n - 1];
    const s = L.caps.findIndex(c => c < L.cap);
    assert.ok(s >= 0 && L.caps[s] === 2, 'fixture: a tube of capacity 2');
    // find two balls of one colour in the short tube and a third one ready on top of another tube
    const path = bfs(L.tubes.map(t => t.slice()), L.caps, t => t[s].length === 2 && t[s][0] === t[s][1] &&
      t.some((x, i) => i !== s && x.length && x[x.length - 1] === t[s][0]) && !noMove(t, L.caps));
    assert.ok(path, 'fixture: position with a full short tube and a matching third ball');
    await page.evaluate(k => window.__game.loadLevel(k), n);
    await tapMoves(page, path);
    let st = await state(page);
    assert.equal(st.tubes[s].length, 2);
    assert.equal(await page.locator('.tube.short').count(), 1, 'the short tube is drawn differently');
    const src = st.tubes.findIndex((x, i) => i !== s && x.length && x[x.length - 1] === st.tubes[s][0]);
    assert.equal(await page.evaluate(([a, b]) => window.__game.applyMove(a, b), [src, s]), false, 'applyMove refuses');
    await tapMove(page, src, s);                            // third ball by tapping
    st = await state(page);
    assert.equal(st.tubes[s].length, 2, 'a third ball got in');
    assert.match(await page.locator('#msg').textContent(), /court|plein/i);
    await tube(page, src).tap();                            // put the ball back down
    assert.equal((await state(page)).selected, -1);
    // a short tube never counts as "done"
    assert.equal(await page.locator('.tube.short.done').count(), 0);
    await shot(page, 'short-tube');
    await context.close();
  });

  await test('the 10 colours have 10 distinct symbols and colours', async () => {
    const { context, page } = await open();
    // find a level that uses colour 9 and make sure all its colours are drawn differently
    const all = await page.evaluate(() => window.__game.levels);
    const n = all.findIndex(l => new Set(l.tubes.flat()).size === 10) + 1;
    assert.ok(n > 0, 'fixture: a level with 10 colours');
    await page.evaluate(k => window.__game.loadLevel(k), n);
    const st = await state(page);
    assert.equal(new Set(st.tubes.flat()).size, 10, 'fixture: 10 colours on screen');
    const balls = await page.evaluate(() => [...document.querySelectorAll('.ball')].map(e => ({
      bg: e.style.background, d: e.querySelector('path').getAttribute('d'),
    })));
    assert.equal(new Set(balls.map(b => b.bg)).size, 10);
    assert.equal(new Set(balls.map(b => b.d)).size, 10);
    await context.close();
  });

  await test('illegal moves (other colour, full tube, empty source) leave the state untouched', async () => {
    const { context, page } = await open();
    const levels = await page.evaluate(() => window.__game.levels);
    const pickN = levels.findIndex((l, i) => i >= 3 && l.cap === 4 && l.tubes.some(t => !t.length) &&
      l.tubes.some((t, a) => l.tubes.some((u, b) => a !== b && t.length === l.cap && u.length === l.cap && t[l.cap - 1] === u[l.cap - 1]))) + 1;
    assert.ok(pickN > 3, 'fixture: a level with two full tubes with the same top colour and an empty tube');
    const L = levels[pickN - 1];                            // every non-empty tube is full at start
    const full = L.tubes.findIndex((t, a) => t.length === L.cap && L.tubes.some((u, b) => a !== b && u.length === L.cap && u[L.cap - 1] === t[L.cap - 1]));
    const sameTopFull = L.tubes.findIndex((t, i) => i !== full && t.length === L.cap && t[t.length - 1] === L.tubes[full][L.cap - 1]);
    assert.ok(sameTopFull >= 0, 'fixture: need two full tubes with the same top colour');
    const before = await page.evaluate(k => window.__game.loadLevel(k), pickN);
    await tapMove(page, full, sameTopFull);                 // same colour but full tube
    let s = await state(page);
    assert.deepEqual(s.tubes, before.tubes);
    assert.equal(s.moves, 0);
    await tube(page, full).tap();                           // put the ball back down
    assert.equal((await state(page)).selected, -1);
    const empty = L.tubes.findIndex(t => !t.length);
    await tapMove(page, full, empty);                       // legal: frees one slot in `full`
    const mid = await state(page);
    assert.equal(mid.moves, 1);
    const other = mid.tubes.findIndex((t, i) => i !== full && t.length &&
      t[t.length - 1] !== mid.tubes[full][mid.tubes[full].length - 1]);
    assert.ok(mid.tubes[full].length < L.cap && other >= 0);
    assert.ok(!canMove(mid.tubes, mid.caps, other, full));
    await tapMove(page, other, full);                       // room, but wrong colour
    s = await state(page);
    assert.deepEqual(s.tubes, mid.tubes);
    assert.equal(s.moves, 1);
    assert.ok((await page.locator('#msg').textContent()).length > 0, 'the refusal is explained');
    await tube(page, other).tap();
    const empty2 = mid.tubes.findIndex(t => !t.length);
    await tube(page, empty2).tap();                         // empty tube with nothing in hand
    s = await state(page);
    assert.deepEqual(s.tubes, mid.tubes);
    assert.equal(s.selected, -1);
    await context.close();
  });

  await test('undo restores the previous state (unlimited), restart restores the level', async () => {
    const { context, page } = await open();
    const sol = SOL.levels[3];
    const trail = [await page.evaluate(() => window.__game.loadLevel(4))];
    assert.ok(await page.locator('#bUndo').isDisabled());
    for (const [from, to] of sol.slice(0, 8)) {
      await tapMove(page, from, to);
      trail.push(await state(page));
    }
    assert.equal(trail[8].moves, 8);
    for (let k = 7; k >= 0; k--) {                          // undo all the way back
      await page.locator('#bUndo').tap();
      const s = await state(page);
      assert.deepEqual(s.tubes, trail[k].tubes, 'undo to step ' + k);
      assert.equal(s.moves, k);
    }
    assert.ok(await page.locator('#bUndo').isDisabled());
    for (const [from, to] of sol.slice(0, 5)) await tapMove(page, from, to);
    assert.notDeepEqual((await state(page)).tubes, trail[0].tubes);
    await page.locator('#bReset').tap();
    const s = await state(page);
    assert.deepEqual(s.tubes, trail[0].tubes);
    assert.equal(s.moves, 0);
    assert.equal(s.level, 4);
    await context.close();
  });

  for (const [label, from, to] of [['first levels', 1, 20], ['short-tube levels', 61, 80], ['mystery levels', 141, 160]]) {
    await test(`dead end (${label}): the game says so and offers undo / restart`, async () => {
      const { context, page } = await open();
      const levels = await page.evaluate(() => window.__game.levels);
      let n = -1, dead = null;
      for (let i = from - 1; i < to && !dead; i++) {
        dead = bfs(levels[i].tubes, levels[i].caps, t => !done(t, levels[i].caps) && noMove(t, levels[i].caps));
        n = i + 1;
      }
      assert.ok(dead, 'no dead end found in ' + label);
      await page.evaluate(k => window.__game.loadLevel(k), n);
      await tapMoves(page, dead);
      let s = await state(page);
      assert.equal(s.stuck, true);
      assert.equal(s.won, false);
      assert.match(await page.locator('#msg').textContent(), /aucun coup possible/i);
      assert.ok(await page.locator('#msg').isVisible());
      assert.ok(await page.locator('#bUndo').isEnabled());
      assert.ok(await page.locator('#bReset').isEnabled());
      if (from === 1) await shot(page, 'dead-end-360x640');
      await page.locator('#bUndo').tap();
      s = await state(page);
      assert.equal(s.stuck, false);
      assert.equal(s.moves, dead.length - 1);
      assert.doesNotMatch(await page.locator('#msg').textContent(), /aucun coup/i);
      await context.close();
    });
  }

  // ---------------------------------------------------------------- review fixes
  await test('long press: a touch held 800 ms taps once, on the start tube and on the end tube', async () => {
    const { context, page } = await open();
    const cdp = await context.newCDPSession(page);
    const c = await page.evaluate(() => [...document.querySelectorAll('[data-tube]')].map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
    const press = async (i, ms) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c[i][0], y: c[i][1] }] });
      await page.waitForTimeout(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
    };
    await page.evaluate(() => window.__game.loadLevel(1));
    const [from, to] = SOL.levels[0][0];
    const before = await state(page);
    await press(from, 800);
    let s = await state(page);
    assert.equal(s.selected, from, 'the ball must stay lifted after a long press on the start tube');
    await press(to, 800);
    s = await state(page);
    assert.equal(s.moves, 1, 'one move');
    assert.equal(s.selected, -1);
    assert.notDeepEqual(s.tubes, before.tubes);
    assert.equal(s.tubes[to].length, before.tubes[to].length + 1, 'the dropped ball stays dropped');
    await context.close();
  });

  await test('midnight: a daily level started on day J and won on J+1 counts for J', async () => {
    const { context, page } = await open();
    await page.evaluate(d => window.__game.setToday(d), dateOf(0));
    await playToday(page);                                       // series: 1
    await page.evaluate(d => window.__game.setToday(d), dateOf(1));
    const idx = (await state(page)).todayIndex;
    await page.evaluate(k => window.__game.loadDaily(k), idx);
    const sol = SOL.daily[idx];
    await page.evaluate(m => m.forEach(([f, t]) => window.__game.applyMove(f, t)), sol.slice(0, -1));
    await page.evaluate(d => window.__game.setToday(d), dateOf(2));    // midnight passes while playing
    let s = await state(page);
    assert.equal(s.streak, 1, 'the series is not broken while the level of the day before is still being played');
    await page.evaluate(m => window.__game.applyMove(m[0], m[1]), sol[sol.length - 1]);
    s = await state(page);
    assert.equal(s.won, true);
    assert.equal(s.streak, 2, 'counted, not an "entraînement"');
    assert.equal(s.lastDay, dayNum(1));
    const dc = await events(page, 'daily_complete');
    assert.deepEqual(dc.map(e => [e.day, e.streak]), [[dayNum(0), 1], [dayNum(1), 2]]);
    assert.equal((await events(page, 'streak_lost')).length, 0);
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wRec').textContent(), /Série : 2/);
    // and the new day's level is still to be played
    await page.locator('#bNext').tap();
    assert.match(await page.locator('#hDailyT').textContent(), /pas encore joué/i);
    await context.close();
  });

  await test('opening a challenge never changes the saved run (level, game in progress); only a win writes', async () => {
    const hist = SOL.levels[11].slice(0, 6);
    const save = { level: 12, max: 12, stars: stars(11, 3), best: stars(11, 20), cur: { level: 12, hist } };
    const { context, page } = await open({ width: 360, height: 640 }, { save, hash: '#defi-3-50' });
    let s = await state(page);
    assert.equal(s.level, 3);
    assert.equal(s.challenge.target, 50);
    const stored = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    let st = await stored();
    assert.equal(st.level, 12);
    assert.equal(st.max, 12);
    assert.deepEqual(st.cur, { level: 12, hist });
    await tapMoves(page, SOL.levels[2].slice(0, 4));            // playing the challenge does not touch it either
    st = await stored();
    assert.deepEqual(st.cur, { level: 12, hist });
    assert.equal(st.level, 12);
    // go home: "Continuer" still resumes level 12 with its 6 moves
    await page.locator('#bMap').tap();
    await page.locator('#bGBack').tap(); await page.locator('#bWBack').tap();
    assert.match(await page.locator('#bGo').textContent(), /Niveau 12/);
    await page.locator('#bGo').tap();
    s = await state(page);
    assert.equal(s.level, 12);
    assert.equal(s.moves, 6);
    assert.equal(s.challenge, null);
    await context.close();

    // a win on an unlocked level writes its stars and nothing about the run
    const b = await open({ width: 360, height: 640 }, { save, hash: '#defi-3-50' });
    await tapMoves(b.page, SOL.levels[2]);
    await b.page.locator('#win').waitFor({ state: 'visible' });
    const w = await b.page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    assert.equal(w.level, 12, 'the run in progress is not moved by a challenge win');
    assert.deepEqual(w.cur, { level: 12, hist });
    assert.equal(w.stars[2], 3);
    assert.ok(w.badges.includes('defi'));
    await b.context.close();
  });

  await test('resume move by move after a reload: daily level, mystery level (revealed balls), challenge (even locked)', async () => {
    // daily level (real date: a reload loses the simulated one)
    let { context, page } = await open();
    const idx = (await state(page)).todayIndex;
    await page.evaluate(k => window.__game.loadDaily(k), idx);
    await page.evaluate(m => m.forEach(([f, t]) => window.__game.applyMove(f, t)), SOL.daily[idx].slice(0, 5));
    const mid = await state(page);
    assert.equal(mid.moves, 5);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    assert.equal((await state(page)).screen, 'home');
    await page.locator('#bDaily').tap();
    let s = await state(page);
    assert.equal(s.mode, 'daily');
    assert.equal(s.moves, 5);
    assert.deepEqual(s.tubes, mid.tubes);
    await page.locator('#bUndo').tap();
    assert.equal((await state(page)).moves, 4, 'undo works after the resume');
    await context.close();

    // mystery level
    ({ context, page } = await open());
    await page.evaluate(k => window.__game.loadLevel(k), 41);
    const first = await state(page);
    await page.evaluate(m => m.forEach(([f, t]) => window.__game.applyMove(f, t)), SOL.levels[40].slice(0, 8));
    const m1 = await state(page);
    assert.ok(m1.hidden.reduce((a, b) => a + b, 0) < first.hidden.reduce((a, b) => a + b, 0), 'fixture: something was revealed');
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    s = await state(page);
    assert.equal(s.moves, 8);
    assert.deepEqual(s.tubes, m1.tubes);
    assert.deepEqual(s.hidden, m1.hidden, 'revealed balls are still revealed after the reload');
    assert.equal(await page.locator('.ball.hid').count(), s.hidden.reduce((a, b) => a + b, 0));
    for (let k = 0; k < 8; k++) await page.locator('#bUndo').tap();
    await page.reload();                                         // even back to move 0, then a reload
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    assert.deepEqual((await state(page)).hidden, m1.hidden);
    await context.close();

    // challenge on a locked level
    ({ context, page } = await open({ width: 360, height: 640 }, { hash: `#defi-7-${P(7) + 6}` }));
    await tapMoves(page, SOL.levels[6].slice(0, 5));
    const c1 = await state(page);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    s = await state(page);
    assert.equal(s.screen, 'game');
    assert.equal(s.level, 7);
    assert.equal(s.moves, 5);
    assert.deepEqual(s.tubes, c1.tubes);
    assert.equal(s.challenge.target, P(7) + 6);
    assert.match(await page.locator('#chal').textContent(), new RegExp('Objectif : ' + (P(7) + 6)));
    const st = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    assert.equal(st.level, 1); assert.equal(st.max, 1);
    await tapMoves(page, SOL.levels[6].slice(5));
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.reload();                                         // won: nothing left to resume
    await page.waitForFunction(() => !!window.__game);
    assert.equal((await state(page)).screen, 'home');
    await context.close();
  });

  await test('badly started game: a discreet message after 2x the reference, or after 3 returns to a known position', async () => {
    const { context, page } = await open();
    const levels = await page.evaluate(() => window.__game.levels);
    // (a) a long game with no repeated position
    const n = 22, L = levels[n - 1], par = SOL.levels[n - 1].length;
    const seen = new Set(), t = L.tubes.map(x => x.slice()), walk = [];
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const key = u => u.map(x => x.join(',')).join('|');
    seen.add(key(t));
    while (walk.length < 2 * par + 1) {
      const opts = [];
      for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) {
        if (!canMove(t, L.caps, a, b)) continue;
        const u = t.map(x => x.slice()); u[b].push(u[a].pop());
        if (!seen.has(key(u)) && !done(u, L.caps) && !noMove(u, L.caps)) opts.push([a, b, u]);
      }
      assert.ok(opts.length, 'fixture: the walk got stuck');
      const [a, b, u] = opts[Math.floor(rnd() * opts.length)];
      walk.push([a, b]); seen.add(key(u)); t[b].push(t[a].pop());
    }
    await page.evaluate(k => window.__game.loadLevel(k), n);
    await page.evaluate(m => m.forEach(([a, b]) => window.__game.applyMove(a, b)), walk.slice(0, 2 * par));
    assert.doesNotMatch(await page.locator('#msg').textContent(), /mal engagée/, 'no message at exactly 2x');
    await page.evaluate(m => window.__game.applyMove(m[0], m[1]), walk[2 * par]);
    assert.match(await page.locator('#msg').textContent(), /mal engagée.*Annule.*recommence/i);
    assert.ok(await page.locator('#bUndo').isEnabled());
    await shot(page, 'nudge');

    // (b) three returns to a known position, well under 2x the reference
    let cyc = null;
    for (let i = 3; i < 60 && !cyc; i++) {
      const l = levels[i], e = l.tubes.findIndex((x, k) => !x.length && l.caps[k] === l.cap);
      const a = l.tubes.findIndex(x => x.length >= 2 && x[x.length - 1] === x[x.length - 2]);
      if (e >= 0 && a >= 0 && SOL.levels[i].length >= 8) cyc = { n: i + 1, a, e };
    }
    assert.ok(cyc, 'fixture: a level where a ball can go to the empty tube and back');
    await page.evaluate(k => window.__game.loadLevel(k), cyc.n);
    const go = (x, y) => page.evaluate(([f, t]) => window.__game.applyMove(f, t), [x, y]);
    await go(cyc.a, cyc.e);                                 // new position
    await go(cyc.e, cyc.a);                                 // back to the start: 1st return
    await go(cyc.a, cyc.e);                                 // 2nd
    assert.doesNotMatch(await page.locator('#msg').textContent(), /mal engagée/);
    await go(cyc.e, cyc.a);                                 // 3rd return to a known position
    assert.match(await page.locator('#msg').textContent(), /mal engagée/);
    assert.ok((await state(page)).moves <= 2 * SOL.levels[cyc.n - 1].length, 'under 2x the reference');

    // (c) undo then redo is not a return
    await page.evaluate(k => window.__game.loadLevel(k), cyc.n);
    for (let k = 0; k < 5; k++) {
      await page.evaluate(([a, e]) => window.__game.applyMove(a, e), [cyc.a, cyc.e]);
      await page.locator('#bUndo').tap();
    }
    assert.doesNotMatch(await page.locator('#msg').textContent(), /mal engagée/, 'undo/redo must not trigger the message');
    await context.close();
  });

  await test('mystery: Rejouer and any new game of a level hide the balls again; one game keeps them revealed', async () => {
    const { context, page } = await open();
    const n = 41, sol = SOL.levels[n - 1];
    const s0 = await page.evaluate(k => window.__game.loadLevel(k), n);
    const sum = s => s.hidden.reduce((a, b) => a + b, 0);
    await page.evaluate(m => m.forEach(([a, b]) => window.__game.applyMove(a, b)), sol.slice(0, 6));
    const mid = await state(page);
    assert.ok(sum(mid) < sum(s0), 'fixture: something was revealed');
    await page.locator('#bReset').tap();                    // Recommencer: still revealed
    assert.deepEqual((await state(page)).hidden, mid.hidden);
    await page.reload();                                    // reload: still revealed
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    assert.deepEqual((await state(page)).hidden, mid.hidden);
    // leaving for another level and coming back is a new game: hidden again
    await page.evaluate(k => window.__game.loadLevel(k), 42);
    const again = await page.evaluate(k => window.__game.loadLevel(k), n);
    assert.deepEqual(again.hidden, s0.hidden, 'a new game of the level starts hidden');
    // win, then Rejouer: hidden again
    await page.evaluate(m => m.forEach(([a, b]) => window.__game.applyMove(a, b)), sol.slice(0, 6));
    await page.evaluate(m => m.forEach(([a, b]) => window.__game.applyMove(a, b)), sol.slice(6));
    assert.equal((await state(page)).won, true);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bAgain').tap();
    const re = await state(page);
    assert.deepEqual(re.hidden, s0.hidden, 'Rejouer hides the balls again');
    assert.equal(await page.locator('.ball.hid').count(), sum(s0));
    await context.close();
  });

  await test('ranks: "Maniaque" is now "Perfectionniste"', async () => {
    assert.ok(!/Maniaque/.test(fs.readFileSync(FILE, 'utf8')));
    const { context, page } = await open({ width: 360, height: 640 }, { save: { level: 78, max: 78, stars: stars(77, 3), best: stars(77, 30), cur: null, rankSeen: 5 } });
    assert.equal((await page.locator('#hRankN').textContent()).trim(), 'Perfectionniste');
    await context.close();
  });

  await test('the win screen never opens over another screen', async () => {
    const { context, page } = await open();
    await playLevel(page, 1);                                    // won; the win screen is due in ~480 ms
    await page.locator('#bMap').tap();                           // leave at once
    assert.equal((await state(page)).screen, 'wgrid');
    await page.waitForTimeout(900);
    assert.ok(await page.locator('#win').isHidden(), 'win screen opened over the grid');
    assert.ok(await page.locator('#wgrid').isVisible());
    await context.close();
  });

  // ---------------------------------------------------------------- screens, saving, migration
  await test('home: one tap to play, worlds, world grid, badges', async () => {
    const { context, page } = await open();
    let s = await state(page);
    assert.equal(s.screen, 'home');
    assert.ok(await page.locator('#home').isVisible());
    assert.match(await page.locator('#bGo').textContent(), /Continuer.*Niveau 1/);
    assert.ok(await page.locator('#hStreak').isVisible());
    assert.ok(await page.locator('#hRank').isVisible());
    assert.match(await page.locator('#hDailyT').textContent(), /pas encore joué/i);
    await shot(page, 'home-fresh');
    await page.locator('#bWorlds').tap();                    // worlds: 10 cards, only world 1 open
    assert.equal(await page.locator('#wlist [data-world]').count(), 10);
    assert.ok(await page.locator('[data-world="0"]').isEnabled());
    assert.ok(await page.locator('[data-world="1"]').isDisabled());
    assert.equal((await page.locator('#mTotal').textContent()).trim(), '0/600');
    await shot(page, 'worlds-fresh');
    await page.locator('[data-world="0"]').tap();            // grid of 20 levels
    assert.equal(await page.locator('#grid [data-level]').count(), 20);
    assert.ok(await page.locator('[data-level="1"]').isEnabled());
    assert.ok(await page.locator('[data-level="2"]').isDisabled());
    assert.equal((await page.locator('#gTotal').textContent()).trim(), '0/60');
    await shot(page, 'grid-fresh');
    await page.locator('#bGBack').tap();
    await page.locator('#bWBack').tap();
    assert.equal((await state(page)).screen, 'home');
    await page.locator('#bBadges').tap();                    // badges: 6, none earned
    assert.equal(await page.locator('#blist .bd').count(), 6);
    assert.equal(await page.locator('#blist .bd.got').count(), 0);
    await page.locator('#bBBack').tap();
    await page.locator('#bGo').tap();                        // one tap to play
    s = await state(page);
    assert.equal(s.screen, 'game');
    assert.equal(s.level, 1);
    assert.ok(await page.locator('#home').isHidden());
    assert.ok(await page.locator('#hand').isVisible(), 'animated hand on the very first move');
    await context.close();
  });

  await test('progress survives a reload; win screen, next level, world grid and storage-less play', async () => {
    const { context, page } = await open();
    const sol1 = SOL.levels[0];
    await page.locator('#bGo').tap();
    await tapMoves(page, sol1);
    assert.equal((await state(page)).won, true);
    await page.locator('#win').waitFor({ state: 'visible' });
    await shot(page, 'win-360x640');
    const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
    assert.equal(saved.stars[0], 3);
    assert.equal(saved.best[0], sol1.length);

    await page.reload();                                     // closed on the win screen: resume at level 2
    await page.waitForFunction(() => !!window.__game);
    assert.match(await page.locator('#bGo').textContent(), /Niveau 2/);
    await page.locator('#bGo').tap();
    let s = await state(page);
    assert.equal(s.level, 2);
    assert.equal(s.moves, 0);

    const sol2 = SOL.levels[1];
    await tapMoves(page, sol2.slice(0, 2));                  // two moves into level 2, then reload
    const mid = await state(page);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    s = await state(page);
    assert.equal(s.level, 2);
    assert.deepEqual(s.tubes, mid.tubes, 'unfinished level is resumed as it was');
    assert.equal(s.moves, 2);
    await page.locator('#bUndo').tap();                      // undo still works after a resume
    assert.equal((await state(page)).moves, 1);

    await tapMoves(page, sol2.slice(1));
    assert.equal((await state(page)).won, true);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bNext').tap();                      // next level in one tap
    s = await state(page);
    assert.equal(s.level, 3);
    assert.ok(await page.locator('#win').isHidden());

    await page.locator('#bMap').tap();                       // grid of the current world
    await page.locator('#wgrid').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#grid [data-level]').count(), 20);
    assert.equal(await page.locator('[data-level="1"] .s svg.on').count(), 3);
    assert.equal(await page.locator('[data-level="2"] .s svg.on').count(), 3);
    assert.equal(await page.locator('[data-level="3"] .s svg.on').count(), 0);
    assert.ok(await page.locator('[data-level="3"]').isEnabled());
    assert.ok(await page.locator('[data-level="4"]').isDisabled());
    assert.equal((await page.locator('#gTotal').textContent()).trim(), '6/60');
    await page.locator('[data-level="4"]').tap({ force: true });   // locked: nothing happens
    assert.equal((await state(page)).level, 3);
    await page.locator('[data-level="1"]').tap();
    await page.locator('#wgrid').waitFor({ state: 'hidden' });
    assert.equal((await state(page)).level, 1);
    await context.close();

    // Storage unavailable: the game still boots and plays.
    const blocked = await browser.newContext({ ...MOBILE, viewport: { width: 360, height: 640 } });
    await blocked.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    });
    const p2 = await blocked.newPage();
    p2.on('pageerror', e => problems.push('pageerror(no storage): ' + e.message));
    await p2.goto(URL);
    await p2.waitForFunction(() => !!window.__game);
    await p2.locator('#bGo').tap();
    await tapMoves(p2, sol1);
    assert.equal((await state(p2)).won, true);
    await blocked.close();
  });

  await test('migration: a lot 1 save is read without loss (stars, best, unlocked levels, level in progress)', async () => {
    const lot1 = { level: 10, max: 10, stars: [3, 3, 2, 3, 1, 2, 3, 3, 2, 3], best: [3, 6, 14, 17, 25, 22, 24, 27, 30, 34], cur: null };
    let { context, page } = await open({ width: 360, height: 640 }, { save: lot1 });
    let s = await state(page);
    assert.equal(s.total, 25, 'total stars kept');
    assert.equal((await msgs(page)).length, 0, 'nothing celebrated for stars already won');
    assert.match(await page.locator('#bGo').textContent(), /Niveau 11/, 'level 10 was finished: level 11 is next');
    await page.locator('#bWorlds').tap();
    assert.equal((await page.locator('#mTotal').textContent()).trim(), '25/600');
    await page.locator('[data-world="0"]').tap();
    assert.equal(await page.locator('[data-level="10"] .s svg.on').count(), 3);
    assert.equal(await page.locator('[data-level="5"] .s svg.on').count(), 1);
    assert.ok(await page.locator('[data-level="11"]').isEnabled(), 'level 11 unlocked');
    assert.ok(await page.locator('[data-level="12"]').isDisabled());
    const stored = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
    assert.deepEqual(stored.stars.slice(0, 10), lot1.stars);
    assert.deepEqual(stored.best.slice(0, 10), lot1.best);
    assert.equal(stored.stars.length, 200);
    assert.equal(s.streak, 0); assert.equal(s.jokers, 0);
    await context.close();

    // a level in progress is resumed move by move
    const hist = SOL.levels[3].slice(0, 5);
    const mid = { level: 4, max: 4, stars: [3, 3, 3], best: [3, 6, 13], cur: { level: 4, hist } };
    ({ context, page } = await open({ width: 360, height: 640 }, { save: mid }));
    assert.match(await page.locator('#bGo').textContent(), /Niveau 4/);
    await page.locator('#bGo').tap();
    s = await state(page);
    assert.equal(s.level, 4);
    assert.equal(s.moves, 5);
    await page.locator('#bUndo').tap();
    assert.equal((await state(page)).moves, 4);
    await context.close();

    // garbage in the save never breaks the game
    ({ context, page } = await open({ width: 360, height: 640 }, { save: { level: 'x', max: -5, stars: 'no', best: [null, 'a'], cur: { hist: 'bad' }, streak: -3, jokers: 99, badges: ['nope', 'defi'] } }));
    s = await state(page);
    assert.equal(s.level, 1);
    assert.deepEqual(s.badges, ['defi']);
    assert.equal(s.jokers, 2);
    await context.close();
  });

  // ---------------------------------------------------------------- series
  await test('series: +1 a day, replay without effect, practice daily does not count, missed day resets', async () => {
    const { context, page } = await open();
    await page.evaluate(d => window.__game.setToday(d), dateOf(0));
    let s = await state(page);
    assert.equal(s.streak, 0);
    assert.equal(s.today, dayNum(0));
    s = await playToday(page);
    assert.equal(s.won, true);
    assert.equal(s.streak, 1);
    assert.equal(s.lastDay, dayNum(0));
    const idx = s.todayIndex;
    let dc = await events(page, 'daily_complete');
    assert.deepEqual(dc, [{ source: 'mini-jeu', game: 'tri-couleurs', event: 'daily_complete', day: dayNum(0), moves: SOL.daily[idx].length, streak: 1 }]);
    // replaying the same day changes nothing
    s = await playToday(page);
    assert.equal(s.streak, 1);
    assert.equal((await events(page, 'daily_complete')).length, 1);
    // another daily level (not today's) is practice: no effect
    await page.evaluate(([k, sol]) => { window.__game.loadDaily(k); sol.forEach(([f, t]) => window.__game.applyMove(f, t)); }, [(idx + 1) % 120, SOL.daily[(idx + 1) % 120]]);
    assert.equal((await state(page)).streak, 1);
    assert.equal((await events(page, 'daily_complete')).length, 1);
    // next day: +1
    await page.evaluate(d => window.__game.setToday(d), dateOf(1));
    assert.equal((await state(page)).streak, 1, 'still alive the next morning');
    s = await playToday(page);
    assert.equal(s.streak, 2);
    assert.equal(s.jokers, 0);
    assert.equal((await events(page, 'streak_lost')).length, 0);
    // two days later without joker: lost, then a new series starts at 1
    await page.evaluate(d => window.__game.setToday(d), dateOf(3));
    s = await state(page);
    assert.equal(s.streak, 0, 'a missed day without joker resets the series');
    const lost = await events(page, 'streak_lost');
    assert.deepEqual(lost, [{ source: 'mini-jeu', game: 'tri-couleurs', event: 'streak_lost' }]);
    s = await playToday(page);
    assert.equal(s.streak, 1);
    const stored = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
    assert.equal(stored.streak, 1); assert.equal(stored.lastDay, dayNum(3)); assert.equal(stored.jokers, 0);
    // the home screen shows it
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bNext').tap();
    assert.equal((await state(page)).screen, 'home');
    assert.equal((await page.locator('#hStreakN').textContent()).trim(), '1');
    assert.match(await page.locator('#hDailyT').textContent(), /fait/i);
    await page.evaluate(d => window.__game.setToday(d), dateOf(4));
    assert.match(await page.locator('#hDailyT').textContent(), /pas encore joué/i, 'reminder on a new day');
    await shot(page, 'home-reminder');
    await context.close();
  });

  await test('series: joker earned on day 7, spent on a missed day, 2 at most, badges for 7 and 30 days', async () => {
    const { context, page } = await open();
    const log = [];
    for (let k = 0; k < 30; k++) {
      await page.evaluate(d => window.__game.setToday(d), dateOf(k));
      const s = await playToday(page);
      assert.equal(s.streak, k + 1);
      log.push(s.jokers);
    }
    assert.deepEqual([log[5], log[6], log[12], log[13], log[20], log[27], log[29]], [0, 1, 1, 2, 2, 2, 2], 'jokers at days 6, 7, 13, 14, 21, 28, 30: ' + log);
    const badges = (await events(page, 'badge')).map(e => e.id);
    assert.ok(badges.includes('serie7') && badges.includes('serie30'), 'series badges: ' + badges);
    assert.equal(badges.filter(b => b === 'serie7').length, 1, 'a badge is announced once');
    // 2 jokers, miss 2 days: both are used, the series goes on
    await page.evaluate(d => window.__game.setToday(d), dateOf(32));   // days 30 and 31 missed
    let s = await state(page);
    assert.equal(s.streak, 30);
    assert.equal(s.jokers, 0, 'jokers are spent as soon as the game opens, one per missed day');
    s = await playToday(page);
    assert.equal(s.streak, 31);
    assert.equal(s.jokers, 0, 'one joker per missed day');
    assert.equal((await events(page, 'streak_lost')).length, 0);
    await context.close();

    // 7 days then one missed day: the joker saves it
    const b = await open();
    for (let k = 0; k < 7; k++) { await b.page.evaluate(d => window.__game.setToday(d), dateOf(k)); await playToday(b.page); }
    assert.equal((await state(b.page)).jokers, 1);
    await b.page.evaluate(d => window.__game.setToday(d), dateOf(8));
    assert.equal((await state(b.page)).streak, 7, 'the joker covers the missed day');
    assert.equal((await state(b.page)).jokers, 0, 'and is spent on opening');
    let t = await playToday(b.page);
    assert.equal(t.streak, 8);
    assert.equal(t.jokers, 0);
    // 7 days, then two missed days with a single joker: lost
    await b.context.close();
    const c = await open();
    for (let k = 0; k < 7; k++) { await c.page.evaluate(d => window.__game.setToday(d), dateOf(k)); await playToday(c.page); }
    await c.page.evaluate(d => window.__game.setToday(d), dateOf(9));
    t = await state(c.page);
    assert.equal(t.streak, 0, 'a single joker cannot cover two days');
    assert.equal(t.jokers, 0, 'a lost series loses its jokers');
    assert.equal((await events(c.page, 'streak_lost')).length, 1);
    await c.context.close();
  });

  await test('series: a clock that goes back adds nothing and breaks nothing', async () => {
    const { context, page } = await open();
    for (let k = 10; k <= 12; k++) { await page.evaluate(d => window.__game.setToday(d), dateOf(k)); await playToday(page); }
    let s = await state(page);
    assert.equal(s.streak, 3);
    await page.evaluate(d => window.__game.setToday(d), dateOf(9));
    s = await state(page);
    assert.equal(s.streak, 3, 'going back does not break the series');
    s = await playToday(page);                                 // a "new" day in the past
    assert.equal(s.streak, 3, 'and adds nothing');
    assert.equal(s.lastDay, dayNum(12));
    assert.equal((await msgs(page)).filter(m => m.event === 'daily_complete' || m.event === 'streak_lost').length, 3, 'only the 3 real days were reported');
    await page.evaluate(d => window.__game.setToday(d), dateOf(13));
    s = await playToday(page);
    assert.equal(s.streak, 4, 'moving forward again goes on from where it was');
    await context.close();
  });

  // ---------------------------------------------------------------- ranks and badges
  await test('rank: a rank-up is celebrated once; badges: world, perfect world, 100 stars', async () => {
    // rank: 13 stars -> a 3-star win makes 16 (rank 2 starts at 15)
    let { context, page } = await open({ width: 360, height: 640 }, { save: { level: 6, max: 6, stars: [3, 3, 3, 3, 1], best: [3, 6, 13, 17, 30], cur: null } });
    let s = await state(page);
    assert.equal(s.rank, 1);
    assert.equal(s.total, 13);
    s = await playLevel(page, 6);
    assert.equal(s.rank, 2);
    assert.deepEqual(await events(page, 'rank_up'), [{ source: 'mini-jeu', game: 'tri-couleurs', event: 'rank_up', rank: 2 }]);
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wNews').textContent(), /Nouveau rang : Apprenti/);
    // winning the same level again does not celebrate again
    await playLevel(page, 6);
    assert.equal((await events(page, 'rank_up')).length, 1);
    await page.waitForTimeout(600);
    assert.doesNotMatch(await page.locator('#wNews').textContent(), /rang/);
    const stored = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
    assert.equal(stored.rankSeen, 1, 'rank seen is saved');
    await context.close();

    // perfect first world: badges "premier monde" and "monde parfait", and level 21 opens
    ({ context, page } = await open({ width: 360, height: 640 }, { save: { level: 20, max: 20, stars: stars(19, 3), best: stars(19, 20), cur: null, rankSeen: 0 } }));
    s = await state(page);
    assert.deepEqual(s.badges, []);
    await playLevel(page, 20);
    s = await state(page);
    assert.deepEqual(s.badges.sort(), ['monde1', 'parfait']);
    assert.deepEqual((await events(page, 'badge')).map(e => e.id).sort(), ['monde1', 'parfait']);
    assert.equal(s.total, 60);
    const ru = await events(page, 'rank_up');
    assert.deepEqual(ru.map(e => e.rank), [3], '60 stars: rank 3 (Trieur)');
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#wNews span').count(), 3, 'rank + 2 badges announced');
    await shot(page, 'win-news-360x640');
    await page.locator('#bNext').tap();
    assert.equal((await state(page)).level, 21);
    await page.locator('#bMap').tap();
    await page.locator('#bGBack').tap();
    assert.ok(await page.locator('[data-world="1"]').isEnabled(), 'world 2 is open');
    await page.locator('#bWBack').tap();
    await page.locator('#bBadges').tap();
    assert.equal(await page.locator('#blist .bd.got').count(), 2);
    await shot(page, 'badges-360x640');
    await context.close();

    // finished (not perfect) world: only "premier monde"
    ({ context, page } = await open({ width: 360, height: 640 }, { save: { level: 20, max: 20, stars: stars(19, 1), best: stars(19, 40), cur: null } }));
    s = await playLevel(page, 20);
    assert.deepEqual(s.badges, ['monde1']);
    await context.close();

    // 100 stars
    ({ context, page } = await open({ width: 360, height: 640 }, { save: { level: 34, max: 34, stars: stars(32, 3).concat([2]), best: stars(33, 30), cur: null } }));
    s = await state(page);
    assert.equal(s.total, 98);
    s = await playLevel(page, 34);
    assert.equal(s.total, 101);
    assert.ok(s.badges.includes('etoiles100'));
    assert.equal((await events(page, 'badge')).filter(e => e.id === 'etoiles100').length, 1);
    await context.close();
  });

  // ---------------------------------------------------------------- challenge
  await test('challenge: link generated without the solution, configurable base URL, daily link', async () => {
    const base = 'https://example.test/jeux/pile-poil/';
    const { context, page } = await open({ width: 360, height: 640 }, { config: { shareBaseUrl: base } });
    await page.evaluate(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } });
    });
    const sol = SOL.levels[4];
    await page.evaluate(k => window.__game.loadLevel(k), 5);
    await tapMoves(page, sol);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bChal').tap();
    const sh = await page.evaluate(() => window.__shared);
    assert.equal(sh.length, 1);
    const text = sh[0].text;
    const link = text.match(/https?:\/\/\S+/)[0];
    assert.equal(link, `${base}#defi-5-${sol.length}`);
    assert.match(link.split('#')[1], /^[A-Za-z0-9-]+$/, 'fragment: letters, digits and hyphens only');
    assert.ok(!/\[\[|\],\[/.test(text) && !/solution/i.test(text), 'no solution in the text');
    assert.ok(text.includes(`${sol.length} coups`));
    assert.deepEqual(await events(page, 'share'), [{ source: 'mini-jeu', game: 'tri-couleurs', event: 'share', kind: 'challenge' }]);
    // the plain share is a different kind
    await page.locator('#bShare').tap();
    assert.deepEqual((await events(page, 'share')).map(e => e.kind), ['challenge', 'result']);
    assert.ok(!/https?:/.test((await page.evaluate(() => window.__shared))[1].text));

    // daily link
    await page.evaluate(d => window.__game.setToday(d), dateOf(20));
    const s = await playToday(page);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bChal').tap();
    const sh2 = await page.evaluate(() => window.__shared);
    assert.equal(sh2[sh2.length - 1].text.match(/https?:\/\/\S+/)[0], `${base}#defi-jour-${dayNum(20)}-${s.moves}`);
    await context.close();

    // no config and a file: address: no link at all (a link to a local file is useless)
    const b = await open();
    await b.page.evaluate(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } });
    });
    await b.page.evaluate(k => window.__game.loadLevel(k), 1);
    await tapMoves(b.page, SOL.levels[0]);
    await b.page.locator('#win').waitFor({ state: 'visible' });
    await b.page.locator('#bChal').tap();
    const t2 = (await b.page.evaluate(() => window.__shared))[0].text;
    assert.ok(!/https?:|file:|#defi/.test(t2) && t2.includes(`${P(1)} coups`), 'no link without a base: ' + t2);
    await b.context.close();

    // no config but served over http(s): the current address is the base
    const ctx = await browser.newContext({ ...MOBILE, viewport: { width: 360, height: 640 } });
    await ctx.route('http://pile.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(FILE, 'utf8') }));
    const hp = await ctx.newPage();
    hp.on('pageerror', e => problems.push('pageerror(http): ' + e.message));
    await hp.goto('http://pile.test/jeux/pile-poil/index.html');
    await hp.waitForFunction(() => !!window.__game);
    await hp.evaluate(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } });
    });
    await hp.evaluate(k => window.__game.loadLevel(k), 1);
    await tapMoves(hp, SOL.levels[0]);
    await hp.locator('#win').waitFor({ state: 'visible' });
    await hp.locator('#bChal').tap();
    const t3 = (await hp.evaluate(() => window.__shared))[0].text;
    assert.ok(t3.includes(`http://pile.test/jeux/pile-poil/index.html#defi-1-${P(1)}`), t3);
    await ctx.close();
  });

  await test('challenge: opened by the link (even on a locked level), banner, won, lost, and nothing saved', async () => {
    // won: level 7 is locked, the target is 6 moves above the solution
    let { context, page } = await open({ width: 360, height: 640 }, { hash: `#defi-7-${P(7) + 6}` });
    let s = await state(page);
    assert.equal(s.screen, 'game');
    assert.equal(s.level, 7);
    assert.deepEqual(s.challenge, { target: P(7) + 6, level: 7, day: 0 });
    assert.ok(await page.locator('#chal').isVisible());
    assert.match(await page.locator('#chal').textContent(), new RegExp(`Objectif : ${P(7) + 6} coups ou moins`));
    assert.ok(await page.locator('#goal').isHidden(), 'one objective on screen: the star reference is hidden');
    assert.deepEqual(await events(page, 'challenge_open'), [{ source: 'mini-jeu', game: 'tri-couleurs', event: 'challenge_open', level: 7, target: P(7) + 6 }]);
    assert.equal(await page.evaluate(() => location.hash), '', 'the link is consumed');
    await shot(page, 'challenge-banner');
    await tapMoves(page, SOL.levels[6]);
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wChal').textContent(), /Défi relevé/);
    assert.deepEqual(await events(page, 'challenge_result'), [{ source: 'mini-jeu', game: 'tri-couleurs', event: 'challenge_result', level: 7, moves: P(7), target: P(7) + 6, won: true }]);
    assert.ok((await events(page, 'badge')).some(e => e.id === 'defi'), 'first challenge won: badge');
    assert.match(await page.locator('#bChal').textContent(), /Renvoyer/);
    assert.equal((await page.locator('#bNext').textContent()).trim(), 'Accueil');
    const stored = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
    assert.equal(stored.stars[6] || 0, 0, 'a locked level played for a challenge is not recorded');
    assert.equal(stored.max, 1, 'and does not unlock anything');
    await page.locator('#bAgain').tap();                        // "Rejouer" keeps the challenge
    assert.match(await page.locator('#chal').textContent(), new RegExp(`Objectif : ${P(7) + 6} coups ou moins`));
    await context.close();

    // lost: the target is 4 moves under the solution
    ({ context, page } = await open({ width: 360, height: 640 }, { hash: `#defi-7-${P(7) - 4}` }));
    await tapMoves(page, SOL.levels[6]);
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wChal').textContent(), /^À 4 coups près$/);
    assert.doesNotMatch(await page.locator('#wRec').textContent(), /étoiles en/, 'no second objective on the win screen');
    assert.deepEqual(await events(page, 'challenge_result'), [{ source: 'mini-jeu', game: 'tri-couleurs', event: 'challenge_result', level: 7, moves: P(7), target: P(7) - 4, won: false }]);
    assert.equal((await events(page, 'badge')).filter(e => e.id === 'defi').length, 0);
    assert.match(await page.locator('#bChal').textContent(), /Renvoyer/, 'offers to send the challenge back');
    await shot(page, 'challenge-lost');
    await context.close();

    // an unlocked level: normal play, the result is saved
    ({ context, page } = await open({ width: 360, height: 640 }, { save: { level: 3, max: 3, stars: [3, 3], best: [3, 6], cur: null }, hash: `#defi-3-${P(3)}` }));
    s = await state(page);
    assert.equal(s.level, 3);
    await tapMoves(page, SOL.levels[2]);
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wChal').textContent(), /Défi relevé/);
    assert.equal((await page.locator('#bNext').textContent()).trim(), 'Suivant');
    assert.equal((await state(page)).total, 9);
    await context.close();

    // already open page: a pasted link (hash change) opens the challenge; a daily challenge opens today's level
    ({ context, page } = await open());
    await page.evaluate(d => window.__game.setToday(d), dateOf(40));
    await page.evaluate(d => { location.hash = '#defi-jour-' + d + '-50'; }, dayNum(40));
    await page.waitForFunction(() => window.__game.state().mode === 'daily');
    s = await state(page);
    assert.equal(s.dailyIndex, s.todayIndex);
    assert.equal(s.challenge.target, 50);
    assert.equal(s.challenge.day, dayNum(40));
    assert.deepEqual((await events(page, 'challenge_open')).map(e => [e.level, e.day, e.target]), [[0, dayNum(40), 50]]);
    await tapMoves(page, SOL.daily[s.dailyIndex]);
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wChal').textContent(), /Défi relevé/);
    const res = (await events(page, 'challenge_result'))[0];
    assert.equal(res.won, true);
    assert.equal((await state(page)).streak, 1, 'the daily of the day still counts for the series');
    await context.close();

    // junk links are ignored
    ({ context, page } = await open());
    for (const h of ['#defi-999-3', '#defi-abc', '#defi-0-3', '#defi-5-0', '#autre']) {
      await page.evaluate(x => { location.hash = x; }, h);
      await page.waitForTimeout(60);
      assert.equal((await state(page)).challenge, null, 'junk link accepted: ' + h);
      assert.equal((await state(page)).screen, 'home');
    }
    assert.equal((await events(page, 'challenge_open')).length, 0);
    await context.close();
  });

  // ---------------------------------------------------------------- host events
  await test('host events: only the listed ones, with only the listed fields', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { hash: `#defi-2-${P(2) + 3}` });
    await tapMoves(page, SOL.levels[1]);                         // challenge result + level_complete
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.evaluate(d => window.__game.setToday(d), dateOf(60));
    await playToday(page);                                       // daily_complete
    await page.evaluate(d => window.__game.setToday(d), dateOf(70));   // streak_lost
    const m = await msgs(page);
    const allowed = {
      level_complete: ['level', 'moves', 'stars'], daily_complete: ['day', 'moves', 'streak'], streak_lost: [],
      rank_up: ['rank'], badge: ['id'], share: ['kind'], challenge_open: ['level', 'target', 'day'],
      challenge_result: ['level', 'moves', 'target', 'won', 'day'],
    };
    const names = new Set(m.map(x => x.event));
    for (const e of ['level_complete', 'daily_complete', 'streak_lost', 'challenge_open', 'challenge_result']) assert.ok(names.has(e), 'missing event ' + e);
    m.forEach(x => {
      assert.ok(x.event in allowed, 'unlisted event ' + x.event);
      assert.equal(x.source, 'mini-jeu'); assert.equal(x.game, 'tri-couleurs');
      Object.keys(x).filter(k => !['source', 'game', 'event'].includes(k)).forEach(k => assert.ok(allowed[x.event].includes(k), `${x.event}: unexpected field ${k}`));
    });
    const lc = m.find(x => x.event === 'level_complete');
    assert.deepEqual(lc, { source: 'mini-jeu', game: 'tri-couleurs', event: 'level_complete', level: 2, moves: SOL.levels[1].length, stars: 3 });
    await context.close();
  });

  await test('share: result text without spoiler, clipboard fallback', async () => {
    const { context, page } = await open();
    await page.evaluate(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } });
    });
    await page.locator('#bGo').tap();
    await tapMoves(page, SOL.levels[0]);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bShare').tap();
    const shared = await page.evaluate(() => window.__shared);
    assert.equal(shared.length, 1);
    assert.equal(shared[0].text, `Pile Poil · Niveau 1 en ${SOL.levels[0].length} coups ⭐⭐⭐`);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } });
    });
    await page.locator('#bShare').tap();
    await page.waitForFunction(() => document.getElementById('bShare').textContent === 'Copié !');
    assert.deepEqual(await page.evaluate(() => window.__copied), [shared[0].text]);
    await context.close();
  });

  // ---------------------------------------------------------------- layout
  for (const vp of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 430, height: 932 }]) {
    await test(`layout ${vp.width}x${vp.height}: home, world grid, heaviest levels, win screen: no scroll, targets >= 44 px`, async () => {
      const save = { level: 40, max: 40, stars: stars(39, 2), best: stars(39, 30), cur: null, streak: 12, jokers: 2, lastDay: Math.floor(Date.now() / 864e5) - 1, badges: ['monde1'], rankSeen: 3 };
      const { context, page } = await open(vp, { save });
      const tag = `@${vp.width}x${vp.height}`;
      // home
      checkFit(await measure(page, '#home button'), 'home ' + tag);
      await shot(page, `home-${vp.width}x${vp.height}`);
      // worlds, grid of a world, badges
      await page.locator('#bWorlds').tap();
      checkFit(await measure(page, '#worlds button'), 'worlds ' + tag);
      await shot(page, `worlds-${vp.width}x${vp.height}`);
      await page.locator('[data-world="1"]').tap();
      checkFit(await measure(page, '#wgrid button'), 'world grid ' + tag);
      await shot(page, `grid-${vp.width}x${vp.height}`);
      await page.locator('#bGBack').tap(); await page.locator('#bWBack').tap();
      await page.locator('#bBadges').tap();
      checkFit(await measure(page, '#badges button'), 'badges ' + tag);
      const rows = await measure(page, '#blist .bd');
      assert.equal(rows.targets.length, 6);
      rows.targets.forEach(q => assert.ok(q.b <= rows.ih && q.h >= 44, 'badge row out of screen'));
      await shot(page, `badges-${vp.width}x${vp.height}`);
      await page.locator('#bBBack').tap();
      // game: the most loaded levels
      const picks = await page.evaluate(() => {
        const L = window.__game.levels, score = l => l.tubes.length * 100 + l.cap * 10 + (l.mystery ? 1 : 0);
        let heavy = 0, tall = 0, short = -1, myst = -1;
        L.forEach((l, i) => {
          if (score(l) > score(L[heavy])) heavy = i;
          if (l.cap === 4 && l.tubes.length >= 12 && !l.mystery) tall = i;
          if (short < 0 && l.caps.some(c => c < l.cap) && !l.mystery) short = i;
          if (myst < 0 && l.mystery) myst = i;
        });
        return [1, 10, heavy + 1, tall + 1, short + 1, myst + 1];
      });
      for (const n of picks) {
        await page.evaluate(k => window.__game.loadLevel(k), n);
        const m = await measure(page, '[data-tube], header button, footer button');
        const t = `level ${n} ${tag}`;
        checkFit(m, t);
        const tubes = (await page.evaluate(() => [...document.querySelectorAll('[data-tube]')].map(e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; })));
        const info = await page.evaluate(() => ({
          board: (q => ({ t: q.top, b: q.bottom }))(document.getElementById('board').getBoundingClientRect()),
          footer: document.querySelector('footer').getBoundingClientRect().top,
          balls: [...document.querySelectorAll('.ball')].map(e => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width }; }),
          iw: window.innerWidth, ih: window.innerHeight,
        }));
        tubes.forEach((q, i) => {
          assert.ok(q.t >= info.board.t - 0.5 && q.b <= info.board.b + 0.5, `${t}: tube ${i} out of the board`);
          assert.ok(q.b <= info.footer, `${t}: tube ${i} under the buttons`);
        });
        for (let i = 0; i < tubes.length; i++) for (let j = i + 1; j < tubes.length; j++) {
          const a = tubes[i], c = tubes[j];
          assert.ok(a.r <= c.l + 0.5 || c.r <= a.l + 0.5 || a.b <= c.t + 0.5 || c.b <= a.t + 0.5, `${t}: tubes ${i} and ${j} overlap`);
        }
        info.balls.forEach((q, i) => {
          assert.ok(q.l >= 0 && q.t >= 0 && q.r <= info.iw && q.b <= info.ih, `${t}: ball ${i} out of screen`);
          assert.ok(q.w >= 24, `${t}: balls too small (${q.w}px)`);
        });
        await tube(page, 0).tap();                           // a lifted ball stays on screen too
        await page.waitForTimeout(250);
        const lifted = await page.evaluate(() => [...document.querySelectorAll('.ball')].map(e => e.getBoundingClientRect().top));
        assert.ok(Math.min(...lifted) >= info.board.t - 0.5, `${t}: lifted ball leaves the board`);
        if (n === picks[2]) await shot(page, `heaviest-${vp.width}x${vp.height}`);
        else if (n === picks[5]) await shot(page, `mystery-${vp.width}x${vp.height}`);
        else if (n === picks[4]) await shot(page, `short-${vp.width}x${vp.height}`);
        await tube(page, 0).tap();
      }
      await context.close();

      // win screen with a challenge result, a rank-up and two badges: the longest content
      const b = await open(vp, { save: { level: 20, max: 20, stars: stars(19, 3), best: stars(19, 20), cur: null, rankSeen: 0 }, hash: '#defi-20-5' });
      await b.page.evaluate(sol => sol.forEach(([f, t]) => window.__game.applyMove(f, t)), SOL.levels[19]);
      await b.page.locator('#win').waitFor({ state: 'visible' });
      await b.page.waitForTimeout(500);
      const w = await measure(b.page, '#win .btn');
      checkFit({ ...w, sw: w.sw, sh: w.sh }, `win ${tag}`);
      const card = await b.page.evaluate(() => { const q = document.querySelector('#win .card').getBoundingClientRect(); return { t: q.top, b: q.bottom, l: q.left, r: q.right, ih: window.innerHeight, iw: window.innerWidth }; });
      assert.ok(card.t >= 0 && card.b <= card.ih && card.l >= 0 && card.r <= card.iw, `win card out of screen ${tag}: ${JSON.stringify(card)}`);
      await shot(b.page, `win-full-${vp.width}x${vp.height}`);
      await b.context.close();
    });
  }

  await test('reduced motion: still playable, no confetti', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    await page.locator('#bGo').tap();
    await tapMoves(page, SOL.levels[0]);
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#win .bit').count(), 0);
    await context.close();
  });

  await test('no network request besides the file itself, no console error', async () => {
    assert.deepEqual(problems, []);
  });

  await browser.close();
  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(async e => {
  console.error(e);
  if (browser) await browser.close();
  process.exit(1);
});
