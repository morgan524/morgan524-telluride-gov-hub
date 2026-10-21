// Unit tests for js/lt-data.js — the shared data layer rebuilt pages use
// (redesign prep, 2026-07-20). Pure helpers only; the fetch path is
// browser-exercised per page at flip time.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const LTData = require(path.resolve(__dirname, '..', '..', 'js', 'lt-data.js'));

test('esc escapes HTML-significant characters', () => {
  assert.equal(LTData.esc('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  assert.equal(LTData.esc(null), '');
});

test('safeUrl allows only http(s)', () => {
  assert.equal(LTData.safeUrl('https://x.org/a'), 'https://x.org/a');
  assert.equal(LTData.safeUrl('javascript:alert(1)'), '#');
  assert.equal(LTData.safeUrl('', '/events.html'), '/events.html');
});

test('mtDateKey anchors calendar dates to America/Denver (UTC-skew regression)', () => {
  // 03:00 UTC on Jul 20 is still Jul 19 in Denver (MDT = UTC-6) — the exact
  // case .toISOString().slice(0,10) gets wrong.
  assert.equal(LTData.mtDateKey(new Date('2026-07-20T03:00:00Z')), '2026-07-19');
  // Midday UTC is the same calendar day in Denver.
  assert.equal(LTData.mtDateKey(new Date('2026-07-20T18:00:00Z')), '2026-07-20');
});

test('parseDateKey + fmtDate round-trip a date key without day shift', () => {
  assert.equal(LTData.mtDateKey(LTData.parseDateKey('2026-07-20')), '2026-07-20');
  assert.equal(LTData.fmtDate('2026-07-20', { weekday: 'short', month: 'short', day: 'numeric' }),
    'Mon, Jul 20');
});

test('todayMT returns a YYYY-MM-DD key', () => {
  assert.match(LTData.todayMT(), /^\d{4}-\d{2}-\d{2}$/);
});

test('cache bucket is a positive integer (10-minute granularity)', () => {
  const b = LTData._bucket();
  assert.ok(Number.isInteger(b) && b > 0);
});

// Meetings come off the site 3 hours after their scheduled start (MT).
// Oct 22, 2026 is MDT (UTC-6): 17:30 MT = 23:30Z.
test('meetingOver: drops a meeting 3 hours after its start, Mountain Time', () => {
  const at = (iso) => new Date(iso);
  // 5:30 PM meeting: still up at 8:29 PM MT, gone at 8:30 PM MT.
  assert.equal(LTData.meetingOver('2026-10-22', '5:30 PM', at('2026-10-23T02:29:00Z')), false);
  assert.equal(LTData.meetingOver('2026-10-22', '5:30 PM', at('2026-10-23T02:30:00Z')), true);
  // Range: the clock starts at the first time.
  assert.equal(LTData.meetingOver('2026-10-22', '8:30 AM - 11:30 AM', at('2026-10-22T17:29:00Z')), false);
  assert.equal(LTData.meetingOver('2026-10-22', '8:30 AM - 11:30 AM', at('2026-10-22T17:30:00Z')), true);
  // Earlier days are over; later days are not; no time = up through the day.
  assert.equal(LTData.meetingOver('2026-10-21', '9:00 AM', at('2026-10-22T14:00:00Z')), true);
  assert.equal(LTData.meetingOver('2026-10-23', '9:00 AM', at('2026-10-22T14:00:00Z')), false);
  assert.equal(LTData.meetingOver('2026-10-22', '', at('2026-10-23T05:00:00Z')), false);
  // Display-format dates (hand-curated deep-dive lists) work too.
  assert.equal(LTData.meetingOver('Oct 21, 2026', '5:30 PM', at('2026-10-22T14:00:00Z')), true);
  assert.equal(LTData.meetingOver('Oct 23, 2026', '5:30 PM', at('2026-10-22T14:00:00Z')), false);
});

test('startMinutes reads the first clock time in free text', () => {
  assert.equal(LTData.startMinutes('5:30 PM'), 17 * 60 + 30);
  assert.equal(LTData.startMinutes('8:30 AM - 11:30 AM'), 8 * 60 + 30);
  assert.equal(LTData.startMinutes('12:00 PM'), 12 * 60);
  assert.equal(LTData.startMinutes('12:15 AM'), 15);
  assert.equal(LTData.startMinutes('6 p.m.'), 18 * 60);
  assert.equal(LTData.startMinutes('Noon'), 12 * 60);
  assert.equal(LTData.startMinutes(''), null);
});
