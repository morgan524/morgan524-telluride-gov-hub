// Parity: every deep-dive topic in data/land-use-issues.json must have a
// TOPICS entry in deep-dive-refresh.js — otherwise the topic renders fine but
// silently gets no auto-updates and no watch-system coverage (the Ski-Gate
// gap, 2026-07-22 audit Phase 2). New topic = add BOTH, and this test enforces it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TOPICS } = require('../deep-dive-refresh.js');

const REPO = path.resolve(__dirname, '..', '..');
const issues = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'land-use-issues.json'), 'utf8'));

test('every land-use-issues topic has a TOPICS entry (auto-update + watch coverage)', () => {
  const missing = Object.keys(issues).filter(k => !TOPICS[k]);
  assert.deepEqual(missing, [],
    `Topics with a live deep-dive page but NO auto-update/watch coverage: ${missing.join(', ')} — add them to TOPICS in scripts/deep-dive-refresh.js`);
});

test('every TOPICS entry has a non-empty keywords list', () => {
  for (const [k, t] of Object.entries(TOPICS)) {
    assert.ok(Array.isArray(t.keywords) && t.keywords.length > 0, `${k} has no keywords`);
  }
});
