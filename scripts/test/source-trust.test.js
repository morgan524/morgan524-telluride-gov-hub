const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileByTrust, trustOf, TRUST, LOW, MID, HIGH } = require('../lib/source-trust.js');

test('trustOf: known sources ranked, unknown defaults to MID', () => {
  assert.equal(trustOf('MOUNTAIN_VILLAGE_EVENTS'), LOW);
  assert.equal(trustOf('KOTO_COMMUNITY_EVENTS'), HIGH);
  assert.equal(trustOf('SOME_RANDOM_ARRAY'), MID);
});

test('reconcileByTrust drops a LOW source date conflict vs a higher source', () => {
  const out = reconcileByTrust({
    MOUNTAIN_VILLAGE_EVENTS: [{ title: 'Town Talk: Tau', pubDate: '2026-06-30' }],   // off by 1
    KOTO_COMMUNITY_EVENTS:   [{ title: 'Town Talk: Tau', pubDate: '2026-07-01' }],
  });
  assert.ok(out.MOUNTAIN_VILLAGE_EVENTS, 'MV should be reconciled');
  assert.equal(out.MOUNTAIN_VILLAGE_EVENTS.dropped.length, 1);
  assert.equal(out.MOUNTAIN_VILLAGE_EVENTS.kept.length, 0);
});

test('reconcileByTrust does NOT drop same-date overlaps', () => {
  const out = reconcileByTrust({
    MOUNTAIN_VILLAGE_EVENTS: [{ title: 'Market on the Plaza', pubDate: '2026-06-24' }],
    KOTO_COMMUNITY_EVENTS:   [{ title: 'Market on the Plaza', pubDate: '2026-06-24' }],
  });
  assert.deepEqual(out, {});   // nothing dropped
});

test('reconcileByTrust only touches LOW sources, never MID/HIGH', () => {
  // ALIBI (MID) conflicts with KOTO (HIGH) — must NOT be auto-dropped.
  const out = reconcileByTrust({
    ALIBI_EVENTS:          [{ title: 'Some Band', date: '2026-07-19' }],
    KOTO_COMMUNITY_EVENTS: [{ title: 'Some Band', date: '2026-07-20' }],
  });
  assert.ok(!out.ALIBI_EVENTS, 'MID source must not be reconciled');
  assert.ok(!out.KOTO_COMMUNITY_EVENTS, 'HIGH source must not be reconciled');
});

test('marking a source LOW would enable reconciliation (config is the only lever)', () => {
  // Sanity: the config drives behavior — MV is the sole LOW source today.
  const lows = Object.keys(TRUST).filter(n => TRUST[n] === LOW);
  assert.deepEqual(lows, ['MOUNTAIN_VILLAGE_EVENTS']);
});
