// JS→JSON migration (Phase 1) safety check: every mirrored array's data/*.json
// must equal its JS literal in gov-helpers.js. If this fails, a hand-edit changed
// the JS literal without re-mirroring — run `node scripts/mirror-json.js` and
// commit the updated data/*.json. This is what makes the eventual reader-flip
// safe: we already know the JSON matches the JS.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadDataArrays } = require('../lib/load-data.js');
const { MIRROR_ARRAYS, MIRROR_OBJECTS, MIRROR_GOVDATA_ARRAYS, MIRROR_GOVDATA_OBJECTS, mirrorPath } = require('../lib/json-mirror.js');

const REPO = path.resolve(__dirname, '..', '..');
const DATA = path.join(REPO, 'data');
// EVALUATED values (not string extraction): the writer (mirrorAll) evaluates,
// so the test must compare against the same view — and a const that fails to
// evaluate/exist must FAIL here, never silently compare as empty (audit P0-2).
const { captured } = loadDataArrays(REPO);

test('MIRROR_ARRAYS is non-empty (the migration set)', () => {
  assert.ok(Array.isArray(MIRROR_ARRAYS) && MIRROR_ARRAYS.length > 0);
});

function checkMirror(name, wantArray, origin) {
  test(`data mirror for ${name} matches the evaluated const (${origin})`, () => {
    const v = captured[name];
    assert.ok(v !== undefined,
      `${name} not found in evaluated data files — a renamed/deleted const would have been mirrored as empty`);
    assert.ok(wantArray ? Array.isArray(v) : (typeof v === 'object' && !Array.isArray(v)),
      `${name} is not ${wantArray ? 'an array' : 'an object'}`);
    const p = mirrorPath(name, DATA);
    assert.ok(fs.existsSync(p),
      `${path.relative(REPO, p)} is missing — run: node scripts/mirror-json.js`);
    const fromJson = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Compare the JSON views of both sides. deepEqual on JSON-normalized data
    // ignores key order.
    assert.deepEqual(fromJson, JSON.parse(JSON.stringify(v)),
      `${name}: data/${path.basename(p)} drifted from the evaluated const — run: node scripts/mirror-json.js`);
  });
}

for (const name of MIRROR_ARRAYS) checkMirror(name, true, 'gov-helpers');
for (const name of MIRROR_OBJECTS) checkMirror(name, false, 'gov-helpers object');
for (const name of MIRROR_GOVDATA_ARRAYS) checkMirror(name, true, 'gov-data');
for (const name of MIRROR_GOVDATA_OBJECTS) checkMirror(name, false, 'gov-data object');
