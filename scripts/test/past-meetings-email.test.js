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

// Importance (2026-10-19): key bodies on community-wide issues lead, longer;
// single-lot decisions are de-emphasised.
const RI = require('../lib/recap-importance.js');
const BUDGET = { sourceKey: 'telluride', sourceLabel: 'Town of Telluride', date: '2026-10-13', title: 'Town Council Budget — Oct 13, 2026',
  recap: 'Council held a budget work session on the proposed 2027 budget, with adoption scheduled for November 17. Water and sewer rates would rise 5 percent. The parking fund would cover the new transit shelters. A variance for a deck at 123 West Pacific Avenue was continued. Staff will return with a revised capital plan that includes affordable housing at Shandoka.' };
const DRB = { sourceKey: 'mv', sourceLabel: 'Mountain Village', date: '2026-10-01', title: 'Design Review Board — Oct 1, 2026',
  recap: 'The board approved the final architecture review for a single-family home at Lot 640A. A setback variance for a fence at 12 Adams Ranch Road was denied. A landscaping plan for Lot 726 was continued.' };
const SMART = { sourceKey: 'smart', sourceLabel: 'SMART', date: '2026-10-08', title: 'SMART Board — Oct 8, 2026', recap: 'The board approved the gondola budget. It also discussed the transit budget and bus routes.' };

test('key bodies on community-wide issues are major; lot-only meetings and other bodies are not', () => {
  assert.ok(RI.isMajor(BUDGET));
  assert.ok(!RI.isMajor(DRB), 'DRB meeting of only lot decisions keeps the short teaser');
  assert.ok(!RI.isMajor(SMART), 'SMART is not one of the key bodies');
});

test('long summary drops the single-lot sentence and keeps community-wide ones', () => {
  const s = RI.longRecap(BUDGET.recap);
  assert.ok(!/deck/.test(s));
  assert.ok(/rates/.test(s) && /Shandoka/.test(s));
  assert.ok(s.length > RR.shortRecap(BUDGET.recap).length);
});

test('abbreviations like "sq. ft." do not split sentences', () => {
  assert.strictEqual(RI.splitSentences('A 3,000 sq. ft. cap applies. Height rises to 45 ft. for multifamily.').length, 2);
});

test('Major Decisions section leads; others follow under Other Meetings', () => {
  const { html } = render([SMART, BUDGET, DRB], '2026-10-19', false);
  const a = html.indexOf('Major Decisions'), b = html.indexOf('Other Meetings');
  assert.ok(a > 0 && b > a);
  assert.ok(html.indexOf(BUDGET.title.split(' —')[0]) < b);
  assert.ok(html.indexOf('Design Review Board') > b);
});

test('a week with no major meetings has a single plain section', () => {
  const { html } = render([SMART, DRB], '2026-10-19', false);
  assert.ok(!html.includes('Major Decisions') && !html.includes('Other Meetings'));
  assert.ok(html.includes('Last Week&#8217;s Meetings') || html.includes('Last Week&rsquo;s Meetings'));
});

// Bolding guideline (2026-10-19): only **marked** terms are bold; unmarked
// legacy text bolds dollar figures only — never agency names.
const { renderBold, BOLD_GUIDELINE } = require('../lib/bold-guideline.js');
test('renderBold: marks become <strong>, stray marks dropped, legacy text bolds only dollars', () => {
  assert.strictEqual(renderBold('Council committed **$812,000** to the gondola.'), 'Council committed <strong>$812,000</strong> to the gondola.');
  assert.strictEqual(renderBold('A stray ** mark'), 'A stray  mark');
  assert.strictEqual(renderBold('Mountain Village Town Council approved $812,000 for San Miguel County.'), 'Mountain Village Town Council approved <strong>$812,000</strong> for San Miguel County.');
  assert.ok(/When in doubt, leave it unbolded/.test(BOLD_GUIDELINE));
});
test('Past Meetings email renders the recap bold marks', () => {
  const r = { sourceKey: 'mv', sourceLabel: 'Mountain Village', date: '2026-10-15', title: 'Mountain Village Town Council — Oct 15, 2026',
    recap: 'Council approved the **gondola project development** supplement, committing **$812,000** to the 2027 planning budget. Council also adopted the 2027 fee schedule.' };
  const { html } = render([r], '2026-10-19', false);
  assert.ok(html.includes('<strong>gondola project development</strong>') && !html.includes('**'));
});
