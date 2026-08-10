// Digest meeting headlines must name their own body — "Norwood Board of
// Trustees Meeting", not "Board of Trustees Meeting" sitting under a chip.
//
// Both failure directions are ugly in a published email, so both are pinned:
// under-prefixing leaves a headline nobody can place, and over-prefixing
// produces "Norwood Norwood Water Commission Meeting".
const test = require('node:test');
const assert = require('node:assert');
const { meetingDisplayName } = require('../lib/meeting-title.js');

test('a bare committee name gets its jurisdiction', () => {
  // The case that prompted this (Morgan, 2026-08-09).
  assert.equal(meetingDisplayName('Board of Trustees Meeting', 'Norwood'),
    'Norwood Board of Trustees Meeting');
  assert.equal(meetingDisplayName('HARC Meeting', 'Town of Telluride'),
    'Town of Telluride HARC Meeting');
  assert.equal(meetingDisplayName('Town Council Meeting', 'Mountain Village'),
    'Mountain Village Town Council Meeting');
  assert.equal(meetingDisplayName('Gondola Subcommittee Meeting', 'TMVOA'),
    'TMVOA Gondola Subcommittee Meeting');
  assert.equal(meetingDisplayName('Board of Directors Meeting', 'Fire District'),
    'Fire District Board of Directors Meeting');
});

test('a name that already carries its body is left alone', () => {
  assert.equal(meetingDisplayName('Norwood Water Commission Meeting', 'Norwood'),
    'Norwood Water Commission Meeting');
  // "Town of" is generic, so the match is on "ridgway" — which is already there.
  assert.equal(meetingDisplayName('Ridgway Town Council Regular Meeting', 'Town of Ridgway'),
    'Ridgway Town Council Regular Meeting');
  assert.equal(meetingDisplayName('SMART Board of Directors', 'SMART Transit'),
    'SMART Board of Directors');
});

test('a self-identifying name is left alone even with no shared word', () => {
  // "Telluride Board of Education" shares nothing with "School District R-1",
  // but prefixing it reads as bureaucratic stutter.
  assert.equal(meetingDisplayName('Telluride Board of Education Monthly Meeting', 'School District R-1'),
    'Telluride Board of Education Monthly Meeting');
  assert.equal(meetingDisplayName('TRAA Board of Commissioners Meeting', 'Airport'),
    'TRAA Board of Commissioners Meeting');
});

test('generic label words never count as a match on their own', () => {
  // "Board of County Commissioners" contains "county" and "board" — both
  // generic. Without excluding them the county's own meetings would never get
  // their jurisdiction, which is the exact headline that needs it most.
  assert.equal(meetingDisplayName('Board of County Commissioners Meeting', 'San Miguel County'),
    'San Miguel County Board of County Commissioners Meeting');
  assert.equal(meetingDisplayName('Planning Commission Meeting', 'San Miguel County'),
    'San Miguel County Planning Commission Meeting');
});

test('matching is on whole words, not substrings', () => {
  // "Ophir" must not be considered present in "Ophirtown" or similar; and a
  // partial overlap like "Rico" inside "Rican" should not suppress the prefix.
  assert.equal(meetingDisplayName('Puerto Rican Heritage Session', 'Town of Rico'),
    'Town of Rico Puerto Rican Heritage Session');
  assert.equal(meetingDisplayName('General Assembly Meeting', 'Ophir'),
    'Ophir General Assembly Meeting');
});

test('missing or empty inputs degrade to something printable', () => {
  assert.equal(meetingDisplayName('Board of Trustees Meeting', ''), 'Board of Trustees Meeting');
  assert.equal(meetingDisplayName('Board of Trustees Meeting', null), 'Board of Trustees Meeting');
  assert.equal(meetingDisplayName('', 'Norwood'), '');
  // A label with no distinctive word left can't usefully prefix anything.
  assert.equal(meetingDisplayName('Regular Meeting', 'The District'), 'Regular Meeting');
});

test('it is idempotent — re-running never double-prefixes', () => {
  const once = meetingDisplayName('Board of Trustees Meeting', 'Norwood');
  assert.equal(meetingDisplayName(once, 'Norwood'), once);
});
