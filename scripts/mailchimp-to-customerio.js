#!/usr/bin/env node
/**
 * Mailchimp → Customer.io subscriber migration.
 *
 * Exports every SUBSCRIBED member of the Livable Telluride Mailchimp audience,
 * maps their interest groups + merge fields to the Customer.io attribute schema
 * (see docs/customerio-trial.md), and identifies each person in Customer.io via
 * the Track API (PUT /customers/{email}). Idempotent — re-running just updates.
 *
 * Identify creates/updates a PERSON RECORD only. It does NOT send email. Safe to
 * run while the Customer.io workspace is still in test mode and while Mailchimp
 * stays the live system of record. Run DRY first to review the mapping.
 *
 * Env:
 *   MAILCHIMP_API_KEY            (required) — dc is derived from the "-usNN" suffix
 *   MAILCHIMP_LIST_ID            (default f83dc56387)
 *   CUSTOMERIO_SITE_ID           (required unless DRY_RUN)
 *   CUSTOMERIO_TRACK_API_KEY     (required unless DRY_RUN)
 *   DRY_RUN=1                    — resolve + map + tally, write NOTHING to Customer.io
 *   LIMIT=N                      — cap people processed (handy for a small live test)
 *
 * Run from .github/workflows/mailchimp-to-customerio.yml so keys stay secrets.
 */

const MC_KEY  = (process.env.MAILCHIMP_API_KEY || '').trim();
const LIST_ID = (process.env.MAILCHIMP_LIST_ID || 'f83dc56387').trim();
const SITE_ID = (process.env.CUSTOMERIO_SITE_ID || '').trim();
const TRACK   = (process.env.CUSTOMERIO_TRACK_API_KEY || '').trim();
const DRY     = !!process.env.DRY_RUN && process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const LIMIT   = parseInt(process.env.LIMIT || '0', 10) || 0;

if (!MC_KEY) { console.error('Missing MAILCHIMP_API_KEY'); process.exit(1); }
const DC = MC_KEY.includes('-') ? MC_KEY.split('-').pop() : (process.env.MAILCHIMP_SERVER || 'us15');
const MC_BASE = `https://${DC}.api.mailchimp.com/3.0`;
const MC_AUTH = 'Basic ' + Buffer.from(`anystring:${MC_KEY}`).toString('base64');

if (!DRY && (!SITE_ID || !TRACK)) {
  console.error('Missing CUSTOMERIO_SITE_ID / CUSTOMERIO_TRACK_API_KEY (required unless DRY_RUN).');
  process.exit(1);
}
const CIO_BASE = 'https://track.customer.io/api/v1';
const CIO_AUTH = 'Basic ' + Buffer.from(`${SITE_ID}:${TRACK}`).toString('base64');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Map a Mailchimp interest NAME (any category) to a Customer.io attribute key.
// Name-based + keyword-tolerant so a rename in Mailchimp doesn't silently drop it.
function attrForInterest(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('newsletter')) return 'sub_newsletter';
  if (n.includes('weekly')) return 'sub_weekly_update';
  if (n.includes('music') || n.includes('arts')) return 'topic_music_arts';
  if (n.includes('government') || n.includes('meeting') || n.includes('civic')) return 'topic_gov_meetings';
  if (n.includes('family') || n.includes('kids')) return 'topic_family_kids';
  if (n.includes('outdoor') || n.includes('recreation')) return 'topic_outdoors_rec';
  return null; // unmapped interest group — ignored
}

async function mc(path) {
  const res = await fetch(MC_BASE + path, { headers: { Authorization: MC_AUTH } });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`Mailchimp ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

(async () => {
  console.log(`Mailchimp dc=${DC} list=${LIST_ID}  →  Customer.io (US)  ${DRY ? '[DRY RUN]' : '[LIVE IMPORT]'}`);

  // 1. Resolve every interest id → Customer.io attribute, by name.
  const cats = await mc(`/lists/${LIST_ID}/interest-categories?count=100`);
  const interestMap = {}; // interestId -> cio attr
  for (const c of cats.categories || []) {
    const ints = await mc(`/lists/${LIST_ID}/interest-categories/${c.id}/interests?count=200`);
    for (const i of ints.interests || []) {
      const attr = attrForInterest(i.name);
      if (attr) interestMap[i.id] = attr;
      console.log(`  group "${c.title} › ${i.name}" (${i.id})  →  ${attr || '(ignored)'}`);
    }
  }
  const mappedAttrs = new Set(Object.values(interestMap));
  if (!mappedAttrs.size) { console.error('No interest groups mapped — aborting before touching anyone.'); process.exit(1); }

  // 2. Page through all SUBSCRIBED members.
  const fields = [
    'total_items',
    'members.email_address', 'members.status', 'members.full_name',
    'members.merge_fields', 'members.interests',
    'members.timestamp_opt', 'members.timestamp_signup',
  ].join(',');
  const people = [];
  let offset = 0;
  const count = 1000;
  for (;;) {
    const page = await mc(`/lists/${LIST_ID}/members?status=subscribed&count=${count}&offset=${offset}&fields=${encodeURIComponent(fields)}`);
    const batch = page.members || [];
    people.push(...batch);
    if (offset === 0) console.log(`  subscribed members: ${page.total_items}`);
    offset += count;
    if (batch.length < count) break;
  }

  // 3. Map → Customer.io attribute bodies.
  const tally = { sub_newsletter: 0, sub_weekly_update: 0, topic_music_arts: 0, topic_gov_meetings: 0, topic_family_kids: 0, topic_outdoors_rec: 0, region: 0 };
  const bodies = [];
  for (const m of people) {
    const email = (m.email_address || '').toLowerCase().trim();
    if (!email || !email.includes('@')) continue;
    const mf = m.merge_fields || {};
    const body = {
      email,
      source: 'mailchimp-import',
      mailchimp_status: m.status,
    };
    const fname = (mf.FNAME || '').trim() || (m.full_name || '').split(' ')[0] || '';
    const lname = (mf.LNAME || '').trim() || (m.full_name || '').split(' ').slice(1).join(' ') || '';
    if (fname) body.first_name = fname;
    if (lname) body.last_name = lname;
    const region = (mf.MMERGE6 || '').trim();
    if (region) { body.region = region; tally.region++; }
    // every mapped attribute defaults false, then set true where the member is in the group
    for (const attr of mappedAttrs) body[attr] = false;
    const ints = m.interests || {};
    for (const [iid, on] of Object.entries(ints)) {
      const attr = interestMap[iid];
      if (attr && on) { body[attr] = true; tally[attr]++; }
    }
    const ts = m.timestamp_opt || m.timestamp_signup;
    if (ts) { const s = Math.floor(new Date(ts).getTime() / 1000); if (s > 0) body.created_at = s; }
    bodies.push(body);
    if (LIMIT && bodies.length >= LIMIT) break;
  }

  console.log(`\nMapped ${bodies.length} people. Group counts:`);
  for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v}`);
  console.log('\nSample mappings (first 5):');
  for (const b of bodies.slice(0, 5)) console.log('  ' + JSON.stringify(b));

  if (DRY) {
    console.log('\n[DRY RUN] Nothing written to Customer.io. Re-run with DRY_RUN unset to import.');
    return;
  }

  // 4. Identify each person into Customer.io (idempotent PUT).
  let ok = 0, fail = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    try {
      const res = await fetch(`${CIO_BASE}/customers/${encodeURIComponent(b.email)}`, {
        method: 'PUT',
        headers: { Authorization: CIO_AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      });
      if (res.ok) ok++; else { fail++; if (fail <= 10) console.log(`  ✗ ${res.status} ${b.email} — ${(await res.text()).slice(0, 120)}`); }
    } catch (e) { fail++; if (fail <= 10) console.log(`  ✗ ${b.email} — ${e.message}`); }
    if ((i + 1) % 100 === 0) console.log(`  …${i + 1}/${bodies.length} (${ok} ok, ${fail} failed)`);
    await sleep(35);
  }
  console.log(`\nImported ${ok}/${bodies.length} into Customer.io (${fail} failed).`);
  console.log('Check Customer.io → People (filter source = "mailchimp-import").');
  if (fail) process.exit(1);
})().catch((e) => { console.error('FATAL: ' + e.message); process.exit(1); });
