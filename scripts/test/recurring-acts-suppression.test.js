// A specific act replaces the generic series card — but only that series.
//
// recurring-acts.json exists to surface the thing a generic title hides: not
// "Movie Mondays in Hartwell Park" but "Movie Mondays: Top Gun". Folding those
// acts into data/events-index.json (2026-08-09) therefore has to drop the
// generic entry on any date an act covers, or the events page shows both.
//
// The risk this file guards is the OPPOSITE error — over-matching. Suppressing
// "Telluride Farmers' Market Music Series" must not also suppress "Telluride
// Farmers Market", which is a genuinely different event running the same
// morning. Substring matching on normalized titles is what makes both the
// catch and the miss correct, and it is easy to "simplify" into something that
// silently deletes a real event from the calendar.
const test = require('node:test');
const assert = require('node:assert');
const { actSuppressionIndex, isActSuppressed } = require('../build-events-index.js');

// The builder's own matcher — not a copy of it, so a regression there fails here.
const isSuppressed = isActSuppressed;

const ACTS = [
  { series: 'Movie Mondays', date: '2026-08-17', title: 'Movie Mondays: Top Gun' },
  { series: "Telluride Farmers' Market Music Series", date: '2026-08-14', title: "Telluride Farmers' Market Music Series: Travis Fisher" },
  { series: 'Augment Summer Music Series', date: '2026-09-15', title: 'Augment Summer Music Series: Charlie and the Leatherheads' },
];

test('the generic series card is suppressed on a date an act covers', () => {
  const idx = actSuppressionIndex(ACTS);
  assert.ok(isSuppressed(idx, 'Movie Mondays in Hartwell Park', '2026-08-17'));
  assert.ok(isSuppressed(idx, 'Augment Summer Music Series', '2026-09-15'));
});

test('a DIFFERENT event sharing words with the series is left alone', () => {
  // The whole point: the market itself still runs, and still belongs on the page.
  const idx = actSuppressionIndex(ACTS);
  assert.equal(isSuppressed(idx, 'Telluride Farmers Market', '2026-08-14'), false);
  assert.equal(isSuppressed(idx, 'Ridgway Farmers Market', '2026-08-14'), false);
});

test('suppression is scoped to the act’s own date', () => {
  const idx = actSuppressionIndex(ACTS);
  // Movie Mondays runs monthly; the weeks without a listed film keep their
  // generic card rather than vanishing from the calendar entirely.
  assert.equal(isSuppressed(idx, 'Movie Mondays in Hartwell Park', '2026-09-21'), false);
});

test('malformed act rows never suppress anything', () => {
  // A half-written entry must not blank a real event: no date, no series, or a
  // non-ISO date all mean "no suppression", not "suppress everywhere".
  const idx = actSuppressionIndex([
    { series: 'Movie Mondays', date: '' },
    { series: '', date: '2026-08-17' },
    { series: 'Movie Mondays', date: 'next Monday' },
    null,
  ]);
  assert.equal(idx.size, 0);
  assert.equal(isSuppressed(idx, 'Movie Mondays in Hartwell Park', '2026-08-17'), false);
});

// ── Calendar dates must not be timezone-converted ───────────────────────
// A bare "YYYY-MM-DD" is a calendar date, not an instant. new Date() reads it
// as UTC midnight, and converting THAT to Mountain Time lands on the previous
// day — so every source storing a date-only pubDate was listed a day early.
// Found 2026-08-09: the Mushroom Festival starts Aug 12, but telluride.com's
// and the Alibi's copies rendered as Aug 11. 40 events were off by one.
const { dateKeyOf } = require('../build-events-index.js');

test('a date-only pubDate is a calendar date, not an instant', () => {
  assert.equal(dateKeyOf({ pubDate: '2026-08-12' }), '2026-08-12');
  assert.equal(dateKeyOf({ pubDate: ' 2026-08-12 ' }), '2026-08-12');
});

test('a pubDate WITH an offset is a real instant and is converted', () => {
  // KOTO stores midnight Mountain explicitly; that is already the right day.
  assert.equal(dateKeyOf({ pubDate: '2026-08-12T00:00:00-06:00' }), '2026-08-12');
  // An instant late in the UTC day is still the same Mountain calendar day.
  assert.equal(dateKeyOf({ pubDate: '2026-08-12T23:00:00Z' }), '2026-08-12');
  // ...and one just past UTC midnight belongs to the PREVIOUS Mountain day.
  assert.equal(dateKeyOf({ pubDate: '2026-08-13T02:00:00Z' }), '2026-08-12');
});

test('an explicit date field always wins over pubDate', () => {
  assert.equal(dateKeyOf({ date: '2026-08-12', pubDate: '2026-01-01' }), '2026-08-12');
  assert.equal(dateKeyOf({ date: '2026-08-12T00:00:00-06:00' }), '2026-08-12');
});

test('an undated record yields no key rather than a wrong one', () => {
  assert.equal(dateKeyOf({}), '');
  assert.equal(dateKeyOf({ pubDate: 'not a date' }), '');
});
