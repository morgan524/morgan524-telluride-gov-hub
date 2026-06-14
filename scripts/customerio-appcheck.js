#!/usr/bin/env node
/**
 * Customer.io trial — verify the App API key authenticates (read-only).
 *
 * Sends NO email. Just calls the App API (US: api.customer.io) with the Bearer
 * key to confirm it works and to list any segments you've built, so we know the
 * send-side auth is good before we wire up an actual broadcast.
 */
const RAW = process.env.CUSTOMERIO_APP_API_KEY;
if (!RAW) {
  console.error('Missing CUSTOMERIO_APP_API_KEY env var.');
  process.exit(1);
}
const APP_KEY = RAW.trim(); // strip any stray newline/space from the paste
// Safe shape diagnostic — reveals nothing usable. A real App API key is long
// (~60+ chars); the Track API key / Site ID are 20 hex chars, so a length of
// 20 means the wrong value got pasted into this secret.
console.log(`  key shape: length=${APP_KEY.length} (raw=${RAW.length}, whitespace-trimmed=${RAW.length - APP_KEY.length})`);
const BASE = 'https://api.customer.io/v1'; // US App API

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // Retry on 5xx — Customer.io's gateway occasionally returns a transient 502.
  // Customer.io's App API gateway throws intermittent 502s that clear in
  // ~30s — wait that long between tries so a blip doesn't masquerade as a
  // config problem. A 4xx (auth) result breaks immediately.
  let res, text = '';
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      res = await fetch(`${BASE}/segments`, { headers: { Authorization: `Bearer ${APP_KEY}` } });
      text = await res.text();
    } catch (e) {
      console.log(`  · attempt ${attempt}: request error ${e.message} — waiting 30s`);
      await sleep(30000); continue;
    }
    if (res.status >= 500) {
      console.log(`  · attempt ${attempt}: HTTP ${res.status} ${res.statusText} (Customer.io-side) — waiting 30s`);
      await sleep(30000); continue;
    }
    break; // 2xx or a 4xx (auth) — stop and report
  }
  if (!res) { console.log('  ✗ App API unreachable after retries.'); process.exit(1); }
  if (!res.ok) {
    console.log(`  ✗ App API HTTP ${res.status} ${res.statusText} — ${text.slice(0, 300) || '(empty body)'}`);
    console.log('    401/403 = key problem; 5xx = Customer.io-side. Endpoint: GET ' + BASE + '/segments');
    process.exit(1);
  }
  let data = {};
  try { data = JSON.parse(text); } catch {}
  const segs = data.segments || [];
  console.log(`  ✓ App API key authenticates (HTTP ${res.status}).`);
  console.log(`  ${segs.length} segment(s): ${segs.map((s) => s.name).join(', ') || '(none yet — build them in the UI)'}`);
})();
