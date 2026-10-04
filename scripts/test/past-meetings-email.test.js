// Past Meetings email (scripts/past-meetings-email.js) and the digest Worker's
// per-key broadcast choice. Split out of the weekly digest 2026-10-04.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const RR = require('../lib/recap-regions.js');
const { render, weekLabel } = require('../past-meetings-email.js');

const RECAPS = [
  { sourceKey: 'telluride', sourceLabel: 'Town of Telluride', date: '2026-09-30', title: 'Town Council (Special) — Sep 30, 2026', recap: 'Council heard an appeal. It voted 3-1 to affirm.' },
  { sourceKey: 'county', sourceLabel: 'San Miguel County', date: '2026-09-29', title: 'Board of County Commissioners', recap: 'A work session on the budget.' },
];

test('one list for everyone: no regional markers', () => {
  const { html } = render(RECAPS, '2026-10-05', false);
  assert.ok(!html.includes(RR.REGION_MARK), 'Past Meetings must be a single non-regional email');
});

test('each recap links to its card on the Past Meetings page', () => {
  const { html } = render(RECAPS, '2026-10-05', false);
  for (const r of RECAPS) assert.ok(html.includes('gov-hub-past.html?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=past-meetings#' + RR.recapId(r)), r.title);
});

test('subject and label name the business week covered', () => {
  assert.strictEqual(weekLabel('2026-10-05'), 'September 28 - October 2, 2026');
  assert.strictEqual(render(RECAPS, '2026-10-05', false).subject, 'Past Meetings - September 28 - October 2, 2026');
  assert.strictEqual(weekLabel('2027-01-04'), 'December 28, 2026 - January 1, 2027');
});

test('body is pure ASCII and keeps the unsubscribe merge tag (live copy only)', () => {
  const live = render(RECAPS, '2026-10-05', false).html;
  assert.ok(/^[\x00-\x7f]*$/.test(live));
  assert.ok(live.includes('*|UNSUB|*'));
  assert.ok(!render(RECAPS, '2026-10-05', true).html.includes('*|UNSUB|*'));
});

// The Worker must send Past Meetings ONLY to its own broadcast — falling back to
// the weekly broadcast would mail it to the whole Weekly Update list.
const wsrc = fs.readFileSync(path.join(__dirname, '..', '..', 'cloudflare-worker', 'livabletelluride-digest', 'worker.js'), 'utf8');
const sendSrc = wsrc.slice(wsrc.indexOf('async function send(body, env) {'), wsrc.indexOf('// Archive a just-sent broadcast'));
function makeSend() {
  const calls = [];
  // eslint-disable-next-line no-new-func
  const send = new Function('ltSendBroadcast', 'ltRegionVariant', 'archiveBroadcast', 'FROM', 'fetch',
    sendSrc + '\nreturn send;')(async (bid) => { calls.push(bid); return { ok: true, sends: 1 }; }, (h) => h, async () => 'archived', 'x', null);
  return { send, calls };
}

test('past key uses CUSTOMERIO_PAST_BROADCAST_ID; weekly uses CUSTOMERIO_BROADCAST_ID', async () => {
  const env = { CUSTOMERIO_APP_API_KEY: 'k', CUSTOMERIO_BROADCAST_ID: '1', CUSTOMERIO_PAST_BROADCAST_ID: '7' };
  const { send, calls } = makeSend();
  await send({ key: 'past', emailHtml: 'x', subject: 's' }, env);
  await send({ key: 'weekly', emailHtml: 'x', subject: 's' }, env);
  assert.deepStrictEqual(calls, ['7', '1']);
});

test('past key without its broadcast ID is refused, never sent to the weekly list', async () => {
  const { send, calls } = makeSend();
  const r = await send({ key: 'past', emailHtml: 'x', subject: 's' }, { CUSTOMERIO_APP_API_KEY: 'k', CUSTOMERIO_BROADCAST_ID: '1' });
  assert.ok(r.pending && /CUSTOMERIO_PAST_BROADCAST_ID/.test(r.error));
  assert.deepStrictEqual(calls, []);
});
