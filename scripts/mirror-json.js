#!/usr/bin/env node
// Re-write data/<name>.json for every array in the JS→JSON mirror set, from the
// current js/gov-helpers.js. Two uses:
//   - SEED the mirrors the first time (and whenever a new array is added).
//   - FIX drift: if the json-mirror CI test fails after a hand-edit to a mirrored
//     array in gov-helpers.js, run this to re-sync, then commit.
//
//   node scripts/mirror-json.js

const fs = require('fs');
const path = require('path');
const { extractJsArray } = require('./lib/extract.js');
const { MIRROR_ARRAYS, writeMirror } = require('./lib/json-mirror.js');

const REPO = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'js', 'gov-helpers.js'), 'utf8');
const DATA = path.join(REPO, 'data');

for (const name of MIRROR_ARRAYS) {
  const arr = extractJsArray(src, name) || [];
  const p = writeMirror(name, arr, DATA);
  console.log(`mirrored ${name} → ${path.relative(REPO, p)} (${arr.length} items)`);
}
