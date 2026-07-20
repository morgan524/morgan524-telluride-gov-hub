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
