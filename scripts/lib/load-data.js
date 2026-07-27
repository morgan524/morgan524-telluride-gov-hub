// Shared loader for the bot's data files. Evaluates js/gov-data.js +
// js/gov-helpers.js in a sandbox and returns every UPPER_SNAKE array-of-objects
// (auto-discovered, so new sources are picked up automatically) plus the few
// helper fns we reuse. Used by content-review.js and source-health.js so the
// (slightly fiddly) eval-and-capture logic lives in exactly one place.
//
// The two files declare disjoint top-level `const`s (verified — no overlap),
// so they can be concatenated and evaluated in one Function body, then every
// captured const is read back out of the same lexical scope.

const fs = require('fs');
const path = require('path');

function fallbackLocalDate(str) {
  if (!str) return null;
  const iso = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const d = new Date(str);
  return isNaN(d) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function loadDataArrays(repoRoot) {
  const govDataJs = path.join(repoRoot, 'js', 'gov-data.js');
  const govHelpersJs = path.join(repoRoot, 'js', 'gov-helpers.js');
  const dataSrc = fs.readFileSync(govDataJs, 'utf8');
  const helpersSrc = fs.readFileSync(govHelpersJs, 'utf8');
  const combined = dataSrc + '\n;\n' + helpersSrc;

  const constNames = [...new Set(
    [...combined.matchAll(/^const\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1])
  )];
  const helperNames = ['localDate', 'isBadSummary', 'truncate',
    // Data-layer functions exposed for golden tests (all read back via `captured`;
    // absent names resolve to undefined so this is safe across versions):
    'getMeetingSummary', 'getCountyCachedMeetings', 'meetingBoardToken',
    'getTellurideMeetings', 'resolveEventImage',
    // The full meeting-getter set (build-week-meetings.js aggregates them all):
    'getMVMeetings', 'getSchoolMeetings', 'getFireMeetings', 'getMedMeetings',
    'getNorwoodMeetings', 'getOphirMeetings', 'getAirportMeetings', 'getSmartMeetings',
    'getRidgwayMeetings', 'getRicoMeetings', 'getOurayMeetings', 'getTMVOAMeetings',
    'getMeetingZoomLink', 'getMeetingPasscode'];
  const captureNames = [...constNames, ...helperNames];

  const epilogue =
    '\n;return {' +
    captureNames.map(n => `${JSON.stringify(n)}:(typeof ${n}!=="undefined"?${n}:undefined)`).join(',') +
    '};';

  const stubWindow = {};
  const stubDoc = { addEventListener() {}, querySelector() {}, querySelectorAll() { return []; },
                    getElementById() { return null; }, createElement() { return {}; } };
  const stubStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

  // AI_SUMMARIES is defined INLINE in gov-hub.html, not in the data files, but
  // getMeetingSummary() references it — so outside that page it throws
  // ReferenceError (silently swallowed by callers' try/catch). Provide it as a
  // Function parameter defaulting to {} so getMeetingSummary works in tooling;
  // if a future pipeline writes a real `const AI_SUMMARIES` into gov-helpers.js,
  // that declaration simply shadows this parameter.
  let captured;
  try {
    const fn = new Function('window', 'document', 'navigator', 'localStorage', 'self', 'location', 'AI_SUMMARIES',
      combined + epilogue);
    captured = fn(stubWindow, stubDoc, {}, stubStorage, stubWindow, { href: '', hash: '' }, {}) || {};
  } catch (e) {
    throw new Error('Could not evaluate data files: ' + e.message);
  }

  const localDate = typeof captured.localDate === 'function' ? captured.localDate : fallbackLocalDate;
  const isBadSummary = typeof captured.isBadSummary === 'function' ? captured.isBadSummary : (() => false);

  const arrays = {};
  for (const name of constNames) {
    const v = captured[name];
    // Empty arrays are KEPT (an empty array trivially passes .every) — the
    // source-health zero-drop detector needs to see a source at 0, not have
    // it silently vanish from the map. (2026-07-22 audit P0-1: the old
    // `v.length &&` guard made the "0 items now" alarm structurally
    // unreachable — the exact failure it was built to catch.)
    if (Array.isArray(v) && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
      arrays[name] = v;
    }
  }
  return { arrays, captured, localDate, isBadSummary, dataSrc, helpersSrc };
}

module.exports = { loadDataArrays, fallbackLocalDate };
