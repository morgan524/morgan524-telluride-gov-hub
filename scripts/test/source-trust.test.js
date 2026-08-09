const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileByTrust, trustOf, TRUST, LOW, MID, HIGH } = require('../lib/source-trust.js');

test('trustOf: known sources ranked, unknown defaults to MID', () => {
  assert.equal(trustOf('MOUNTAIN_VILLAGE_EVENTS'), LOW);
  assert.equal(trustOf('KOTO_COMMUNITY_EVENTS'), HIGH);
  assert.equal(trustOf('SOME_RANDOM_ARRAY'), MID);
});

test('reconcileByTrust drops a LOW source date conflict vs a higher source', () => {
  const out = reconcileByTrust({
    MOUNTAIN_VILLAGE_EVENTS: [{ title: 'Town Talk: Tau', pubDate: '2026-06-30' }],   // off by 1
    KOTO_COMMUNITY_EVENTS:   [{ title: 'Town Talk: Tau', pubDate: '2026-07-01' }],
  });
  assert.ok(out.MOUNTAIN_VILLAGE_EVENTS, 'MV should be reconciled');
  assert.equal(out.MOUNTAIN_VILLAGE_EVENTS.dropped.length, 1);
  assert.equal(out.MOUNTAIN_VILLAGE_EVENTS.kept.length, 0);
});

test('reconcileByTrust does NOT drop same-date overlaps', () => {
  const out = reconcileByTrust({
    MOUNTAIN_VILLAGE_EVENTS: [{ title: 'Market on the Plaza', pubDate: '2026-06-24' }],
    KOTO_COMMUNITY_EVENTS:   [{ title: 'Market on the Plaza', pubDate: '2026-06-24' }],
  });
  assert.deepEqual(out, {});   // nothing dropped
});

test('reconcileByTrust only touches LOW sources, never MID/HIGH', () => {
  // ALIBI (MID) conflicts with KOTO (HIGH) — must NOT be auto-dropped.
  const out = reconcileByTrust({
    ALIBI_EVENTS:          [{ title: 'Some Band', date: '2026-07-19' }],
    KOTO_COMMUNITY_EVENTS: [{ title: 'Some Band', date: '2026-07-20' }],
  });
  assert.ok(!out.ALIBI_EVENTS, 'MID source must not be reconciled');
  assert.ok(!out.KOTO_COMMUNITY_EVENTS, 'HIGH source must not be reconciled');
});

test('marking a source LOW would enable reconciliation (config is the only lever)', () => {
  // Sanity: the config drives behavior — MV is the sole LOW source today.
  const lows = Object.keys(TRUST).filter(n => TRUST[n] === LOW);
  assert.deepEqual(lows, ['MOUNTAIN_VILLAGE_EVENTS']);
});

// ── Festival-anchored date reconciliation ────────────────────────────────
// The trust tiers can't settle a festival's start date: the sources that
// disagree are all HIGH, and correctly so. TELLURIDE_FESTIVALS anchors it.
const { reconcileFestivalDates } = require('../lib/source-trust.js');

const FESTIVALS = [
  { name: 'Telluride Mushroom Festival', month: 7, dayStart: 12, dayEnd: 17 },  // month is 0-indexed
  { name: 'Telluride Blues & Brews Festival', month: 8, dayStart: 18, dayEnd: 20 },
];

test('an off-date festival header is dropped against the vetted start', () => {
  const res = reconcileFestivalDates({
    SHERIDAN_EVENTS: [{ title: 'Telluride Mushroom Festival', pubDate: '2026-08-13' }],
  }, FESTIVALS);
  assert.equal(res.SHERIDAN_EVENTS.dropped.length, 1);
  assert.equal(res.SHERIDAN_EVENTS.dropped[0].canonicalDate, '2026-08-12');
  assert.equal(res.SHERIDAN_EVENTS.kept.length, 0);
});

test('the copy already on the festival start is kept', () => {
  const res = reconcileFestivalDates({
    KOTO_COMMUNITY_EVENTS: [{ title: 'Telluride Mushroom Festival', date: '2026-08-12T00:00:00-06:00' }],
  }, FESTIVALS);
  assert.deepEqual(res, {}, 'nothing to reconcile');
});

test("individual shows DURING a festival are not headers and must survive", () => {
  // This is the over-match that would delete real events: every one of these
  // contains the festival's name, but each is a distinct show on its own night.
  const shows = [
    { title: 'Banshee Tree w/ Quattlebaum - Telluride Mushroom Festival', date: '2026-08-12' },
    { title: 'The Copper Children & Thom LaFond- Telluride Mushroom Festival', date: '2026-08-13' },
    { title: 'DJ Jonko X Codestar - Telluride Mushroom Fest', date: '2026-08-14' },
  ];
  const res = reconcileFestivalDates({ ALIBI_EVENTS: shows }, FESTIVALS);
  assert.deepEqual(res, {}, 'no show was mistaken for a duplicate header');
});

test('an identically-named event far from the festival is left alone', () => {
  // A retrospective or announcement months away is not a duplicate header.
  const res = reconcileFestivalDates({
    COMMUNITY_EVENTS: [{ title: 'Telluride Mushroom Festival', date: '2026-12-05' }],
  }, FESTIVALS);
  assert.deepEqual(res, {}, 'outside the +/-30d window');
});

test('anchoring follows the record year, not a hardcoded one', () => {
  const res = reconcileFestivalDates({
    SHERIDAN_EVENTS: [{ title: 'Telluride Blues & Brews Festival', pubDate: '2027-09-17' }],
  }, FESTIVALS);
  assert.equal(res.SHERIDAN_EVENTS.dropped[0].canonicalDate, '2027-09-18');
});

test('missing or malformed festival config reconciles nothing', () => {
  const rec = { title: 'Telluride Mushroom Festival', date: '2026-08-13' };
  assert.deepEqual(reconcileFestivalDates({ A: [rec] }, []), {});
  assert.deepEqual(reconcileFestivalDates({ A: [rec] }, [{ name: 'Telluride Mushroom Festival' }]), {});
  // A record with no parseable date is never dropped.
  assert.deepEqual(reconcileFestivalDates({ A: [{ title: 'Telluride Mushroom Festival' }] }, FESTIVALS), {});
});
