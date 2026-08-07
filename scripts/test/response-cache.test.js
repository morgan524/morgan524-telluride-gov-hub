// Guards the fix for the 2026-08-07 recap re-buy: meeting-recaps.js sent the
// same 532,301 chars of transcript to Sonnet every morning for ten days
// straight because its output only persisted on a successful `git push`, and
// the push was failing. The cache has to survive exactly that — a run whose
// repo-side write is thrown away — so these tests pin the content-addressing
// and the no-false-hit rules rather than any repo state.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createResponseCache } = require('../lib/response-cache.js');

function tmpCache(maxAgeDays) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-test-'));
  return createResponseCache({ dir, maxAgeDays });
}

const BODY = {
  model: 'claude-sonnet-4-6',
  max_tokens: 1500,
  system: 'RECAP SYSTEM PROMPT',
  messages: [{ role: 'user', content: 'TRANSCRIPT: the council convened at 6pm...' }],
};
const RESPONSE = { title: 'Town Council — Jul 21, 2026', recap: 'Council approved...', votes: [{ item: 'Ord 1497' }] };

test('a miss reports no entry', () => {
  const c = tmpCache();
  assert.equal(c.read(BODY), null);
  assert.equal(c.has(BODY), false);
});

test('write then read round-trips the parsed response', () => {
  const c = tmpCache();
  c.write(BODY, RESPONSE);
  assert.equal(c.has(BODY), true);
  assert.deepEqual(c.read(BODY), RESPONSE);
});

test('a different transcript is a different key (no false hit)', () => {
  const c = tmpCache();
  c.write(BODY, RESPONSE);
  const other = { ...BODY, messages: [{ role: 'user', content: 'TRANSCRIPT: a different meeting' }] };
  assert.equal(c.has(other), false);
  assert.equal(c.read(other), null);
});

test('a changed system prompt re-asks rather than serving a stale answer', () => {
  const c = tmpCache();
  c.write(BODY, RESPONSE);
  assert.equal(c.has({ ...BODY, system: 'REVISED RECAP SYSTEM PROMPT' }), false);
});

test('the recap pass and the votes pass do not collide', () => {
  // Same transcript, different system prompt — these are the two calls that
  // each meeting costs, and they must cache independently.
  const c = tmpCache();
  const votesBody = { ...BODY, system: 'VOTE EXTRACTION PROMPT', max_tokens: 2000 };
  c.write(BODY, RESPONSE);
  c.write(votesBody, { votes: [] });
  assert.deepEqual(c.read(BODY), RESPONSE);
  assert.deepEqual(c.read(votesBody), { votes: [] });
});

test('a null response is never cached as a hit', () => {
  // A failed parse must not poison the cache into skipping a real retry.
  const c = tmpCache();
  assert.equal(c.write(BODY, null), false);
  assert.equal(c.has(BODY), false);
});

test('a falsy-but-valid response still round-trips', () => {
  const c = tmpCache();
  const empty = { title: 'HARC — Jul 15, 2026', recap: '', votes: [] };
  c.write(BODY, empty);
  assert.deepEqual(c.read(BODY), empty);
});

test('prune drops entries past the window and keeps fresh ones', () => {
  const c = tmpCache(45);
  c.write(BODY, RESPONSE);
  assert.equal(c.prune(), 0, 'a fresh entry survives');

  // Backdate the file past the window.
  const p = c.pathFor(BODY);
  const old = Date.now() - 60 * 86400000;
  fs.utimesSync(p, new Date(old), new Date(old));
  assert.equal(c.prune(), 1);
  assert.equal(c.has(BODY), false);
});

test('prune on a nonexistent directory is a no-op, not a crash', () => {
  const c = createResponseCache({ dir: path.join(os.tmpdir(), 'rc-test-does-not-exist-' + process.pid) });
  assert.equal(c.prune(), 0);
});

test('a corrupt cache file reads as a miss', () => {
  const c = tmpCache();
  c.write(BODY, RESPONSE);
  fs.writeFileSync(c.pathFor(BODY), '{not json');
  assert.equal(c.read(BODY), null);
});
