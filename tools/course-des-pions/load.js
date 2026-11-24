'use strict';
// Loads the pure rules block (between the ENGINE markers) of games/course-des-pions/index.html, so the
// tools and the tests run the very code the game ships, without a browser.
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '..', 'games', 'course-des-pions', 'index.html');

let cached = null;
function loadEngine(file = FILE) {
  if (file === FILE && cached) return cached;
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf('/*ENGINE:BEGIN');
  const b = html.indexOf('/*ENGINE:END*/');
  if (a < 0 || b < 0) throw new Error('ENGINE block not found');
  const E = new Function(html.slice(a, b) + '\nreturn ENGINE;')();
  if (file === FILE) cached = E;
  return E;
}
module.exports = { loadEngine, FILE };
