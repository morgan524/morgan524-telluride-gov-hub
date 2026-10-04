#!/usr/bin/env node
/**
 * past-meetings-email.js — render the Monday "Past Meetings" email: a short
 * summary of each public meeting recapped from last week's five business days,
 * each linking to its full recap on gov-hub-past.html.
 *
 * Its own opt-in subscription (sub_past_meetings), split out of the weekly
 * digest's "Last Week's Meetings, Recapped" section on 2026-10-04 (Morgan).
 * One list for everyone: no regional variants, so the digest Worker sends it as
 * a single broadcast trigger to the Past Meetings audience.
 *
 * Only recapped meetings are listed (data/meeting-recaps.json); a week with no
 * recaps writes no file and prints PAST_COUNT=0, so digest-refresh.yml leaves
 * it out of the manifest and nothing is sent.
 *
 * Usage:
 *   node scripts/past-meetings-email.js 2026-10-05 digest/past.html
 *   (weekStart = the Monday the email goes out; it covers the Mon–Fri before)
 *   WEEKLY_PREVIEW=1 … renders the info@ review copy (banner, merge tags neutralised).
 */
const fs = require('fs');
const path = require('path');
const RR = require('./lib/recap-regions.js');

const WEEK_START = process.argv[2] || new Date().toISOString().slice(0, 10);
const OUT = process.argv[3] || 'past-meetings-email.html';
const PREVIEW = !!process.env.WEEKLY_PREVIEW;
const SITE = 'https://livabletelluride.org';
const PAST_PAGE = SITE + '/gov-hub-past.html';
const EMAIL_TITLE = 'Past Meetings';
const KICKER = 'Livable Telluride · Past Meetings';
const MAX_ROWS = 30;   // a heavy week still fits well under the 49 KB trigger cap

const esc = (s) => String(s == null ? '' : s).replace(/&#0?39;/g, "'").replace(/[<>"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/&(?!amp;|lt;|gt;|quot;)/g, '&amp;');
const wd = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' });
const longDate = (d, withYear) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', Object.assign({ month: 'long', day: 'numeric', timeZone: 'America/Denver' }, withYear ? { year: 'numeric' } : {}));

// "September 28 - October 2, 2026" for the business week before WEEK_START.
function weekLabel(weekStart) {
  const [s, e] = RR.priorBusinessWeek(weekStart);
  return longDate(s, s.slice(0, 4) !== e.slice(0, 4)) + ' - ' + longDate(e, true);
}

function render(recaps, weekStart, preview) {
  const label = weekLabel(weekStart);
  const rows = recaps.slice(0, MAX_ROWS).map((r) => `<tr><td style="padding:12px 0;border-top:1px solid #eef1ee;"><span style="display:inline-block;background:#e9efe9;color:#21443c;font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;white-space:nowrap;">${esc(wd(r.date)).toUpperCase()}</span><span style="font-size:12px;color:#7a8a85;margin-left:8px;">${esc(r.sourceLabel || '')}</span><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#1a2e29;margin-top:5px;">${esc(r.title || '')}</div><div style="font-size:14.5px;color:#5a6b64;line-height:1.55;margin:4px 0 6px;">${esc(RR.shortRecap(r.recap))}</div><a href="${esc(PAST_PAGE + '#' + RR.recapId(r))}" style="color:#a0531f;text-decoration:underline;font-size:12.5px;font-weight:600;">Read the full summary &rarr;</a></td></tr>`).join('');
  const moreRow = `<tr><td style="padding:10px 0 0;border-top:1px solid #eef1ee;"><a href="${esc(PAST_PAGE)}" style="color:#21443c;font-size:12.5px;font-weight:700;text-decoration:underline;">See every meeting recap on the Past Meetings page &rarr;</a></td></tr>`;
  const n = recaps.length;
  const lede = `What happened at ${n} public meeting${n === 1 ? '' : 's'} across the region last week, in brief. Each summary links to the full recap, written from the meeting's video or minutes.`;

  let html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
@media only screen and (max-width:480px){
  .sec-pad{padding-left:16px !important;padding-right:16px !important;}
}
</style></head>
<body style="margin:0;background:#f0ece3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ece3;"><tr><td align="center" style="padding:24px 10px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fdfbf6;border-radius:6px;overflow:hidden;">
  <tr><td class="sec-pad" style="background:#21443c;padding:26px 34px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle" style="vertical-align:middle;">
        <div style="font-family:Georgia,serif;font-size:11px;color:#b58a2c;letter-spacing:.18em;text-transform:uppercase;">${esc(KICKER)}</div>
        <div style="font-family:Georgia,serif;font-size:25px;font-weight:700;color:#fff;margin-top:4px;">${esc(EMAIL_TITLE)}</div>
        <div style="font-family:Georgia,serif;font-size:14px;color:#a8c4b8;margin-top:3px;">${esc(label)}</div>
      </td>
      <td width="74" valign="middle" align="right" style="vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr><td style="background:#ffffff;border-radius:8px;padding:5px;">
          <img src="https://livabletelluride.org/logo/Livable%20Telluride%20Logo.png" width="58" height="58" alt="Livable Telluride" style="display:block;width:58px;height:58px;border:0;">
        </td></tr></table>
      </td>
    </tr></table></td></tr>
  <tr><td class="sec-pad" style="padding:22px 34px 4px;">
    <p style="margin:0;font-size:15.5px;line-height:1.65;color:#2c3b35;">${esc(lede)}</p></td></tr>
  <tr><td class="sec-pad" style="padding:24px 34px 0;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;border-bottom:1px solid #d4c9b0;padding-bottom:8px;">&rarr; Last Week&rsquo;s Meetings, Recapped</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${moreRow}</table></td></tr>
  <tr><td class="sec-pad" style="padding:24px 34px 30px;border-top:1px solid #ddd6c8;margin-top:24px;">
    <div style="font-family:Georgia,serif;font-size:13px;font-weight:700;color:#21443c;">Livable Telluride</div>
    <div style="font-size:12px;color:#7a8a85;line-height:1.6;margin-top:4px;">Community information for Telluride, Mountain Village &amp; San Miguel County.<br>
    <a href="https://livabletelluride.org" style="color:#7a8a85;">livabletelluride.org</a> &nbsp;·&nbsp; <a href="*|UNSUB|*" style="color:#7a8a85;">Unsubscribe</a> &nbsp;·&nbsp; <a href="https://livabletelluride.org/profile.html?email=*|EMAIL|*&amp;fname=*|FNAME|*&amp;town=*|MMERGE6|*" style="color:#7a8a85;">Update preferences</a></div></td></tr>
</table></td></tr></table></body></html>`;

  if (preview) {
    const banner = `  <tr><td style="background:#a8401f;padding:13px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#fff;line-height:1.5;">REVIEW DRAFT &mdash; Monday's Past Meetings email. Look it over, then approve to send.<br><a href="https://livabletelluride.org/digest-review.html" style="color:#ffe4c4;font-weight:700;text-decoration:underline;">Edit or send this draft at the Review Desk &rarr;</a></td></tr>\n`;
    html = html.replace('  <tr><td class="sec-pad" style="background:#21443c;padding:26px 34px;">', banner + '  <tr><td class="sec-pad" style="background:#21443c;padding:26px 34px;">')
      .replace(/\*\|UNSUB\|\*/g, '#').replace(/\*\|[A-Z0-9_]+\|\*/g, '');
  }
  // Same conventions as weekly-email.js: UTM-tag internal links (anchors kept),
  // then encode every non-ASCII character as an entity so the body is pure ASCII.
  html = html.replace(/href="(https:\/\/livabletelluride\.org[^"]*)"/g, (m, url) => {
    const h = url.indexOf('#'); const base = h >= 0 ? url.slice(0, h) : url; const frag = h >= 0 ? url.slice(h) : '';
    return 'href="' + base + (base.includes('?') ? '&amp;' : '?') + 'utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=past-meetings' + frag + '"';
  });
  html = Array.from(html).map((ch) => { const cp = ch.codePointAt(0); return cp > 127 ? '&#' + cp + ';' : ch; }).join('');
  return { html, subject: EMAIL_TITLE + ' - ' + label };
}

module.exports = { render, weekLabel };

if (require.main === module) {
  let all = [];
  try { all = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'meeting-recaps.json'), 'utf8')); }
  catch (e) { console.error('meeting-recaps.json unreadable:', e.message); process.exit(1); }
  const recaps = RR.recapsForWeek(all, WEEK_START);
  console.log('PAST_COUNT=' + recaps.length);
  if (!recaps.length) {
    if (fs.existsSync(OUT)) fs.unlinkSync(OUT);   // never leave last week's file behind to be sent
    console.log(`past-meetings-email: no recaps for ${RR.priorBusinessWeek(WEEK_START).join(' to ')} — nothing written`);
    process.exit(0);
  }
  const { html, subject } = render(recaps, WEEK_START, PREVIEW);
  fs.writeFileSync(OUT, html);
  console.log('SUBJECT=' + subject);
  console.log(`past-meetings-email: ${recaps.length} recap(s) (${RR.priorBusinessWeek(WEEK_START).join(' to ')}) → ${OUT}${PREVIEW ? ' [preview]' : ''} (${html.length} bytes)`);
}
