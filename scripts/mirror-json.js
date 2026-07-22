#!/usr/bin/env node
// Re-write data/<name>.json for every name in the JS→JSON mirror set, from the
// EVALUATED js/gov-data.js + js/gov-helpers.js (lib/json-mirror.js mirrorAll).
// Two uses:
//   - SEED the mirrors the first time (and whenever a new name is added).
//   - FIX drift: if the json-mirror CI test fails after a hand-edit to a mirrored
//     const, run this to re-sync, then commit.
//
//   node scripts/mirror-json.js
//
// Evaluation (not string extraction) so IIFE consts like MUSIC_ON_THE_GREEN
// mirror their computed arrays. A missing/mistyped const is a hard failure
// (exit 1) — never silently mirrored as empty (2026-07-22 audit P0-2).

const path = require('path');
const { mirrorAll } = require('./lib/json-mirror.js');

const REPO = path.resolve(__dirname, '..');
const { written, failures } = mirrorAll(REPO);
for (const w of written) console.log(`mirrored ${w.name} (${w.count} items/keys)`);
if (failures.length) {
  console.error('\nMIRROR FAILURES:');
  for (const f of failures) console.error('  ✖ ' + f);
  process.exit(1);
}
console.log(`\n${written.length} mirrors in sync.`);
