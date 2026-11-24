'use strict';
// Runs every tests/*.spec.js in sequence (or only the slugs given as arguments).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const wanted = process.argv.slice(2);
const specs = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.spec.js'))
  .filter(f => !wanted.length || wanted.includes(f.replace('.spec.js', '')))
  .sort();
let failed = 0;
for (const spec of specs) {
  console.log('\n=== ' + spec + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, spec)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log('\n' + (specs.length - failed) + '/' + specs.length + ' suites passed');
process.exit(failed ? 1 : 0);
