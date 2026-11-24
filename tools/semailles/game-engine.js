'use strict';
/*
 * Loads the rules and the adversaries out of games/semailles/index.html (the block between the
 * ENGINE markers has no DOM dependency), so that tools and tests measure the code that ships.
 */
const fs = require('node:fs');
const path = require('node:path');
const FILE = path.join(__dirname, '..', '..', 'games', 'semailles', 'index.html');
function load(file = process.env.GAME_FILE || FILE) {
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf('/*ENGINE:BEGIN'), b = html.indexOf('/*ENGINE:END*/');
  if (a < 0 || b < 0) throw new Error('engine block not found');
  const src = html.slice(a, b);
  return new Function(src + '\nreturn {mkBoard,sideSum,feeds,moves,play,status,bestMoves,mkRng,aiMove,LEVELS,WIN,PLY_CAP};')();
}
module.exports = { load, FILE };
