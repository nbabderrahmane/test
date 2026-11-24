'use strict';
/*
 * Mobile acceptance tests for games/les-familles ("Qui va où"). Plain node + playwright + node:assert.
 *   node tests/les-familles.spec.js        (set SHOTS=<dir> to also write screenshots)
 * The solutions live in tools/les-familles/data.js (the game only embeds the grids it needs to
 * check a guess; the word table of the verifier stays out of the game).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const FILE = path.join(__dirname, '..', 'games', 'les-familles', 'index.html');
const URL = pathToFileURL(FILE).href;
const KEY = 'mj:les-familles:v1';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DATA = require('../tools/les-familles/data');
const VERIFY = require('../tools/les-familles/verify');
const BUILD = require('../tools/les-familles/build');
const NAME = 'Qui va où';
const SHAPES = ['\u271A', '\u2665', '\u2726', '\u25B2'];   // plus, heart, star, triangle

const fam = (n, f) => DATA.GRIDS[n - 1][f][1];                 // the 3 words of family f of grid n
const famName = (n, f) => DATA.TAGS[DATA.GRIDS[n - 1][f][0]];
const allWords = n => DATA.GRIDS[n - 1].flatMap(f => f[1]);
// a saved game in progress for level 3: stored with words, never with tile numbers
const savedCur = () => {
  const w = allWords(3), k = ws => ws.slice().sort().join('|');
  return { n: 3, roll: 0, err: 1, order: w.slice().reverse(), found: [2], tried: [k([w[0], w[3], w[6]])], sel: [w[0]] };
};

let browser;
const problems = [];   // console errors, page errors, unexpected requests (all pages)
const results = [];

// Opens the game. opts: save (raw string seeded once), config (window.MJ_CONFIG), hash, share ('capture' |
// 'none'), noStorage, extra (context options). Every message to the host is collected in window.__msgs
// (the page is its own parent here); shared texts in window.__shared.
async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = await browser.newContext({ ...MOBILE, viewport, ...(opts.extra || {}) });
  await context.addInitScript(({ save, key, config, share, noStorage }) => {
    window.__msgs = []; window.__shared = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    try { if (save !== null && !localStorage.getItem(key)) localStorage.setItem(key, save); } catch (e) { /* ignore */ }
    if (config) window.MJ_CONFIG = config;
    if (share === 'capture') {
      Object.defineProperty(navigator, 'share', { configurable: true, value: t => { window.__shared.push(t.text); return Promise.resolve(); } });
    } else if (share === 'clipboard') {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__shared.push(t); return Promise.resolve(); } } });
    }
    if (noStorage) {
      const boom = () => { throw new Error('storage disabled'); };
      Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom;
    }
  }, { save: opts.save === undefined ? null : opts.save, key: KEY, config: opts.config || null, share: opts.share || '', noStorage: !!opts.noStorage });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  const own = opts.httpUrl ? opts.httpUrl.split('?')[0] : URL;
  page.on('request', r => { if (r.url().split('#')[0].split('?')[0] !== own) problems.push('request: ' + r.url()); });
  if (opts.httpUrl) {   // serve the game from a fake http(s) address (with a query string) to test the link base
    await page.route(own + '**', route => route.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(FILE, 'utf8') }));
    await page.goto(opts.httpUrl + (opts.hash || ''));
  } else await page.goto(URL + (opts.hash || ''));
  await page.waitForFunction(() => !!window.__game);
  return { context, page };
}
// reload and wait for the NEW page (a marker set on the old one must be gone)
async function reload(page) {
  await page.evaluate(() => { window.__old = true; });
  await page.reload();
  await page.waitForFunction(() => !!window.__game && !window.__old);
}
const state = page => page.evaluate(() => window.__game.state());
const msgs = page => page.evaluate(() => new Promise(r => setTimeout(() => r(window.__msgs), 40)));
const events = async (page, name) => (await msgs(page)).filter(m => m.event === name);
const stored = page => page.evaluate(k => localStorage.getItem(k), KEY);
const load = (page, n) => page.evaluate(k => window.__game.loadLevel(k), n);
const play = (page, words) => page.evaluate(w => window.__game.play(w), words);

// Real taps (touchscreen) at the centre of the given tiles, then on the validate button.
async function tapWords(page, words, validate = true) {
  const pts = await page.evaluate(ws => ws.map(w => {
    const e = document.querySelector(`.tile[data-w="${w}"]`);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }), words);
  pts.forEach((p, i) => assert.ok(p, 'no tile for ' + words[i]));
  for (const [x, y] of pts) await page.touchscreen.tap(x, y);
  if (validate) await tapButton(page, '#bOk');
}
async function tapButton(page, sel) {
  const p = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  await page.touchscreen.tap(p[0], p[1]);
}
// Plays level n of the loaded game to the end with real taps: 3 families, the 4th comes by itself.
async function solveByTaps(page, n) {
  for (let f = 0; f < 3; f++) {
    await tapWords(page, fam(n, f));
    const s = await state(page);
    assert.equal(s.found.length, f < 2 ? f + 1 : 4, `level ${n}: family ${f} not found`);
    assert.equal(s.found[f].name, famName(n, f));
  }
}
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

// Layout metrics of the current screen: no page scroll, targets >= 44 px, texts not cut.
const measure = page => page.evaluate(() => {
  const de = document.documentElement, b = document.body;
  window.scrollTo(50, 50);
  const r = el => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height, id: el.id || el.className || el.textContent.slice(0, 12) }; };
  const vis = el => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const cut = [...document.querySelectorAll('.tile span,.band b,.band span,.cell,.btn,#goal,h1,h2,.sub,#msg,.stat,.total')]
    .filter(vis).filter(e => e.scrollWidth > e.clientWidth + 1 || (e.id === 'msg' && e.scrollHeight > e.clientHeight + 1))
    .map(e => (e.className || e.id || e.tagName) + ':' + e.textContent.trim().slice(0, 20) + ` ${e.scrollWidth}>${e.clientWidth}`);
  return {
    iw: window.innerWidth, ih: window.innerHeight,
    sw: Math.max(de.scrollWidth, b.scrollWidth), sh: Math.max(de.scrollHeight, b.scrollHeight),
    sx: window.scrollX, sy: window.scrollY, vv: window.visualViewport ? window.visualViewport.scale : 1,
    targets: [...document.querySelectorAll('button')].filter(vis).map(r), cut,
  };
});
function checkFit(m, tag) {
  assert.ok(m.sw <= m.iw, `${tag}: horizontal scroll (${m.sw} > ${m.iw})`);
  assert.ok(m.sh <= m.ih, `${tag}: vertical scroll (${m.sh} > ${m.ih})`);
  assert.equal(m.sx, 0, tag + ': scrolled x'); assert.equal(m.sy, 0, tag + ': scrolled y');
  assert.equal(m.vv, 1, tag + ': zoomed');
  assert.ok(m.targets.length > 0, tag + ': no target found');
  m.targets.forEach(q => {
    assert.ok(q.w >= 44 && q.h >= 44, `${tag}: target "${q.id}" is ${Math.round(q.w)}x${Math.round(q.h)}`);
    assert.ok(q.l >= -0.5 && q.t >= -0.5 && q.r <= m.iw + 0.5 && q.b <= m.ih + 0.5, `${tag}: target "${q.id}" out of screen`);
  });
  assert.deepEqual(m.cut, [], tag + ': text cut or overflowing');
}

(async () => {
  browser = await chromium.launch();
  console.log('les-familles (Qui va où)');

  // ---------------------------------------------------------------- weight, network, content
  await test('file is a single HTML under 150 KB, no external reference, no network API, embeds only the grids', async () => {
    const size = fs.statSync(FILE).size;
    assert.ok(size < 150 * 1024, `index.html is ${size} bytes`);
    const html = fs.readFileSync(FILE, 'utf8');
    assert.ok(!/(src|href)\s*=\s*["'](https?:)?\/\//i.test(html), 'external src/href found');
    assert.ok(!/url\(\s*["']?(https?:)?\/\//i.test(html), 'external css url found');
    assert.ok(!/@import|<link\b/i.test(html), 'stylesheet link/import found');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|<img\b/.test(html), 'network API or image used');
    assert.ok(/user-scalable=no/.test(html) && /viewport-fit=cover/.test(html) && /touch-action:manipulation/.test(html), 'mobile meta/touch settings');
    assert.ok(/env\(safe-area-inset-top\)/.test(html) && /prefers-reduced-motion/.test(html));
    assert.ok(!/feculent|WORDS\s*=|"tags"/.test(html), 'the word table of the verifier is inside the game');
    // the grids embedded in the game are exactly the grids of the source data
    const m = /\/\*GRIDS:BEGIN[^*]*\*\/\s*var GRIDS=([\s\S]*?);\s*\/\*GRIDS:END\*\//.exec(html);
    assert.ok(m, 'GRIDS block not found');
    assert.deepEqual(JSON.parse(m[1]), BUILD.embedded(), 'embedded grids differ from tools/les-familles/data.js (run tools/les-familles/build.js)');
    console.log(`        size: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);
  });

  await test('content: the verifier proves one single complete split per grid (relaunched here)', async () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'les-familles', 'verify.js')], { encoding: 'utf8' });
    assert.equal(r.status, 0, 'verify.js failed:\n' + r.stdout + r.stderr);
    const v = VERIFY.verify();
    assert.deepEqual(v.problems, []);
    assert.equal(DATA.GRIDS.length, 20);
    DATA.GRIDS.forEach((g, i) => {
      const a = VERIFY.analyse(g);
      assert.equal(a.solutions.length, 1, `grid ${i + 1}: ${a.solutions.length} complete splits`);
      assert.equal(new Set(a.words).size, 12);
      a.words.forEach(w => assert.ok(/^[a-zàâäçéèêëîïôöùûüÿœ]{2,9}$/.test(w), `grid ${i + 1}: "${w}" is not a short plain word`));
    });
    // honesty of the table: every word of a grid is listed with the tag of its family
    DATA.GRIDS.forEach((g, i) => g.forEach(([t, ws]) => ws.forEach(w => assert.ok(DATA.WORDS[w].includes(t), `grid ${i + 1}: ${w} lacks tag ${t}`))));
    // difficulty climbs: no trap in the first five grids, then more and more
    const traps = v.rows.map(r => r.traps.length);
    assert.deepEqual(traps.slice(0, 5), [0, 0, 0, 0, 0]);
    assert.ok(traps.slice(5).every(x => x >= 1), 'every grid from the sixth has a trap: ' + traps);
    const sum = (a, b) => traps.slice(a, b).reduce((x, y) => x + y, 0);
    assert.ok(sum(5, 10) <= sum(10, 15) && sum(10, 15) <= sum(15, 20), 'traps per block must not drop: ' + traps);
    console.log(`        traps per grid: ${traps.join(' ')}`);
  });

  await test('hooks: 20 levels, state(), loadLevel, seed, play; no family or solution is exposed', async () => {
    const { context, page } = await open();
    const info = await page.evaluate(() => ({
      levels: window.__game.levels, keys: Object.keys(window.__game), st: window.__game.state(),
    }));
    assert.equal(info.levels.length, 20);
    info.levels.forEach((l, i) => {
      assert.equal(l.n, i + 1);
      assert.deepEqual(Object.keys(l).sort(), ['n', 'words']);
      assert.deepEqual(l.words, allWords(i + 1).slice().sort());
    });
    for (const k of ['state', 'levels', 'loadLevel', 'seed', 'play']) assert.ok(info.keys.includes(k), 'no __game.' + k);
    assert.ok(!info.keys.some(k => /solution|famil|answer/i.test(k)));
    for (const k of ['screen', 'level', 'status', 'tiles', 'found', 'errors', 'selected', 'stars']) assert.ok(k in info.st, 'state() lacks ' + k);
    assert.equal(info.st.screen, 'home');
    await context.close();
  });

  // ---------------------------------------------------------------- every level is winnable, by real taps
  await test('all 20 levels are won by real taps (3 families, the fourth completes itself), stars and unlocking follow', async () => {
    const { context, page } = await open();
    for (let n = 1; n <= 20; n++) {
      const s0 = await load(page, n);
      assert.equal(s0.level, n); assert.equal(s0.screen, 'game'); assert.equal(s0.tiles.length, 12);
      assert.equal(await page.locator('.tile').count(), 12);
      // no row of three is already a family
      for (let r = 0; r < 4; r++) {
        const row = s0.order.slice(r * 3, r * 3 + 3);
        assert.ok(!DATA.GRIDS[n - 1].some(f => row.every(w => f[1].includes(w))), `level ${n}: row ${r} is a family`);
      }
      await tapWords(page, fam(n, 0).slice(0, 2), false);
      assert.equal((await state(page)).selected.length, 2);
      assert.ok(await page.locator('#bOk').isDisabled(), 'validate needs exactly 3 words');
      await tapWords(page, fam(n, 0).slice(2), true);
      let s = await state(page);
      assert.equal(s.found.length, 1); assert.equal(await page.locator('.tile').count(), 9);
      assert.equal(await page.locator('.band').count(), 1);
      assert.equal(s.errors, 0);
      await tapWords(page, fam(n, 1));
      assert.equal(await page.locator('.tile').count(), 6);
      await tapWords(page, fam(n, 2));
      s = await state(page);
      assert.equal(s.status, 'won', `level ${n} not won`);
      assert.equal(s.stars, 3);
      assert.deepEqual(s.found.map(f => f.name).sort(), [0, 1, 2, 3].map(f => famName(n, f)).sort());
      assert.deepEqual(s.found.slice(0, 3).map(f => f.name), [0, 1, 2].map(f => famName(n, f)), 'bands come in the order found');
      assert.equal(s.found.length, 4);
      assert.equal(new Set(s.found.map(f => f.color)).size, 4);
      await page.locator('#win').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#wStars svg.on').count(), 3);
      assert.equal(s.max, Math.min(20, n + 1), `level ${n} does not unlock the next one`);
      if (n === 1) await shot(page, 'win-1');
    }
    const m = await events(page, 'level_complete');
    assert.equal(m.length, 20);
    assert.deepEqual(m.map(e => e.level), Array.from({ length: 20 }, (_, i) => i + 1));
    assert.ok(m.every(e => e.score === 0 && e.stars === 3));
    const st = JSON.parse(await stored(page));
    assert.deepEqual(st.stars, new Array(20).fill(3));
    assert.equal(st.max, 20); assert.equal(st.cur, null);
    await context.close();
  });

  await test('"Suivant" opens the next level; the level grid shows locks, stars and the total', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    let s = await state(page);
    assert.equal(s.screen, 'game'); assert.equal(s.level, 1);
    await solveByTaps(page, 1);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bNext').tap();
    s = await state(page);
    assert.equal(s.level, 2); assert.equal(s.errors, 0); assert.ok(await page.locator('#win').isHidden());
    await page.locator('#bMap').tap();
    assert.equal(await page.locator('#cells [data-level]').count(), 20);
    assert.ok(await page.locator('[data-level="2"]').isEnabled());
    assert.ok(await page.locator('[data-level="3"]').isDisabled());
    assert.equal((await page.locator('#lTotal').textContent()).trim(), '3/60');
    assert.equal(await page.locator('[data-level="1"] .s svg.on').count(), 3);
    await shot(page, 'levels');
    await page.locator('[data-level="1"]').tap();                 // a finished level can be replayed
    assert.equal((await state(page)).level, 1);
    await context.close();
  });

  // ---------------------------------------------------------------- mistakes, failure
  await test('mistakes: "pas ensemble", "deux sur trois", duplicates, the fourth selection, clear, three errors then the fourth ends the game', async () => {
    const { context, page } = await open();
    await load(page, 6);
    const A = fam(6, 0), B = fam(6, 1), C = fam(6, 2), D = fam(6, 3);
    assert.match(await page.locator('#goal').textContent(), /0.*1-2.*3 erreurs/, 'the star criterion is shown before playing');
    await tapWords(page, [A[0], B[0], C[0]]);                     // one from three families
    let s = await state(page);
    assert.equal(s.errors, 1); assert.equal(s.found.length, 0);
    assert.match(s.msg, /pas ensemble/i);
    assert.equal(await page.locator('#pips svg.used').count(), 1);
    assert.equal(s.selected.length, 3, 'the selection is kept after a mistake');
    await tapButton(page, '#bOk');                                // same three again: no second penalty
    s = await state(page);
    assert.equal(s.errors, 1); assert.match(s.msg, /déjà essayé/i);
    await tapButton(page, '#bClear');
    assert.equal((await state(page)).selected.length, 0);
    assert.ok(await page.locator('#bClear').isDisabled());
    // a fourth tile cannot be selected
    await tapWords(page, [D[0], D[1], D[2]], false);
    await tapWords(page, [A[0]], false);
    s = await state(page);
    assert.equal(s.selected.length, 3); assert.ok(!s.selected.includes(A[0]));
    assert.match(s.msg, /trois mots/i);
    await tapWords(page, [D[2]], false);                          // un-select by tapping again
    assert.equal((await state(page)).selected.length, 2);
    await tapButton(page, '#bClear');
    await tapWords(page, [A[0], A[1], B[0]]);                     // two of one family
    s = await state(page);
    assert.equal(s.errors, 2); assert.match(s.msg, /deux sur trois/i);
    await shot(page, 'close');
    await tapButton(page, '#bClear');
    await tapWords(page, [A[1], B[1], C[1]]);
    s = await state(page);
    assert.equal(s.errors, 3); assert.match(s.msg, /dernière chance/i);
    assert.equal(s.status, 'play');
    await tapButton(page, '#bClear');
    await tapWords(page, [D[0], D[1], A[2]]);                     // fourth error
    s = await state(page);
    assert.equal(s.status, 'lost'); assert.equal(s.errors, 4); assert.equal(s.tiles.length, 0);
    // R2: a lost level does not give the solution away
    assert.equal(await page.locator('.band').count(), 0, 'no family is revealed');
    assert.equal(await page.locator('.tile').count(), 12);
    const app = await page.evaluate(() => document.getElementById('app').innerHTML);
    [0, 1, 2, 3].forEach(f => assert.ok(!app.includes(famName(6, f)), 'the name of a family leaks after a loss: ' + famName(6, f)));
    assert.ok(await page.locator('#bOk').isDisabled());
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#wTitle').textContent()).trim(), 'Dommage');
    assert.ok(await page.locator('#bNext').isHidden() && await page.locator('#bShare').isHidden() && await page.locator('#bChal').isHidden());
    assert.equal(await page.locator('#wStars svg.on').count(), 0);
    assert.equal((await events(page, 'level_complete')).length, 0);
    await shot(page, 'lost');
    let st = JSON.parse(await stored(page));
    assert.equal(st.cur, null); assert.equal(st.max, 1, 'a lost level unlocks nothing'); assert.equal(st.stars[5], 0);
    const oldOrder = s.order;
    assert.equal((await page.locator('#bAgain').textContent()).trim(), 'Réessayer');
    await page.locator('#bAgain').tap();                          // fresh game, another layout
    s = await state(page);
    assert.equal(s.errors, 0); assert.equal(s.status, 'play'); assert.equal(s.tiles.length, 12);
    assert.notDeepEqual(s.order, oldOrder, 'a replay mixes the tiles again');
    assert.ok(await page.locator('#win').isHidden());
    await context.close();
  });

  await test('stars: 0 errors = 3, 1-2 errors = 2, 3 errors = 1; a worse replay never lowers the best', async () => {
    const { context, page } = await open();
    const wrong = n => [[fam(n, 0)[0], fam(n, 1)[0], fam(n, 2)[0]], [fam(n, 0)[1], fam(n, 1)[1], fam(n, 2)[1]], [fam(n, 0)[2], fam(n, 1)[2], fam(n, 3)[2]]];
    const finish = async (n, errors) => {
      await load(page, n);
      for (let i = 0; i < errors; i++) assert.notEqual(await play(page, wrong(n)[i]), 'ok');
      for (let f = 0; f < 3; f++) assert.equal(await play(page, fam(n, f)), 'ok');
      return state(page);
    };
    for (const [errors, stars] of [[0, 3], [1, 2], [2, 2], [3, 1]]) {
      const s = await finish(1, errors);
      assert.equal(s.status, 'won'); assert.equal(s.errors, errors); assert.equal(s.stars, stars, `${errors} errors`);
      assert.equal(JSON.parse(await stored(page)).stars[0], 3, 'best stars are kept');
    }
    // best is kept the other way round too
    const { context: c2, page: p2 } = await open();
    for (const [errors, best] of [[3, 1], [1, 2], [2, 2], [0, 3], [3, 3]]) {
      await load(p2, 2);
      for (let i = 0; i < errors; i++) await play(p2, wrong(2)[i]);
      for (let f = 0; f < 3; f++) await play(p2, fam(2, f));
      assert.equal(JSON.parse(await stored(p2)).stars[1], best);
    }
    const ev = await events(page, 'level_complete');
    assert.deepEqual(ev.map(e => [e.score, e.stars]), [[0, 3], [1, 2], [2, 2], [3, 1]]);
    await c2.close();
    await context.close();
  });

  // ---------------------------------------------------------------- seed
  await test('seeded random: the same seed gives the same layout, another seed another one; levels differ', async () => {
    const { context, page } = await open();
    const order = async (seed, n) => page.evaluate(([sd, k]) => { window.__game.seed(sd); return window.__game.loadLevel(k).order; }, [seed, n]);
    const a = await order(5, 3), b = await order(5, 3), c = await order(6, 3), d = await order(5, 4);
    assert.deepEqual(a, b); assert.notDeepEqual(a, c); assert.notDeepEqual(a, d);
    assert.deepEqual(a.slice().sort(), allWords(3).slice().sort());
    await context.close();
  });

  // ---------------------------------------------------------------- resume, corrupted saves
  await test('reload: the game in progress is resumed identically (tiles, found families, errors, selection, tried guesses)', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: JSON.stringify({ max: 6, stars: [3, 3, 3, 3, 3], cur: null }) });
    await load(page, 6);
    await tapWords(page, fam(6, 1));                              // family found
    await tapWords(page, [fam(6, 0)[0], fam(6, 2)[0], fam(6, 3)[0]]);   // one error
    await tapButton(page, '#bClear');
    await tapWords(page, [fam(6, 0)[1], fam(6, 2)[1]], false);    // two words selected
    const before = await state(page);
    assert.equal(before.found.length, 1); assert.equal(before.errors, 1); assert.equal(before.selected.length, 2);
    await reload(page);
    assert.equal((await state(page)).screen, 'home');
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 6/);
    await page.locator('#bGo').tap();
    const after = await state(page);
    for (const k of ['level', 'status', 'tiles', 'order', 'selected', 'found', 'errors']) assert.deepEqual(after[k], before[k], 'after reload: ' + k);
    assert.equal(await page.locator('.tile.sel').count(), 2);
    assert.equal(await page.locator('#pips svg.used').count(), 1);
    await tapButton(page, '#bClear');
    await tapWords(page, [fam(6, 0)[0], fam(6, 2)[0], fam(6, 3)[0]]);   // the same wrong guess: remembered
    assert.match((await state(page)).msg, /déjà essayé/i);
    await context.close();
  });

  await test('reload after a win or a loss: nothing left to resume, "Continuer" offers the next level', async () => {
    const { context, page } = await open();
    await load(page, 1);
    await solveByTaps(page, 1);
    await reload(page);
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 2/);
    assert.equal((await page.locator('#hStars').textContent()).trim(), '3');
    await page.locator('#bGo').tap();
    const s = await state(page);
    assert.equal(s.level, 2); assert.equal(s.errors, 0); assert.equal(s.found.length, 0);
    await context.close();
  });

  await test('corrupted or absent saves: the game starts clean (level 1) and keeps working', async () => {
    const good = savedCur();
    const cases = [
      ['not json {{', 1],
      ['null', 1], ['[]', 1], ['42', 1], ['"text"', 1],
      [JSON.stringify({ max: 'x', stars: 'y', cur: { n: 99 } }), 1],
      [JSON.stringify({ max: 999, stars: [9, -1, 'a', null, 1.5], cur: 7 }), 1],
      [JSON.stringify({ max: 3, stars: new Array(20).fill(3), cur: { ...good, order: allWords(3).slice(1).concat(['mangue']) } }), 20],
      [JSON.stringify({ max: 3, stars: [3, 3], cur: { ...good, err: 7 } }), 3],
      [JSON.stringify({ max: 3, stars: [3, 3], cur: { ...good, sel: [fam(3, 2)[0]] } }), 3],      // selection inside a found family
      [JSON.stringify({ max: 3, stars: [3, 3], cur: { ...good, found: [0, 1, 2] } }), 3],
      [JSON.stringify({ max: 3, stars: [3, 3], cur: { ...good, tried: ['0-3-6'] } }), 3],
      [JSON.stringify({ max: 3, stars: [3, 3], cur: { ...good, order: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } }), 3],
      [JSON.stringify({ max: 3, stars: [3, 3], cur: { ...good, tried: [{ a: 1 }] } }), 3],
    ];
    for (const [raw, expectedNext] of cases) {
      const { context, page } = await open({ width: 360, height: 640 }, { save: raw });
      assert.equal((await page.locator('#bGo').textContent()).trim(), 'Continuer · Niveau ' + expectedNext, raw.slice(0, 50));
      await page.locator('#bGo').tap();
      const s = await state(page);
      assert.equal(s.screen, 'game'); assert.equal(s.status, 'play'); assert.equal(s.level, expectedNext);
      assert.equal(s.tiles.length, 12, 'fresh board: ' + raw.slice(0, 40));
      assert.equal(s.errors, 0); assert.equal(s.found.length, 0);
      await tapWords(page, fam(s.level, 0));
      assert.equal((await state(page)).found.length, 1);
      await context.close();
    }
    // a valid saved game is resumed
    const ok = await open({ width: 360, height: 640 }, { save: JSON.stringify({ max: 3, stars: [3, 2], cur: good }) });
    await ok.page.locator('#bGo').tap();
    const s = await state(ok.page);
    assert.equal(s.level, 3); assert.equal(s.errors, 1); assert.equal(s.found.length, 1); assert.deepEqual(s.selected, [fam(3, 0)[0]]);
    assert.equal(s.order[0], allWords(3)[11]);
    await ok.context.close();
  });

  await test('storage unavailable: the whole game still works without saving', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { noStorage: true });
    await page.locator('#bGo').tap();
    await solveByTaps(page, 1);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bNext').tap();
    assert.equal((await state(page)).level, 2);
    await context.close();
  });

  // ---------------------------------------------------------------- sharing, challenge
  await test('share: short text without solution, native share first, clipboard as fallback; events', async () => {
    let { context, page } = await open({ width: 360, height: 640 }, { share: 'capture' });
    await load(page, 4);
    await play(page, [fam(4, 0)[0], fam(4, 1)[0], fam(4, 2)[0]]);   // one error: 2 stars
    await tapButton(page, '#bClear');
    const order = [2, 0, 3];                                       // families found in this order, then the last one
    for (const f of order) await tapWords(page, fam(4, f));
    const s = await state(page);
    assert.equal(s.status, 'won'); assert.equal(s.stars, 2);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bShare').tap();
    let shared = await page.evaluate(() => window.__shared);
    assert.equal(shared.length, 1);
    assert.deepEqual(s.found.map(f => f.color), [2, 0, 3, 1]);
    const colors = s.found.map(f => SHAPES[f.color]).join(' ');
    assert.equal(new Set(colors.split(' ')).size, 4, 'four distinct shapes');
    assert.ok(!/[\u{1F7E5}-\u{1F7EB}]/u.test(shared[0]), 'no coloured squares');
    assert.equal(shared[0], `${NAME} · Niveau 4 · ⭐⭐ ${colors}`);
    assert.equal(s.found.length, 4);
    allWords(4).forEach(w => assert.ok(!shared[0].includes(w), 'the shared text leaks ' + w));
    [0, 1, 2, 3].forEach(f => assert.ok(!shared[0].includes(famName(4, f)), 'the shared text names a family'));
    assert.ok(shared[0].length < 60);
    assert.deepEqual((await events(page, 'share')).map(e => e.kind), ['result']);
    await context.close();

    ({ context, page } = await open({ width: 360, height: 640 }, { share: 'clipboard' }));
    await load(page, 1);
    await solveByTaps(page, 1);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bShare').tap();
    await page.waitForFunction(() => window.__shared.length === 1);
    assert.match((await page.evaluate(() => window.__shared))[0], /^Qui va où · Niveau 1 · ⭐⭐⭐ /);
    assert.match(await page.locator('#bShare').textContent(), /Copié/);
    assert.deepEqual((await events(page, 'share')).map(e => e.kind), ['result']);
    await context.close();
  });

  await test('"Défier un ami": link #defi-<level>-<errors> on shareBaseUrl, current http(s) address, or no link', async () => {
    const run = async (opts, hash) => {
      const { context, page } = await open({ width: 360, height: 640 }, { share: 'capture', ...opts });
      await load(page, 4);
      await play(page, [fam(4, 0)[0], fam(4, 1)[0], fam(4, 2)[0]]);
      for (let f = 0; f < 3; f++) await play(page, fam(4, f));
      await page.locator('#win').waitFor({ state: 'visible' });
      await page.locator('#bChal').tap();
      const t = (await page.evaluate(() => window.__shared))[0];
      const ev = await events(page, 'share');
      await context.close();
      return { t, ev };
    };
    let r = await run({ config: { shareBaseUrl: 'https://jeux.example.org/les-familles/' } });
    assert.match(r.t, /^Qui va où · Niveau 4 en 1 erreur\. Fais aussi bien, ou mieux ! https:\/\/jeux\.example\.org\/les-familles\/#defi-4-1$/);
    assert.match(r.t.split('#')[1], /^defi-[A-Za-z0-9-]+$/);
    assert.deepEqual(r.ev.map(e => e.kind), ['challenge']);
    allWords(4).forEach(w => assert.ok(!r.t.includes(w)));
    r = await run({});                                            // file:// -> no link at all
    assert.ok(!/https?:|#defi/.test(r.t), 'no link expected: ' + r.t);
    assert.match(r.t, /Niveau 4 en 1 erreur/);
  });

  await test('challenge: opens even a locked level with one goal, equal is enough, lost or missed is reported, progress untouched', async () => {
    // locked level 7, fresh save: nothing is written, not even by playing and winning
    let { context, page } = await open({ width: 360, height: 640 }, { hash: '#defi-7-1' });
    let s = await state(page);
    assert.equal(s.screen, 'game'); assert.equal(s.level, 7); assert.deepEqual(s.challenge, { target: 1 }); assert.equal(s.mode, 'chal');
    assert.equal((await page.evaluate(() => location.hash)), '', 'the fragment is consumed');
    assert.equal((await page.locator('#goal').textContent()).trim(), 'Défi : 1 erreur au plus');
    assert.equal(await page.locator('#goal svg').count(), 0, 'only the challenge goal is on screen (no star legend)');
    assert.equal(await stored(page), null);
    assert.deepEqual((await events(page, 'challenge_open')).map(e => [e.level, e.target]), [[7, 1]]);
    await shot(page, 'challenge');
    await play(page, [fam(7, 0)[0], fam(7, 1)[0], fam(7, 2)[0]]);       // 1 error = the goal: equal is enough
    await tapButton(page, '#bClear');
    for (let f = 0; f < 3; f++) await tapWords(page, fam(7, f));
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#wTitle').textContent()).trim(), 'Défi relevé !');
    // R3: no retry; only "Renvoyer le défi" (met) and "Accueil"
    assert.ok(await page.locator('#bNext').isHidden() && await page.locator('#bShare').isHidden() && await page.locator('#bAgain').isHidden());
    assert.equal((await page.locator('#bChal').textContent()).trim(), 'Renvoyer le défi');
    assert.equal((await page.locator('#bBack').textContent()).trim(), 'Accueil');
    assert.equal(await page.locator('#bRestart').count(), 0);
    assert.equal(await stored(page), null, 'a challenge never writes the save');
    assert.deepEqual((await events(page, 'challenge_result')).map(e => [e.level, e.score, e.target, e.won]), [[7, 1, 1, true]]);
    assert.equal((await events(page, 'level_complete')).length, 0);
    await shot(page, 'challenge-won');
    // opening the link again is a new opening: missed (2 errors for a goal of 1), then lost (4 errors)
    const reopen = async hash => {
      await page.locator('#bBack').tap();
      await page.evaluate(h => { location.hash = h; }, hash);
      await page.waitForFunction(() => window.__game.state().mode === 'chal' && window.__game.state().errors === 0);
    };
    await reopen('#defi-7-1');
    await play(page, [fam(7, 0)[0], fam(7, 1)[0], fam(7, 2)[0]]);
    await play(page, [fam(7, 0)[1], fam(7, 1)[1], fam(7, 2)[1]]);
    for (let f = 0; f < 3; f++) await play(page, fam(7, f));
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#wTitle').textContent()).trim(), 'Défi manqué');
    assert.ok(await page.locator('#bChal').isHidden() && await page.locator('#bAgain').isHidden() && await page.locator('#bShare').isHidden(), 'a missed challenge cannot be retried or resent');
    await reopen('#defi-7-1');
    for (let i = 0; i < 3; i++) await play(page, [fam(7, 0)[i], fam(7, 1)[i], fam(7, 2)[i]]);
    await play(page, [fam(7, 0)[0], fam(7, 0)[1], fam(7, 1)[2]]);
    assert.equal((await state(page)).status, 'lost');
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#bAgain').isHidden() && await page.locator('#bChal').isHidden());
    const res = (await events(page, 'challenge_result')).map(e => [e.score, e.won]);
    assert.deepEqual(res, [[1, true], [2, false], [4, false]], 'one challenge_result per opening');
    assert.equal(await stored(page), null);
    await page.locator('#bBack').tap();                                 // "Accueil"
    assert.equal((await state(page)).screen, 'home');
    await context.close();

    // a game in progress and the progress of the player are left byte for byte as they were
    const cur = savedCur();
    const raw = JSON.stringify({ max: 3, stars: [3, 2], cur });
    ({ context, page } = await open({ width: 360, height: 640 }, { save: raw, hash: '#defi-9-0' }));
    s = await state(page);
    assert.equal(s.level, 9); assert.equal(s.mode, 'chal');
    assert.equal(await stored(page), raw, 'opening a challenge changed the save');
    assert.equal((await page.locator('#goal').textContent()).trim(), 'Défi : aucune erreur');
    await play(page, [fam(9, 0)[0], fam(9, 1)[0], fam(9, 2)[0]]);
    for (let f = 0; f < 3; f++) await play(page, fam(9, f));
    await page.locator('#win').waitFor({ state: 'visible' });
    assert.equal(await stored(page), raw, 'playing a challenge changed the save');
    await page.locator('#bBack').tap();
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 3/);
    await page.locator('#bGo').tap();
    s = await state(page);
    assert.equal(s.level, 3); assert.equal(s.errors, 1); assert.equal(s.found.length, 1); assert.equal(s.mode, 'level');
    assert.deepEqual(s.selected, [fam(3, 0)[0]]);
    // a challenge reached by a link while playing (hashchange) works too
    await page.evaluate(() => { location.hash = '#defi-12-2'; });
    await page.waitForFunction(() => window.__game.state().mode === 'chal');
    s = await state(page);
    assert.equal(s.level, 12); assert.deepEqual(s.challenge, { target: 2 });
    assert.equal(await stored(page), raw);
    await context.close();
  });

  await test('challenge: malformed fragments are ignored without error', async () => {
    const bad = ['#defi-0-1', '#defi-21-1', '#defi-7', '#defi-7-', '#defi-7-9', '#defi-7-10', '#defi-x-y', '#defi--1-1', '#defi-7-1-1',
      '#defi-007-1', '#defi-7-1x', '#defi', '#defi-', '#defi-7-%20', '#defi-1e1-2', '#defi-9999999999-1', '#defi-<b>-1', '#defi-7-1;alert(1)'];
    for (const hash of bad) {
      const { context, page } = await open({ width: 360, height: 640 }, { hash });
      const s = await state(page);
      assert.equal(s.screen, 'home', hash + ' should be ignored');
      assert.equal(s.mode, '', hash);
      assert.equal((await events(page, 'challenge_open')).length, 0, hash);
      assert.equal(await stored(page), null, hash);
      await page.locator('#bGo').tap();                             // the game still starts normally
      assert.equal((await state(page)).level, 1);
      await context.close();
    }
  });

  await test('events: only the four listed ones, exact fields, source and game name', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: 'capture', config: { shareBaseUrl: 'https://x.example/' } });
    await load(page, 2);
    for (let f = 0; f < 3; f++) await play(page, fam(2, f));
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bShare').tap(); await page.locator('#bChal').tap();
    await page.evaluate(() => { location.hash = '#defi-5-2'; });
    await page.waitForFunction(() => window.__game.state().mode === 'chal');
    for (let f = 0; f < 3; f++) await play(page, fam(5, f));
    const all = await msgs(page);
    assert.deepEqual(all.map(e => e.event), ['level_complete', 'share', 'share', 'challenge_open', 'challenge_result']);
    const keys = e => Object.keys(e).sort().join();
    assert.equal(keys(all[0]), 'event,game,level,score,source,stars');
    assert.equal(keys(all[1]), 'event,game,kind,source'); assert.equal(keys(all[2]), 'event,game,kind,source');
    assert.equal(keys(all[3]), 'event,game,level,source,target');
    assert.equal(keys(all[4]), 'event,game,level,score,source,target,won');
    all.forEach(e => { assert.equal(e.source, 'mini-jeu'); assert.equal(e.game, 'les-familles'); });
    assert.deepEqual(all[4], { source: 'mini-jeu', game: 'les-familles', event: 'challenge_result', level: 5, score: 0, target: 2, won: true });
    await context.close();
  });

  await test('reduced motion: no animation is left running and the game plays normally', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    await load(page, 1);
    await tapWords(page, fam(1, 0));
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.band')).animationName);
    assert.equal(anim, 'none');
    await context.close();
  });

  // ---------------------------------------------------------------- review decisions (R1-R9)
  await test('R1: no restart during a game; leaving and coming back keeps the game and its errors', async () => {
    const { context, page } = await open();
    assert.equal(await page.locator('#bRestart').count(), 0);
    assert.ok(!/Recommencer/.test(await page.evaluate(() => document.body.innerText)), 'no "Recommencer" anywhere');
    await load(page, 1);
    await tapWords(page, [fam(1, 0)[0], fam(1, 1)[0], fam(1, 2)[0]]);
    await tapButton(page, '#bClear');
    await tapWords(page, fam(1, 3));
    const before = await state(page);
    assert.equal(before.errors, 1);
    await page.locator('#bMap').tap();                              // levels, then the same level again
    await page.locator('[data-level="1"]').tap();
    let s = await state(page);
    assert.equal(s.errors, 1); assert.deepEqual(s.order, before.order); assert.equal(s.found.length, 1);
    await page.locator('#bMap').tap();
    await page.locator('#bLBack').tap();                            // home, then "Continuer"
    assert.match(await page.locator('#bGo').textContent(), /Niveau 1$/, 'level 1 is the first unfinished one');
    await context.close();
  });

  await test('R4: the shared link is origin + pathname + #defi-..., never the query string of the address', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: 'capture', httpUrl: 'https://jeux.test/les-familles/index.html?token=SECRET123&n=42' });
    await load(page, 4);
    for (let f = 0; f < 3; f++) await play(page, fam(4, f));
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bChal').tap();
    const t = (await page.evaluate(() => window.__shared))[0];
    assert.match(t, / https:\/\/jeux\.test\/les-familles\/index\.html#defi-4-0$/);
    assert.ok(!/SECRET|token|\?|n=42/.test(t), 'the query string leaked: ' + t);
    await page.locator('#bShare').tap();
    assert.ok(!/SECRET|token|https?:/.test((await page.evaluate(() => window.__shared))[1]), 'the result text carries no address');
    await context.close();
  });

  await test('R5: nothing readable by a player tells the families (DOM, attributes, storage, texts)', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: 'capture' });
    for (let n = 1; n <= 20; n++) {
      await load(page, n);
      const dom = await page.evaluate(() => ({
        app: document.getElementById('app').innerHTML,
        tiles: [...document.querySelectorAll('.tile')].map(e => ({ attrs: [...e.attributes].map(a => a.name), i: e.getAttribute('data-i'), w: e.getAttribute('data-w') })),
        ids: [...document.querySelectorAll('[id]')].map(e => e.id),
      }));
      dom.tiles.forEach((t, k) => {
        assert.deepEqual(t.attrs.sort(), ['aria-pressed', 'class', 'data-i', 'data-w'], `level ${n}: unexpected tile attributes`);
        assert.equal(t.i, String(k), `level ${n}: data-i must only be the place of the tile`);
      });
      // the place says nothing: across levels, the first three tiles are not systematically one family
      [0, 1, 2, 3].forEach(f => assert.ok(!dom.app.includes(famName(n, f)), `level ${n}: family name in the DOM`));
      const ord = dom.tiles.map(t => t.w);
      assert.deepEqual(ord, (await state(page)).order, 'DOM order is the shuffled order');
      const cur = JSON.parse(await stored(page)).cur;
      assert.deepEqual(cur.order, ord, 'the save keeps words in the shuffled order, no numbers');
      assert.ok(cur.order.every(x => typeof x === 'string') && !('families' in cur));
    }
    // a lost, a won game and the texts: no family name
    await load(page, 12);
    for (let f = 0; f < 3; f++) await play(page, fam(12, f));
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bShare').tap(); await page.locator('#bChal').tap();
    (await page.evaluate(() => window.__shared)).forEach(t => [0, 1, 2, 3].forEach(f => assert.ok(!t.includes(famName(12, f)))));
    await context.close();
  });

  await test('R6: "Continuer" points to the first unfinished level; replaying an old level does not move it', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    await solveByTaps(page, 1);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bNext').tap();
    await solveByTaps(page, 2);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bBack').tap();
    assert.equal((await state(page)).max, 3);
    await page.locator('[data-level="1"]').tap();                   // replay level 1, one mistake, leave
    await tapWords(page, [fam(1, 0)[0], fam(1, 1)[0], fam(1, 2)[0]]);
    await page.locator('#bMap').tap();
    await page.locator('#bLBack').tap();
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 3/);
    await reload(page);
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 3/);
    await page.locator('#bGo').tap();
    assert.equal((await state(page)).level, 3);
    await context.close();
  });

  await test('R7/R8: own palette (warm hues, no yellow/green/blue/violet), distinct shapes, no "presque", no emoji squares', async () => {
    const html = fs.readFileSync(FILE, 'utf8');
    const cols = [0, 1, 2, 3].map(i => new RegExp('--c' + i + ':(#[0-9A-Fa-f]{6})').exec(html)[1]);
    cols.forEach(c => {
      const [r, g, b] = [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16) / 255);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
      assert.ok(h <= 45 || h >= 320, `${c} has hue ${Math.round(h)}: only warm hues allowed`);
    });
    assert.equal(new Set(cols).size, 4);
    assert.ok(!/presque/i.test(html) && /Deux sur trois/.test(html));
    assert.ok(!/[\u{1F7E5}-\u{1F7EB}]/u.test(html), 'coloured emoji squares in the file');
    assert.ok(!/À toi de faire mieux/.test(html));
    const { context, page } = await open();
    await load(page, 1);
    const shapes = await page.evaluate(() => { for (let f = 0; f < 3; f++) { /* no solution here: just count the symbols of the bands later */ } return 0; });
    for (let f = 0; f < 3; f++) await play(page, fam(1, f));
    const paths = await page.evaluate(() => [...document.querySelectorAll('.band svg path')].map(p => p.getAttribute('d')));
    assert.equal(paths.length, 4); assert.equal(new Set(paths).size, 4, 'each family has its own shape');
    await context.close();
  });

  await test('R9: no family reused as a whole, at most one word in common between two grids, no unused word in the table', async () => {
    for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) {
      const common = allWords(i + 1).filter(w => allWords(j + 1).includes(w));
      assert.ok(common.length <= 1, `grids ${i + 1} and ${j + 1} share ${common}`);
    }
    const used = new Set(DATA.GRIDS.flatMap(g => g.flatMap(f => f[1])));
    assert.deepEqual(Object.keys(DATA.WORDS).filter(w => !used.has(w)), []);
    // the three grids flagged by the review no longer have another legitimate split
    for (const n of [9, 10, 12]) assert.equal(VERIFY.analyse(DATA.GRIDS[n - 1]).solutions.length, 1);
  });

  // ---------------------------------------------------------------- layout
  const VIEWPORTS = [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 430, height: 932 }];
  // the heaviest grid: longest words and longest family names
  const heavy = DATA.GRIDS.map((g, i) => ({ n: i + 1, w: g.reduce((s, [t, ws]) => s + DATA.TAGS[t].length + ws.reduce((a, b) => a + b.length, 0), 0) })).sort((a, b) => b.w - a.w)[0].n;
  await test(`layout: every screen at 320x568, 360x640, 430x932 (no scroll, targets >= 44 px, no cut text), heaviest grid is ${heavy}`, async () => {
    for (const vp of VIEWPORTS) {
      const t = `${vp.width}x${vp.height}`;
      const { context, page } = await open(vp, { share: 'capture' });
      checkFit(await measure(page), t + ' home');
      await shot(page, 'home-' + t);
      await page.locator('#bLevels').tap();
      checkFit(await measure(page), t + ' levels');
      await shot(page, 'levels-' + t);
      await load(page, heavy);
      checkFit(await measure(page), t + ' game heavy fresh');
      await shot(page, 'game-' + t);
      await tapWords(page, fam(heavy, 0).slice(0, 2), false);
      await tapWords(page, fam(heavy, 1).slice(0, 1), false);
      checkFit(await measure(page), t + ' game heavy 3 selected');
      await tapButton(page, '#bOk');                                // a mistake: message + pip
      checkFit(await measure(page), t + ' game heavy after mistake');
      await tapButton(page, '#bClear');
      await tapWords(page, fam(heavy, 0)); await tapWords(page, fam(heavy, 1)); await tapWords(page, fam(heavy, 2).slice(0, 2), false);
      checkFit(await measure(page), t + ' game heavy 2 families found, 2 selected');
      await shot(page, 'game-bands-' + t);
      await tapWords(page, fam(heavy, 2).slice(2), true);
      await page.locator('#win').waitFor({ state: 'visible' });
      checkFit(await measure(page), t + ' win');
      await shot(page, 'win-' + t);
      await load(page, heavy);
      for (let i = 0; i < 3; i++) await play(page, [fam(heavy, 0)[i], fam(heavy, 1)[i], fam(heavy, 2)[i]]);
      await play(page, [fam(heavy, 0)[0], fam(heavy, 0)[1], fam(heavy, 3)[0]]);
      await page.locator('#win').waitFor({ state: 'visible' });
      checkFit(await measure(page), t + ' lost');
      await shot(page, 'lost-' + t);
      await context.close();
      const c = await open(vp, { hash: '#defi-' + heavy + '-0' });
      checkFit(await measure(c.page), t + ' challenge');
      await play(c.page, fam(heavy, 0));
      checkFit(await measure(c.page), t + ' challenge, one band');
      for (let f = 1; f < 3; f++) await play(c.page, fam(heavy, f));
      await c.page.locator('#win').waitFor({ state: 'visible' });
      checkFit(await measure(c.page), t + ' challenge result');
      await c.context.close();
    }
  });

  await test('layout: the words and family names of all 20 grids fit at 320x568 and 360x640, fresh and with bands', async () => {
    for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
      const { context, page } = await open(vp);
      for (let n = 1; n <= 20; n++) {
        await load(page, n);
        checkFit(await measure(page), `${vp.width}: level ${n} fresh`);
        for (let f = 0; f < 3; f++) await play(page, fam(n, f));
        await page.waitForTimeout(0);
        checkFit(await measure(page), `${vp.width}: level ${n} complete`);
      }
      await context.close();
    }
  });

  // ---------------------------------------------------------------- hygiene
  await test('no console error, no page error, no network request in the whole run', async () => {
    assert.deepEqual(problems, []);
  });

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);
  process.exit(failed ? 1 : 0);
})();
