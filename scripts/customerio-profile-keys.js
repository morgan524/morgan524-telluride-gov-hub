#!/usr/bin/env node
/**
 * Customer.io: give every person their profile-link code (`profile_key`).
 *
 * The code is HMAC-SHA256(PROFILE_LINK_SECRET, lowercased email), first 16
 * bytes, base64url — byte-for-byte what the profile Worker computes in
 * profileKey() (cloudflare-worker/livabletelluride-rss-proxy/worker.js). The
 * broadcast templates put it on each email's "Update preferences" link as
 * *|PKEY|*, so the profile page can show that person's switches.
 *
 * Writes ONLY the profile_key attribute (Track API PUT merges attributes), and
 * only where it is missing or wrong. Never sends anything. The repo is public,
 * so this logs counts only — never an email address.
 *
 * Env: CUSTOMERIO_APP_API_KEY (list people), CUSTOMERIO_SITE_ID +
 *      CUSTOMERIO_TRACK_API_KEY (write), PROFILE_LINK_SECRET.
 * DRY_RUN=1 counts what would change without writing.
 */
'use strict';
const crypto = require('crypto');

const APP = (process.env.CUSTOMERIO_APP_API_KEY || '').trim();
const SITE = (process.env.CUSTOMERIO_SITE_ID || '').trim();
const TRACK = (process.env.CUSTOMERIO_TRACK_API_KEY || '').trim();
const SECRET = process.env.PROFILE_LINK_SECRET || '';
const DRY = process.env.DRY_RUN === '1';
for (const [k, v] of Object.entries({ CUSTOMERIO_APP_API_KEY: APP, CUSTOMERIO_SITE_ID: SITE, CUSTOMERIO_TRACK_API_KEY: TRACK, PROFILE_LINK_SECRET: SECRET })) {
  if (!v) { console.error('Missing ' + k); process.exit(1); }
}

function profileKey(email) {
  const mac = crypto.createHmac('sha256', SECRET).update(String(email).trim().toLowerCase()).digest();
  return mac.subarray(0, 16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(url, opts, tries = 5) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, opts);
    if ((r.status === 429 || r.status >= 500) && i < tries) { await sleep(2000 * i); continue; }
    return r;
  }
}
const appH = { Authorization: 'Bearer ' + APP, 'Content-Type': 'application/json' };

// Every person with an email (App API search; identifiers only).
async function listPeople() {
  const out = []; let start = null;
  for (let page = 0; page < 50; page++) {
    const qs = '?limit=1000' + (start ? '&start=' + encodeURIComponent(start) : '');
    const r = await call('https://api.customer.io/v1/customers' + qs, { method: 'POST', headers: appH,
      body: JSON.stringify({ filter: { attribute: { field: 'email', operator: 'exists' } } }) });
    if (!r.ok) throw new Error('list HTTP ' + r.status);
    const j = await r.json();
    for (const id of j.identifiers || []) if (id.email) out.push({ email: String(id.email), cio_id: id.cio_id });
    start = j.next || null;
    if (!start) break;
  }
  return out;
}

async function currentKey(p) {
  const r = await call('https://api.customer.io/v1/customers/' + encodeURIComponent(p.cio_id) + '/attributes?id_type=cio_id', { headers: appH });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  const a = (j.customer && j.customer.attributes) || {};
  return a.profile_key || null;
}

(async () => {
  const people = await listPeople();
  console.log(`people with an email: ${people.length}`);
  const auth = 'Basic ' + Buffer.from(SITE + ':' + TRACK).toString('base64');
  let ok = 0, already = 0, failed = 0, i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < people.length) {
      const p = people[i++];
      const want = profileKey(p.email);
      if ((await currentKey(p)) === want) { already++; continue; }
      if (DRY) { ok++; continue; }
      const r = await call('https://track.customer.io/api/v1/customers/' + encodeURIComponent(p.email),
        { method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ profile_key: want }) });
      if (r.ok) ok++; else failed++;
      await sleep(60);
    }
  }));
  console.log(`${DRY ? 'would set' : 'set'}: ${ok}; already current: ${already}; failed: ${failed}`);
  if (failed) process.exit(1);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
