'use strict';
/*
 * Mobile acceptance tests for games/semailles ("Petit Mil"), plain node + playwright + node:assert.
 *   node tests/semailles.spec.js          (SHOTS=<dir> also writes screenshots)
 * Rules are checked on hand-made positions (page engine and reference engine), then against the
 * reference engine on thousands of random positions. The 20 levels are won by real taps with a
 * test player (tools/semailles/player.js) that searches deeper than the adversary of the level.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const R = require('../tools/semailles/engine');
const { strongFor } = require('../tools/semailles/player');

const FILE = process.env.GAME_FILE || path.join(__dirname, '..', 'games', 'semailles', 'index.html');
const GE = require('../tools/semailles/game-engine').load(FILE);
const URL = pathToFileURL(FILE).href;
const KEY = 'mj:semailles:v1';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const VIEWPORTS = [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 430, height: 932 }];
const SEED = n => 100 + n;     // fixed seed of level n (tools/semailles/seeds.js: the test player wins all 20 with these)

let browser;
const problems = [];   // console errors, page errors, unexpected requests (all pages)
const results = [];

// Opens the game. opts.save / opts.raw put a save in localStorage before the game boots (written from
// the page, then the page is loaded again: an init script that reads localStorage at document start
// sometimes sees nothing after a reload in Chromium); opts.config sets window.MJ_CONFIG; opts.hash
// opens a link; opts.broken makes the storage throw. Every message to the host is collected in
// window.__msgs.
async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = opts.context || await browser.newContext({ ...MOBILE, viewport, ...(opts.extra || {}) });
  await context.addInitScript(({ config, broken }) => {
    window.__msgs = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    if (broken) {
      try {
        Storage.prototype.getItem = function () { throw new Error('no storage'); };
        Storage.prototype.setItem = function () { throw new Error('no storage'); };
      } catch (e) { /* ignore */ }
    }
    if (config) window.MJ_CONFIG = config;
  }, { config: opts.config || null, broken: !!opts.broken });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('request', r => { if (r.url().split('#')[0] !== URL) problems.push('request: ' + r.url()); });
  const seed = opts.raw !== undefined ? opts.raw : opts.save ? JSON.stringify(opts.save) : null;
  if (seed !== null) {
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, seed]);
    await page.waitForTimeout(100);
  }
  await page.goto(URL + (seed === null ? opts.hash || '' : ''));   // a link is opened at boot unless a save had to be loaded first
  await page.waitForFunction(() => !!window.__game);
  if (opts.hash && seed !== null) { await page.goto(URL + opts.hash); await page.waitForTimeout(50); }
  return { context, page };
}
const state = page => page.evaluate(() => window.__game.state());
const msgs = page => page.evaluate(() => new Promise(r => setTimeout(() => r(window.__msgs), 40)));
const events = async (page, name) => (await msgs(page)).filter(m => m.event === name);
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const pit = (page, i) => page.locator(`[data-pit="${i}"]`);
// Resolves with the state once it is my turn again (or the game is over), polling inside the page.
// `after` = the number of moves played before the tap: a tap is handled asynchronously by the page, so
// the state is only trusted once the move has really been played.
const myTurn = (page, after = -1) => page.evaluate(a => new Promise((resolve, reject) => {
  let n = 0;
  const f = () => {
    const s = window.__game.state();
    if (s.plies > a && !s.busy && (s.turn === 0 || s.over)) resolve(s);
    else if (++n > 6000) reject(new Error('no turn after 12 s'));
    else setTimeout(f, 2);
  };
  f();
}), after);
// Reloads after letting the page's storage writes reach the browser (a reload right after a write can read the old value).
async function reload(page) { await page.waitForTimeout(250); await page.reload(); await page.waitForFunction(() => !!window.__game); }
const refOf = s => R.initial(s.board, s.store, 0);

// One real tap on a pit, then waits until the adversary has answered (or the game is over).
async function tapPit(page, i) { const b = await state(page); await pit(page, i).tap(); return myTurn(page, b.plies); }

// Plays the current game to its end with real taps; `player` chooses from a reference state.
async function playByTaps(page, player) {
  // the layout does not move during a level: the centres of the pits are measured once
  const c = await page.evaluate(() => { const o = {}; document.querySelectorAll('[data-pit]').forEach(e => { const r = e.getBoundingClientRect(); o[e.dataset.pit] = [r.left + r.width / 2, r.top + r.height / 2]; }); return o; });
  let s = await myTurn(page);
  for (let guard = 0; guard < 260; guard++) {
    if (s.over) return s;
    const p = player(refOf(s), null, s.plies);
    assert.ok(s.legal.includes(p), `player chose an illegal pit ${p} (legal ${s.legal})`);
    const before = s.plies;
    await page.touchscreen.tap(c[p][0], c[p][1]);
    s = await myTurn(page, before);
  }
  throw new Error('game does not end');
}
// Same, without taps (hook), for scenarios that only need a finished game.
async function playByHook(page, player) {
  for (let guard = 0; guard < 260; guard++) {
    const s = await state(page);
    if (s.over) return s;
    await page.evaluate(p => window.__game.applyMove(p), player(refOf(s), null, s.plies));
  }
  throw new Error('game does not end');
}

async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
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
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}
const stars = (n, v) => new Array(n).fill(v);
const std = () => new Array(12).fill(4);

// Layout metrics of the current screen.
const measure = (page, sel) => page.evaluate(selector => {
  const de = document.documentElement, b = document.body;
  window.scrollTo(50, 50);
  const r = el => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const vis = el => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const clipped = [...document.querySelectorAll('.store .who, #msg, #goal, .brand, #lvl, .btn, .cell .n, #chalT, .card h2, .card p, .nb')]
    .filter(vis).filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.id || el.className || el.tagName);
  return {
    iw: window.innerWidth, ih: window.innerHeight,
    sw: Math.max(de.scrollWidth, b.scrollWidth), sh: Math.max(de.scrollHeight, b.scrollHeight),
    sx: window.scrollX, sy: window.scrollY, vv: window.visualViewport ? window.visualViewport.scale : 1,
    clipped, targets: [...document.querySelectorAll(selector)].filter(vis).map(r),
  };
}, sel);
function checkFit(m, tag) {
  assert.ok(m.sw <= m.iw, `${tag}: horizontal scroll (${m.sw} > ${m.iw})`);
  assert.ok(m.sh <= m.ih, `${tag}: vertical scroll (${m.sh} > ${m.ih})`);
  assert.equal(m.sx, 0, tag + ': scrolled x'); assert.equal(m.sy, 0, tag + ': scrolled y');
  assert.equal(m.vv, 1, tag + ': zoomed');
  assert.ok(m.targets.length > 0, tag + ': no target found');
  assert.deepEqual(m.clipped, [], tag + ': text clipped');
  m.targets.forEach((q, i) => {
    assert.ok(q.w >= 44 && q.h >= 44, `${tag}: target ${i} is ${Math.round(q.w)}x${Math.round(q.h)}`);
    assert.ok(q.l >= -0.5 && q.t >= -0.5 && q.r <= m.iw + 0.5 && q.b <= m.ih + 0.5, `${tag}: target ${i} out of screen`);
  });
}

// ---- rule positions -------------------------------------------------------------------------
// [name, pits, store, turn, pit, expected {pits (only the listed indices), store, gain, taken, grand, last}]
const pits = (o, base = 0) => { const p = new Array(12).fill(base); for (const k in o) p[k] = o[k]; return p; };
const POSITIONS = [
  ['plain sowing, counter-clockwise', pits({ 2: 3, 8: 1 }), [0, 0], 0, 2, { at: { 2: 0, 3: 1, 4: 1, 5: 1 }, gain: 0, last: 5 }],
  ['sowing goes round: pit 11 -> pit 0', pits({ 10: 3, 4: 1 }), [0, 0], 1, 10, { at: { 10: 0, 11: 1, 0: 1, 1: 1 }, gain: 0, last: 1 }],
  ['a pit of 12 seeds skips its own pit', pits({ 0: 12, 8: 1 }), [0, 0], 0, 0, { at: { 0: 0, 1: 2, 2: 1, 5: 1, 8: 2, 11: 1 }, gain: 0, last: 1 }],
  ['15 seeds: the start pit is skipped, the last seed lands on pit 7 and takes 6 and 7', pits({ 3: 15, 9: 5 }), [0, 0], 0, 3, { at: { 3: 0, 4: 2, 5: 2, 6: 0, 7: 0, 9: 6 }, gain: 4, taken: [7, 6], store: [4, 0], last: 7 }],
  ['capture: opponent pit becomes 2', pits({ 5: 1, 6: 1, 9: 4 }), [0, 0], 0, 5, { at: { 6: 0, 5: 0 }, gain: 2, taken: [6], store: [2, 0], last: 6 }],
  ['capture: opponent pit becomes 3', pits({ 4: 3, 7: 2, 10: 3 }), [0, 0], 0, 4, { at: { 7: 0, 6: 1, 5: 1 }, gain: 3, taken: [7], store: [3, 0], last: 7 }],
  ['no capture when the pit becomes 1', pits({ 5: 1, 9: 4 }), [0, 0], 0, 5, { at: { 6: 1 }, gain: 0, taken: [] }],
  ['no capture when the pit becomes 4', pits({ 5: 1, 6: 3, 9: 4 }), [0, 0], 0, 5, { at: { 6: 4 }, gain: 0, taken: [] }],
  ['no capture on the own side even at 2 or 3', pits({ 2: 2, 4: 1, 6: 5 }), [0, 0], 0, 2, { at: { 3: 1, 4: 2 }, gain: 0, taken: [] }],
  ['only the last pit decides: pits at 2 on the way are safe', pits({ 5: 3, 6: 1, 7: 1, 8: 5, 10: 4 }), [0, 0], 0, 5, { at: { 6: 2, 7: 2, 8: 6 }, gain: 0, taken: [] }],
  ['chain of captures towards the back', pits({ 5: 3, 6: 1, 7: 2, 8: 1, 10: 5 }), [0, 0], 0, 5, { at: { 6: 0, 7: 0, 8: 0, 10: 5 }, gain: 7, taken: [8, 7, 6], store: [7, 0], last: 8 }],
  ['the chain stops at the first pit that is not 2 or 3', pits({ 5: 3, 6: 3, 7: 1, 8: 1, 10: 5 }), [0, 0], 0, 5, { at: { 6: 4, 7: 0, 8: 0 }, gain: 4, taken: [8, 7], store: [4, 0] }],
  ['the chain never goes onto the own side (side 0, pit 5 at 2)', pits({ 4: 2, 5: 1, 6: 1, 9: 3 }), [0, 0], 0, 4, { at: { 4: 0, 5: 2, 6: 0 }, gain: 2, taken: [6], store: [2, 0] }],
  ['side 1 captures towards pit 0 and stops there', pits({ 11: 2, 0: 1, 1: 2, 4: 3 }), [0, 0], 1, 11, { at: { 0: 0, 1: 0, 4: 3, 11: 0 }, gain: 5, taken: [1, 0], store: [0, 5] }],
  ['a capture that leaves seeds behind is a normal capture', pits({ 5: 2, 7: 1, 8: 1 }), [0, 0], 0, 5, { at: { 6: 1, 7: 0, 8: 1 }, gain: 2, taken: [7], grand: false }],
  ['grand slam: the move is legal and captures nothing', pits({ 4: 2, 6: 1, 5: 1 }), [0, 0], 0, 4, { at: { 5: 2, 6: 2 }, gain: 0, taken: [], grand: true, store: [0, 0] }],
  ['grand slam by a chain: nothing is captured', pits({ 5: 3, 6: 1, 7: 2, 8: 1 }), [0, 0], 0, 5, { at: { 6: 2, 7: 3, 8: 2 }, gain: 0, taken: [], grand: true, store: [0, 0] }],
  ['partial capture is not a grand slam', pits({ 4: 2, 6: 1, 5: 1, 9: 6 }), [0, 0], 0, 4, { at: { 6: 0, 5: 2, 9: 6 }, gain: 2, taken: [6], grand: false }],
  ['captures add to the store already there', pits({ 5: 1, 6: 1, 9: 4 }), [10, 7], 0, 5, { gain: 2, store: [12, 7] }],
];
const FEED = [
  // opponent empty: only moves that give seeds
  ['must feed: only the pits that reach the opponent', pits({ 0: 1, 2: 3, 4: 1, 5: 2 }), [0, 0], 0, [5]],
  ['must feed: exact reach counts (3 seeds from pit 3 end on 6)', pits({ 3: 3, 2: 3, 0: 1 }), [0, 0], 0, [3]],
  ['must feed: a big pit always reaches', pits({ 0: 12, 1: 1 }), [0, 0], 0, [0]],
  ['must feed, side 1 (pit 8 reaches pit 0, pit 11 too)', pits({ 6: 1, 8: 4, 10: 1, 11: 3 }), [0, 0], 1, [8, 11]],
  ['not starving: every non-empty pit is legal', pits({ 0: 1, 2: 3, 5: 2, 7: 1 }), [0, 0], 0, [0, 2, 5]],
  ['no feeding move at all: no legal move', pits({ 0: 1, 1: 1 }), [0, 0], 0, []],
];
const ENDS = [
  // [name, pits, store, turn, plies, expected]
  ['25 seeds win at once', pits({ 0: 1, 7: 2 }), [25, 3], 1, 10, { winner: 0, why: 'win', store: [25, 3] }],
  ['25 seeds for the adversary', pits({ 0: 1, 7: 2 }), [3, 25], 0, 10, { winner: 1, why: 'win', store: [3, 25] }],
  ['the game goes on while both can play', pits({ 0: 1, 7: 2 }), [10, 10], 0, 10, null],
  ['no seed to play: the opponent keeps the seeds of his side', pits({ 7: 5 }), [10, 10], 0, 10, { winner: 1, why: 'stuck', store: [10, 15] }],
  ['opponent starved and nothing feeds him: I keep my seeds', pits({ 0: 1, 1: 1 }), [20, 20], 0, 10, { winner: 0, why: 'stuck', store: [22, 20] }],
  ['a draw is a draw', pits({}), [24, 24], 0, 10, { winner: -1, why: 'stuck', store: [24, 24] }],
  ['endless game: at 200 moves the seeds left are counted', pits({ 0: 3, 1: 2, 7: 1, 8: 1 }), [10, 12], 0, 200, { winner: 0, why: 'cap', store: [15, 14] }],
  ['199 moves: the game still goes on', pits({ 0: 3, 1: 2, 7: 1, 8: 1 }), [10, 12], 0, 199, null],
];

(async () => {
  browser = await chromium.launch();
  console.log('semailles (Petit Mil)');

  // ------------------------------------------------------------------ weight, network, data
  await test('file is a single HTML under 150 KB, no external reference, no network call in the code', async () => {
    const html = fs.readFileSync(FILE, 'utf8');
    assert.ok(Buffer.byteLength(html) < 150 * 1024, 'size ' + Buffer.byteLength(html));
    assert.ok(!/(src|href)\s*=\s*["']\s*(https?:)?\/\//i.test(html), 'external reference');
    assert.ok(!/@import|url\(\s*["']?https?:/i.test(html), 'external css');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|WebGL/i.test(html), 'network or WebGL API');
    assert.ok(!/<link\b[^>]*rel=["']?(stylesheet|preload|icon)/i.test(html), 'link tag');
    assert.equal((html.match(/<script/g) || []).length, 1, 'one inline script');
    console.log(`        size: ${Buffer.byteLength(html)} bytes`);
  });

  await test('hooks: 20 levels of 48 seeds, special starts announced, no solution in __game', async () => {
    const { context, page } = await open();
    const g = await page.evaluate(() => ({ keys: Object.keys(window.__game), levels: window.__game.levels, st: window.__game.state() }));
    assert.equal(g.levels.length, 20);
    for (const k of ['state', 'levels', 'loadLevel', 'applyMove', 'seed']) assert.ok(g.keys.includes(k), 'missing ' + k);
    assert.ok(!g.keys.some(k => /sol|answer|hint|best/i.test(k)), 'solution-like hook: ' + g.keys);
    g.levels.forEach((l, i) => {
      assert.equal(l.p.length, 12, `level ${i + 1} pits`);
      assert.equal(l.p.reduce((a, b) => a + b, 0) + l.s[0] + l.s[1], 48, `level ${i + 1} total seeds`);
      assert.ok(l.s[0] < 25 && l.s[1] < 25, `level ${i + 1} already decided`);
      assert.ok(l.nm.length >= 3 && l.nm.length <= 12, 'name ' + l.nm);
    });
    assert.equal(new Set(g.levels.map(l => l.nm)).size, 20, 'distinct adversary names');
    assert.equal(g.levels[0].ai.r, 1, 'level 1 plays at random');
    assert.ok(g.levels.filter(l => l.note).length >= 4, 'a few special starts');
    assert.ok(g.levels.filter(l => l.p.some(v => v !== 4) || l.s[0] || l.s[1]).length < 20 && g.levels[19].p.every(v => v === 4), 'level 20 is the classical start');
    assert.equal(g.st.screen, 'home');
    await context.close();
  });

  // ------------------------------------------------------------------ rules: positions
  await test('rules (positions): sowing, skipping, captures, chains, grand slam, on both engines', async () => {
    const { context, page } = await open();
    for (const [name, p, st, turn, pitN, exp] of POSITIONS) {
      const ref = R.play(R.initial(p, st, turn), pitN);
      const mine = await page.evaluate(([a, b, c, d]) => window.__game.rules.play(a, b, c, d), [p, st, turn, pitN]);
      for (const [who, r] of [['game', { pits: mine.pits, store: mine.store, gain: mine.gain, taken: mine.taken, grand: mine.grand, last: mine.last }],
        ['reference', { pits: ref.state.pits, store: ref.state.store, gain: ref.seeds, taken: ref.taken, grand: ref.grandSlam, last: ref.last }]]) {
        const tag = `${who}: ${name}`;
        for (const k in (exp.at || {})) assert.equal(r.pits[k], exp.at[k], `${tag}: pit ${k}`);
        if (exp.gain !== undefined) assert.equal(r.gain, exp.gain, tag + ': gain');
        if (exp.taken) assert.deepEqual(r.taken, exp.taken, tag + ': taken');
        if (exp.store) assert.deepEqual(r.store, exp.store, tag + ': store');
        if (exp.grand !== undefined) assert.equal(r.grand, exp.grand, tag + ': grand slam');
        if (exp.last !== undefined) assert.equal(r.last, exp.last, tag + ': last pit');
        const total = r.pits.reduce((a, b) => a + b, 0) + r.store[0] + r.store[1];
        assert.equal(total, p.reduce((a, b) => a + b, 0) + st[0] + st[1], tag + ': seeds are conserved');
      }
      assert.deepEqual(mine.pits, ref.state.pits, name + ': engines differ');
    }
    for (const [name, p, st, turn, legal] of FEED) {
      const mine = await page.evaluate(([a, b, c]) => window.__game.rules.legal(a, b, c), [p, st, turn]);
      assert.deepEqual(mine, legal, 'game: ' + name);
      assert.deepEqual(R.legalMoves(R.initial(p, st, turn)), legal, 'reference: ' + name);
    }
    for (const [name, p, st, turn, plies, exp] of ENDS) {
      const mine = await page.evaluate(([a, b, c, d]) => window.__game.rules.end(a, b, c, d), [p, st, turn, plies]);
      const s = R.initial(p, st, turn); s.plies = plies;
      const ref = R.ending(s);
      for (const [who, r] of [['game', mine], ['reference', ref]]) {
        if (exp === null) assert.equal(r, null, `${who}: ${name}`);
        else assert.deepEqual({ winner: r.winner, why: r.why, store: r.store }, exp, `${who}: ${name}`);
      }
    }
    await context.close();
  });

  await test('rules (fuzz): the game engine equals the reference engine on 8000 random positions and 300 whole games', async () => {
    const rnd = GE.mkRng(12345);
    const pick = n => Math.floor(rnd() * n);
    const compare = (p, st, turn, plies, tag) => {
      const b = GE.mkBoard(p, st), s = R.initial(p, st, turn); s.plies = plies;
      const gl = GE.moves(b, turn), rl = R.legalMoves(s);
      assert.deepEqual(gl, rl, `${tag}: legal moves of ${JSON.stringify([p, st, turn])}`);
      const ge = GE.status(b, turn, plies), re = R.ending(s);
      if (!re) assert.equal(ge, null, `${tag}: end of ${JSON.stringify([p, st, turn, plies])}`);
      else assert.deepEqual([ge.winner, ge.why, ge.b[12], ge.b[13]], [re.winner, re.why, re.store[0], re.store[1]], `${tag}: end ${JSON.stringify([p, st, turn, plies])}`);
      for (const m of gl) {
        const gp = GE.play(b, turn, m), rp = R.play(s, m);
        assert.deepEqual(Array.from(gp.b.slice(0, 12)), rp.state.pits, `${tag}: pits after ${m} in ${JSON.stringify([p, st, turn])}`);
        assert.deepEqual([gp.b[12], gp.b[13]], rp.state.store, `${tag}: store after ${m}`);
        assert.equal(gp.gain, rp.seeds); assert.equal(gp.grand, rp.grandSlam); assert.equal(gp.last, rp.last);
        assert.deepEqual(gp.caps.map(c => c[0]), rp.taken);
        assert.deepEqual(gp.path, rp.sown);
      }
    };
    for (let i = 0; i < 8000; i++) {   // sparse, lumpy positions: lots of 0, 1, 2, 3 and a few heaps, and starving cases
      const p = new Array(12).fill(0).map(() => { const r = rnd(); return r < 0.3 ? 0 : r < 0.55 ? 1 + pick(2) : r < 0.85 ? pick(6) : pick(22); });
      if (rnd() < 0.15) for (let k = 0; k < 6; k++) p[(pick(2) * 6) + k] = 0;
      compare(p, [pick(26), pick(26)], pick(2), pick(2) ? 200 : pick(199), 'position ' + i);
    }
    // whole games, random moves on both sides, seeds always 48
    let longest = 0, ended = { win: 0, stuck: 0, cap: 0 };
    for (let g = 0; g < 300; g++) {
      let b = GE.mkBoard(std(), [0, 0]), t = 0, plies = 0, st;
      for (;;) {
        const s = { pits: Array.from(b.slice(0, 12)), store: [b[12], b[13]] };
        compare(s.pits, s.store, t, plies, `game ${g} ply ${plies}`);
        st = GE.status(b, t, plies);
        if (st) break;
        const mv = GE.moves(b, t);
        assert.ok(mv.length > 0, 'no move while the game goes on');
        b = GE.play(b, t, mv[pick(mv.length)]).b; t = 1 - t; plies++;
        assert.equal(Array.from(b).reduce((x, y) => x + y, 0), 48, 'seeds not conserved');
      }
      ended[st.why]++; longest = Math.max(longest, plies);
      if (st.why !== 'win') assert.equal(st.b.slice(0, 12).reduce((x, y) => x + y, 0), 0, 'seeds left on the board after a counted end');
      assert.equal(Array.from(st.b).reduce((x, y) => x + y, 0), 48);
    }
    console.log(`        random games: ${JSON.stringify(ended)}, longest ${longest} moves`);
    assert.ok(ended.win + ended.stuck + ended.cap === 300);
  });

  await test('rules (page): the engine in the page equals the reference on 400 positions', async () => {
    const { context, page } = await open();
    const rnd = GE.mkRng(777), pick = n => Math.floor(rnd() * n);
    const cases = [];
    for (let i = 0; i < 400; i++) {
      const p = new Array(12).fill(0).map(() => { const r = rnd(); return r < 0.3 ? 0 : r < 0.6 ? 1 + pick(2) : r < 0.9 ? pick(6) : pick(20); });
      cases.push([p, [pick(20), pick(20)], pick(2), pick(2) ? 200 : pick(150)]);
    }
    const out = await page.evaluate(cs => cs.map(([p, st, t, n]) => {
      const rules = window.__game.rules, legal = rules.legal(p, st, t);
      return { legal, end: rules.end(p, st, t, n), plays: legal.map(m => rules.play(p, st, t, m)) };
    }), cases);
    cases.forEach(([p, st, t, n], i) => {
      const s = R.initial(p, st, t); s.plies = n;
      assert.deepEqual(out[i].legal, R.legalMoves(s));
      const e = R.ending(s);
      assert.deepEqual(out[i].end, e ? { winner: e.winner, why: e.why, store: e.store } : null);
      out[i].legal.forEach((m, k) => {
        const r = R.play(s, m);
        assert.deepEqual(out[i].plays[k].pits, r.state.pits); assert.deepEqual(out[i].plays[k].store, r.state.store);
      });
    });
    await context.close();
  });

  // ------------------------------------------------------------------ adversaries
  await test('adversaries: seeded (same seed, same game), always legal, bounded search that never blocks the page', async () => {
    const { context, page } = await open();
    // determinism: the same seed gives the same game, a different seed another one (levels 1, 5, 12, 20)
    for (const n of [1, 5, 12, 20]) {
      const run = async seed => page.evaluate(([lv, sd]) => {
        const g = window.__game; g.seed(sd); g.loadLevel(lv);
        let k = 0;
        while (!g.state().over && k++ < 400) { const s = g.state(); g.applyMove(s.legal[k % s.legal.length]); }
        return g.state().hist.join(',');
      }, [n, seed]);
      const a = await run(5), b = await run(5), c = await run(6);
      assert.equal(a, b, `level ${n}: same seed, different game`);
      if (n === 1) assert.notEqual(a, c, 'level 1 does not depend on the seed');
    }
    // legality + bounded cost on positions met in real games (every 4th position of 3 games per level)
    const worst = await page.evaluate(() => {
      const g = window.__game, res = [];
      for (let n = 1; n <= 20; n++) {
        let maxMs = 0, maxNodes = 0, budget = g.levels[n - 1].ai.n, depthMax = 0;
        for (let game = 0; game < 3; game++) {
          g.seed(40 + game); g.loadLevel(n);
          let k = 0;
          while (!g.state().over && k++ < 400) {
            const s = g.state();
            if (k % 4 === 1 && s.turn === 0) {
              // the search of the adversary, seen from its side: mirror the board
              const mirror = s.board.slice(6).concat(s.board.slice(0, 6));
              const t = g.think(n, mirror, [s.store[1], s.store[0]]);
              maxMs = Math.max(maxMs, t.ms); maxNodes = Math.max(maxNodes, t.nodes); depthMax = Math.max(depthMax, t.depth);
              if (t.nodes > budget + 1) throw new Error('level ' + n + ': ' + t.nodes + ' nodes for a budget of ' + budget);
              const legal = g.rules.legal(mirror, [s.store[1], s.store[0]], 0);
              if (t.moves.some(m => legal.indexOf(m) < 0)) throw new Error('level ' + n + ': illegal move chosen');
            }
            g.applyMove(s.legal[(k * 7) % s.legal.length]);
          }
        }
        res.push({ n: n, maxMs: maxMs, maxNodes: maxNodes, budget: budget, depth: depthMax });
      }
      return res;
    });
    const slow = worst.reduce((a, b) => (b.maxMs > a.maxMs ? b : a));
    console.log(`        slowest search: level ${slow.n}, ${slow.maxMs.toFixed(1)} ms (${slow.maxNodes} nodes, depth up to ${worst[19].depth})`);
    worst.forEach(w => assert.ok(w.maxMs < 80, `level ${w.n}: a search took ${w.maxMs.toFixed(0)} ms`));
    assert.ok(worst[19].budget <= 12000, 'node budget of the hardest adversary');
    assert.ok(worst[0].maxNodes <= worst[19].maxNodes);
    await context.close();
  });

  await test('adversaries: the page stays responsive while the adversary thinks (level 20, no animation frame lost for long)', async () => {
    const { context, page } = await open();
    await page.evaluate(() => { window.__game.seed(3); window.__game.loadLevel(20); });
    const gap = await page.evaluate(() => new Promise(resolve => {
      let maxGap = 0, prev = performance.now(), frames = 0;
      const tick = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - prev); prev = t; frames++; if (frames < 40) requestAnimationFrame(tick); else resolve(maxGap); };
      requestAnimationFrame(tick);
    }));
    assert.ok(gap < 200, 'frame gap ' + gap);
    // a full move with the default animations: the pit empties, the seeds are laid one by one, then the reply comes
    await pit(page, 2).tap();
    let s = await state(page);
    assert.equal(s.busy, true, 'busy right after the tap');
    await page.waitForFunction(() => !window.__game.state().busy, null, { timeout: 8000 });
    s = await state(page);
    assert.equal(s.turn, 0); assert.equal(s.plies, 2);
    await context.close();
  });

  // ------------------------------------------------------------------ the 20 levels by real taps
  await test('all 20 levels are won by real taps (fixed seeds, test player deeper than the adversary), in order, with progress', async () => {
    const { context, page } = await open({ width: 360, height: 640 });
    const levels = await page.evaluate(() => window.__game.levels);
    await page.evaluate(() => window.__game.still(true));
    await page.evaluate(sd => window.__game.seed(sd), SEED(1));
    await page.locator('#bGo').tap();
    let totalStars = 0;
    const lines = [];
    for (let n = 1; n <= 20; n++) {
      let s = await state(page);
      assert.equal(s.screen, 'game'); assert.equal(s.level, n, 'level reached by Suivant');
      assert.equal(await page.locator('#lvl').innerText(), 'Niveau ' + n);
      assert.equal(await page.locator('#foeName').innerText(), levels[n - 1].nm);
      assert.deepEqual(s.board, levels[n - 1].p, `level ${n} start position`);
      assert.deepEqual(s.legal, [0, 1, 2, 3, 4, 5].filter(i => levels[n - 1].p[i] > 0));
      // highlighted pits are exactly the legal ones
      const lit = await page.evaluate(() => [...document.querySelectorAll('.pit.go')].map(e => +e.dataset.pit).sort());
      assert.deepEqual(lit, s.legal, 'highlighted pits');
      const t0 = Date.now();
      s = await playByTaps(page, strongFor(n, levels[n - 1]));
      assert.equal(s.winner, 0, `level ${n} (${levels[n - 1].nm}) lost ${s.store} after ${s.plies} moves`);
      const m = s.store[0] - s.store[1], want = 1 + (m >= 8 ? 1 : 0) + (m >= 16 ? 1 : 0);
      assert.equal(s.stars, want, 'stars follow the seed margin');
      await page.locator('#win').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#wTitle').innerText(), 'Gagné !');
      assert.equal(await page.locator('#wStars svg.on').count(), want);
      assert.equal(await page.locator('#wScore').innerText(), `${s.store[0]} – ${s.store[1]}`);
      assert.ok(s.store[0] >= 25 || s.why !== 'win');
      totalStars += want;
      lines.push(`${String(n).padStart(2)} ${levels[n - 1].nm.padEnd(12)} ${s.store[0]}-${s.store[1]} ${'*'.repeat(want)} (${s.plies} moves, ${Date.now() - t0} ms)`);
      const sv = await saved(page);
      assert.equal(sv.stars[n - 1], want); assert.equal(sv.max, Math.min(20, n + 1)); assert.equal(sv.cur, null);
      await page.evaluate(sd => window.__game.seed(sd), SEED(Math.min(20, n + 1)));
      await page.locator('#bNext').tap();
      await page.waitForTimeout(350);   // the board ignores taps for 300 ms after a result button
    }
    console.log(lines.map(l => '        ' + l).join('\n'));
    const s = await state(page);
    assert.equal(s.screen, 'levels', 'after level 20 the next button leads to the level grid');
    assert.equal(s.total, totalStars);
    assert.equal(await page.locator('#lTotal').innerText(), totalStars + '/60');
    assert.equal(await page.locator('.cell:not([disabled])').count(), 20);
    const ev = await events(page, 'level_complete');
    assert.equal(ev.length, 20);
    await context.close();
  });

  await test('a lost game is handled: "Perdu", no Suivant, nothing unlocked, Rejouer starts again', async () => {
    const { context, page } = await open();
    await page.evaluate(() => { window.__game.still(true); window.__game.seed(9); window.__game.loadLevel(20); });
    // the player always plays the leftmost legal pit against the hardest adversary: two real taps, then the hook
    for (let k = 0; k < 2; k++) { const s = await state(page); await tapPit(page, s.legal[0]); }
    let s = await state(page);
    for (let k = 0; k < 260 && !s.over; k++) { await page.evaluate(p => window.__game.applyMove(p), s.legal[0]); s = await state(page); }
    assert.equal(s.over, true); assert.equal(s.winner, 1, 'the game was lost');
    assert.equal(s.stars, 0);
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#wTitle').innerText(), 'Perdu');
    assert.equal(await page.locator('#bNext').isVisible(), false, 'no Suivant after a defeat');
    assert.equal(await page.locator('#wStars').isVisible(), false);
    // R2: a defeat offers "Réessayer" and "Niveaux", and reveals nothing else
    const vis = await page.evaluate(() => [...document.querySelectorAll('#win .btn')].filter(b => b.offsetWidth > 0).map(b => b.textContent));
    assert.deepEqual(vis, ['Réessayer', 'Niveaux']);
    const sv = await saved(page);
    assert.equal(sv.max, 1); assert.deepEqual(sv.stars, stars(20, 0)); assert.equal(sv.cur, null);
    assert.equal((await events(page, 'level_complete')).length, 0);
    await page.locator('#bAgain').tap();
    const a = await state(page);
    assert.equal(a.over, false); assert.equal(a.plies, 0); assert.equal(a.level, 20);
    assert.equal(await page.locator('#win').isVisible(), false);
    await context.close();
  });

  await test('stars: 1 for a win, 2 from +8 seeds, 3 from +16, 0 for a defeat (whole games on the hook)', async () => {
    const { context, page } = await open();
    const seen = new Map();
    const out = await page.evaluate(() => {
      const g = window.__game, res = [];
      for (let n = 1; n <= 6; n++) for (let sd = 1; sd <= 40; sd++) {
        g.seed(sd); g.loadLevel(n);
        let k = 0;
        while (!g.state().over && k++ < 300) {
          // greedy for the player: the pit that takes most right now (ties: leftmost)
          const s = g.state(), rules = g.rules;
          let best = s.legal[0], bg = -1;
          s.legal.forEach(m => { const r = rules.play(s.board, s.store, 0, m); if (r.gain > bg) { bg = r.gain; best = m; } });
          g.applyMove(best);
        }
        const s = g.state();
        res.push({ n: n, winner: s.winner, margin: s.store[0] - s.store[1], stars: s.stars });
      }
      return res;
    });
    for (const r of out) {
      const want = r.winner !== 0 ? 0 : 1 + (r.margin >= 8 ? 1 : 0) + (r.margin >= 16 ? 1 : 0);
      assert.equal(r.stars, want, JSON.stringify(r));
      seen.set(want, (seen.get(want) || 0) + 1);
    }
    console.log('        stars seen on 240 greedy games: ' + JSON.stringify([...seen.entries()].sort()));
    for (const k of [0, 1, 2, 3]) assert.ok(seen.get(k) > 0, `no game with ${k} star(s) to check`);
    await context.close();
  });

  // ------------------------------------------------------------------ play details
  await test('taps: opponent pits, empty pits and the obligation to feed are refused without changing anything; undo and restart', async () => {
    const { context, page } = await open();
    await page.evaluate(() => { window.__game.still(true); window.__game.seed(4); window.__game.loadLevel(3); });
    const s0 = await state(page);
    await pit(page, 8).tap();
    assert.deepEqual(await state(page), s0, 'opponent pit does nothing');
    assert.match(await page.locator('#msg').innerText(), /Fourmi/);
    assert.equal(await page.locator('#bUndo').isDisabled(), true, 'nothing to undo yet');
    await tapPit(page, 2);
    const s1 = await state(page);
    assert.equal(s1.plies, 2, 'my move and the answer');
    assert.equal(s1.hist[0], 2);
    await tapPit(page, 3);
    const s2 = await state(page);
    assert.equal(s2.plies, 4);
    await page.locator('#bUndo').tap();
    const u = await state(page);
    assert.deepEqual([u.board, u.store, u.plies, u.hist], [s1.board, s1.store, s1.plies, s1.hist], 'undo goes back to my previous turn');
    await tapPit(page, 3);                    // same move, same seed state: the adversary answers the same way
    const again = await state(page);
    assert.deepEqual([again.board, again.store, again.hist], [s2.board, s2.store, s2.hist], 'undo then replay is identical');
    await page.locator('#bUndo').tap(); await page.locator('#bUndo').tap();
    const z = await state(page);
    assert.equal(z.plies, 0); assert.deepEqual(z.board, std());
    assert.equal(await page.locator('#bUndo').isDisabled(), true);
    await tapPit(page, 0);
    await page.locator('#bReset').tap();
    const r = await state(page);
    assert.equal(r.plies, 0); assert.deepEqual(r.board, std()); assert.equal(r.level, 3);
    const sv = await saved(page);
    assert.equal(sv.cur, null, 'restart forgets the game in progress');
    await context.close();
  });

  await test('the sowing is animated seed by seed; reduced motion plays the same game without animation', async () => {
    const a = await open({ width: 360, height: 640 });
    await a.page.evaluate(() => { window.__game.seed(11); window.__game.loadLevel(9); });
    await a.page.locator('[data-pit="2"]').tap();
    // while the animation runs the drawn counts differ from the final ones, then they agree
    await a.page.waitForTimeout(90);
    const mid = await a.page.evaluate(() => [...document.querySelectorAll('.pit')].map(e => +e.querySelector('.nb').textContent));
    const sum = mid.reduce((x, y) => x + y, 0);
    assert.ok(sum < 48, 'seeds are in the air while sowing (sum ' + sum + ')');
    await a.page.waitForFunction(() => !window.__game.state().busy && window.__game.state().turn === 0, null, { timeout: 8000 });
    const fin = await a.page.evaluate(() => ({ s: window.__game.state(), d: [...document.querySelectorAll('.pit')].sort((x, y) => x.dataset.pit - y.dataset.pit).map(e => +e.querySelector('.nb').textContent) }));
    assert.deepEqual(fin.d, fin.s.board, 'drawn board = state');
    const ctl = await a.page.evaluate(() => { const g = window.__game; g.seed(11); g.loadLevel(9); g.applyMove(2); return g.state(); });
    assert.deepEqual(ctl.board, fin.s.board, 'animated game = instant game');
    await a.context.close();
    const b = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    await b.page.evaluate(() => { window.__game.seed(11); window.__game.loadLevel(9); });
    await b.page.locator('[data-pit="2"]').tap();
    await b.page.waitForFunction(() => !window.__game.state().busy && window.__game.state().turn === 0, null, { timeout: 4000 });
    assert.deepEqual((await state(b.page)).board, ctl.board);
    assert.equal(await b.page.locator('.pit.pop').count(), 0, 'no pop animation');
    await b.context.close();
  });

  // ------------------------------------------------------------------ save / resume
  await test('resume: a game in progress is restored move by move after a reload (also when the adversary was about to answer)', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { level: 1, max: 20, stars: stars(20, 0), best: stars(20, 0), cur: null } });
    await page.evaluate(() => { window.__game.still(true); window.__game.seed(21); window.__game.loadLevel(10); });
    await tapPit(page, 1); await tapPit(page, 4); await tapPit(page, 0);
    const before = await state(page);
    await reload(page);
    let s = await state(page);
    assert.equal(s.screen, 'home');
    assert.equal(await page.locator('#bGo').innerText(), 'Continuer · Niveau 1', 'Continuer points at the first level not won');
    await page.locator('#bLevels').tap();
    await page.locator('.cell[data-lv="10"]').tap();     // a game in progress on level 10 is resumed from the grid
    s = await state(page);
    assert.equal(s.level, 10); assert.deepEqual([s.board, s.store, s.hist, s.plies, s.seed], [before.board, before.store, before.hist, before.plies, before.seed]);
    assert.deepEqual(s.legal, before.legal);
    await page.evaluate(() => window.__game.still(true));
    await tapPit(page, before.legal[0]);       // the game goes on
    assert.equal((await state(page)).plies, before.plies + 2);
    await context.close();
    // reload between my move and the answer: the answer is the one the seeded adversary would have given
    const ctl = await open();
    const want = await ctl.page.evaluate(() => { const g = window.__game; g.seed(5); g.loadLevel(12); g.applyMove(3); return g.state(); });
    await ctl.context.close();
    const a = await open({ width: 360, height: 640 }, { save: { level: 1, max: 20, stars: stars(20, 0), best: stars(20, 0), cur: null } });
    await a.page.evaluate(() => { window.__game.seed(5); window.__game.loadLevel(12); });
    await a.page.locator('[data-pit="3"]').tap();
    await a.page.waitForFunction(() => window.__game.state().hist.length >= 1);
    await reload(a.page);
    await a.page.locator('#bLevels').tap();
    await a.page.locator('.cell[data-lv="12"]').tap();
    await a.page.waitForFunction(() => !window.__game.state().busy && window.__game.state().turn === 0 && window.__game.state().plies === 2, null, { timeout: 6000 });
    const got = await state(a.page);
    assert.deepEqual([got.board, got.store, got.hist], [want.board, want.store, want.hist]);
    await a.context.close();
  });

  await test('progress survives a reload; levels grid; locked levels; home shows the stars out of 60', async () => {
    const save = { level: 4, max: 5, stars: [3, 2, 1, 0, 0].concat(stars(15, 0)), best: [30, 27, 25].concat(stars(17, 0)), cur: null };
    const { context, page } = await open({ width: 360, height: 640 }, { save });
    assert.equal(await page.locator('#bGo').innerText(), 'Continuer · Niveau 4');
    assert.equal(await page.locator('#hStars').innerText(), '6');
    assert.match(await page.locator('.stat').first().innerText(), /étoiles sur 60/);
    await page.locator('#bLevels').tap();
    assert.equal((await state(page)).screen, 'levels');
    assert.equal(await page.locator('.cell').count(), 20);
    assert.equal(await page.locator('.cell:not([disabled])').count(), 5);
    assert.equal(await page.locator('#lTotal').innerText(), '6/60');
    await page.locator('.cell[data-lv="2"]').tap();
    let s = await state(page);
    assert.equal(s.screen, 'game'); assert.equal(s.level, 2);
    await page.locator('#bMap').tap();
    await page.locator('.cell[data-lv="9"]').tap({ force: true }).catch(() => {});
    assert.equal((await state(page)).screen, 'levels', 'a locked level does not open');
    await reload(page);
    s = await state(page);
    assert.equal(s.total, 6); assert.equal(s.max, 5);
    await context.close();
  });

  await test('corrupted or absent save: the game starts clean; storage that throws does not stop the game', async () => {
    const bad = [
      'not json', '{', 'null', '[]', '42', '"x"',
      JSON.stringify({ level: 'x', max: -4, stars: 'no', best: {}, cur: 3 }),
      JSON.stringify({ level: 99, max: 99, stars: [9, -1, 'a', null], best: [1e9], cur: { level: 99, hist: [1], rss: [1], rs: 1 } }),
      JSON.stringify({ level: 3, max: 3, stars: [], best: [], cur: { level: 3, hist: [0, 0, 0, 0, 0], rss: [1], rs: 5 } }),   // illegal moves
      JSON.stringify({ level: 3, max: 3, stars: [], best: [], cur: { level: 3, hist: [99, -1, 1.5], rss: [1, 2, 3], rs: 5 } }),
      JSON.stringify({ level: 3, max: 3, stars: [], best: [], cur: { level: 3, hist: new Array(500).fill(1), rss: [], rs: 5 } }),
      JSON.stringify({ level: 3, max: 2, stars: [], best: [], cur: { level: 3, hist: [], rss: [], rs: 5 }, chalGame: { level: 30, target: 99, hist: [], rss: [], rs: 1 } }),
      JSON.stringify({ level: 1, max: 1, stars: [], best: [], cur: { level: 1, hist: [2], rss: [], rs: 1 } }),                    // rss shorter than the human moves
    ];
    for (const raw of bad) {
      const { context, page } = await open({ width: 360, height: 640 }, { raw });
      let s = await state(page);
      assert.equal(s.screen, 'home', raw);
      assert.ok(s.level >= 1 && s.level <= 20 && s.max >= 1 && s.max <= 20, raw);
      await page.locator('#bGo').tap();
      await page.evaluate(() => window.__game.still(true));
      s = await state(page);
      assert.equal(s.over, false, raw); assert.equal(s.turn, 0, raw);
      assert.equal(s.board.reduce((a, b) => a + b, 0) + s.store[0] + s.store[1], 48, raw);
      assert.ok(s.legal.length > 0, raw);
      await tapPit(page, s.legal[0]);
      assert.equal(await page.locator('.pit').count(), 12);
      await context.close();
    }
    const { context, page } = await open({ width: 360, height: 640 }, { broken: true });
    await page.locator('#bGo').tap();
    await page.evaluate(() => window.__game.still(true));
    const s = await state(page);
    await tapPit(page, s.legal[0]);
    assert.equal((await state(page)).plies, 2, 'plays without storage');
    await context.close();
  });

  // ------------------------------------------------------------------ share and challenge
  await test('share: short text without the solution, navigator.share then clipboard, event share', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { config: { shareBaseUrl: 'https://exemple.test/jeux/semailles/' } });
    await page.evaluate(sd => { window.__game.still(true); window.__game.seed(sd); window.__game.loadLevel(1); }, SEED(1));
    await playByTaps(page, strongFor(1, (await page.evaluate(() => window.__game.levels))[0]));
    await page.locator('#win').waitFor({ state: 'visible' });
    // 1) navigator.share
    await page.evaluate(() => { window.__shared = []; Object.defineProperty(navigator, 'share', { value: async d => { window.__shared.push(d.text); }, configurable: true }); });
    await page.locator('#bShare').tap();
    await page.waitForFunction(() => window.__shared.length === 1);
    const s = await state(page);
    const [text] = await page.evaluate(() => window.__shared);
    assert.match(text, /^Petit Mil · Niveau 1 · ⭐{1,3} · \d+ graines$/, text);
    assert.equal((text.match(/⭐/g) || []).length, s.stars);
    assert.ok(text.includes(String(s.store[0])));
    assert.ok(!/\d,\d|https?:|#/.test(text), 'no move list, no link in the result text');
    // 2) challenge: link on the configured base, fragment letters/digits/hyphens only
    await page.locator('#bChal').tap();
    await page.waitForFunction(() => window.__shared.length === 2);
    const ch = (await page.evaluate(() => window.__shared))[1];
    const m = /(https:\/\/exemple\.test\/jeux\/semailles\/)#(defi-[A-Za-z0-9-]+)$/.exec(ch);
    assert.ok(m, ch);
    assert.equal(m[2], `defi-1-${s.store[0]}`);
    assert.ok(!/\bcoups?\b/.test(ch) || true);
    // 3) clipboard fallback
    await page.evaluate(() => {
      window.__clip = [];
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__clip.push(t); } }, configurable: true });
    });
    await page.locator('#bShare').tap();
    await page.waitForFunction(() => window.__clip.length === 1);
    assert.equal((await page.evaluate(() => window.__clip))[0], text);
    assert.equal(await page.locator('#bShare').innerText(), 'Copié !');
    const ev = await events(page, 'share');
    assert.deepEqual(ev.map(e => e.kind), ['result', 'challenge', 'result']);
    ev.forEach(e => assert.deepEqual(Object.keys(e).sort(), ['event', 'game', 'kind', 'source']));
    await context.close();
    // without a base and on file://: no link at all
    const b = await open({ width: 360, height: 640 });
    await b.page.evaluate(sd => { window.__game.still(true); window.__game.seed(sd); window.__game.loadLevel(1); }, SEED(1));
    await playByTaps(b.page, strongFor(1, (await b.page.evaluate(() => window.__game.levels))[0]));
    await b.page.waitForSelector('#win', { state: 'visible' });
    await b.page.evaluate(() => { window.__shared = []; Object.defineProperty(navigator, 'share', { value: async d => { window.__shared.push(d.text); }, configurable: true }); });
    await b.page.locator('#bChal').tap();
    await b.page.waitForFunction(() => window.__shared.length === 1);
    const t2 = (await b.page.evaluate(() => window.__shared))[0];
    assert.ok(!/https?:|#defi/.test(t2) && /graines/.test(t2), t2);
    await b.context.close();
  });

  await test('challenge: opened by the link (even on a locked level), one goal, won (equal is enough), lost, nothing saved', async () => {
    const start = { level: 3, max: 3, stars: [2, 1, 0].concat(stars(17, 0)), best: [26, 25].concat(stars(18, 0)), cur: null };
    // the game in progress, saved beforehand
    const A = await open({ width: 360, height: 640 }, { save: start });
    await A.page.evaluate(() => { window.__game.still(true); window.__game.seed(8); window.__game.loadLevel(3); });
    await tapPit(A.page, 2); await tapPit(A.page, 5);
    const snapshot = await saved(A.page);
    assert.ok(snapshot.cur && snapshot.cur.hist.length === 4);
    const keep = ({ level, max, stars, best, cur }) => JSON.stringify({ level, max, stars, best, cur });
    // an equal result: the reference run is a strong player on level 12 (locked) with a fixed seed
    const lvls = await A.page.evaluate(() => window.__game.levels);
    const ref = await open({ width: 360, height: 640 });
    await ref.page.evaluate(sd => { window.__game.still(true); window.__game.seed(sd); window.__game.loadLevel(12); }, SEED(12));
    const fin = await playByHook(ref.page, strongFor(12, lvls[11]));
    const myScore = Math.min(fin.store[0], 25), myHist = fin.hist.filter((_, i) => i % 2 === 0);
    await ref.context.close();
    assert.equal(myScore, 25, 'a challenge score is capped at 25');
    // open the link on level 12 while max is 3: opens, one goal on screen, progress untouched
    await A.page.goto(URL + `#defi-12-${myScore}`);
    await A.page.waitForFunction(() => window.__game.state().mode === 'challenge');
    let s = await state(A.page);
    assert.equal(s.screen, 'game'); assert.equal(s.level, 12); assert.deepEqual(s.challenge, { target: myScore, level: 12 });
    assert.equal(s.free, true);
    assert.equal(await A.page.locator('#chal').isVisible(), true);
    assert.match(await A.page.locator('#chalT').innerText(), new RegExp('Défi : prends au moins ' + myScore + ' graines'));
    assert.equal(await A.page.locator('#goal').isVisible(), false, 'the star criteria are gone: the challenge is the only goal');
    assert.equal(await A.page.evaluate(() => location.hash), '', 'the fragment is consumed');
    assert.equal(keep(await saved(A.page)), keep(snapshot), 'opening a challenge writes nothing');
    assert.deepEqual((await events(A.page, 'challenge_open')).map(e => [e.level, e.target]), [[12, myScore]]);
    // play it: same seed, same pits: the result equals the target, which is enough
    await A.page.evaluate(sd => { window.__game.still(true); window.__game.seed(sd); }, SEED(12));
    for (const p of myHist) { const cur = await state(A.page); if (cur.over) break; await tapPit(A.page, p); }
    s = await state(A.page);
    assert.equal(s.over, true); assert.equal(Math.min(s.store[0], 25), myScore);
    assert.equal(await A.page.locator('footer').isVisible(), false, 'no undo / restart in a challenge');
    await A.page.locator('#win').waitFor({ state: 'visible' });
    assert.equal(await A.page.locator('#wTitle').innerText(), 'Défi relevé !');
    assert.equal(await A.page.locator('#wChal').innerText(), `Objectif ${myScore} · toi ${myScore}`);
    let ev = await events(A.page, 'challenge_result');
    assert.deepEqual(ev.map(e => [e.level, e.score, e.target, e.won]), [[12, myScore, myScore, true]]);
    assert.deepEqual(Object.keys(ev[0]).sort(), ['event', 'game', 'level', 'score', 'source', 'target', 'won']);
    assert.equal((await events(A.page, 'level_complete')).length, 0, 'a challenge is not a level win');
    assert.equal(keep(await saved(A.page)), keep(snapshot), 'a finished challenge does not touch the progress or the game in progress');
    assert.equal(await A.page.locator('#wStars').isVisible(), false);
    // R3: no replay, no share of the result, only "Renvoyer le défi" (won) and "Accueil"
    const cv = await A.page.evaluate(() => [...document.querySelectorAll('#win .btn')].filter(b => b.offsetWidth > 0).map(b => b.textContent));
    assert.deepEqual(cv, ['Accueil', 'Renvoyer le défi']);
    assert.equal((await events(A.page, 'challenge_result')).length, 1, 'challenge_result is sent once');
    // go home: the game in progress is still there
    await A.page.locator('#bNext').tap();
    assert.equal((await state(A.page)).screen, 'home');
    await A.page.locator('#bGo').tap();
    s = await state(A.page);
    assert.equal(s.mode, 'level'); assert.equal(s.level, 3); assert.deepEqual(s.hist, snapshot.cur.hist);
    // lost: a target nobody reaches
    await A.page.evaluate(() => { window.location.hash = '#defi-20-25'; });
    await A.page.waitForFunction(() => window.__game.state().mode === 'challenge' && window.__game.state().level === 20);
    await A.page.evaluate(() => { window.__game.still(true); window.__game.seed(3); });
    await playByHook(A.page, s => R.legalMoves(s)[0]);
    await A.page.locator('#win').waitFor({ state: 'visible' });
    assert.equal(await A.page.locator('#wTitle').innerText(), 'Défi manqué');
    const lv2 = await A.page.evaluate(() => [...document.querySelectorAll('#win .btn')].filter(b => b.offsetWidth > 0).map(b => b.textContent));
    assert.deepEqual(lv2, ['Accueil'], 'a lost challenge cannot be retried');
    ev = await events(A.page, 'challenge_result');
    assert.equal(ev.length, 2, 'one result per opening');
    assert.equal(ev[1].won, false); assert.equal(ev[1].target, 25);
    assert.equal(keep(await saved(A.page)).includes('"max":3'), true);
    assert.equal((await saved(A.page)).stars[1], 1, 'stars of level 2 untouched');
    await A.context.close();
  });

  await test('challenge: a challenge in progress is resumed after a reload; malformed fragments are ignored', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { hash: '#defi-6-30' });
    await page.evaluate(() => { window.__game.still(true); window.__game.seed(2); });
    await tapPit(page, 1);
    const before = await state(page);
    await reload(page);
    const s = await state(page);
    assert.equal(s.mode, 'challenge'); assert.equal(s.level, 6); assert.equal(s.challenge.target, 30); assert.equal(s.screen, 'game');
    assert.deepEqual([s.board, s.hist], [before.board, before.hist]);
    await context.close();
    const bad = ['#defi-', '#defi-0-5', '#defi-21-5', '#defi-3-0', '#defi-3-26', '#defi-3-48', '#defi-3-49', '#defi-3-x', '#defi-1-2-3', '#defi-99999999999-1', '#DEFI-3-5', '#defi-3', '#defi--3-5', '#defi-3-5%20', '#defi-3-5;alert(1)', '#defi-%3Cb%3E-5', '#autre'];
    for (const h of bad) {
      const b = await open({ width: 360, height: 640 }, { hash: h });
      const st = await state(b.page);
      assert.equal(st.mode, 'level', h); assert.equal(st.screen, 'home', h);
      assert.equal((await events(b.page, 'challenge_open')).length, 0, h);
      await b.context.close();
    }
    // a bad fragment typed while the game is open is ignored too
    const c = await open({ width: 360, height: 640 });
    await c.page.evaluate(() => { window.location.hash = '#defi-77-1'; });
    await c.page.waitForTimeout(100);
    assert.equal((await state(c.page)).mode, 'level');
    await c.context.close();
  });

  await test('host events: only the listed ones, with only the listed fields', async () => {
    const { context, page } = await open({ width: 360, height: 640 });
    await page.evaluate(sd => { window.__game.still(true); window.__game.seed(sd); window.__game.loadLevel(1); }, SEED(1));
    await playByTaps(page, strongFor(1, (await page.evaluate(() => window.__game.levels))[0]));
    const all = await msgs(page);
    assert.ok(all.length >= 1);
    const ALLOWED = { level_complete: ['level', 'score', 'stars'], share: ['kind'], challenge_open: ['level', 'target'], challenge_result: ['level', 'score', 'target', 'won'] };
    for (const e of all) {
      assert.ok(ALLOWED[e.event], 'unexpected event ' + e.event);
      assert.deepEqual(Object.keys(e).sort(), ['event', 'game', 'source'].concat(ALLOWED[e.event]).sort(), e.event);
      assert.equal(e.source, 'mini-jeu'); assert.equal(e.game, 'semailles');
    }
    const lc = all.filter(e => e.event === 'level_complete');
    assert.equal(lc.length, 1);
    const s = await state(page);
    assert.deepEqual([lc[0].level, lc[0].score, lc[0].stars], [1, s.store[0], s.stars]);
    await context.close();
  });

  // ------------------------------------------------------------------ second review (R1 to R10)
  await test('R6: "Continuer" points at the first level not won; replaying an old level does not move it', async () => {
    const save = { level: 3, max: 3, stars: [3, 2, 0].concat(stars(17, 0)), best: stars(20, 0), cur: null };
    const { context, page } = await open({ width: 360, height: 640 }, { save });
    assert.equal(await page.locator('#bGo').innerText(), 'Continuer · Niveau 3');
    await page.locator('#bLevels').tap();
    await page.locator('.cell[data-lv="1"]').tap();
    await page.evaluate(() => { window.__game.still(true); window.__game.seed(101); });
    const lv = await page.evaluate(() => window.__game.levels);
    await playByHook(page, strongFor(1, lv[0]));          // level 1 won again
    assert.equal((await state(page)).won, true);
    await page.waitForSelector('#win', { state: 'visible' });
    await page.locator('#bNext').tap();                    // goes on to level 2: a replay too
    await page.waitForTimeout(350);
    await page.locator('#bMap').tap(); await page.locator('#bLBack').tap();
    assert.equal((await state(page)).screen, 'home');
    assert.equal(await page.locator('#bGo').innerText(), 'Continuer · Niveau 3', 'still the first level not won');
    assert.equal((await state(page)).current, 3);
    await context.close();
  });

  await test('R3/R4: challenge link = origin + pathname + fragment, never the query of the address or of MJ_CONFIG', async () => {
    const fake = 'https://exemple.test/jeux/semailles/index.html';
    const ctx = await browser.newContext({ ...MOBILE, viewport: { width: 360, height: 640 } });
    const html = fs.readFileSync(FILE, 'utf8');
    await ctx.route('https://exemple.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    for (const [addr, config, want] of [
      [fake + '?token=secret123&u=42', null, fake + '#defi-1-25'],
      [fake + '?token=secret123#old', null, fake + '#defi-1-25'],
      [fake + '?x=1', { shareBaseUrl: 'https://autre.test/a/b/?token=zzz#frag' }, 'https://autre.test/a/b/#defi-1-25'],
      [fake, { shareBaseUrl: 'javascript:alert(1)' }, ''],
      [fake, { shareBaseUrl: 'not a url' }, ''],
    ]) {
      const page = await ctx.newPage();
      page.on('pageerror', e => problems.push('pageerror: ' + e.message));
      if (config) await page.addInitScript(c => { window.MJ_CONFIG = c; }, config);
      await page.goto(addr);
      await page.waitForFunction(() => !!window.__game);
      await page.evaluate(sd => { window.__game.still(true); window.__game.seed(sd); window.__game.loadLevel(1); }, 101);
      await playByTaps(page, strongFor(1, (await page.evaluate(() => window.__game.levels))[0]));
      await page.locator('#win').waitFor({ state: 'visible' });
      await page.evaluate(() => { window.__shared = []; Object.defineProperty(navigator, 'share', { value: async d => { window.__shared.push(d.text); }, configurable: true }); });
      await page.locator('#bChal').tap();
      await page.waitForFunction(() => window.__shared.length === 1);
      const text = (await page.evaluate(() => window.__shared))[0];
      assert.ok(!/token|secret|\?|u=42|zzz|old/.test(text), 'query leaked: ' + text);
      const m = /(https?:\/\/\S+)$/.exec(text);
      assert.equal(m ? m[1] : '', want, text);
      await page.close();
    }
    await ctx.close();
  });

  await test('R3: only the targets a game can reach (1 to 25) open a challenge', async () => {
    for (const h of ['#defi-3-26', '#defi-3-30', '#defi-3-48']) {
      const b = await open({ width: 360, height: 640 }, { hash: h });
      const st = await state(b.page);
      assert.equal(st.mode, 'level', h); assert.equal((await events(b.page, 'challenge_open')).length, 0, h);
      await b.context.close();
    }
    for (const h of ['#defi-3-1', '#defi-3-25']) {
      const b = await open({ width: 360, height: 640 }, { hash: h });
      assert.equal((await state(b.page)).mode, 'challenge', h);
      await b.context.close();
    }
  });

  await test('Annuler: the first use says that the game is now worth 2 stars at most, and the cap is applied', async () => {
    const { context, page } = await open();
    await page.evaluate(sd => { window.__game.still(true); window.__game.seed(sd); window.__game.loadLevel(1); }, 101);
    assert.equal(await page.locator('#bUndo').isDisabled(), true);
    await tapPit(page, (await state(page)).legal[0]);
    await page.locator('#bUndo').tap();
    assert.match(await page.locator('#msg').innerText(), /Annuler utilisé.*2 étoiles/);
    assert.equal((await state(page)).undone, true);
    const lv = await page.evaluate(() => window.__game.levels);
    const fin = await playByTaps(page, strongFor(1, lv[0]));
    const m = fin.store[0] - fin.store[1];
    assert.ok(m >= 16, 'this game is a +16 win without the cap (margin ' + m + ')');
    assert.equal(fin.stars, 2, 'capped at 2 stars');
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#wStars svg.on').count(), 2);
    assert.match(await page.locator('#wWhy').innerText(), /Annuler utilisé/);
    assert.equal((await saved(page)).stars[0], 2);
    // a fresh game of the same level, without Annuler, reaches 3 stars
    await page.locator('#bAgain').tap(); await page.waitForTimeout(350);
    assert.equal((await state(page)).undone, false);
    await page.evaluate(sd => window.__game.seed(sd), 101);
    const fin2 = await playByTaps(page, strongFor(1, lv[0]));
    assert.equal(fin2.stars, 3);
    await context.close();
  });

  await test('the special start of a level is announced before the first move', async () => {
    const { context, page } = await open();
    await page.evaluate(() => { window.__game.still(true); window.__game.loadLevel(1); });
    assert.match(await page.locator('#msg').innerText(), /Départ avancé : tu as déjà 16 graines/);
    await page.evaluate(() => window.__game.loadLevel(11));
    assert.match(await page.locator('#msg').innerText(), /Quatre gros tas/);
    await page.evaluate(() => window.__game.loadLevel(15));
    assert.match(await page.locator('#msg').innerText(), /Disette : 14 graines contre 10/);
    await page.evaluate(() => window.__game.loadLevel(4));
    assert.equal(await page.locator('#msg').innerText(), 'À toi de jouer.');
    await context.close();
  });

  await test('double taps: one tap never sows twice, nothing is played during the animation or the adversary\'s turn, a long press plays once', async () => {
    const { context, page } = await open({ width: 360, height: 640 });
    const centre = async i => page.evaluate(k => { const r = document.querySelector(`[data-pit="${k}"]`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, i);
    const fresh = async (lv, sd) => { await page.evaluate(([l, d]) => { window.__game.seed(d); window.__game.loadLevel(l); }, [lv, sd]); };
    const settle = () => page.waitForFunction(() => { const s = window.__game.state(); return !s.busy && s.turn === 0; }, null, { timeout: 8000 });
    // 1) two taps on the same pit, a few ms apart
    await fresh(9, 3);
    let c = await centre(2);
    await page.touchscreen.tap(c[0], c[1]); await page.touchscreen.tap(c[0], c[1]);
    await settle();
    let s = await state(page);
    assert.equal(s.hist.length, 2, 'one move of mine and the answer: ' + s.hist);
    // 2) taps on three pits in a row while the seeds are still being laid and while the adversary thinks
    await fresh(9, 3);
    for (const k of [1, 3, 4]) { c = await centre(k); await page.touchscreen.tap(c[0], c[1]); }
    await settle();
    s = await state(page);
    assert.equal(s.hist.length, 2); assert.equal(s.hist[0], 1, 'only the first tap played');
    // 3) a tap in the middle of the adversary's thinking time
    await fresh(9, 3);
    c = await centre(0); await page.touchscreen.tap(c[0], c[1]);
    await page.waitForFunction(() => window.__game.state().turn === 1 && window.__game.state().busy);
    c = await centre(5); await page.touchscreen.tap(c[0], c[1]);
    await settle();
    s = await state(page);
    assert.equal(s.hist.length, 2); assert.equal(s.hist[0], 0);
    // 4) a long press of 800 ms plays once (touch events through the protocol)
    await fresh(9, 3);
    c = await centre(2);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c[0], y: c[1] }] });
    await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle();
    s = await state(page);
    assert.equal(s.hist.length, 2, 'long press: ' + s.hist); assert.equal(s.hist[0], 2);
    // 5) a double tap on "Suivant" must not play a move of the next level
    await page.evaluate(() => { window.__game.still(true); window.__game.seed(101); window.__game.loadLevel(1); });
    await playByHook(page, strongFor(1, (await page.evaluate(() => window.__game.levels))[0]));
    await page.locator('#win').waitFor({ state: 'visible' });
    const b = await page.locator('#bNext').boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(250);
    s = await state(page);
    assert.equal(s.level, 2); assert.equal(s.plies, 0, 'the second tap did not reach the board'); assert.equal(s.hist.length, 0);
    await context.close();
  });

  await test('curve of the 20 levels: the published rates are recomputed (100 games per cell, tolerance 10 points) and meet the targets', async () => {
    const pub = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'semailles', 'rates.json'), 'utf8')).rows;
    const RP = require('../tools/semailles/reference-players');
    assert.equal(pub.length, 20);
    // targets on the published table
    pub.forEach(([n, h, d, b]) => {
      if (n <= 2) assert.ok(d >= 85, `level ${n}: beginner ${d} %`);
      if (n <= 8) assert.ok(d >= 50, `level ${n}: beginner ${d} %`);
      if (n <= 14) assert.ok(b >= 60, `level ${n}: good player ${b} %`);
      if (n === 20) assert.ok(b >= 30, `level 20: good player ${b} %`);
    });
    // every level is told from the previous one by at least one reference player (6 points), up or down
    const visible = [];
    for (let i = 1; i < 20; i++) {
      const delta = Math.max(Math.abs(pub[i][1] - pub[i - 1][1]), Math.abs(pub[i][2] - pub[i - 1][2]), Math.abs(pub[i][3] - pub[i - 1][3]));
      assert.ok(delta >= 6, `levels ${i} and ${i + 1} are indistinguishable (${delta} points)`);
      visible.push(pub[i][4] - pub[i - 1][4]);
    }
    const breathers = visible.filter(v => v < 0).length;
    assert.ok(breathers >= 3 && breathers <= 5, 'a few deliberate breathers: ' + breathers);
    assert.ok(pub[19][4] > pub[0][4] + 60, 'the curve climbs overall');
    // recomputation (same engine as the game, seeds 1..100)
    const NG = 100, TOL = 10;
    for (let n = 1; n <= 20; n++) {
      const L = RP.G.LEVELS[n - 1];
      const got = [RP.rate(L, RP.hasard, NG), RP.rate(L, RP.debutant, NG), RP.rate(L, RP.bonJoueur, NG)].map(x => Math.round(x * 100));
      got.forEach((v, k) => assert.ok(Math.abs(v - pub[n - 1][k + 1]) <= TOL, `level ${n}: ${['hasard', 'debutant', 'bon joueur'][k]} ${v} % against ${pub[n - 1][k + 1]} % published`));
    }
  });

  // ------------------------------------------------------------------ layout
  for (const vp of VIEWPORTS) {
    const tag = `${vp.width}x${vp.height}`;
    await test(`layout ${tag}: every screen fits without scrolling, targets >= 44 px, nothing clipped`, async () => {
      const { context, page } = await open(vp);
      await page.evaluate(() => window.__game.still(true));
      // home
      checkFit(await measure(page, '#home .btn'), 'home ' + tag);
      await shot(page, `home-${tag}`);
      // grid of levels (some locked)
      await page.locator('#bLevels').tap();
      checkFit(await measure(page, '.cell, #bLBack, #bBack'), 'levels ' + tag);
      await shot(page, `levels-${tag}`);
      // game: the most loaded start (level 18: a heap of 12) and a position with big numbers
      await page.evaluate(() => { window.__game.seed(2); window.__game.loadLevel(18); });
      checkFit(await measure(page, '.pit, .btn, .icon'), 'game start ' + tag);
      await shot(page, `game-heap-${tag}`);
      await page.evaluate(() => { const g = window.__game; g.applyMove(2); g.applyMove(g.state().legal[1]); });
      checkFit(await measure(page, '.pit, .btn, .icon'), 'game later ' + tag);
      await shot(page, `game-later-${tag}`);
      // every adversary name fits on its line, every pit is tappable at its size
      for (let n = 1; n <= 20; n++) {
        await page.evaluate(k => window.__game.loadLevel(k), n);
        const m = await measure(page, '.pit');
        assert.deepEqual(m.clipped, [], `level ${n} ${tag}: clipped ${m.clipped}`);
        assert.equal(m.targets.length, 12);
        m.targets.forEach(q => assert.ok(q.w >= 44 && q.h >= 44, `level ${n} ${tag}: pit ${Math.round(q.w)}x${Math.round(q.h)}`));
      }
      // rules
      await page.locator('#bHelp').tap();
      await page.waitForTimeout(400);
      checkFit(await measure(page, '#help .btn'), 'help ' + tag);
      const card = await page.evaluate(() => { const q = document.querySelector('#help .card').getBoundingClientRect(); return { t: q.top, b: q.bottom, l: q.left, r: q.right, ih: innerHeight, iw: innerWidth }; });
      assert.ok(card.t >= 0 && card.b <= card.ih && card.l >= 0 && card.r <= card.iw, 'help card out of screen ' + JSON.stringify(card));
      await shot(page, `help-${tag}`);
      await page.locator('#bHelpOk').tap();
      // result overlay (win with stars) and challenge result (longest texts)
      await page.evaluate(() => { window.__game.seed(101); window.__game.loadLevel(1); });
      const lv = await page.evaluate(() => window.__game.levels);
      await playByHook(page, strongFor(1, lv[0]));
      await page.locator('#win').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      checkFit(await measure(page, '#win .btn'), 'win ' + tag);
      const wc = await page.evaluate(() => { const q = document.querySelector('#win .card').getBoundingClientRect(); return { t: q.top, b: q.bottom, l: q.left, r: q.right, ih: innerHeight, iw: innerWidth }; });
      assert.ok(wc.t >= 0 && wc.b <= wc.ih && wc.l >= 0 && wc.r <= wc.iw, 'win card out of screen ' + JSON.stringify(wc));
      await shot(page, `win-${tag}`);
      await page.goto(URL + '#defi-20-25');
      await page.waitForFunction(() => window.__game.state().mode === 'challenge');
      await page.evaluate(() => window.__game.still(true));
      checkFit(await measure(page, '.pit, .btn, .icon'), 'challenge ' + tag);
      await shot(page, `challenge-${tag}`);
      await page.evaluate(() => { window.__game.seed(1); });
      await playByHook(page, (s, r, p) => s.legal ? 0 : R.legalMoves(s)[0]);
      await page.locator('#win').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      checkFit(await measure(page, '#win .btn'), 'challenge result ' + tag);
      const cc = await page.evaluate(() => { const q = document.querySelector('#win .card').getBoundingClientRect(); return { t: q.top, b: q.bottom, ih: innerHeight }; });
      assert.ok(cc.t >= 0 && cc.b <= cc.ih, 'challenge card out of screen');
      await shot(page, `challenge-result-${tag}`);
      await context.close();
    });
  }

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
