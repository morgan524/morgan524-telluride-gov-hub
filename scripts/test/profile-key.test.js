// The profile-link code must be identical in the profile Worker (WebCrypto)
// and the Customer.io backfill (node crypto), or every emailed link would
// quietly fail to show the person's settings.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'cloudflare-worker', 'livabletelluride-rss-proxy', 'worker.js'), 'utf8');
const body = src.slice(src.indexOf('async function profileKey(env, email) {'), src.indexOf('async function handleProfileRead('));
// eslint-disable-next-line no-new-func
const W = new Function(body + '\nreturn { profileKey, sameString };')();

const backfill = (secret, email) => nodeCrypto.createHmac('sha256', secret).update(String(email).trim().toLowerCase()).digest()
  .subarray(0, 16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('Worker and backfill compute the same code (case-insensitive email)', async () => {
  const env = { PROFILE_LINK_SECRET: 'test-secret-abc' };
  for (const e of ['Morgan@Example.com', 'a.b+c@d.co', ' x@y.z ']) {
    const w = await W.profileKey(env, e);
    assert.strictEqual(w, backfill(env.PROFILE_LINK_SECRET, e));
    assert.strictEqual(w.length, 22);
  }
});

test('different emails or secrets give different codes; no secret gives none', async () => {
  const a = await W.profileKey({ PROFILE_LINK_SECRET: 's1' }, 'a@b.c');
  assert.notStrictEqual(a, await W.profileKey({ PROFILE_LINK_SECRET: 's1' }, 'a@b.d'));
  assert.notStrictEqual(a, await W.profileKey({ PROFILE_LINK_SECRET: 's2' }, 'a@b.c'));
  assert.strictEqual(await W.profileKey({}, 'a@b.c'), '');
});

test('constant-time compare', () => {
  assert.ok(W.sameString('abc', 'abc'));
  assert.ok(!W.sameString('abc', 'abd'));
  assert.ok(!W.sameString('abc', 'abcd'));
});
