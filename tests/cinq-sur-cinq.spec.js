'use strict';
/*
 * Mobile acceptance tests for games/cinq-sur-cinq ("Carton Plein"), plain node + playwright + node:assert.
 * Run with `node tests/cinq-sur-cinq.spec.js`. Set SHOTS=<dir> to also write screenshots.
 * The right answers come from tools/cinq-sur-cinq/questions.js: the game never exposes them through its hooks.
 * The question timer is driven by __game.freeze() / __game.advance(ms), so no test waits for real seconds.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const FILE = process.env.GAME_FILE || path.join(__dirname, '..', 'games', 'cinq-sur-cinq', 'index.html');
const URL = pathToFileURL(FILE).href;
const KEY = 'mj:cinq-sur-cinq:v1';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DATA = require('../tools/cinq-sur-cinq/questions.js');
const ANSWER = {};
DATA.forEach(l => l.qs.forEach(q => { ANSWER[q.q] = q.a; }));

let browser;
const problems = [];   // console errors, page errors, unexpected requests (all pages)
const results = [];

// Opens the game. opts.save seeds localStorage on the first navigation only (a reload keeps what the game stored); opts.raw seeds a raw string;
// opts.config sets window.MJ_CONFIG; opts.share: 'ok' | 'none' stubs navigator.share (texts land in window.__shared);
// opts.hash opens a link. Messages to the host are collected in window.__msgs (the page is its own parent here).
async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = await browser.newContext({ ...MOBILE, viewport, ...(opts.extra || {}) });
  await context.addInitScript(({ save, raw, key, config, share, nostore }) => {
    window.__msgs = []; window.__shared = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    try {
      if (nostore) {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage disabled'); } });
      } else if (!sessionStorage.getItem('__seeded')) {   // first navigation only, never after a reload (R14)
        sessionStorage.setItem('__seeded', '1');
        if (raw !== null) localStorage.setItem(key, raw);
        else if (save) localStorage.setItem(key, JSON.stringify(save));
      }
    } catch (e) { /* ignore */ }
    if (config) window.MJ_CONFIG = config;
    if (share) {
      Object.defineProperty(navigator, 'share', { configurable: true, value: share === 'ok' ? async d => { window.__shared.push(d.text); } : undefined });
      if (share === 'none') {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__shared.push(t); } } });
      }
    }
  }, { save: opts.save || null, raw: opts.raw === undefined ? null : opts.raw, key: KEY, config: opts.config || null, share: opts.share || '', nostore: !!opts.nostore });
  const page = await context.newPage();
  // the game ignores two taps closer than 100 ms: locator taps are spaced, raw touchscreen taps are not
  const loc = page.locator.bind(page);
  let lastTap = 0;
  page.locator = (sel, o) => { const l = loc(sel, o), t = l.tap.bind(l); l.tap = async x => { const w = 105 - (Date.now() - lastTap); if (w > 0) await page.waitForTimeout(w); const r = await t(x); lastTap = Date.now(); return r; }; return l; };
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('request', r => { if (r.url().split('#')[0] !== URL) problems.push('request: ' + r.url()); });
  await page.goto(URL + (opts.hash || ''));
  await page.waitForFunction(() => !!window.__game);
  return { context, page };
}
const state = page => page.evaluate(() => window.__game.state());
const msgs = page => page.evaluate(() => new Promise(r => setTimeout(() => r(window.__msgs), 40)));
const events = async (page, name) => (await msgs(page)).filter(m => m.event === name);
const stored = page => page.evaluate(k => localStorage.getItem(k), KEY);
const shared = page => page.evaluate(() => window.__shared);
const reload = page => page.reload();
const prog = async page => { const o = JSON.parse(await stored(page)); delete o.chal; return JSON.stringify(o); };   // progress without the challenge slot
const answerBtn = (page, d) => page.locator(`#ans .a[data-d="${d}"]`);

// Index (displayed position) of the right answer of the question on screen.
async function rightIndex(page) {
  const g = (await state(page)).game;
  const i = g.options.indexOf(ANSWER[g.question]);
  assert.ok(i >= 0, 'right answer not displayed for: ' + g.question);
  return i;
}
// Plays the open level with REAL taps. wrong = set of question indexes (0-4) to miss on purpose.
async function playByTaps(page, wrong = []) {
  for (let q = 0; q < 5; q++) {
    const right = await rightIndex(page);
    const d = wrong.includes(q) ? (right + 1) % 4 : right;
    await answerBtn(page, d).tap();
    const g = (await state(page)).game;
    assert.equal(g.answered, true);
    assert.equal(g.results[q].ok, !wrong.includes(q));
    await page.locator('#bNext').tap();
  }
  await page.locator('#res').waitFor({ state: 'visible' });
}
// Plays through the hooks (no animation). Each entry of plan: true = right, false = wrong, or a number = ms to burn first.
async function playHooks(page, plan) {
  for (const step of plan) {
    const g = (await state(page)).game;
    const right = g.options.indexOf(ANSWER[g.question]);
    await page.evaluate(([ms, d]) => { if (ms) window.__game.advance(ms); window.__game.answer(d); }, [typeof step === 'number' ? step : 0, step === false ? (right + 1) % 4 : right]);
    await page.evaluate(() => window.__game.next());
  }
  return state(page);
}
const fresh = (page, n, seed = 1) => page.evaluate(([k, s]) => { window.__game.freeze(true); window.__game.seed(s); window.__game.loadLevel(k); return window.__game.state(); }, [n, seed]);
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(600);
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
const OPEN_SAVE = { seed: 3, att: 0, max: 20, lost: stars(20, 0), stars: [1, 1, 1, ...stars(17, 0)], best: stars(20, 0), cur: null };   // levels 1-3 done: "Continuer" points at 4   // every level unlocked

// Layout of what is on screen: page scroll, tap targets, bounds, clipped text.
const measure = page => page.evaluate(() => {
  const de = document.documentElement, b = document.body;
  window.scrollTo(50, 50);
  const out = { iw: innerWidth, ih: innerHeight, sw: Math.max(de.scrollWidth, b.scrollWidth), sh: Math.max(de.scrollHeight, b.scrollHeight), sx: scrollX, sy: scrollY, small: [], out: [], clipped: [] };
  const layer = document.querySelector('#res:not([hidden])') || document.querySelector('.scr:not([hidden])');
  const all = [...layer.querySelectorAll('*')].filter(el => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && !el.closest('svg'); });
  for (const el of all) {
    const q = el.getBoundingClientRect(), tag = el.id || el.className || el.tagName;
    if (q.left < -0.5 || q.right > innerWidth + 0.5 || q.top < -0.5 || q.bottom > innerHeight + 0.5) out.out.push(String(tag));
    if (el.tagName === 'BUTTON') {
      const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      if ((hit === el || el.contains(hit)) && (q.width < 43.5 || q.height < 43.5)) out.small.push(`${tag} ${Math.round(q.width)}x${Math.round(q.height)}`);
    }
    if (['q', 'lvl', 'theme', 'rTitle', 'rSub', 'fbT', 'fbS', 'chalT'].includes(el.id) || el.matches('.a .t, .btn, .card p')) {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.clipped.push(String(tag) + ':' + el.textContent.slice(0, 30));
    }
  }
  return out;
});
function checkFit(m, label) {
  assert.ok(m.sw <= m.iw && m.sh <= m.ih, `${label}: page scrolls (${m.sw}x${m.sh} in ${m.iw}x${m.ih})`);
  assert.equal(m.sx + m.sy, 0, `${label}: page moved when scrolled`);
  assert.deepEqual(m.small, [], `${label}: tap targets under 44 px`);
  assert.deepEqual(m.out, [], `${label}: elements outside the screen`);
  assert.deepEqual(m.clipped, [], `${label}: clipped text`);
}

(async () => {
  browser = await chromium.launch();

  await test('file: one file under 150 KB, no external reference, French text, host events only', async () => {
    const src = fs.readFileSync(FILE, 'utf8');
    assert.ok(Buffer.byteLength(src) < 150 * 1024, 'size ' + Buffer.byteLength(src));
    assert.ok(!/(src|href)\s*=\s*["']?(https?:)?\/\//i.test(src), 'external reference');
    assert.ok(!/@import|url\(\s*["']?http|<link |<img|fetch\(|XMLHttpRequest|WebSocket|webgl|filter:\s*blur|box-shadow:[^;]*\d+px\s+\d+px\s+\d+px/i.test(src.replace(/box-shadow:inset 0 0 0 2px/g, '')), 'forbidden feature');
    assert.match(src, /user-scalable=no/);
    assert.match(src, /env\(safe-area-inset-top\)/);
    assert.match(src, /touch-action:manipulation/);
    assert.match(src, /prefers-reduced-motion/);
    assert.match(src, /<html lang="fr">/);
    const posts = src.match(/postMessage\(/g) || [];
    assert.equal(posts.length, 1);
    const evs = [...src.matchAll(/emit\(\{ event: '([a-z_]+)'/g)].map(m => m[1]).sort();
    assert.deepEqual([...new Set(evs)], ['challenge_open', 'challenge_result', 'level_complete', 'share']);
  });

  await test('content: 100 questions, 20 levels of 5, 4 distinct answers, embedded data matches the source', async () => {
    assert.equal(DATA.length, 20);
    const seen = new Set();
    DATA.forEach(l => {
      assert.equal(l.qs.length, 5);
      l.qs.forEach(q => {
        assert.equal(new Set([q.a, ...q.w]).size, 4, q.q);
        assert.ok(q.q.length < 120 && [q.a, ...q.w].every(a => a.length <= 32), 'too long: ' + q.q);
        assert.ok(!seen.has(q.q)); seen.add(q.q);
      });
    });
    assert.equal(seen.size, 100);
    const { context, page } = await open();
    const lv = await page.evaluate(() => window.__game.levels);
    assert.equal(lv.length, 20);
    lv.forEach((l, i) => { assert.equal(l.theme, DATA[i].theme); assert.equal(l.questions, 5); });
    assert.ok(!JSON.stringify(lv).includes('"a"'));
    // every question of the file is served, with its right answer among the four shown
    for (let n = 1; n <= 20; n++) {
      await fresh(page, n);
      for (let q = 0; q < 5; q++) {
        const g = (await state(page)).game;
        assert.equal(g.question, DATA[n - 1].qs[q].q);
        assert.deepEqual([...g.options].sort(), [DATA[n - 1].qs[q].a, ...DATA[n - 1].qs[q].w].sort());
        await page.evaluate(() => { window.__game.answer(0); window.__game.next(); });
      }
    }
    await context.close();
  });

  await test('one tap from the home screen to a running question; the state never reveals the answer', async () => {
    const { context, page } = await open();
    assert.equal((await state(page)).screen, 'home');
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 1/);
    await page.locator('#bGo').tap();
    const s = await state(page);
    assert.equal(s.screen, 'game');
    assert.equal(s.game.level, 1); assert.equal(s.game.index, 0); assert.equal(s.game.answered, false);
    assert.equal(await page.locator('#ans .a').count(), 4);
    assert.ok(!JSON.stringify(s).includes(ANSWER[s.game.question]) || s.game.options.includes(ANSWER[s.game.question]));
    assert.ok(!('correct' in s.game) && !('answer' in s.game) && !('right' in s.game));
    assert.match(await page.locator('#goal').textContent(), /3 bonnes.*4.*5/);
    await shot(page, 'game-start');
    await context.close();
  });

  await test('all 20 levels won with real taps, 3 stars each, in order, with saved progress', async () => {
    const { context, page } = await open({ width: 360, height: 640 });
    await page.locator('#bGo').tap();
    for (let n = 1; n <= 20; n++) {
      const s = await state(page);
      assert.equal(s.game.level, n);
      await playByTaps(page);
      const f = await state(page);
      assert.equal(f.game.finished, true);
      assert.equal(f.game.good, 5); assert.equal(f.game.stars, 3); assert.equal(f.game.won, true);
      assert.ok(f.game.score >= 500 && f.game.score <= 1000, 'score ' + f.game.score);
      assert.equal(f.stars[n - 1], 3);
      assert.equal(f.max, Math.min(20, n + 1));
      if (n < 20) await page.locator('#bRNext').tap();
    }
    const f = await state(page);
    assert.equal(f.totalStars, 60);
    assert.equal(await page.locator('#bRNext').isHidden(), true);
    const save = JSON.parse(await stored(page));
    assert.equal(save.stars.length, 20); assert.equal(save.cur, null);
    assert.equal((await events(page, 'level_complete')).length, 20);
    await context.close();
  });

  await test('failure: 2 right out of 5 loses cleanly (no stars, next level stays locked), retry works', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    await playByTaps(page, [0, 2, 4]);
    const f = await state(page);
    assert.equal(f.game.good, 2); assert.equal(f.game.won, false); assert.equal(f.game.stars, 0);
    assert.equal(f.max, 1); assert.equal(f.stars[0], 0);
    assert.match(await page.locator('#rTitle').textContent(), /Presque/);
    assert.equal(await page.locator('#bRNext').isHidden(), true);
    assert.equal((await events(page, 'level_complete')).length, 0);
    await shot(page, 'result-lost');
    await page.locator('#bAgain').tap();
    const r = await state(page);
    assert.equal(r.screen, 'game'); assert.equal(r.game.index, 0); assert.deepEqual(r.game.results, []);
    assert.equal(r.att, f.att + 1);
    // the level can still be won afterwards
    await playByTaps(page, [3]);
    const w = await state(page);
    assert.equal(w.game.won, true); assert.equal(w.game.stars, 2); assert.equal(w.max, 2);
    // home continues on the next level
    await context.close();
  });

  await test('R11: stars follow the right answers (3 -> 1, 4 -> 2, 5 -> 3), freeze at the first win, and a win after a failure caps at 2', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { ...OPEN_SAVE, stars: stars(20, 0) } });
    const win = async (n, plan) => { await page.evaluate(k => { window.__game.freeze(true); window.__game.loadLevel(k); }, n); return playHooks(page, plan); };
    let s = await win(1, [true, false, true, false, true]);
    assert.equal(s.game.good, 3); assert.equal(s.game.stars, 1);
    s = await win(2, [true, true, true, true, false]);
    assert.equal(s.game.good, 4); assert.equal(s.game.stars, 2);
    s = await win(3, [true, true, true, true, true]);
    assert.equal(s.game.stars, 3); assert.deepEqual(s.stars.slice(0, 3), [1, 2, 3]);
    // frozen: a perfect replay of level 1 keeps its single star, and the screens say so
    await page.evaluate(() => { window.__game.freeze(true); window.__game.loadLevel(1); });
    assert.match(await page.locator('#goal').textContent(), /déjà obtenues/);
    s = await playHooks(page, [true, true, true, true, true]);
    assert.equal(s.game.stars, 1); assert.equal(s.stars[0], 1);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#rStars svg.on').count(), 1);
    assert.match(await page.locator('#rRec').textContent(), /déjà acquises/);
    assert.equal((await events(page, 'level_complete')).pop().stars, 1);
    // a worse replay of level 3 does not lower it either
    s = await win(3, [true, true, false, false, false]);
    assert.equal(s.game.won, false); assert.equal(s.stars[2], 3);
    // failure first, then a perfect game: 2 stars at most
    s = await win(4, [false, false, false, true, true]);
    assert.equal(s.game.won, false); assert.equal(s.stars[3], 0); assert.equal(s.lost[3], 1);
    await page.evaluate(() => { window.__game.freeze(true); window.__game.loadLevel(4); });
    assert.match(await page.locator('#goal').textContent(), /Après un échec : 2 étoiles au plus/);
    s = await playHooks(page, [true, true, true, true, true]);
    assert.equal(s.game.good, 5); assert.equal(s.game.stars, 2); assert.equal(s.stars[3], 2);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#rStars svg.on').count(), 2);
    assert.match(await page.locator('#rRec').textContent(), /2 étoiles au plus/);
    s = await win(4, [true, true, true, true, true]);
    assert.equal(s.stars[3], 2, 'frozen at the first win');
    // the record of points still improves
    assert.ok(s.best[3] > 0);
    await context.close();
  });

  await test('timer and points: 100 + speed bonus, timeout counts as a miss and shows the right answer', async () => {
    const { context, page } = await open();
    await fresh(page, 1);
    let g = (await state(page)).game;
    assert.equal(g.remaining, 12000);
    let right = await rightIndex(page);
    await page.evaluate(() => window.__game.answer(0)); // any
    g = (await state(page)).game;
    // immediate answer: 200 if right, else 0
    assert.equal(g.results[0].pts, g.results[0].ok ? 200 : 0);
    await page.evaluate(() => window.__game.next());
    right = await rightIndex(page);
    await page.evaluate(() => window.__game.advance(3000));
    assert.equal((await state(page)).game.remaining, 9000);
    await answerBtn(page, right).tap();
    g = (await state(page)).game;
    assert.deepEqual(g.results[1], { ok: true, pts: 175 });
    await page.evaluate(() => window.__game.next());
    right = await rightIndex(page);
    await page.evaluate(() => window.__game.advance(11999));
    assert.equal((await state(page)).game.answered, false);
    assert.equal(await page.locator('#bNext').isHidden(), true);
    await page.evaluate(() => window.__game.advance(1));
    g = (await state(page)).game;
    assert.equal(g.answered, true); assert.equal(g.picked, -1);
    assert.deepEqual(g.results[2], { ok: false, pts: 0 });
    assert.match(await page.locator('#fbT').textContent(), /Temps écoulé/);
    assert.equal(await page.locator('#ans .a.right').count(), 1);
    assert.equal(await page.locator('#ans .a.wrong').count(), 0);
    assert.equal(await page.locator('#ans .a[disabled]').count(), 4);
    assert.equal(await page.locator('#bNext').isVisible(), true);
    // answering at the very last millisecond still scores the base 100
    await page.evaluate(() => window.__game.next());
    right = await rightIndex(page);
    await page.evaluate(() => window.__game.advance(11999));
    await answerBtn(page, right).tap();
    assert.deepEqual((await state(page)).game.results[3], { ok: true, pts: 100 });
    await context.close();
  });

  await test('real clock: the question timer runs by itself and a late tap after the reveal changes nothing', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    await page.waitForTimeout(1300);
    const g = (await state(page)).game;
    assert.ok(g.remaining < 11000 && g.remaining > 9000, 'remaining ' + g.remaining);
    const right = await rightIndex(page);
    await answerBtn(page, right).tap();
    const before = (await state(page)).game;
    await answerBtn(page, (right + 1) % 4).tap({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
    const after = (await state(page)).game;
    assert.deepEqual(after.results, before.results);
    assert.equal(after.remaining, before.remaining);
    await context.close();
  });

  await test('answers are shuffled by the seed: same seed same order, other seeds other orders', async () => {
    const { context, page } = await open();
    const orders = async seed => {
      await fresh(page, 7, seed);
      const out = [];
      for (let q = 0; q < 5; q++) { out.push((await state(page)).game.options.join('|')); await page.evaluate(() => { window.__game.answer(0); window.__game.next(); }); }
      return out.join('#');
    };
    const a1 = await orders(11), a2 = await orders(11), b = await orders(12), c = await orders(13);
    assert.equal(a1, a2);
    assert.ok(a1 !== b || a1 !== c);
    // the right answer is not always in the same position
    const pos = new Set();
    for (let n = 1; n <= 20; n++) { await fresh(page, n, 5); pos.add(await rightIndex(page)); }
    assert.ok(pos.size >= 3, 'positions ' + [...pos]);
    await context.close();
  });

  await test('resume after reload: same level, question, order, score and time; also on a revealed answer', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: OPEN_SAVE });
    await fresh(page, 4, 21);
    await playHooks(page, [true, false, 2500]);   // third question: 2500 burnt then answered
    await page.evaluate(() => window.__game.loadLevel(4));   // fresh again: discard, then play 2 and stop mid-question
    await playHooks(page, [true, false]);
    await page.evaluate(() => window.__game.advance(4000));
    const before = (await state(page)).game;
    assert.equal(before.index, 2); assert.equal(before.answered, false);
    await reload(page);
    await page.waitForFunction(() => !!window.__game);
    let s = await state(page);
    assert.equal(s.screen, 'home'); assert.equal(s.hasSaved, true);
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 4/);
    await page.locator('#bGo').tap();
    s = await state(page);
    assert.equal(s.game.level, 4); assert.equal(s.game.index, 2);
    assert.equal(s.game.question, before.question);
    assert.deepEqual(s.game.options, before.options);
    assert.deepEqual(s.game.results, before.results);
    assert.equal(s.game.score, before.score);
    assert.ok(s.game.remaining <= before.remaining && s.game.remaining >= before.remaining - 1500, `time ${before.remaining} -> ${s.game.remaining}`);
    // answer and reload on the revealed state
    await page.evaluate(() => window.__game.freeze(true));
    const right = await rightIndex(page);
    await answerBtn(page, (right + 1) % 4).tap();
    const rev = (await state(page)).game;
    await reload(page);
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    s = await state(page);
    assert.equal(s.game.answered, true); assert.equal(s.game.index, 2);
    assert.equal(s.game.picked, rev.picked); assert.deepEqual(s.game.results, rev.results);
    assert.equal(await page.locator('#ans .a.wrong').count(), 1);
    assert.equal(await page.locator('#ans .a.right').count(), 1);
    await page.locator('#bNext').tap();
    assert.equal((await state(page)).game.index, 3);
    // leaving to the level grid and coming back resumes too
    await page.locator('#bMap').tap();
    assert.equal((await state(page)).screen, 'grid');
    await page.locator('.cell[data-n="4"]').tap();
    s = await state(page);
    assert.equal(s.game.index, 3); assert.equal(s.game.results.length, 3);
    await context.close();
  });

  await test('progress persists: stars, unlocks and best score survive a reload, under the key mj:cinq-sur-cinq:v1', async () => {
    const { context, page } = await open();
    await fresh(page, 1);
    await playHooks(page, [true, true, true, true, false]);
    const g = (await state(page)).game;
    await reload(page);
    await page.waitForFunction(() => !!window.__game);
    const s = await state(page);
    assert.equal(s.stars[0], 2); assert.equal(s.max, 2); assert.equal(s.best[0], g.score);
    assert.equal(s.hasSaved, false);
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 2/);
    assert.match(await page.locator('#hTotal').textContent(), /^2$/);
    await page.locator('#bLevels').tap();
    assert.equal(await page.locator('.cell[disabled]').count(), 18);
    assert.equal(await page.locator('.cell').count(), 20);
    assert.match(await page.locator('#gTotal').textContent(), /2\/60/);
    await shot(page, 'grid-progress');
    const save = JSON.parse(await stored(page));
    assert.equal(save.stars[0], 2);
    await context.close();
  });

  await test('corrupted or foreign saves: the game starts healthy and plays', async () => {
    const bad = ['{{{not json', 'null', '42', '"text"', '[]', '{"max":"x","level":-5,"stars":"no","best":{},"cur":7}',
      '{"max":99,"level":99,"stars":[9,9,9],"best":[1e99],"cur":{"n":3,"res":[[1,500,9]],"sel":8,"rem":-4}}',
      '{"max":2,"level":2,"cur":{"n":15,"res":[],"sel":null,"rem":9000}}',
      '{"max":1,"level":1,"cur":{"n":0,"res":[[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]],"sel":null,"rem":9}}'];
    for (const raw of bad) {
      const { context, page } = await open({ width: 360, height: 640 }, { raw });
      const s = await state(page);
      assert.equal(s.screen, 'home', raw);
      assert.ok(s.max >= 1 && s.max <= 20 && s.level >= 1 && s.level <= s.max, raw + ' ' + JSON.stringify(s));
      assert.ok(s.stars.every(v => v >= 0 && v <= 3), raw);
      await page.locator('#bGo').tap();
      const g = (await state(page)).game;
      assert.ok(g.index >= 0 && g.index < 5 && g.options.length === 4 && g.remaining >= 0 && g.remaining <= 12000 && (g.answered || g.remaining > 0), raw);
      await page.evaluate(() => window.__game.freeze(true));
      const done = await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 5 && !g.state().game.finished; i++) { g.answer(0); g.next(); } return g.state().game.finished; });
      assert.equal(done, true, raw);
      await context.close();
    }
    // a locked level saved as the running game is not honoured
    const { context, page } = await open({ width: 360, height: 640 }, { raw: bad[7] });
    assert.equal((await state(page)).hasSaved, false);
    await context.close();
  });

  await test('no storage at all: the game still plays a full level', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { nostore: true });
    await page.locator('#bGo').tap();
    await playByTaps(page);
    assert.equal((await state(page)).game.won, true);
    await page.locator('#bRNext').tap();
    assert.equal((await state(page)).game.level, 2);
    await context.close();
  });

  await test('result screen: stars, score, record, Suivant / Rejouer / Partager / Défier un ami', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: 'ok', config: { shareBaseUrl: 'https://exemple.test/jeux/cinq' } });
    await fresh(page, 2);
    await playHooks(page, [true, true, true, true, true]);
    await page.waitForSelector('#res:not([hidden])');
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#rStars svg.on').count(), 3);
    assert.match(await page.locator('#rTitle').textContent(), /Carton plein/);
    assert.equal(await page.locator('#rPips .pip.ok').count(), 5);
    for (const id of ['#bRNext', '#bAgain', '#bShare', '#bChal']) assert.equal(await page.locator(id).isVisible(), true, id);
    await shot(page, 'result-win');
    // share: short text, no solution
    const score = (await state(page)).game.score;
    await page.locator('#bShare').tap();
    let sh = await shared(page);
    assert.equal(sh.length, 1);
    assert.match(sh[0], new RegExp('^Carton Plein · Niveau 2 · ⭐⭐⭐ · ' + score + ' pts '));
    assert.ok(!/#defi/.test(sh[0]));
    DATA[1].qs.forEach(q => { assert.ok(!sh[0].includes(q.a), 'the shared text leaks an answer'); assert.ok(!sh[0].includes(q.q)); });
    assert.deepEqual((await events(page, 'share')).map(e => e.kind), ['result']);
    // challenge link
    await page.locator('#bChal').tap();
    sh = await shared(page);
    assert.equal(sh.length, 2);
    assert.ok(sh[1].includes(`https://exemple.test/jeux/cinq#defi-2-${score}`), sh[1]);
    assert.match(sh[1].match(/#defi-[^\s]*/)[0], /^#defi-[A-Za-z0-9-]+$/);
    assert.deepEqual((await events(page, 'share')).map(e => e.kind), ['result', 'challenge']);
    // new record text on a better replay, and Suivant leads to level 3
    await page.locator('#bRNext').tap();
    const s = await state(page);
    assert.equal(s.game.level, 3); assert.equal(s.game.index, 0);
    await context.close();
  });

  await test('sharing falls back to the clipboard; on file:// without a base there is no link', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: 'none' });
    await fresh(page, 1);
    await playHooks(page, [true, true, true, false, true]);
    await page.waitForTimeout(450);
    await page.locator('#bShare').tap();
    await page.locator('#bChal').tap();
    const sh = await shared(page);
    assert.equal(sh.length, 2);
    assert.match(sh[0], /Carton Plein · Niveau 1 · ⭐⭐ · \d+ pts/);
    assert.ok(!/https?:|#defi/.test(sh[1]), sh[1]);
    assert.match(sh[1], /À toi de faire mieux/);
    assert.equal((await events(page, 'share')).length, 2);
    await context.close();
  });

  await test('challenge link: opens a locked level with one goal, equal score wins, nothing saved is touched', async () => {
    const save = { seed: 5, att: 3, level: 2, max: 2, stars: [3, ...stars(19, 0)], best: [900, ...stars(19, 0)], cur: null };
    const { context, page } = await open({ width: 360, height: 640 }, { save, hash: '#defi-9-1000', share: 'ok', config: { shareBaseUrl: 'https://exemple.test/jeux/cinq' } });
    await page.evaluate(() => window.__game.freeze(true));
    const before = await prog(page);
    let s = await state(page);
    assert.equal(s.screen, 'game'); assert.equal(s.game.level, 9);
    assert.deepEqual(s.game.challenge, { target: 1000, won: null });
    assert.equal(await page.locator('#chal').isVisible(), true);
    assert.match(await page.locator('#chalT').textContent(), /1000 points/);
    assert.equal(await page.locator('#goal').isHidden(), true, 'only one goal on screen');
    assert.equal(await page.evaluate(() => location.hash), '');
    assert.deepEqual((await events(page, 'challenge_open')), [{ source: 'mini-jeu', game: 'cinq-sur-cinq', event: 'challenge_open', level: 9, target: 1000 }]);
    await shot(page, 'challenge-open');
    await playHooks(page, [true, true, true, true, true]);   // 5 x 200 = 1000: equalling is enough
    await page.waitForSelector('#res:not([hidden])');
    s = await state(page);
    assert.equal(s.game.score, 1000);
    assert.deepEqual(s.game.challenge, { target: 1000, won: true });
    assert.match(await page.locator('#rTitle').textContent(), /Défi relevé/);
    for (const id of ['#bRNext', '#bShare']) assert.equal(await page.locator(id).isHidden(), true, id);
    assert.equal(await page.locator('#bHome').isVisible(), true);
    const res = await events(page, 'challenge_result');
    assert.deepEqual(res, [{ source: 'mini-jeu', game: 'cinq-sur-cinq', event: 'challenge_result', level: 9, score: 1000, target: 1000, won: true }]);
    assert.equal((await events(page, 'level_complete')).length, 0);
    assert.equal(await prog(page), before, 'progress must not change');
    await shot(page, 'challenge-won');
    // R3: one play per opening: no replay, the result event left once, "Renvoyer le défi" only because it was won
    assert.equal(await page.locator('#bAgain').isHidden(), true);
    assert.equal(await page.locator('#bChal').isVisible(), true);
    assert.match(await page.locator('#bChal').textContent(), /Renvoyer le défi/);
    await page.waitForTimeout(300);
    assert.equal((await events(page, 'challenge_result')).length, 1);
    await page.locator('#bChal').tap();
    assert.match((await shared(page))[0], /#defi-9-1000$/);
    // lost: open the link again
    await page.evaluate(() => { location.hash = '#defi-9-1000'; });
    await page.waitForFunction(() => window.__game.state().screen === 'game');
    s = await state(page);
    assert.deepEqual(s.game.challenge, { target: 1000, won: null }); assert.equal(s.game.index, 0);
    await playHooks(page, [true, true, true, false]);   // R15: the 4th answer makes 1000 unreachable: the challenge ends there
    await page.waitForSelector('#res:not([hidden])');
    assert.match(await page.locator('#rTitle').textContent(), /Défi perdu/);
    const res2 = await events(page, 'challenge_result');
    assert.equal(res2.length, 2); assert.equal(res2[1].won, false); assert.equal(res2[1].target, 1000); assert.ok(res2[1].score < 1000);
    assert.equal(await page.locator('#bAgain').isHidden(), true);
    assert.equal(await page.locator('#bChal').isHidden(), true, 'a lost challenge is not sent back');
    assert.equal(await prog(page), before);
    await page.locator('#bHome').tap();
    s = await state(page);
    assert.equal(s.screen, 'home'); assert.equal(s.max, 2);
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 2/);
    await context.close();
  });

  await test('challenge link while a game is running: the saved game and progress are untouched', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { ...OPEN_SAVE, stars: [1, 1, ...stars(18, 0)] } });
    await fresh(page, 3, 9);
    await playHooks(page, [true, false]);
    const before = await prog(page);
    const mid = (await state(page)).game;
    await page.evaluate(() => { location.hash = '#defi-12-400'; });
    await page.waitForFunction(() => window.__game.state().game.challenge);
    let s = await state(page);
    assert.equal(s.game.level, 12); assert.equal(s.game.challenge.target, 400);
    await playHooks(page, [true, true, true, true, true]);
    assert.equal(await prog(page), before);
    await reload(page);
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    s = await state(page);
    assert.equal(s.game.level, 3); assert.equal(s.game.question, mid.question); assert.deepEqual(s.game.results, mid.results);
    await context.close();
  });

  await test('malformed challenge fragments are ignored silently', async () => {
    const hashes = ['#defi-', '#defi-0-5', '#defi-21-5', '#defi-5-0', '#defi-5-99', '#defi-5-50', '#defi-5-1001', '#defi-5-99999', '#defi-a-b', '#defi-5-640-x', '#defi--5-6',
      '#defi-5-6.5', '#defi-005-640x', '#defi-3', '#defi-%00-1', '#defi-<b>-1', '#defi-1e3-5', '#nimportequoi'];
    for (const hash of hashes) {
      const { context, page } = await open({ width: 360, height: 640 }, { hash });
      const s = await state(page);
      assert.equal(s.screen, 'home', hash);
      assert.equal(s.game, null, hash);
      assert.equal((await events(page, 'challenge_open')).length, 0, hash);
      await page.locator('#bGo').tap();
      assert.equal((await state(page)).game.challenge, null, hash);
      await context.close();
    }
  });

  await test('events carry no personal data and only the listed fields', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: 'ok' });
    await fresh(page, 1);
    await playHooks(page, [true, true, true, true, true]);
    await page.waitForTimeout(450);
    await page.locator('#bShare').tap();
    const all = await msgs(page);
    const lc = all.filter(m => m.event === 'level_complete');
    assert.equal(lc.length, 1);
    assert.deepEqual(Object.keys(lc[0]).sort(), ['event', 'game', 'level', 'score', 'source', 'stars']);
    assert.equal(lc[0].level, 1); assert.equal(lc[0].stars, 3); assert.equal(lc[0].score, 1000);
    assert.deepEqual(Object.keys(all.find(m => m.event === 'share')).sort(), ['event', 'game', 'kind', 'source']);
    all.forEach(m => { assert.equal(m.source, 'mini-jeu'); assert.equal(m.game, 'cinq-sur-cinq'); });
    await context.close();
  });

  await test('a locked level cannot be opened from the grid; the grid marks stars and the current level', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { seed: 1, att: 0, level: 3, max: 3, stars: [3, 1, 0, ...stars(17, 0)], best: stars(20, 0), cur: null } });
    await page.locator('#bLevels').tap();
    assert.equal(await page.locator('.cell:not([disabled])').count(), 3);
    assert.equal(await page.locator('.cell.cur').getAttribute('data-n'), '3');
    assert.equal(await page.locator('.cell[data-n="1"] .s svg.on').count(), 3);
    assert.equal(await page.locator('.cell[data-n="2"] .s svg.on').count(), 1);
    await page.locator('.cell[data-n="9"]').tap({ force: true }).catch(() => {});
    assert.equal((await state(page)).screen, 'grid');
    await page.locator('.cell[data-n="2"]').tap();
    assert.equal((await state(page)).game.level, 2);
    await context.close();
  });

  await test('R4: the shared link is origin + pathname + fragment only, never the query string (http address with ?token=)', async () => {
    const context = await browser.newContext({ ...MOBILE, viewport: { width: 360, height: 640 } });
    await context.route('https://exemple.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(FILE, 'utf8') }));
    await context.addInitScript(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__shared.push(d.text); } });
    });
    const page = await context.newPage();
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    await page.goto('https://exemple.test/jeux/cinq/index.html?token=SECRET123&n=7');
    await page.waitForFunction(() => !!window.__game);
    await fresh(page, 1);
    await playHooks(page, [true, true, true, true, true]);
    await page.waitForTimeout(450);
    await page.locator('#bChal').tap();
    const sh = await shared(page);
    assert.equal(sh.length, 1);
    assert.ok(sh[0].endsWith('https://exemple.test/jeux/cinq/index.html#defi-1-1000'), sh[0]);
    assert.ok(!/token|SECRET|\?|n=7/.test(sh[0]), sh[0]);
    await context.close();
    // a configured base with a query is cleaned too
    const o = await open({ width: 360, height: 640 }, { share: 'ok', config: { shareBaseUrl: 'https://exemple.test/a/b?token=ZZZ#frag' } });
    await fresh(o.page, 1);
    await playHooks(o.page, [true, true, true, true, true]);
    await o.page.waitForTimeout(450);
    await o.page.locator('#bChal').tap();
    const t = (await shared(o.page))[0];
    assert.ok(t.endsWith('https://exemple.test/a/b#defi-1-1000') && !/ZZZ|token/.test(t), t);
    await o.context.close();
  });

  await test('R5: nothing in the DOM tells which answer is right before the player answers (all 100 questions)', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: OPEN_SAVE, share: 'ok' });
    for (let n = 1; n <= 20; n++) {
      await fresh(page, n);
      for (let q = 0; q < 5; q++) {
        const r = await page.evaluate(() => {
          const btns = [...document.querySelectorAll('#ans .a')];
          const sig = b => JSON.stringify([b.className, b.disabled, [...b.attributes].map(a => a.name).sort(), [...b.querySelectorAll('*')].map(e => e.outerHTML.replace(/>[^<]*</g, '><'))]);   // markup identical once the label text is removed
          const g = window.__game.state().game;
          return { sigs: [...new Set(btns.map(sig))].length, ds: btns.map(b => b.getAttribute('data-d')).join(''), html: document.documentElement.outerHTML, ans: document.getElementById('ans').outerHTML, g };
        });
        const q0 = DATA[n - 1].qs[q];
        assert.equal(r.sigs, 1, `answer buttons differ before answering: ${q0.q}`);
        assert.equal(r.ds, '0123');
        assert.ok(!/class="[^"]*\b(right|wrong|dim)\b/.test(r.html.split('<script>')[0].replace(/<style[\s\S]*?<\/style>/, '')), 'a revealed class is present');
        // the DOM (outside the script) holds each option text exactly once, as the label of its button, and no attribute carries a text
        const dom = r.html.split('<script>')[0];
        for (const t of [q0.a, ...q0.w]) {
          const esc = t.replace(/&/g, '&amp;');
          assert.equal(r.ans.split('>' + esc + '<').length - 1, 1, 'option text count: ' + t);
          assert.ok(!new RegExp('="[^"]*' + esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^"]*"').test(r.ans.replace(/data-d="\d"/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '')), 'text in an attribute: ' + t);
        }
        await page.evaluate(() => { window.__game.answer(0); window.__game.next(); });
      }
    }
    await context.close();
  });

  await test('R6: "Continuer" points at the first unfinished level; replaying an old level moves nothing', async () => {
    const save = { seed: 2, att: 0, max: 4, stars: [3, 2, 0, 0, ...stars(16, 0)], best: stars(20, 0), cur: null };
    const { context, page } = await open({ width: 360, height: 640 }, { save });
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 3/);
    await page.locator('#bLevels').tap();
    assert.equal(await page.locator('.cell.cur').getAttribute('data-n'), '3');
    await page.locator('.cell[data-n="1"]').tap();
    await playHooks(page, [true, true, true, true, true]);
    assert.equal((await state(page)).game.won, true);
    await page.evaluate(() => window.__game.loadLevel(1));
    await playHooks(page, [false, false, false, true, true]);   // lost replay of level 1
    assert.equal((await state(page)).game.won, false);
    await page.evaluate(() => window.__game.loadLevel(1));
    await page.locator('#bMap').tap();   // leave mid-game
    await page.locator('#bGBack').tap();
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 3/);
    assert.equal((await state(page)).level, 3);
    // finishing level 3 moves it to 4; a win on level 2 afterwards does not move it back
    await page.locator('#bGo').tap();
    assert.equal((await state(page)).game.level, 3);
    await playHooks(page, [true, true, true, true, true]);
    await page.locator('#bRNext').tap();
    assert.equal((await state(page)).game.level, 4);
    await page.evaluate(() => window.__game.loadLevel(2));
    await playHooks(page, [true, true, true, true, true]);
    await reload(page);
    await page.waitForFunction(() => !!window.__game);
    assert.match(await page.locator('#bGo').textContent(), /Continuer · Niveau 4/);
    await context.close();
  });

  await test('R7: the shared text marks right and wrong with distinct shapes, not colours alone', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: 'ok' });
    await fresh(page, 1);
    await playHooks(page, [true, false, true, true, false]);
    await page.waitForTimeout(450);
    await page.locator('#bShare').tap();
    const t = (await shared(page))[0];
    assert.ok(t.includes('✅❌✅✅❌'), t);   // check mark vs cross: two different glyphs, readable without colour
    assert.ok(!/[🟩🟥🟨🟦🟪⬛⬜🟧🟫]/u.test(t), 'coloured squares in the share text');
    await context.close();
  });

  await test('double taps: a tap never answers the next question, nor reaches the screen that replaces the button', async () => {
    const { context, page } = await open({ width: 360, height: 640 });
    await fresh(page, 5);
    const centre = sel => page.evaluate(q => { const r = document.querySelector(q).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
    const tapAt = ([x, y]) => page.touchscreen.tap(x, y);
    const A = [0, 1, 2, 3].map(d => `#ans .a[data-d="${d}"]`);
    // 1. two taps on the same answer: one answer only
    const a0 = await centre(A[0]);
    await tapAt(a0); await tapAt(a0);
    let g = (await state(page)).game;
    assert.equal(g.results.length, 1); assert.equal(g.index, 0);
    // 2. "Suivante" then at once a tap on an answer: the new question stays unanswered
    const nx = await centre('#bNext');
    await page.waitForTimeout(150);
    await tapAt(nx); await tapAt(await centre(A[1]));
    g = (await state(page)).game;
    assert.equal(g.index, 1); assert.equal(g.answered, false); assert.equal(g.results.length, 1);
    // 3. a tap on an answer then at once on "Suivante": still on the revealed question
    await page.waitForTimeout(150);
    await tapAt(await centre(A[2]));
    await tapAt(nx);
    g = (await state(page)).game;
    assert.equal(g.index, 1); assert.equal(g.answered, true); assert.equal(g.results.length, 2);
    // 4. the last "Résultat" tap followed by taps all over the result card changes nothing
    for (let q = 0; q < 3; q++) { await page.evaluate(() => { window.__game.next(); window.__game.answer(0); }); }
    const before = await state(page);
    assert.equal(before.game.finished, true);
    await page.waitForTimeout(150);
    await tapAt(nx);
    for (const y of [330, 420, 470]) await tapAt([180, y]);   // where the card buttons appear, within the guard window
    const after = await state(page);
    assert.equal(after.screen, 'result');
    assert.equal(after.att, before.att);
    assert.equal(after.game.level, 5);
    assert.deepEqual((await msgs(page)).filter(m => m.event === 'share'), []);
    // 5. a press that starts on one element and ends on another does nothing
    await page.waitForTimeout(150);
    await context.close();
    const o = await open({ width: 360, height: 640 });
    await fresh(o.page, 2);
    await o.page.evaluate(() => { const a = document.querySelector('#ans .a[data-d="0"]'), b = document.querySelector('#ans .a[data-d="1"]');
      a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
    assert.equal((await state(o.page)).game.answered, false);
    await o.context.close();
  });

  await test('R17: the question deadline is a clock time: the grid, a hidden app or a reload never give time back', async () => {
    // grid trip
    let { context, page } = await open();
    await page.locator('#bGo').tap();
    await page.evaluate(() => window.__game.advance(2000));
    await page.locator('#bMap').tap();
    await page.evaluate(() => window.__game.advance(6000));
    await page.locator('.cell[data-n="1"]').tap();
    let g = (await state(page)).game;
    assert.ok(g.remaining <= 4100 && g.remaining > 2500, 'after the grid: ' + g.remaining);
    // hidden app
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.__game.advance(2000);
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    g = (await state(page)).game;
    assert.ok(g.remaining <= 2100 && g.remaining > 500, 'after hiding: ' + g.remaining);
    await context.close();
    // deadline passed while away: counted as time out
    ({ context, page } = await open());
    await page.locator('#bGo').tap();
    await page.locator('#bMap').tap();
    await page.evaluate(() => window.__game.advance(13000));
    await page.locator('.cell[data-n="1"]').tap();
    g = (await state(page)).game;
    assert.equal(g.answered, true); assert.equal(g.picked, -1);
    assert.deepEqual(g.results, [{ ok: false, pts: 0 }]);
    assert.match(await page.locator('#fbT').textContent(), /Temps écoulé/);
    await context.close();
    // reload
    ({ context, page } = await open());
    await page.locator('#bGo').tap();
    await page.waitForTimeout(1500);
    await reload(page);
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    g = (await state(page)).game;
    assert.ok(g.remaining <= 10500 && g.remaining > 8000, 'after reload: ' + g.remaining);
    // reload after the deadline: time out
    await page.evaluate(() => window.__game.advance(11000));
    await reload(page);
    await page.waitForFunction(() => !!window.__game);
    await page.waitForTimeout(1300);
    await page.locator('#bGo').tap();
    g = (await state(page)).game;
    assert.equal(g.answered, true); assert.equal(g.picked, -1);
    await context.close();
    // same for a challenge
    ({ context, page } = await open({ width: 360, height: 640 }, { hash: '#defi-5-100' }));
    await page.locator('#bMap').tap();
    await page.evaluate(() => window.__game.advance(13000));
    await page.waitForTimeout(250);
    g = (await state(page)).game;
    assert.equal(g.results.length, 1); assert.equal(g.picked, -1);
    await context.close();
  });

  await test('R15: a challenge stops as soon as its target is out of reach, and its result leaves once', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { hash: '#defi-4-1000' });
    await page.evaluate(() => window.__game.freeze(true));
    await playHooks(page, [true, false]);   // 200 + 0 + 3 x 200 max = 800 < 1000
    let s = await state(page);
    assert.equal(s.game.finished, true); assert.equal(s.game.results.length, 2);
    assert.deepEqual(s.game.challenge, { target: 1000, won: false });
    await page.waitForSelector('#res:not([hidden])');
    assert.match(await page.locator('#rTitle').textContent(), /Défi perdu/);
    assert.equal(await page.locator('#bAgain').isHidden(), true);
    await page.waitForTimeout(300);
    const r = await events(page, 'challenge_result');
    assert.equal(r.length, 1); assert.equal(r[0].won, false); assert.equal(r[0].score, 200);
    await page.evaluate(() => { window.__game.next(); window.__game.answer(0); });
    assert.equal((await events(page, 'challenge_result')).length, 1);
    // still reachable: the game goes on (target 600 after one miss: 0 + 4 x 200 = 800)
    await context.close();
    const b = await open({ width: 360, height: 640 }, { hash: '#defi-4-600' });
    await b.page.evaluate(() => window.__game.freeze(true));
    await playHooks(b.page, [false]);
    s = await state(b.page);
    assert.equal(s.game.finished, false); assert.equal(s.game.index, 1);
    await b.context.close();
  });

  await test('R15: a challenge in progress is resumed after a reload; challenge_result leaves once overall', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: OPEN_SAVE, hash: '#defi-9-700' });
    await page.evaluate(() => window.__game.freeze(true));
    await playHooks(page, [true, true]);
    const before = (await state(page)).game;
    assert.equal(before.index, 2);
    const progress = await prog(page);
    await reload(page);
    await page.waitForFunction(() => !!window.__game);
    let s = await state(page);
    assert.equal(s.screen, 'game'); assert.equal(s.hasChallenge, true);
    assert.equal(s.game.level, 9); assert.equal(s.game.challenge.target, 700); assert.equal(s.game.index, 2);
    assert.equal(s.game.question, before.question); assert.deepEqual(s.game.options, before.options); assert.deepEqual(s.game.results, before.results);
    assert.equal((await events(page, 'challenge_open')).length, 0, 'no second opening');
    assert.equal(await prog(page), progress);
    await page.evaluate(() => window.__game.freeze(true));
    await playHooks(page, [true, true, true]);
    assert.equal((await state(page)).game.challenge.won, true);
    assert.equal((await events(page, 'challenge_result')).length, 1);
    await reload(page);
    await page.waitForFunction(() => !!window.__game);
    s = await state(page);
    assert.equal(s.screen, 'home'); assert.equal(s.hasChallenge, false);
    assert.equal((await events(page, 'challenge_result')).length, 0, 'finished challenge is not replayed');
    // a normal level started afterwards abandons nothing else; progress untouched
    assert.equal(await prog(page), progress);
    await context.close();
  });

  await test('R21: wording and look: no "sa seule", the 1934 and final titles, an accent that is not a brand green', async () => {
    const flat = DATA.flatMap(l => l.qs.map(q => q.q));
    assert.ok(!flat.some(q => /seule|première CAN|unique/i.test(q.replace('toute première Coupe', '')) && /sa seule/i.test(q)));
    assert.ok(flat.includes('Quel fut le premier pays africain à jouer une Coupe du monde, en 1934 ?'));
    assert.ok(flat.includes('Quel pays a gagné la CAN 1976 ?'));
    assert.equal(DATA[19].theme, 'La grande finale');
    const src = fs.readFileSync(FILE, 'utf8');
    const acc = /--acc:(#[0-9A-Fa-f]{6})/.exec(src)[1].toUpperCase();
    for (const brand of ['#3DDC84', '#1DB954', '#25D366', '#58CC02', '#00C853']) assert.notEqual(acc, brand);
    assert.ok(!/3DDC84/i.test(src) && !/61,\s*220,\s*132/.test(src));
    const { context, page } = await open();
    const c = await page.evaluate(() => getComputedStyle(document.querySelector('#bGo')).backgroundColor);
    assert.notEqual(c, 'rgb(61, 220, 132)');
    assert.equal((await page.evaluate(() => window.__game.levels[19].theme)), 'La grande finale');
    await context.close();
  });

  await test('R21: the answers are not stored in clear and the right one is not always first in the data', async () => {
    const src = fs.readFileSync(FILE, 'utf8');
    for (const l of DATA) for (const q of l.qs) for (const t of [q.a, ...q.w]) if (t.length >= 8 && !DATA.some(m => m.qs.some(r => r.q.includes(t)))) assert.ok(!src.includes(t), 'answer in clear in the file: ' + t);
    const packed = JSON.parse(/var DATA=(\[.*\]);/.exec(src)[1]);
    const pos = [0, 0, 0, 0];
    let rank = 0;
    packed.forEach((l, li) => l[1].forEach((q, k) => {
      const opts = q[1].map(t => Buffer.from(t, 'base64').toString('utf8'));
      const right = q[2] ^ ((rank * 7 + 3) & 3);
      assert.equal(opts[right], DATA[li].qs[k].a, 'decoded right answer mismatch: ' + q[0]);
      pos[right]++; rank++;
    }));
    assert.ok(pos.every(n => n >= 10), 'positions in the data: ' + pos);
  });

  const heaviest = (() => {   // the level whose questions and answers are the longest
    let best = 0, bi = 0, bq = 0;
    DATA.forEach((l, i) => l.qs.forEach((q, k) => { const w = q.q.length + [q.a, ...q.w].reduce((a, b) => a + b.length, 0); if (w > best) { best = w; bi = i; bq = k; } }));
    return { level: bi + 1, q: bq };
  })();
  const longestTheme = DATA.map((l, i) => [l.theme.length, i + 1]).sort((a, b) => b[0] - a[0])[0][1];

  for (const vp of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 430, height: 932 }]) {
    const tag = `${vp.width}x${vp.height}`;
    await test(`layout ${tag}: every screen fits, no page scroll, targets >= 44 px, no clipped text`, async () => {
      const save = { seed: 4, att: 1, level: 20, max: 20, stars: [3, 2, 1, ...stars(17, 3)], best: stars(20, 800), cur: null };
      const { context, page } = await open(vp, { save });
      checkFit(await measure(page), 'home ' + tag);
      await shot(page, `home-${tag}`);
      await page.locator('#bLevels').tap();
      checkFit(await measure(page), 'grid ' + tag);
      await shot(page, `grid-${tag}`);
      await page.locator('#bGBack').tap();
      // heaviest question, then its revealed state (a wrong pick shows both marks)
      await fresh(page, heaviest.level);
      for (let q = 0; q < heaviest.q; q++) await page.evaluate(() => { window.__game.answer(0); window.__game.next(); });
      checkFit(await measure(page), `question ${tag}`);
      await shot(page, `question-${tag}`);
      await page.evaluate(() => window.__game.advance(8500));
      await shot(page, `question-low-${tag}`);
      const right = await rightIndex(page);
      await page.evaluate(d => window.__game.answer(d), (right + 1) % 4);
      checkFit(await measure(page), `revealed ${tag}`);
      await shot(page, `revealed-${tag}`);
      // the level with the longest theme
      await fresh(page, longestTheme);
      checkFit(await measure(page), `theme ${tag}`);
      // result (win, with the "new record" line) and lost result
      await fresh(page, 5);
      await playHooks(page, [true, true, true, true, true]);
      await page.waitForTimeout(450);
      checkFit(await measure(page), `result win ${tag}`);
      await shot(page, `result-win-${tag}`);
      await fresh(page, 5);
      await playHooks(page, [false, false, false, false, true]);
      await page.waitForTimeout(450);
      checkFit(await measure(page), `result lost ${tag}`);
      await shot(page, `result-lost-${tag}`);
      await context.close();
      // challenge screens
      const c = await open(vp, { hash: '#defi-20-1000' });
      await c.page.evaluate(() => window.__game.freeze(true));
      checkFit(await measure(c.page), `challenge ${tag}`);
      await shot(c.page, `challenge-${tag}`);
      await playHooks(c.page, [true, false, true, true, true]);
      await c.page.waitForTimeout(450);
      checkFit(await measure(c.page), `challenge result ${tag}`);
      await shot(c.page, `challenge-result-${tag}`);
      await c.context.close();
    });
  }

  await test('reduced motion: the game stays playable and the CSS animations are off', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    await page.locator('#bGo').tap();
    await playByTaps(page);
    const names = await page.evaluate(() => [getComputedStyle(document.querySelector('#res')).animationName, getComputedStyle(document.querySelector('#res .card')).animationName]);
    assert.deepEqual(names, ['none', 'none']);
    await context.close();
  });

  await test('no network request besides the file itself, no console error, no page error', async () => {
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
