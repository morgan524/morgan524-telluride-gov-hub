#!/usr/bin/env node
/**
 * weekly-email.js — render the curated "Week Ahead" email (Option A) from
 * feed.xml as a complete, paste-ready HTML email for a Mailchimp REGULAR
 * campaign (not RSS). Hand-curated layout: lede + Public Meetings + Events,
 * each with a one-line summary. Meetings whose agenda isn't posted yet get a
 * "what this body does" blurb instead of a blank/TBD line.
 *
 * Usage:
 *   node scripts/weekly-email.js <feedPath> <cutoffYYYY-MM-DD> "<Week Label>" <outPath>
 * Example (Monday send):
 *   curl -s https://livabletelluride.org/feed.xml -o /tmp/feed.xml
 *   node scripts/weekly-email.js /tmp/feed.xml 2026-06-15 "June 15 – 21, 2026" weekly-email.html
 *
 * Edit LEDE below each week (this is the voice-y intro — keep it short).
 */
const fs = require('fs');

const FEED   = process.argv[2] || 'feed.xml';
const CUTOFF = process.argv[3] || new Date().toISOString().slice(0, 10);
const LABEL  = process.argv[4] || 'This Week';
const OUT    = process.argv[5] || 'weekly-email.html';

// ── Edit this each week ──
const LEDE = "The government calendar bunches up on Wednesday the 17th — Mountain Village Town Council and the County Commissioners both meet, with Telluride’s HARC and Parks & Rec the same evening — so if land use, open space, or what gets built next is your thing, that’s the day to show up. Norwood’s Planning & Zoning, the Fire District, and Ophir’s General Assembly round out the week, and summer’s hitting full stride across the box canyon.";

const dec = (s) => String(s).replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
const field = (it, t) => { const m = it.match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>')); return m ? dec(m[1]) : ''; };
const esc = (s) => String(s == null ? '' : s).replace(/&#0?39;/g, "'").replace(/[<>"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/&(?!amp;|lt;|gt;|quot;)/g, '&amp;');
const trunc = (s, n) => { s = s.replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n); const d = c.lastIndexOf('. '); return (d > n * 0.5 ? c.slice(0, d + 1) : c.replace(/\s\S*$/, '') + '…'); };
const wd = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' });

// A meeting summary is "weak" (use the body blurb instead) when it's just a
// stub: no posted agenda, a bare "scheduled for", or the AI's "no content yet".
function isWeak(s) {
  return !s || s.length < 32 ||
    /agenda (tbd|not available|not yet|not posted)|hasn.t been posted|isn.t available|not available yet|no agenda|list of past meetings|meeting scheduled for|^regular meeting agenda/i.test(s);
}
function bodyDesc(name, src) {
  const n = (name + ' ' + src).toLowerCase();
  if (/county commissioner|bocc/.test(n)) return 'San Miguel County’s governing board — land use, budget, and countywide policy.';
  if (/town council/.test(n) && /mountain village/.test(n)) return 'Mountain Village’s governing council — ordinances, budget, and town policy.';
  if (/town council/.test(n)) return 'The town council — ordinances, budget, and local policy.';
  if (/planning|zoning|p&z/.test(n)) return 'The land-use board — development, subdivision, and zoning applications.';
  if (/historic|architectural|harc/.test(n)) return 'Reviews exterior changes and new construction in the historic district.';
  if (/parks|recreation/.test(n)) return 'Advises on parks, trails, and recreation programs and facilities.';
  if (/fire/.test(n)) return 'The Fire Protection District board — budget, staffing, and fire/EMS operations.';
  if (/general assembly/.test(n)) return 'Ophir’s General Assembly — the town’s governing body.';
  if (/judicial/.test(n)) return 'Telluride’s judicial subcommittee — municipal court matters.';
  if (/smart/.test(n)) return 'The regional transit authority board — routes, funding, and operations.';
  if (/school|education/.test(n)) return 'The school district board — policy, budget, and schools.';
  if (/airport/.test(n)) return 'The regional airport authority board.';
  if (/housing/.test(n)) return 'The regional housing authority — deed-restricted housing and applications.';
  return 'Regular public meeting — the agenda posts closer to the date on the Gov-Hub.';
}
function meetSummary(d, name, src) {
  const p = d.split(/\n\n/); let s = (p.slice(1).join(' ').trim() || p[0]);
  s = s.replace(/^[A-Za-z .&]+•\s*\d{4}-\d{2}-\d{2}\s*/, '').trim();
  return isWeak(s) ? bodyDesc(name, src) : trunc(s, 200);
}
function evSummary(d) { let s = d.replace(/<img[^>]*>/gi, ''); s = s.split('\n').filter((l) => !/^\s*[🎫📍🕒]/.test(l)).join(' '); return trunc(s, 200); }

const xml = fs.readFileSync(FEED, 'utf8');
const items = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => ({ t: field(it, 'title'), d: field(it, 'description') }));

const seen = new Set(); const meetings = [];
for (const x of items.filter((x) => /\[Meeting\]/.test(x.t))) {
  const dm = x.t.match(/(\d{4}-\d{2}-\d{2})\s*$/); const date = dm ? dm[1] : ''; if (date < CUTOFF) continue;
  const name = x.t.replace(/^⚡?\s*\[Meeting\]\s*/, '').replace(/\s*[-—]\s*\d{4}-\d{2}-\d{2}\s*$/, '').replace(/\s*-\s*\w+ \d+ \d{4}\s*$/, '').replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '').replace(/\s*Chair\s*$/, '').replace(/\s+Meeting$/, '').trim();
  const src = (x.d.split('\n')[0] || '').split('•')[0].trim();
  const key = src + '|' + date + '|' + name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 24);
  if (seen.has(key)) continue; seen.add(key);
  meetings.push({ name, date, src, summary: meetSummary(x.d, name, src) });
}
meetings.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

const events = items.filter((x) => /^\[(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(x.t)).map((x) => {
  const m = x.t.match(/^\[([^\]]+)\]\s*(.*)$/); return { when: m ? m[1] : '', title: m ? m[2] : x.t, summary: evSummary(x.d) };
}).filter((e) => { const md = e.when.match(/(\w{3}) (\d+)/); if (!md) return true; var day = +md[2]; return (CUTOFF.slice(8) <= ('0' + day).slice(-2)) || day >= +CUTOFF.slice(8); });

const mh = meetings.map((m) => `<tr><td style="padding:13px 0;border-top:1px solid #eef1ee;"><span style="display:inline-block;background:#21443c;color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;white-space:nowrap;">${esc(wd(m.date)).toUpperCase()}</span><span style="font-size:12px;color:#7a8a85;margin-left:8px;">${esc(m.src)}</span><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#1a2e29;margin-top:5px;">${esc(m.name)}</div><div style="font-size:13.5px;color:#5a6b64;line-height:1.55;margin-top:4px;">${esc(m.summary)}</div></td></tr>`).join('');
const eh = events.map((e) => `<tr><td style="padding:13px 0;border-top:1px solid #eef1ee;"><div style="font-size:12px;font-weight:800;color:#2f7a5f;">${esc(e.when)}</div><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#1a2e29;margin-top:2px;">${esc(e.title)}</div><div style="font-size:13.5px;color:#5a6b64;line-height:1.55;margin-top:4px;">${esc(e.summary)}</div></td></tr>`).join('');

const section = (label, rows) => rows ? `<tr><td style="padding:24px 34px 0;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;border-bottom:1px solid #d4c9b0;padding-bottom:8px;">→ ${label}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : '';

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f0ece3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ece3;"><tr><td align="center" style="padding:24px 10px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fdfbf6;border-radius:6px;overflow:hidden;">
  <tr><td style="background:#21443c;padding:26px 34px;">
    <div style="font-family:Georgia,serif;font-size:11px;color:#b58a2c;letter-spacing:.18em;text-transform:uppercase;">Livable Telluride · Weekly Update</div>
    <div style="font-family:Georgia,serif;font-size:25px;font-weight:700;color:#fff;margin-top:4px;">The Week Ahead</div>
    <div style="font-family:Georgia,serif;font-size:14px;color:#a8c4b8;margin-top:3px;">${esc(LABEL)}</div></td></tr>
  <tr><td style="padding:22px 34px 4px;">
    <span style="display:inline-block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#2f7a5f;background:rgba(47,122,95,.1);padding:3px 10px;border-radius:999px;">📅 The Week Ahead</span>
    <p style="margin:11px 0 0;font-size:15.5px;line-height:1.65;color:#2c3b35;">${esc(LEDE)}</p></td></tr>
  ${section('Public Meetings This Week', mh)}
  ${section('Events This Week', eh)}
  <tr><td style="padding:24px 34px 30px;border-top:1px solid #ddd6c8;">
    <div style="font-family:Georgia,serif;font-size:13px;font-weight:700;color:#21443c;">Livable Telluride</div>
    <div style="font-size:12px;color:#7a8a85;line-height:1.6;margin-top:4px;">Community information for Telluride, Mountain Village &amp; San Miguel County.<br>
    <a href="https://livabletelluride.org" style="color:#7a8a85;">livabletelluride.org</a> &nbsp;·&nbsp; <a href="*|UNSUB|*" style="color:#7a8a85;">Unsubscribe</a> &nbsp;·&nbsp; <a href="https://livabletelluride.org/profile.html?email=*|EMAIL|*&amp;fname=*|FNAME|*&amp;town=*|MMERGE6|*" style="color:#7a8a85;">Update preferences</a></div></td></tr>
</table></td></tr></table></body></html>`;

fs.writeFileSync(OUT, html);
console.log(`weekly-email: ${meetings.length} meetings, ${events.length} events → ${OUT} (cutoff ${CUTOFF}, label "${LABEL}")`);
