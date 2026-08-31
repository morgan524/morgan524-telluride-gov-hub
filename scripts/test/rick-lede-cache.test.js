// The Rick lede is a Claude call, so identical inputs used to yield a
// different paragraph on every render — which made digest/week.html churn on
// every run and buried real changes (an agenda link appearing) in reworded
// prose. digest-refresh.yml now re-renders after every Content Refresh, so the
// render has to be deterministic for unchanged inputs. These tests pin that.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { generateRickLede, ledeInputFingerprint } = require('../lib/rick-lede.js');

const MEETINGS = [{ title: 'Town Council', date: '2026-09-01', summary: 'Budget hearing.' }];
const EVENTS = [{ title: 'Jazz Fest', date: '2026-09-05', location: 'Telluride', summary: 'Music.' }];

const tmpCache = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lede-')), 'rick-lede-cache.json');

test('fingerprint is stable across calls for identical inputs', () => {
  const a = ledeInputFingerprint({ meetings: MEETINGS, events: EVENTS, cadence: 'week' });
  const b = ledeInputFingerprint({ meetings: MEETINGS, events: EVENTS, cadence: 'week' });
  assert.equal(a, b);
});

test('fingerprint changes when a meeting summary changes', () => {
  // The exact case that must invalidate the cache: a placeholder summary
  // ("agenda hasn't been posted yet") becomes a real one once the agenda posts.
  const pending = [{ title: 'BOCC Work Session', date: '2026-09-09', summary: "The agenda hasn't been posted yet." }];
  const posted = [{ title: 'BOCC Work Session', date: '2026-09-09', summary: 'Broadband contract and the housing code update.' }];
  assert.notEqual(
    ledeInputFingerprint({ meetings: pending, events: EVENTS, cadence: 'week' }),
    ledeInputFingerprint({ meetings: posted, events: EVENTS, cadence: 'week' }),
  );
});

test('weekend fingerprint ignores meetings (the weekend prompt has none)', () => {
  const withMeetings = ledeInputFingerprint({ meetings: MEETINGS, events: EVENTS, cadence: 'weekend' });
  const without = ledeInputFingerprint({ meetings: [], events: EVENTS, cadence: 'weekend' });
  assert.equal(withMeetings, without);
});

test('the two cadences do not share a cache entry', () => {
  assert.notEqual(
    ledeInputFingerprint({ meetings: [], events: EVENTS, cadence: 'week' }),
    ledeInputFingerprint({ meetings: [], events: EVENTS, cadence: 'weekend' }),
  );
});

test('a cache hit returns the stored lede with NO api key', async () => {
  // The load-bearing property: re-rendering an unchanged window neither calls
  // Claude nor needs credentials, so the output is byte-identical every run.
  const file = tmpCache();
  const fp = ledeInputFingerprint({ meetings: MEETINGS, events: EVENTS, cadence: 'week' });
  fs.writeFileSync(file, JSON.stringify({ [fp]: { lede: 'A cached intro.', at: '2026-08-31' } }));
  const out = await generateRickLede({ meetings: MEETINGS, events: EVENTS, cadence: 'week', apiKey: '', cacheFile: file });
  assert.equal(out, 'A cached intro.');
});

test('a cache miss without an api key falls back (null), and writes nothing', async () => {
  const file = tmpCache();
  fs.writeFileSync(file, JSON.stringify({ deadbeefdeadbeef: { lede: 'Not this one.' } }));
  const out = await generateRickLede({ meetings: MEETINGS, events: EVENTS, cadence: 'week', apiKey: '', cacheFile: file });
  assert.equal(out, null);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))), ['deadbeefdeadbeef']);
});

test('a missing or corrupt cache file is a miss, not a crash', async () => {
  const file = tmpCache();
  fs.writeFileSync(file, '{ not json');
  const out = await generateRickLede({ meetings: MEETINGS, events: EVENTS, cadence: 'week', apiKey: '', cacheFile: file });
  assert.equal(out, null);   // degraded to the caller's fallback lede, no throw
});

test('no meetings and no events still short-circuits to null', async () => {
  const out = await generateRickLede({ meetings: [], events: [], cadence: 'week', apiKey: '', cacheFile: tmpCache() });
  assert.equal(out, null);
});
