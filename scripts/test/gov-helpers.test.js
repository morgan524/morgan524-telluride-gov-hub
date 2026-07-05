// Golden / regression tests for the gov-helpers.js DATA LAYER — the functions
// the digest, gov-hub, and events page all depend on, and the ones that keep
// breaking (Phase 1 "safety net" from docs/overhaul/). These lock in current
// correct behavior so the coming consolidation can't silently regress.
//
// Data-dependent getters (getMeetingSummary, getCountyCachedMeetings) run against
// the REAL data files, which the bot rewrites daily — so those assert INVARIANTS
// (shape, no-crash, no-shadowing), not exact snapshots. Pure functions
// (localDate, isBadSummary, resolveEventImage) get exact golden assertions.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadDataArrays } = require('../lib/load-data.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const { arrays, captured, localDate } = loadDataArrays(REPO_ROOT);
const getMeetingSummary = captured.getMeetingSummary;
const getCountyCachedMeetings = captured.getCountyCachedMeetings;
const resolveEventImage = captured.resolveEventImage;

// ── date handling (overhaul risk D — recurring UTC off-by-one) ───────────────
test('localDate: ISO date maps to the correct LOCAL calendar day (no UTC shift)', () => {
  const d = localDate('2026-07-04');
  assert.ok(d instanceof Date && !isNaN(d), 'should parse to a Date');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);        // July (0-indexed)
  assert.equal(d.getDate(), 4);         // the 4th, never the 3rd
});

test('localDate: named-month format parses to the right day', () => {
  const d = localDate('July 8, 2026');
  assert.ok(d instanceof Date && !isNaN(d));
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 8);
});

// ── isBadSummary heuristic (overhaul risk G/F — it once suppressed good ones) ─
test('isBadSummary: real, substantive summaries are NOT flagged as bad', () => {
  const good = [
    'A full agenda for the last day of June. The most consequential item: first reading of Land Use Code amendments.',
    'The Planning Commission and BOCC hold a joint work session on forestry, oil and gas, and geothermal code sections.',
  ];
  for (const s of good) assert.equal(captured.isBadSummary(s), false, `should NOT be bad: ${s.slice(0, 40)}…`);
});

test('isBadSummary: long page-artifact / navigation text IS flagged', () => {
  const artifact = 'This page requires JavaScript to view the agenda page content. '
    + 'Skip to main content and use the agenda document navigation menu. Click here to download the meeting pdf.';
  assert.ok(artifact.length > 120);
  assert.equal(captured.isBadSummary(artifact), true);
});

// ── getMeetingSummary (overhaul risk 3/4 — the summary resolver) ─────────────
test('getMeetingSummary is a function and never throws on a well-formed meeting', () => {
  assert.equal(typeof getMeetingSummary, 'function');
  const sample = { title: 'Board of County Commissioners Meeting', source: 'county', eventDate: localDate('2026-07-01') };
  const out = getMeetingSummary(sample);
  assert.ok(out === '' || typeof out === 'string', 'returns a string (possibly empty)');
});

// ── getCountyCachedMeetings (the #53 rename/dedup fix — lock the invariants) ──
test('getCountyCachedMeetings returns well-formed county records', () => {
  assert.equal(typeof getCountyCachedMeetings, 'function');
  const out = getCountyCachedMeetings();
  assert.ok(Array.isArray(out), 'returns an array');
  for (const m of out) {
    assert.equal(m.source, 'county');
    assert.equal(m.sourceLabel, 'San Miguel County');
    assert.ok(typeof m.title === 'string' && m.title.length, 'has a title');
    assert.ok(m.eventDate instanceof Date && !isNaN(m.eventDate), 'has a valid eventDate');
  }
});

test('getCountyCachedMeetings: no stale-title shadow — one record per date+board (the Jul 8/9 bug)', () => {
  // The rename bug surfaced TWO county cards for the same meeting (old stale
  // title + current title). getCountyCachedMeetings must collapse to one per
  // date+board so a placeholder can never shadow the real, summarized meeting.
  const ctok = (t) => /planning/i.test(t) ? 'pc'
    : /board of county commissioners|commissioners|bocc/i.test(t) ? 'bocc'
    : /open space/i.test(t) ? 'openspace'
    : /historic/i.test(t) ? 'historical' : (t || '').toLowerCase().trim();
  const seen = new Map();
  for (const m of getCountyCachedMeetings()) {
    const key = m.eventDate.toISOString().slice(0, 10) + '|' + ctok(m.title);
    assert.ok(!seen.has(key), `two county records share ${key}: "${seen.get(key)}" & "${m.title}" — a rename left a stale shadow`);
    seen.set(key, m.title);
  }
});

// ── resolveEventImage (the shared image resolver, PR #57) ────────────────────
// Conditional: activates once #57 lands on main; skips cleanly before then so
// this file is green on the current main.
test('resolveEventImage: band photo when present, series poster as fallback', (t) => {
  if (typeof resolveEventImage !== 'function') return t.skip('resolveEventImage not on this branch yet (PR #57)');
  const emailOpts = { origin: 'https://livabletelluride.org', exists: () => true };

  // Band photo present → primary is the real photo, absolutized for email.
  const withPhoto = resolveEventImage(
    { title: 'Alex Maryol — Music on the Green', imageUrl: '/img/music-on-the-green/alex-maryol.jpg' }, emailOpts);
  assert.equal(withPhoto.primary, 'https://livabletelluride.org/img/music-on-the-green/alex-maryol.jpg');
  assert.match(withPhoto.fallback, /music-on-the-green\.jpg$/);

  // Band photo MISSING (exists=false) → primary drops, poster remains the fallback.
  const missing = resolveEventImage(
    { title: 'New Band — Music on the Green', imageUrl: '/img/music-on-the-green/new-band.jpg' },
    { origin: 'https://livabletelluride.org', exists: () => false });
  assert.equal(missing.primary, '');
  assert.match(missing.fallback, /music-on-the-green\.jpg$/);

  // Absolute external image passes through; non-series has no poster fallback.
  const ext = resolveEventImage({ title: 'Some Concert', img: 'https://cdn.example.com/x.jpg' }, emailOpts);
  assert.equal(ext.primary, 'https://cdn.example.com/x.jpg');
  assert.equal(ext.fallback, '');
});

// ── sanity: the loader actually discovered the data (guards a bad data write) ─
test('data files load and expose the expected source arrays', () => {
  assert.ok(arrays.COMMUNITY_EVENTS, 'COMMUNITY_EVENTS discovered');
  assert.ok(Array.isArray(arrays.MUSIC_ON_THE_GREEN), 'MUSIC_ON_THE_GREEN discovered');
});
