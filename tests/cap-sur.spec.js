'use strict';
/*
 * Mobile acceptance tests for games/cap-sur (plain node + playwright + node:assert).
 * Run with `node tests/cap-sur.spec.js`. Set SHOTS=<dir> to also write screenshots.
 * The answers live in tools/cap-sur/levels.txt (the game exposes none through __game).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const FILE = process.env.GAME_FILE || path.join(__dirname, '..', 'games', 'cap-sur', 'index.html');
const URL = pathToFileURL(FILE).href;
const KEY = 'mj:cap-sur:v1';
const SHOTS = process.env.SHOTS || '';
const MOBILE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

// ---- source data, read independently of the game
const lines = f => fs.readFileSync(path.join(__dirname, '..', 'tools', 'cap-sur', f), 'utf8').split('\n').filter(l => l.trim() && l[0] !== '#');
const CITIES = lines('cities.txt').map(l => { const [name, country, lat, lon, c] = l.split('|'); return { name, country, lat: +lat, lon: +lon, cap: c === 'c' }; });
const ANSWERS = lines('levels.txt').map(l => l.split('|')[1]);
const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const city = name => CITIES.find(c => c.name === name);

// independent haversine / bearing / proximity
const R = Math.PI / 180;
function hav(a, b) {
  const h = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
function dir8(a, b) {
  const y = Math.sin((b.lon - a.lon) * R) * Math.cos(b.lat * R);
  const x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lon - a.lon) * R);
  const deg = (Math.atan2(y, x) / R + 360) % 360;
  let best = 0, bd = 999;
  for (let i = 0; i < 8; i++) { const d = Math.min(Math.abs(deg - i * 45), 360 - Math.abs(deg - i * 45)); if (d < bd) { bd = d; best = i; } }
  return best;
}
const pctOf = km => Math.max(0, Math.min(99, Math.round(100 * (1 - km / 9000))));

let browser;
const problems = [];
const results = [];
const dirsSeen = new Set();

async function newPage(context) {
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push('console.error: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('request', r => { if (r.url().split('#')[0] !== URL) problems.push('request: ' + r.url()); });
  return page;
}
async function open(viewport = { width: 360, height: 640 }, opts = {}) {
  const context = await browser.newContext({ ...MOBILE, viewport, ...(opts.extra || {}) });
  await context.addInitScript(({ save, raw, key, config, share, clip, nostore }) => {
    window.__msgs = []; window.__shared = [];
    window.addEventListener('message', e => { if (e.data && e.data.source === 'mini-jeu') window.__msgs.push(e.data); });
    if (nostore) {
      Storage.prototype.getItem = function () { throw new Error('no storage'); };
      Storage.prototype.setItem = function () { throw new Error('no storage'); };
    } else {
      // the starting save is written on the first navigation of the tab only (never after a reload: R14)
      try {
        if (!sessionStorage.getItem('__seeded')) {
          sessionStorage.setItem('__seeded', '1');
          if (raw !== null) localStorage.setItem(key, raw);
          else if (save) localStorage.setItem(key, JSON.stringify(save));
        }
      } catch (e) { /* ignore */ }
    }
    if (config) window.MJ_CONFIG = config;
    if (share) Object.defineProperty(navigator, 'share', { value: t => { window.__shared.push(t.text); return Promise.resolve(); }, configurable: true });
    else Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    if (clip) Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__shared.push(t); return Promise.resolve(); } }, configurable: true });
  }, { save: opts.save || null, raw: opts.raw === undefined ? null : opts.raw, key: KEY, config: opts.config || null, share: !!opts.share, clip: !!opts.clip, nostore: !!opts.nostore });
  const page = await newPage(context);
  await page.goto(URL + (opts.hash || ''));
  await page.waitForFunction(() => !!window.__game);
  return { context, page };
}
// Reload = same storage content, new browser context. (In headless Chromium a file:// page that is reloaded, or
// reopened in the same context, sometimes starts with an empty localStorage: the content is copied by hand.)
async function reopen(context, page) {
  const raw = await page.evaluate(k => localStorage.getItem(k), KEY);
  await context.close();
  return open({ width: 360, height: 640 }, { raw });
}
const state = page => page.evaluate(() => window.__game.state());
const msgs = page => page.evaluate(() => new Promise(r => setTimeout(() => r(window.__msgs), 40)));
const events = async (page, name) => (await msgs(page)).filter(m => m.event === name);
const savedData = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const winShown = page => page.waitForSelector('#win:not([hidden])', { timeout: 4000 });
const FULL = { max: 20, stars: new Array(20).fill(0), best: new Array(20).fill(0) };   // everything unlocked, nothing won

// Real taps: type in the field, tap the suggestion, tap Valider.
async function playName(page, name, how = 'fill') {
  const input = page.locator('#inp');
  const part = strip(name).slice(0, -1);   // the full name would already be an exact match (no list)
  if (how === 'type') { await input.tap(); await page.keyboard.type(part); } else await input.fill(part);
  await page.locator('.sg', { hasText: name }).first().tap();
  assert.equal(await input.inputValue(), name, 'tapping a suggestion fills the field');
  const before = (await state(page)).attempts;
  await page.locator('#bOk').tap();
  await page.waitForFunction(n => window.__game.state().attempts > n, before);   // the tap has been handled
}
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;   // debugging aid: ONLY=resume
  const t = Date.now();
  try { await fn(); results.push(true); console.log(`  ok    ${name} (${Date.now() - t} ms)`); }
  catch (e) { results.push(false); console.log(`  FAIL  ${name}\n        ${String(e && e.stack || e).split('\n').join('\n        ')}`); }
}

const measure = page => page.evaluate(() => {
  const de = document.documentElement, b = document.body;
  window.scrollTo(50, 50);
  const r = el => { const q = el.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height, id: el.id || el.className || el.tagName }; };
  const vis = el => {
    const q = el.getBoundingClientRect();
    if (!(q.width > 0 && q.height > 0 && getComputedStyle(el).visibility !== 'hidden')) return false;
    const box = el.closest('#sugg');   // scrolled out of its list = not on screen
    if (box) { const c = box.getBoundingClientRect(); if (q.top >= c.bottom - 1 || q.bottom <= c.top + 1) return false; }
    return true;
  };
  return {
    iw: window.innerWidth, ih: window.innerHeight,
    sw: Math.max(de.scrollWidth, b.scrollWidth), sh: Math.max(de.scrollHeight, b.scrollHeight),
    sx: window.scrollX, sy: window.scrollY, vv: window.visualViewport ? window.visualViewport.scale : 1,
    targets: [...document.querySelectorAll('button, input')].filter(vis).map(r),
    rowsOverflow: [...document.querySelectorAll('.row:not(.empty)')].filter(e => e.scrollWidth > e.clientWidth + 1).length,
  };
});
function checkFit(m, tag) {
  assert.ok(m.sw <= m.iw, `${tag}: horizontal scroll (${m.sw} > ${m.iw})`);
  assert.ok(m.sh <= m.ih, `${tag}: vertical scroll (${m.sh} > ${m.ih})`);
  assert.equal(m.sx, 0, tag + ': scrolled x'); assert.equal(m.sy, 0, tag + ': scrolled y');
  assert.equal(m.vv, 1, tag + ': zoomed');
  assert.ok(m.targets.length > 0, tag + ': no target found');
  assert.equal(m.rowsOverflow, 0, tag + ': a row overflows');
  m.targets.forEach(q => {
    assert.ok(q.w >= 44 && q.h >= 44, `${tag}: target ${q.id} is ${Math.round(q.w)}x${Math.round(q.h)}`);
    assert.ok(q.l >= -0.5 && q.t >= -0.5 && q.r <= m.iw + 0.5 && q.b <= m.ih + 0.5, `${tag}: target ${q.id} out of screen`);
  });
}

(async () => {
  browser = await chromium.launch();
  console.log('cap-sur (Girouette)');

  // ---------------------------------------------------------------- weight, network
  await test('file is a single HTML under 150 KB, no external reference, no network API', async () => {
    const size = fs.statSync(FILE).size;
    assert.ok(size < 150 * 1024, `index.html is ${size} bytes`);
    const html = fs.readFileSync(FILE, 'utf8');
    assert.ok(!/(src|href)\s*=\s*["'](https?:)?\/\//i.test(html), 'external src/href');
    assert.ok(!/url\(\s*["']?(https?:)?\/\//i.test(html), 'external css url');
    assert.ok(!/@import|<link\b/i.test(html), 'stylesheet link/import');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(html), 'network API used');
    console.log(`        size: ${size} bytes (${(size / 1024).toFixed(1)} KB)`);
  });

  // ---------------------------------------------------------------- content
  await test('content: embedded cities = source, ~120 cities in Africa, 20 levels (8 capitals first), no disputed territory', async () => {
    const { context, page } = await open();
    const info = await page.evaluate(() => ({ cities: window.__game.cities, levels: window.__game.levels, fns: ['loadLevel', 'guess', 'seed', 'state'].map(k => typeof window.__game[k]) }));
    assert.deepEqual(info.fns, ['function', 'function', 'function', 'function']);
    assert.ok(CITIES.length >= 110 && CITIES.length <= 135, 'city count ' + CITIES.length);
    assert.deepEqual(info.cities.map(c => [c.name, c.country, c.lat, c.lon, c.capital]), CITIES.map(c => [c.name, c.country, c.lat, c.lon, c.cap]));
    assert.equal(new Set(CITIES.map(c => strip(c.name).replace(/[^a-z]/g, ''))).size, CITIES.length, 'duplicate names');
    CITIES.forEach(c => {
      assert.ok(c.lat >= -35.5 && c.lat <= 37.5 && c.lon >= -26 && c.lon <= 58, c.name + ' is outside Africa');
      const dec = ['Kinshasa', 'Brazzaville'].includes(c.name) ? 100 : 10;   // R16: two decimals for the two twin capitals only
      assert.ok(Math.abs(c.lat * dec - Math.round(c.lat * dec)) < 1e-6 && Math.abs(c.lon * dec - Math.round(c.lon * dec)) < 1e-6, c.name + ': decimals');
    });
    let minD = 1e9, minP = '';
    CITIES.forEach((a, i) => CITIES.forEach((b, j) => { if (j > i) { const d = hav(a, b); if (d < minD) { minD = d; minP = a.name + '/' + b.name; } } }));
    assert.ok(minD >= 5, `two cities are only ${minD.toFixed(1)} km apart: ${minP} (R16)`);
    assert.ok(!city('Malabo').cap, 'R16: Malabo (capital in transition) must not be marked capital');
    const banned = /laayoune|laâyoune|dakhla|hargeisa|sahara|sahrawi|el aaiun|\bsmara\b|boujdour|berbera/i;
    CITIES.forEach(c => assert.ok(!banned.test(c.name + ' ' + c.country), 'disputed territory: ' + c.name));
    assert.equal(ANSWERS.length, 20);
    assert.equal(info.levels.length, 20);
    assert.deepEqual(Object.keys(info.levels[0]), ['n', 'kind'], 'levels must not carry an answer');
    ANSWERS.forEach((a, i) => {
      assert.ok(city(a), 'unknown answer ' + a);
      assert.equal(info.levels[i].kind, i < 8 ? 'capitale' : 'ville', 'level ' + (i + 1) + ' kind');
      if (i < 8) assert.ok(city(a).cap, a + ' is not a capital');
    });
    assert.equal(new Set(ANSWERS).size, 20, 'repeated answer');
    const sheet = fs.readFileSync(path.join(__dirname, '..', 'docs', 'contenu', 'cap-sur.md'), 'utf8');
    assert.match(sheet, /à valider par un humain avant publication/i);
    CITIES.forEach(c => assert.ok(sheet.includes('| ' + c.name + ' |'), 'missing from the content sheet: ' + c.name));
    assert.ok(!(await page.evaluate(() => /<img|<canvas|<iframe/i.test(document.body.innerHTML))), 'no map/picture');
    await context.close();
  });

  await test('haversine, 8 arrows and proximity agree with an independent computation (20 levels x 6 guesses)', async () => {
    const { context, page } = await open();
    // a known real-world figure: Le Caire - Le Cap is about 7 200 km
    const cc = hav(city('Le Caire'), city('Le Cap'));
    assert.ok(cc > 7000 && cc < 7400, 'Cairo-Cape Town ' + cc);
    for (let n = 1; n <= 20; n++) {
      const t = city(ANSWERS[n - 1]);
      const guesses = CITIES.filter((c, i) => c.name !== t.name && (i * 7 + n * 3) % 20 === 0).slice(0, 6);
      assert.ok(guesses.length >= 3);
      await page.evaluate(k => window.__game.loadLevel(k), n);
      for (const g of guesses) assert.ok(await page.evaluate(x => window.__game.guess(x), g.name));
      const st = await state(page);
      st.guesses.forEach((row, i) => {
        const g = guesses[i], km = Math.round(hav(g, t));
        assert.equal(row.km, km, `level ${n} ${g.name}: km`);
        assert.equal(row.dir, dir8(g, t), `level ${n} ${g.name}: direction`);
        assert.equal(row.pct, pctOf(km), `level ${n} ${g.name}: pct`);
        assert.equal(row.arrow, '↑↗→↘↓↙←↖'[row.dir]);
        dirsSeen.add(row.dir);
      });
      if (n === 1) {   // the rows on screen show what the state says
        const rows = await page.locator('#list .row:not(.empty)').allInnerTexts();
        assert.equal(rows.length, st.guesses.length);
        st.guesses.forEach((row, i) => {
          assert.ok(rows[i].includes(row.name) && rows[i].includes(row.country));
          assert.ok(rows[i].replace(/\s/g, '').includes(String(row.km) + 'km') || rows[i].replace(/[\s ]/g, '').includes(String(row.km) + 'km'), 'km shown: ' + rows[i]);
          assert.ok(rows[i].includes(row.pct + ' %'));
        });
        const labels = await page.locator('#list .row .ar').evaluateAll(es => es.map(e => e.getAttribute('aria-label')));
        assert.deepEqual(labels, st.guesses.map(g => ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'][g.dir]));
      }
    }
    // all 8 arrows are exercised over the whole city list (independent check, any target)
    const all = new Set();
    CITIES.forEach(a => { const t = city(ANSWERS[0]); if (a !== t) all.add(dir8(a, t)); });
    const t0 = city('Nairobi'); CITIES.forEach(a => { if (a !== t0) all.add(dir8(a, t0)); });
    assert.equal(all.size, 8, 'not all 8 directions occur: ' + [...all]);
    await context.close();
  });

  // ---------------------------------------------------------------- real taps, 20 levels
  await test('the 20 levels are won by real taps (type, tap a suggestion, tap Valider), chained with Suivant', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: FULL });
    await page.locator('#bLevels').tap();
    await page.locator('[data-level="1"]').tap();
    for (let n = 1; n <= 20; n++) {
      let st = await state(page);
      assert.equal(st.level, n); assert.equal(st.attempts, 0);
      await playName(page, ANSWERS[n - 1], n === 1 ? 'type' : 'fill');
      await winShown(page);
      st = await state(page);
      assert.ok(st.found && st.over && st.guesses[0].hit && st.guesses[0].pct === 100, 'level ' + n);
      assert.equal(st.stars, 3);
      assert.equal(await page.locator('#wStars svg.on').count(), 3);
      if (n < 20) { await page.locator('#bNext').tap(); } else { assert.equal(await page.locator('#bNext').innerText(), 'Niveaux'); await page.locator('#bNext').tap(); assert.equal((await state(page)).screen, 'levels'); }
    }
    const ev = await events(page, 'level_complete');
    assert.equal(ev.length, 20);
    ev.forEach((e, i) => assert.deepEqual([e.level, e.score, e.stars], [i + 1, 1, 3]));
    await context.close();
  });

  await test('fresh game: levels 2+ locked, home shows "Continuer · Niveau 1" and 0/60, one sentence on level 1', async () => {
    const { context, page } = await open();
    const home = await page.locator('#home').innerText();
    assert.match(home, /Girouette/); assert.match(home, /Continuer · Niveau 1/); assert.match(home, /0 \/ 60/);
    await page.locator('#bLevels').tap();
    assert.equal(await page.locator('.cell:not([disabled])').count(), 1);
    await page.locator('[data-level="2"]').tap({ force: true });
    assert.equal((await state(page)).screen, 'levels', 'a locked level does not open');
    await page.locator('#bLBack').tap();
    await page.locator('#bGo').tap();
    const st = await state(page);
    assert.equal(st.screen, 'game'); assert.equal(st.level, 1);
    assert.match(await page.locator('#msg').innerText(), /distance et la direction/);
    assert.equal(await page.locator('#bOk').isDisabled(), true);
    await context.close();
  });

  // ---------------------------------------------------------------- stars, failure
  await test('stars: 3 in <=3 tries, 2 in 4-5, 1 in 6; the criterion is shown before playing; record kept', async () => {
    const wrong = ['Lagos', 'Le Cap', 'Alexandrie', 'Dakar', 'Tunis'];
    for (const [tries, stars] of [[3, 3], [4, 2], [5, 2], [6, 1]]) {
      const { context, page } = await open();
      await page.locator('#bGo').tap();
      assert.match(await page.locator('#gStars').innerText(), /★★★ en 3 · ★★ en 5/);
      for (let i = 0; i < tries - 1; i++) assert.ok(await page.evaluate(n => window.__game.guess(n), wrong[i]));
      await playName(page, 'Nairobi');
      await winShown(page);
      const st = await state(page);
      assert.equal(st.attempts, tries); assert.equal(st.stars, stars);
      assert.equal(await page.locator('#wStars svg.on').count(), stars);
      const sv = await savedData(page);
      assert.equal(sv.stars[0], stars); assert.equal(sv.best[0], tries); assert.equal(sv.max, 2); assert.deepEqual(sv.runs, {});
      const ev = await events(page, 'level_complete');
      assert.deepEqual(ev.map(e => [e.level, e.score, e.stars]), [[1, tries, stars]]);
      await context.close();
    }
  });

  await test('failure: 6 wrong tries end the level cleanly, nothing unlocks, replay starts fresh', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    const wrong = ['Lagos', 'Le Cap', 'Alexandrie', 'Dakar', 'Tunis', 'Accra'];
    for (let i = 0; i < 5; i++) await playName(page, wrong[i]);
    assert.equal((await state(page)).over, false);
    await playName(page, wrong[5]);
    await winShown(page);
    const st = await state(page);
    assert.ok(st.over && !st.found && st.stars === 0 && st.attempts === 6);
    assert.match(await page.locator('#win').innerText(), /Pas cette fois/);
    assert.match(await page.locator('#win').innerText(), /La ville t’a échappé/);
    assert.ok(!/Nairobi|Kenya/.test(await page.evaluate(() => document.body.innerText)), 'a failure must not reveal the city (R2)');
    assert.deepEqual(await page.locator('#win .btn:visible').allInnerTexts(), ['Réessayer', 'Niveaux']);
    assert.equal(await page.locator('#wStars svg.on').count(), 0);
    assert.equal(await page.locator('#bOk').isDisabled(), true);
    const sv = await savedData(page);
    assert.equal(sv.max, 1); assert.equal(sv.stars[0], 0); assert.deepEqual(sv.runs, {});
    assert.equal((await events(page, 'level_complete')).length, 0);
    await page.locator('#bNext').tap();   // "Réessayer"
    const st2 = await state(page);
    assert.equal(st2.attempts, 0); assert.equal(st2.over, false); assert.equal(st2.level, 1);
    assert.match(await page.locator('#gAtt').innerText(), /cumulés 6/);
    await playName(page, 'Nairobi'); await winShown(page);
    assert.equal((await state(page)).stars, 1, 'R11: 6 lost tries + 1 = 7 cumulated tries, one star');
    assert.match(await page.locator('#win').innerText(), /Essais cumulés : 7/);
    const sv2 = await savedData(page);
    assert.deepEqual([sv2.stars[0], sv2.best[0], sv2.prior[0]], [1, 7, 0]);
    await context.close();
  });

  // ---------------------------------------------------------------- typing and suggestions
  await test('suggestions: accents and case ignored, tactile list, already-tried cities hidden, Enter validates', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    const sugg = async txt => { await page.locator('#inp').fill(txt); return (await state(page)).suggestions; };
    assert.equal((await sugg('YAOUND'))[0], 'Yaoundé');
    assert.equal((await sugg('GHARDAÏ'))[0], 'Ghardaïa');
    assert.equal((await sugg('ghardai'))[0], 'Ghardaïa');
    assert.equal((await sugg('sao tom'))[0], 'São Tomé');
    assert.equal((await sugg('são to'))[0], 'São Tomé');
    assert.equal((await sugg('ndjamen'))[0], "N'Djamena");
    assert.equal((await sugg("n'djam"))[0], "N'Djamena");
    assert.equal((await sugg('saint lou'))[0], 'Saint-Louis');
    assert.equal((await sugg('SAINT-LOU'))[0], 'Saint-Louis');
    assert.equal((await sugg('fe'))[0], 'Fès');
    assert.equal((await sugg('fè'))[0], 'Fès');
    assert.ok((await sugg('dar es')).includes('Dar es Salaam'));
    assert.deepEqual(await sugg('zzz'), []);
    assert.match(await page.locator('#sugg').innerText(), /Aucune ville/);
    assert.deepEqual(await sugg(''), []);
    // prefix matches come first
    const s = await sugg('ka'); assert.ok(s.length >= 3 && strip(s[0]).startsWith('ka'));
    // tapping a suggestion fills the field but does not play
    await page.locator('#inp').fill('abid');
    await page.locator('.sg', { hasText: 'Abidjan' }).tap();
    let st = await state(page);
    assert.equal(st.input, 'Abidjan'); assert.equal(st.picked, 'Abidjan'); assert.equal(st.attempts, 0);
    assert.equal(await page.locator('#bOk').isDisabled(), false);
    assert.equal(await page.locator('.sg').count(), 0);
    // editing the field drops the choice
    await page.locator('#inp').fill('abidja');
    assert.equal((await state(page)).picked, null);
    assert.equal(await page.locator('#bOk').isDisabled(), true);
    // typing the exact name is enough, Enter plays
    await page.locator('#inp').fill('ABIDJAN');
    assert.equal(await page.locator('#bOk').isDisabled(), false);
    await page.locator('#inp').press('Enter');
    st = await state(page);
    assert.equal(st.attempts, 1); assert.equal(st.guesses[0].name, 'Abidjan'); assert.equal(st.input, '');
    // a city already tried is no longer suggested, and playing it again costs nothing
    assert.ok(!(await sugg('abid')).includes('Abidjan'));
    assert.match(await page.locator('#sugg').innerText(), /Déjà essayé/);
    assert.equal(await page.evaluate(() => window.__game.guess('abidjan')), false);
    assert.equal((await state(page)).attempts, 1);
    // a single match + Enter
    await page.locator('#inp').fill('lilongw');
    await page.locator('#inp').press('Enter');
    assert.equal((await state(page)).attempts, 2);
    await context.close();
  });

  // ---------------------------------------------------------------- resume, corrupt saves
  await test('resume: the game in progress comes back identical after a reload', async () => {
    let { context, page } = await open();
    await page.locator('#bGo').tap();
    await playName(page, 'Lagos'); await playName(page, 'Le Cap');
    const before = await state(page);
    ({ context, page } = await reopen(context, page));
    assert.equal((await state(page)).screen, 'home');
    assert.match(await page.locator('#bGo').innerText(), /Niveau 1/);
    await page.locator('#bGo').tap();
    const after = await state(page);
    assert.equal(after.screen, 'game');
    assert.deepEqual(after.guesses, before.guesses);
    assert.equal(after.attempts, 2);
    await playName(page, 'Nairobi'); await winShown(page);
    assert.equal((await state(page)).stars, 3);
    ({ context, page } = await reopen(context, page));
    assert.match(await page.locator('#bGo').innerText(), /Niveau 2/);
    await page.locator('#bGo').tap();
    assert.equal((await state(page)).attempts, 0, 'a finished level does not come back');
    // progress in the middle of a later level
    await playName(page, 'Lagos');
    ({ context, page } = await reopen(context, page));
    await page.locator('#bGo').tap();
    const st = await state(page);
    assert.equal(st.level, 2); assert.equal(st.attempts, 1);
    await context.close();
  });

  await test('corrupt, hostile or missing saves: the game starts sound', async () => {
    const cases = [
      '{not json', 'null', '[]', '"abc"', '123',
      JSON.stringify({ level: 'x', max: -4, stars: 'zz', best: { a: 1 }, runs: 7, chalGame: 'no' }),
      JSON.stringify({ level: 99, max: 99, stars: [9, -1, 'a', null], best: [99], runs: { 99: [1], x: [2] } }),
      JSON.stringify({ level: 3, max: 3, stars: [3, 3], runs: { 3: ['a', 1.5, -2, 9999, null] } }),
      JSON.stringify({ level: 1, max: 1, runs: { 1: [0, 0, 0] } }),
      JSON.stringify({ level: 1, max: 1, runs: { 1: [0, 1, 2, 3, 4, 5, 6, 7] } }),
      JSON.stringify({ level: 1, max: 1, chalGame: { n: 1, target: 99, guesses: [] } }),
    ];
    for (const raw of cases) {
      const { context, page } = await open({ width: 360, height: 640 }, { raw });
      let st = await state(page);
      assert.equal(st.screen, 'home', raw);
      assert.ok(st.level >= 1 && st.level <= 20 && st.max >= 1 && st.max <= 20 && st.attempts < 6 && !st.over && !st.challenge, raw);
      await page.locator('#bGo').tap();
      await playName(page, ANSWERS[(await state(page)).level - 1]);
      assert.ok((await state(page)).found, raw);
      await context.close();
    }
    // the answer of level 1 inside a saved run is dropped (never a half-won game)
    const nairobi = CITIES.findIndex(c => c.name === 'Nairobi');
    const { context, page } = await open({ width: 360, height: 640 }, { raw: JSON.stringify({ level: 1, max: 1, runs: { 1: [nairobi] } }) });
    await page.locator('#bGo').tap();
    assert.equal((await state(page)).attempts, 0);
    await context.close();
  });

  await test('works without storage (private mode): a level can be played and won', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { nostore: true });
    await page.locator('#bGo').tap();
    await playName(page, 'Nairobi'); await winShown(page);
    assert.equal((await state(page)).stars, 3);
    await page.locator('#bNext').tap();
    assert.equal((await state(page)).level, 2);
    await context.close();
  });

  // ---------------------------------------------------------------- sharing, challenge
  await test('share: short text without any city name, navigator.share first, clipboard fallback; events', async () => {
    for (const mode of ['share', 'clip']) {
      const { context, page } = await open({ width: 360, height: 640 }, mode === 'share' ? { share: true } : { clip: true });
      await page.locator('#bGo').tap();
      await playName(page, 'Lagos'); await playName(page, 'Le Cap'); await playName(page, 'Nairobi');
      await winShown(page);
      await page.locator('#bShare').tap();
      await page.waitForFunction(() => window.__shared.length === 1);
      const text = (await page.evaluate(() => window.__shared))[0];
      assert.match(text, /^Girouette · Niveau 1 · ⭐⭐⭐ [↑↗→↘↓↙←↖]\d+% [↑↗→↘↓↙←↖]\d+% ✅$/, text);
      CITIES.forEach(c => assert.ok(!strip(text).includes(strip(c.name)), 'share leaks a city name: ' + c.name));
      assert.ok(text.length < 80);
      assert.deepEqual((await events(page, 'share')).map(e => e.kind), ['result']);
      await context.close();
    }
    // no share, no clipboard: execCommand fallback must not throw
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    await playName(page, 'Nairobi'); await winShown(page);
    await page.locator('#bShare').tap();
    await page.waitForTimeout(150);
    assert.ok(['Copié !', 'Copie impossible'].includes(await page.locator('#bShare').innerText()));
    await context.close();
  });

  await test('challenge link: #defi-<level>-<tries> from MJ_CONFIG.shareBaseUrl, none without base on file://', async () => {
    const play = async cfg => {
      const { context, page } = await open({ width: 360, height: 640 }, { share: true, config: cfg });
      await page.locator('#bGo').tap();
      await playName(page, 'Lagos'); await playName(page, 'Nairobi'); await winShown(page);
      await page.locator('#bChal').tap();
      await page.waitForFunction(() => window.__shared.length === 1);
      const text = (await page.evaluate(() => window.__shared))[0];
      const ev = (await events(page, 'share')).map(e => e.kind);
      await context.close();
      return { text, ev };
    };
    const a = await play({ shareBaseUrl: 'https://exemple.test/jeux/cap-sur/?token=SECRET&x=1#old' });
    assert.match(a.text, /https:\/\/exemple\.test\/jeux\/cap-sur\/#defi-1-2$/);
    assert.ok(!/token|SECRET|\?/.test(a.text.split(' ').pop()), 'no query string in the link (R4)');
    assert.match(a.text.split('#')[1], /^[a-z0-9-]+$/);
    assert.deepEqual(a.ev, ['challenge']);
    assert.ok(!a.text.includes('Nairobi'));
    const b = await play(null);
    assert.ok(!/https?:|#defi/.test(b.text), 'no link without a base: ' + b.text);
    assert.match(b.text, /en 2 essais/);
  });

  await test('challenge open: locked level opens, one objective, equal is enough, progress and run untouched', async () => {
    const seed = { max: 4, stars: [3, 2, 0, 0], best: [1, 4, 0, 0], runs: { 3: [CITIES.findIndex(c => c.name === 'Lagos')] } };
    // locked level 9 (not unlocked yet), target 2 tries; found in exactly 2 -> won
    let { context, page } = await open({ width: 360, height: 640 }, { save: seed, hash: '#defi-9-2' });
    let st = await state(page);
    assert.equal(st.screen, 'game'); assert.equal(st.level, 9); assert.deepEqual(st.challenge, { target: 2, level: 9 });
    assert.equal(await page.evaluate(() => location.hash), '', 'the fragment is consumed');
    assert.equal(await page.locator('#chal').isVisible(), true);
    assert.match(await page.locator('#chalT').innerText(), /Objectif : en 2 essais ou moins/);
    assert.equal(await page.locator('#gStars').innerText(), '', 'no star objective next to the challenge one');
    const body = await page.evaluate(() => document.body.innerText);
    assert.equal((body.match(/Objectif/g) || []).length, 1, 'a single objective on screen');
    assert.ok(!/★/.test(body.replace(/★/g, '★')) || !/en 3/.test(body), 'no star objective');
    assert.deepEqual((await events(page, 'challenge_open')).map(e => [e.level, e.target]), [[9, 2]]);
    await playName(page, 'Lagos');
    await playName(page, 'Casablanca'); await winShown(page);
    assert.match(await page.locator('#win').innerText(), /Défi relevé/);
    assert.deepEqual((await page.locator('#win .btn:visible').allInnerTexts()).sort(), ['Accueil', 'Renvoyer le défi'], 'R3: no replay of a challenge');
    let sv = await savedData(page);
    assert.deepEqual([sv.max, sv.stars.slice(0, 4), sv.best.slice(0, 4)], [4, [3, 2, 0, 0], [1, 4, 0, 0]], 'progress untouched');
    assert.equal(sv.stars[8], 0); assert.deepEqual(sv.runs, seed.runs, 'run in progress untouched');
    assert.deepEqual((await events(page, 'challenge_result')).map(e => [e.level, e.score, e.target, e.won]), [[9, 2, 2, true]]);
    assert.equal((await events(page, 'level_complete')).length, 0);
    await page.locator('#bNext').tap();   // Accueil
    assert.equal((await state(page)).screen, 'home');
    assert.match(await page.locator('#bGo').innerText(), /Niveau 3/);
    await page.locator('#bGo').tap();
    st = await state(page);
    assert.equal(st.level, 3); assert.equal(st.attempts, 1, 'the run in progress is still there'); assert.equal(st.challenge, null);
    await context.close();

    // lost: found in 3 while the target was 2
    ({ context, page } = await open({ width: 360, height: 640 }, { save: seed, hash: '#defi-1-2' }));
    for (const n of ['Lagos', 'Le Cap']) await playName(page, n);   // R15: the game stops at the objective
    await winShown(page);
    assert.equal((await state(page)).over, true);
    assert.match(await page.locator('#win').innerText(), /Défi manqué/);
    assert.deepEqual(await page.locator('#win .btn:visible').allInnerTexts(), ['Accueil'], 'R3: a lost challenge only goes home');
    assert.deepEqual((await events(page, 'challenge_result')).map(e => [e.level, e.score, e.target, e.won]), [[1, 2, 2, false]]);
    sv = await savedData(page);
    assert.deepEqual([sv.max, sv.stars.slice(0, 4)], [4, [3, 2, 0, 0]]);
    await context.close();

    // lost: the city is never found
    ({ context, page } = await open({ width: 360, height: 640 }, { save: seed, hash: '#defi-1-6' }));
    for (const n of ['Lagos', 'Le Cap', 'Alexandrie', 'Dakar', 'Tunis', 'Accra']) await playName(page, n);
    await winShown(page);
    assert.deepEqual((await events(page, 'challenge_result')).map(e => [e.level, e.target, e.won]), [[1, 6, false]]);
    assert.equal((await savedData(page)).max, 4);
    await context.close();

    // a challenge in progress survives a reload, and the run is still apart
    ({ context, page } = await open({ width: 360, height: 640 }, { save: seed, hash: '#defi-2-4' }));
    await playName(page, 'Lagos');
    ({ context, page } = await reopen(context, page));
    st = await state(page);
    assert.equal(st.screen, 'game'); assert.deepEqual(st.challenge, { target: 4, level: 2 }); assert.equal(st.attempts, 1);
    sv = await savedData(page);
    assert.deepEqual(sv.runs, seed.runs);
    await context.close();
  });

  await test('malformed challenge fragments are ignored without error', async () => {
    const bad = ['#defi-', '#defi-0-3', '#defi-21-3', '#defi-5-x', '#defi-5-0', '#defi-5-7', '#defi-5-3-9', '#defi--3', '#defi-5', '#defi-%3Cb%3E-1', '#defi-005-3', '#defi-1-2;alert(1)', '#defi-jour-4-3', '#defi-1e3-2'];
    for (const hash of bad) {
      const { context, page } = await open({ width: 360, height: 640 }, { hash });
      const st = await state(page);
      assert.equal(st.challenge, null, hash); assert.equal(st.screen, 'home', hash); assert.equal(st.level, 1, hash);
      assert.equal((await events(page, 'challenge_open')).length, 0, hash);
      await context.close();
    }
    // a well-formed fragment set while the page is open also works
    const { context, page } = await open();
    await page.evaluate(() => { location.hash = '#defi-4-3'; });
    await page.waitForFunction(() => window.__game.state().challenge !== null);
    assert.deepEqual((await state(page)).challenge, { target: 3, level: 4 });
    await context.close();
  });

  await test('events: only the listed ones, tagged mini-jeu / cap-sur, no personal data', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: true });
    await page.locator('#bGo').tap();
    await playName(page, 'Nairobi'); await winShown(page);
    await page.locator('#bShare').tap(); await page.locator('#bChal').tap();
    await page.waitForFunction(() => window.__shared.length === 2);
    const all = await msgs(page);
    assert.deepEqual(all.map(m => m.event), ['level_complete', 'share', 'share']);
    all.forEach(m => { assert.equal(m.source, 'mini-jeu'); assert.equal(m.game, 'cap-sur'); });
    const allowed = { level_complete: ['level', 'score', 'stars'], share: ['kind'], challenge_open: ['level', 'target'], challenge_result: ['level', 'score', 'target', 'won'] };
    all.forEach(m => assert.deepEqual(Object.keys(m).filter(k => !['source', 'game', 'event'].includes(k)).sort(), allowed[m.event].slice().sort()));
    await context.close();
  });

  await test('reduced motion is respected; seed hook is callable', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { extra: { reducedMotion: 'reduce' } });
    await page.locator('#bGo').tap();
    await page.evaluate(() => window.__game.seed(42));
    await playName(page, 'Nairobi'); await winShown(page);
    assert.equal(await page.locator('#win .card').evaluate(e => getComputedStyle(e).animationName), 'none');
    assert.equal(await page.locator('#win .bit').count(), 0, 'no confetti with reduced motion');
    await context.close();
  });

  // ---------------------------------------------------------------- decisions after the first review (R1-R7)
  await test('R1: no restart button; leaving a game and coming back keeps the tries (even across levels)', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { max: 6, stars: [3, 3, 3, 3, 0, 0] } });
    assert.equal(await page.locator('#bReset, [aria-label="Recommencer"]').count(), 0);
    await page.locator('#bGo').tap();
    assert.equal((await state(page)).level, 5);
    await playName(page, 'Lagos'); await playName(page, 'Le Cap');
    await page.locator('#bMap').tap();
    await page.locator('[data-level="6"]').tap();
    assert.equal((await state(page)).level, 6);
    await playName(page, 'Dakar');
    await page.locator('#bMap').tap();
    await page.locator('#bBack').tap();   // Reprendre
    let st = await state(page);
    assert.equal(st.level, 5); assert.equal(st.attempts, 2);
    await page.locator('#bMap').tap();
    await page.locator('[data-level="6"]').tap();
    assert.equal((await state(page)).attempts, 1, 'level 6 kept its own try');
    await page.locator('#bMap').tap(); await page.locator('#bLBack').tap();
    await page.locator('#bGo').tap();
    assert.deepEqual([(await state(page)).level, (await state(page)).attempts], [5, 2]);
    await context.close();
  });

  await test('R2: a lost level never shows the city (screen, DOM, storage); Réessayer starts at zero, Niveaux goes to the grid', async () => {
    const { context, page } = await open();
    await page.locator('#bGo').tap();
    for (const n of ['Lagos', 'Le Cap', 'Alexandrie', 'Dakar', 'Tunis', 'Accra']) assert.ok(await page.evaluate(x => window.__game.guess(x), n));
    await winShown(page);
    const dom = await page.evaluate(() => document.documentElement.cloneNode(true).outerHTML.replace(/<script[\s\S]*?<\/script>/g, ''));
    assert.ok(!/Nairobi|Kenya/.test(dom), 'the city is in the DOM after a failure');
    assert.ok(!/Nairobi|Kenya/.test(JSON.stringify(await state(page))));
    assert.ok(!/Nairobi/.test(await page.evaluate(k => localStorage.getItem(k), KEY)));
    await page.locator('#bAgain').tap();   // Niveaux
    assert.equal((await state(page)).screen, 'levels');
    await page.locator('#bBack').tap();
    assert.equal((await state(page)).attempts, 0, 'a lost game is not resumed');
    await context.close();
  });

  await test('R3: a challenge is played once per opening; one challenge_result; bounds 1-6', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { hash: '#defi-1-3' });
    await playName(page, 'Nairobi'); await winShown(page);
    assert.equal(await page.locator('#bAgain').isVisible(), false);
    assert.ok(!/Rejouer|Réessayer/.test(await page.locator('#win').innerText()));
    await page.waitForTimeout(300);
    assert.equal((await events(page, 'challenge_result')).length, 1);
    assert.equal((await events(page, 'challenge_open')).length, 1);
    await context.close();
    for (const h of ['#defi-1-0', '#defi-1-7', '#defi-1-99']) {
      const o = await open({ width: 360, height: 640 }, { hash: h });
      assert.equal((await state(o.page)).challenge, null, h);
      await o.context.close();
    }
  });

  await test('R4: the link keeps only origin + pathname + fragment, even from an address carrying ?token=', async () => {
    const context = await browser.newContext({ ...MOBILE, viewport: { width: 360, height: 640 } });
    const html = fs.readFileSync(FILE, 'utf8');
    await context.route('http://jeux.exemple.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await context.addInitScript(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', { value: t => { window.__shared.push(t.text); return Promise.resolve(); }, configurable: true });
    });
    const page = await context.newPage();
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    await page.goto('http://jeux.exemple.test/cap-sur/index.html?token=SECRET123&slot=9#ignored');
    await page.waitForFunction(() => !!window.__game);
    await page.locator('#bGo').tap();
    await playName(page, 'Lagos'); await playName(page, 'Nairobi'); await winShown(page);
    await page.locator('#bChal').tap();
    await page.waitForFunction(() => window.__shared.length === 1);
    const text = (await page.evaluate(() => window.__shared))[0];
    assert.match(text, /http:\/\/jeux\.exemple\.test\/cap-sur\/index\.html#defi-1-2$/, text);
    assert.ok(!/SECRET|token|slot|\?/.test(text), text);
    await context.close();
  });

  await test('R5: the answer cannot be read in the DOM, attributes, state, storage or share text (20 levels)', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: FULL, share: true });
    for (let n = 1; n <= 20; n++) {
      const t = ANSWERS[n - 1];
      await page.evaluate(k => window.__game.loadLevel(k), n);
      const wrong = CITIES.filter(c => c.name !== t && c.name !== ANSWERS[n - 1]).slice(n, n + 2);
      for (const w of wrong) await page.evaluate(x => window.__game.guess(x), w.name);
      const dom = await page.evaluate(() => document.documentElement.cloneNode(true).outerHTML.replace(/<script[\s\S]*?<\/script>/g, ''));
      assert.ok(!dom.includes(t), `level ${n}: ${t} is in the DOM`);
      assert.ok(!JSON.stringify(await state(page)).includes(t), `level ${n}: state leaks`);
      assert.ok(!(await page.evaluate(k => localStorage.getItem(k), KEY)).includes(t), `level ${n}: storage leaks`);
      const attrs = await page.evaluate(() => [...document.querySelectorAll('#list [data-city]')].map(e => e.getAttribute('data-city')));
      assert.equal(attrs.length, 2, 'only tried cities carry an id');
    }
    await context.close();
  });

  await test('R6: Continuer always points at the first unfinished level; replaying an old level does not move it', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { max: 5, stars: [3, 2, 3, 0, 0] } });
    assert.match(await page.locator('#bGo').innerText(), /Niveau 4/);
    await page.locator('#bLevels').tap();
    await page.locator('[data-level="1"]').tap();
    await playName(page, 'Nairobi'); await winShown(page);
    await page.locator('#bNext').tap();   // Suivant: level 2 (replayed)
    await page.locator('#bMap').tap(); await page.locator('#bLBack').tap();
    assert.match(await page.locator('#bGo').innerText(), /Niveau 4/);
    await page.locator('#bGo').tap();
    assert.equal((await state(page)).level, 4);
    assert.equal((await state(page)).continueLevel, 4);
    await context.close();
  });

  await test('R7: share text readable without colour (arrows + percentages, check mark)', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { share: true });
    await page.locator('#bGo').tap();
    await playName(page, 'Lagos'); await playName(page, 'Le Cap'); await playName(page, 'Nairobi'); await winShown(page);
    await page.locator('#bShare').tap();
    await page.waitForFunction(() => window.__shared.length === 1);
    const text = (await page.evaluate(() => window.__shared))[0];
    assert.ok(!/[\u{1F7E0}-\u{1F7EB}\u{2B1B}\u{2B1C}]/u.test(text), 'coloured squares or circles in the share text');
    assert.match(text, /→\d+% ↗\d+% ✅/);
    await context.close();
  });

  await test('R11: stars freeze at the first win; replaying a won level changes nothing; challenges on an unwon level count', async () => {
    let { context, page } = await open({ width: 360, height: 640 }, { save: { max: 2, stars: [1, 0], best: [6, 0] } });
    await page.locator('#bLevels').tap();
    await page.locator('[data-level="1"]').tap();
    assert.match(await page.locator('#gStars').innerText(), /Étoiles déjà gagnées/);
    await playName(page, 'Nairobi'); await winShown(page);
    assert.equal(await page.locator('#wStars svg.on').count(), 1, 'the frozen star is shown, not 3');
    assert.match(await page.locator('#win').innerText(), /Pour le plaisir/);
    const sv = await savedData(page);
    assert.deepEqual([sv.stars[0], sv.best[0]], [1, 6]);
    assert.equal((await events(page, 'level_complete')).length, 0);
    await context.close();

    // a challenge on a locked, unwon level: won or lost, it adds to the running total
    ({ context, page } = await open({ width: 360, height: 640 }, { hash: '#defi-5-6' }));
    await playName(page, 'Kinshasa'); await winShown(page);
    let s2 = await savedData(page);
    assert.deepEqual([s2.prior[4], s2.stars[4], s2.max], [1, 0, 1]);
    await context.close();
    ({ context, page } = await open({ width: 360, height: 640 }, { hash: '#defi-5-1' }));
    await playName(page, 'Lagos'); await winShown(page);
    s2 = await savedData(page);
    assert.equal(s2.prior[4], 1);
    assert.equal((await state(page)).over, true);
    await context.close();

    // the running total is what the stars are made of: 1 (challenge) + 3 tries on the level = 4 -> 2 stars
    ({ context, page } = await open({ width: 360, height: 640 }, { save: { max: 5, stars: [3, 3, 3, 3, 0], prior: [0, 0, 0, 0, 1] } }));
    await page.locator('#bGo').tap();
    assert.equal((await state(page)).level, 5);
    await playName(page, 'Lagos'); await playName(page, 'Dakar'); await playName(page, 'Kinshasa'); await winShown(page);
    assert.equal((await state(page)).stars, 2);
    assert.match(await page.locator('#win').innerText(), /Essais cumulés : 4/);
    assert.deepEqual((await events(page, 'level_complete')).map(e => [e.level, e.score, e.stars]), [[5, 4, 2]]);
    await context.close();
  });

  await test('R15: a challenge stops at its objective, one counter, resumed after a reload, one result', async () => {
    let { context, page } = await open({ width: 360, height: 640 }, { hash: '#defi-1-3' });
    assert.equal(await page.locator('#list .row').count(), 3, 'only as many slots as the objective');
    assert.match(await page.locator('#gAtt').innerText(), /Essai 1\/3/);
    assert.ok(!/\/6/.test(await page.evaluate(() => document.body.innerText)), 'a single counter');
    await playName(page, 'Lagos');
    ({ context, page } = await reopen(context, page));
    let st = await state(page);
    assert.deepEqual([st.screen, st.attempts, st.challenge && st.challenge.target], ['game', 1, 3]);
    await playName(page, 'Le Cap'); await playName(page, 'Dakar'); await winShown(page);
    assert.equal((await state(page)).over, true);
    assert.match(await page.locator('#win').innerText(), /Défi manqué/);
    await page.waitForTimeout(250);
    assert.deepEqual((await events(page, 'challenge_result')).map(e => [e.level, e.score, e.target, e.won]), [[1, 3, 3, false]]);
    await context.close();
  });

  await test('R16: twin capitals are distinct (moins de 10 km, not a hit) and no pair is closer than 5 km', async () => {
    const { context, page } = await open({ width: 360, height: 640 }, { save: { max: 5, stars: [3, 3, 3, 3, 0] } });
    await page.locator('#bGo').tap();
    assert.equal((await state(page)).level, 5);
    await playName(page, 'Brazzaville');
    const st = await state(page);
    assert.equal(st.guesses[0].hit, false); assert.equal(st.over, false);
    assert.ok(st.guesses[0].km >= 5 && st.guesses[0].km < 10, 'km ' + st.guesses[0].km);
    assert.match(await page.locator('#list .row').first().innerText(), /moins de 10 km/);
    assert.ok(st.guesses[0].pct < 100);
    await context.close();
  });

  // ---------------------------------------------------------------- layout
  await test('layout: every screen at 320x568, 360x640, 430x932 (no page scroll, targets >= 44 px, keyboard case)', async () => {
    const longest = ['Sao Tomé-et-Principe', 'Guinée équatoriale', 'Afrique du Sud', 'Bobo-Dioulasso', 'Dar es Salaam'];
    for (const vp of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 430, height: 932 }]) {
      const tag = `${vp.width}x${vp.height}`;
      const { context, page } = await open(vp, { save: { max: 14, stars: [3, 3, 2, 2, 1, 3, 3, 2, 2, 1, 3, 2, 0, 0], best: [] } });
      checkFit(await measure(page), tag + ' home'); await shot(page, `${tag}-home`);
      await page.locator('#bLevels').tap();
      checkFit(await measure(page), tag + ' levels'); await shot(page, `${tag}-levels`);
      await page.locator('#bLBack').tap(); await page.locator('#bGo').tap();
      checkFit(await measure(page), tag + ' game empty'); await shot(page, `${tag}-game0`);
      // the most loaded game screen: 5 rows with the longest names, suggestions open
      const t = city(ANSWERS[11]);
      const names = ['Sao Tomé', 'Malabo', 'Johannesburg', 'Port Harcourt', 'Bobo-Dioulasso'];
      for (const n of names) assert.ok(await page.evaluate(x => window.__game.guess(x), n), n);
      const st0 = await state(page);
      assert.ok(st0.attempts >= 5 && !st0.over, 'setup ' + st0.attempts + ' ' + t.name);
      checkFit(await measure(page), tag + ' game loaded'); await shot(page, `${tag}-game5`);
      await page.locator('#inp').tap();
      await page.locator('#inp').fill('a');
      assert.ok((await page.locator('.sg').count()) >= 3);
      checkFit(await measure(page), tag + ' game + suggestions'); await shot(page, `${tag}-suggestions`);
      // virtual keyboard: the visible area shrinks (interactive-widget=resizes-content / visualViewport)
      for (const kb of [Math.round(vp.height * 0.58), Math.round(vp.height * 0.5)]) {
        await page.setViewportSize({ width: vp.width, height: kb });
        await page.waitForTimeout(120);
        const m = await measure(page);
        checkFit(m, `${tag} keyboard ${kb}px`);
        const g = await page.evaluate(() => {
          const q = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, h: r.height }; };
          const sg = [...document.querySelectorAll('.sg')].map(e => e.getBoundingClientRect());
          return { inp: q('#inp'), list: q('#list'), sugg: q('#sugg'), sg, header: q('header'), ih: window.innerHeight, lastRow: q('#list .row:last-child') };
        });
        assert.ok(g.inp.b <= g.ih + 0.5 && g.inp.t >= 0, 'input visible');
        assert.ok(g.sg.length >= 3, 'suggestions present');
        g.sg.slice(0, 2).forEach(r => assert.ok(r.top >= g.header.b - 0.5 && r.bottom <= g.inp.t + 0.5, 'a suggestion is hidden or under the input'));
        assert.ok(g.sugg.b <= g.inp.t + 0.5, 'suggestions end above the input');
        const sb = await page.evaluate(() => { const b = document.querySelector('#sugg').getBoundingClientRect(); return { t: b.top, b: b.bottom, st: document.querySelector('#sugg').scrollTop, items: [...document.querySelectorAll('.sg')].map(e => { const r = e.getBoundingClientRect(); return [r.top, r.bottom]; }) }; });
        assert.equal(sb.st, 0);
        sb.items.forEach(([t, b], i) => {
          const inside = t >= sb.t - 0.5 && b <= sb.b + 0.5, outside = t >= sb.b - 0.5 || b <= sb.t + 0.5;
          assert.ok(inside || outside, `${tag} keyboard ${kb}px: suggestion ${i} is cut (${t}-${b} in ${sb.t}-${sb.b})`);
        });
        assert.ok(sb.items[0][0] >= sb.t - 0.5 && sb.items[0][1] <= sb.b + 0.5, 'first suggestion is cut');
        assert.ok(g.list.h >= 40, 'the list of tries keeps some room: ' + g.list.h);
        await shot(page, `${tag}-keyboard-${kb}`);
      }
      await page.setViewportSize(vp);
      await page.waitForTimeout(100);
      // the newest guess stays visible while the keyboard is up (list scrolled to it)
      await page.locator('#inp').fill('');
      // results: win and loss
      await page.evaluate(() => window.__game.loadLevel(1));
      for (const n of ['Lagos', 'Le Cap', 'Alexandrie', 'Dakar', 'Tunis', 'Accra']) await page.evaluate(x => window.__game.guess(x), n);
      await winShown(page);
      checkFit(await measure(page), tag + ' lost'); await shot(page, `${tag}-lost`);
      await page.locator('#bNext').tap();
      await page.evaluate(() => { window.__game.guess('Lagos'); window.__game.guess('Nairobi'); });
      await winShown(page);
      checkFit(await measure(page), tag + ' won'); await shot(page, `${tag}-won`);
      await context.close();
      // challenge screen
      const c2 = await open(vp, { hash: '#defi-9-3' });
      checkFit(await measure(c2.page), tag + ' challenge'); await shot(c2.page, `${tag}-challenge`);
      await c2.context.close();
    }
  });

  if (!process.env.ONLY) assert.ok(dirsSeen.size >= 6, 'the guessed pairs exercised few directions: ' + [...dirsSeen]);

  await test('no network request, no console error, no page error during the whole run', async () => {
    assert.deepEqual(problems, []);
  });

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(failed ? `\n${failed} test(s) FAILED` : `\nall ${results.length} tests passed`);
  process.exit(failed ? 1 : 0);
})();
