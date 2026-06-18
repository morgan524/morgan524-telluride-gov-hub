#!/usr/bin/env node
/*
 * customerio-lookup.js — print a single person's full Customer.io attributes,
 * so we can confirm names / region / sub_* / topic_* actually landed (the
 * People list only shows email + created_at columns by default).
 *
 * Env:
 *   CUSTOMERIO_APP_API_KEY   (Bearer, App API; base api.customer.io)
 *   EMAIL                    person to look up (their id == lowercased email)
 *
 * Usage (local):  CUSTOMERIO_APP_API_KEY=… EMAIL=someone@example.com node scripts/customerio-lookup.js
 * Usage (CI):     gh workflow run customerio-lookup.yml -f email=someone@example.com
 */
const APP   = (process.env.CUSTOMERIO_APP_API_KEY || '').trim();
const EMAIL = (process.env.EMAIL || '').trim().toLowerCase();

if (!APP)   { console.error('Missing CUSTOMERIO_APP_API_KEY.'); process.exit(1); }
if (!EMAIL) { console.error('Missing EMAIL (set -f email=… or EMAIL=…).'); process.exit(1); }

const BASE = 'https://api.customer.io/v1';
const AUTH = { Authorization: 'Bearer ' + APP, 'Content-Type': 'application/json' };

(async () => {
  // The workspace may key people by email, by a custom id, or by cio_id — try
  // each id_type until one resolves the person.
  let j = null, used = null, lastStatus = null;
  for (const idType of ['email', 'id', 'cio_id']) {
    const url = `${BASE}/customers/${encodeURIComponent(EMAIL)}/attributes?id_type=${idType}`;
    const r = await fetch(url, { headers: AUTH });
    lastStatus = r.status;
    if (r.ok) { j = await r.json(); used = idType; break; }
  }
  if (!j) {
    console.error(`Lookup failed (last HTTP ${lastStatus}) — no id_type resolved ${EMAIL}.`);
    process.exit(1);
  }
  console.log(`(resolved via id_type=${used})`);
  const attrs = (j.customer && j.customer.attributes) || {};
  console.log(`\nCustomer.io attributes for ${EMAIL}:\n`);
  const keys = Object.keys(attrs).sort();
  if (!keys.length) { console.log('  (no attributes — record exists but is empty)'); }
  for (const k of keys) console.log(`  ${k.padEnd(20)} = ${JSON.stringify(attrs[k])}`);
  // Quick presence check for the fields the user cares about.
  const want = ['first_name', 'last_name', 'region', 'sub_newsletter', 'sub_weekly_update',
                'topic_music_arts', 'topic_gov_meetings', 'topic_family_kids', 'topic_outdoors_rec'];
  console.log('\nExpected-field check:');
  for (const k of want) console.log(`  ${k.padEnd(20)} ${k in attrs ? '✓ present' : '✗ MISSING'}`);
})().catch((e) => { console.error('FATAL: ' + e.message); process.exit(1); });
