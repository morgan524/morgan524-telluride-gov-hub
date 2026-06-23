const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadDataArrays } = require('../lib/load-data.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Integration test: this also catches a syntax error or unparseable literal in
// js/gov-data.js / js/gov-helpers.js — a bad bot data write fails CI here.
test('loadDataArrays evaluates the real data files into arrays', () => {
  const { arrays, localDate } = loadDataArrays(REPO_ROOT);
  assert.ok(arrays && typeof arrays === 'object');
  assert.ok(Object.keys(arrays).length > 10, 'should discover many source arrays');
  assert.ok(Array.isArray(arrays.COMMUNITY_EVENTS), 'COMMUNITY_EVENTS should be an array');
  assert.equal(typeof localDate, 'function');
});

test('localDate parses ISO and named-month formats to local calendar dates', () => {
  const { localDate } = loadDataArrays(REPO_ROOT);
  const iso = localDate('2026-07-04');
  assert.equal(iso.getFullYear(), 2026);
  assert.equal(iso.getMonth(), 6);   // July = 6
  assert.equal(iso.getDate(), 4);
  const named = localDate('July 4, 2026');
  assert.equal(named.getFullYear(), 2026);
  assert.equal(named.getMonth(), 6);
  assert.equal(named.getDate(), 4);
  assert.equal(localDate(''), null);
});

test('no data array contains the literal string "undefined" in a field', () => {
  const { arrays } = loadDataArrays(REPO_ROOT);
  for (const [name, arr] of Object.entries(arrays)) {
    for (const item of arr) {
      for (const [k, v] of Object.entries(item || {})) {
        assert.notEqual(v, 'undefined', `${name} has ${k}:"undefined" — serializer regression`);
      }
    }
  }
});
