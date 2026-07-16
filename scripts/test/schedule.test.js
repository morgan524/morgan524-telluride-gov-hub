const test = require('node:test');
const assert = require('node:assert/strict');
const { nthWeekday, nextOccurrences, fmtDate } = require('../lib/schedule.js');

test('nthWeekday computes nth and last weekday correctly', () => {
  // Med regular = 4th Thursday. Verified against real history.
  assert.equal(fmtDate(nthWeekday(2026, 6, 4, 4)), 'July 23, 2026');   // Jul: Thu 2,9,16,23,30 → 4th=23
  assert.equal(fmtDate(nthWeekday(2026, 0, 4, 4)), 'January 22, 2026'); // matches MED history
  assert.equal(fmtDate(nthWeekday(2026, 3, 4, 4)), 'April 23, 2026');   // matches MED history
  // Ophir GA = 3rd Tuesday
  assert.equal(fmtDate(nthWeekday(2026, 5, 3, 2)), 'June 16, 2026');    // matches OPHIR history
  assert.equal(fmtDate(nthWeekday(2026, 6, 3, 2)), 'July 21, 2026');
  // Ridgway TC = 2nd Wednesday ("second Wednesday of the month")
  assert.equal(fmtDate(nthWeekday(2026, 6, 2, 3)), 'July 8, 2026');     // matches RIDGWAY history
  assert.equal(fmtDate(nthWeekday(2026, 5, 2, 3)), 'June 10, 2026');    // matches RIDGWAY history
  // last-weekday branch: last Thursday of Feb 2026 = Feb 26
  assert.equal(fmtDate(nthWeekday(2026, 1, -1, 4)), 'February 26, 2026');
});

test('nextOccurrences returns forward dates, honors count and skipMonths', () => {
  const from = new Date(2026, 6, 16); // 2026-07-16
  // 4th Thursday, next 2: Jul 23 (>= today) then Aug 27
  const med = nextOccurrences({ nth: 4, weekday: 4 }, from, 2);
  assert.deepEqual(med.map(o => o.date), ['July 23, 2026', 'August 27, 2026']);
  // If today were after this month's occurrence, it rolls to next month
  const from2 = new Date(2026, 6, 24); // after Jul 23
  const med2 = nextOccurrences({ nth: 4, weekday: 4 }, from2, 1);
  assert.equal(med2[0].date, 'August 27, 2026');
  // skipMonths: skip August → next after Jul is September
  const skipped = nextOccurrences({ nth: 4, weekday: 4 }, from2, 1, [7]);
  assert.equal(skipped[0].date, 'September 24, 2026');
});
