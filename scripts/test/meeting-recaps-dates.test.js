const test = require('node:test');
const assert = require('node:assert');
const { parseDateFromTitle, bodyToken } = require('../meeting-recaps.js');

test('parses SMART M-D-YY titles', () => {
  assert.strictEqual(parseDateFromTitle('9-10-26 SMART Board Meeting'), '2026-09-10');
  assert.strictEqual(parseDateFromTitle('9-28-26 Gondola Leadership Committee Meeting'), '2026-09-28');
  assert.strictEqual(parseDateFromTitle('10-1-2026 SMART Board Meeting'), '2026-10-01');
});

test('existing title formats still parse', () => {
  assert.strictEqual(parseDateFromTitle('Special HARC Meeting 09/30/2026'), '2026-09-30');
  assert.strictEqual(parseDateFromTitle('Town Council Regular Meeting – September 9, 2026'), '2026-09-09');
  assert.strictEqual(parseDateFromTitle('BOCC 05282026'), '2026-05-28');
});

test('SMART video and minutes titles share a body token', () => {
  assert.strictEqual(bodyToken('9-10-26 SMART Board Meeting'), bodyToken('SMART Board of Directors — Sep 10, 2026'));
  assert.notStrictEqual(bodyToken('9-28-26 Gondola Leadership Committee Meeting'), bodyToken('9-10-26 SMART Board Meeting'));
});
