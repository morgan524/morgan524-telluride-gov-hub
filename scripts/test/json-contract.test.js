// JSON data-contract checks (redesign prep, 2026-07-20).
//
// json-mirror.test.js proves each data/*.json EQUALS its JS literal; this file
// proves the data itself has the SHAPE pages depend on — so a field rename,
// a serializer bug, or a scraper regression fails CI instead of silently
// breaking the browser render. These contracts are what rebuilt (JSON-first)
// pages are allowed to assume. Keep them in sync with
// docs/redesign/page-inventory.md when a page's needs change.
//
// Philosophy: assert PRESENCE + TYPE, not formats we don't control. The one
// format rule everywhere: no string field may be the literal "undefined" or
// "NaN" — the exact bug class (endDate:"undefined") that motivated the JSON
// migration.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const DATA = path.join(REPO, 'data');

// ---- per-file contracts -------------------------------------------------
// required: every record must have these keys with non-empty string values
//           (arrays of alternatives allowed: ['link','href'] = either one).
// minCount: fail if the array has fewer records (0 = may be legitimately
//           empty — seasonal/irregular sources).
const EVENT = { required: ['title', ['link', 'href'], ['date', 'pubDate']], minCount: 0 };
const EVENT_LIVE = { ...EVENT, minCount: 1 };            // sources that should never be empty
const MEETING_SEED = { required: ['title', 'date'], minCount: 1 };
const NEWS = { required: ['title', 'href', 'date'], minCount: 1 };

const CONTRACTS = {
  // — scraped event feeds (events.html) —
  'alibi-events.json': EVENT,
  'beacon-events.json': EVENT,
  'chamber-music-events.json': EVENT,
  'club-red-shows.json': EVENT,
  'community-events.json': { required: ['title', 'href', 'date'], minCount: 0 },
  'fresh-food-hub-events.json': EVENT,
  'koto-community-events.json': EVENT_LIVE,
  'mountain-village-events.json': EVENT_LIVE,
  'music-on-the-green.json': EVENT,                      // 60-day window — empty off-season
  'norwood-events.json': EVENT,
  'nucla-naturita-events.json': EVENT,
  'ouray-county-events.json': EVENT,
  'ouray-ridgway-events.json': EVENT_LIVE,
  'sherbino-events.json': { required: ['title', 'href', 'date'], minCount: 0 },
  'sheridan-events.json': EVENT,
  'telluride-com-events.json': EVENT_LIVE,
  'telluride-farmers-market.json': EVENT,                // seasonal
  'telluride-foundation-events.json': EVENT,
  'telluride-rotary-meetings.json': { required: ['title'], minCount: 0 },
  'telluride-science-events.json': { required: ['title', 'link', 'date'], minCount: 0 },
  'telluride-venture-events.json': EVENT,
  'wilkinson-events.json': EVENT,
  // — news (local-news.html) —
  'telluride-times-articles.json': NEWS,
  'koto-newscasts.json': NEWS,
  'koto-featured-stories.json': { required: ['title', 'href', 'date'], minCount: 0 },
  'smb-forum-articles.json': NEWS,
  'local-news-featured.json': { required: ['title', 'href'], minCount: 0 },
  // — meetings (gov-hub.html + digest) —
  'county-cached-data.json': MEETING_SEED,
  'telluride-board-meetings.json': MEETING_SEED,
  'telluride-cached-data.json': MEETING_SEED,
  'mv-cached-data.json': MEETING_SEED,
  'school-cached-data.json': MEETING_SEED,
  'fire-cached-data.json': MEETING_SEED,
  'med-cached-data.json': MEETING_SEED,
  'norwood-cached-data.json': MEETING_SEED,
  'ophir-cached-data.json': MEETING_SEED,
  'ridgway-cached-data.json': MEETING_SEED,
  'smart-cached-data.json': { required: ['title', 'date'], minCount: 0 },  // BOT-REBUILT each run
  'airport-cached-data.json': { required: ['title', 'date'], minCount: 0 },
  // — other page data —
  'legal-notices.json': { required: ['title', 'entity', 'url'], minCount: 1 },
  'humane-society-animals.json': { required: ['name', 'species', 'profileUrl'], minCount: 0 },
  'blog-posts.json': { required: ['title', 'date'], minCount: 1 },
};

// Object-map mirrors: values must be non-empty strings (or objects), keys non-empty.
const OBJECT_FILES = ['manual-summaries.json', 'meeting-agenda-meta.json',
  'ridgway-agenda-map.json', 'rico-agenda-map.json'];

// ---- helpers ------------------------------------------------------------
const BAD_LITERALS = new Set(['undefined', 'NaN']);
function findBadLiteral(v, trail) {
  if (typeof v === 'string') return BAD_LITERALS.has(v.trim()) ? trail : null;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = findBadLiteral(v[i], trail + '[' + i + ']'); if (r) return r; } return null; }
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) { const r = findBadLiteral(v[k], trail + '.' + k); if (r) return r; } return null; }
  return null;
}
function hasField(rec, spec) {
  const keys = Array.isArray(spec) ? spec : [spec];
  return keys.some((k) => typeof rec[k] === 'string' ? rec[k].trim() !== '' : rec[k] != null);
}
const fieldLabel = (spec) => Array.isArray(spec) ? spec.join('|') : spec;

// ---- generic checks on EVERY data/*.json --------------------------------
const allFiles = fs.readdirSync(DATA).filter((f) => f.endsWith('.json'));

test('data/ contains the contracted files', () => {
  for (const f of Object.keys(CONTRACTS).concat(OBJECT_FILES)) {
    assert.ok(allFiles.includes(f), `data/${f} is missing`);
  }
});

for (const f of allFiles) {
  test(`data/${f}: parses, and no literal "undefined"/"NaN" string values`, () => {
    const d = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    const bad = findBadLiteral(d, f);
    assert.equal(bad, null, `literal ${JSON.stringify('undefined/NaN')} value at ${bad}`);
  });
}

// ---- per-file shape contracts -------------------------------------------
for (const [f, c] of Object.entries(CONTRACTS)) {
  test(`data/${f}: shape contract (fields: ${c.required.map(fieldLabel).join(', ')}; min ${c.minCount})`, () => {
    const p = path.join(DATA, f);
    if (!fs.existsSync(p)) return;   // existence is asserted above; don't double-fail
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(Array.isArray(arr), `${f} must be an array`);
    assert.ok(arr.length >= c.minCount,
      `${f} has ${arr.length} records (< ${c.minCount}) — a normally-live source went empty; check the scraper before shipping`);
    arr.forEach((rec, i) => {
      assert.ok(rec && typeof rec === 'object', `${f}[${i}] is not an object`);
      for (const spec of c.required) {
        assert.ok(hasField(rec, spec),
          `${f}[${i}] ("${String(rec.title || rec.name || '?').slice(0, 40)}") missing required field ${fieldLabel(spec)}`);
      }
    });
  });
}

for (const f of OBJECT_FILES) {
  test(`data/${f}: object-map contract (non-empty keys, string/object values)`, () => {
    const p = path.join(DATA, f);
    if (!fs.existsSync(p)) return;
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(obj && typeof obj === 'object' && !Array.isArray(obj), `${f} must be an object`);
    for (const [k, v] of Object.entries(obj)) {
      assert.ok(k.trim() !== '', `${f} has an empty key`);
      assert.ok(typeof v === 'string' ? v.trim() !== '' : (v && typeof v === 'object'),
        `${f}["${k}"] has an empty/invalid value`);
    }
  });
}
