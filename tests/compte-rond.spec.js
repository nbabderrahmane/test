'use strict';
/*
 * Mobile acceptance tests for games/compte-rond (plain node + playwright + node:assert).
 * Run with: node tests/compte-rond.spec.js     (SHOTS=<dir> also writes screenshots)
 * Levels and reference solutions live in tools/compte-rond/ (the game never embeds the solutions).
 * The minimal number of operations is recomputed here by an independent exhaustive search.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const FILE = process.env.GAME_FILE || path.join(__dirname, '..', 'games', 'compte-rond', 'index.html');
const URL = pathToFileURL(FILE).href;
const KEY = 'mj:compte-rond:v1';
const GAME = 'compte-rond';
const NAME = 'Chiffrons';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const LV = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'compte-rond', 'levels.json'), 'utf8')).levels;
const SOL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'compte-rond', 'solutions.json'), 'utf8')).levels;
const OPI = { '+': 0, '-': 1, 'x': 2, '/': 3 };
const VIEWPORTS = [[320, 568], [360, 640], [430, 932]];

let browser;
const problems = [];   // console errors, page errors, unexpected requests (all pages)
const results = [];
const allowedUrls = new Set([URL]);

// Opens the game. opts.rawSave seeds localStorage once (a reload keeps what the game stored);
// opts.config sets window.MJ_CONFIG; opts.hash opens a link; opts.share captures navigator.share calls;
// opts.noStorage makes localStorage throw. Messages to the host are collected in window.__msgs.
async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = opts.context || await browser.newContext({ ...MOBILE, viewport });
  if (!opts.context) {
    await context.addInitScript(({ raw, key, config, share, noStorage }) => {
      window.__msgs = []; window.__shared = [];
      window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
      if (noStorage) {
        Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
      } else {
        // the starting save is written only on the very first navigation of the tab (flag in sessionStorage), never after a reload
        try {
          if (raw !== null && !sessionStorage.getItem('__seeded')) {
            sessionStorage.setItem('__seeded', '1');
            if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
          }
        } catch (e) { /* ignore */ }
      }
      if (config) window.MJ_CONFIG = config;
      if (share) navigator.share = d => { window.__shared.push(d.text); return Promise.resolve(); };
    }, { raw: opts.rawSave === undefined ? null : opts.rawSave, key: KEY, config: opts.config || null, share: !!opts.share, noStorage: !!opts.noStorage });
  }
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('request', r => { if (!allowedUrls.has(r.url().split('#')[0]) && !r.url().startsWith('data:')) problems.push('request: ' + r.url()); });
  await page.goto((opts.url || URL) + (opts.hash || ''));
  await page.waitForFunction(() => !!window.__game);
  return { context, page };
}
// a short pause lets the storage settle before a reload (Chromium on file:// can lag)
const reload = async page => { await page.waitForTimeout(150); await page.reload(); };
const state = page => page.evaluate(() => window.__game.state());
const msgs = page => page.evaluate(() => new Promise(r => setTimeout(() => r(window.__msgs), 60)));
const events = async (page, name) => (await msgs(page)).filter(m => m.event === name);
const stored = page => page.evaluate(k => localStorage.getItem(k), KEY);
const text = (page, sel) => page.locator(sel).innerText();
const winVisible = page => page.waitForSelector('#win:not([hidden])', { timeout: 4000 });

// Real taps. Tiles move around (empty slots go last), so their centre is read just before each tap.
async function tapAt(page, x, y) { await page.touchscreen.tap(x, y); }
async function tapSel(page, sel) {
  const b = await page.locator(sel).boundingBox();
  assert.ok(b, 'not visible: ' + sel);
  await tapAt(page, b.x + b.width / 2, b.y + b.height / 2);
}
async function tapValue(page, v, skipSlot = -1) {
  const c = await page.evaluate(([val, skip]) => {
    const t = [...document.querySelectorAll('#tiles .tile')].find(e => e.dataset.value === String(val) && +e.dataset.slot !== skip);
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, slot: +t.dataset.slot };
  }, [v, skipSlot]);
  assert.ok(c, 'no tile with value ' + v);
  await tapAt(page, c.x, c.y);
  return c.slot;
}
const tapOp = (page, op) => tapSel(page, `#ops [data-op="${OPI[op]}"]`);
async function tapStep(page, [a, op, b]) {
  const slot = await tapValue(page, a);
  await tapOp(page, op);
  await tapValue(page, b, slot);
}
async function playSteps(page, steps) { for (const s of steps) await tapStep(page, s); }

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

// ---- independent model of the rules (the test does not use tools/compte-rond/solver.js) ----
function results2(a, b) {   // every legal result of combining a and b, with the operation used
  const r = [[a + b, '+'], [a * b, 'x']];
  if (a !== b) r.push([Math.abs(a - b), '-']);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (hi % lo === 0) r.push([hi / lo, '/']);
  return r;
}
// Minimal number of operations to obtain `target` (exhaustive, layer by layer, memoised); Infinity if > maxOps.
function minOps(nums, target, maxOps) {
  if (nums.includes(target)) return 0;
  let layer = [nums.slice().sort((x, y) => x - y)];
  for (let d = 1; d <= maxOps; d++) {
    const seen = new Set(), next = [];
    for (const s of layer) {
      for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
        const rest = s.filter((_, k) => k !== i && k !== j);
        for (const [r] of results2(s[i], s[j])) {
          if (r === target) return d;
          const n = rest.concat([r]).sort((x, y) => x - y), k = n.join(',');
          if (!seen.has(k)) { seen.add(k); next.push(n); }
        }
      }
    }
    layer = next;
  }
  return Infinity;
}
// Checks a reference solution step by step on the start numbers.
function checkSolution(nums, target, steps) {
  const pool = nums.slice();
  for (const [a, op, b, r] of steps) {
    const ia = pool.indexOf(a); assert.ok(ia >= 0, `${a} not available`); pool.splice(ia, 1);
    const ib = pool.indexOf(b); assert.ok(ib >= 0, `${b} not available`); pool.splice(ib, 1);
    let v;
    if (op === '+') v = a + b; else if (op === 'x') v = a * b;
    else if (op === '-') { v = a - b; assert.ok(v > 0, `${a}-${b} not positive`); }
    else { assert.ok(b !== 0 && a % b === 0, `${a}/${b} not exact`); v = a / b; }
    assert.equal(v, r, `wrong result in ${a}${op}${b}`);
    pool.push(v);
  }
  assert.ok(pool.includes(target), 'target not reached');
}
// DFS finding a path of exactly `len` operations (steps as [a, op, b]) whose last state satisfies goal(values).
function findPath(nums, len, goal, limit = 3e6, stop = null) {
  let visits = 0;
  function dfs(s, left, path) {
    if (++visits > limit) return null;
    if (left === 0) return goal(s) ? path : null;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const rest = s.filter((_, k) => k !== i && k !== j);
      const hi = Math.max(s[i], s[j]), lo = Math.min(s[i], s[j]);
      for (const [r, op] of results2(s[i], s[j])) {
        if (stop !== null && r === stop && left > 1) continue;   // the game would end before the last step
        const p = dfs(rest.concat([r]), left - 1, path.concat([[op === '-' || op === '/' ? hi : s[i], op, op === '-' || op === '/' ? lo : s[j]]]));
        if (p) return p;
      }
    }
    return null;
  }
  return dfs(nums.slice(), len, []);
}

// ---- layout helpers ------------------------------------------------------------------
const measure = page => page.evaluate(() => {
  const de = document.documentElement, b = document.body;
  window.scrollTo(50, 50);
  const vis = el => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'); };
  const box = el => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height, id: el.id || el.className || el.tagName }; };
  const inOverlay = el => !!el.closest('#win');
  const winOpen = !document.getElementById('win').hidden;
  const homeOpen = !document.getElementById('home').hidden, lvOpen = !document.getElementById('levels').hidden;
  const root = lvOpen ? '#levels' : homeOpen ? '#home' : winOpen ? '#win' : '#app';
  const scope = [...document.querySelectorAll(root + ' button')].filter(vis);
  const hist = document.getElementById('hist'), msg = document.getElementById('msg');
  const tiles = [...document.querySelectorAll('#tiles .tile')].filter(vis);
  return {
    iw: window.innerWidth, ih: window.innerHeight,
    sw: Math.max(de.scrollWidth, b.scrollWidth), sh: Math.max(de.scrollHeight, b.scrollHeight),
    sx: window.scrollX, sy: window.scrollY,
    vv: window.visualViewport ? window.visualViewport.scale : 1,
    targets: scope.map(box),
    texts: [...document.querySelectorAll(root + ' .gc, ' + root + ' .ring, ' + root + ' #chal, ' + root + ' .card, ' + root + ' h1, ' + root + ' .sub')].filter(vis).map(box),
    histClipped: vis(hist) && (hist.scrollHeight > hist.clientHeight + 1 || [...hist.querySelectorAll('li')].some(li => li.scrollWidth > li.clientWidth + 1)),
    msgClipped: vis(msg) && (msg.scrollHeight > msg.clientHeight + 1 || msg.scrollWidth > msg.clientWidth + 1),
    tileClipped: tiles.filter(t => t.scrollWidth > t.clientWidth + 1).map(t => t.textContent),
    root, winOpen,
  };
});
function checkFit(m, tag) {
  assert.ok(m.sw <= m.iw, `${tag}: horizontal scroll (${m.sw} > ${m.iw})`);
  assert.ok(m.sh <= m.ih, `${tag}: vertical scroll (${m.sh} > ${m.ih})`);
  assert.equal(m.sx, 0, tag + ': scrolled x'); assert.equal(m.sy, 0, tag + ': scrolled y');
  assert.equal(m.vv, 1, tag + ': zoomed');
  assert.ok(m.targets.length > 0, tag + ': no button found');
  for (const t of m.targets) {
    assert.ok(t.w >= 44 && t.h >= 44, `${tag}: target too small ${t.id} ${Math.round(t.w)}x${Math.round(t.h)}`);
    assert.ok(t.l >= -0.5 && t.r <= m.iw + 0.5 && t.t >= -0.5 && t.b <= m.ih + 0.5, `${tag}: target outside the screen ${t.id}`);
  }
  for (const t of m.texts) assert.ok(t.l >= -0.5 && t.r <= m.iw + 0.5 && t.t >= -0.5 && t.b <= m.ih + 0.5, `${tag}: block outside the screen ${t.id}`);
  assert.ok(!m.histClipped, tag + ': history is clipped');
  assert.ok(!m.msgClipped, tag + ': message is clipped');
  assert.deepEqual(m.tileClipped, [], tag + ': tile text is clipped');
}
const allStars = n => JSON.stringify({ level: 20, max: 20, stars: new Array(20).fill(n), cur: null });

(async () => {
  browser = await chromium.launch();
  const t0 = Date.now();
  console.log('compte-rond: acceptance tests');

  // ---------------------------------------------------------------- the levels themselves
  await test('levels: 20 fixed levels, minimal operations recomputed independently, reference solutions valid', async () => {
    assert.equal(LV.length, 20); assert.equal(SOL.length, 20);
    LV.forEach((L, i) => {
      const tag = 'level ' + (i + 1);
      assert.equal(L.numbers.length, 6, tag);
      assert.ok(L.numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 100), tag + ': number range');
      assert.ok(Number.isInteger(L.target) && L.target >= 2 && L.target <= 999, tag + ': target range');
      assert.ok(L.numbers.every(n => Math.abs(n - L.target) > 5), tag + ': a start number is already within 5 of the target');
      const min = minOps(L.numbers, L.target, L.par);
      assert.equal(min, L.par, `${tag}: independent minimum ${min} != par ${L.par}`);   // nothing shorter, and par reachable
      assert.equal(SOL[i].length, L.par, tag + ': reference solution length');
      checkSolution(L.numbers, L.target, SOL[i]);
    });
  });

  await test('levels: difficulty grows (operations, size of numbers, fewer solutions), easy start with additions', async () => {
    const avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
    const blocks = [LV.slice(0, 5), LV.slice(5, 10), LV.slice(10, 15), LV.slice(15, 20)];
    const par = blocks.map(b => avg(b, L => L.par)), big = blocks.map(b => avg(b, L => Math.max(...L.numbers))), tgt = blocks.map(b => avg(b, L => L.target));
    const sol = blocks.map(b => avg(b, L => L.solutions));
    for (let i = 1; i < 4; i++) {
      assert.ok(par[i] > par[i - 1], 'average operations rise: ' + par);
      assert.ok(big[i] >= big[i - 1], 'largest numbers do not shrink: ' + big);
      assert.ok(tgt[i] > tgt[i - 1], 'targets rise: ' + tgt);
      assert.ok(sol[i] < sol[i - 1], 'number of solutions falls: ' + sol);
    }
    assert.equal(Math.min(...LV.map(L => L.par)), 2); assert.equal(Math.max(...LV.map(L => L.par)), 5);
    assert.ok(LV.slice(0, 2).every(L => L.par === 2), 'levels 1-2 need two operations');
    for (let i = 0; i < 4; i++) {
      assert.ok(LV[i].numbers.every(n => n <= 9) && LV[i].target <= 36, 'level ' + (i + 1) + ': small numbers');
      assert.ok(SOL[i].every(s => s[1] === '+'), 'level ' + (i + 1) + ': solved by additions');
    }
    assert.ok(LV.some((L, i) => i > 0 && L.par < LV[i - 1].par), 'breathing levels exist');
  });

  // ---------------------------------------------------------------- full run with real taps
  await test('20 levels won by real taps from the home screen, three stars each, stars saved, next levels unlock', async () => {
    const { context, page } = await open();
    const g = await page.evaluate(() => window.__game.levels);
    assert.equal(g.length, 20);
    g.forEach((l, i) => { assert.deepEqual(l.numbers, LV[i].numbers); assert.equal(l.target, LV[i].target); assert.equal(l.par, LV[i].par); });
    assert.equal((await state(page)).screen, 'home');
    assert.equal(await text(page, '#bGo'), 'Continuer · Niveau 1');
    await shot(page, 'home');
    await tapSel(page, '#bGo');                      // one tap from the home screen to play
    for (let n = 1; n <= 20; n++) {
      let s = await state(page);
      assert.equal(s.screen, 'game'); assert.equal(s.level, n); assert.equal(s.target, LV[n - 1].target);
      assert.deepEqual(s.numbers, LV[n - 1].numbers);
      await playSteps(page, SOL[n - 1]);
      await winVisible(page);
      s = await state(page);
      assert.ok(s.won, 'level ' + n + ' won'); assert.equal(s.stars, 3, 'level ' + n + ' stars'); assert.equal(s.ops, LV[n - 1].par);
      assert.ok(s.numbers.includes(s.target));
      if (n === 1) await shot(page, 'result');
      if (n < 20) { assert.equal(await text(page, '#bNext'), 'Suivant'); await tapSel(page, '#bNext'); }
    }
    assert.equal(await text(page, '#bNext'), 'Niveaux');
    await tapSel(page, '#bNext');
    let s = await state(page);
    assert.equal(s.screen, 'levels'); assert.equal(s.total, 60);
    assert.equal(await text(page, '#gTotal'), '60/60');
    const save = JSON.parse(await stored(page));
    assert.deepEqual(save.stars, new Array(20).fill(3));
    await tapSel(page, '#bGBack');
    assert.match(await text(page, '#hStarsN'), /60 \/ 60/);
    await context.close();
  });

  // ---------------------------------------------------------------- rules: refused moves
  await test('forbidden moves are refused with a clear message (negative, zero, inexact division), board unchanged', async () => {
    const { context, page } = await open();
    await tapSel(page, '#bGo');
    const before = await state(page);   // level 1: 1 3 4 5 8 9
    await tapValue(page, 3); await tapOp(page, '-'); await tapValue(page, 9);
    assert.match(await text(page, '#msg'), /3 − 9 donnerait un nombre négatif/);
    let s = await state(page);
    assert.deepEqual(s.numbers, before.numbers); assert.equal(s.ops, 0); assert.deepEqual(s.selected, { a: -1, op: -1 });
    await tapValue(page, 8); await tapOp(page, '/'); await tapValue(page, 3);
    assert.match(await text(page, '#msg'), /8 ÷ 3 ne tombe pas juste/);
    s = await state(page); assert.deepEqual(s.numbers, before.numbers); assert.equal(s.ops, 0);
    await tapValue(page, 1); await tapOp(page, '/'); await tapValue(page, 9);
    assert.match(await text(page, '#msg'), /1 ÷ 9 ne tombe pas juste/);
    // equal values give zero: level 20 has two 25
    await page.evaluate(() => window.__game.loadLevel(1));
    await playSteps(page, [[3, '+', 1]]);   // two 4 on the table
    const slot = await tapValue(page, 4); await tapOp(page, '-'); await tapValue(page, 4, slot);
    assert.match(await text(page, '#msg'), /4 − 4 donnerait zéro/);
    assert.equal((await state(page)).ops, 1);
    // legal ones still work after refusals, and the result replaces the two numbers
    await page.evaluate(() => window.__game.loadLevel(1));
    await tapValue(page, 8); await tapOp(page, '/'); await tapValue(page, 4);
    // 8 / 4 = 2 replaces both numbers
    s = await state(page);
    assert.equal(s.ops, 1); assert.deepEqual(s.numbers.filter(v => v !== null).sort((a, b) => a - b), [1, 2, 3, 5, 9]);
    assert.equal(s.numbers.filter(v => v === null).length, 1);
    await context.close();
  });

  await test('selection: switch number, switch operation, deselect; "choose a number first" hint; undo is unlimited; restart', async () => {
    const { context, page } = await open();
    await tapSel(page, '#bGo');
    await tapOp(page, '+');
    assert.match(await text(page, '#msg'), /Choisis d’abord un nombre/);
    await tapValue(page, 1); assert.equal((await state(page)).selected.a >= 0, true);
    await tapValue(page, 3);   // switches the chosen number
    assert.match(await text(page, '#msg'), /^3 …/);
    await tapOp(page, '+'); assert.match(await text(page, '#msg'), /^3 \+ …/);
    await tapOp(page, 'x'); assert.match(await text(page, '#msg'), /^3 × …/);
    await tapOp(page, 'x'); assert.match(await text(page, '#msg'), /^3 …/);   // same operation again: deselected
    await tapValue(page, 3);   // same number again: deselected
    assert.deepEqual((await state(page)).selected, { a: -1, op: -1 });
    // two operations, then undo all
    await playSteps(page, [[3, '+', 1], [5, '+', 4]]);
    let s = await state(page); assert.equal(s.ops, 2);
    assert.equal(await text(page, '#mv'), '2');
    assert.equal((await page.locator('#hist li').count()), 2);
    await tapSel(page, '#bUndo'); s = await state(page); assert.equal(s.ops, 1);
    assert.equal((await page.locator('#hist li').count()), 1);
    await tapSel(page, '#bUndo'); s = await state(page);
    assert.equal(s.ops, 0); assert.deepEqual(s.numbers, LV[0].numbers);
    await tapSel(page, '#bUndo'); await tapSel(page, '#bUndo');   // nothing to undo: no error
    assert.equal((await state(page)).ops, 0);
    await playSteps(page, [[3, '+', 1], [5, '+', 4], [9, '+', 9]]);
    assert.equal((await state(page)).ops, 3);
    await tapSel(page, '#bReset');
    s = await state(page); assert.equal(s.ops, 0); assert.deepEqual(s.numbers, LV[0].numbers);
    await context.close();
  });

  // ---------------------------------------------------------------- stars and failure
  await test('stars: exact in more operations than the reference = 2 stars', async () => {
    const { context, page } = await open();
    await tapSel(page, '#bGo');
    const L = LV[0];
    const path2 = findPath(L.numbers, L.par + 1, s => s.includes(L.target), 3e6, L.target);
    assert.ok(path2, 'no longer exact path found');
    // the target must not appear before the last step (otherwise the game would end earlier)
    await playSteps(page, path2);
    await winVisible(page);
    const s = await state(page);
    assert.ok(s.won && s.stars === 2 && s.ops === L.par + 1, JSON.stringify(s));
    assert.match(await text(page, '#wRec'), /3 étoiles en 2 opérations ou moins/);
    assert.equal(JSON.parse(await stored(page)).stars[0], 2);
    // replaying and doing better keeps the best (3), a worse replay keeps it
    await tapSel(page, '#bAgain'); await playSteps(page, SOL[0]); await winVisible(page);
    assert.equal((await state(page)).stars, 3); assert.equal(JSON.parse(await stored(page)).stars[0], 3);
    await tapSel(page, '#bAgain'); await playSteps(page, path2); await winVisible(page);
    assert.equal((await state(page)).stars, 2); assert.equal(JSON.parse(await stored(page)).stars[0], 3);
    await context.close();
  });

  await test('stars: within 5 of the target, validated = 1 star; far away is refused; dead end handled; level unlocks', async () => {
    const { context, page } = await open();
    await tapSel(page, '#bGo');
    // dead end first: add everything up (level 1: 30), only one number left, far from the target
    await playSteps(page, [[9, '+', 8], [17, '+', 5], [22, '+', 4], [26, '+', 3], [29, '+', 1]]);
    let s = await state(page);
    assert.equal(s.ops, 5); assert.ok(s.stuck, 'stuck'); assert.ok(!s.won); assert.ok(!s.canValidate);
    assert.match(await text(page, '#msg'), /Plus qu’un nombre : annule un coup/);
    assert.ok(await page.locator('#bValid').isHidden());
    assert.ok(await page.locator('#win').isHidden());
    await tapSel(page, '#bUndo'); s = await state(page);
    assert.ok(!s.stuck && s.ops === 4);
    await tapSel(page, '#bReset');
    // approximate finish: level 3 (target 21), find a path ending within 1..5 (not exact, not before)
    await page.evaluate(() => window.__game.loadLevel(3));
    const L = LV[2];
    let path1 = null;
    for (let len = 1; len <= 3 && !path1; len++) path1 = findPath(L.numbers, len, s2 => !s2.includes(L.target) && s2.some(v => Math.abs(v - L.target) >= 1 && Math.abs(v - L.target) <= 5), 3e6, L.target);
    assert.ok(path1, 'no approximate path');
    await playSteps(page, path1.slice(0, -1));
    assert.ok(!(await state(page)).won);
    await playSteps(page, path1.slice(-1));
    s = await state(page);
    assert.ok(s.canValidate && !s.won, 'validate offered: ' + JSON.stringify(s));
    assert.match(await text(page, '#bValid'), /^Valider · à \d près$/);
    await shot(page, 'valider');
    await tapSel(page, '#bValid'); await winVisible(page);
    s = await state(page);
    assert.ok(s.won && s.stars === 1, JSON.stringify(s));
    assert.match(await text(page, '#wRec'), /À \d de la cible/);
    assert.equal(JSON.parse(await stored(page)).stars[2], 1);
    assert.equal(JSON.parse(await stored(page)).max, 4);
    assert.ok(await page.locator('#bChal').isHidden(), 'no challenge for an approximate finish');
    // the button is not offered when the board is far from the target
    await tapSel(page, '#bAgain');
    assert.ok(await page.locator('#bValid').isHidden());
    await playSteps(page, [[4, '+', 5]]);
    assert.ok(await page.locator('#bValid').isHidden());
    await context.close();
  });

  // ---------------------------------------------------------------- resume, corrupted saves, no storage
  await test('game in progress is resumed identically after a reload; progress kept; screens', async () => {
    const { context, page } = await open();
    await tapSel(page, '#bGo');
    await playSteps(page, SOL[0]); await winVisible(page); await tapSel(page, '#bNext');   // level 2 open
    await playSteps(page, SOL[1].slice(0, 1));
    const before = await state(page);
    assert.equal(before.level, 2); assert.equal(before.ops, 1);
    await reload(page); await page.waitForFunction(() => !!window.__game);
    let s = await state(page);
    assert.equal(s.screen, 'home');
    assert.equal(await text(page, '#bGo'), 'Continuer · Niveau 2');
    await tapSel(page, '#bGo');
    s = await state(page);
    assert.equal(s.level, 2); assert.deepEqual(s.numbers, before.numbers); assert.deepEqual(s.history, before.history); assert.equal(s.ops, 1);
    assert.equal((await page.locator('#hist li').count()), 1);
    assert.equal(s.total, 3);
    // the level can then be finished, and the save no longer holds a game in progress
    await playSteps(page, SOL[1].slice(1)); await winVisible(page);
    assert.deepEqual(JSON.parse(await stored(page)).cur, {});
    // a won level is not resumed in its won state
    await reload(page); await page.waitForFunction(() => !!window.__game);
    assert.equal(await text(page, '#bGo'), 'Continuer · Niveau 3');
    // level grid: locked levels cannot be opened
    await tapSel(page, '#bLevels');
    assert.equal((await state(page)).screen, 'levels');
    assert.equal(await page.locator('#grid .cell:not([disabled])').count(), 3);
    await shot(page, 'niveaux');
    const b = await page.locator('#grid .cell[disabled]').first().boundingBox();
    await tapAt(page, b.x + b.width / 2, b.y + b.height / 2);
    assert.equal((await state(page)).screen, 'levels');
    await tapSel(page, '#grid .cell[data-level="2"]');
    assert.equal((await state(page)).level, 2); assert.equal((await state(page)).screen, 'game');
    await context.close();
  });

  await test('corrupted or hostile saves: the game starts clean and plays', async () => {
    const bad = ['{not json', 'null', '[]', '"x"', '12', '{"level":"zz","max":99,"stars":"no","cur":{"hist":[[9,9,9]]}}',
      '{"level":7,"max":2,"stars":[3,9,-4,null,"a"],"cur":{"level":7,"hist":[[0,0,1]]}}',
      '{"level":1,"max":1,"stars":[],"cur":{"level":1,"hist":[[0,3,1],[0,1,1],[2,2,2],"x",[1,1]]}}',
      '{"level":20,"max":20,"stars":[3,3,3],"cur":{"level":20,"hist":[[0,0,1],[0,0,2],[0,0,3],[0,0,4],[0,0,5],[0,0,5]]}}',
      '{"max":1e999,"level":-5,"cur":{"level":2,"hist":[[0,0,1]]}}'];
    for (const raw of bad) {
      const { context, page } = await open(undefined, { rawSave: raw });
      let s = await state(page);
      assert.equal(s.screen, 'home', raw);
      assert.ok(s.saved >= 1 && s.saved <= 20 && s.saved <= s.max, 'bad level pointer for ' + raw);
      assert.ok(s.total >= 0 && s.total <= 60, raw);
      await tapSel(page, '#bGo');
      s = await state(page);
      assert.equal(s.screen, 'game', raw);
      assert.equal(s.numbers.length, 6);
      const lv = s.level;
      if (s.ops === 0) {
        await playSteps(page, SOL[lv - 1]); await winVisible(page);
        assert.ok((await state(page)).won, 'playable after ' + raw);
      } else {
        assert.ok(s.ops <= 5);   // a sane saved game in progress is kept
      }
      await context.close();
    }
  });

  await test('without storage (localStorage throws): the game still plays a level', async () => {
    const { context, page } = await open(undefined, { noStorage: true });
    assert.equal((await state(page)).screen, 'home');
    await tapSel(page, '#bGo');
    await playSteps(page, SOL[0]); await winVisible(page);
    assert.equal((await state(page)).stars, 3);
    await tapSel(page, '#bNext');
    assert.equal((await state(page)).level, 2);
    await context.close();
  });

  // ---------------------------------------------------------------- sharing and challenge
  await test('share text has no solution; challenge link only with a base URL; events share', async () => {
    const { context, page } = await open(undefined, { share: true, config: { shareBaseUrl: 'https://exemple.test/jeux/compte-rond/?token=SECRET&n=3#frag' }, rawSave: JSON.stringify({ level: 2, max: 2, stars: [3], cur: null }) });
    await tapSel(page, '#bGo');
    await playSteps(page, SOL[1]); await winVisible(page);
    await tapSel(page, '#bShare');
    await tapSel(page, '#bChal');
    const shared = await page.evaluate(() => window.__shared);
    assert.equal(shared.length, 2);
    assert.equal(shared[0], NAME + ' · Niveau 2 · ⭐⭐⭐ en 2 opérations');
    assert.ok(!/[=+×÷−x]/.test(shared[0].replace(NAME, '').replace(/[·]/g, '')), 'no solution in the share text');
    assert.ok(shared[1].startsWith(NAME + ' · Niveau 2 en 2 opérations. À toi de faire mieux ! https://exemple.test/jeux/compte-rond/#defi-2-2'), shared[1]);
    assert.ok(!/token|SECRET|\?/.test(shared[1]), 'no query string from the configured base: ' + shared[1]);
    const frag = shared[1].split('#')[1];
    assert.match(frag, /^[A-Za-z0-9-]+$/);
    const ev = await msgs(page);
    assert.deepEqual(ev.filter(m => m.event === 'share').map(m => m.kind), ['result', 'challenge']);
    await context.close();
    // file:// and no config: no link at all
    const b = await open(undefined, { share: true, rawSave: JSON.stringify({ level: 1, max: 1, stars: [], cur: null }) });
    await tapSel(b.page, '#bGo'); await playSteps(b.page, SOL[0]); await winVisible(b.page);
    await tapSel(b.page, '#bChal');
    const sh = await b.page.evaluate(() => window.__shared);
    assert.ok(!/http|#/.test(sh[0]), 'no link: ' + sh[0]);
    await b.context.close();
    // served over https: the current address is the base
    const ctx = await browser.newContext({ ...MOBILE, viewport: { width: 360, height: 640 } });
    const html = fs.readFileSync(FILE, 'utf8');
    allowedUrls.add('https://jeu.test/a/index.html?token=secret123&n=7'); allowedUrls.add('https://jeu.test/favicon.ico');
    await ctx.route('https://jeu.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await ctx.addInitScript(() => { window.__shared = []; navigator.share = d => { window.__shared.push(d.text); return Promise.resolve(); }; });
    const h = await open(undefined, { context: ctx, url: 'https://jeu.test/a/index.html?token=secret123&n=7' });
    await tapSel(h.page, '#bGo'); await playSteps(h.page, SOL[0]); await winVisible(h.page);
    await tapSel(h.page, '#bChal');
    const sh2 = await h.page.evaluate(() => window.__shared);
    assert.ok(sh2[0].endsWith(' https://jeu.test/a/index.html#defi-1-2'), sh2[0]);
    assert.ok(!/token|secret|\?/.test(sh2[0]), 'no query string in the link: ' + sh2[0]);
    await ctx.close();
  });

  await test('challenge link: opens even locked, one objective, tie wins, loss, progress and game in progress untouched', async () => {
    const seed = JSON.stringify({ level: 3, max: 3, stars: [3, 2], cur: { level: 3, hist: [[0, 0, 1]] } });
    const { context, page } = await open(undefined, { rawSave: seed });
    const raw0 = await stored(page);
    assert.ok(raw0);
    // locked level 9, target = the reference (4 operations): winning by equality
    let c = await open(undefined, { context, hash: '#defi-9-4' });
    let s = await state(c.page);
    assert.equal(s.screen, 'game'); assert.equal(s.level, 9); assert.deepEqual(s.challenge, { target: 4, level: 9 });
    assert.deepEqual(s.numbers, LV[8].numbers);
    assert.equal(await c.page.locator('#goal .gc').count(), 0, 'one objective only');
    assert.match(await text(c.page, '#goal'), /Défi : cible en 4 op\. ou moins/);
    assert.ok(await c.page.locator('#bValid').isHidden());
    assert.equal(await c.page.evaluate(() => location.hash), '', 'hash is consumed');
    await shot(c.page, 'defi');
    await playSteps(c.page, SOL[8]); await winVisible(c.page);
    assert.match(await text(c.page, '#wTitle'), /Défi relevé/);
    assert.equal(await text(c.page, '#bNext'), 'Accueil');
    let ev = await msgs(c.page);
    assert.deepEqual(ev.filter(m => m.event === 'challenge_open').map(m => [m.level, m.target]), [[9, 4]]);
    assert.deepEqual(ev.filter(m => m.event === 'challenge_result').map(m => [m.level, m.score, m.target, m.won]), [[9, 4, 4, true]]);
    assert.equal(ev.filter(m => m.event === 'level_complete').length, 0, 'a challenge is not a level completion');
    assert.equal(await stored(c.page), raw0, 'progress and saved game untouched after the challenge');
    // the game in progress comes back from the challenge
    await tapSel(c.page, '#bNext');
    assert.equal((await state(c.page)).screen, 'home');
    assert.equal(await text(c.page, '#bGo'), 'Continuer · Niveau 3');
    await tapSel(c.page, '#bGo');
    s = await state(c.page);
    assert.equal(s.level, 3); assert.equal(s.ops, 1); assert.equal(s.challenge, null);
    assert.equal(await stored(c.page), raw0);
    await c.page.close();
    // target = the minimum (2) on level 1, played in 3 operations: exact but too long = lost, one result only, no replay
    c = await open(undefined, { context, hash: '#defi-1-2' });
    const longer = findPath(LV[0].numbers, 2, s3 => !s3.includes(LV[0].target), 3e6, LV[0].target);
    assert.ok(longer);
    await playSteps(c.page, longer); await winVisible(c.page);   // the challenge stops at its objective: 2 operations used, target missed
    assert.match(await text(c.page, '#wTitle'), /Pas cette fois/);
    assert.match(await text(c.page, '#wChal'), /Il fallait 2 opérations ou moins/);
    ev = await msgs(c.page);
    assert.deepEqual(ev.filter(m => m.event === 'challenge_result').map(m => [m.level, m.score, m.target, m.won]), [[1, 2, 2, false]]);
    assert.equal(await stored(c.page), raw0);
    assert.ok(await c.page.locator('#bAgain').isHidden(), 'no Rejouer in a challenge result');
    assert.ok(await c.page.locator('#bChal').isHidden(), 'no Renvoyer when lost');
    assert.equal(await text(c.page, '#bNext'), 'Accueil');
    await shot(c.page, 'defi-perdu');
    await c.page.close();
    c = await open(undefined, { context, hash: '#defi-9-5' });
    await playSteps(c.page, SOL[8]); await winVisible(c.page);
    assert.match(await text(c.page, '#wTitle'), /Défi relevé/);
    assert.equal(await stored(c.page), raw0);
    assert.ok(await c.page.locator('#bAgain').isHidden());
    assert.ok(await c.page.locator('#bChal').isVisible(), 'Renvoyer le défi when won');
    assert.equal((await events(c.page, 'challenge_result')).length, 1);
    await c.page.close();
    // unlocked level challenge: still no change to the stars
    c = await open(undefined, { context, hash: '#defi-1-2' });
    await playSteps(c.page, SOL[0]); await winVisible(c.page);
    assert.equal(await stored(c.page), raw0);
    await c.page.close();
    await context.close();
  });

  await test('malformed challenge fragments are ignored without error', async () => {
    const bad = ['#defi-', '#defi-x-3', '#defi-0-3', '#defi-21-3', '#defi-5-0', '#defi-5-9', '#defi-5-3-1', '#defi-5-3<b>', '#defi--5-3',
      '#defi-5-', '#defi-999999-3', '#defi-20-1', '#defi-9-3', '#defi-1-1', '#defi-9-6', '#defi-5-%00', '#defi-%3Cscript%3E-1', '#defi-1e1-3', '#DEFI-5-3'];
    const { context } = await open(undefined, { rawSave: JSON.stringify({ level: 2, max: 2, stars: [3], cur: null }) });
    for (const h of bad) {
      const p = await open(undefined, { context, hash: h });
      const s = await state(p.page);
      assert.equal(s.screen, 'home', h); assert.equal(s.challenge, null, h);
      assert.equal(s.saved, 2, h);
      assert.equal((await events(p.page, 'challenge_open')).length, 0, h);
      await p.page.close();
    }
    await context.close();
  });

  await test('Continuer points to the first unfinished level; replaying an old level does not move it', async () => {
    const { context, page } = await open();
    await tapSel(page, '#bGo');
    await playSteps(page, SOL[0]); await winVisible(page); await tapSel(page, '#bNext');
    await playSteps(page, SOL[1]); await winVisible(page);
    await tapSel(page, '#bAgain');                       // replay level 2
    assert.equal((await state(page)).level, 2);
    await playSteps(page, SOL[1]); await winVisible(page);
    await tapSel(page, '#bNext');                        // level 3 opens
    await tapSel(page, '#bMap');
    await tapSel(page, '#grid .cell[data-level="1"]');   // replay level 1 from the grid, leave it half played
    await playSteps(page, SOL[0].slice(0, 1));
    await tapSel(page, '#bMap'); await tapSel(page, '#bGBack');
    assert.equal(await text(page, '#bGo'), 'Continuer · Niveau 3');
    await tapSel(page, '#bGo');
    assert.equal((await state(page)).level, 3);
    await reload(page); await page.waitForFunction(() => !!window.__game);
    assert.equal(await text(page, '#bGo'), 'Continuer · Niveau 3');
    await context.close();
  });

  await test('tiles keep their place after each move (result in the first operand slot, the second slot stays empty)', async () => {
    const { context, page } = await open();
    await tapSel(page, '#bGo');
    const pos = () => page.evaluate(() => [...document.querySelectorAll('#tiles .tile')].map(t => { const r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), t.dataset.value]; }));
    const before = await pos();   // 1 3 4 5 8 9
    await playSteps(page, [[3, '+', 1]]);
    await page.waitForTimeout(400);   // let the pop animation of the result end before measuring
    const after = await pos();
    const s = await state(page);
    assert.deepEqual(after.map(p => [p[0], p[1]]), before.map(p => [p[0], p[1]]), 'tiles never move');
    const ia = before.findIndex(p => p[2] === '3'), ib = before.findIndex(p => p[2] === '1');
    assert.equal(after[ia][2], '4', 'result in the slot of the first operand');
    assert.equal(after[ib][2], '', 'second slot stays empty');
    after.forEach((p, i) => { if (i !== ia && i !== ib) assert.equal(p[2], before[i][2], 'other tiles unchanged'); });
    assert.equal(s.numbers[ib], null);
    // fast taps with no wait: two different operations in a row hit the intended numbers
    await playSteps(page, [[5, '+', 8], [9, '+', 4]]);
    assert.deepEqual((await state(page)).numbers.filter(v => v !== null).sort((x, y) => x - y), [4, 13, 13]);
    await context.close();
  });

  await test('selection in progress (number + operation) is saved and resumed identically after a reload', async () => {
    const { context, page } = await open();
    await tapSel(page, '#bGo');
    await playSteps(page, [[3, '+', 1]]);
    await tapValue(page, 8); await tapOp(page, 'x');
    const before = await state(page);
    assert.ok(before.selected.a >= 0 && before.selected.op === 2);
    await reload(page); await page.waitForFunction(() => !!window.__game);
    await tapSel(page, '#bGo');
    const s = await state(page);
    assert.deepEqual(s.selected, before.selected); assert.deepEqual(s.numbers, before.numbers); assert.equal(s.ops, 1);
    assert.match(await text(page, '#msg'), /^8 × …/);
    await tapValue(page, 5);       // completes 8 x 5 from the restored selection
    assert.equal((await state(page)).ops, 2);
    // a lone selection (no move yet) is saved too
    await tapSel(page, '#bReset');
    await tapValue(page, 9);
    await reload(page); await page.waitForFunction(() => !!window.__game);
    await tapSel(page, '#bGo');
    assert.ok((await state(page)).selected.a >= 0);
    assert.match(await text(page, '#msg'), /^9 …/);
    await context.close();
  });

  await test('one game in progress per level: opening another level from the grid keeps the first one (and survives a reload)', async () => {
    const { context, page } = await open(undefined, { rawSave: JSON.stringify({ level: 2, max: 2, stars: [3], cur: null }) });
    await tapSel(page, '#bGo');
    assert.equal((await state(page)).level, 2);
    await playSteps(page, SOL[1].slice(0, 1));
    await tapValue(page, LV[1].numbers[0]); await tapOp(page, '+');
    const l2 = await state(page);
    assert.equal(l2.ops, 1); assert.ok(l2.selected.a >= 0);
    await tapSel(page, '#bMap'); await tapSel(page, '#grid .cell[data-level="1"]');
    assert.equal((await state(page)).level, 1);
    await playSteps(page, SOL[0].slice(0, 1));
    const l1 = await state(page);
    await tapSel(page, '#bMap'); await tapSel(page, '#grid .cell[data-level="2"]');
    let s = await state(page);
    assert.equal(s.level, 2); assert.equal(s.ops, 1); assert.deepEqual(s.numbers, l2.numbers); assert.deepEqual(s.selected, l2.selected);
    await tapSel(page, '#bMap'); await tapSel(page, '#grid .cell[data-level="1"]');
    s = await state(page); assert.equal(s.ops, 1); assert.deepEqual(s.numbers, l1.numbers);
    await reload(page); await page.waitForFunction(() => !!window.__game);
    await tapSel(page, '#bLevels'); await tapSel(page, '#grid .cell[data-level="1"]');
    s = await state(page); assert.equal(s.ops, 1); assert.deepEqual(s.numbers, l1.numbers);
    await tapSel(page, '#bMap'); await tapSel(page, '#grid .cell[data-level="2"]');
    s = await state(page); assert.equal(s.ops, 1); assert.deepEqual(s.numbers, l2.numbers); assert.deepEqual(s.selected, l2.selected);
    // winning level 1 clears only its own saved game
    await tapSel(page, '#bMap'); await tapSel(page, '#grid .cell[data-level="1"]');
    await playSteps(page, SOL[0].slice(1)); await winVisible(page);
    const save = JSON.parse(await stored(page));
    assert.deepEqual(Object.keys(save.cur), ['2']);
    await context.close();
  });

  await test('challenge in progress is resumed after a reload; it stops, lost, when its objective is out of reach; one result each', async () => {
    const { context, page } = await open(undefined, { hash: '#defi-9-4' });
    await playSteps(page, SOL[8].slice(0, 2));
    await reload(page); await page.waitForFunction(() => !!window.__game);
    let s = await state(page);
    assert.equal(s.screen, 'game'); assert.deepEqual(s.challenge, { target: 4, level: 9 }); assert.equal(s.ops, 2);
    assert.match(await text(page, '#goal'), /Défi : cible en 4 op\. ou moins/);
    await playSteps(page, SOL[8].slice(2)); await winVisible(page);
    assert.equal((await events(page, 'challenge_result')).length, 1);
    assert.equal((await events(page, 'challenge_open')).length, 0, 'no new challenge_open on a resume');
    await reload(page); await page.waitForFunction(() => !!window.__game);
    assert.equal((await state(page)).screen, 'home', 'a finished challenge is not resumed');
    await page.close();
    // the objective stops the game: target 2 on level 1, two operations that miss it = lost at once
    const miss = findPath(LV[0].numbers, 2, s3 => !s3.includes(LV[0].target), 3e6, LV[0].target);
    const c = await open(undefined, { context, hash: '#defi-1-2' });
    await playSteps(c.page, miss.slice(0, 1));
    assert.ok(!(await state(c.page)).won);
    await reload(c.page); await c.page.waitForFunction(() => !!window.__game);
    assert.equal((await state(c.page)).ops, 1, 'resumed mid-challenge');
    await playSteps(c.page, miss.slice(1)); await winVisible(c.page);
    s = await state(c.page);
    assert.ok(s.won && s.stars === 0 && s.ops === 2);
    assert.deepEqual((await events(c.page, 'challenge_result')).map(m => [m.level, m.score, m.target, m.won]), [[1, 2, 2, false]]);
    assert.match(await text(c.page, '#wTitle'), /Pas cette fois/);
    await context.close();
  });

  await test('own style of numbers: the big numbers are not the 25/50/75/100 plates of a TV game', async () => {
    const tv = [25, 50, 75, 100], ours = [12, 15, 18, 20, 30, 36, 40, 45, 60];
    assert.ok(LV.filter(L => L.numbers.some(n => tv.includes(n))).length <= 2, 'TV plates in too many levels');
    assert.ok(LV.every(L => L.numbers.filter(n => tv.includes(n)).length <= 1));
    assert.ok(LV.filter(L => L.numbers.some(n => ours.includes(n))).length >= 10, 'our own big numbers are used');
    assert.ok(new Set(LV.flatMap(L => L.numbers.filter(n => n > 10))).size >= 6, 'variety of big numbers');
  });

  // ---------------------------------------------------------------- events
  await test('events: only the sheet events, with the sheet fields, no personal data', async () => {
    const { context, page } = await open(undefined, { share: true });
    await tapSel(page, '#bGo');
    await playSteps(page, SOL[0]); await winVisible(page);
    await tapSel(page, '#bShare');
    const ev = await msgs(page);
    const allowed = ['level_complete', 'share', 'challenge_open', 'challenge_result'];
    assert.ok(ev.length >= 2);
    for (const m of ev) { assert.ok(allowed.includes(m.event), 'unexpected event ' + m.event); assert.equal(m.source, 'mini-jeu'); assert.equal(m.game, GAME); }
    const lc = ev.find(m => m.event === 'level_complete');
    assert.deepEqual(Object.keys(lc).sort(), ['event', 'game', 'level', 'score', 'source', 'stars']);
    assert.equal(lc.level, 1); assert.equal(lc.score, 2); assert.equal(lc.stars, 3);
    const sh = ev.find(m => m.event === 'share');
    assert.deepEqual(Object.keys(sh).sort(), ['event', 'game', 'kind', 'source']);
    assert.equal(sh.kind, 'result');
    await context.close();
  });

  // ---------------------------------------------------------------- layout on every screen
  await test('layout: no scroll, targets >= 44 px, nothing outside the screen (320x568, 360x640, 430x932; every screen, most loaded level)', async () => {
    // the most loaded position: a 5-operation history ending within 5 of the target (Valider shown), biggest numbers
    const L = LV[18];
    let heavy = null, heavyLevel = 0;
    for (const idx of [18, 19, 16, 14]) {
      heavy = findPath(LV[idx].numbers, 5, s => Math.abs(s[0] - LV[idx].target) >= 1 && Math.abs(s[0] - LV[idx].target) <= 5, 6e6, LV[idx].target);
      if (heavy) { heavyLevel = idx + 1; break; }
    }
    assert.ok(heavy, 'no heavy position found');
    // the biggest tile: multiply the largest numbers together
    const bigNums = LV[17].numbers.slice();
    const bigPath = findPath(bigNums, 4, s => Math.max(...s) >= 1e6, 3e6, LV[17].target);   // 7-digit tile
    assert.ok(bigPath, 'no 7 digit position');
    for (const [w, h] of VIEWPORTS) {
      const tag = `${w}x${h}`;
      // home, level grid with every level open and starred
      let { context, page } = await open({ width: w, height: h }, { rawSave: allStars(3) });
      checkFit(await measure(page), tag + ' home');
      await shot(page, `${tag}-home`);
      await tapSel(page, '#bLevels');
      checkFit(await measure(page), tag + ' levels'); await shot(page, `${tag}-levels`);
      await tapSel(page, '#grid .cell[data-level="1"]');
      // game, start of level 1 (first-move hint shown on a fresh save only)
      await page.evaluate(() => window.__game.loadLevel(1));
      checkFit(await measure(page), tag + ' game level 1'); await shot(page, `${tag}-game1`);
      // a refusal message on screen
      await tapValue(page, 3); await tapOp(page, '-'); await tapValue(page, 9);
      checkFit(await measure(page), tag + ' game with message'); await shot(page, `${tag}-message`);
      // selection in progress
      await page.waitForTimeout(100);
      // the most loaded level: five operations, Valider offered
      await page.evaluate(n => window.__game.loadLevel(n), heavyLevel);
      await playSteps(page, heavy);
      let s = await state(page);
      assert.equal(s.ops, 5); assert.ok(s.canValidate, 'validate shown on the heavy position');
      checkFit(await measure(page), tag + ` heavy level ${heavyLevel}`); await shot(page, `${tag}-heavy`);
      // 7-digit tile
      await page.evaluate(() => window.__game.loadLevel(18));
      await playSteps(page, bigPath);
      checkFit(await measure(page), tag + ' 7-digit tile'); await shot(page, `${tag}-bigtile`);
      // result card (3 stars) and a result card with a long text (lost challenge)
      await page.evaluate(() => window.__game.loadLevel(15));
      await playSteps(page, SOL[14]); await winVisible(page);
      let m = await measure(page); assert.ok(m.winOpen); checkFit(m, tag + ' result'); await shot(page, `${tag}-result`);
      await context.close();
      ({ context, page } = await open({ width: w, height: h }, { hash: '#defi-20-5' }));
      checkFit(await measure(page), tag + ' challenge');
      await playSteps(page, SOL[19]); await winVisible(page);
      checkFit(await measure(page), tag + ' challenge won'); await shot(page, `${tag}-defi-perdu`);
      await context.close();
      ({ context, page } = await open({ width: w, height: h }, { hash: '#defi-1-2' }));
      await playSteps(page, findPath(LV[0].numbers, 2, s3 => !s3.includes(LV[0].target), 3e6, LV[0].target)); await winVisible(page);
      checkFit(await measure(page), tag + ' challenge lost'); await shot(page, `${tag}-defi-perdu`);
      await context.close();
      ({ context, page } = await open({ width: w, height: h }, { rawSave: JSON.stringify({ level: 1, max: 1, stars: [], cur: null }) }));
      await tapSel(page, '#bGo');
      checkFit(await measure(page), tag + ' first game (hint)'); await shot(page, `${tag}-first`);
      await context.close();
    }
  });

  // ---------------------------------------------------------------- hygiene
  await test('no network request, no console or page error; file under 150 KB, single file, no external reference', async () => {
    assert.deepEqual(problems, []);
    const size = fs.statSync(FILE).size;
    assert.ok(size < 150 * 1024, 'size ' + size);
    const html = fs.readFileSync(FILE, 'utf8');
    assert.ok(!/(src|href)\s*=\s*["']https?:/i.test(html), 'external reference');
    assert.ok(!/url\(\s*["']?https?:/i.test(html), 'external css url');
    assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(html), 'network API');
    assert.ok(!/@import|<link /i.test(html), 'external resource');
    console.log(`        file size: ${size} bytes`);
  });

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
