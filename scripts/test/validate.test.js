const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecords, isParseableDate } = require('../lib/validate.js');

test('quarantines a present-but-unparseable date', () => {
  const { kept, quarantined } = validateRecords([
    { title: 'Good', date: '2026-07-04' },
    { title: 'Bad', date: 'someday next week' },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].title, 'Good');
  assert.equal(quarantined.length, 1);
  assert.match(quarantined[0].reason, /unparseable date/);
});

test('keeps records with valid ISO and named-month dates', () => {
  const { quarantined } = validateRecords([
    { title: 'A', date: '2026-07-04' },
    { title: 'B', date: 'July 4, 2026' },
    { name: 'C', pubDate: '2026-07-04T15:00:00.000Z' },   // identifier via `name`
  ]);
  assert.equal(quarantined.length, 0);
});

test('passes through records with no date field (config-like rows)', () => {
  const { kept, quarantined } = validateRecords([
    { key: 'x', value: 1 },
    { label: 'logo', src: 'a.png' },
  ]);
  assert.equal(kept.length, 2);
  assert.equal(quarantined.length, 0);
});

test('quarantines a dated junk fragment (no id AND no content)', () => {
  const { quarantined } = validateRecords([{ date: '2026-07-04', img: 'x.png' }]);
  assert.equal(quarantined.length, 1);
  assert.match(quarantined[0].reason, /no title/);
});

test('KEEPS a dated record that has content but no title (human decides)', () => {
  const { kept, quarantined } = validateRecords([
    { date: '2026-07-04', description: 'A real event with details but a missing title' },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(quarantined.length, 0);
});

test('non-object array members pass through', () => {
  const { kept } = validateRecords(['a', 5, null]);
  assert.equal(kept.length, 3);
});

test('isParseableDate accepts site formats, rejects junk', () => {
  assert.ok(isParseableDate('2026-07-04'));
  assert.ok(isParseableDate('July 4, 2026'));
  assert.ok(isParseableDate('2026-07-04T15:00:00.000Z'));
  assert.ok(!isParseableDate('next Tuesday'));
  assert.ok(!isParseableDate(''));
});
