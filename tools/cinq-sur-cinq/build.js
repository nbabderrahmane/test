'use strict';
/*
 * Rewrites the question block of games/cinq-sur-cinq/index.html and docs/contenu/cinq-sur-cinq.md
 * from tools/cinq-sur-cinq/questions.js.   Usage: node tools/cinq-sur-cinq/build.js
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const data = require('./questions.js');
const GAME = path.join(root, 'games', 'cinq-sur-cinq', 'index.html');
const DOC = path.join(root, 'docs', 'contenu', 'cinq-sur-cinq.md');

if (data.length !== 20) throw new Error('20 levels expected');
const seen = new Set();
data.forEach((l, i) => {
  if (l.qs.length !== 5) throw new Error('level ' + (i + 1) + ': 5 questions expected');
  l.qs.forEach(q => {
    const opts = [q.a, ...q.w];
    if (opts.length !== 4 || new Set(opts).size !== 4) throw new Error('bad options: ' + q.q);
    if (seen.has(q.q)) throw new Error('duplicate question: ' + q.q);
    seen.add(q.q);
  });
});

// Options are stored base64-encoded in a scrambled order (fixed per question, from its rank), with the right index
// XOR-masked by the rank: light obfuscation only, not protection (a quiz has to ship its answers).
function mulberry(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let rank = 0;
const packed = data.map(l => [l.theme, l.qs.map(q => {
  const rnd = mulberry(rank * 2654435761 + 12345), o = [q.a, ...q.w];
  for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  const code = o.indexOf(q.a) ^ ((rank * 7 + 3) & 3);
  rank++;
  return [q.q, o.map(t => Buffer.from(t, 'utf8').toString('base64')), code];
})]);
const block = 'var DATA=' + JSON.stringify(packed) + ';';
let html = fs.readFileSync(GAME, 'utf8');
const re = /(\/\*DATA:BEGIN[^\n]*\*\/\n)[\s\S]*?(\n\/\*DATA:END\*\/)/;
if (!re.test(html)) throw new Error('data markers not found');
html = html.replace(re, (m, a, b) => a + block + b);
fs.writeFileSync(GAME, html);

const stars = c => (c === 3 ? 'certain' : 'très sûr, à vérifier en priorité');
let md = '# Carton Plein (`cinq-sur-cinq`) — contenu à valider\n\n' +
  '> **À valider par un humain avant publication.**\n' +
  '> Les 100 questions ci-dessous ont été rédigées par un agent à partir de sa seule mémoire, sans source consultée. ' +
  'Le degré de certitude est l’estimation de l’auteur, pas une vérification. Écarté d’office : tout ce qui dépend de l’actualité ' +
  '(palmarès « record », titres récents, effectifs). Fichier généré par `tools/cinq-sur-cinq/build.js` : ne pas l’éditer à la main, ' +
  'corriger `tools/cinq-sur-cinq/questions.js`.\n\n' +
  'Certitude : **certain** = fait ancien et établi ; **très sûr** = fait établi mais un chiffre ou un détail mérite un contrôle.\n';
let n = 0;
data.forEach((l, i) => {
  md += '\n## Niveau ' + (i + 1) + ' — ' + l.theme + '\n\n| # | Question | Bonne réponse | Mauvaises réponses | Certitude |\n|---|---|---|---|---|\n';
  l.qs.forEach(q => { n++; md += '| ' + n + ' | ' + q.q + ' | **' + q.a + '** | ' + q.w.join(' ; ') + ' | ' + stars(q.c) + ' |\n'; });
});
fs.writeFileSync(DOC, md);
console.log('ok: ' + n + ' questions, game block ' + block.length + ' bytes');
