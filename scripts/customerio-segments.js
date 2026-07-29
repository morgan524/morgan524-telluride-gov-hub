#!/usr/bin/env node
/**
 * Customer.io — READ-ONLY audit of segments vs. the six subscriptions the
 * website actually offers (profile.html / hub-bub.html signup).
 *
 * Answers three questions:
 *   1. Which segments exist in the workspace right now, and how big are they?
 *   2. For each of our six subscription attributes, how many people have it
 *      set to "true" — i.e. how big SHOULD each segment be?
 *   3. Which of the six has no matching segment yet (the gap to close).
 *
 * Writes nothing and sends nothing. Run from customerio-segments.yml so the
 * App API key stays a GitHub Actions secret.
 *
 * NOTE on creating segments: the App API's segment-create endpoint only makes
 * MANUAL segments (a fixed list of people you push into it). The attribute-
 * driven segments we want ("everyone where sub_newsletter = true") are
 * data-driven and can only be created in the Customer.io UI. This script tells
 * you exactly which ones to create and what each should contain.
 */

const APP_KEY = (process.env.CUSTOMERIO_APP_API_KEY || '').trim();
if (!APP_KEY) { console.error('Missing CUSTOMERIO_APP_API_KEY'); process.exit(1); }

const API = 'https://api.customer.io';
const H = { Authorization: 'Bearer ' + APP_KEY, 'Content-Type': 'application/json' };

// The six subscriptions the site offers → the Customer.io attribute behind each.
// Must stay in step with CIO_SUBS_TO_ATTR in the Worker (worker.js) and with
// the .tog[data-sub] rows in profile.html.
const SUBS = [
  { key: 'weekly',     attr: 'sub_weekly_update', label: 'Weekly Update (the digest)' },
  { key: 'newsletter', attr: 'sub_newsletter',    label: 'Newsletter (long-form posts)' },
  { key: 'arts',       attr: 'topic_music_arts',  label: 'Topic — Music, Arts & Festivals' },
  { key: 'civic',      attr: 'topic_gov_meetings',label: 'Topic — Government Meetings' },
  { key: 'family',     attr: 'topic_family_kids', label: 'Topic — Family & Kids' },
  { key: 'outdoors',   attr: 'topic_outdoors_rec',label: 'Topic — Outdoors & Recreation' },
];

// Customer.io's App API gateway throws intermittent 502s (a Google LB error
// page, not JSON). Retry those with a wait; a real auth failure is a 401.
async function call(path, opts, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    const res = await fetch(API + path, opts);
    if (res.status === 502 && i < tries) {
      console.log(`    (502 from the CIO gateway — retrying in 30s, attempt ${i}/${tries})`);
      await new Promise(r => setTimeout(r, 30000));
      continue;
    }
    const text = await res.text();
    let body = null; try { body = JSON.parse(text); } catch (_) {}
    return { status: res.status, ok: res.ok, body, text };
  }
}

// Count people where <attr> == "true". Booleans are stored as STRINGS in
// Customer.io, so the filter compares against the string "true" — the same
// gotcha that bit the Liquid template.
async function countWhereTrue(attr) {
  let total = 0, start = null, pages = 0;
  do {
    const qs = '?limit=1000' + (start ? '&start=' + encodeURIComponent(start) : '');
    const r = await call('/v1/customers' + qs, {
      method: 'POST', headers: H,
      body: JSON.stringify({ filter: { attribute: { field: attr, operator: 'eq', value: 'true' } } }),
    });
    if (!r.ok) return { error: `HTTP ${r.status} ${r.text.slice(0, 200)}` };
    const ids = (r.body && r.body.identifiers) || [];
    total += ids.length;
    start = (r.body && r.body.next) || null;
    if (++pages > 20) break;   // safety stop; 20k people is far beyond this list
  } while (start);
  return { count: total };
}

(async () => {
  console.log('Customer.io segment audit\n' + '='.repeat(60));

  // ── 1. What segments exist today ──────────────────────────────────
  console.log('\n1. SEGMENTS THAT EXIST IN THE WORKSPACE\n');
  const segRes = await call('/v1/segments', { headers: H });
  if (!segRes.ok) {
    console.error(`  ✗ GET /v1/segments failed: HTTP ${segRes.status}`);
    console.error('  ' + segRes.text.slice(0, 300));
    process.exit(1);
  }
  const segments = (segRes.body && segRes.body.segments) || [];
  if (!segments.length) console.log('  (none)');
  for (const s of segments) {
    let count = '';
    const c = await call(`/v1/segments/${s.id}/customer_count`, { headers: H });
    if (c.ok && c.body && typeof c.body.count === 'number') count = `${c.body.count} people`;
    else count = `count unavailable (HTTP ${c.status})`;
    console.log(`  [${String(s.id).padEnd(5)}] ${String(s.name).padEnd(42)} type=${s.type || '?'}  ${count}`);
  }

  // ── 2. How big each segment SHOULD be, per the attributes ─────────
  console.log('\n2. PEOPLE PER SUBSCRIPTION ATTRIBUTE (what each segment should hold)\n');
  const sizes = {};
  for (const s of SUBS) {
    const r = await countWhereTrue(s.attr);
    sizes[s.key] = r;
    const val = r.error ? `ERROR ${r.error}` : `${r.count} people`;
    console.log(`  ${s.attr.padEnd(20)} = "true"  →  ${val.padEnd(16)} ${s.label}`);
  }

  // ── 3. The gap ────────────────────────────────────────────────────
  console.log('\n3. GAP — SUBSCRIPTIONS WITH NO MATCHING SEGMENT\n');
  const norm = t => String(t).toLowerCase().replace(/[^a-z]+/g, '');
  const segBlob = segments.map(s => norm(s.name)).join('|');
  const HINTS = {
    weekly:     ['weeklyupdate', 'weekly', 'digest'],
    newsletter: ['newsletter'],
    arts:       ['musicarts', 'arts', 'festival'],
    civic:      ['governmentmeetings', 'govmeetings', 'civic'],
    family:     ['familykids', 'family'],
    outdoors:   ['outdoorsrecreation', 'outdoors', 'recreation'],
  };
  let missing = 0;
  for (const s of SUBS) {
    const hit = HINTS[s.key].some(h => segBlob.includes(h));
    const size = sizes[s.key] && !sizes[s.key].error ? `${sizes[s.key].count} people` : '?';
    if (hit) console.log(`  ✓ ${s.label} — a segment matching this name exists`);
    else { missing++; console.log(`  ✗ ${s.label} — NO SEGMENT. Create: ${s.attr} equals "true"  (${size})`); }
  }

  console.log('\n' + '='.repeat(60));
  if (missing) {
    console.log(`${missing} segment(s) still to create, in the Customer.io UI:`);
    console.log('  Segments → Create Segment → Data-driven → Attributes →');
    console.log('  "<attribute>" · "is" · "true"   ← the STRING true, not a boolean toggle');
  } else {
    console.log('All six subscriptions have a matching segment.');
  }
})();
