const test = require('node:test');
const assert = require('node:assert/strict');
const sh = require('../source-health.js');

test('detectAnomalies: broken→High, partial→Medium, healthy/excluded→none', () => {
  const arrays = {
    A: [],                          // 0 now, was 30 → broken
    B: new Array(4).fill({}),       // 4 now, was 28 → partial
    C: new Array(25).fill({}),      // healthy
    LEGAL_NOTICES: [],              // excluded (legitimately sporadic)
  };
  const baseline = { sources: {
    A: { dailyMax: { '2026-06-20': 30, '2026-06-22': 0 } },
    B: { dailyMax: { '2026-06-21': 28, '2026-06-22': 4 } },
    C: { dailyMax: { '2026-06-22': 25 } },
    LEGAL_NOTICES: { dailyMax: { '2026-06-20': 5, '2026-06-22': 0 } },
  } };
  const out = sh.detectAnomalies(arrays, baseline);
  const byName = Object.fromEntries(out.map(a => [a.name, a.severity]));
  assert.equal(byName.A, 'High');
  assert.equal(byName.B, 'Medium');
  assert.equal(out.length, 2);
  assert.ok(!('C' in byName));
  assert.ok(!('LEGAL_NOTICES' in byName));
});

test('detectAnomalies: a small source dropping to 0 below MIN_EXPECTED is ignored', () => {
  const out = sh.detectAnomalies(
    { Tiny: [] },
    { sources: { Tiny: { dailyMax: { '2026-06-21': 2, '2026-06-22': 0 } } } }
  );
  assert.equal(out.length, 0);   // recentMax 2 < MIN_EXPECTED(3) → not flagged
});

test('updateBaseline records today and prunes entries older than 14 days', () => {
  const baseline = { sources: { A: { dailyMax: { '2026-05-01': 10, '2026-06-20': 8 } } } };
  sh.updateBaseline(baseline, { A: new Array(7).fill({}) }, '2026-06-22');
  const dm = baseline.sources.A.dailyMax;
  assert.equal(dm['2026-06-22'], 7);          // today recorded
  assert.equal(dm['2026-06-20'], 8);          // within window, kept
  assert.ok(!('2026-05-01' in dm));            // >14d old, pruned
});

test('updateBaseline enrolls a brand-new source', () => {
  const baseline = { sources: {} };
  sh.updateBaseline(baseline, { New: new Array(12).fill({}) }, '2026-06-22');
  assert.equal(baseline.sources.New.dailyMax['2026-06-22'], 12);
});
