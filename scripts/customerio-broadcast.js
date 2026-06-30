#!/usr/bin/env node
/**
 * Customer.io trial — trigger an API-triggered BROADCAST with the weekly
 * per-section message_data, so Customer.io renders the personalized Liquid
 * template per-person and sends to the broadcast's segment.
 *
 * Prereqs (one-time, in the Customer.io UI):
 *   1. Create a Broadcast, set it to "API triggered", target the Weekly Update
 *      segment, and paste Claude Files/customerio-weekly-liquid-template.html
 *      as its email content.
 *   2. Copy the broadcast's numeric ID → set GitHub secret CUSTOMERIO_BROADCAST_ID.
 *
 * The blocks are passed under `data`, referenced in the template as
 * {{ trigger.<key> }} (broadcast namespace). NOTE: the drafted template uses
 * {{ message_data.<key> }} (transactional namespace) — for a broadcast, change
 * those to {{ trigger.<key> }}. Verify the HTML blocks render raw (not escaped).
 */
const fs = require('fs');

const APP_KEY = (process.env.CUSTOMERIO_APP_API_KEY || '').trim();
const BID     = (process.env.CUSTOMERIO_BROADCAST_ID || '').trim();
const DATA    = process.env.CIO_DATA || 'message_data.json';

if (!APP_KEY) { console.error('Missing CUSTOMERIO_APP_API_KEY'); process.exit(1); }
if (!BID) {
  console.error('Missing CUSTOMERIO_BROADCAST_ID — create the API-triggered broadcast in');
  console.error('the Customer.io UI, then set it as a GitHub secret. (Pipeline is ready;');
  console.error('it just needs the broadcast id.)');
  process.exit(1);
}

let data;
try { data = JSON.parse(fs.readFileSync(DATA, 'utf8')); }
catch (e) { console.error('Cannot read ' + DATA + ': ' + e.message); process.exit(1); }

(async () => {
  let res, text = '';
  try {
    res = await fetch(`https://api.customer.io/v1/campaigns/${BID}/triggers`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + APP_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    text = await res.text();
  } catch (e) { console.error('  ✗ request error: ' + e.message); process.exit(1); }
  console.log(`  HTTP ${res.status} ${res.statusText}`);
  console.log('  ' + text.slice(0, 500));
  if (!res.ok) {
    console.log('\n  (404 → wrong broadcast id; 4xx about test mode → flip the workspace');
    console.log('   to production; 4xx about segment → make sure the broadcast targets one.)');
    process.exit(1);
  }
  console.log('\n  ✓ Broadcast triggered — Customer.io renders the Liquid template per-person');
  console.log('    and sends to the broadcast\'s segment with this week\'s blocks.');
})();
