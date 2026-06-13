#!/usr/bin/env node
/**
 * Customer.io trial — verify the App API key authenticates (read-only).
 *
 * Sends NO email. Just calls the App API (US: api.customer.io) with the Bearer
 * key to confirm it works and to list any segments you've built, so we know the
 * send-side auth is good before we wire up an actual broadcast.
 */
const APP_KEY = process.env.CUSTOMERIO_APP_API_KEY;
if (!APP_KEY) {
  console.error('Missing CUSTOMERIO_APP_API_KEY env var.');
  process.exit(1);
}
const BASE = 'https://api.customer.io/v1'; // US App API

(async () => {
  let res, text = '';
  try {
    res = await fetch(`${BASE}/segments`, { headers: { Authorization: `Bearer ${APP_KEY}` } });
    text = await res.text();
  } catch (e) {
    console.log(`  ✗ App API request error: ${e.message}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.log(`  ✗ App API HTTP ${res.status} — ${text.slice(0, 200)}`);
    process.exit(1);
  }
  let data = {};
  try { data = JSON.parse(text); } catch {}
  const segs = data.segments || [];
  console.log(`  ✓ App API key authenticates (HTTP ${res.status}).`);
  console.log(`  ${segs.length} segment(s): ${segs.map(s => s.name).join(', ') || '(none yet — build them in the UI)'}`);
})();
