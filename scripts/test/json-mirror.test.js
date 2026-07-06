// JS→JSON migration (Phase 1) safety check: every mirrored array's data/*.json
// must equal its JS literal in gov-helpers.js. If this fails, a hand-edit changed
// the JS literal without re-mirroring — run `node scripts/mirror-json.js` and
// commit the updated data/*.json. This is what makes the eventual reader-flip
// safe: we already know the JSON matches the JS.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractJsArray } = require('../lib/extract.js');
const { MIRROR_ARRAYS, mirrorPath } = require('../lib/json-mirror.js');

const REPO = path.resolve(__dirname, '..', '..');
const DATA = path.join(REPO, 'data');
const jsSrc = fs.readFileSync(path.join(REPO, 'js', 'gov-helpers.js'), 'utf8');

test('MIRROR_ARRAYS is non-empty (the migration set)', () => {
  assert.ok(Array.isArray(MIRROR_ARRAYS) && MIRROR_ARRAYS.length > 0);
});

for (const name of MIRROR_ARRAYS) {
  test(`data mirror for ${name} matches the JS literal in gov-helpers.js`, () => {
    const fromJs = extractJsArray(jsSrc, name) || [];
    const p = mirrorPath(name, DATA);
    assert.ok(fs.existsSync(p),
      `${path.relative(REPO, p)} is missing — run: node scripts/mirror-json.js`);
    const fromJson = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Compare the JSON views of both sides (the mirror IS the JSON view of the
    // JS literal). deepEqual on JSON-normalized data ignores key order.
    assert.deepEqual(fromJson, JSON.parse(JSON.stringify(fromJs)),
      `${name}: data/${path.basename(p)} drifted from the JS literal — run: node scripts/mirror-json.js`);
  });
}
