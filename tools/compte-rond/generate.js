'use strict';
/*
 * Offline generator of the 20 fixed levels of compte-rond (fixed seed, reproducible).
 *   node tools/compte-rond/generate.js            -> writes levels.json, solutions.json,
 *                                                    injects the levels into games/compte-rond/index.html
 *                                                    and rewrites docs/contenu/compte-rond.md
 * Each level: 6 numbers, a target, `par` = minimal number of operations proven by the exhaustive
 * solver (solver.js). Solutions stay in solutions.json; the game never embeds them.
 */
const fs = require('node:fs');
const path = require('node:path');
const { table, solution, countMinimal } = require('./solver');

const ROOT = path.join(__dirname, '..', '..');
const SEED = 24112026;

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SMALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const MID = [12, 15, 20, 25];
const BIG = [25, 50, 75, 100];
function sample(r, pool, n) {
  const p = pool.slice(), out = [];
  while (out.length < n) out.push(p.splice(Math.floor(r() * p.length), 1)[0]);
  return out;
}
const pools = {
  S: r => sample(r, SMALL.slice(0, 9), 6),
  M: r => sample(r, SMALL, 5).concat(sample(r, MID, 1)),
  B1: r => sample(r, SMALL, 5).concat(sample(r, BIG, 1)),
  B2: r => sample(r, SMALL, 4).concat(sample(r, BIG, 2)),
  B3: r => sample(r, SMALL, 3).concat(sample(r, BIG, 2)).concat(sample(r, MID, 1)),
};

// k = minimal operations ; pool ; tr = target range ; add = a +-only solution is required (and it is minimal) ;
// noAdd = no +-only solution of minimal length (forces a x) ; many = prefer many solutions (easy), else few.
const SPECS = [
  { k: 2, pool: 'S', tr: [8, 18], add: true, many: true },
  { k: 2, pool: 'S', tr: [18, 26], add: true, many: true },
  { k: 2, pool: 'S', tr: [20, 32], add: true, many: true },
  { k: 3, pool: 'S', tr: [20, 36], add: true, many: true },
  { k: 2, pool: 'S', tr: [12, 48], noAdd: true, many: true },
  { k: 3, pool: 'S', tr: [24, 60], noAdd: true, many: true },
  { k: 3, pool: 'M', tr: [30, 80], many: false },
  { k: 3, pool: 'M', tr: [40, 100], many: false },
  { k: 4, pool: 'M', tr: [50, 120], many: false },
  { k: 3, pool: 'B1', tr: [60, 160], many: false },
  { k: 4, pool: 'B1', tr: [80, 220], many: false },
  { k: 4, pool: 'B1', tr: [100, 300], many: false },
  { k: 3, pool: 'B2', tr: [100, 400], many: false },
  { k: 4, pool: 'B2', tr: [150, 500], many: false },
  { k: 5, pool: 'B1', tr: [100, 500], many: false },
  { k: 4, pool: 'B2', tr: [200, 700], many: false },
  { k: 5, pool: 'B2', tr: [200, 800], many: false },
  { k: 4, pool: 'B3', tr: [300, 900], many: false },
  { k: 5, pool: 'B2', tr: [300, 999], many: false },
  { k: 5, pool: 'B3', tr: [400, 999], many: false },
];

function makeLevel(idx) {
  const spec = SPECS[idx], r = rng(SEED + 7919 * (idx + 1));
  const cands = [];
  for (let attempt = 0; attempt < 400 && cands.length < 14; attempt++) {
    const nums = pools[spec.pool](r);
    const best = table(nums, false);
    const bestAdd = spec.add || spec.noAdd ? table(nums, true) : null;
    const ok = [];
    for (let t = spec.tr[0]; t <= spec.tr[1]; t++) {
      if (best.get(t) !== spec.k) continue;
      if (nums.some(n => Math.abs(n - t) <= 5)) continue;
      if (spec.add && bestAdd.get(t) !== spec.k) continue;
      if (spec.noAdd && bestAdd.get(t) !== undefined && bestAdd.get(t) <= spec.k) continue;
      ok.push(t);
    }
    // keep up to 2 random targets per number set
    for (let n = 0; n < 2 && ok.length; n++) cands.push({ nums: nums.slice().sort((a, b) => a - b), target: ok.splice(Math.floor(r() * ok.length), 1)[0] });
  }
  if (!cands.length) throw new Error('no candidate for level ' + (idx + 1));
  let pick = null;
  for (const c of cands) {
    c.count = countMinimal(c.nums, c.target, spec.k);
    if (!pick || (spec.many ? c.count > pick.count : c.count < pick.count)) pick = c;
  }
  const sol = solution(pick.nums, pick.target, !!spec.add);
  if (sol.length !== spec.k) throw new Error('level ' + (idx + 1) + ': reference solution length ' + sol.length);
  return { numbers: pick.nums, target: pick.target, par: spec.k, solutions: pick.count, solution: sol };
}

function main() {
  const t0 = Date.now(), levels = [];
  for (let i = 0; i < SPECS.length; i++) {
    levels.push(makeLevel(i));
    const L = levels[i];
    console.log('L' + (i + 1), L.numbers.join(' '), '->', L.target, 'par', L.par, 'solutions', L.solutions, (Date.now() - t0) + ' ms');
  }
  fs.writeFileSync(path.join(__dirname, 'levels.json'), JSON.stringify({
    seed: SEED, levels: levels.map(L => ({ numbers: L.numbers, target: L.target, par: L.par, solutions: L.solutions })),
  }, null, 1) + '\n');
  fs.writeFileSync(path.join(__dirname, 'solutions.json'), JSON.stringify({
    note: 'One minimal solution per level: [a, op, b, result] steps. Used by tests only; never embedded in the game.',
    levels: levels.map(L => L.solution),
  }) + '\n');

  // inject into the game
  const gf = path.join(ROOT, 'games', 'compte-rond', 'index.html');
  if (fs.existsSync(gf)) {
    let html = fs.readFileSync(gf, 'utf8');
    const body = '/*LEVELS:BEGIN (generated by tools/compte-rond/generate.js, do not edit by hand)*/\nvar LEVELS=[\n' +
      levels.map(L => '  {n:[' + L.numbers.join(',') + '],t:' + L.target + ',p:' + L.par + '}').join(',\n') + '\n];\n/*LEVELS:END*/';
    html = html.replace(/\/\*LEVELS:BEGIN[\s\S]*?\/\*LEVELS:END\*\//, () => body);
    fs.writeFileSync(gf, html);
  }

  // content table to validate
  const md = ['# compte-rond — les 20 niveaux', '',
    'Contenu à valider par un humain avant publication. Généré par `tools/compte-rond/generate.js` (graine ' + SEED + '), prouvé par solveur exhaustif :',
    '`Opérations min.` = nombre minimal d\'opérations (repère des 3 étoiles). `Solutions` = nombre de solutions minimales distinctes (ensembles d\'opérations).',
    'Les solutions complètes sont dans `tools/compte-rond/solutions.json` (pas dans le jeu).', '',
    '| Niveau | Nombres | Cible | Opérations min. | Solutions | Plus grand nombre |', '|---:|---|---:|---:|---:|---:|'];
  levels.forEach((L, i) => md.push('| ' + (i + 1) + ' | ' + L.numbers.join(', ') + ' | ' + L.target + ' | ' + L.par + ' | ' + L.solutions + ' | ' + Math.max(...L.numbers) + ' |'));
  md.push('', 'Étoiles : 3 = cible exacte en autant d\'opérations que le repère ou moins ; 2 = cible exacte ; 1 = à 5 près (bouton « Valider »).', '');
  fs.writeFileSync(path.join(ROOT, 'docs', 'contenu', 'compte-rond.md'), md.join('\n'));
}
main();
