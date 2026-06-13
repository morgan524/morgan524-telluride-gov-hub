#!/usr/bin/env node
/**
 * weekly-email.js — render the curated "Week Ahead" email (Option A) as
 * paste-ready HTML for a regular Mailchimp campaign.
 *
 * Sources everything from gov-data.js + gov-helpers.js (the same data the live
 * site uses), so meetings carry their REAL agenda links and events are the full
 * upcoming list — not the narrow 6-day feed. Picks the single best event per day
 * (one per day, max 7) using events.html's featuredScore() rating, each linked
 * to its own source page (or our events page when there's no source URL).
 *
 * Usage:
 *   curl -s https://livabletelluride.org/js/gov-data.js   -o /tmp/gd.js
 *   curl -s https://livabletelluride.org/js/gov-helpers.js -o /tmp/gh.js
 *   node scripts/weekly-email.js /tmp/gd.js /tmp/gh.js 2026-06-15 "June 15 – 21, 2026" weekly-preview.html
 *
 * Edit the LEDE const below each week (the voice-y intro).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const GD = process.argv[2], GH = process.argv[3];
const WEEK_START = process.argv[4] || new Date().toISOString().slice(0, 10);
const LABEL = process.argv[5] || 'This Week';
const OUT = process.argv[6] || 'weekly-email.html';
const PREVIEW = !!process.env.WEEKLY_PREVIEW;   // render an info@ review draft (banner + topic sections shown inline, merge tags neutralised) instead of the paste-ready Mailchimp HTML

// ── Week Ahead lede — edit data/week-ahead-lede.json (no code change needed).
// That file is a map keyed by week-start (the Monday the email covers,
// YYYY-MM-DD), with a "default" fallback. WEEK_START is computed by the Saturday
// workflow. If the file is missing/unreadable, fall back to a built-in string.
const FALLBACK_LEDE = "A fresh week across the box canyon — public meetings, community events, and a few ways to get involved are all below.";
let LEDE = FALLBACK_LEDE;
try {
  const ledeMap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'week-ahead-lede.json'), 'utf8'));
  LEDE = ledeMap[WEEK_START] || ledeMap.default || FALLBACK_LEDE;
} catch (e) { console.error('week-ahead-lede.json not read (' + e.message + ') — using fallback lede'); }

// 7-day window [WEEK_START, WEEK_START+6]
const startD = new Date(WEEK_START + 'T00:00:00');
const days = []; for (let i = 0; i < 7; i++) { const d = new Date(startD); d.setDate(d.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
const inWeek = (iso) => iso >= days[0] && iso <= days[6];

// ── Load the live data files into this context ──
global.window = {}; global.document = { createElement: () => ({ set innerHTML(v) { this._v = v; }, get value() { return String(this._v == null ? '' : this._v).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"'); } }) };
global.AI_SUMMARIES = {};
const sandbox = (0, eval)(fs.readFileSync(GD, 'utf8') + '\n' + fs.readFileSync(GH, 'utf8') + '\n;({get:(n)=>{try{return eval(n)}catch(e){return undefined}}})');
const G = (n) => sandbox.get(n);

// ── Helpers ported from events.html ──
function featuredStartHour(t) { if (!t) return null; const m = String(t).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i); if (!m) return null; let h = parseInt(m[1], 10); const ap = (m[3] || '').toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; return h; }
function featuredScore(e) {
  const text = ((e.title || '') + ' ' + (e.summary || '') + ' ' + (e.location || '')).toLowerCase();
  const src = (e.source || '').toLowerCase() + ' ' + text; let s = 0;
  if (e.isFestival) s += 50;
  if (/\b(festival|concert|live music|nightgrass|headlin|party|celebrat|fundrais|gala|benefit|kick-?off|premiere|bluegrass|jazz|comedy|showcase|block party|street fair|season opener|grand opening)\b/.test(text)) s += 30;
  else if (/\b(market|show|performance|tour|screening|exhibit|talk|lecture|trivia|open mic|tasting|reading|art walk|game night|dance)\b/.test(text)) s += 10;
  if (/\b(meeting|drop-?in|office hours|story ?time|tech time|clinic|support group|mahjongg|knitting|book club|playgroup|toddler|preschool|rehab|sewing|pilates|zumba)\b/.test(text)) s -= 25;
  if (/sheridan|opera house|palm theat|telluride theatre/.test(src)) s += 15;
  else if (/alibi|sherbino|fly me to the moon|club red/.test(src)) s += 10;
  const h = featuredStartHour(e.time); if (h != null && h >= 16) s += 8;
  const dow = new Date((e.date || days[0]) + 'T12:00:00').getDay(); if (dow === 0 || dow === 5 || dow === 6) s += 6;
  if (e.img) s += 5;
  if (/\bfree\b/.test(text)) s += 4;
  return s;
}
const isGovMeetingTitle = (t) => /\b(town council|board of (county )?commissioners|planning (and zoning|commission)|p&z|board of directors|general assembly|HARC|historic & architectural|parks (and|&) rec|fire protection|housing authority|school board|board of education|work session|subcommittee)\b/i.test(t) || /\bmeeting\b/i.test(t);

// ── Collect events from the source arrays ──
const EVENT_ARRAYS = ['WILKINSON_EVENTS','SHERIDAN_EVENTS','ALIBI_EVENTS','SHERBINO_EVENTS','COMMUNITY_EVENTS','MUSIC_ON_THE_GREEN','TELLURIDE_FARMERS_MARKET','BEACON_EVENTS','CHAMBER_MUSIC_EVENTS','TELLURIDE_SCIENCE_EVENTS','TELLURIDE_FOUNDATION_EVENTS','TF_FOUNDATION_EVENTS','TELLURIDE_VENTURE_EVENTS','OURAY_COUNTY_EVENTS','NORWOOD_EVENTS','MOUNTAIN_VILLAGE_EVENTS','TELLURIDE_COM_EVENTS','KOTO_COMMUNITY_EVENTS','OURAY_RIDGWAY_EVENTS','SHERIDAN_OPERA_EVENTS'];
const SITE = 'https://livabletelluride.org';
const isoMT = (v) => { if (!v) return ''; const s = String(v); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' }); };
let evts = [];
for (const name of EVENT_ARRAYS) {
  const arr = G(name); if (!Array.isArray(arr)) continue;
  for (const e of arr) {
    if (!e || !e.title) continue;
    const date = isoMT(e.pubDate || e.start_date || e.date);
    if (!inWeek(date)) continue;
    if (isGovMeetingTitle(e.title)) continue;            // meetings live in their own section
    if (/closed|closure|holiday hours/i.test(e.title)) continue;
    evts.push({
      title: e.title, date,
      href: e.link || e.href || e.url || '',
      summary: (e.summary || e.copy || e.description || '').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/[\\|]/g, ' ').replace(/\s+/g, ' ').trim(),
      time: e.time || '', location: e.location || '', img: e.img || e.imageUrl || '',
      isFestival: !!e.isFestival, source: e.sourceLabel || e.source || name,
    });
  }
}
// One per day: top featuredScore (tie → earlier start). Skip days with nothing.
const byDay = {};
for (const e of evts) { (byDay[e.date] = byDay[e.date] || []).push(e); }
const chosen = []; const usedTitles = new Set();
const tkey = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 28);
for (const day of days) {
  const list = (byDay[day] || []).sort((a, b) => (featuredScore(b) - featuredScore(a)) || ((featuredStartHour(a.time) || 99) - (featuredStartHour(b.time) || 99)));
  // One DISTINCT event per day: skip an event whose title already ran earlier
  // this week (e.g. a multi-day festival) and take the next-best instead.
  const pick = list.find((e) => !usedTitles.has(tkey(e.title))) || list[0];
  if (pick) { chosen.push(pick); usedTitles.add(tkey(pick.title)); }
}

// ── Topic extras: events NOT already in the universal one-per-day list, grouped
// by the Event Topics interest groups. Rendered inside Mailchimp *|INTERESTED|*
// conditional blocks, so a subscriber only sees the topics they opted into.
// Classifier mirrors scripts/build-rss-feed.js eventCategory() so the email and
// the per-topic RSS feeds agree. Group names are the EXACT Mailchimp names
// (category "Event Topics"); "Music & Arts" was renamed from "Music, Arts &
// Festivals" to drop the comma that breaks the *|INTERESTED|* parser.
const ARTS_SOURCES = /music on the green|sheridan|alibi|sherbino|opera house/i;
function eventCategory(e) {
  const t = [e.title, e.summary, e.location, e.source].map((x) => String(x || '')).join(' ').toLowerCase();
  if (/\b(storytime|story time|kids?|children|youth|teens?|toddler|preschool|all[- ]ages|family|families|scouts?|baby|babies|tween)\b/.test(t)) return 'family';
  if (/\b(hike|hiking|trail|trailhead|bike|biking|cycling|ski|skiing|nordic|snowshoe|climb|climbing|river|raft|rafting|fish|fishing|paddle|kayak|run|running|race|5k|10k|marathon|clean[- ]?up|stewardship|archery|birding|wildflower|trek)\b/.test(t)) return 'outdoors';
  if (/\b(concert|live music|music|band|dj|open mic|singer|songwriter|symphony|orchestra|acoustic|jam|film|screening|cinema|movie|gallery|exhibit|exhibition|art walk|artist|theatre|theater|\bplay\b|dance|ballet|opera|festival|fest|jazz|bluegrass|blues|comedy)\b/.test(t)) return 'arts';
  if (ARTS_SOURCES.test(String(e.source || ''))) return 'arts';
  return null;
}
const TOPIC_DEFS = [
  { key: 'arts',     group: 'Music & Arts',           label: 'More Music, Arts & Festivals' },
  { key: 'family',   group: 'Family & Kids',          label: 'More for Families & Kids' },
  { key: 'outdoors', group: 'Outdoors & Recreation',  label: 'More Outdoors & Recreation' },
];
// A topic section is included ONLY if its Event Topics group has ≥1 subscriber
// — a category nobody has opted into should never appear in the email (per user
// 2026-06-12). Returns a Set of group names with subscribers, or null if the
// Mailchimp API key is absent / the call fails (→ topic sections hidden, erring
// toward not showing an empty category). The key is only ever referenced as the
// shell var $MAILCHIMP_API_KEY so it can't leak into logs/error messages.
function getActiveTopicGroups() {
  const key = process.env.MAILCHIMP_API_KEY;
  if (!key || key.indexOf('-') < 0) { console.error('MAILCHIMP_API_KEY not set — topic sections hidden (cannot confirm subscribers).'); return null; }
  const dc = key.split('-')[1];
  const listId = 'f83dc56387';
  const curl = (p) => execSync(`curl -sS --max-time 25 -u "any:$MAILCHIMP_API_KEY" "https://${dc}.api.mailchimp.com/3.0/${p}"`, { encoding: 'utf8' });
  try {
    const cats = JSON.parse(curl(`lists/${listId}/interest-categories?count=100`));
    const cat = (cats.categories || []).find((c) => /event topics/i.test(c.title));
    if (!cat) { console.error('Event Topics category not found via Mailchimp — topic sections hidden.'); return new Set(); }
    const ints = JSON.parse(curl(`lists/${listId}/interest-categories/${cat.id}/interests?count=100`));
    const active = new Set();
    for (const it of (ints.interests || [])) if ((it.subscriber_count || 0) > 0) active.add(it.name);
    console.error('Active Event Topics (subscribers>0): ' + ([...active].join(', ') || 'none'));
    return active;
  } catch (e) { console.error('Mailchimp interest check failed — topic sections hidden.'); return null; }
}
// Topic sub-categories (Music & Arts / Family & Kids / Outdoors) are HIDDEN for
// now per user 2026-06-13 — all events live under "What We're Attending". Flip to
// true to re-enable the per-interest *|INTERESTED|* blocks (infrastructure kept).
const SHOW_TOPIC_SECTIONS = false;
const activeTopicGroups = SHOW_TOPIC_SECTIONS ? getActiveTopicGroups() : null;
const inChosen = new Set(chosen.map((e) => tkey(e.title)));
const topicSections = (SHOW_TOPIC_SECTIONS ? TOPIC_DEFS : []).map((td) => {
  const seen = new Set();
  const events = evts
    .filter((e) => eventCategory(e) === td.key && !inChosen.has(tkey(e.title)))
    .filter((e) => { const k = tkey(e.title); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (featuredScore(b) - featuredScore(a)) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 4);
  return { ...td, events };
}).filter((td) => td.events.length)
  .filter((td) => activeTopicGroups instanceof Set && activeTopicGroups.has(td.group));

// ── Collect meetings (with real agenda links) ──
const MEETING_FNS = ['getTellurideMeetings','getCountyCachedMeetings','getMVMeetings','getSchoolMeetings','getFireMeetings','getMedMeetings','getRidgwayMeetings','getNorwoodMeetings','getOphirMeetings','getSmartMeetings','getAirportMeetings','getRicoMeetings'];
const getMeetingSummary = G('getMeetingSummary');
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
const isWeak = (s) => !s || s.length < 32 || /agenda (tbd|not available|not yet|not posted)|hasn.t been posted|isn.t available|not available yet|no agenda|list of past meetings|meeting scheduled for|^regular meeting agenda/i.test(s);
const trunc = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n); const d = c.lastIndexOf('. '); return (d > n * 0.5 ? c.slice(0, d + 1) : c.replace(/\s\S*$/, '') + '…'); };
// The summary is limited to the four bodies whose decisions draw public
// comment: Town Council (Telluride + Mountain Village), the County Commissioners
// (BOCC), the Planning Commissions / P&Z boards, and HARC. Everything else
// (fire, general assemblies, transit, school, trustees, subcommittees) is dropped.
const KEEP_BODY = /\b(town council|board of county commissioners|bocc|planning commission|planning (and|&) zoning|p&z|historic (and|&) architectural|harc)\b/i;
const meetSeen = new Set(); const meetings = [];
for (const fn of MEETING_FNS) {
  const f = G(fn); if (typeof f !== 'function') continue;
  let arr = []; try { arr = f() || []; } catch (e) { continue; }
  for (const m of arr) {
    if (!m || !m.eventDate) continue;
    const _p = (n) => String(n).padStart(2, '0');
    const date = m.eventDate.getFullYear() + '-' + _p(m.eventDate.getMonth() + 1) + '-' + _p(m.eventDate.getDate());
    if (!inWeek(date)) continue;
    const name = (m.title || '').replace(/\s*--?\s*Special Meeting$/i, '').trim();
    const src = m.sourceLabel || m.source || '';
    if (!KEEP_BODY.test(name + ' ' + src)) continue;       // only TC / BOCC / PC / HARC
    const key = src + '|' + date + '|' + name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 24);
    if (meetSeen.has(key)) continue; meetSeen.add(key);
    let sm = ''; try { sm = (getMeetingSummary && getMeetingSummary(m)) || ''; } catch (e) {}
    sm = sm || m.description || '';
    if (isWeak(sm)) sm = bodyDesc(name, src);
    const agenda = m.agendaLink || (m.hasAgenda ? m.link : '') || '';
    meetings.push({ name, date, src, srcKey: m.source || '', summary: trunc(sm, 520), agenda, link: m.link || (SITE + '/gov-hub.html'), hasAgenda: !!agenda });
  }
}
meetings.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// ── "Actions You Can Take This Week" support. The Comment button opens the
// reader's mail client with the subject + a starter body pre-filled, addressed
// to each board's public-comment inbox. COMMENT_MAP + commentEmailFor() are
// ported verbatim from gov-hub.html's COMMENT_MAP / commentInfo() so the email
// uses the exact same recipients (and sub-type routing) as the website. Bodies
// the website has no recipient for (e.g. Ridgway) resolve to '' → the writer
// fills the To: line, same as on the site.
const COMMENT_MAP = {
  telluride:          'townclerk@telluride.gov',
  'telluride-harc':   'dcandelaria@telluride.gov',
  county:             'bocc@sanmiguelcountyco.gov',
  'county-planning':  'planningcommission@sanmiguelcountyco.gov',
  mv:                 'council@mtnvillage.org',
  'mv-planning':      'planning@mtnvillage.org',
  fire:               'pdasaro@telluridefire.com',
  med:                'wcrossland@tellmed.org',
  norwood:            'cross@norwoodtown.com',
  ophir:              'clerk@ophir.us',
  rico:               'townclerk@ricocolorado.gov',
  airport:            'info@tellurideairport.com',
  smrha:              'admin@smrha.org',
};
const commentEmailFor = (name, srcKey) => {
  const title = String(name || '').toLowerCase();
  let key = srcKey;
  if (key === 'county'    && /planning|design review/.test(title)) key = 'county-planning';
  if (key === 'mv'        && /planning|design review/.test(title)) key = 'mv-planning';
  if (key === 'telluride' && /harc|historic|architectural review/.test(title)) key = 'telluride-harc';
  return COMMENT_MAP[key] || '';
};
const boardName = (n, s) => (String(s).replace(/^town of /i, '') + ' ' + String(n).replace(/\s*meeting\s*$/i, ''))
  .replace(/\s+/g, ' ').trim().replace(/^(\w+)\s+\1\b/i, '$1');   // collapse "Ridgway Ridgway …"

// ── Render ──
const esc = (s) => String(s == null ? '' : s).replace(/&#0?39;/g, "'").replace(/[<>"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/&(?!amp;|lt;|gt;|quot;)/g, '&amp;');
const wd = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' });
const prettyDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
const commentMailto = (m) => { const board = boardName(m.name, m.src); const subject = `Re: the ${prettyDate(m.date)} ${board} meeting`; const body = `To the ${board},\n\nI'd like to share a comment on the ${prettyDate(m.date)} meeting:\n\n`; return `mailto:${encodeURIComponent(commentEmailFor(m.name, m.srcKey))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; };
const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : (SITE + '/events.html');
const mh = meetings.map((m) => {
  const link = m.hasAgenda ? `<a href="${esc(m.agenda)}" style="color:#2f7a5f;text-decoration:none;border-bottom:1px solid #2f7a5f;font-size:12.5px;font-weight:600;">View agenda →</a>` : `<a href="${esc(m.link)}" style="color:#2f7a5f;text-decoration:none;border-bottom:1px solid #2f7a5f;font-size:12.5px;font-weight:600;">Meeting info →</a>`;
  // Small "Comment" button → opens the reader's mail client to the board's
  // public-comment inbox (only shown when we have a recipient for that body).
  const commentBtn = commentEmailFor(m.name, m.srcKey)
    ? `<a href="${esc(commentMailto(m))}" style="display:inline-block;background:#2f7a5f;color:#fff;text-decoration:none;font-size:10.5px;font-weight:600;padding:3px 10px;border-radius:4px;vertical-align:middle;">Comment</a>`
    : '';
  const sep = commentBtn ? ' &nbsp;&nbsp; ' : '';
  // Comment button first, then the Meeting-info / View-agenda link.
  return `<tr><td style="padding:13px 0;border-top:1px solid #eef1ee;"><span style="display:inline-block;background:#21443c;color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;white-space:nowrap;">${esc(wd(m.date)).toUpperCase()}</span><span style="font-size:12px;color:#7a8a85;margin-left:8px;">${esc(m.src)}</span><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#1a2e29;margin-top:5px;">${esc(m.name)}</div><div style="font-size:13.5px;color:#5a6b64;line-height:1.55;margin:4px 0 6px;">${esc(m.summary)}</div>${commentBtn}${sep}${link}</td></tr>`;
}).join('');
const EV_ACCENT = '#a0531f'; // rust (toned down from the redder #a8401f) — complements the forest-green meeting badge
const evRow = (e) => {
  const u = safeUrl(e.href);
  const badge = `<span style="display:inline-block;background:${EV_ACCENT};color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;white-space:nowrap;">${esc(wd(e.date)).toUpperCase()}</span>`;
  const loc = e.location ? `<span style="font-size:12px;color:#7a8a85;margin-left:8px;">📍 ${esc(trunc(e.location, 38))}</span>` : '';
  const text = `${badge}${loc}`
    + `<div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#1a2e29;margin-top:5px;"><a href="${esc(u)}" style="color:#1a2e29;text-decoration:none;">${esc(e.title)}</a></div>`
    + `<div style="font-size:13.5px;color:#5a6b64;line-height:1.55;margin:4px 0 6px;">${esc(trunc(e.summary, 175))}</div>`
    + `<a href="${esc(u)}" style="color:${EV_ACCENT};text-decoration:none;border-bottom:1px solid ${EV_ACCENT};font-size:12.5px;font-weight:600;">Details →</a>`;
  const img = (e.img && /^https?:\/\//.test(e.img))
    ? `<td width="78" valign="top" style="padding-right:14px;"><img src="${esc(e.img)}" width="78" height="78" alt="" style="display:block;width:78px;height:78px;border-radius:6px;border:0;object-fit:cover;background:#eef1ee;"></td>`
    : '';
  return `<tr><td style="padding:13px 0;border-top:1px solid #eef1ee;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${img}<td valign="top">${text}</td></tr></table></td></tr>`;
};
const eh = chosen.map(evRow).join('');
// A single closing note in Rick's voice at the very end of the email: civic
// engagement is valuable in every form — weighing in on a meeting, or simply
// turning out for a concert or a gallery opening. Replaces the old per-meeting
// "Actions You Can Take This Week" button list. (COMMENT_MAP / commentMailto()
// recipient wiring above is left in place for possible reuse.)
const closingNote = `<tr><td style="padding:28px 34px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f1ece1;border-left:4px solid #21443c;border-radius:6px;padding:19px 22px;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;margin-bottom:9px;">Why Showing Up Matters</div><p style="margin:0;font-size:14.5px;line-height:1.7;color:#2c3b35;">The decisions shaping this valley rarely arrive with a drumroll — they get made while most people are looking the other way. The fix is simple: keep showing up. Read an agenda and email the board before a vote, or just turn out for a council meeting, a concert on the green, or an opening at the gallery. None of it is too small. A community that keeps paying attention to itself, in the big ways and the little ones, is one that stays livable.</p></td></tr></table></td></tr>`;

// One-off "What We're Reading" box — gated to a single week's WEEK_START so it
// auto-disappears the following week (no manual cleanup). To feature a different
// article another week, set WHATS_READING for that week's Monday date; leave it
// null otherwise.
const WHATS_READING = (WEEK_START === '2026-06-15') ? {
  url: 'https://coloradosun.com/2026/06/13/opinion-stripped-for-parts-documentary/',
  title: 'When communities lose their newspapers, they lose more than news',
  source: 'The Colorado Sun · Essay by John Barry',
  blurb: 'This essay names exactly why Livable Telluride exists. When local newspapers are hollowed out, often deliberately, by hedge funds chasing profit, a community loses far more than headlines: it loses the shared facts, the accountability, and the civic infrastructure that democracy runs on. His prescription, that local journalism deserves the same public and philanthropic support we give schools and libraries, is the very idea behind this donor-funded nonprofit.',
} : null;
const whatsReadingBox = WHATS_READING ? `<tr><td style="padding:26px 34px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f1ece1;border-left:4px solid #a0531f;border-radius:6px;padding:19px 22px;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;margin-bottom:9px;">→ What We're Reading</div><div style="font-family:Georgia,serif;font-size:16px;font-weight:700;color:#1a2e29;line-height:1.3;"><a href="${WHATS_READING.url}" style="color:#1a2e29;text-decoration:none;">${esc(WHATS_READING.title)}</a></div><div style="font-size:12px;color:#7a8a85;margin:3px 0 9px;">${esc(WHATS_READING.source)}</div><p style="margin:0;font-size:14px;line-height:1.65;color:#2c3b35;">${esc(WHATS_READING.blurb)}</p><a href="${WHATS_READING.url}" style="display:inline-block;margin-top:10px;color:#a0531f;text-decoration:none;border-bottom:1px solid #a0531f;font-size:12.5px;font-weight:600;">Read it →</a></td></tr></table></td></tr>` : '';
const section = (label, rows) => rows ? `<tr><td style="padding:24px 34px 0;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;border-bottom:1px solid #d4c9b0;padding-bottom:8px;">→ ${label}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : '';
// Conditional per-interest extras — each block renders only for subscribers in
// that Mailchimp "Event Topics" group. The *|INTERESTED|* tags are raw (NOT
// html-escaped) so Mailchimp matches the literal group name including its "&".
const topicHtml = topicSections.map((td) =>
  `\n  *|INTERESTED:Event Topics:${td.group}|*` + section(td.label, td.events.map(evRow).join('')) + `*|END:INTERESTED|*`
).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f0ece3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0ece3;"><tr><td align="center" style="padding:24px 10px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fdfbf6;border-radius:6px;overflow:hidden;">
  <tr><td style="background:#21443c;padding:26px 34px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle" style="vertical-align:middle;">
        <div style="font-family:Georgia,serif;font-size:11px;color:#b58a2c;letter-spacing:.18em;text-transform:uppercase;">Livable Telluride · Weekly Update</div>
        <div style="font-family:Georgia,serif;font-size:25px;font-weight:700;color:#fff;margin-top:4px;">The Week Ahead</div>
        <div style="font-family:Georgia,serif;font-size:14px;color:#a8c4b8;margin-top:3px;">${esc(LABEL)}</div>
      </td>
      <td width="74" valign="middle" align="right" style="vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr><td style="background:#ffffff;border-radius:8px;padding:5px;">
          <img src="https://livabletelluride.org/logo/Livable%20Telluride%20Logo.png" width="58" height="58" alt="Livable Telluride" style="display:block;width:58px;height:58px;border:0;">
        </td></tr></table>
      </td>
    </tr></table></td></tr>
  <tr><td style="padding:22px 34px 4px;">
    <span style="display:inline-block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#2f7a5f;background:rgba(47,122,95,.1);padding:3px 10px;border-radius:999px;">📅 The Week Ahead</span>
    <p style="margin:11px 0 0;font-size:15.5px;line-height:1.65;color:#2c3b35;">${esc(LEDE)}</p></td></tr>
  ${section('Public Meetings This Week', mh)}
  ${section('What We\'re Attending', eh)}${topicHtml}
  ${whatsReadingBox}
  ${closingNote}
  <tr><td style="padding:24px 34px 30px;border-top:1px solid #ddd6c8;">
    <div style="font-family:Georgia,serif;font-size:13px;font-weight:700;color:#21443c;">Livable Telluride</div>
    <div style="font-size:12px;color:#7a8a85;line-height:1.6;margin-top:4px;">Community information for Telluride, Mountain Village &amp; San Miguel County.<br>
    <a href="https://livabletelluride.org" style="color:#7a8a85;">livabletelluride.org</a> &nbsp;·&nbsp; <a href="*|UNSUB|*" style="color:#7a8a85;">Unsubscribe</a> &nbsp;·&nbsp; <a href="https://livabletelluride.org/profile.html?email=*|EMAIL|*&amp;fname=*|FNAME|*&amp;town=*|MMERGE6|*" style="color:#7a8a85;">Update preferences</a></div></td></tr>
</table></td></tr></table></body></html>`;

// In preview mode, render an info@ review copy: a banner at the top, every topic
// section shown inline (subscribers only see the ones they opted into), and the
// Mailchimp merge tags neutralised so the footer/links aren't left broken.
let out = html;
if (PREVIEW) {
  const banner = `  <tr><td style="background:#a8401f;padding:13px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#fff;line-height:1.5;">REVIEW DRAFT — the upcoming weekly email. Look it over, then send the saved copy through Mailchimp. The topic sections below show in full here; each subscriber only sees the ones they opted into.<br><span style="font-weight:400;">To change the intro, just reply to this email with the new text (week-key ${WEEK_START}).</span></td></tr>\n`;
  out = out.replace('  <tr><td style="background:#21443c;padding:26px 34px;">', banner + '  <tr><td style="background:#21443c;padding:26px 34px;">')
           .replace(/\*\|INTERESTED:[^|]*\|\*/g, '').replace(/\*\|END:INTERESTED\|\*/g, '')
           .replace(/\*\|UNSUB\|\*/g, '#').replace(/\*\|[A-Z0-9_]+\|\*/g, '');
}
fs.writeFileSync(OUT, out);
const SUBJECT = `The Week Ahead — ${LABEL}`;
console.log('SUBJECT=' + SUBJECT);
console.log(`weekly-email: ${meetings.length} meetings (${meetings.filter(m=>m.hasAgenda).length} w/ agenda links), ${chosen.length} events → ${OUT}${PREVIEW ? ' [preview]' : ''}`);
console.log(`  conditional topic blocks: ${topicSections.map(t=>`${t.group} (${t.events.length})`).join(', ') || 'none this week'}`);
