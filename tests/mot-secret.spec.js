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
const http = require('node:http');

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

let browser, server, HTTP_URL;
// Pages are served from a local http server by default: on file:// Chromium sometimes loses a localStorage write
// across a reload (measured under load: ~1 to 2 in 100 on file://, 0 in 240 over http). opts.file forces file://.
const problems = [];   // console errors, page errors, unexpected requests (all pages)
const results = [];

async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = await browser.newContext({ ...MOBILE, viewport, ...(opts.extra || {}) });
  await context.addInitScript(({ config, share, brokenStorage }) => {
    window.__msgs = []; window.__shared = []; window.__clip = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    if (brokenStorage) {
      Storage.prototype.getItem = function () { throw new Error('blocked'); };
      Storage.prototype.setItem = function () { throw new Error('blocked'); };
    }
    if (config) window.MJ_CONFIG = config;
    if (share === 'share') navigator.share = t => { window.__shared.push(t.text); return Promise.resolve(); };
    else if (share === 'clip') {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__clip.push(t); return Promise.resolve(); } }, configurable: true });
    }
  }, { config: opts.config || null, share: opts.share || '', brokenStorage: !!opts.brokenStorage });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  const base = opts.url || (opts.file ? URL : HTTP_URL);
  page.on('request', r => { const u = r.url().split('#')[0]; if (u !== base && !(/^http/.test(base) && /\/favicon\.ico$/.test(u))) problems.push('request: ' + r.url()); });
  // R14: the starting save is written once, from node, after a first load; never by a script that runs again on reload
  if (opts.save !== undefined && opts.save !== null && !opts.brokenStorage) {
    await page.goto(base);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, typeof opts.save === 'string' ? opts.save : JSON.stringify(opts.save)]);
    await page.goto('about:blank');
  }
  await page.goto(base + (opts.hash || ''));
  await page.waitForFunction(() => !!window.__game);
  return { context, page };
}
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
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
// does the page (outside scripts) show or carry the word, in text or in any attribute?
const visibleTextHas = (page, word) => page.evaluate(w => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('script').forEach(x => x.remove());
  const all = c.innerHTML.toLowerCase() + ' ' + c.textContent.toLowerCase();
  return all.includes(w);
}, word);
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
  const html = fs.readFileSync(FILE);
  server = http.createServer((req, res) => {
    if (!/^\/index\.html/.test(req.url)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  HTTP_URL = 'http://127.0.0.1:' + server.address().port + '/index.html';
  browser = await chromium.launch();

  await test('data: 20 levels, lengths 4/5/6/7, answers admitted, unique, plain letters', async () => {
    assert.equal(ANSWERS.length, 20);
    ANSWERS.forEach((a, i) => {
      assert.match(a, /^[a-z]+$/, a);
      assert.equal(a.length, LEN(i + 1), 'length of level ' + (i + 1));
      assert.ok(ADMIT_SET.has(a), a + ' must be admitted');
    });
    assert.equal(new Set(ANSWERS).size, 20);
    // R9: at least 30 admitted words with the same length and first letter, per level
    ANSWERS.forEach((a, i) => {
      const n = ADMITTED.filter(w => w.length === a.length && w[0] === a[0]).length;
      assert.ok(n >= 30, 'level ' + (i + 1) + ' ' + a + ': ' + n + ' candidates');
    });
    // R9: sensitive words are out, everyday family words are in
    ['pape', 'moine', 'prier', 'croix', 'ange', 'diable', 'rite', 'guerre', 'fusil', 'bombe', 'vote', 'asile', 'greve', 'baiser', 'tuer', 'alcool',
      'rhum', 'cidre', 'fumer', 'pipe', 'armee', 'juger', 'jury', 'police', 'frapper', 'blesser', 'race', 'tribu', 'hymne', 'urne', 'exil', 'pari', 'parier', 'cochon', 'jambon', 'lard']
      .forEach(w => assert.ok(!ADMIT_SET.has(w), w + ' must not be admitted'));
    ['femme', 'maman', 'papa', 'homme', 'fille', 'famille', 'maison', 'ecole', 'repas'].forEach(w => assert.ok(ADMIT_SET.has(w), w + ' must be admitted'));
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

  await test('marks follow the rule (repeated letters), keyboard remembers letters, shapes and palette (R7, R8)', async () => {
    const { page, context } = await open({ width: 360, height: 640 });
    await page.evaluate(() => window.__game.loadLevel(6));   // "table", a single e
    const word = ANSWERS[5];
    const tries = ['tente', 'tarte', 'tasse'].filter(w => ADMIT_SET.has(w));
    assert.equal(tries.length, 3);
    for (const w of tries) await tapWord(page, w);
    const s = await state(page);
    assert.equal(s.guesses.length, 3);
    s.guesses.forEach((g, i) => assert.equal(s.marks[i], refMarks(g.toLowerCase(), word), g));
    // doubled letter in the guess, single in the word: "tente" has two e, "table" one -> only the e in place is marked
    assert.equal(s.marks[0], '20002');
    assert.equal(refMarks('coco', 'chat'), '2000');
    // keys keep the best mark of each letter
    const best = {};
    s.guesses.forEach((g, i) => [...g].forEach((c, k) => { const m = +s.marks[i][k]; if (best[c] === undefined || m > best[c]) best[c] = m; }));
    assert.deepEqual(s.keys, best);
    for (const c of Object.keys(best)) {
      const cls = await page.locator(`[data-k="${c}"]`).getAttribute('class');
      assert.match(cls, new RegExp('\\bs' + best[c] + '\\b'), c);
    }
    // three marks, three different shapes (not only colours), no tile flip, palette without green/yellow/grey
    await page.evaluate(() => window.__game.play('talon'));   // adds a letter that is present elsewhere
    const info = await page.evaluate(() => {
      const out = {}, hue = c => {
        const m = c.match(/[\d.]+/g).map(Number), r = m[0] / 255, g = m[1] / 255, b = m[2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return { h: Math.round(((h * 60) + 360) % 360), s: mx ? d / mx : 0 };
      };
      document.querySelectorAll('#rows .t').forEach(t => {
        const m = /\bs([012])\b/.exec(t.className);
        if (m && !out[m[1]]) {
          const a = getComputedStyle(t, '::after'), cs = getComputedStyle(t);
          out[m[1]] = { shape: [a.clipPath, a.borderRadius, a.transform].join('|'), anim: cs.animationName, color: hue(cs.backgroundColor) };
        }
      });
      return out;
    });
    assert.equal(Object.keys(info).length, 3);
    assert.equal(new Set(Object.values(info).map(x => x.shape)).size, 3, JSON.stringify(info));
    Object.values(info).forEach(x => assert.ok(!/flip/.test(x.anim), 'no tile flip'));
    [info[1], info[2]].forEach(x => assert.ok(x.color.h < 20 || x.color.h > 250 || (x.color.h > 175 && x.color.h < 330), 'not green/yellow: hue ' + x.color.h));
    assert.ok(info[0].color.s > 0.2, 'absent tile is tinted, not grey');
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
    assert.equal(await page.locator('#wTitle').textContent(), 'Pas cette fois');
    // R2: a lost level never reveals the word anywhere on the page
    assert.equal(await visibleTextHas(page, ANSWERS[4]), false);
    assert.equal(await page.locator('#wWord').isVisible(), false);
    assert.equal(await page.locator('#bShare').isVisible(), false);
    assert.equal(await page.locator('#bChal').isVisible(), false);
    assert.equal((await page.locator('#bAgain').textContent()), 'Réessayer');
    assert.equal((await page.locator('#bNext').textContent()), 'Niveaux');
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
    await page.evaluate(() => window.__game.loadLevel(8));
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
    await reload(page);
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
      lines.slice(1).forEach(l => assert.match(l, /^[▲◆·]{5}$/));
      assert.ok(!/[■●□🟩🟨⬛⬜🟦🟥]/u.test(text));
      assert.ok(!text.toLowerCase().includes(ANSWERS[6]));
      assert.ok(!/https?:/.test(text));
      w.forEach(x => assert.ok(!text.toLowerCase().includes(x)));
      assert.deepEqual(lines[3], '▲▲▲▲▲');
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
    const { page, context } = await open({ width: 360, height: 640 }, { file: true, share: 'share', extra: { reducedMotion: 'reduce' } });
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
    const save = { level: 2, max: 2, stars: [3, 1], best: [1, 5], games: { 2: { guesses: [wrongs(2, 1)[0].toUpperCase()], typed: ANSWERS[1][0].toUpperCase() } } };
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
    // R3: only "Renvoyer le défi" and "Accueil" after a challenge
    assert.equal(await page.locator('#bAgain').isVisible(), false);
    assert.equal(await page.locator('#bShare').isVisible(), false);
    assert.equal(await page.locator('#bNext').textContent(), 'Accueil');
    ev = await events(page, 'challenge_result');
    assert.deepEqual(ev.map(e => ({ level: e.level, score: e.score, target: e.target, won: e.won })), [{ level: 9, score: 3, target: 3, won: true }]);
    assert.equal((await events(page, 'level_complete')).length, 0);
    const raw1 = JSON.parse(await stored(page));
    assert.deepEqual([raw1.max, raw1.games], [2, save.games], 'a challenge never changes the game in progress');
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
    // R3: no retry of a lost challenge, one challenge_result per opening, the word stays secret
    assert.equal(await page.locator('#bAgain').isVisible(), false);
    assert.equal(await page.locator('#bShare').isVisible(), false);
    assert.equal(await page.locator('#bChal').isVisible(), false);
    assert.equal(await visibleTextHas(page, ANSWERS[3]), false);
    await page.waitForTimeout(100);
    assert.equal((await events(page, 'challenge_result')).length, 1);
    await context.close();

    // --- link opened while the game is running (hashchange), then resumed after a reload
    ({ page, context } = await open({ width: 360, height: 640 }, { save: savedStr }));
    await tapBtn(page, 'bGo');
    await page.evaluate(() => { location.hash = '#defi-12-4'; });
    await waitScreen(page, 'game');
    s = await state(page);
    assert.equal(s.level, 12); assert.deepEqual(s.challenge, { level: 12, target: 4 });
    await tapWord(page, wrongs(12, 1)[0]);
    await reload(page);
    s = await state(page);
    assert.equal(s.screen, 'game'); assert.deepEqual(s.challenge, { level: 12, target: 4 }); assert.equal(s.tries, 1);
    const raw = JSON.parse(await stored(page));
    assert.deepEqual(raw.games, save.games); assert.deepEqual(raw.stars.slice(0, 2), save.stars); assert.equal(raw.max, 2);
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

  await test('R1: no restart in the middle of a game; leaving and coming back keeps the tries', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    assert.equal(await page.locator('#bReset').count(), 0);
    assert.equal(await page.getByText('Recommencer').count(), 0);
    await tapBtn(page, 'bGo');
    const w = wrongs(1, 5);
    for (const x of w) await tapWord(page, x);
    assert.equal((await state(page)).tries, 5);
    await tapBtn(page, 'bMap');                         // leave to the grid, then come back to the same level
    await page.locator('.cell:not([disabled])').first().tap();
    await waitScreen(page, 'game');
    assert.equal((await state(page)).tries, 5);
    await tapWord(page, ANSWERS[0]);
    await waitScreen(page, 'result');
    const s = await state(page);
    assert.equal(s.tries, 6); assert.equal(s.stars, 1);   // not 3 stars
    await context.close();
  });

  await test('R6: "Continuer" points at the first unfinished level, replaying does not move it', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    for (const n of [1, 2]) {
      await page.evaluate(k => window.__game.loadLevel(k), n);
      await tapWord(page, ANSWERS[n - 1]);
      await waitScreen(page, 'result');
    }
    await tapBtn(page, 'bNext');                        // now on level 3, unfinished
    await tapBtn(page, 'bMap');
    assert.match(await page.locator('.cell.cur').textContent(), /^3/);
    await page.locator('.cell:not([disabled])').first().tap();   // replay level 1
    await waitScreen(page, 'game');
    assert.equal((await state(page)).level, 1);
    await tapWord(page, ANSWERS[0]);
    await waitScreen(page, 'result');
    await tapBtn(page, 'bNext');                        // "Suivant" from level 1 -> level 2 (replay), then leave
    await tapBtn(page, 'bMap'); await tapBtn(page, 'bLBack');
    assert.match(await page.locator('#bGo').textContent(), /Niveau 3/);
    await reload(page);
    assert.match(await page.locator('#bGo').textContent(), /Niveau 3/);
    await context.close();
  });

  await test('R4: the shared link is origin + path + fragment, never the query string', async () => {
    const html = fs.readFileSync(FILE);
    const srv = http.createServer((req, res) => { if (/favicon/.test(req.url)) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port, base = 'http://127.0.0.1:' + port + '/jeux/mot-secret/index.html';
    try {
      let { page, context } = await open({ width: 360, height: 640 }, { url: base + '?token=SECRET123&n=7', share: 'share', extra: { reducedMotion: 'reduce' } });
      await tapBtn(page, 'bGo');
      await tapWord(page, ANSWERS[0]);
      await waitScreen(page, 'result');
      await tapBtn(page, 'bChal');
      await page.waitForFunction(() => window.__shared.length >= 1);
      const t = await page.evaluate(() => window.__shared[0]);
      assert.ok(t.endsWith(base + '#defi-1-1'), t);
      assert.ok(!/token|SECRET123|\?/.test(t), t);
      await context.close();
      // an explicit base with a query and a fragment is cleaned too
      ({ page, context } = await open({ width: 360, height: 640 }, { share: 'share', config: { shareBaseUrl: 'https://exemple.test/a/b?x=1&jeton=Z#haut' }, extra: { reducedMotion: 'reduce' } }));
      await page.evaluate(() => { window.__game.loadLevel(1); window.__game.play('chat'); });
      await waitScreen(page, 'result');
      await tapBtn(page, 'bChal');
      await page.waitForFunction(() => window.__shared.length >= 1);
      const t2 = await page.evaluate(() => window.__shared[0]);
      assert.ok(t2.endsWith('https://exemple.test/a/b#defi-1-1'), t2);
      assert.ok(!/jeton|x=1|\?/.test(t2), t2);
      await context.close();
    } finally { srv.close(); }
  });

  await test('R5: nothing in the page lets a player read the word (DOM, attributes, share text)', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { share: 'share', config: { shareBaseUrl: 'https://exemple.test/x' }, extra: { reducedMotion: 'reduce' } });
    for (const n of [1, 9, 20]) {
      await page.evaluate(k => window.__game.loadLevel(k), n);
      const a = ANSWERS[n - 1];
      assert.equal(await visibleTextHas(page, a), false, 'level ' + n + ' at start');
      for (const x of wrongs(n, 2)) await tapWord(page, x);
      assert.equal(await visibleTextHas(page, a), false, 'level ' + n + ' after guesses');
      const g = await page.evaluate(() => JSON.stringify(window.__game.state()) + JSON.stringify(window.__game.levels) + Object.keys(window.__game).join(','));
      assert.ok(!g.toLowerCase().includes(a), 'state/levels expose the word of level ' + n);
    }
    // tiles and keys carry no id or attribute tied to the solution
    const attrs = await page.evaluate(() => [...document.querySelectorAll('#rows *, #kb *')].map(e => e.id + '|' + [...e.attributes].map(x => x.name).join(',')).join(';'));
    assert.ok(!/\|.*(word|solution|answer)/i.test(attrs));
    await context.close();
  });

  await test('R12: one game in progress per level (detour through another level keeps the tries)', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    for (const n of [1, 2]) {
      await page.evaluate(k => window.__game.loadLevel(k), n);
      await tapWord(page, ANSWERS[n - 1]);
      await waitScreen(page, 'result');
    }
    await page.evaluate(() => window.__game.loadLevel(3));
    for (const x of wrongs(3, 5)) await tapWord(page, x);
    await tapKeys(page, ANSWERS[2].slice(1, 2));                 // a letter typed too
    const before = await state(page);
    assert.equal(before.tries, 5);
    await tapBtn(page, 'bMap');
    await page.locator('.cell[data-level="1"]').tap();           // another level
    await waitScreen(page, 'game');
    assert.equal((await state(page)).level, 1);
    await tapBtn(page, 'bMap');
    await page.locator('.cell[data-level="3"]').tap();           // back to level 3
    await waitScreen(page, 'game');
    const after = await state(page);
    assert.equal(after.level, 3);
    ['guesses', 'marks', 'typed', 'tries'].forEach(k => assert.deepEqual(after[k], before[k], k));
    await reload(page);   // and after a reload
    await tapBtn(page, 'bGo');
    assert.equal((await state(page)).tries, 5);
    await tapKeys(page, '<');
    await tapWord(page, ANSWERS[2]);
    await waitScreen(page, 'result');
    assert.equal((await state(page)).stars, 1);                 // 6 tries, not 3 stars
    await context.close();
  });

  await test('R11: tries add up across games until the first win; stars freeze; challenges count', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    // lose level 4, retry, find the word at once: the 6 lost tries still count (1 star)
    await page.evaluate(() => window.__game.loadLevel(4));
    for (const x of wrongs(4, 6)) await page.evaluate(y => window.__game.play(y), x);
    await waitScreen(page, 'result');
    assert.equal(await page.locator('#wRec').textContent(), 'Essais cumulés : 6');
    await tapBtn(page, 'bAgain');
    assert.equal((await state(page)).tries, 0);
    assert.match(await page.locator('#goal').textContent(), /Essais cumulés : 6/);
    await tapWord(page, ANSWERS[3]);
    await waitScreen(page, 'result');
    let s = await state(page);
    assert.equal(s.stars, 1); assert.equal(s.tries, 1);
    assert.equal(await page.locator('#wRec').textContent(), 'Essais cumulés : 7');
    assert.equal(s.save.stars[3], 1);
    // stars freeze at the first win: replaying (even at the first try) does not change them
    await tapBtn(page, 'bAgain');
    assert.match(await page.locator('#goal').textContent(), /déjà gagné/);
    await tapWord(page, ANSWERS[3]);
    await waitScreen(page, 'result');
    s = await state(page);
    assert.equal(s.stars, 1); assert.equal(s.save.stars[3], 1);
    assert.match(await page.locator('#wRec').textContent(), /étoiles inchangées/);
    // a level won in 2 tries keeps its 3 stars even if a later replay needs 6
    await page.evaluate(() => window.__game.loadLevel(1));
    await page.evaluate(x => window.__game.play(x), wrongs(1, 1)[0]);
    await page.evaluate(x => window.__game.play(x), ANSWERS[0]);
    await waitScreen(page, 'result');
    assert.equal((await state(page)).save.stars[0], 3);
    await tapBtn(page, 'bAgain');
    for (const x of wrongs(1, 5)) await page.evaluate(y => window.__game.play(y), x);
    await page.evaluate(x => window.__game.play(x), ANSWERS[0]);
    await waitScreen(page, 'result');
    assert.equal((await state(page)).save.stars[0], 3);
    // a challenge on a level not won yet counts, won or lost: #defi-20-6 won in 4 tries
    await page.evaluate(() => { location.hash = '#defi-20-6'; });
    await page.waitForFunction(() => window.__game.state().challenge !== null);
    for (const x of wrongs(20, 3)) await page.evaluate(y => window.__game.play(y), x);
    await page.evaluate(x => window.__game.play(x), ANSWERS[19]);
    await waitScreen(page, 'result');
    s = await state(page);
    assert.ok(s.won); assert.equal(s.save.cum[19], 4);
    assert.equal(s.save.stars[19], 0);
    // the word seen in the challenge cannot give 3 stars afterwards: 4 + 1 = 5 tries = 2 stars
    await page.evaluate(() => window.__game.loadLevel(20));
    await page.evaluate(x => window.__game.play(x), ANSWERS[19]);
    await waitScreen(page, 'result');
    s = await state(page);
    assert.equal(s.stars, 2);
    // a lost challenge counts too
    await page.evaluate(() => { location.hash = '#defi-19-2'; });
    await page.waitForFunction(() => window.__game.state().challenge !== null && window.__game.state().level === 19);
    for (const x of wrongs(19, 2)) await page.evaluate(y => window.__game.play(y), x);
    await waitScreen(page, 'result');
    assert.equal((await state(page)).save.cum[18], 2);
    await context.close();
  });

  await test('R15: a challenge stops at its target; rows beyond it are hidden; one challenge result per opening, resumed after reload', async () => {
    const { page, context } = await open({ width: 360, height: 640 }, { hash: '#defi-6-2', extra: { reducedMotion: 'reduce' } });
    assert.equal(await page.locator('#rows .row:nth-child(3)').evaluate(e => getComputedStyle(e).visibility), 'hidden');
    assert.equal(await page.locator('#rows .row:nth-child(2)').evaluate(e => getComputedStyle(e).visibility), 'visible');
    assert.equal(await page.locator('#goal').isVisible(), false);
    const w = wrongs(6, 2);
    await tapWord(page, w[0]);
    await reload(page);
    let s = await state(page);
    assert.equal(s.screen, 'game'); assert.equal(s.tries, 1); assert.deepEqual(s.challenge, { level: 6, target: 2 });
    await tapWord(page, w[1]);
    await waitScreen(page, 'result');
    s = await state(page);
    assert.ok(s.over && !s.won && s.tries === 2);
    await tapKeys(page, 'a');                                   // no more input once it is over
    assert.equal((await state(page)).tries, 2);
    await reload(page);
    s = await state(page);
    assert.equal(s.challenge, null); assert.equal(s.screen, 'home');
    assert.equal((await events(page, 'challenge_result')).length, 0);   // fresh page: nothing re-sent
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
  server.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
