// Sunday digest review (scripts/digest-review.js): date-badge checks and the
// per-reader variant used for the size check.
const test = require('node:test');
const assert = require('node:assert');
const RR = require('../lib/recap-regions.js');
const { checkDates, variant } = require('../digest-review.js');

const WEEK = { weekStart: '2026-10-05' };

test('a badge whose weekday matches and sits in the window passes', () => {
  assert.deepStrictEqual(checkDates('weekly', '<span>TUE, OCT 6</span><span>WED, SEP 30</span>', WEEK), []);
});

test('a wrong weekday is flagged high', () => {
  const issues = checkDates('weekly', '<span>WED, OCT 6</span>', WEEK);
  assert.ok(issues.some((x) => x.severity === 'high' && /is a TUE/.test(x.problem)));
});

test('a date outside both windows is flagged', () => {
  const issues = checkDates('weekly', '<span>TUE, OCT 20</span>', WEEK);
  assert.ok(issues.some((x) => /outside/.test(x.problem)));
});

test('Past Meetings only accepts last week', () => {
  assert.ok(checkDates('past', '<span>TUE, OCT 6</span>', WEEK).some((x) => /outside/.test(x.problem)));
  assert.deepStrictEqual(checkDates('past', '<span>TUE, SEP 29</span>', WEEK), []);
});

test('year boundary: a late-December week resolves to the right year', () => {
  assert.deepStrictEqual(checkDates('weekly', '<span>MON, JAN 4</span><span>TUE, DEC 29</span>', { weekStart: '2027-01-04' }), []);
});

test('variant keeps one region copy and unhides it', () => {
  const html = 'a' + RR.regionBlock('ALL', { 'East End': 'E', 'West End': 'W', 'Ridgway/Ouray': 'O' }) + 'z';
  assert.strictEqual(variant(html, 1), 'aALLz');
  assert.strictEqual(variant(html, 3), 'aWz');
});

const { applyTextFixes, textOf } = require('../digest-review.js');

test('a text fix is applied inside text nodes, to every copy, never to markup', () => {
  const html = '<div>WHEN? Doors at 6:30</div><a href="x">WHEN? Doors at 6:30</a><style>.WHEN{}</style>';
  const issues = [{ fix: { find: 'WHEN? Doors', replace: 'Doors' } }];
  const out = applyTextFixes(html, issues);
  assert.strictEqual(out, '<div>Doors at 6:30</div><a href="x">Doors at 6:30</a><style>.WHEN{}</style>');
  assert.ok(issues[0].fixed);
});

test('a fix that is not found exactly, or would add markup, is left alone', () => {
  const issues = [{ fix: { find: 'not here at all', replace: 'x' } }, { fix: { find: 'Doors at', replace: '<b>Doors</b> at' } }];
  assert.strictEqual(applyTextFixes('<p>Doors at 6:30</p>', issues), '<p>Doors at 6:30</p>');
  assert.ok(!issues[0].fixed && !issues[1].fixed);
});

test('non-ASCII text survives a fix as numeric entities', () => {
  const out = applyTextFixes('<p>Theater&#8217;s show &#8212; tonight</p>', [{ fix: { find: 'show', replace: 'musical' } }]);
  assert.strictEqual(out, '<p>Theater&#8217;s musical &#8212; tonight</p>');
});

test('text extraction joins a word bolded in two pieces', () => {
  assert.ok(textOf('<div>Restoration <strong>Pl</strong>an site walk</div>').includes('Restoration Plan site walk'));
});
