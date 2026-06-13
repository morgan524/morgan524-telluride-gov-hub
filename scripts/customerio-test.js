#!/usr/bin/env node
/**
 * Customer.io trial — seed a few TEST people with interest attributes.
 *
 * This is a parallel TRIAL alongside the live Mailchimp setup. It does NOT
 * touch Mailchimp, and it does NOT send any email — Customer.io's "identify"
 * (Track API PUT /customers/{id}) only creates/updates a person record and
 * sets attributes. Sending is a separate step that needs the App API key.
 *
 * Auth: Track API uses Basic auth of `${SITE_ID}:${TRACK_API_KEY}`.
 * Region: US  (track.customer.io — EU would be track-eu.customer.io).
 *
 * Runs from the `customerio-test.yml` workflow so the keys stay as GitHub
 * Actions secrets and never touch a local machine. Re-running is safe: PUT is
 * idempotent, so it just updates the same people.
 *
 * The attribute schema below is the trial's source of truth — it mirrors the
 * Mailchimp interests 1:1 (see docs/customerio-trial.md):
 *   sub_newsletter      <- Mailchimp "Newsletter" (interest 24641)
 *   sub_weekly_update   <- Mailchimp "Weekly Update" (interest 24642)
 *   topic_music_arts    <- Event Topics "Music & Arts"
 *   topic_gov_meetings  <- Event Topics "Government Meetings"
 *   topic_family_kids   <- Event Topics "Family & Kids"
 *   topic_outdoors_rec  <- Event Topics "Outdoors & Recreation"
 *   region              <- Mailchimp MMERGE6
 *   source: 'trial-seed' so the test people are easy to find + delete later.
 */

const SITE_ID   = process.env.CUSTOMERIO_SITE_ID;
const TRACK_KEY  = process.env.CUSTOMERIO_TRACK_API_KEY;
if (!SITE_ID || !TRACK_KEY) {
  console.error('Missing CUSTOMERIO_SITE_ID / CUSTOMERIO_TRACK_API_KEY env vars.');
  process.exit(1);
}

const BASE = 'https://track.customer.io/api/v1';          // US data center
const AUTH = 'Basic ' + Buffer.from(`${SITE_ID}:${TRACK_KEY}`).toString('base64');

// ── Test people — distinct interest profiles so segmentation is visible. ──
// No email is sent by identify; these are just CRM records of addresses you
// own. Edit / add freely; re-running updates in place.
const PEOPLE = [
  {
    email: 'morgancsmith99@gmail.com', first_name: 'Morgan', region: 'Telluride',
    sub_newsletter: true,  sub_weekly_update: true,
    topic_music_arts: false, topic_gov_meetings: true,
    topic_family_kids: false, topic_outdoors_rec: true,
  },
  {
    email: 'info@livabletelluride.org', first_name: 'Livable Telluride', region: 'Mountain Village',
    sub_newsletter: false, sub_weekly_update: true,
    topic_music_arts: true,  topic_gov_meetings: false,
    topic_family_kids: true,  topic_outdoors_rec: false,
  },
];

(async () => {
  let ok = 0;
  for (const p of PEOPLE) {
    const id = p.email.toLowerCase();
    const body = { ...p, source: 'trial-seed', created_at: Math.floor(Date.now() / 1000) };
    let res, text = '';
    try {
      res = await fetch(`${BASE}/customers/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      text = await res.text();
    } catch (e) {
      console.log(`  ✗ ${id} — request error: ${e.message}`);
      continue;
    }
    if (res.ok) { ok++; console.log(`  ✓ ${res.status} ${id}`); }
    else        { console.log(`  ✗ ${res.status} ${id} — ${text.slice(0, 200)}`); }
  }
  console.log(`\nSeeded ${ok}/${PEOPLE.length} test people. Check Customer.io → People (filter source = "trial-seed").`);
  if (ok !== PEOPLE.length) process.exit(1);
})();
