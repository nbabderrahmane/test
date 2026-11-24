'use strict';
/*
 * Mobile acceptance tests for games/mot-secret ("Mot Tapi"): plain node + playwright + node:assert.
 * Run with `node tests/mot-secret.spec.js`. Set SHOTS=<dir> to also write screenshots.
 * The answers live in tools/mot-secret/niveaux.json and the admitted words in
 * tools/mot-secret/mots-admis.txt (both written by tools/mot-secret/build.js); the game never exposes them.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const FILE = process.env.GAME_FILE || path.join(__dirname, '..', 'games', 'mot-secret', 'index.html');
const URL = pathToFileURL(FILE).href;
const KEY = 'mj:mot-secret:v1';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const TOOLS = path.join(__dirname, '..', 'tools', 'mot-secret');
const ANSWERS = JSON.parse(fs.readFileSync(path.join(TOOLS, 'niveaux.json'), 'utf8')).answers;
const ADMITTED = fs.readFileSync(path.join(TOOLS, 'mots-admis.txt'), 'utf8').split('\n').filter(Boolean);
const ADMIT_SET = new Set(ADMITTED);
const LEN = n => (n <= 5 ? 4 : n <= 11 ? 5 : n <= 16 ? 6 : 7);   // required word length of level n

let browser;
const problems = [];   // console errors, page errors, unexpected requests (all pages)
const results = [];

async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = await browser.newContext({ ...MOBILE, viewport, ...(opts.extra || {}) });
  await context.addInitScript(({ save, key, config, share, brokenStorage }) => {
    window.__msgs = []; window.__shared = []; window.__clip = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    if (brokenStorage) {
      Storage.prototype.getItem = function () { throw new Error('blocked'); };
      Storage.prototype.setItem = function () { throw new Error('blocked'); };
    } else {
      try { if (save !== null && !localStorage.getItem(key)) localStorage.setItem(key, typeof save === 'string' ? save : JSON.stringify(save)); } catch (e) { /* ignore */ }
    }
    if (config) window.MJ_CONFIG = config;
    if (share === 'share') navigator.share = t => { window.__shared.push(t.text); return Promise.resolve(); };
    else if (share === 'clip') {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__clip.push(t); return Promise.resolve(); } }, configurable: true });
    }
  }, { save: opts.save === undefined ? null : opts.save, key: KEY, config: opts.config || null, share: opts.share || '', brokenStorage: !!opts.brokenStorage });
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
const stored = page => page.evaluate(k => localStorage.getItem(k), KEY);
const waitScreen = (page, s) => page.waitForFunction(x => window.__game.state().screen === x, s, { timeout: 5000 });
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

// Real touch taps on the on-screen keyboard (centres read once from the DOM).
async function tapKeys(page, text) {
  const c = await page.evaluate(() => {
    const o = {};
    document.querySelectorAll('[data-k]').forEach(e => { const r = e.getBoundingClientRect(); o[e.getAttribute('data-k')] = [r.left + r.width / 2, r.top + r.height / 2]; });
    return o;
  });
  for (const ch of text) {
    const k = ch === '\n' ? 'ENTER' : ch === '<' ? 'BACK' : ch.toUpperCase();
    await page.touchscreen.tap(c[k][0], c[k][1]);
  }
}
// types the letters after the first one, then Enter
const tapWord = (page, word) => tapKeys(page, word.slice(1) + '\n');
const tapBtn = (page, id) => page.locator('#' + id).tap();
// admitted words of the right length that start with the same letter as the answer, other than it
const wrongs = (n, count = 6) => {
  const a = ANSWERS[n - 1];
  const w = ADMITTED.filter(x => x.length === a.length && x[0] === a[0] && x !== a);
  assert.ok(w.length >= count, 'not enough wrong words for level ' + n);
  return w.slice(0, count);
};
// independent reference of the marking rule (two passes, repeated letters counted once)
function refMarks(guess, word) {
  const r = Array(word.length).fill(0), left = {};
  for (let i = 0; i < word.length; i++) { if (guess[i] === word[i]) r[i] = 2; else left[word[i]] = (left[word[i]] || 0) + 1; }
  for (let i = 0; i < word.length; i++) if (r[i] === 0 && left[guess[i]] > 0) { r[i] = 1; left[guess[i]]--; }
  return r.join('');
}

async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('  ok   ' + name + ' (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { results.push({ name, ok: false, err: e }); console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n       ')); }
}

(async () => {
  browser = await chromium.launch();

  await test('data: 20 levels, lengths 4/5/6/7, answers admitted, unique, plain letters', async () => {
    assert.equal(ANSWERS.length, 20);
    ANSWERS.forEach((a, i) => {
      assert.match(a, /^[a-z]+$/, a);
      assert.equal(a.length, LEN(i + 1), 'length of level ' + (i + 1));
      assert.ok(ADMIT_SET.has(a), a + ' must be admitted');
    });
    assert.equal(new Set(ANSWERS).size, 20);
    ADMITTED.forEach(w => assert.match(w, /^[a-z]{4,7}$/, w));
    assert.equal(new Set(ADMITTED).size, ADMITTED.length);
    const { page, context } = await open();
    const s = await state(page);
    const lv = await page.evaluate(() => window.__game.levels);
    assert.equal(lv.length, 20);
    lv.forEach((l, i) => { assert.equal(l.len, ANSWERS[i].length); assert.equal(l.first.toLowerCase(), ANSWERS[i][0]); assert.ok(!('word' in l)); });
    assert.equal(s.limit, 6);
    await context.close();
  });

  await test('the 20 levels won with real taps, in order, from the home screen', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    await tapBtn(page, 'bGo');                       // one tap from the home screen to play
    assert.equal((await state(page)).screen, 'game');
    for (let n = 1; n <= 20; n++) {
      let s = await state(page);
      assert.equal(s.level, n); assert.equal(s.len, LEN(n)); assert.equal(s.first, ANSWERS[n - 1][0].toUpperCase());
      await tapWord(page, ANSWERS[n - 1]);
      await waitScreen(page, 'result');
      s = await state(page);
      assert.ok(s.won && s.over && s.stars === 3, 'level ' + n);
      assert.equal(s.tries, 1);
      if (n < 20) {
        assert.equal(s.save.max, n + 1);
        await tapBtn(page, 'bNext');
      }
    }
    const s = await state(page);
    assert.equal(s.total, 60);
    assert.deepEqual(s.save.stars, Array(20).fill(3));
    const ev = await events(page, 'level_complete');
    assert.equal(ev.length, 20);
    ev.forEach((e, i) => assert.deepEqual(e, { source: 'mini-jeu', game: 'mot-secret', event: 'level_complete', level: i + 1, score: 1, stars: 3 }));
    await shot(page, 'result-last');
    await context.close();
  });

  await test('sequential unlocking: the grid locks levels until the previous one is won', async () => {
    const { page, context } = await open();
    await tapBtn(page, 'bLevels');
    assert.equal(await page.locator('.cell[disabled]').count(), 19);
    assert.equal(await page.locator('.cell:not([disabled])').count(), 1);
    await page.locator('.cell[disabled]').first().tap({ force: true, timeout: 1000 }).catch(() => {});
    assert.equal((await state(page)).screen, 'levels');
    await page.locator('.cell:not([disabled])').tap();
    await waitScreen(page, 'game');
    await tapWord(page, ANSWERS[0]);
    await waitScreen(page, 'result');
    await tapBtn(page, 'bNext');
    await tapBtn(page, 'bMap');                     // back to the grid
    assert.equal(await page.locator('.cell:not([disabled])').count(), 2);
    await context.close();
  });

  await test('marks follow the rule (repeated letters), keyboard remembers letters, shapes differ from colours', async () => {
    const { page, context } = await open({ width: 360, height: 640 });
    // level 10 = "arbre": two r, guesses with repeated letters
    await page.evaluate(() => window.__game.loadLevel(10));
    const word = ANSWERS[9];
    const tries = ['arret', 'aigle', 'ancre'].filter(w => ADMIT_SET.has(w));
    assert.ok(tries.length >= 1);
    for (const w of tries) await tapWord(page, w);
    const s = await state(page);
    assert.equal(s.guesses.length, tries.length);
    s.guesses.forEach((g, i) => assert.equal(s.marks[i], refMarks(g.toLowerCase(), word), g));
    // keys keep the best mark of each letter
    const best = {};
    s.guesses.forEach((g, i) => [...g].forEach((c, k) => { const m = +s.marks[i][k]; if (best[c] === undefined || m > best[c]) best[c] = m; }));
    assert.deepEqual(s.keys, best);
    for (const c of Object.keys(best)) {
      const cls = await page.locator(`[data-k="${c}"]`).getAttribute('class');
      assert.match(cls, new RegExp('\\bs' + best[c] + '\\b'), c);
    }
    // three marks, three different shapes (not only colours)
    const sig = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('.t').forEach(t => {
        const m = /\bs([012])\b/.exec(t.className);
        if (m && !out[m[1]]) { const a = getComputedStyle(t, '::after'); out[m[1]] = [a.borderRadius, a.borderTopWidth, a.backgroundColor === 'rgba(0, 0, 0, 0)'].join('|'); }
      });
      return out;
    });
    assert.equal(new Set(Object.values(sig)).size, Object.keys(sig).length, JSON.stringify(sig));
    assert.ok(Object.keys(sig).length >= 2);
    // repeated letters: "arret" against "arbre" gives one present mark to the second r, not two
    assert.equal(refMarks('arret', 'arbre'), '22110');
    await context.close();
  });

  await test('typing rules: first letter given, too short, unknown word, backspace, nothing lost', async () => {
    const { page, context } = await open();
    await page.evaluate(() => window.__game.loadLevel(6));   // "table"
    let s = await state(page);
    assert.equal(s.typed, 'T');
    await tapKeys(page, '<<<');                              // the first letter cannot be erased
    assert.equal((await state(page)).typed, 'T');
    await tapKeys(page, 'ab\n');
    s = await state(page);
    assert.equal(s.tries, 0); assert.equal(s.msg, 'Trop court'); assert.equal(s.typed, 'TAB');
    await tapKeys(page, '<');
    assert.equal((await state(page)).typed, 'TA');
    await tapKeys(page, 'xxx\n');
    s = await state(page);
    assert.equal(s.tries, 0); assert.equal(s.msg, 'Mot inconnu'); assert.equal(s.typed, 'TAXXX');
    await tapKeys(page, 'zzz');                              // no more than 5 letters
    assert.equal((await state(page)).typed, 'TAXXX');
    await tapKeys(page, '<<<<');
    assert.equal((await state(page)).typed, 'T');
    await tapWord(page, 'table');
    await waitScreen(page, 'result');
    await context.close();
  });

  await test('stars: 3 in <=3 tries, 2 in 4-5, 1 in 6; failure after 6 handled, no unlock', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    const play = async (n, wrongCount) => {
      await page.evaluate(k => window.__game.loadLevel(k), n);
      for (const w of wrongs(n, wrongCount)) await page.evaluate(x => window.__game.play(x), w);
      await page.evaluate(x => window.__game.play(x), ANSWERS[n - 1]);
      await waitScreen(page, 'result');
      return state(page);
    };
    let s = await play(1, 2); assert.equal(s.tries, 3); assert.equal(s.stars, 3);
    s = await play(2, 3); assert.equal(s.tries, 4); assert.equal(s.stars, 2);
    s = await play(3, 4); assert.equal(s.tries, 5); assert.equal(s.stars, 2);
    s = await play(4, 5); assert.equal(s.tries, 6); assert.equal(s.stars, 1);
    assert.equal(s.won, true);
    // failure on level 5: six wrong words
    await page.evaluate(() => window.__game.loadLevel(5));
    const before = await state(page);
    for (const w of wrongs(5, 6)) await page.evaluate(x => window.__game.play(x), w);
    await waitScreen(page, 'result');
    s = await state(page);
    assert.ok(s.over && !s.won && s.stars === 0 && s.tries === 6);
    assert.equal(s.save.stars[4], 0);
    assert.equal(await page.locator('#wTitle').textContent(), 'Raté…');
    assert.equal((await page.locator('#wWord').textContent()), ANSWERS[4].toUpperCase());   // the word is shown
    assert.equal(await page.locator('#bShare').isVisible(), false);
    assert.equal((await events(page, 'level_complete')).length, 4);
    // retry: a clean board, still playable and winnable
    await tapBtn(page, 'bAgain');
    s = await state(page);
    assert.equal(s.screen, 'game'); assert.equal(s.tries, 0); assert.equal(s.over, false); assert.equal(s.level, 5);
    await tapWord(page, ANSWERS[4]);
    await waitScreen(page, 'result');
    assert.equal((await state(page)).won, true);
    assert.ok(before.limit === 6);
    // stars are shown before playing (goal line)
    await page.evaluate(() => window.__game.loadLevel(3));
    assert.match(await page.locator('#goal').textContent(), /3 essais/);
    await context.close();
  });

  await test('resume after reload: guesses, typed letters and keyboard identical', async () => {
    const { page, context } = await open();
    await page.evaluate(() => { window.__game.loadLevel(1); });
    await page.evaluate(x => window.__game.play(x), ANSWERS[0]);
    await waitScreen(page, 'result');
    await tapBtn(page, 'bNext');                              // level 2 now
    const w = wrongs(2, 2);
    await tapWord(page, w[0]); await tapWord(page, w[1]);
    await tapKeys(page, ANSWERS[1].slice(1, 3));              // two letters typed, not sent
    const before = await state(page);
    assert.equal(before.level, 2); assert.equal(before.tries, 2); assert.equal(before.typed.length, 3);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    assert.equal((await state(page)).screen, 'home');
    assert.match(await page.locator('#bGo').textContent(), /Niveau 2/);
    await tapBtn(page, 'bGo');
    const after = await state(page);
    ['level', 'guesses', 'marks', 'typed', 'tries', 'keys'].forEach(k => assert.deepEqual(after[k], before[k], k));
    assert.equal(after.total, before.total);
    // the resumed game is still winnable
    await tapKeys(page, ANSWERS[1].slice(3) + '\n');
    await waitScreen(page, 'result');
    assert.equal((await state(page)).won, true);
    await context.close();
  });

  await test('corrupted or blocked storage: the game starts clean and plays', async () => {
    const bad = [
      'not json{', '[]', 'null', '"x"', '{"level":"x","max":null,"stars":"zz","best":{}}',
      '{"max":99,"level":-4,"stars":[9,9,9],"cur":{"level":3,"guesses":["xxxx"],"typed":"zz"}}',
      '{"cur":{"level":1,"guesses":["CHAT"],"typed":""}}',
      '{"cur":{"level":1,"guesses":[1,2,3],"typed":5},"chal":{"level":99,"target":0,"guesses":"a"}}',
      '{"cur":{"level":2,"guesses":["LUNE","LUNE","LUNE","LUNE","LUNE","LUNE","LUNE"],"typed":"L"}}',
    ];
    for (const save of bad) {
      const { page, context } = await open({ width: 360, height: 640 }, { save, extra: { reducedMotion: 'reduce' } });
      const s = await state(page);
      assert.equal(s.screen, 'home', save);
      assert.ok(s.total >= 0 && s.total <= 60, save);
      assert.ok(s.save.level >= 1 && s.save.level <= s.save.max && s.save.max <= 20, save);
      s.save.stars.forEach(x => assert.ok(x >= 0 && x <= 3));
      assert.equal(s.tries, 0, save); assert.equal(s.challenge, null, save);
      await tapBtn(page, 'bGo');
      const lvl = (await state(page)).level;
      await tapWord(page, ANSWERS[lvl - 1]);
      await waitScreen(page, 'result');
      assert.equal((await state(page)).won, true, save);
      await context.close();
    }
    // out-of-range stars/levels are clamped, not trusted
    const { page: p2, context: c2 } = await open({ width: 360, height: 640 }, { save: { max: 999, level: 999, stars: Array(25).fill(9) } });
    const s2 = await state(p2);
    assert.equal(s2.save.max, 20); assert.equal(s2.total, 60);
    await c2.close();
    // storage that throws on every access
    const { page, context } = await open({ width: 360, height: 640 }, { brokenStorage: true, extra: { reducedMotion: 'reduce' } });
    assert.equal((await state(page)).screen, 'home');
    await tapBtn(page, 'bGo');
    await tapWord(page, ANSWERS[0]);
    await waitScreen(page, 'result');
    assert.equal((await state(page)).won, true);
    await tapBtn(page, 'bNext');
    assert.equal((await state(page)).level, 2);
    await context.close();
  });

  await test('sharing: shapes without letters or solution, native share then clipboard, events', async () => {
    const cfg = { shareBaseUrl: 'https://exemple.test/jeux/mot-secret/index.html' };
    for (const mode of ['share', 'clip']) {
      const { page, context } = await open({ width: 360, height: 640 }, { share: mode, config: cfg, extra: { reducedMotion: 'reduce' } });
      await page.evaluate(() => window.__game.loadLevel(7));
      const w = wrongs(7, 2);
      for (const x of w) await page.evaluate(y => window.__game.play(y), x);
      await page.evaluate(y => window.__game.play(y), ANSWERS[6]);
      await waitScreen(page, 'result');
      await tapBtn(page, 'bShare');
      await page.waitForFunction(() => window.__shared.length + window.__clip.length >= 1);
      const text = await page.evaluate(() => (window.__shared.concat(window.__clip))[0]);
      const lines = text.split('\n');
      assert.equal(lines[0], 'Mot Tapi · Niveau 7 · ⭐⭐⭐');
      assert.equal(lines.length, 4);
      lines.slice(1).forEach(l => assert.match(l, /^[■●□]{5}$/));
      assert.ok(!text.toLowerCase().includes(ANSWERS[6]));
      assert.ok(!/https?:/.test(text));
      w.forEach(x => assert.ok(!text.toLowerCase().includes(x)));
      assert.deepEqual(lines[3], '■■■■■');
      // the challenge link
      await tapBtn(page, 'bChal');
      await page.waitForFunction(() => window.__shared.length + window.__clip.length >= 2);
      const ch = await page.evaluate(() => (window.__shared.concat(window.__clip))[1]);
      assert.match(ch, /https:\/\/exemple\.test\/jeux\/mot-secret\/index\.html#defi-7-3$/);
      assert.ok(!ch.toLowerCase().includes(ANSWERS[6]));
      const ev = await events(page, 'share');
      assert.deepEqual(ev.map(e => e.kind), ['result', 'challenge']);
      ev.forEach(e => assert.deepEqual(Object.keys(e).sort(), ['event', 'game', 'kind', 'source']));
      await context.close();
    }
    // no base on file://: text only, no link
    const { page, context } = await open({ width: 360, height: 640 }, { share: 'share', extra: { reducedMotion: 'reduce' } });
    await page.evaluate(() => { window.__game.loadLevel(1); window.__game.play('chat'); });
    await waitScreen(page, 'result');
    await tapBtn(page, 'bChal');
    await page.waitForFunction(() => window.__shared.length >= 1);
    const t = await page.evaluate(() => window.__shared[0]);
    assert.ok(!/https?:|#defi/.test(t), t);
    assert.match(t, /Mot Tapi · Niveau 1/);
    await context.close();
  });

  await test('challenge: opens a locked level with one goal, equal is enough, lost, events, progress and game untouched', async () => {
    const save = { level: 2, max: 2, stars: [3, 1], best: [1, 5], cur: { level: 2, guesses: [wrongs(2, 1)[0].toUpperCase()], typed: ANSWERS[1][0].toUpperCase() } };
    const savedStr = JSON.stringify(save);
    // --- won (equal to the target)
    let { page, context } = await open({ width: 360, height: 640 }, { save: savedStr, hash: '#defi-9-3', extra: { reducedMotion: 'reduce' } });
    let s = await state(page);
    assert.equal(s.screen, 'game'); assert.equal(s.level, 9); assert.deepEqual(s.challenge, { level: 9, target: 3 });
    assert.equal(await page.locator('#goal').isVisible(), false);         // a single objective on screen
    assert.equal(await page.locator('#chal').isVisible(), true);
    assert.match(await page.locator('#chalT').textContent(), /3 essais/);
    assert.equal(await page.evaluate(() => location.hash), '');
    let ev = await events(page, 'challenge_open');
    assert.deepEqual(ev.map(e => [e.level, e.target]), [[9, 3]]);
    const w = wrongs(9, 2);
    await tapWord(page, w[0]); await tapWord(page, w[1]);
    await tapWord(page, ANSWERS[8]);
    await waitScreen(page, 'result');
    s = await state(page);
    assert.ok(s.won); assert.equal(s.tries, 3);
    assert.equal(await page.locator('#wTitle').textContent(), 'Défi relevé !');
    assert.equal(await page.locator('#bChal').textContent(), 'Renvoyer le défi');
    ev = await events(page, 'challenge_result');
    assert.deepEqual(ev.map(e => ({ level: e.level, score: e.score, target: e.target, won: e.won })), [{ level: 9, score: 3, target: 3, won: true }]);
    assert.equal((await events(page, 'level_complete')).length, 0);
    const raw1 = JSON.parse(await stored(page));
    assert.deepEqual([raw1.level, raw1.max, raw1.cur], [2, 2, save.cur], 'a challenge never changes the game in progress');
    assert.deepEqual(raw1.stars.slice(0, 2), [3, 1]); assert.ok(raw1.stars.slice(2).every(x => x === 0));
    assert.deepEqual(raw1.best.slice(0, 2), [1, 5]); assert.ok(raw1.best.slice(2).every(x => x === 0));
    await tapBtn(page, 'bNext');                                          // "Accueil"
    s = await state(page);
    assert.equal(s.screen, 'home'); assert.equal(s.challenge, null);
    assert.deepEqual(s.save.stars.slice(0, 3), [3, 1, 0]);
    await tapBtn(page, 'bGo');                                            // the game in progress is back
    s = await state(page);
    assert.equal(s.level, 2); assert.equal(s.tries, 1);
    await context.close();

    // --- lost: more tries than the target
    ({ page, context } = await open({ width: 360, height: 640 }, { hash: '#defi-4-2', extra: { reducedMotion: 'reduce' } }));
    s = await state(page);
    assert.equal(s.limit, 2);
    const w4 = wrongs(4, 2);
    await tapWord(page, w4[0]); await tapWord(page, w4[1]);
    await waitScreen(page, 'result');
    s = await state(page);
    assert.ok(s.over && !s.won);
    assert.equal(await page.locator('#wTitle').textContent(), 'Défi perdu');
    ev = await events(page, 'challenge_result');
    assert.equal(ev.length, 1); assert.equal(ev[0].won, false); assert.equal(ev[0].target, 2); assert.equal(ev[0].level, 4);
    assert.ok(ev[0].score > 6);
    ev.forEach(e => assert.deepEqual(Object.keys(e).sort(), ['event', 'game', 'level', 'score', 'source', 'target', 'won']));
    const st = JSON.parse((await stored(page)) || '{}');
    assert.ok(!st.stars || st.stars.every(x => x === 0));
    assert.equal(st.max === undefined || st.max === 1, true);
    await tapBtn(page, 'bAgain');                                         // retry the same challenge
    s = await state(page);
    assert.equal(s.tries, 0); assert.deepEqual(s.challenge, { level: 4, target: 2 });
    await context.close();

    // --- link opened while the game is running (hashchange), then resumed after a reload
    ({ page, context } = await open({ width: 360, height: 640 }, { save: savedStr }));
    await tapBtn(page, 'bGo');
    await page.evaluate(() => { location.hash = '#defi-12-4'; });
    await waitScreen(page, 'game');
    s = await state(page);
    assert.equal(s.level, 12); assert.deepEqual(s.challenge, { level: 12, target: 4 });
    await tapWord(page, wrongs(12, 1)[0]);
    await page.reload();
    await page.waitForFunction(() => !!window.__game);
    s = await state(page);
    assert.equal(s.screen, 'game'); assert.deepEqual(s.challenge, { level: 12, target: 4 }); assert.equal(s.tries, 1);
    const raw = JSON.parse(await stored(page));
    assert.deepEqual(raw.cur, save.cur); assert.deepEqual(raw.stars.slice(0, 2), save.stars); assert.equal(raw.max, 2);
    await tapBtn(page, 'bMap');                                           // leaving abandons the challenge
    s = await state(page);
    assert.equal(s.screen, 'levels'); assert.equal(s.challenge, null);
    assert.equal(JSON.parse(await stored(page)).chal, null);
    await context.close();
  });

  await test('challenge: malformed fragments are ignored without error', async () => {
    const bad = ['#defi-', '#defi-abc', '#defi-3', '#defi-3-', '#defi--3', '#defi-0-3', '#defi-21-3', '#defi-3-0', '#defi-3-7', '#defi-3-99',
      '#defi-3-2-1', '#defi-3.5-2', '#defi-1-1x', '#DEFI-3-2', '#defi-%3Cb%3E-2', '#defi-999999999-2', '#defi-03-2x'];
    const { page, context } = await open({ width: 360, height: 640 });
    for (const h of bad) {
      await page.evaluate(x => { location.hash = x; }, h);
      await page.waitForTimeout(30);
      const s = await state(page);
      assert.equal(s.screen, 'home', h); assert.equal(s.challenge, null, h);
    }
    assert.equal((await events(page, 'challenge_open')).length, 0);
    await context.close();
    for (const h of ['#defi-abc', '#defi-99-2', '#defi-3-9', '#nimporte']) {
      const o = await open({ width: 360, height: 640 }, { hash: h });
      const s = await state(o.page);
      assert.equal(s.screen, 'home', h); assert.equal(s.challenge, null, h);
      assert.equal((await events(o.page, 'challenge_open')).length, 0);
      await o.context.close();
    }
  });

  await test('events: only the listed ones, no personal data', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { share: 'share', config: { shareBaseUrl: 'https://exemple.test/' }, extra: { reducedMotion: 'reduce' } });
    await tapBtn(page, 'bGo');
    await tapWord(page, ANSWERS[0]);
    await waitScreen(page, 'result');
    await tapBtn(page, 'bShare');
    await page.waitForFunction(() => window.__shared.length >= 1);
    const all = await msgs(page);
    const allowed = { level_complete: ['level', 'score', 'stars'], share: ['kind'], challenge_open: ['level', 'target'], challenge_result: ['level', 'score', 'target', 'won'] };
    assert.ok(all.length >= 2);
    all.forEach(m => {
      assert.equal(m.source, 'mini-jeu'); assert.equal(m.game, 'mot-secret');
      assert.ok(allowed[m.event], m.event);
      assert.deepEqual(Object.keys(m).sort(), ['event', 'game', 'source'].concat(allowed[m.event]).sort());
    });
    await context.close();
  });

  await test('reduced motion: result appears at once', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    await tapBtn(page, 'bGo');
    await tapWord(page, ANSWERS[0]);
    await page.waitForFunction(() => window.__game.state().screen === 'result', null, { timeout: 400 });
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.card')).animationName);
    assert.equal(dur, 'none');
    await context.close();
  });

  // ---- layout on every screen at three phone sizes ----------------------------------
  const MEASURE = () => {
    const vw = window.innerWidth, vh = window.innerHeight, bad = [];
    const vis = e => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; for (let p = e.parentElement; p; p = p.parentElement) if (getComputedStyle(p).display === 'none') return false; return true; };
    document.querySelectorAll('#app *').forEach(e => {
      if (e.closest('svg') || e.classList.contains('bit') || !vis(e)) return;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) bad.push('outside: ' + e.tagName + '#' + e.id + '.' + e.className + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
      if ((e.tagName === 'BUTTON' || e.tagName === 'H1' || e.tagName === 'H2') && e.scrollWidth > e.clientWidth + 1) bad.push('text overflow: ' + (e.id || e.textContent.slice(0, 20)));
    });
    document.querySelectorAll('button').forEach(b => {
      if (!vis(b)) return;
      const r = { width: b.offsetWidth, height: b.offsetHeight }, letter = b.classList.contains('k') && !b.classList.contains('wide');
      if (r.height < 44 - 0.5) bad.push('target height ' + Math.round(r.height) + ': ' + (b.id || b.getAttribute('data-k') || b.className));
      if (r.width < (letter ? 28 : 44) - 0.5) bad.push('target width ' + Math.round(r.width) + ': ' + (b.id || b.getAttribute('data-k') || b.className));
    });
    const de = document.documentElement;
    if (de.scrollHeight > vh + 1 || de.scrollWidth > vw + 1 || document.body.scrollHeight > vh + 1 || document.body.scrollWidth > vw + 1) bad.push('page scrolls');
    const rows = document.getElementById('rows').getBoundingClientRect(), msg = document.getElementById('msg').getBoundingClientRect();
    if (rows.bottom > msg.top + 1) bad.push('rows overlap the message line');
    return bad;
  };
  const SAVE_MID = { level: 9, max: 9, stars: [3, 2, 1, 3, 3, 2, 1, 2, 0], best: [1, 4, 6, 2, 3, 5, 6, 4, 0] };
  for (const [w, h] of [[320, 568], [360, 640], [430, 932]]) {
    await test(`layout ${w}x${h}: every screen, no page scroll, targets, nothing outside`, async () => {
      const { page, context } = await open({ width: w, height: h }, { save: SAVE_MID, extra: { reducedMotion: 'reduce' } });
      const check = async (name) => {
        const bad = await page.evaluate(MEASURE);
        await shot(page, `${name}-${w}`);
        assert.deepEqual(bad, [], name + ' @' + w + 'x' + h);
      };
      await check('home');
      await tapBtn(page, 'bLevels'); await check('levels');
      await page.locator('.cell:not([disabled])').first().tap();
      await waitScreen(page, 'game'); await check('game-1');
      // the busiest board: level 20 (7 letters), five attempts and letters typed
      await page.evaluate(() => window.__game.loadLevel(20));
      for (const x of wrongs(20, 5)) await page.evaluate(y => window.__game.play(y), x);
      await tapKeys(page, ANSWERS[19].slice(1, 4));
      await check('game-20-busy');
      await tapKeys(page, ANSWERS[19].slice(4) + '<x\n');                     // 7 letters typed, unknown: warning message
      assert.equal((await state(page)).msg, 'Mot inconnu');
      await check('game-20-msg');
      await page.evaluate(x => window.__game.play(x), ANSWERS[19]);
      await waitScreen(page, 'result'); await check('result-win');
      await page.evaluate(() => window.__game.loadLevel(20));
      for (const x of wrongs(20, 6)) await page.evaluate(y => window.__game.play(y), x);
      await waitScreen(page, 'result'); await check('result-fail');
      await page.evaluate(() => { location.hash = '#defi-20-3'; });
      await waitScreen(page, 'game'); await check('game-challenge');
      for (const x of wrongs(20, 3)) await page.evaluate(y => window.__game.play(y), x);
      await waitScreen(page, 'result'); await check('result-challenge');
      await context.close();
    });
  }

  await test('file size under 150 KB, no network, no console error', async () => {
    const size = fs.statSync(FILE).size;
    assert.ok(size < 150 * 1024, 'size ' + size);
    console.log('       size: ' + size + ' bytes');
    const html = fs.readFileSync(FILE, 'utf8');
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/MJ_CONFIG[^\n]*/g, '')), 'no external URL in the file');
    assert.ok(!/<link|<img|@import|@font-face|fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(html));
    assert.deepEqual(problems, []);
  });

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
