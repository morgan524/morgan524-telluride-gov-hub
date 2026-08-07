// Guards the fix for the 2026-08-07 "placeholder regeneration" leak: every
// content-refresh run (8x/day) re-asked Claude to rewrite the same "agenda
// hasn't been posted yet" stub for ~10 meetings, because the old skip
// condition required BOTH the agenda text and the seed text to be empty — and
// seed text is never empty for CivicClerk/county meetings.
//
// The contract these tests pin down:
//   • same inputs as last time  -> skip the Claude call
//   • inputs changed (an agenda posted) -> regenerate, so cards self-heal
//   • never seen before (no `ph`) -> regenerate, so the stamp gets written once
const test = require('node:test');
const assert = require('node:assert');
const {
  isPlaceholderSummary,
  summaryInputFingerprint,
  placeholderIsCurrent,
} = require('../lib/clean-text.js');

const SEED = 'Board of County Commissioners Meeting - Regular';
const AGENDA = 'CALL TO ORDER. 1. Resolution 2026-14 amending the land use code...';

test('fingerprint is stable for identical inputs', () => {
  assert.equal(summaryInputFingerprint(AGENDA, SEED), summaryInputFingerprint(AGENDA, SEED));
  assert.equal(summaryInputFingerprint('', ''), summaryInputFingerprint('', ''));
});

test('fingerprint changes when a real agenda lands', () => {
  assert.notEqual(summaryInputFingerprint('', SEED), summaryInputFingerprint(AGENDA, SEED));
});

test('agenda/seed boundary is not ambiguous', () => {
  // 'ab' + '' must not collide with 'a' + 'b'.
  assert.notEqual(summaryInputFingerprint('ab', ''), summaryInputFingerprint('a', 'b'));
});

test('unchanged placeholder is skipped (the leak this fixes)', () => {
  const fp = summaryInputFingerprint('', SEED);
  assert.equal(placeholderIsCurrent(true, fp, fp), true);
});

test('placeholder regenerates once a real agenda appears', () => {
  const before = summaryInputFingerprint('', SEED);
  const after = summaryInputFingerprint(AGENDA, SEED);
  assert.equal(placeholderIsCurrent(true, before, after), false);
});

test('placeholder with no prior stamp regenerates (first run after deploy)', () => {
  const fp = summaryInputFingerprint('', SEED);
  assert.equal(placeholderIsCurrent(true, undefined, fp), false);
});

test('a real summary is never skipped by this guard', () => {
  const fp = summaryInputFingerprint(AGENDA, SEED);
  assert.equal(placeholderIsCurrent(false, fp, fp), false);
});

test('the stubs seen in production are classified as placeholders', () => {
  for (const s of [
    "The August 27 CWAB agenda hasn't been posted yet.",
    "The August 27 CWAB meeting agenda hasn't been posted yet.",
    "The September 2, 2026 Ecology Commission agenda hasn't been posted yet.",
  ]) assert.equal(isPlaceholderSummary(s), true, s);
});
