// Cross-source event dedup keys (build-events-index.js).
//
// 2026-10-04 content review: "Hanneke Cassel Trio" (Telluride Chamber Music)
// and "Hanneke Cassel Trio - Telluride Chamber Music" (The Alibi) both
// published for 2026-10-13 because the Alibi appends the presenter.
const test = require('node:test');
const assert = require('node:assert');
const { dedupKeys } = require('../build-events-index.js');

const shares = (a, b, d = '2026-10-13') => dedupKeys(a, d).some((k) => dedupKeys(b, d).includes(k));

test('a "Title - Presenter" listing merges with the bare title, either order', () => {
  assert.ok(shares('Hanneke Cassel Trio - Telluride Chamber Music', 'Hanneke Cassel Trio'));
  assert.ok(shares('Hanneke Cassel Trio', 'Hanneke Cassel Trio - Telluride Chamber Music'));
});

test('short heads and different days do not merge', () => {
  assert.ok(!shares('Yoga - Beginners', 'Yoga'));
  assert.ok(!dedupKeys('Hanneke Cassel Trio - Telluride Chamber Music', '2026-10-14')
    .some((k) => dedupKeys('Hanneke Cassel Trio', '2026-10-13').includes(k)));
});

test('unhyphenated titles keep a single key', () => {
  assert.strictEqual(dedupKeys('Yoga at Hartwell Park', '2026-10-13').length, 1);
});
