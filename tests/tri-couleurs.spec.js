'use strict';
/*
 * Mobile acceptance tests for games/tri-couleurs (plain node + playwright + node:assert).
 * Run with `npm test`. Set SHOTS=<dir> to also write screenshots.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const FILE = path.join(__dirname, '..', 'games', 'tri-couleurs', 'index.html');
const URL = pathToFileURL(FILE).href;
const KEY = 'mj:tri-couleurs:v1';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

let browser;
const problems = [];   // console errors, page errors, unexpected requests (all pages)
const results = [];

async function open(viewport = { width: 360, height: 640 }, extra = {}) {
  const context = await browser.newContext({ ...MOBILE, viewport, ...extra });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('request', r => { if (r.url() !== URL) problems.push('request: ' + r.url()); });
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__game);
  return { context, page };
}
const state = page => page.evaluate(() => window.__game.state());
const tube = (page, i) => page.locator(`[data-tube="${i}"]`);
async function tapMove(page, from, to) {
  await tube(page, from).tap();
  await tube(page, to).tap();
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

// Pure-JS model of the rules, used to find specific positions (illegal moves, dead ends).
const canMove = (t, cap, a, b) => a !== b && t[a].length > 0 && t[b].length < cap &&
  (t[b].length === 0 || t[b][t[b].length - 1] === t[a][t[a].length - 1]);
function findDeadEnd(tubes, cap, limit = 200000) {
  // BFS to the nearest position with no legal move at all (and not won).
  const key = t => t.map(x => x.join('')).join('|');
  const done = t => t.every(x => x.length === 0 || (x.length === cap && x.every(c => c === x[0])));
  const seen = new Set([key(tubes)]);
  let frontier = [{ t: tubes, path: [] }];
  while (frontier.length && seen.size < limit) {
    const next = [];
    for (const node of frontier) {
      let any = false;
      for (let a = 0; a < node.t.length; a++) for (let b = 0; b < node.t.length; b++) {
        if (!canMove(node.t, cap, a, b)) continue;
        any = true;
        const t = node.t.map(x => x.slice());
        t[b].push(t[a].pop());
        const k = key(t);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ t, path: node.path.concat([[a, b]]) });
      }
      if (!any && !done(node.t)) return node.path;
    }
    frontier = next;
  }
  return null;
}

(async () => {
  browser = await chromium.launch();
  console.log('tri-couleurs');

  await test('file is a single HTML under 150 KB with no external reference', async () => {
    const size = fs.statSync(FILE).size;
    assert.ok(size < 150 * 1024, `index.html is ${size} bytes`);
    const html = fs.readFileSync(FILE, 'utf8');
    assert.ok(!/(src|href)\s*=\s*["'](https?:)?\/\//i.test(html), 'external src/href found');
    assert.ok(!/url\(\s*["']?(https?:)?\/\//i.test(html), 'external css url found');
    assert.ok(!/@import|<link\b/i.test(html), 'stylesheet link/import found');
    console.log(`        size: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);
  });

  await test('hooks: 10 fixed levels, solutions, strictly increasing solution length', async () => {
    const { context, page } = await open();
    const info = await page.evaluate(() => ({
      levels: window.__game.levels, solutions: window.__game.solutions,
      hasLoad: typeof window.__game.loadLevel, st: window.__game.state(),
    }));
    assert.equal(info.levels.length, 10);
    assert.equal(info.solutions.length, 10);
    assert.equal(info.hasLoad, 'function');
    for (const k of ['level', 'tubes', 'moves', 'won']) assert.ok(k in info.st, 'state() lacks ' + k);
    assert.equal(info.st.level, 1, 'fresh start is level 1');
    const lens = info.solutions.map(s => s.length);
    for (let i = 1; i < lens.length; i++) assert.ok(lens[i] > lens[i - 1], 'solution lengths not increasing: ' + lens);
    info.levels.forEach((l, i) => {
      assert.equal(l.par, lens[i], 'par = solver length');
      const colours = new Set(l.tubes.flat());
      const count = {};
      l.tubes.flat().forEach(c => { count[c] = (count[c] || 0) + 1; });
      for (const c of colours) assert.equal(count[c], l.cap, `level ${i + 1}: colour ${c} count`);
      const empty = l.tubes.filter(t => !t.length).length;
      const want = [[2, 3, 1, 2, 3], [2, 3, 1, 2, 3], [4, 5, 2, 2, 4], [4, 5, 2, 2, 4], [4, 5, 2, 2, 4],
        [6, 7, 2, 2, 4], [6, 7, 2, 2, 4], [6, 7, 2, 2, 4], [8, 9, 2, 2, 4], [8, 9, 2, 2, 4]][i];
      assert.ok(colours.size >= want[0] && colours.size <= want[1], `level ${i + 1}: ${colours.size} colours`);
      assert.ok(empty >= want[2] && empty <= want[3], `level ${i + 1}: ${empty} empty tubes`);
      assert.equal(l.cap, want[4], `level ${i + 1}: height`);
    });
    console.log('        solution lengths: ' + lens.join(', '));
    await context.close();
  });

  await test('each of the 10 levels is won by replaying its solution with real taps', async () => {
    const { context, page } = await open();
    await page.evaluate(() => {
      window.__msgs = [];
      window.addEventListener('message', e => window.__msgs.push(e.data));
    });
    const solutions = await page.evaluate(() => window.__game.solutions);
    for (let n = 1; n <= 10; n++) {
      const s0 = await page.evaluate(k => window.__game.loadLevel(k), n);
      assert.equal(s0.level, n);
      assert.equal(s0.moves, 0);
      assert.equal(s0.won, false);
      assert.equal(await page.locator('[data-tube]').count(), s0.tubes.length);
      for (const [from, to] of solutions[n - 1]) {
        assert.equal((await state(page)).won, false, `level ${n} won too early`);
        await tapMove(page, from, to);
      }
      const s = await state(page);
      assert.equal(s.won, true, `level ${n} not won`);
      assert.equal(s.moves, solutions[n - 1].length);
      assert.equal(s.stars, 3, 'solver solution earns 3 stars');
      for (const t of s.tubes) assert.ok(t.length === 0 || (t.length === s.cap && new Set(t).size === 1));
      await page.locator('#win').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#wStars svg.on').count(), 3);
      assert.equal((await page.locator('#wMoves').textContent()).trim(), String(s.moves));
      assert.ok(await page.locator('#bNext').isVisible());
      assert.ok(await page.locator('#bShare').isVisible());
    }
    const msgs = await page.evaluate(() => window.__msgs);
    assert.equal(msgs.length, 10, 'one postMessage per win, nothing else');
    msgs.forEach((m, i) => assert.deepEqual(m,
      { source: 'mini-jeu', game: 'tri-couleurs', event: 'level_complete', level: i + 1, moves: solutions[i].length }));
    await context.close();
  });

  await test('illegal moves (other colour, full tube, empty source) leave the state untouched', async () => {
    const { context, page } = await open();
    const levels = await page.evaluate(() => window.__game.levels);
    // Level 3: every non-empty tube is full at start.
    const L = levels[2];
    const full = L.tubes.findIndex(t => t.length === L.cap);
    const sameTopFull = L.tubes.findIndex((t, i) => i !== full && t.length === L.cap && t[t.length - 1] === L.tubes[full][L.cap - 1]);
    assert.ok(sameTopFull >= 0, 'fixture: need two full tubes with the same top colour');
    const before = await page.evaluate(() => window.__game.loadLevel(3));
    await tapMove(page, full, sameTopFull);                 // same colour but full tube
    let s = await state(page);
    assert.deepEqual(s.tubes, before.tubes);
    assert.equal(s.moves, 0);
    await tube(page, full).tap();                           // put the ball back down
    assert.equal((await state(page)).selected, -1);

    // Different colour on a tube that still has room.
    const empty = L.tubes.findIndex(t => !t.length);
    await tapMove(page, full, empty);                       // legal: frees one slot in `full`
    const mid = await state(page);
    assert.equal(mid.moves, 1);
    const other = mid.tubes.findIndex((t, i) => i !== full && t.length &&
      t[t.length - 1] !== mid.tubes[full][mid.tubes[full].length - 1]);
    assert.ok(mid.tubes[full].length < L.cap && other >= 0);
    assert.ok(!canMove(mid.tubes, L.cap, other, full));
    await tapMove(page, other, full);                       // room, but wrong colour
    s = await state(page);
    assert.deepEqual(s.tubes, mid.tubes);
    assert.equal(s.moves, 1);
    assert.ok((await page.locator('#msg').textContent()).length > 0, 'the refusal is explained');
    await tube(page, other).tap();

    // Tapping an empty tube with nothing in hand does nothing.
    const empty2 = mid.tubes.findIndex(t => !t.length);
    await tube(page, empty2).tap();
    s = await state(page);
    assert.deepEqual(s.tubes, mid.tubes);
    assert.equal(s.selected, -1);
    await context.close();
  });

  await test('undo restores the previous state (unlimited), restart restores the level', async () => {
    const { context, page } = await open();
    const sol = (await page.evaluate(() => window.__game.solutions))[3];
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

  await test('dead end: the game says so and offers undo / restart', async () => {
    const { context, page } = await open();
    const levels = await page.evaluate(() => window.__game.levels);
    let n = -1, dead = null;
    for (let i = 0; i < levels.length && !dead; i++) { dead = findDeadEnd(levels[i].tubes, levels[i].cap); n = i + 1; }
    assert.ok(dead, 'no dead end found in any level');
    await page.evaluate(k => window.__game.loadLevel(k), n);
    for (const [from, to] of dead) await tapMove(page, from, to);
    let s = await state(page);
    assert.equal(s.stuck, true);
    assert.equal(s.won, false);
    assert.match(await page.locator('#msg').textContent(), /aucun coup possible/i);
    assert.ok(await page.locator('#msg').isVisible());
    assert.ok(await page.locator('#bUndo').isEnabled());
    assert.ok(await page.locator('#bReset').isEnabled());
    await shot(page, 'dead-end-360x640');
    await page.locator('#bUndo').tap();
    s = await state(page);
    assert.equal(s.stuck, false);
    assert.equal(s.moves, dead.length - 1);
    assert.doesNotMatch(await page.locator('#msg').textContent(), /aucun coup/i);
    console.log(`        dead end reached on level ${n} after ${dead.length} moves`);
    await context.close();
  });

  await test('progress survives a reload (localStorage); win screen, next, level map', async () => {
    const { context, page } = await open();
    const sols = await page.evaluate(() => window.__game.solutions);
    assert.ok(await page.locator('#hand').isVisible(), 'animated hand on the very first move');
    for (const [from, to] of sols[0]) await tapMove(page, from, to);
    assert.equal((await state(page)).won, true);
    await page.locator('#win').waitFor({ state: 'visible' });
    await shot(page, 'win-360x640');
    const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
    assert.equal(saved.stars[0], 3);
    assert.equal(saved.best[0], sols[0].length);

    await page.reload();                                     // closed on the win screen: resume at level 2
    await page.waitForFunction(() => !!window.__game);
    let s = await state(page);
    assert.equal(s.level, 2);
    assert.equal(s.moves, 0);

    await tapMove(page, sols[1][0][0], sols[1][0][1]);       // one move into level 2, then reload
    await tapMove(page, sols[1][1][0], sols[1][1][1]);
    const mid = await state(page);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    s = await state(page);
    assert.equal(s.level, 2);
    assert.deepEqual(s.tubes, mid.tubes, 'unfinished level is resumed as it was');
    assert.equal(s.moves, 2);
    await page.locator('#bUndo').tap();                      // undo still works after a resume
    assert.equal((await state(page)).moves, 1);

    for (const [from, to] of sols[1].slice(1)) await tapMove(page, from, to);
    assert.equal((await state(page)).won, true);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bNext').tap();                      // next level in one tap
    s = await state(page);
    assert.equal(s.level, 3);
    assert.ok(await page.locator('#win').isHidden());

    await page.locator('#bMap').tap();                       // level map: 10 cells, stars, locks
    await page.locator('#map').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#grid [data-level]').count(), 10);
    assert.equal(await page.locator('[data-level="1"] .s svg.on').count(), 3);
    assert.equal(await page.locator('[data-level="2"] .s svg.on').count(), 3);
    assert.equal(await page.locator('[data-level="3"] .s svg.on').count(), 0);
    assert.ok(await page.locator('[data-level="3"]').isEnabled());
    assert.ok(await page.locator('[data-level="4"]').isDisabled());
    assert.equal((await page.locator('#mTotal').textContent()).trim(), '6/30');
    await shot(page, 'map-360x640');
    await page.locator('[data-level="4"]').tap({ force: true });   // locked: nothing happens
    assert.equal((await state(page)).level, 3);
    await page.locator('[data-level="1"]').tap();
    await page.locator('#map').waitFor({ state: 'hidden' });
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
    for (const [from, to] of sols[0]) await tapMove(p2, from, to);
    assert.equal((await state(p2)).won, true);
    await blocked.close();
  });

  await test('share: result text without spoiler, clipboard fallback', async () => {
    const { context, page } = await open();
    await page.evaluate(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__shared.push(d); return Promise.resolve(); } });
    });
    const sols = await page.evaluate(() => window.__game.solutions);
    for (const [from, to] of sols[0]) await tapMove(page, from, to);
    await page.locator('#win').waitFor({ state: 'visible' });
    await page.locator('#bShare').tap();
    const shared = await page.evaluate(() => window.__shared);
    assert.equal(shared.length, 1);
    assert.equal(shared[0].text, `Pile Poil · Niveau 1 en ${sols[0].length} coups ⭐⭐⭐`);
    // No navigator.share: falls back to the clipboard and tells the player.
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

  for (const vp of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 430, height: 932 }]) {
    await test(`layout ${vp.width}x${vp.height}: levels 1 and 10 fit, no scroll, tubes >= 44 px`, async () => {
      const { context, page } = await open(vp);
      for (const n of [1, 10]) {
        await page.evaluate(k => window.__game.loadLevel(k), n);
        const m = await page.evaluate(() => {
          const de = document.documentElement, b = document.body;
          window.scrollTo(50, 50);
          const r = el => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
          return {
            iw: window.innerWidth, ih: window.innerHeight,
            sw: Math.max(de.scrollWidth, b.scrollWidth), sh: Math.max(de.scrollHeight, b.scrollHeight),
            sx: window.scrollX, sy: window.scrollY,
            vv: window.visualViewport ? window.visualViewport.scale : 1,
            tubes: [...document.querySelectorAll('[data-tube]')].map(r),
            glass: [...document.querySelectorAll('[data-tube] i')].map(r),
            balls: [...document.querySelectorAll('.ball')].map(r),
            ui: [...document.querySelectorAll('header button, footer button')].map(r),
            board: r(document.getElementById('board')),
            footer: r(document.querySelector('footer')),
          };
        });
        const tag = `level ${n} @${vp.width}x${vp.height}`;
        assert.equal(m.iw, vp.width, tag + ': layout viewport width');
        assert.equal(m.ih, vp.height);
        assert.ok(m.sw <= m.iw, `${tag}: horizontal scroll (${m.sw} > ${m.iw})`);
        assert.ok(m.sh <= m.ih, `${tag}: vertical scroll (${m.sh} > ${m.ih})`);
        assert.equal(m.sx, 0); assert.equal(m.sy, 0);
        assert.equal(m.vv, 1);
        assert.equal(m.tubes.length, n === 10 ? 11 : 3);
        const rows = new Set(m.tubes.map(t => Math.round(t.t)));
        assert.ok(rows.size <= 2, `${tag}: ${rows.size} rows`);
        m.tubes.forEach((t, i) => {
          assert.ok(t.w >= 44, `${tag}: tube ${i} is ${t.w}px wide`);
          assert.ok(t.h >= 44, `${tag}: tube ${i} is ${t.h}px high`);
          assert.ok(t.l >= 0 && t.t >= 0 && t.r <= m.iw && t.b <= m.ih, `${tag}: tube ${i} out of screen`);
          assert.ok(t.t >= m.board.t - 0.5 && t.b <= m.board.b + 0.5, `${tag}: tube ${i} out of the board`);
          assert.ok(t.b <= m.footer.t, `${tag}: tube ${i} under the buttons`);
        });
        // Touch targets do not overlap each other.
        for (let i = 0; i < m.tubes.length; i++) for (let j = i + 1; j < m.tubes.length; j++) {
          const a = m.tubes[i], c = m.tubes[j];
          assert.ok(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t, `${tag}: tubes ${i} and ${j} overlap`);
        }
        m.balls.forEach((q, i) => {
          assert.ok(q.l >= 0 && q.t >= 0 && q.r <= m.iw && q.b <= m.ih, `${tag}: ball ${i} out of screen`);
          assert.ok(q.w >= 24, `${tag}: balls too small (${q.w}px)`);
        });
        m.ui.forEach((q, i) => assert.ok(q.w >= 44 && q.h >= 44, `${tag}: button ${i} is ${q.w}x${q.h}`));
        // A lifted ball stays on screen too.
        await tube(page, 0).tap();
        await page.waitForTimeout(250);
        const lifted = await page.evaluate(() => [...document.querySelectorAll('.ball')].map(e => e.getBoundingClientRect().top));
        assert.ok(Math.min(...lifted) >= m.board.t - 0.5, `${tag}: lifted ball leaves the board`);
        await shot(page, `level${n}-${vp.width}x${vp.height}`);
        await tube(page, 0).tap();
      }
      // Level map and win screen fit as well.
      await page.locator('#bMap').tap();
      const cells = await page.evaluate(() => [...document.querySelectorAll('#grid [data-level], #bBack')].map(e => {
        const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height };
      }));
      cells.forEach((q, i) => {
        assert.ok(q.w >= 44 && q.h >= 44, `map cell ${i} is ${q.w}x${q.h}`);
        assert.ok(q.l >= 0 && q.t >= 0 && q.r <= vp.width && q.b <= vp.height, `map cell ${i} out of screen`);
      });
      await shot(page, `map-fresh-${vp.width}x${vp.height}`);
      await context.close();
    });
  }

  await test('reduced motion: still playable, no confetti', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { reducedMotion: 'reduce' });
    const sols = await page.evaluate(() => window.__game.solutions);
    for (const [from, to] of sols[0]) await tapMove(page, from, to);
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
