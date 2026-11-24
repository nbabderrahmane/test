'use strict';
/*
 * Verifier of the grids of "Qui va où" (les-familles).
 *   node tools/les-familles/verify.js        -> report, exit code 1 on any problem
 * For each grid it checks the shape, the honest word table (every word of a family really
 * carries the family tag) and PROVES that the grid has exactly ONE complete split of its 12
 * words into 4 triples that each share at least one tag of the word table (all the tags, not
 * only the 4 declared ones: any other reading of the same table would count as a second solution).
 */
const { TAGS, WORDS, GRIDS } = require('./data');

const MAX_LEN = 9;

// All the ways to cut the indexes 0..11 into 4 unordered triples (5775 of them), calling cb(triples).
function partitions(n, cb) {
  const used = new Array(n).fill(false), cur = [];
  (function rec() {
    let a = used.indexOf(false);
    if (a < 0) { cb(cur); return; }
    used[a] = true;
    for (let b = a + 1; b < n; b++) {
      if (used[b]) continue;
      used[b] = true;
      for (let c = b + 1; c < n; c++) {
        if (used[c]) continue;
        used[c] = true; cur.push([a, b, c]);
        rec();
        cur.pop(); used[c] = false;
      }
      used[b] = false;
    }
    used[a] = false;
  })();
}

function analyse(grid) {
  const words = [];
  grid.forEach(([, ws]) => ws.forEach(w => words.push(w)));
  const tags = words.map(w => WORDS[w] || []);
  const shared = (i, j, k) => tags[i].filter(t => tags[j].includes(t) && tags[k].includes(t));
  const solutions = [];
  partitions(words.length, parts => {
    if (parts.every(([i, j, k]) => shared(i, j, k).length > 0)) solutions.push(parts.map(p => p.slice()));
  });
  // a trap = a word that the table lets belong to two of the grid's own families
  const own = grid.map(([t]) => t);
  const traps = words.filter((w, i) => own.filter(t => tags[i].includes(t)).length > 1);
  return { words, solutions, traps };
}

function verify() {
  const problems = [], rows = [];
  if (GRIDS.length !== 20) problems.push('expected 20 grids, got ' + GRIDS.length);
  const seenSets = new Set();
  GRIDS.forEach((grid, g) => {
    const tag = 'grid ' + (g + 1);
    if (grid.length !== 4) { problems.push(tag + ': needs 4 families'); return; }
    const ownTags = grid.map(f => f[0]);
    if (new Set(ownTags).size !== 4) problems.push(tag + ': two families with the same tag');
    const all = [];
    grid.forEach(([t, ws]) => {
      if (!TAGS[t]) problems.push(tag + ': unknown tag ' + t);
      if (ws.length !== 3) problems.push(tag + ': family ' + t + ' needs 3 words');
      ws.forEach(w => {
        all.push(w);
        if (!WORDS[w]) problems.push(tag + ': "' + w + '" is not in the word table');
        else if (!WORDS[w].includes(t)) problems.push(tag + ': "' + w + '" is not tagged ' + t + ' in the word table');
        if (w.length > MAX_LEN) problems.push(tag + ': "' + w + '" is longer than ' + MAX_LEN + ' letters');
        if (w !== w.toLowerCase() || /[\s-]/.test(w)) problems.push(tag + ': "' + w + '" must be one lowercase word');
      });
    });
    if (new Set(all).size !== 12) problems.push(tag + ': the 12 words are not distinct');
    const a = analyse(grid);
    if (a.solutions.length !== 1) problems.push(tag + ': ' + a.solutions.length + ' complete splits (must be exactly 1)');
    else {
      // the unique split must be the declared one
      const idx = new Map(a.words.map((w, i) => [w, i]));
      const declared = grid.map(([, ws]) => ws.map(w => idx.get(w)).sort((x, y) => x - y).join());
      const found = a.solutions[0].map(p => p.join()).sort();
      if (declared.slice().sort().join('|') !== found.join('|')) problems.push(tag + ': the unique split is not the declared one');
    }
    const key = a.words.slice().sort().join('|');
    if (seenSets.has(key)) problems.push(tag + ': same 12 words as another grid');
    seenSets.add(key);
    rows.push({ n: g + 1, solutions: a.solutions.length, traps: a.traps, longest: Math.max(...all.map(w => w.length)) });
  });
  // difficulty must climb: the number of traps never goes down from one block of five grids to the next
  const block = i => rows.slice(i * 5, i * 5 + 5).reduce((s, r) => s + r.traps.length, 0);
  if (rows.length === 20) {
    for (let b = 1; b < 4; b++) if (block(b) < block(b - 1)) problems.push('traps drop between blocks ' + b + ' and ' + (b + 1) + ' (' + block(b - 1) + ' -> ' + block(b) + ')');
    if (block(0) !== 0) problems.push('the first five grids must have no trap');
    rows.slice(0, 5).forEach(r => { if (r.traps.length) problems.push('grid ' + r.n + ' is meant to be plain'); });
    rows.slice(5).forEach(r => { if (!r.traps.length) problems.push('grid ' + r.n + ' has no trap'); });
  }
  return { problems, rows };
}

module.exports = { verify, analyse, MAX_LEN };

if (require.main === module) {
  const { problems, rows } = verify();
  rows.forEach(r => console.log(`grid ${String(r.n).padStart(2)}: ${r.solutions} split, traps: ${r.traps.join(', ') || '-'}`));
  if (problems.length) { console.log('\nPROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }
  console.log('\nok: 20 grids, each with exactly one complete split');
}
