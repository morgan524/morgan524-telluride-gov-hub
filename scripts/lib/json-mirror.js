// JS-literals → JSON migration, Phase 1: DUAL-WRITE.
//
// Bot-managed arrays currently live as JS `const` literals in js/gov-helpers.js,
// rewritten by string surgery — the root cause of the `endDate:"undefined"` /
// dropped-const / July-1 corruption class. The migration moves them to
// data/<name>.json one array at a time, behind the parity harness.
//
// This module is the SAFE first step: the bot writes data/<name>.json ALONGSIDE
// the JS literal (no client reads the JSON yet), and a CI test
// (test/json-mirror.test.js) asserts the two stay identical. Nothing changes for
// browsers; if a later phase flips a reader to the JSON, we already know it
// matches. Reversible: remove the array from MIRROR_ARRAYS.
//
// To migrate another array: add its name here + `node scripts/mirror-json.js`.

const fs = require('fs');
const path = require('path');

// The arrays currently dual-written. Single source of truth for the bot writer,
// the re-sync tool, and the CI check.
const MIRROR_ARRAYS = ['BLOG_POSTS'];

// BLOG_POSTS -> blog-posts.json
function mirrorFileName(varName) {
  return String(varName).toLowerCase().replace(/_/g, '-') + '.json';
}
function mirrorPath(varName, dataDir) {
  return path.join(dataDir, mirrorFileName(varName));
}

// Write data/<name>.json = JSON view of `arr`. Write-if-different so a no-change
// run doesn't touch the file (no spurious commits). Returns the path written to.
function writeMirror(varName, arr, dataDir) {
  const p = mirrorPath(varName, dataDir);
  const json = JSON.stringify(arr, null, 2) + '\n';
  let cur = null;
  try { cur = fs.readFileSync(p, 'utf8'); } catch (e) { /* not yet created */ }
  if (cur !== json) fs.writeFileSync(p, json);
  return p;
}

module.exports = { MIRROR_ARRAYS, mirrorFileName, mirrorPath, writeMirror };
