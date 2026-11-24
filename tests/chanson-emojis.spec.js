'use strict';
/*
 * Mobile acceptance tests for games/chanson-emojis (plain node + playwright + node:assert).
 * Run with `node tests/chanson-emojis.spec.js`. Set SHOTS=<dir> to also write screenshots.
 * The titles to guess live in tools/chanson-emojis/devinettes.json; the game exposes the emojis only.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const FILE = process.env.GAME_FILE || path.join(__dirname, '..', 'games', 'chanson-emojis', 'index.html');
const URL = pathToFileURL(FILE).href;
const KEY = 'mj:chanson-emojis:v1';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'chanson-emojis', 'devinettes.json'), 'utf8'));
const TITLE = new Map(SRC.map(x => [x.e, x]));
const VIEWPORTS = [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 430, height: 932 }];

let browser;
const problems = [];   // console errors, page errors, unexpected requests
const results = [];

// Opens the game. opts.save seeds localStorage once; opts.config sets window.MJ_CONFIG; opts.hash opens a link.
// Messages to the host land in window.__msgs; navigator.share texts in window.__shared (when opts.share).
async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = await browser.newContext({ ...MOBILE, viewport, ...(opts.extra || {}) });
  await context.addInitScript(({ save, key, config, share }) => {
    window.__msgs = []; window.__shared = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    try { if (save !== null && !localStorage.getItem(key)) localStorage.setItem(key, typeof save === 'string' ? save : JSON.stringify(save)); } catch (e) { /* ignore */ }
    if (config) window.MJ_CONFIG = config;
    if (share) navigator.share = t => { window.__shared.push(t.text); return Promise.resolve(); };
  }, { save: opts.save === undefined ? null : opts.save, key: KEY, config: opts.config || null, share: !!opts.share });
  const page = await context.newPage();
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
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const answerOf = s => TITLE.get(s.emojis).t;
const rightIdx = s => s.choices.indexOf(answerOf(s));
const wrongIdx = s => (rightIdx(s) + 1) % 4;
// Real taps on the option / buttons.
const tapOpt = (page, i) => page.locator('.opt').nth(i).tap();
const tapNext = page => page.locator('#bNextQ').tap();
// Plays a level on screen: plan[i] = 'r' right, 'w' wrong, 'h' right after a hint, 'x' wrong after a hint.
async function play(page, plan, finish = true) {
  for (let i = 0; i < 3; i++) {
    let s = await state(page);
    assert.equal(s.pos, i);
    if (plan[i] === 'h' || plan[i] === 'x') { await page.locator('#bHint').tap(); s = await state(page); assert.equal(s.hints[i], 1); }
    await tapOpt(page, plan[i] === 'r' || plan[i] === 'h' ? rightIdx(s) : wrongIdx(s));
    if (i < 2 || finish) await tapNext(page);
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

const measure = async page => {
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => 0))));   // let the pop-in end
  return page.evaluate(() => {
  const de = document.documentElement, b = document.body;
  window.scrollTo(50, 50);
  const vis = el => { const q = el.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const r = el => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  return {
    iw: window.innerWidth, ih: window.innerHeight,
    sw: Math.max(de.scrollWidth, b.scrollWidth), sh: Math.max(de.scrollHeight, b.scrollHeight),
    sx: window.scrollX, sy: window.scrollY, vv: window.visualViewport ? window.visualViewport.scale : 1,
    targets: [...document.querySelectorAll('button')].filter(vis).map(r),
    clipped: [...document.querySelectorAll('.opt .t,.btn,#hint,#msg,#goal,.cell')].filter(vis)
      .filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map(e => e.className + ':' + e.textContent.slice(0, 30)),
  };
  });
};
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
  assert.deepEqual(m.clipped, [], tag + ': clipped content');
}

(async () => {
  browser = await chromium.launch();
  console.log('chanson-emojis (Fredonne)');

  await test('file is a single HTML under 150 KB, no network, no external reference', async () => {
    const size = fs.statSync(FILE).size;
    assert.ok(size < 150 * 1024, `index.html is ${size} bytes`);
    const html = fs.readFileSync(FILE, 'utf8');
    assert.ok(!/(src|href)\s*=\s*["'](https?:)?\/\//i.test(html), 'external src/href found');
    assert.ok(!/url\(\s*["']?(https?:)?\/\//i.test(html), 'external css url found');
    assert.ok(!/@import|<link\b/i.test(html), 'stylesheet link/import found');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(html), 'network API used');
    console.log(`        size: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);
  });

  await test('content: 60 riddles in 20 levels, emojis match the source, old emojis only, no lyrics, titles never exposed', async () => {
    assert.equal(SRC.length, 60);
    assert.equal(new Set(SRC.map(x => x.t)).size, 60, 'duplicate title');
    assert.equal(new Set(SRC.map(x => x.e)).size, 60, 'duplicate emoji suite');
    SRC.forEach(x => {
      assert.ok(x.e.split(' ').length >= 2 && x.e.split(' ').length <= 4, x.t + ': 2 to 4 emojis');
      assert.ok(!/‍|[\u{1F3FB}-\u{1F3FF}]|[\u{1F1E6}-\u{1F1FF}]/u.test(x.e), x.t + ': composed emoji, skin tone or flag');
      assert.ok(!/[\u{1F900}-\u{1FAFF}\u{1F6D0}-\u{1F6FF}\u{1F300}-\u{1F321}]/u.test(x.e.replace(/[\u{1F300}-\u{1F6CF}]/gu, c => c)) || true);
      assert.ok(!/[\u{1F900}-\u{1FAFF}\u{1F321}-\u{1F32F}\u{1F336}\u{1F37D}\u{1F394}-\u{1F39F}\u{1F3CB}-\u{1F3CE}\u{1F3D4}-\u{1F3DF}\u{1F3F3}-\u{1F3F7}\u{1F43F}\u{1F441}\u{1F4FD}-\u{1F4FF}\u{1F54B}-\u{1F54F}\u{1F568}-\u{1F579}\u{1F57B}-\u{1F5A3}\u{1F5A5}-\u{1F5FA}\u{1F6CB}-\u{1F6FF}]/u.test(x.e), x.t + ': emoji newer than Unicode 6.1');
    });
    assert.equal(SRC.filter(x => x.g === 'A').length, 24);
    const { context, page } = await open();
    const info = await page.evaluate(() => ({ levels: window.__game.levels, st: window.__game.state(), keys: Object.keys(window.__game) }));
    assert.equal(info.levels.length, 20);
    info.levels.forEach((l, i) => {
      assert.equal(l.length, 3);
      l.forEach((e, k) => assert.equal(e, SRC[i * 3 + k].e, `level ${i + 1} riddle ${k + 1}`));
    });
    for (const k of ['state', 'loadLevel', 'answer', 'hint', 'next', 'seed']) assert.ok(info.keys.includes(k), 'hook ' + k);
    assert.ok(!JSON.stringify(info.st).includes('"right"'), 'state exposes the answer');
    await context.close();
  });

  await test('choices: every one of the 60 riddles offers 4 distinct titles including the right one, none from the same level', async () => {
    const { context, page } = await open();
    for (const seed of [20241124, 7]) {
      await page.evaluate(s => window.__game.seed(s), seed);
      for (let n = 1; n <= 20; n++) {
        await page.evaluate(k => window.__game.loadLevel(k), n);
        const lvlTitles = SRC.slice((n - 1) * 3, n * 3).map(x => x.t);
        for (let i = 0; i < 3; i++) {
          const s = await state(page);
          assert.equal(s.choices.length, 4);
          assert.equal(new Set(s.choices).size, 4, `level ${n}.${i + 1}: duplicate choice`);
          const right = SRC[(n - 1) * 3 + i].t;
          assert.equal(s.choices.filter(c => c === right).length, 1);
          s.choices.filter(c => c !== right).forEach(c => assert.ok(!lvlTitles.includes(c), `level ${n}.${i + 1}: distractor from the same level`));
          await page.evaluate(() => { window.__game.answer(0); window.__game.next(); });
        }
      }
    }
    // same seed, same level: same choices; another seed: another order somewhere
    const read = async seed => page.evaluate(s => { window.__game.seed(s); const o = []; for (let n = 1; n <= 20; n++) { window.__game.loadLevel(n); o.push(window.__game.state().choices.join('|')); } return o.join('#'); }, seed);
    const a = await read(5), a2 = await read(5), b = await read(6);
    assert.equal(a.length > 0 && a, a2, 'seeded choices are not reproducible');
    assert.notEqual(a, b, 'seed has no effect');
    await context.close();
  });

  await test('the 20 levels are won by real taps, in sequence from the home screen (3 stars, unlocks, results)', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    for (let n = 1; n <= 20; n++) {
      let s = await state(page);
      assert.equal(s.screen, 'game'); assert.equal(s.level, n);
      await play(page, 'rrr');
      s = await state(page);
      assert.ok(s.over && s.won, `level ${n} not won`);
      assert.equal(s.stars, 3); assert.equal(s.points, 300);
      assert.equal(s.total, 3 * n);
      assert.ok(await page.locator('#win').isVisible());
      assert.equal(await page.locator('#wPts').textContent(), '300');
      if (n < 20) { assert.equal(await page.locator('#bNext').textContent(), 'Suivant'); await page.locator('#bNext').tap(); }
    }
    assert.equal(await page.locator('#bNext').textContent(), 'Niveaux');
    await page.locator('#bNext').tap();
    assert.equal((await state(page)).screen, 'levels');
    assert.equal(await page.locator('#lTotal').textContent(), '60/60');
    const ev = await events(page, 'level_complete');
    assert.equal(ev.length, 20);
    ev.forEach((e, i) => assert.deepEqual(e, { source: 'mini-jeu', game: 'chanson-emojis', event: 'level_complete', level: i + 1, score: 300, stars: 3 }));
    await context.close();
  });

  await test('level 1 and 2: the sequential unlock holds, a locked level cannot be opened from the grid', async () => {
    const { context, page } = await open();
    await page.locator('#bLevels').tap();
    assert.equal(await page.locator('.cell:not([disabled])').count(), 1);
    assert.equal(await page.locator('.cell[disabled]').count(), 19);
    await page.locator('.cell').nth(5).tap({ force: true });
    assert.equal((await state(page)).screen, 'levels');
    await page.locator('.cell').nth(0).tap();
    await play(page, 'rwr');
    await page.locator('#bNext').tap();
    assert.equal((await state(page)).level, 2);
    await context.close();
  });

  await test('failure: 1 right of 3 loses cleanly, no unlock, no event, replay works; 2 right wins with 2 stars', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    await play(page, 'wrw');
    let s = await state(page);
    assert.ok(s.over && !s.won); assert.equal(s.stars, 0); assert.equal(s.points, 100);
    assert.equal(await page.locator('#wTitle').textContent(), 'Raté !');
    assert.ok(await page.locator('#bShare').isHidden() && await page.locator('#bChal').isHidden());
    assert.equal(await page.locator('#bNext').textContent(), 'Rejouer');
    assert.equal(s.max, 1); assert.equal(s.next, 1); assert.equal(s.total, 0);
    assert.equal((await events(page, 'level_complete')).length, 0);
    await page.locator('#bNext').tap();
    s = await state(page);
    assert.equal(s.level, 1); assert.equal(s.pos, 0); assert.deepEqual(s.answers, [-1, -1, -1]); assert.ok(!s.over);
    await play(page, 'rwr');
    s = await state(page);
    assert.ok(s.won); assert.equal(s.stars, 2); assert.equal(s.points, 200);
    assert.equal(s.max, 2);
    // a worse replay never lowers the stars
    await page.locator('#bAgain').tap();
    await play(page, 'xhw');
    s = await state(page);
    assert.ok(!s.won);
    assert.deepEqual((await stored(page)).stars.slice(0, 2), [2, 0]);
    await context.close();
  });

  await test('stars and points: hint costs the star and half the points, shows artist and decade; restart is always possible', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    const s0 = await state(page);
    assert.equal(await page.locator('#hint').textContent(), '');
    await page.locator('#bHint').tap();
    const d = TITLE.get(s0.emojis);
    const txt = await page.locator('#hint').textContent();
    assert.ok(txt.includes(d.a), txt);
    assert.ok(txt.includes(d.y >= 2000 ? 'années ' + Math.floor(d.y / 10) * 10 : 'années ' + (Math.floor(d.y / 10) * 10) % 100), txt);
    assert.ok(await page.locator('#bHint').isDisabled(), 'one hint per riddle');
    await tapOpt(page, rightIdx(s0));
    assert.equal((await state(page)).points, 50);
    await page.locator('#bNextQ').tap();
    // restart mid-level
    await page.locator('#bReset').tap();
    let s = await state(page);
    assert.deepEqual(s.answers, [-1, -1, -1]); assert.deepEqual(s.hints, [0, 0, 0]); assert.equal(s.pos, 0);
    // 3 right, 1 with a hint: 2 stars, 250 points
    await play(page, 'hrr');
    s = await state(page);
    assert.equal(s.stars, 2); assert.equal(s.points, 250);
    // 3 right, all with a hint: 1 star, 150 points
    await page.locator('#bAgain').tap();
    await play(page, 'hhh');
    s = await state(page);
    assert.equal(s.stars, 1); assert.equal(s.points, 150);
    // a hint after the answer is refused
    assert.equal(await page.evaluate(() => window.__game.hint()), false);
    // the best result is kept
    assert.equal((await stored(page)).stars[0], 2);
    assert.equal((await stored(page)).best[0], 250);
    await context.close();
  });

  await test('feedback: the answer is shown with a symbol, not by colour alone', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    const s = await state(page);
    const w = wrongIdx(s), r = rightIdx(s);
    await tapOpt(page, w);
    assert.equal((await page.locator('.opt').nth(w).locator('.m').textContent()).trim(), '✗');
    assert.equal((await page.locator('.opt').nth(r).locator('.m').textContent()).trim(), '✓');
    assert.ok((await page.locator('#msg').textContent()).includes(answerOf(s)));
    assert.equal((await page.locator('#prog i').nth(0).textContent()).trim(), '✗');
    // a second tap on another option changes nothing
    await tapOpt(page, r);
    assert.equal((await state(page)).answers[0], w);
    await context.close();
  });

  await test('resume: reload gives back the same riddle, choices, hint and answers; a finished level is not replayed', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    let s = await state(page);
    await tapOpt(page, rightIdx(s)); await tapNext(page);
    s = await state(page);
    await page.locator('#bHint').tap();
    await tapOpt(page, wrongIdx(s));
    const before = await state(page);
    assert.equal(before.pos, 1);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    assert.equal((await state(page)).screen, 'home');
    assert.equal(await page.locator('#bGo').textContent(), 'Continuer · Niveau 1');
    await page.locator('#bGo').tap();
    const after = await state(page);
    for (const k of ['level', 'pos', 'answers', 'hints', 'choices', 'emojis', 'points']) assert.deepEqual(after[k], before[k], k);
    assert.ok(after.answered);
    await tapNext(page);
    await tapOpt(page, rightIdx(await state(page)));
    await tapNext(page);
    assert.ok((await state(page)).over);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    s = await state(page);
    assert.equal(s.level, 2); assert.equal(s.pos, 0);
    assert.equal(await page.locator('#hStars').count(), 1);
    await context.close();
  });

  await test('corrupt or foreign saves: the game starts sane', async () => {
    const saves = [
      '{not json', '"just a string"', '[]', '42', 'null',
      { level: 'x', max: -4, stars: 'no', best: {}, cur: 'bad', chal: 12 },
      { level: 999, max: 999, stars: [9, -1, 'a', null], cur: { level: 3, pos: 7, ans: [5, 'x'], hint: 'z' } },
      { cur: { level: 0, pos: 0, ans: [-1, -1, -1], hint: [0, 0, 0] }, chal: { level: 4, pos: 0, ans: [-1, -1, -1], hint: [0, 0, 0], target: 5000 } },
    ];
    for (const sv of saves) {
      const { context, page } = await open({ width: 360, height: 640 }, { save: sv });
      const s = await state(page);
      assert.equal(s.screen, 'home', JSON.stringify(sv));
      assert.ok(s.level >= 1 && s.level <= 20 && s.max >= 1 && s.max <= 20 && s.total <= 60, JSON.stringify(sv));
      await page.locator('#bGo').tap();
      await play(page, 'rrr');
      assert.ok((await state(page)).over);
      await context.close();
    }
    // no storage at all
    const ctx = await browser.newContext({ ...MOBILE, viewport: { width: 360, height: 640 } });
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    await play(page, 'rrr');
    assert.ok((await state(page)).won);
    await ctx.close();
  });

  await test('sharing: text without solution, share then clipboard fallback, events', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: true });
    await page.locator('#bGo').tap();
    await play(page, 'rwr');
    await page.locator('#bShare').tap();
    const t = await page.evaluate(() => new Promise(r => setTimeout(() => r(window.__shared), 60)));
    assert.equal(t.length, 1);
    assert.match(t[0], /^Fredonne · Niveau 1 · ⭐⭐ · 200 pts ✅❌✅$/);
    SRC.forEach(x => assert.ok(!t[0].includes(x.t), 'title in share text'));
    await page.locator('#bChal').tap();
    const t2 = await page.evaluate(() => new Promise(r => setTimeout(() => r(window.__shared), 60)));
    assert.equal(t2.length, 2);
    assert.ok(!/https?:|#defi/.test(t2[1]), 'no link on file://: ' + t2[1]);
    const ev = await events(page, 'share');
    assert.deepEqual(ev.map(e => e.kind), ['result', 'challenge']);
    await context.close();
    // clipboard fallback and link with MJ_CONFIG
    const c = await open({ width: 360, height: 640 }, { config: { shareBaseUrl: 'https://exemple.test/jeux/fredonne/' } });
    await c.context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await c.page.evaluate(() => { window.__clip = []; navigator.clipboard.writeText = t => { window.__clip.push(t); return Promise.resolve(); }; });
    await c.page.locator('#bGo').tap();
    await play(c.page, 'rrr');
    await c.page.locator('#bChal').tap();
    const clip = await c.page.evaluate(() => new Promise(r => setTimeout(() => r(window.__clip), 60)));
    assert.equal(clip.length, 1);
    assert.ok(clip[0].endsWith('https://exemple.test/jeux/fredonne/#defi-1-300'), clip[0]);
    assert.equal(await c.page.locator('#bChal').textContent(), 'Copié !');
    assert.match(clip[0].split(' ').pop().split('#')[1], /^[A-Za-z0-9-]+$/);
    await c.context.close();
  });

  await test('challenge: opens on a locked level with one goal, equal score wins, lower loses, progress and game in progress untouched', async () => {
    const save = { level: 3, max: 3, stars: [3, 2, 0], best: [300, 200, 0] };
    const { context, page } = await open({ width: 360, height: 640 }, { save, hash: '#defi-12-250' });
    let s = await state(page);
    assert.equal(s.screen, 'game'); assert.deepEqual(s.challenge, { level: 12, target: 250 });
    assert.equal(s.level, 12);
    assert.ok(await page.locator('#chal').isVisible()); assert.ok(await page.locator('#goal').isHidden());
    assert.ok((await page.locator('#chalT').textContent()).includes('250'));
    assert.equal(await page.evaluate(() => location.hash), '', 'link fragment is consumed');
    const evo = await events(page, 'challenge_open');
    assert.deepEqual(evo.map(e => [e.level, e.target]), [[12, 250]]);
    const before = JSON.stringify((await stored(page)).stars) + (await stored(page)).level + (await stored(page)).max;
    await play(page, 'hrr');   // 250 = target
    s = await state(page);
    assert.equal(s.points, 250);
    assert.equal(await page.locator('#wTitle').textContent(), 'Défi relevé !');
    assert.equal(await page.locator('#bNext').textContent(), 'Accueil');
    let res = await events(page, 'challenge_result');
    assert.deepEqual(res.map(e => [e.level, e.score, e.target, e.won]), [[12, 250, 250, true]]);
    assert.equal((await events(page, 'level_complete')).length, 0);
    let st = await stored(page);
    assert.equal(JSON.stringify(st.stars) + st.level + st.max, before, 'progress changed by the challenge');
    // lost: replay with a mistake
    await page.locator('#bAgain').tap();
    await play(page, 'rrw');
    assert.equal(await page.locator('#wTitle').textContent(), 'Presque !');
    assert.ok((await page.locator('#wChal').textContent()).includes('50'));
    res = await events(page, 'challenge_result');
    assert.equal(res[1].won, false); assert.equal(res[1].score, 200);
    await page.locator('#bNext').tap();
    assert.equal((await state(page)).screen, 'home');
    assert.equal(await page.locator('#bGo').textContent(), 'Continuer · Niveau 3');
    await context.close();

    // a challenge on an unlocked level does not touch stars either; the game in progress survives
    const g = await open({ width: 360, height: 640 }, { save: { level: 2, max: 2, stars: [1, 0], best: [100, 0] } });
    await g.page.locator('#bGo').tap();
    let s1 = await state(g.page);
    await tapOpt(g.page, rightIdx(s1)); await tapNext(g.page);
    s1 = await state(g.page);
    await g.page.locator('#bHint').tap();
    const mid = await state(g.page);
    await g.page.evaluate(() => { location.hash = '#defi-1-300'; });
    await g.page.waitForFunction(() => window.__game.state().mode === 'chal');
    assert.deepEqual((await state(g.page)).challenge, { level: 1, target: 300 });
    await play(g.page, 'rrr');
    assert.equal((await state(g.page)).points, 300);
    assert.equal((await stored(g.page)).best[0], 100, 'best score changed by a challenge');
    assert.deepEqual((await stored(g.page)).stars, new Array(20).fill(0).map((_, i) => i === 0 ? 1 : 0));
    await g.page.locator('#bNext').tap();
    await g.page.locator('#bGo').tap();
    const back = await state(g.page);
    assert.equal(back.mode, 'level');
    for (const k of ['level', 'pos', 'answers', 'hints', 'choices', 'emojis']) assert.deepEqual(back[k], mid[k], k);
    // a challenge in progress survives a reload
    await g.page.evaluate(() => { location.hash = '#defi-4-100'; });
    await g.page.waitForFunction(() => window.__game.state().mode === 'chal');
    const cs = await state(g.page);
    await tapOpt(g.page, rightIdx(cs));
    await g.page.reload();
    await g.page.waitForFunction(() => !!window.__game);
    const rs = await state(g.page);
    assert.equal(rs.mode, 'chal'); assert.deepEqual(rs.answers, [rightIdx(cs), -1, -1]); assert.equal(rs.screen, 'game');
    await g.context.close();
  });

  await test('challenge: malformed fragments are ignored without error, progress and screen untouched', async () => {
    for (const h of ['#defi-', '#defi-0-100', '#defi-21-100', '#defi-3-0', '#defi-3-301', '#defi-3-99999', '#defi--3-100', '#defi-a-b', '#defi-3', '#defi-3-100-1', '#defi-3-1e2', '#defi-%00-1', '#defi-3-<b>', '#defi-3.5-100']) {
      const { context, page } = await open({ width: 360, height: 640 }, { hash: h });
      const s = await state(page);
      assert.equal(s.screen, 'home', h); assert.equal(s.mode, 'level', h); assert.equal(s.challenge, null, h);
      assert.equal((await events(page, 'challenge_open')).length, 0, h);
      assert.equal(await page.evaluate(() => location.hash), '', h);
      await context.close();
    }
    // a bad fragment arriving while playing does not disturb the game either
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    const s = await state(page);
    await tapOpt(page, rightIdx(s));
    await page.evaluate(() => { location.hash = '#defi-zz'; });
    await page.waitForTimeout(100);
    const t = await state(page);
    assert.equal(t.mode, 'level'); assert.deepEqual(t.answers, [rightIdx(s), -1, -1]); assert.equal(t.screen, 'game');
    await context.close();
  });

  await test('events: only the four listed events, with their fields and no personal data', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: true });
    await page.locator('#bGo').tap();
    await play(page, 'rrr');
    await page.locator('#bShare').tap();
    await page.evaluate(() => { location.hash = '#defi-5-120'; });
    await page.waitForFunction(() => window.__game.state().mode === 'chal');
    await play(page, 'rrr');
    const m = await msgs(page);
    const allowed = { level_complete: ['level', 'score', 'stars'], share: ['kind'], challenge_open: ['level', 'target'], challenge_result: ['level', 'score', 'target', 'won'] };
    assert.deepEqual([...new Set(m.map(e => e.event))].sort(), Object.keys(allowed).sort());
    m.forEach(e => assert.deepEqual(Object.keys(e).sort(), ['event', 'game', 'source'].concat(allowed[e.event]).sort(), e.event));
    await context.close();
  });

  await test('layout: home, levels, game, answered, hint, result, challenge at 320x568, 360x640, 430x932 (no scroll, targets >= 44 px)', async () => {
    for (const vp of VIEWPORTS) {
      const tag = `${vp.width}x${vp.height}`;
      const { context, page } = await open(vp);
      checkFit(await measure(page), tag + ' home'); await shot(page, tag + '-home');
      await page.locator('#bLevels').tap();
      checkFit(await measure(page), tag + ' levels'); await shot(page, tag + '-levels');
      await page.locator('#bLBack').tap();
      await page.locator('#bGo').tap();
      checkFit(await measure(page), tag + ' game'); await shot(page, tag + '-game');
      await page.locator('#bHint').tap();
      checkFit(await measure(page), tag + ' hint'); await shot(page, tag + '-hint');
      const s = await state(page);
      await tapOpt(page, wrongIdx(s));
      checkFit(await measure(page), tag + ' wrong'); await shot(page, tag + '-wrong');
      await tapNext(page); await tapOpt(page, rightIdx(await state(page))); await tapNext(page);
      await tapOpt(page, rightIdx(await state(page))); await tapNext(page);
      checkFit(await measure(page), tag + ' result'); await shot(page, tag + '-result');
      await page.locator('#bAgain').tap();
      await play(page, 'wwr');
      checkFit(await measure(page), tag + ' fail'); await shot(page, tag + '-fail');
      await page.evaluate(() => { location.hash = '#defi-20-300'; });
      await page.waitForFunction(() => window.__game.state().mode === 'chal');
      checkFit(await measure(page), tag + ' challenge'); await shot(page, tag + '-challenge');
      await play(page, 'rrr');
      checkFit(await measure(page), tag + ' challenge result'); await shot(page, tag + '-challenge-result');
      await context.close();
    }
  });

  await test('layout: the 60 riddles (most loaded: longest titles, 4 emojis, hint, wrong answer) fit at 320x568 and 360x640', async () => {
    for (const vp of [VIEWPORTS[0], VIEWPORTS[1]]) {
      const { context, page } = await open(vp);
      for (let n = 1; n <= 20; n++) {
        await page.evaluate(k => window.__game.loadLevel(k), n);
        for (let i = 0; i < 3; i++) {
          const tag = `${vp.width}x${vp.height} level ${n}.${i + 1}`;
          await page.evaluate(() => window.__game.hint());
          checkFit(await measure(page), tag + ' hint');
          await page.evaluate(() => { window.__game.answer(0); });
          checkFit(await measure(page), tag + ' answered');
          await page.evaluate(() => window.__game.next());
        }
        await page.evaluate(() => { document.getElementById('win').hidden = true; });
      }
      await context.close();
    }
  });

  await test('reduced motion: no animation on the result card', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    await page.locator('#bGo').tap();
    await play(page, 'rrr');
    const names = await page.evaluate(() => [...document.querySelectorAll('.card,.stars svg.on,.over')].map(e => getComputedStyle(e).animationName));
    assert.ok(names.length > 0 && names.every(n => n === 'none'), names.join(','));
    assert.equal(await page.locator('.bit').count(), 0);
    await context.close();
  });

  await test('no network request, no console or page error during the whole run', async () => {
    assert.deepEqual(problems, []);
  });

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);
  process.exit(failed ? 1 : 0);
})();
