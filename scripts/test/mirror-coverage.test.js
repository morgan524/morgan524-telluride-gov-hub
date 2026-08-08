// Every script that rewrites a JS data file must also re-mirror it.
//
// The rebuilt pages read data/<name>.json (via js/lt-data.js), NOT the JS
// consts. A script that writes js/gov-helpers.js or js/gov-data.js without
// re-mirroring therefore ships a change the site cannot see — it sits in the
// JS until some *other* job happens to re-mirror.
//
// Before 2026-08-08 four scripts did exactly that: maintenance.js,
// deep-dive-refresh.js, festival-ticket-check.js, and meeting-recaps.js. The
// visible symptoms were a red json-mirror test twice in two days
// (LOCAL_NEWS_FEATURED on 08-07, TELLURIDE_TIMES_ARTICLES on 08-08), but the
// real cost was the drift window in between, during which the site served
// stale content.
//
// This is a structural guard rather than a behavioral one on purpose: the
// failure mode is "someone adds a fifth writer and forgets", which no test of
// existing behavior would catch.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '..');

// A script "writes a JS data file" if it fs-writes gov-helpers.js/gov-data.js
// (directly or through a path const that names them).
function writesJsDataFile(src) {
  const namesDataFile = /gov-helpers\.js|gov-data\.js/.test(src);
  if (!namesDataFile) return false;
  return /fs\.writeFileSync\(\s*(GOV_HELPERS(_JS)?|GOV_DATA(_JS)?|govHubPath)\b/.test(src)
    || /fs\.writeFileSync\([^)]*gov-(helpers|data)\.js/.test(src);
}

// It "re-mirrors" if it calls mirrorAll (whole set) or writeMirror (one const).
function reMirrors(src) {
  return /\bmirrorAll\s*\(/.test(src) || /\bwriteMirror\s*\(/.test(src);
}

const scripts = fs.readdirSync(SCRIPTS_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ name: f, src: fs.readFileSync(path.join(SCRIPTS_DIR, f), 'utf8') }))
  .filter((s) => writesJsDataFile(s.src));

test('the detector finds the known writers (guards against a silently-empty test)', () => {
  // If a refactor renames the path consts, writesJsDataFile could quietly match
  // nothing and this whole file would pass while checking zero scripts.
  const names = scripts.map((s) => s.name);
  for (const expected of [
    'content-refresh.js',
    'maintenance.js',
    'deep-dive-refresh.js',
    'festival-ticket-check.js',
    'meeting-recaps.js',
    'housing-refresh.js',
  ]) {
    assert.ok(names.includes(expected), `detector no longer sees ${expected} as a JS-data writer`);
  }
});

for (const { name, src } of scripts) {
  test(`${name} re-mirrors after writing a JS data file`, () => {
    assert.ok(
      reMirrors(src),
      `${name} writes js/gov-helpers.js or js/gov-data.js but never calls mirrorAll()/writeMirror(). ` +
      'The site reads data/*.json, so this change would be invisible until another job re-mirrors. ' +
      'Add a mirrorAll(REPO_ROOT) pass after the write (see content-refresh.js or maintenance.js).',
    );
  });
}
