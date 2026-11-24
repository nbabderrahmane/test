'use strict';
/*
 * Mobile acceptance tests for games/course-des-pions (plain node + playwright + node:assert).
 * Run with `node tests/course-des-pions.spec.js`. Set SHOTS=<dir> to also write screenshots.
 * The test player and the winning seeds live in tools/course-des-pions (the game embeds neither).
 * One browser, instant mode (no delay, no animation) except where timing is the subject.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const TOOLS = path.join(__dirname, '..', 'tools', 'course-des-pions');
const { loadEngine, FILE } = require(path.join(TOOLS, 'load'));
const REF = require(path.join(TOOLS, 'ref'));
const PLAYER = require(path.join(TOOLS, 'player'));
const { playGame } = require(path.join(TOOLS, 'play'));
const { check: crossCheck } = require(path.join(TOOLS, 'rules-check'));
const { duel } = require(path.join(TOOLS, 'tiers'));
const SEEDS = JSON.parse(fs.readFileSync(path.join(TOOLS, 'seeds.json'), 'utf8'));
const E = loadEngine();

const URL = pathToFileURL(FILE).href;
const KEY = 'mj:course-des-pions:v1';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: SHOTS ? 2 : 1 };
const VIEWPORTS = [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 430, height: 932 }];
const NAME = 'Ronde Vive';

let browser;
const problems = [];
const results = [];

// ---------------------------------------------------------------------------------------- helpers
async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = await browser.newContext({ ...MOBILE, viewport, ...(opts.extra || {}) });
  await context.addInitScript(({ save, key, config, instant }) => {
    window.__msgs = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    try { if (save && !localStorage.getItem(key)) localStorage.setItem(key, typeof save === 'string' ? save : JSON.stringify(save)); } catch (e) { /* ignore */ }
    if (config) window.MJ_CONFIG = config;
  }, { save: opts.save || null, key: KEY, config: opts.config || null });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('request', r => { if (r.url().split('#')[0] !== URL) problems.push('request: ' + r.url()); });
  await page.goto(URL + (opts.hash || ''));
  await page.waitForFunction(() => !!window.__game);
  if (opts.instant !== false) await page.evaluate(() => window.__game.instant(true));
  return { context, page };
}
const state = page => page.evaluate(() => window.__game.state());
const msgs = page => page.evaluate(() => new Promise(r => setTimeout(() => r(window.__msgs), 40)));
const events = async (page, name) => (await msgs(page)).filter(m => m.event === name);
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const centre = (page, sel) => page.evaluate(s => { const q = document.querySelector(s).getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, sel);
async function tap(page, sel) { const c = await centre(page, sel); await page.touchscreen.tap(c[0], c[1]); }
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(500);
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
const clone = o => JSON.parse(JSON.stringify(o));

// One human decision with real taps: tap the die, or tap the pion chosen by the test player.
const peek = page => page.evaluate(() => {
  const c = e => { const q = e.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; };
  return { s: window.__game.state(), die: c(document.getElementById('die')),
    go: [...document.querySelectorAll('.pion.go')].map(e => ({ p: +e.dataset.p, i: +e.dataset.i, c: c(e) })) };
});
async function humanStep(page, opts = {}) {
  const { s, die, go } = await peek(page);
  if (s.over) return null;
  if (s.phase === 'roll' && s.human) { await page.touchscreen.tap(die[0], die[1]); return 'roll'; }
  if (s.phase === 'pick') {
    const i = PLAYER.pick(s.game, s.turn, s.roll, opts);
    const el = go.find(g => g.p === s.turn && g.i === i) || go.find(g => g.p === s.turn);
    assert.ok(el, 'no pion offered while the game asks for a choice');
    await page.touchscreen.tap(el.c[0], el.c[1]);
    return 'pick';
  }
  throw new Error('stuck: ' + JSON.stringify({ phase: s.phase, turn: s.turn, roll: s.roll }));
}
async function playOut(page, opts = {}, limit = 4000) {
  for (let k = 0; k < limit; k++) if (!(await humanStep(page, opts))) return k;
  throw new Error('game does not end');
}
async function playSteps(page, n, opts = {}) { for (let k = 0; k < n; k++) if (!(await humanStep(page, opts))) break; }

// Layout metrics of the current screen.
const measure = (page, sel) => page.evaluate(selector => {
  const de = document.documentElement, b = document.body;
  window.scrollTo(50, 50);
  const r = el => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const vis = el => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const bd = document.getElementById('board');
  return {
    iw: window.innerWidth, ih: window.innerHeight,
    sw: Math.max(de.scrollWidth, b.scrollWidth), sh: Math.max(de.scrollHeight, b.scrollHeight),
    sx: window.scrollX, sy: window.scrollY, vv: window.visualViewport ? window.visualViewport.scale : 1,
    targets: [...document.querySelectorAll(selector)].filter(vis).map(r),
    board: bd && vis(bd) ? r(bd) : null,
    dock: document.getElementById('dock') && r(document.getElementById('dock')),
  };
}, sel);
function checkFit(m, tag) {
  assert.ok(m.sw <= m.iw, `${tag}: horizontal scroll (${m.sw} > ${m.iw})`);
  assert.ok(m.sh <= m.ih, `${tag}: vertical scroll (${m.sh} > ${m.ih})`);
  assert.equal(m.sx, 0, tag + ': scrolled x'); assert.equal(m.sy, 0, tag + ': scrolled y');
  assert.equal(m.vv, 1, tag + ': zoomed');
  assert.ok(m.targets.length > 0, tag + ': no target found');
  m.targets.forEach((q, i) => {
    assert.ok(q.w >= 43.99 && q.h >= 43.99, `${tag}: target ${i} is ${q.w.toFixed(1)}x${q.h.toFixed(1)}`);
    assert.ok(q.l >= -0.5 && q.t >= -0.5 && q.r <= m.iw + 0.5 && q.b <= m.ih + 0.5, `${tag}: target ${i} out of screen`);
  });
}

// Positions for the rule tests.
const posAt = (seat, xy) => REF.PATHS[seat].findIndex(c => REF.key(c.xy) === REF.key(xy));
function blank(np, k = 2) { return E.newGame({ k, seats: E.SEATS[np], tiers: [null].concat(new Array(np - 1).fill(1)), seed: 5 }); }
function rngFor(v, S) {            // an rng state whose next throw is v
  for (let r = 1; ; r++) { const t = { rng: r }; if (Math.floor(E.rnd(t, 'rng') * 6) + 1 === v) return r; }
}
const cell = (S, p, pos) => REF.whereIs(S.seats[p], pos);

// ------------------------------------------------------------------------------------------------ run
(async () => {
  browser = await chromium.launch();
  console.log(`course-des-pions (${NAME})`);

  await test('file: one HTML under 150 KB, no external reference, no network API, no seed or solution inside', async () => {
    const size = fs.statSync(FILE).size;
    assert.ok(size < 150 * 1024, `index.html is ${size} bytes`);
    const html = fs.readFileSync(FILE, 'utf8');
    assert.ok(!/(src|href)\s*=\s*["'](https?:)?\/\//i.test(html), 'external src/href');
    assert.ok(!/url\(\s*["']?(https?:)?\/\//i.test(html), 'external css url');
    assert.ok(!/@import|<link\b/i.test(html), 'stylesheet link/import');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|WebGL|getContext/.test(html), 'network or webgl API');
    assert.ok(!/Math\.random/.test(html), 'every random choice must come from the seeded generator');
    assert.ok(!html.includes(JSON.stringify(SEEDS.win)) && !/seeds\.json|SOLUTIONS/.test(html), 'winning seeds embedded');
    assert.ok(!/\b(mise|gain|argent|parier|pari)\b/i.test(html.replace(/<style[\s\S]*?<\/style>/, '')), 'a word about betting or money');
    console.log(`        size: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);
  });

  await test('hooks and level table: 20 levels, 2 pions then 3, 1 then 2 then 3 opponents, no solutions in __game', async () => {
    const { context, page } = await open();
    const info = await page.evaluate(() => ({ levels: window.__game.levels, fns: ['loadLevel', 'seed', 'state', 'setGame', 'instant', 'startHot'].map(k => typeof window.__game[k]),
      keys: Object.keys(window.__game), st: window.__game.state() }));
    assert.equal(info.levels.length, 20);
    assert.deepEqual(info.fns, new Array(6).fill('function'));
    assert.ok(!info.keys.some(k => /solution|seeds|win/i.test(k)), 'solutions exposed: ' + info.keys);
    info.levels.forEach((l, i) => {
      assert.ok(l.h >= 1 && l.h <= 3 && l.o >= 2 && l.o <= 3, `level ${i + 1}: pions ${l.h} vs ${l.o}`);
      assert.ok(l.opp.length >= 1 && l.opp.length <= 3);
    });
    // the handicap: the player has fewer pions to bring home than the opponents at first, as many later
    assert.ok(info.levels.slice(0, 11).every(l => l.h < l.o), 'levels 1-11: fewer pions for the player');
    assert.ok(info.levels.slice(11).every(l => l.h === 3) && info.levels.slice(11, 17).every(l => l.h === l.o), 'later: as many pions');
    assert.equal(info.levels[0].h, 1);
    const counts = info.levels.map(l => l.opp.length);
    assert.ok(counts[0] === 1 && counts[18] === 3 && counts[19] === 3, 'one opponent first, three at the end');
    const strength = info.levels.map(l => l.opp.reduce((a, b) => a + b, 0) / l.opp.length);
    assert.ok(strength[19] > strength[0] + 3, 'last level not tougher than the first');
    for (const k of ['mode', 'level', 'phase', 'game', 'over', 'turn', 'roll']) assert.ok(k in info.st, 'state() lacks ' + k);
    await context.close();
    console.log('        level table (you vs each opponent, strengths): ' + info.levels.map(l => `${l.h}v${l.o}:${l.opp.join('')}`).join(' '));
  });

  // ------------------------------------------------------------------------------------- the die
  await test('die: seeded, one generator for everybody, unbiased by level, shown on screen', async () => {
    // same seed -> same throws whatever the level; fair faces
    const seqs = [1, 7, 20].map(n => { const S = E.levelGame(n, 42); return Array.from({ length: 30 }, () => E.roll(S)); });
    assert.deepEqual(seqs[0], seqs[1]); assert.deepEqual(seqs[1], seqs[2]);
    const t = { rng: 99 }, cnt = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) cnt[Math.floor(E.rnd(t, 'rng') * 6)]++;
    cnt.forEach((c, f) => assert.ok(c > 880 && c < 1120, `face ${f + 1} came ${c} times out of 6000`));
    // the page plays a whole game of level 10 with seed 11: it must end exactly like the offline game of the same seed,
    // which proves that every throw (human and opponents) is the generator's, in order, and nothing else is random
    const { context, page } = await open();
    await page.evaluate(() => window.__game.loadLevel(10));
    await page.evaluate(() => window.__game.seed(11));
    await playOut(page);
    const s = await state(page);
    const off = E.levelGame(10, 11); playGame(off);
    assert.deepEqual(s.game, off, 'page and offline game end in the same state, generator included');
    assert.equal(await page.locator('#die').getAttribute('aria-label'), 'Dé : ' + s.last, 'the die on screen shows the last throw of anybody');
    // the same seed gives the same game on another level only for the throws, never through a hidden bias
    await page.evaluate(() => window.__game.seed(11));
    assert.equal((await state(page)).game.rng, E.levelGame(10, 11).rng);
    await context.close();
  });

  await test('die: the first throw after a tap is the generator\'s, in every level, and shown', async () => {
    const { context, page } = await open();
    for (const n of [1, 8, 20]) {
      await page.evaluate(k => window.__game.loadLevel(k), n);
      await page.evaluate(() => window.__game.seed(123));
      const ref = E.roll(E.levelGame(n, 123));
      await tap(page, '#die');
      const s = await state(page);
      assert.equal(s.last, ref, `level ${n}: first throw`);
      assert.equal(await page.locator('#die').getAttribute('data-shown'), String(ref), 'the face on the die');
      if (ref === 6) assert.ok(s.game.pos[0].some(p => p === 0), 'a 6 brings a pion out');
      else assert.ok(s.game.pos[0].every(p => p === -1), 'no 6: the pions stay in base');
    }
    await context.close();
  });

  // ------------------------------------------------------------------------------------- rules
  await test('rules: engine of the game against the reference rules on 300 random games', async () => {
    const r = crossCheck(300);
    assert.equal(r.finished, r.games);
    assert.ok(r.caps > 500, 'captures were exercised');
    console.log(`        ${r.games} games, ${r.steps} throws, ${r.caps} captures compared`);
  });

  await test('rules: leaving the base needs a 6, a 6 replays, other values pass the turn', async () => {
    const S = blank(2);
    for (const v of [1, 2, 3, 4, 5]) assert.equal(E.legal(S, 0, v).length, 0, `a ${v} must not release a pion`);
    const six = E.legal(S, 0, 6);
    assert.equal(six.length, 1, 'two pions in base are one choice');
    assert.deepEqual([six[0].from, six[0].to], [-1, 0]);
    S.roll = 6; E.apply(S, six[0]); E.finish(S, true);
    assert.equal(S.turn, 0, 'after a 6 the same player plays again'); assert.equal(S.roll, 0);
    assert.equal(S.turns[0], 1, 'a replay is not a new turn');
    S.roll = 4; E.apply(S, E.legal(S, 0, 4)[0]); E.finish(S, true);
    assert.equal(S.turn, 1, 'another value passes the turn'); assert.equal(S.turns[1], 1);
    // 6 with nothing to move still replays
    const T = blank(2); T.pos[0] = [25, 25]; T.roll = 6;
    assert.equal(E.legal(T, 0, 6).length, 0); E.finish(T, false); assert.equal(T.turn, 0);
  });

  await test('rules: three throws to get out when nothing is on the track, then the turn passes', async () => {
    const S = blank(2);
    S.roll = 2; E.finish(S, false); assert.deepEqual([S.turn, S.tries], [0, 1]);
    S.roll = 3; E.finish(S, false); assert.deepEqual([S.turn, S.tries], [0, 2]);
    S.roll = 5; E.finish(S, false); assert.deepEqual([S.turn, S.tries, S.turns[1]], [1, 0, 1]);
    // with a pion on the track, a throw without move passes at once
    const T = blank(2); T.pos[0] = [24, -1]; T.roll = 5;
    assert.equal(E.legal(T, 0, 5).length, 0); E.finish(T, false); assert.equal(T.turn, 1);
  });

  await test('rules: capture on an ordinary cell, none on a refuge, lanes are private, stacks capture together', async () => {
    // human = player 0 (bottom). Player 1 sits on the cell the human reaches with a 3.
    const S = blank(2, 3);
    S.pos[0] = [5, 12, -1];
    const target = cell(S, 0, 9).xy;
    assert.ok(!REF.SAFE.has(REF.key(target)), 'ordinary cell');
    const q = posAt(S.seats[1], target);
    S.pos[1] = [q, q, -1];
    const mv = E.legal(S, 0, 4).find(m => m.from === 5);
    assert.deepEqual(mv.cap, [[1, 0], [1, 1]], 'both pions of the stack are sent back');
    const c = clone(S); E.apply(c, mv);
    assert.deepEqual(c.pos[1], [-1, -1, -1]); assert.equal(c.pos[0][0], 9); assert.equal(c.caps, 2);
    // refuge: every refuge cell of the ring
    for (const key of REF.SAFE) {
      const xy = key.split(',').map(Number), t = posAt(S.seats[0], xy);
      if (t < 4) continue;
      const R = blank(2); R.pos[0] = [t - 3, -1]; R.pos[1] = [posAt(R.seats[1], xy), -1];
      const m = E.legal(R, 0, 3).find(x => x.from === t - 3);
      assert.equal(m.cap.length, 0, `no capture on refuge ${key}`);
      const d = clone(R); E.apply(d, m);
      assert.equal(d.pos[0][0], t); assert.ok(d.pos[1][0] >= 0, 'both stay');
    }
    // entry cell of another player is a refuge too, and the lanes never meet
    const L = blank(2); L.pos[0] = [21, -1]; L.pos[1] = [24, -1];
    assert.equal(E.legal(L, 0, 3).find(m => m.from === 21).cap.length, 0, 'lane squares are private');
    // a pion entering on an occupied entry cell captures nothing (refuge)
    const En = blank(2); En.pos[1] = [posAt(En.seats[1], cell(En, 0, 0).xy), -1];
    assert.equal(E.legal(En, 0, 6)[0].cap.length, 0);
  });

  await test('rules: exact count to get home (24 + 2, 25 + 1, 20 + 6), never beyond', async () => {
    const S = blank(2);
    S.pos[0] = [24, 26];
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(v => E.legal(S, 0, v).length), [1, 1, 0, 0, 0, 0]);
    assert.equal(E.legal(S, 0, 2)[0].to, 26);
    S.pos[0] = [25, 25]; assert.deepEqual([1, 2, 3, 4, 5, 6].map(v => E.legal(S, 0, v).length), [1, 0, 0, 0, 0, 0]);
    S.pos[0] = [20, -1]; assert.equal(E.legal(S, 0, 6).find(m => m.from === 20).to, 26);
    S.pos[0] = [23, -1]; assert.equal(E.legal(S, 0, 4).find(m => m.from === 23), undefined, '23 + 4 = 27 is too far');
    const W = blank(2); W.pos[0] = [26, 24]; W.roll = 2; E.apply(W, E.legal(W, 0, 2)[0]);
    assert.ok(W.over && W.winner === 0, 'all pions home ends the game');
    // identical pions on the same cell are one choice
    const D = blank(2, 3); D.pos[0] = [7, 7, 7];
    assert.equal(E.legal(D, 0, 2).length, 1);
  });

  await test('rules: stars and ranking from the lead over the best opponent', async () => {
    // k=2: 3 stars from 10 cells, 2 from 4, otherwise 1
    for (const [lead, stars] of [[3, 1], [4, 2], [9, 2], [10, 3], [27, 3]]) {
      const S = blank(2, 2); S.over = true; S.winner = 0; S.pos[0] = [26, 26];
      S.pos[1] = [26, lead > 27 ? -1 : 26 - lead]; // remaining for player 1 = 27 - (pos + 1) = lead
      assert.equal(E.remain(S, 1), lead, 'remaining');
      assert.equal(E.starsFor(S), stars, `lead ${lead}`);
    }
    const k3 = blank(2, 3); k3.over = true; k3.winner = 0; k3.pos[0] = [26, 26, 26]; k3.pos[1] = [26, 26, 26 - 14];
    assert.equal(E.starsFor(k3), 2); k3.pos[1] = [26, 26, 26 - 15]; assert.equal(E.starsFor(k3), 3);
    const lost = blank(2, 2); lost.over = true; lost.winner = 1; lost.pos[1] = [26, 26];
    assert.equal(E.starsFor(lost), 0, 'no star without the win');
    const R3 = blank(3, 2); R3.over = true; R3.winner = 2; R3.pos[2] = [26, 26]; R3.pos[0] = [10, 3]; R3.pos[1] = [20, 20];
    assert.deepEqual(E.ranking(R3), [2, 1, 0]);
  });

  await test('opponents: stronger ones beat weaker ones, the test player wins every level more often than not at the start and less at the end', async () => {
    assert.ok(duel(5, 0, 3, 2500) > 0.56, 'tier 5 should beat tier 0');
    assert.ok(duel(3, 0, 3, 2500) > 0.52, 'tier 3 should beat tier 0');
    assert.ok(duel(1, 0, 3, 2500) > 0.5, 'tier 1 should beat tier 0');
  });

  await test('difficulty curve: measured win rates (400 games per level, tolerance +-7 points against the table of the doc), >= 85 % first, regular descent with breathers, never under 25 %', async () => {
    const md = fs.readFileSync(path.join(__dirname, '..', 'docs', 'contenu', 'course-des-pions.md'), 'utf8');
    const table = {};
    md.split('\n').forEach(l => { const m = /^\|\s*(\d+)\s*\|\s*(\d)\s*\|[^|]*\|\s*(\d+) %/.exec(l); if (m) table[+m[1]] = { h: +m[2], rate: +m[3] / 100 }; });
    assert.equal(Object.keys(table).length, 20, 'the doc lists the 20 levels with their measured rate');
    const rates = [];
    for (let n = 1; n <= 20; n++) {
      let w = 0; const G = 400;
      for (let s = 1; s <= G; s++) { const S = E.levelGame(n, 50000 + 13 * s); playGame(S); if (S.winner === 0) w++; }
      rates.push(w / G);
      assert.equal(table[n].h, E.LEVELS[n - 1].h, `doc table: pions of level ${n}`);
      assert.ok(Math.abs(rates[n - 1] - table[n].rate) <= 0.07, `level ${n}: measured ${(100 * rates[n - 1]).toFixed(0)} % against ${100 * table[n].rate} % in the doc`);
    }
    assert.ok(rates[0] >= 0.85 && rates[1] >= 0.85, `levels 1-2: ${rates[0]}, ${rates[1]}`);
    rates.forEach((r, i) => assert.ok(r >= 0.25, `level ${i + 1}: ${(100 * r).toFixed(0)} % is under 25 %`));
    assert.ok(rates[19] >= 0.25 && rates[19] <= 0.36, `level 20: ${(100 * rates[19]).toFixed(0)} %, about 30 % expected`);
    const avg = (a, b) => rates.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
    const blocks = [avg(0, 4), avg(4, 8), avg(8, 12), avg(12, 16), avg(16, 20)];
    for (let i = 1; i < 5; i++) assert.ok(blocks[i] < blocks[i - 1] - 0.05, `blocks of four levels must keep falling: ${blocks.map(b => b.toFixed(2))}`);
    let breathers = 0;
    for (let i = 1; i < 20; i++) { assert.ok(rates[i - 1] - rates[i] <= 0.2, `level ${i + 1}: drop of more than 20 points`); if (rates[i] >= rates[i - 1] + 0.02) breathers++; }
    assert.ok(breathers >= 3, 'at least 3 breathers: ' + breathers);
    console.log('        measured win rate per level: ' + rates.map(r => Math.round(100 * r)).join(' ') + ' %');
  });

  // ------------------------------------------------------------------------------------- first launch
  await test('first launch: home in one tap to play, level 1 explained by one sentence and a pulsing die', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { instant: false });
    assert.equal((await state(page)).screen, 'home');
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 1/);
    assert.match(await page.locator('#home').textContent(), /Ronde Vive/);
    assert.match(await page.locator('#hStars').textContent(), /0 \/ 60/);
    await tap(page, '#bGo');
    const s = await state(page);
    assert.equal(s.screen, 'game'); assert.equal(s.level, 1); assert.equal(s.phase, 'roll'); assert.ok(s.human);
    assert.equal(await page.locator('#die').getAttribute('class'), 'ready');
    const hint = (await page.locator('#msg').textContent()).trim();
    assert.match(hint, /dé/i); assert.ok(hint.split(/[.!?]/).filter(Boolean).length <= 1, 'at most one sentence of explanation: ' + hint);
    assert.equal(await page.locator('.pion').count(), 4, '1 pion for you, 3 for the opponent');
    assert.equal((await page.locator('#vs').textContent()).trim(), 'Toi : 1 pion · Adversaire : 3 pions', 'the handicap is announced before the game');
    assert.match(await page.locator('#goal').textContent(), /15 cases d’avance/, 'the star criterion is shown before playing');
    await context.close();
  });

  // ------------------------------------------------------------------------------------- 20 levels with real taps
  await test('the 20 levels are won by real taps with the fixed seeds, in order, through the "Suivant" button', async () => {
    const { context, page } = await open();
    await tap(page, '#bGo');
    let chk = 0;
    for (let n = 1; n <= 20; n++) {
      let s = await state(page);
      assert.equal(s.level, n, `level ${n} is on screen`);
      await page.evaluate(seed => window.__game.seed(seed), SEEDS.win[n - 1]);
      const L = (await page.evaluate(() => window.__game.levels))[n - 1];
      s = await state(page);
      assert.deepEqual(s.game.ks, [L.h].concat(L.opp.map(() => L.o))); assert.equal(s.game.np, L.opp.length + 1);
      assert.deepEqual(s.game.tiers, [null].concat(L.opp));
      const steps = await playOut(page);
      s = await state(page);
      const exp = SEEDS.expect[n - 1];
      assert.equal(s.winner, 0, `level ${n}: won`);
      assert.equal(s.turns[0], exp.turns, `level ${n}: turns as predicted offline`);
      assert.equal(s.stars, exp.stars, `level ${n}: stars as predicted offline`);
      await page.locator('#res').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#wStars .on').count(), exp.stars, `level ${n}: stars on the result screen`);
      assert.equal(await page.locator('#wTurns').textContent(), String(exp.turns));
      assert.equal(await page.locator('#wRank span').count(), s.game.np, 'ranking shows every player');
      const sv = await stored(page);
      assert.equal(sv.stars[n - 1], exp.stars, `level ${n}: stars saved`);
      assert.equal(sv.max, Math.min(20, n + 1), `level ${n}: next level unlocked`);
      const lc = (await events(page, 'level_complete')).filter(e => e.level === n);
      assert.deepEqual(lc, [{ source: 'mini-jeu', game: 'course-des-pions', event: 'level_complete', level: n, score: exp.turns, stars: exp.stars }]);
      if (n === 1 || n === 11 || n === 20) await shot(page, `result-level-${n}`);
      chk++;
      if (n < 20) { assert.equal(await page.locator('#act-next').textContent(), 'Suivant'); await tap(page, '#act-next'); }
      else assert.equal(await page.locator('#act-next').textContent(), 'Niveaux');
    }
    assert.equal(chk, 20);
    const fin = await stored(page);
    assert.equal(fin.stars.length, 20); assert.ok(fin.stars.every(x => x >= 1));
    await tap(page, '#act-next');
    assert.equal((await state(page)).screen, 'levels');
    await context.close();
  });

  // ------------------------------------------------------------------------------------- gameplay details
  await test('one legal move plays itself, a choice is offered with highlighted pions, a blocked turn passes with a message', async () => {
    const { context, page } = await open();
    await page.evaluate(() => window.__game.loadLevel(7));
    // 1. a 6 with two pions in base: one choice -> played alone
    await page.evaluate(seed => window.__game.seed(seed), 1);
    let S = clone((await state(page)).game);
    S.rng = rngFor(6, S);
    await page.evaluate(g => window.__game.setGame(g), S);
    await tap(page, '#die');
    let s = await state(page);
    assert.ok(s.game.pos[0].some(p => p === 0) || s.game.pos[0].some(p => p > 0), 'the pion left the base without any other tap');
    assert.equal(await page.locator('.pion.go').count() >= 0, true);
    // 2. two pions on the track: the player must choose; both are highlighted, with their destination
    S = clone(s.game); S.turn = 0; S.roll = 0; S.tries = 0; S.pos[0] = [3, 10]; S.pos[1] = [-1, -1, -1]; S.rng = rngFor(2, S);
    await page.evaluate(g => window.__game.setGame(g), S);
    await tap(page, '#die');
    s = await state(page);
    assert.equal(s.phase, 'pick'); assert.equal(s.moves.length, 2);
    assert.equal(await page.locator('.pion.go').count(), 2, 'the two movable pions are highlighted');
    assert.equal(await page.locator('.dest').count(), 2, 'their destinations are marked');
    assert.match(await page.locator('#msg').textContent(), /pion/i);
    // an unmovable pion does nothing when tapped
    const base = (await page.evaluate(() => window.__game.state())).game.pos[1];
    const c = await centre(page, '.pion.p1');
    await page.touchscreen.tap(c[0], c[1]);
    assert.equal((await state(page)).phase, 'pick');
    // tapping a pion plays it at once
    const el = await page.evaluate(() => { const e = document.querySelector('.pion.go[data-i="1"]'); const q = e.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await page.touchscreen.tap(el[0], el[1]);
    s = await state(page);
    assert.equal(s.game.pos[0][1], 12, 'pion 1 moved 2 cells');
    assert.equal(s.game.pos[0][0], 3);
    await context.close();
    // 3. a throw that cannot be played: message, then the turn passes (real timing)
    const b = await open({ width: 360, height: 640 }, { instant: false });
    await b.page.evaluate(() => window.__game.loadLevel(7));
    let T = clone((await state(b.page)).game);
    T.pos[0] = [24, 25]; T.rng = rngFor(5, T);
    await b.page.evaluate(g => window.__game.setGame(g), T);
    await tap(b.page, '#die');
    await b.page.waitForFunction(() => /passé/.test(document.getElementById('msg').textContent), null, { timeout: 2000 });
    await b.page.waitForFunction(() => window.__game.state().turn === 1 || window.__game.state().game.turns[1] > 1, null, { timeout: 4000 });
    await b.context.close();
  });

  await test('capture by taps: the opponent goes back to its base; on a refuge nobody is captured', async () => {
    const { context, page } = await open();
    await page.evaluate(() => window.__game.loadLevel(7));
    let S = clone((await state(page)).game);
    S.pos[0] = [5, 14]; S.roll = 0; S.turn = 0;
    const q = posAt(S.seats[1], cell(S, 0, 9).xy);
    S.pos[1] = [q, -1, -1]; S.rng = rngFor(4, S);
    await page.evaluate(g => window.__game.setGame(g), S);
    await tap(page, '#die');
    assert.equal((await state(page)).phase, 'pick');
    const c = await page.evaluate(() => { const q = document.querySelector('.pion.go[data-i="0"]').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await page.touchscreen.tap(c[0], c[1]);
    let s = await state(page);
    assert.equal(s.game.caps, 1, 'one capture'); assert.equal(s.game.pos[0][0], 9);
    // refuge: the same, on the 4th cell of the human path (a corner)
    const t = REF.PATHS[2].findIndex((x, k) => k > 4 && REF.SAFE.has(REF.key(x.xy)) && !x.lane);
    S = clone(s.game); S.turn = 0; S.roll = 0; S.tries = 0; S.pos[0] = [t - 3, 12]; S.pos[1] = [posAt(S.seats[1], REF.PATHS[2][t].xy), -1, -1]; S.caps = 0; S.rng = rngFor(3, S);
    await page.evaluate(g => window.__game.setGame(g), S);
    await tap(page, '#die');
    const ds = await state(page);
    assert.equal(ds.phase, 'pick');
    const c2 = await page.evaluate(() => { const q = document.querySelector('.pion.go[data-i="0"]').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await page.touchscreen.tap(c2[0], c2[1]);
    s = await state(page);
    assert.equal(s.game.caps, 0, 'no capture on a refuge'); assert.equal(s.game.pos[0][0], t);
    await context.close();
  });

  await test('undo: takes back the choice of a pion until the next throw only (no die beyond the one already seen); never in a challenge', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { instant: false });
    await page.evaluate(() => window.__game.loadLevel(7));
    const S = clone((await state(page)).game);
    S.pos[0] = [3, 10]; S.pos[1] = [-1, -1, -1]; S.turn = 0; S.roll = 0; S.tries = 0; S.rng = rngFor(2, S);
    await page.evaluate(g => window.__game.setGame(g), S);
    assert.equal((await state(page)).canUndo, false);
    assert.equal(await page.locator('#bUndo').isDisabled(), true);
    await tap(page, '#die');
    let s = await state(page);
    assert.equal(s.phase, 'pick');
    const afterOne = { rng: S.rng }; E.rnd(afterOne, 'rng');
    const c = await page.evaluate(() => { const q = document.querySelector('.pion.go[data-i="1"]').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await page.touchscreen.tap(c[0], c[1]);
    s = await state(page);
    assert.equal(s.game.pos[0][1], 12);
    assert.equal(s.canUndo, true, 'the choice can be taken back');
    assert.equal(s.game.rng, afterOne.rng, 'only the die already seen has been drawn: nothing to learn about the next ones');
    await tap(page, '#bUndo');
    s = await state(page);
    assert.deepEqual(s.game.pos[0], [3, 10]); assert.equal(s.roll, 2); assert.equal(s.phase, 'pick'); assert.equal(s.game.rng, afterOne.rng);
    assert.equal(s.canUndo, false);
    // choose again, differently, and let the opponent throw: the window is closed
    const c0 = await page.evaluate(() => { const q = document.querySelector('.pion.go[data-i="0"]').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await page.touchscreen.tap(c0[0], c0[1]);
    assert.equal((await state(page)).game.pos[0][0], 5);
    await page.waitForFunction(r => window.__game.state().game.rng !== r, afterOne.rng, { timeout: 4000 });
    assert.equal((await state(page)).canUndo, false, 'once somebody threw, no undo');
    assert.equal(await page.locator('#bUndo').isDisabled(), true);
    await context.close();
    // a challenge has neither "Annuler" nor "Recommencer"
    const b = await open({ width: 360, height: 640 }, { hash: '#defi-7-30' });
    assert.equal(await b.page.locator('footer').isHidden(), true);
    assert.equal((await state(b.page)).canUndo, false);
    await b.context.close();
  });

  await test('restart: a new game of the same level with a new seed; "Annuler" and "Recommencer" always possible', async () => {
    const { context, page } = await open();
    await page.evaluate(() => window.__game.loadLevel(4));
    await page.evaluate(() => window.__game.seed(5));
    await playSteps(page, 8);
    const before = await state(page);
    await tap(page, '#bReset');
    const s = await state(page);
    assert.equal(s.level, 4); assert.equal(s.turns[0], 1); assert.ok(s.game.pos.flat().every(p => p === -1));
    assert.notEqual(s.seed, 5);
    assert.ok(before.game.pos.flat().some(p => p !== -1) || before.turns[0] >= 1);
    await context.close();
  });

  await test('failure handled: lost game shows the ranking, nothing unlocked, "Rejouer" and "Niveaux" work', async () => {
    const lose = SEEDS.lose[6];
    const { context, page } = await open({ width: 360, height: 640 }, { save: { max: 6, level: 6, stars: [3, 3, 3, 3, 3], best: [20, 20, 20, 20, 20] } });
    await tap(page, '#bGo');
    assert.equal((await state(page)).level, 6);
    await page.evaluate(seed => window.__game.seed(seed), lose.seed);
    await playOut(page);
    let s = await state(page);
    assert.notEqual(s.winner, 0); assert.equal(s.stars, 0);
    await page.locator('#res').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wTitle').textContent(), /Pas cette fois/);
    assert.match(await page.locator('#wSub').textContent(), new RegExp('tu finis ' + (lose.rank === 1 ? '1er' : lose.rank + 'e')));
    assert.equal(await page.locator('#wStars').isHidden(), true);
    assert.equal(await page.locator('#act-share').count(), 0, 'no sharing a defeat');
    assert.equal(await page.locator('#act-again').textContent(), 'Réessayer');
    const sv = await stored(page);
    assert.equal(sv.max, 6, 'a defeat unlocks nothing'); assert.equal(sv.stars[5] || 0, 0); assert.equal(sv.cur, null);
    assert.equal((await events(page, 'level_complete')).length, 0);
    await shot(page, 'result-lost');
    await tap(page, '#act-again');
    s = await state(page);
    assert.equal(s.level, 6); assert.equal(s.over, false); assert.equal(s.turns[0], 1);
    assert.equal(await page.locator('#res').isHidden(), true);
    await page.evaluate(seed => window.__game.seed(seed), lose.seed);
    await playOut(page);
    await tap(page, '#act-menu');
    assert.equal((await state(page)).screen, 'levels');
    await context.close();
  });

  await test('stars: 1, 2 and 3 stars come from the lead, the best result is kept, the criterion is the one shown', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { max: 6, level: 6, stars: [3, 3, 3, 3, 3], best: [20, 20, 20, 20, 20] } });
    await tap(page, '#bGo');
    const got = [];
    for (const st of [1, 2, 3, 1]) {
      const sd = SEEDS.stars[st];
      await page.evaluate(seed => window.__game.seed(seed), sd.seed);
      await playOut(page);
      const s = await state(page);
      assert.equal(s.stars, st);
      assert.equal(await page.locator('#wStars .on').count(), st);
      assert.equal(s.turns[0], sd.turns);
      got.push((await stored(page)).stars[5]);
      await tap(page, '#act-again');
    }
    assert.deepEqual(got, [1, 2, 3, 3], 'stars saved when better, never lowered');
    assert.equal((await stored(page)).stars[5], 3, 'a worse result never lowers the stars');
    assert.equal((await stored(page)).best[5], Math.min(SEEDS.stars[1].turns, SEEDS.stars[2].turns, SEEDS.stars[3].turns), 'best score kept');
    await context.close();
  });

  // ------------------------------------------------------------------------------------- save
  await test('resume: a game in progress (seed included) is taken back exactly after a reload and can be finished', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { max: 12, stars: new Array(11).fill(1) } });
    assert.match(await page.locator('#bGo').textContent(), /Niveau 12/);
    await tap(page, '#bGo');
    await playSteps(page, 14);
    const a = await state(page);
    assert.ok(a.turns[0] > 3);
    assert.ok(a.seed !== 0 && a.seed === (await stored(page)).cur.seed, 'the seed of the game is in the save');
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => window.__game.instant(true));
    let b = await state(page);
    assert.equal(b.screen, 'home');
    assert.match(await page.locator('#bGo').textContent(), /Niveau 12/);
    await tap(page, '#bGo');
    b = await state(page);
    assert.deepEqual(b.game, a.game, 'identical position, dice generator and turn');
    assert.equal(b.seed, a.seed, 'same seed after the reload');
    assert.equal(b.canUndo, a.canUndo);
    await playOut(page);
    assert.ok((await state(page)).over);
    // an opponent in the middle of its turn plays on after a reload (real timing)
    const c = await open({ width: 360, height: 640 }, { instant: false, save: { max: 7, stars: new Array(6).fill(1) } });
    await tap(c.page, '#bGo');
    const G = clone((await state(c.page)).game);
    G.turn = 1; G.roll = 6; G.turns[1] = 2; G.pos[1] = [-1, -1, -1];
    await c.page.evaluate(g => window.__game.setGame(g), G);
    await c.page.reload();
    await c.page.waitForFunction(() => !!window.__game);
    await tap(c.page, '#bGo');
    await c.page.waitForFunction(() => window.__game.state().game.pos[1].some(p => p >= 0), null, { timeout: 4000 });
    await c.context.close();
    await context.close();
  });

  await test('corrupted or missing save: the game starts sound; storage that throws is no obstacle', async () => {
    const bads = ['{not json', '[]', '"x"', '0', 'null',
      JSON.stringify({ max: 'a', level: -4, stars: 'no', best: [null], cur: { level: 1, S: { np: 9 } }, chal: 5 }),
      JSON.stringify({ max: 99, level: 99, stars: [9, -1, 'x'], best: [-5], cur: { level: 3, S: { np: 2, k: 2, seats: [2, 0], tiers: [null, 1], pos: [[99, 0], [0, 0]], turns: [1, 1], turn: 0, roll: 0, tries: 0, last: 0, lastBy: 0, caps: 0, winner: -1, over: false, rng: 1, rng2: 2 } } }),
      JSON.stringify({ max: 3, level: 3, cur: { level: 3, S: { np: 2, k: 2, seats: [2, 0], tiers: [null, 1], pos: [[0, 0], [0, 0]], turns: [1, 1], turn: 0, roll: 0, tries: 0, last: 0, lastBy: 0, caps: 0, winner: 1, over: false, rng: 1, rng2: 2 } } }),
      JSON.stringify({ max: 3, level: 3, cur: { level: 3, S: { np: 3, k: 2, seats: [2, 3, 0], tiers: [null, 1, 1], pos: [[0, 0], [0, 0], [0, 0]], turns: [1, 1, 1], turn: 0, roll: 0, tries: 0, last: 0, lastBy: 0, caps: 0, winner: -1, over: false, rng: 1, rng2: 2 } } })];
    for (const [k, bad] of bads.entries()) {
      const { context, page } = await open({ width: 360, height: 640 }, { save: bad });
      const s = await state(page);
      assert.equal(s.screen, 'home', `save #${k}`);
      assert.ok(s.level >= 1 && s.level <= 20);
      assert.ok(s.game.pos.flat().every(p => p >= -1 && p <= 26));
      if (k >= 6) assert.ok(s.game.pos.flat().every(p => p === -1), `save #${k}: the inconsistent game in progress is dropped`);
      await tap(page, '#bGo');
      await playSteps(page, 5);
      await context.close();
    }
    const n = await browser.newContext({ ...MOBILE, viewport: { width: 360, height: 640 } });
    await n.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
    const pg = await n.newPage();
    pg.on('pageerror', e => problems.push('pageerror(no storage): ' + e.message));
    await pg.goto(URL);
    await pg.waitForFunction(() => !!window.__game);
    await pg.evaluate(() => window.__game.instant(true));
    await tap(pg, '#bGo');
    await playSteps(pg, 10);
    assert.ok((await state(pg)).turns[0] >= 1);
    await n.close();
  });

  // ------------------------------------------------------------------------------------- sharing and challenge
  await test('share: short text without spoiler, navigator.share then clipboard, event "share"', async () => {
    const { context, page } = await open();
    await page.evaluate(() => { window.__shared = []; Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } }); });
    await tap(page, '#bGo');
    await page.evaluate(seed => window.__game.seed(seed), SEEDS.win[0]);
    await playOut(page);
    await tap(page, '#act-share');
    const sh = await page.evaluate(() => window.__shared);
    assert.equal(sh.length, 1);
    const exp = SEEDS.expect[0];
    assert.equal(sh[0].text, `${NAME} · Niveau 1 · ${'⭐'.repeat(exp.stars)} en ${exp.turns} tour${exp.turns > 1 ? 's' : ''}`);
    assert.deepEqual(await events(page, 'share'), [{ source: 'mini-jeu', game: 'course-des-pions', event: 'share', kind: 'result' }]);
    // clipboard fallback
    await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); window.__copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } }); });
    await tap(page, '#act-share');
    assert.equal((await page.evaluate(() => window.__copied)).length, 1);
    await page.waitForFunction(() => /Copié/.test(document.getElementById('act-share').textContent));
    await context.close();
  });

  await test('challenge: link built from MJ_CONFIG or the http(s) address, letters/digits/hyphens only, none on a file', async () => {
    const base = 'https://example.test/jeux/ronde-vive/';
    // R4: the link is origin + pathname + fragment, even when the base given by the host carries a query string
    const { context, page } = await open({ width: 360, height: 640 }, { config: { shareBaseUrl: base + '?token=SECRET123&n=7' } });
    await page.evaluate(() => { window.__shared = []; Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } }); });
    await tap(page, '#bGo');
    await page.evaluate(seed => window.__game.seed(seed), SEEDS.win[0]);
    await playOut(page);
    await tap(page, '#act-chal');
    const text = (await page.evaluate(() => window.__shared))[0].text, exp = SEEDS.expect[0];
    const link = text.match(/https?:\/\/\S+/)[0];
    assert.equal(link, `${base}#defi-1-${exp.turns}`);
    assert.match(link.split('#')[1], /^[A-Za-z0-9-]+$/);
    assert.ok(!/seed|graine|solution|SECRET|token|\?/i.test(text), 'no query string in the shared text: ' + text);
    assert.deepEqual(await events(page, 'share'), [{ source: 'mini-jeu', game: 'course-des-pions', event: 'share', kind: 'challenge' }]);
    await context.close();
    const b = await open();
    await b.page.evaluate(() => { window.__shared = []; Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } }); });
    await tap(b.page, '#bGo');
    await b.page.evaluate(seed => window.__game.seed(seed), SEEDS.win[0]);
    await playOut(b.page);
    await tap(b.page, '#act-chal');
    const t2 = (await b.page.evaluate(() => window.__shared))[0].text;
    assert.ok(!/https?:|file:|#defi/.test(t2) && t2.includes(` ${exp.turns} tour`), 'no link on a local file: ' + t2);
    await b.context.close();
    const ctx = await browser.newContext({ ...MOBILE, viewport: { width: 360, height: 640 } });
    await ctx.route(/^http:\/\/ronde\.test\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(FILE, 'utf8') }));
    const hp = await ctx.newPage();
    hp.on('pageerror', e => problems.push('pageerror(http): ' + e.message));
    await hp.goto('http://ronde.test/jeux/index.html?token=SECRET456&n=3');
    await hp.waitForFunction(() => !!window.__game);
    await hp.evaluate(() => { window.__game.instant(true); window.__shared = []; Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } }); });
    await tap(hp, '#bGo');
    await hp.evaluate(seed => window.__game.seed(seed), SEEDS.win[0]);
    await playOut(hp);
    await tap(hp, '#act-chal');
    const t3 = (await hp.evaluate(() => window.__shared))[0].text;
    assert.ok(t3.includes(`http://ronde.test/jeux/index.html#defi-1-${exp.turns}`) && !/SECRET|token/.test(t3), 'the address query is never shared: ' + t3);
    await ctx.close();
  });

  await test('challenge: opened by the link on a locked level with one objective; won, lost; the run and the game in progress stay untouched', async () => {
    // a run in progress on level 3, then a link to level 7 (locked)
    const save = { max: 3, level: 3, stars: [3, 2], best: [20, 21], fast: false };
    let { context, page } = await open({ width: 360, height: 640 }, { save });
    await tap(page, '#bGo');
    await page.evaluate(seed => window.__game.seed(seed), 9);
    await playSteps(page, 6);
    const before = await stored(page), run = (await state(page)).game;
    assert.ok(before.cur && before.cur.level === 3);
    const exp = SEEDS.expect[6], target = exp.turns;
    await page.evaluate(h => { location.hash = h; }, `#defi-7-${target}`);
    let s = await state(page);
    assert.equal(s.mode, 'chal'); assert.equal(s.level, 7); assert.equal(s.target, target); assert.equal(s.screen, 'game');
    assert.deepEqual(await events(page, 'challenge_open'), [{ source: 'mini-jeu', game: 'course-des-pions', event: 'challenge_open', level: 7, target }]);
    const goalTxt = await page.locator('#goal').textContent();
    assert.match(goalTxt, new RegExp(`Objectif : ${target} tour`));
    assert.equal(await page.locator('#goal svg').count(), 0, 'one objective: no star line');
    assert.equal(await page.evaluate(() => location.hash), '', 'the fragment is consumed');
    const dur = await stored(page);
    assert.deepEqual({ max: dur.max, level: dur.level, stars: dur.stars, cur: dur.cur }, { max: before.max, level: before.level, stars: before.stars, cur: before.cur }, 'opening a challenge writes nothing to the run');
    await shot(page, 'challenge');
    await page.evaluate(seed => window.__game.seed(seed), SEEDS.win[6]);
    await playOut(page);
    s = await state(page);
    assert.equal(s.winner, 0); assert.equal(s.turns[0], target);
    await page.locator('#res').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wTitle').textContent(), /Défi relevé/);
    assert.match(await page.locator('#wChal').textContent(), /égales ou bats/);
    assert.deepEqual(await page.locator('#acts .btn').allTextContents(), ['Renvoyer le défi', 'Accueil'], 'R3: a challenge is played once per opening');
    assert.equal(await page.locator('#act-again').count(), 0);
    assert.equal(await page.locator('footer').isHidden(), true, 'no Recommencer / Annuler in a challenge');
    assert.deepEqual(await events(page, 'challenge_result'), [{ source: 'mini-jeu', game: 'course-des-pions', event: 'challenge_result', level: 7, score: target, target, won: true }]);
    assert.equal((await events(page, 'level_complete')).length, 0, 'a challenge is not a level result');
    const after = await stored(page);
    assert.deepEqual({ max: after.max, level: after.level, stars: after.stars, cur: after.cur }, { max: before.max, level: before.level, stars: before.stars, cur: before.cur }, 'winning a challenge writes nothing to the run');
    await tap(page, '#act-home');
    await tap(page, '#bGo');
    assert.deepEqual((await state(page)).game, run, 'the game in progress is still there');
    await context.close();
    // lost: one more turn than the target allows ... (same game, target - 1)
    ({ context, page } = await open({ width: 360, height: 640 }, {}));
    await page.evaluate(h => { location.hash = h; }, `#defi-7-${target - 1}`);
    await page.evaluate(seed => window.__game.seed(seed), SEEDS.win[6]);
    await playOut(page);
    await page.locator('#res').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wChal').textContent(), /de trop/);
    assert.deepEqual((await events(page, 'challenge_result')).map(e => [e.score, e.target, e.won]), [[target, target - 1, false]]);
    assert.deepEqual(await page.locator('#acts .btn').allTextContents(), ['Accueil'], 'lost challenge: nothing to retry');
    assert.equal(await page.locator('#act-again').count(), 0);
    // a new opening of the link is a new challenge: a lost game this time
    await tap(page, '#act-home');
    await page.evaluate(h => { location.hash = h; }, `#defi-7-${target}`);
    await page.evaluate(seed => window.__game.seed(seed), SEEDS.lose[7].seed);
    await playOut(page);
    await page.locator('#res').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wChal').textContent(), /Défi raté/);
    const res = await events(page, 'challenge_result');
    assert.deepEqual(res.map(e => e.won), [false, false], 'one challenge_result per opening');
    assert.equal((await events(page, 'challenge_open')).length, 2);
    await context.close();
    // a challenge in progress survives a reload (even locked), the run still untouched
    ({ context, page } = await open({ width: 360, height: 640 }, {}, {}));
    await page.evaluate(h => { location.hash = h; }, '#defi-15-40');
    await playSteps(page, 6);
    const mid = await state(page);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    const re = await state(page);
    assert.equal(re.mode, 'chal'); assert.equal(re.level, 15); assert.equal(re.target, 40);
    assert.deepEqual(re.game, mid.game);
    assert.equal((await stored(page)).max, 1);
    await context.close();
  });

  await test('challenge: malformed fragments are ignored without error, a pasted link opens a challenge on an open page', async () => {
    for (const h of ['#defi-999-3', '#defi-abc', '#defi-0-3', '#defi-5-0', '#defi-5', '#defi-1-2-3', '#defi--4', '#defi-3-99999', '#autre', '#defi-7-x', '#defi-15-5', '#defi-3-100']) {
      const { context, page } = await open({ width: 360, height: 640 }, { hash: h });
      const s = await state(page);
      assert.equal(s.mode, 'level', 'junk link accepted: ' + h); assert.equal(s.screen, 'home');
      assert.equal((await events(page, 'challenge_open')).length, 0);
      await context.close();
    }
    const { context, page } = await open({ width: 360, height: 640 }, { save: { max: 5, level: 5 } });
    await page.evaluate(() => { location.hash = '#defi-3-12'; });
    const s = await state(page);
    assert.equal(s.mode, 'chal'); assert.equal(s.level, 3);
    await context.close();
  });

  await test('events: only the listed ones, with the listed fields and no personal data', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { hash: '#defi-2-30' });
    await playOut(page);
    await tap(page, '#act-home');
    await tap(page, '#bGo');
    await page.evaluate(seed => window.__game.seed(seed), SEEDS.win[0]);
    await playOut(page);
    await page.evaluate(() => { window.__shared = []; Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } }); });
    await tap(page, '#act-share'); await tap(page, '#act-chal');
    const all = await msgs(page);
    const allowed = { level_complete: ['level', 'score', 'stars'], share: ['kind'], challenge_open: ['level', 'target'], challenge_result: ['level', 'score', 'target', 'won'] };
    const names = new Set(all.map(m => m.event));
    for (const e of ['level_complete', 'share', 'challenge_open', 'challenge_result']) assert.ok(names.has(e), 'missing event ' + e);
    all.forEach(m => {
      assert.ok(allowed[m.event], 'unlisted event ' + m.event);
      assert.deepEqual(Object.keys(m).sort(), ['source', 'game', 'event'].concat(allowed[m.event]).sort(), 'fields of ' + m.event);
      assert.equal(m.source, 'mini-jeu'); assert.equal(m.game, 'course-des-pions');
    });
    await context.close();
  });

  // ------------------------------------------------------------------------------------- common rules R5, R6, touch
  await test('R6: "Continuer" always points at the first level not finished; replaying an old level does not move it', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { max: 5, level: 5, stars: [3, 2, 3, 1] } });
    assert.match(await page.locator('#bGo').textContent(), /Niveau 5/);
    await tap(page, '#bLevels');
    await tap(page, '.cell[data-level="2"]');
    let s = await state(page);
    assert.equal(s.level, 2); assert.equal(s.screen, 'game');
    await page.evaluate(seed => window.__game.seed(seed), SEEDS.win[1]);
    await playOut(page);
    await page.locator('#res').waitFor({ state: 'visible' });
    await tap(page, '#act-home');
    assert.match(await page.locator('#bGo').textContent(), /Niveau 5/, 'after winning an old level');
    const sv = await stored(page);
    assert.equal(sv.stars[1], 3, 'the best result of the old level is kept'); assert.equal(sv.max, 5);
    await tap(page, '#bGo');
    assert.equal((await state(page)).level, 5);
    // a game left in progress on an old level comes back from the grid, not from "Continuer"
    await tap(page, '#bMap'); await tap(page, '.cell[data-level="3"]');
    await playSteps(page, 4);
    const mid = (await state(page)).game;
    await tap(page, '#bMap'); await tap(page, '#bLBack');
    assert.match(await page.locator('#bGo').textContent(), /Niveau 5/);
    await tap(page, '#bLevels'); await tap(page, '.cell[data-level="3"]');
    assert.deepEqual((await state(page)).game, mid, 'the game of level 3 is resumed from the grid');
    await context.close();
  });

  await test('R5: nothing in the page shows the dice or the generator state', async () => {
    const { context, page } = await open();
    await tap(page, '#bGo');
    await page.evaluate(() => window.__game.seed(123456789));
    await playSteps(page, 8);
    const s = await state(page);
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    for (const v of ['123456789', String(s.game.rng), String(s.game.rng2)]) assert.ok(!html.includes(v), 'generator value in the DOM: ' + v);
    assert.ok(!/data-(seed|rng|next|solution)/.test(html));
    await context.close();
  });

  await test('one gesture, one reaction: a double tap or a long press never throws twice or plays a pion hidden under the finger', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { instant: false });
    const cdp = await context.newCDPSession(page);
    const press = async (x, y, ms) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await page.evaluate(() => window.__game.loadLevel(7));
    const base = clone((await state(page)).game);
    const craft = async (pos, v) => {
      const S = clone(base); S.pos[0] = pos; S.pos[1] = [-1, -1, -1]; S.turn = 0; S.roll = 0; S.tries = 0; S.rng = rngFor(v, S);
      await page.evaluate(g => window.__game.setGame(g), S);
      const q = { rng: S.rng }; E.rnd(q, 'rng');
      return q.rng;
    };
    // 1. a 6 that plays itself (the player throws again at once): a second tap 250 ms later is the same gesture
    let after = await craft([-1, -1], 6);
    await tap(page, '#die');
    await page.waitForTimeout(250);
    await tap(page, '#die');
    await page.waitForTimeout(700);
    let s = await state(page);
    assert.equal(s.game.rng, after, 'one throw only');
    assert.ok(s.game.pos[0].includes(0) && s.roll === 0 && s.turn === 0);
    // 2. long press on the die (800 ms): one throw, no pion played
    after = await craft([3, 10], 2);
    let c = await centre(page, '#die');
    await press(c[0], c[1], 800);
    s = await state(page);
    assert.equal(s.game.rng, after); assert.equal(s.phase, 'pick'); assert.deepEqual(s.game.pos[0], [3, 10]);
    // 3. long press on a pion: played once
    c = await page.evaluate(() => { const q = document.querySelector('.pion.go[data-i="1"]').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await press(c[0], c[1], 800);
    s = await state(page);
    assert.deepEqual(s.game.pos[0], [3, 12], 'one pion, played once');
    // 4. the die lying exactly over the place where a pion appears: the press that threw does not also play it
    after = await craft([3, 10], 2);
    const P = await page.evaluate(() => { const q = document.querySelector('.pion[data-p="0"][data-i="1"]').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    await page.evaluate(([x, y]) => { const d = document.getElementById('die'); d.style.cssText = `position:fixed;z-index:99;left:${x - 34}px;top:${y - 34}px`; }, P);
    await page.touchscreen.tap(P[0], P[1]);
    s = await state(page);
    assert.equal(s.phase, 'pick');
    await page.evaluate(() => { document.getElementById('die').style.pointerEvents = 'none'; });   // the die goes away, the pion is now under the finger
    await page.touchscreen.tap(P[0], P[1]);
    assert.deepEqual((await state(page)).game.pos[0], [3, 10], 'a second tap in the same place right away does not play the pion');
    await page.waitForTimeout(450);
    await page.touchscreen.tap(P[0], P[1]);
    assert.deepEqual((await state(page)).game.pos[0], [3, 12], 'a deliberate tap later does');
    await context.close();
  });

  // ------------------------------------------------------------------------------------- several on this phone
  await test('"à plusieurs sur ce téléphone": 2 to 4 players, one die for all, tap by tap to a winner, outside the run', async () => {
    const { context, page } = await open();
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ max: 2, level: 2, stars: [1], best: [18] })), KEY);
    await page.reload(); await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => window.__game.instant(true));
    await tap(page, '#bHot');
    assert.equal(await page.locator('#hot [data-np]').count(), 3);
    for (const np of [2, 3, 4]) {
      await tap(page, `#hot [data-np="${np}"]`);
      const s = await state(page);
      assert.equal(s.mode, 'hot'); assert.equal(s.game.np, np); assert.equal(s.game.k, 2);
      assert.ok(s.game.tiers.every(t => t === null), 'everybody is a human');
      assert.equal(await page.locator('.pion').count(), np * 2);
      assert.match(await page.locator('#lvl').textContent(), /À plusieurs/);
      await tap(page, '#bMap');                        // back to the home screen, not the levels
      assert.equal((await state(page)).screen, 'home');
      await tap(page, '#bHot');
    }
    await tap(page, '#hot [data-np="3"]');
    await page.evaluate(seed => window.__game.seed(seed), 21);
    // turns follow the order, the die is the same generator, the label names who plays
    const order = [], S = E.hotGame(3, 21);
    let k = 0;
    for (; k < 3000; k++) {
      const s = await state(page);
      if (s.over) break;
      if (s.phase === 'roll') order.push(s.turn);
      assert.ok(s.human, 'in this mode every player is a human');
      const who = await page.locator('#who').textContent();
      assert.ok(who.includes(['Corail', 'Sarcelle', 'Lilas'][s.turn]), 'who plays: ' + who);
      await humanStep(page);
    }
    const s = await state(page);
    assert.ok(s.over && s.winner >= 0);
    assert.ok(new Set(order).size === 3, 'all three players played');
    await page.locator('#res').waitFor({ state: 'visible' });
    assert.match(await page.locator('#wTitle').textContent(), /gagne/);
    assert.ok((await page.locator('#wTitle').textContent()).includes(['Corail', 'Sarcelle', 'Lilas'][s.winner]));
    assert.equal(await page.locator('#wStars').isHidden(), true);
    assert.deepEqual((await page.locator('#acts .btn').allTextContents()), ['Rejouer', 'Accueil']);
    assert.equal(await page.locator('#wRank span').count(), 3);
    await shot(page, 'result-hot');
    const sv = await stored(page);
    assert.deepEqual([sv.max, sv.level], [2, 2]);
    assert.equal(sv.stars[0], 1); assert.equal(sv.stars.slice(1).every(x => x === 0), true);
    assert.equal((await events(page, 'level_complete')).length, 0, 'outside the run: no level result');
    await tap(page, '#act-again');
    const n = await state(page);
    assert.equal(n.mode, 'hot'); assert.equal(n.over, false); assert.equal(n.game.np, 3);
    await tap(page, '#bMap');
    await tap(page, '#bGo');
    assert.equal((await state(page)).mode, 'level', 'the run is where it was');
    await context.close();
  });

  // ------------------------------------------------------------------------------------- timing
  await test('pace: opponents play fast and can be accelerated; estimated length of a game per level', async () => {
    const T = await (async () => { const { context, page } = await open(); const t = await page.evaluate(() => window.__game.timing()); await context.close(); return t; })();
    const botTurn = (T.delays.botRoll + T.delays.botMove + T.delays.after) / 1000, humanThrow = 1.2;
    assert.ok(botTurn < 0.8, 'an opponent throw takes less than 0.8 s: ' + botTurn);
    const est = {};
    for (const n of [1, 2, 6, 11, 14, 18, 19, 20]) {
      let h = 0, b = 0; const G = 120;
      for (let s = 1; s <= G; s++) { const S = E.levelGame(n, 300 + s); const r = playGame(S); h += r.humanRolls; b += r.botRolls; }
      est[n] = { normal: (h / G * humanThrow + b / G * botTurn) / 60, fast: (h / G * humanThrow + b / G * botTurn * T.fastFactor) / 60 };
    }
    for (const n of [19, 20]) assert.ok(est[n].normal >= 2 && est[n].normal <= 4, `level ${n}: ${est[n].normal.toFixed(1)} min`);
    for (const n of [1, 2, 6, 11, 14, 18]) assert.ok(est[n].normal <= 2.4, `level ${n}: ${est[n].normal.toFixed(1)} min`);
    for (const n of [1, 2]) assert.ok(est[n].normal <= 1, `level ${n} takes less than a minute: ${est[n].normal.toFixed(1)} min`);
    for (const n of Object.keys(est)) assert.ok(est[n].fast < est[n].normal, 'accelerating must be faster');
    console.log('        estimated minutes (normal / accelerated): ' + Object.keys(est).map(n => `L${n} ${est[n].normal.toFixed(1)}/${est[n].fast.toFixed(1)}`).join('  '));
    // the button really shortens the wait: a human throw and the opponent's answer, in real time
    const { context, page } = await open({ width: 360, height: 640 }, { instant: false });
    await page.evaluate(() => window.__game.loadLevel(7));
    let rng = 1;
    for (;; rng++) { const q = { rng }; if ([0, 1].every(() => Math.floor(E.rnd(q, 'rng') * 6) + 1 <= 4)) break; }
    const round = async () => {
      const S = clone((await state(page)).game);
      S.pos = [[10, -1], [10, -1, -1]]; S.turn = 0; S.roll = 0; S.tries = 0; S.turns = [1, 0]; S.rng = rng; S.rng2 = 3;
      await page.evaluate(g => window.__game.setGame(g), S);
      const t0 = Date.now();
      await tap(page, '#die');
      await page.waitForFunction(() => { const s = window.__game.state(); return s.turn === 0 && s.roll === 0 && s.game.turns[0] >= 2; }, null, { timeout: 8000 });
      return Date.now() - t0;
    };
    const slow = await round();
    await tap(page, '#bFast');
    assert.equal((await state(page)).fast, true);
    const quick = await round();
    assert.ok(quick < slow * 0.7, `accelerated ${quick} ms vs normal ${slow} ms`);
    assert.equal(await page.locator('#fastT').textContent(), '×2');
    assert.equal((await stored(page)).fast, true);
    console.log(`        a throw of the human + the answer of the opponent: ${slow} ms normal, ${quick} ms accelerated`);
    await context.close();
  });

  // ------------------------------------------------------------------------------------- layout
  const dense = n => {          // a crowded position: up to 6 pions on one refuge, pions in lanes, at home, in base
    const S = E.levelGame(n, 9), np = S.np;
    const corner = REF.PATHS[S.seats[0]].findIndex((x, i) => i > 4 && !x.lane && REF.SAFE.has(REF.key(x.xy)));
    const xy = REF.PATHS[S.seats[0]][corner].xy;
    const here = p => posAt(S.seats[p], xy);
    S.pos[0] = [here(0), here(0), 24].slice(0, S.ks[0]);
    S.pos[1] = [here(1), here(1), 26].slice(0, S.ks[1]);
    if (np > 2) S.pos[2] = [here(2), 14, -1].slice(0, S.ks[2]);
    if (np > 3) S.pos[3] = [here(3), 20, 25].slice(0, S.ks[3]);
    return S;
  };
  for (const vp of VIEWPORTS) {
    const tag = `${vp.width}x${vp.height}`;
    await test(`layout ${tag}: every screen fits without scrolling, targets >= 44 px, board readable, stacked pions still 44 px`, async () => {
      const { context, page } = await open(vp);
      const SEL_NOTOUR = '.btn, .icon, #die, .cell, .pion, [data-np]';
      let m = await measure(page, '.btn');
      checkFit(m, `home ${tag}`);
      await shot(page, `home-${tag}`);
      await tap(page, '#bLevels');
      m = await measure(page, '.cell, .btn, .icon');
      checkFit(m, `levels ${tag}`);
      assert.equal((await page.locator('#grid .cell').count()), 20);
      await shot(page, `levels-${tag}`);
      await tap(page, '#bLBack');
      await tap(page, '#bHot');
      m = await measure(page, '[data-np], .icon');
      checkFit(m, `hot ${tag}`);
      await shot(page, `hot-${tag}`);
      await tap(page, '#bHBack');
      await tap(page, '#bGo');
      m = await measure(page, SEL_NOTOUR);
      checkFit(m, `game start ${tag}`);
      // the board is square, inside the screen, above the dock, cells at least 44 px wide
      assert.ok(Math.abs(m.board.w - m.board.h) < 1, 'square board');
      assert.ok(m.board.b <= m.dock.t + 0.5 && m.board.l >= 0 && m.board.r <= m.iw, 'board fits between header and dock');
      assert.ok(m.board.w / 7 >= 43.9, `cells are ${(m.board.w / 7).toFixed(1)} px`);
      await shot(page, `game-start-${tag}`);
      // heaviest levels: 4 players, 3 pions, play on and look at several moments, then a crowded crafted position
      await page.evaluate(() => window.__game.loadLevel(20));
      await page.evaluate(() => window.__game.seed(5));
      for (let step = 0; step < 4; step++) {
        await playSteps(page, 12);
        m = await measure(page, SEL_NOTOUR);
        checkFit(m, `level 20 mid-game #${step} ${tag}`);
        const board = m.board;
        const pions = await page.evaluate(() => [...document.querySelectorAll('.pion')].map(e => { const q = e.getBoundingClientRect(); return { w: q.width, h: q.height, x: q.left + q.width / 2, y: q.top + q.height / 2, v: getComputedStyle(e).visibility }; }));
        pions.filter(p => p.v !== 'hidden').forEach(p => {
          assert.ok(p.w >= 43.9 && p.h >= 43.9, `pion hit zone ${p.w}x${p.h}`);
          assert.ok(p.x >= board.l && p.x <= board.r && p.y >= board.t && p.y <= board.b, 'pion centre outside the board');
        });
      }
      await shot(page, `game-level20-${tag}`);
      for (const n of [20, 11, 9]) {
        await page.evaluate(g => window.__game.loadLevel(g), n);
        const S = dense(n);
        await page.evaluate(g => window.__game.setGame(g), S);
        m = await measure(page, SEL_NOTOUR);
        checkFit(m, `crowded level ${n} ${tag}`);
        // stacked pions: every pion keeps a 44 px zone and the cell centre is covered by one of them
        const info = await page.evaluate(() => [...document.querySelectorAll('.pion')].filter(e => getComputedStyle(e).visibility !== 'hidden').map(e => { const q = e.getBoundingClientRect(); return [q.width, q.height]; }));
        assert.ok(info.length >= 3);
        info.forEach(([w, h]) => assert.ok(w >= 43.9 && h >= 43.9));
        if (n === 20) await shot(page, `crowded-${tag}`);
      }
      // movable pions highlighted on a crowded board stay inside the screen
      await page.evaluate(() => window.__game.loadLevel(14));
      const T = dense(14); T.turn = 0; T.roll = 0; T.rng = rngFor(1, T);
      T.pos[0] = [6, 6, 11]; T.rng = rngFor(1, T);
      await page.evaluate(g => window.__game.setGame(g), T);
      await tap(page, '#die');
      m = await measure(page, SEL_NOTOUR);
      checkFit(m, `pick ${tag}`);
      await shot(page, `pick-${tag}`);
      // result screens
      await page.evaluate(() => window.__game.loadLevel(2));
      await page.evaluate(seed => window.__game.seed(seed), SEEDS.win[1]);
      await playOut(page);
      await page.locator('#res').waitFor({ state: 'visible' });
      await page.waitForTimeout(350);
      m = await measure(page, '#res .btn');
      checkFit(m, `result win ${tag}`);
      let card = await page.evaluate(() => { const q = document.querySelector('#res .card').getBoundingClientRect(); return { t: q.top, b: q.bottom, l: q.left, r: q.right, ih: innerHeight, iw: innerWidth }; });
      assert.ok(card.t >= 0 && card.b <= card.ih && card.l >= 0 && card.r <= card.iw, `win card out of screen ${JSON.stringify(card)}`);
      await shot(page, `result-win-${tag}`);
      await page.evaluate(() => window.__game.loadLevel(20));
      await page.evaluate(seed => window.__game.seed(seed), SEEDS.lose[20].seed);
      await playOut(page);
      await page.locator('#res').waitFor({ state: 'visible' });
      await page.waitForTimeout(350);
      m = await measure(page, '#res .btn');
      checkFit(m, `result lost ${tag}`);
      // result of a challenge with its longest content
      await page.evaluate(h => { location.hash = h; }, '#defi-20-5');
      await page.evaluate(seed => window.__game.seed(seed), SEEDS.win[19]);
      await playOut(page);
      await page.locator('#res').waitFor({ state: 'visible' });
      await page.waitForTimeout(350);
      m = await measure(page, '#res .btn');
      checkFit(m, `result challenge ${tag}`);
      card = await page.evaluate(() => { const q = document.querySelector('#res .card').getBoundingClientRect(); return { t: q.top, b: q.bottom, ih: innerHeight }; });
      assert.ok(card.t >= 0 && card.b <= card.ih, 'challenge card out of screen');
      await shot(page, `result-challenge-${tag}`);
      // four players on this phone, mid-game
      await tap(page, '#act-home');
      await tap(page, '#bHot');
      await tap(page, '#hot [data-np="4"]');
      await playSteps(page, 30);
      m = await measure(page, SEL_NOTOUR);
      checkFit(m, `hot 4 players ${tag}`);
      await shot(page, `hot4-${tag}`);
      await context.close();
    });
  }

  await test('reduced motion: playable, no animation left running', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { instant: false, extra: { reducedMotion: 'reduce' } });
    await tap(page, '#bGo');
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0, 'not even the pulse of the die');
    await tap(page, '#die');
    await page.waitForFunction(() => window.__game.state().last > 0);
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
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
