const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJsArray, extractJsObject } = require('../lib/extract.js');
const { serializeArray, serializeObject } = require('../lib/serialize.js');

test('extractJsArray round-trips serializeArray output', () => {
  const arr = [{ title: 'A', date: '2026-07-04', notable: true }, { title: "Rico's Fireweed", n: 3 }];
  const src = 'const FOO = 1;\n' + serializeArray('EVENTS', arr) + '\nconst BAR = 2;';
  const back = extractJsArray(src, 'EVENTS');
  assert.equal(back.length, 2);
  assert.equal(back[0].title, 'A');
  assert.equal(back[0].notable, true);   // boolean preserved
  assert.equal(back[1].title, "Rico's Fireweed");  // apostrophe survives
});

test('extractJsArray selects the right var among several', () => {
  const src = serializeArray('A', [{ x: 'one' }]) + '\n' + serializeArray('B', [{ y: 'two' }, { y: 'three' }]);
  assert.equal(extractJsArray(src, 'A').length, 1);
  assert.equal(extractJsArray(src, 'B').length, 2);
});

test('extractJsArray handles nested arrays/objects (balanced brackets)', () => {
  const arr = [{ title: 'X', tags: ['a', 'b'], clubInfo: { name: 'Rotary' } }];
  const back = extractJsArray(serializeArray('E', arr), 'E');
  assert.deepEqual(back[0].tags, ['a', 'b']);
  assert.equal(back[0].clubInfo.name, 'Rotary');
});

test('extractJsArray returns null for a missing var', () => {
  assert.equal(extractJsArray('const X = [1];', 'NOPE'), null);
});

test('extractJsObject round-trips serializeObject output', () => {
  const obj = { 'k|1': { zoomUrl: 'https://z', id: '1' }, 'k|2': { id: '2' } };
  const back = extractJsObject(serializeObject('META', obj), 'META');
  assert.equal(back['k|1'].zoomUrl, 'https://z');
  assert.equal(back['k|2'].id, '2');
});
