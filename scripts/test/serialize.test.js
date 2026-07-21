const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeArray, serializeObject } = require('../lib/serialize.js');

test('serializeArray OMITS undefined fields (the endDate:"undefined" bug)', () => {
  const out = serializeArray('X', [{ title: 'Run', date: '2026-07-04', endDate: undefined }]);
  assert.ok(!/undefined/.test(out), 'must not emit the literal string "undefined"');
  assert.ok(!/endDate/.test(out), 'undefined key should be dropped entirely');
  assert.match(out, /title: "Run"/);
});

test('serializeArray keeps real values and types', () => {
  const out = serializeArray('X', [{ title: 'Fest', date: '2026-07-10', endDate: '2026-07-12', notable: true, n: 3 }]);
  assert.match(out, /endDate: "2026-07-12"/);
  assert.match(out, /notable: true/);   // boolean unquoted
  assert.match(out, /n: 3/);            // number unquoted
});

test('serializeArray quotes strings safely (apostrophes, etc.)', () => {
  const out = serializeArray('X', [{ title: "Rico's Fireweed" }]);
  assert.match(out, /"Rico's Fireweed"/);
});

test('serializeArray output is valid JS that round-trips', () => {
  const arr = [{ title: 'A', date: '2026-07-04' }, { title: 'B', endDate: undefined }];
  const out = serializeArray('X', arr);
  // eslint-disable-next-line no-new-func
  const back = new Function(`${out}; return X;`)();
  assert.equal(back.length, 2);
  assert.equal(back[0].title, 'A');
  assert.ok(!('endDate' in back[1]));   // undefined was omitted, not "undefined"
});

test('serializeObject emits nested objects as inline JSON', () => {
  const out = serializeObject('M', { 'k|1': { zoomUrl: 'https://z', id: '1' } });
  assert.match(out, /"zoomUrl":"https:\/\/z"/);
});

test('serializeArray: arrays of objects survive round-trip (votes[] bug 2026-07-21)', () => {
  const arr = [{ title: 'x', votes: [{ item: 'STR ordinance', outcome: 'Passed', tally: '6-0' }] }];
  const src = serializeArray('T', arr);
  assert.ok(!src.includes('[object Object]'), 'nested objects must not stringify to [object Object]');
  const roundTrip = new Function(src + '; return T;')();
  assert.deepStrictEqual(roundTrip[0].votes[0], { item: 'STR ordinance', outcome: 'Passed', tally: '6-0' });
});

test('serializeArray: null values stay null literals (SMART packetUrl bug 2026-07-21)', () => {
  const src = serializeArray('T', [{ a: 'x', packetUrl: null }]);
  const roundTrip = new Function(src + '; return T;')();
  assert.strictEqual(roundTrip[0].packetUrl, null);
});
