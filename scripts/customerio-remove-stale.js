#!/usr/bin/env node
/**
 * customerio-remove-stale.js — take permanently undeliverable addresses off
 * every Livable Telluride list (Morgan 2026-10-19: "remove stale emails").
 *
 * Reads the delivery results of recent broadcast sends (App API) and picks the
 * PERMANENT failures only:
 *   - hard bounce: mailbox not found / no such user / no MX for the domain
 *   - already suppressed by Customer.io for an earlier bounce
 *   - suppressed because the person marked us as spam
 * Temporary or policy failures (can't connect to the mail server right now,
 * Microsoft tenant rejections, "authentication required") are NOT touched —
 * those are real people whose mail may get through next time.
 *
 * "Remove" = unsubscribe, not delete: each profile gets unsubscribed=true and
 * every sub_* flag false (so it leaves the subscriber segments and counts),
 * plus stale_email_reason / stale_email_at so it can be found and undone.
 * Profiles are never deleted.
 *
 * Env: CUSTOMERIO_APP_API_KEY (read), CUSTOMERIO_SITE_ID + CUSTOMERIO_TRACK_API_KEY (write)
 * Usage: node scripts/customerio-remove-stale.js [--apply] [--days 7] [--broadcasts 1,5]
 *   Without --apply it only lists what it would change.
 */
const APPLY = process.argv.includes('--apply');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const DAYS = Number(arg('--days', '7'));
const BROADCASTS = String(arg('--broadcasts', '1,5')).split(',').map(Number);

const PERMANENT = [
  [/previously bounced address/i, 'earlier hard bounce'],
  [/mailbox not found|no such user|user unknown|does not exist|recipient address rejected|address not found/i, 'mailbox not found'],
  [/no mx for/i, 'domain has no mail server'],
  [/marked your messages as spam/i, 'spam complaint'],
];

async function appGet(url) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + process.env.CUSTOMERIO_APP_API_KEY } });
  if (!r.ok) throw new Error(`App API ${r.status} for ${url}`);
  return r.json();
}

async function failures() {
  const since = Date.now() / 1000 - DAYS * 86400;
  const out = new Map();
  for (const bid of BROADCASTS) {
    let start = '';
    for (let page = 0; page < 50; page++) {
      const d = await appGet(`https://api.customer.io/v1/messages?type=email&limit=1000&broadcast_id=${bid}${start ? '&start=' + encodeURIComponent(start) : ''}`);
      const msgs = d.messages || [];
      for (const m of msgs) {
        if ((m.created || 0) < since) continue;
        const met = m.metrics || {};
        if (!met.bounced && !met.dropped) continue;
        const why = PERMANENT.find(([re]) => re.test(m.failure_message || ''));
        // Broadcast messages carry customer_identifiers.cio_id (customer_id is
        // null); the Track API takes it as "cio_<id>".
        const cio = m.customer_identifiers && m.customer_identifiers.cio_id;
        const id = m.customer_id || (cio ? 'cio_' + cio : '');
        if (!why || !id) continue;
        if (!out.has(id)) out.set(id, { id, email: m.recipient || '', reason: why[1], detail: String(m.failure_message || '').slice(0, 120) });
      }
      start = d.next || '';
      if (!start || !msgs.length || Math.min(...msgs.map((m) => m.created || 0)) < since) break;
    }
  }
  return [...out.values()];
}

async function unsubscribe(p) {
  const auth = 'Basic ' + Buffer.from(process.env.CUSTOMERIO_SITE_ID + ':' + process.env.CUSTOMERIO_TRACK_API_KEY).toString('base64');
  const r = await fetch('https://track.customer.io/api/v1/customers/' + encodeURIComponent(p.id), {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      unsubscribed: true, sub_weekly_update: false, sub_past_meetings: false, sub_newsletter: false,
      stale_email_reason: p.reason, stale_email_at: Math.floor(Date.now() / 1000),
    }),
  });
  if (!r.ok) throw new Error(`Track API ${r.status} for ${p.id}: ${(await r.text()).slice(0, 200)}`);
}

const mask = (e) => String(e).replace(/^(.{2})[^@]*/, '$1***');

(async () => {
  const list = await failures();
  const by = {};
  for (const p of list) by[p.reason] = (by[p.reason] || 0) + 1;
  console.log(`stale addresses (broadcasts ${BROADCASTS.join(',')}, last ${DAYS} days): ${list.length}`, by);
  for (const p of list) console.log(`  ${mask(p.email)}  ${p.reason}`);
  if (!APPLY) { console.log('dry run: nothing changed (pass --apply to unsubscribe them)'); return; }
  if (!process.env.CUSTOMERIO_SITE_ID || !process.env.CUSTOMERIO_TRACK_API_KEY) throw new Error('CUSTOMERIO_SITE_ID / CUSTOMERIO_TRACK_API_KEY not set');
  let ok = 0;
  for (const p of list) { await unsubscribe(p); ok++; }
  console.log(`unsubscribed ${ok} stale address(es); undo by setting unsubscribed=false on a profile`);
})().catch((e) => { console.error('customerio-remove-stale FATAL', e.message); process.exit(1); });
