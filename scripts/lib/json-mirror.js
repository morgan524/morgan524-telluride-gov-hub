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
// the re-sync tool, and the CI check. All live in js/gov-helpers.js and are
// written ONLY by content-refresh.js (verified) — so its atomic commits keep the
// JSON in lockstep. (gov-data.js arrays and object-maps like MANUAL_SUMMARIES are
// later phases: they need file-aware / object-aware mirroring.)
const MIRROR_ARRAYS = [
  // deep dives
  'DEEP_DIVE_UPDATES',
  // news
  'TELLURIDE_TIMES_ARTICLES', 'SMB_FORUM_ARTICLES', 'KOTO_NEWSCASTS', 'KOTO_FEATURED_STORIES',
  // events (bot-synced)
  'ALIBI_EVENTS', 'SHERIDAN_EVENTS', 'SHERBINO_EVENTS', 'CLUB_RED_SHOWS', 'WILKINSON_EVENTS',
  'KOTO_COMMUNITY_EVENTS', 'MOUNTAIN_VILLAGE_EVENTS', 'TELLURIDE_COM_EVENTS', 'TELLURIDE_SCIENCE_EVENTS',
  'FRESH_FOOD_HUB_EVENTS', 'NORWOOD_EVENTS', 'NUCLA_NATURITA_EVENTS', 'OURAY_COUNTY_EVENTS', 'OURAY_RIDGWAY_EVENTS',
  // events (hand-curated in gov-helpers.js — NOT bot-written). content-refresh
  // still re-mirrors them from the current JS each run, so the JSON self-heals
  // within ~6h; a hand-edit needs `node scripts/mirror-json.js` to sync CI now.
  // events.html reads these JSON files directly (reader flip), so keep them here.
  'COMMUNITY_EVENTS', 'MUSIC_ON_THE_GREEN', 'TELLURIDE_FARMERS_MARKET', 'BEACON_EVENTS',
  'CHAMBER_MUSIC_EVENTS', 'TELLURIDE_ROTARY_MEETINGS', 'TELLURIDE_FOUNDATION_EVENTS', 'TELLURIDE_VENTURE_EVENTS',
  // meetings / civic / other
  'TELLURIDE_BOARD_MEETINGS', 'LEGAL_NOTICES', 'HUMANE_SOCIETY_ANIMALS',
  // blog
  'BLOG_POSTS', 'LOCAL_NEWS_FEATURED',
  // housing — written by housing-refresh.js (which also writes this mirror);
  // content-refresh re-mirrors from the current JS each run as a self-heal.
  'HOUSING_LISTINGS',
];

// Bot-managed OBJECT maps (keyed data, not arrays) — same dual-write, extracted
// via extractJsObject instead of extractJsArray. All in js/gov-helpers.js, all
// sole-written by content-refresh.js (verified). MANUAL_SUMMARIES is the meeting
// summaries; MEETING_AGENDA_META the per-meeting zoom/agenda metadata.
const MIRROR_OBJECTS = ['MANUAL_SUMMARIES', 'MEETING_AGENDA_META', 'RIDGWAY_AGENDA_MAP', 'RICO_AGENDA_MAP'];

// Meeting-seed arrays that live in js/gov-DATA.js (not gov-helpers). content-refresh
// hand-maintains their base entries and PATCHES agenda URLs into them. Mirrored
// file-aware (extracted from gov-data.js). NOT the static config in gov-data.js
// (LOCAL_ORGS, TELLURIDE_FESTIVALS, reject/skip patterns, QR_OPTIONS, …) — that's
// hand-only config, not part of the bot-data migration.
const MIRROR_GOVDATA_ARRAYS = [
  'COUNTY_CACHED_DATA', 'NORWOOD_CACHED_DATA', 'OPHIR_CACHED_DATA', 'SCHOOL_CACHED_DATA',
  'TELLURIDE_CACHED_DATA', 'MV_CACHED_DATA', 'MED_CACHED_DATA', 'SMART_CACHED_DATA',
  'FIRE_CACHED_DATA', 'RIDGWAY_CACHED_DATA', 'AIRPORT_CACHED_DATA',
  // deep-dive page index (hand-edited config; redesign reads the JSON)
  'DEEP_DIVE_PAGES',
  // local orgs directory (hand-edited config; redesign local-orgs reads the JSON)
  'LOCAL_ORGS',
];

// HAND-EDITED config objects in gov-data.js, mirrored for the redesign's
// JSON-first pages (deep-dive detail/index read land-use-issues.json). Unlike
// the bot arrays these change only by human edit — after editing gov-data.js,
// run `node scripts/mirror-json.js` and commit, or the json-mirror CI test
// fails. content-refresh also re-mirrors them each run as a self-heal.
const MIRROR_GOVDATA_OBJECTS = ['LAND_USE_ISSUES', 'GONDOLA_DATA'];

// BLOG_POSTS -> blog-posts.json
function mirrorFileName(varName) {
  return String(varName).toLowerCase().replace(/_/g, '-') + '.json';
}
function mirrorPath(varName, dataDir) {
  return path.join(dataDir, mirrorFileName(varName));
}

// Write data/<name>.json = JSON view of `data` (an array OR an object).
// Write-if-different so a no-change run doesn't touch the file (no spurious
// commits). Returns the path written to.
function writeMirror(varName, data, dataDir) {
  const p = mirrorPath(varName, dataDir);
  const json = JSON.stringify(data, null, 2) + '\n';
  let cur = null;
  try { cur = fs.readFileSync(p, 'utf8'); } catch (e) { /* not yet created */ }
  if (cur !== json) fs.writeFileSync(p, json);
  return p;
}

module.exports = { MIRROR_ARRAYS, MIRROR_OBJECTS, MIRROR_GOVDATA_ARRAYS, MIRROR_GOVDATA_OBJECTS, mirrorFileName, mirrorPath, writeMirror };
