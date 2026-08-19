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
const { stripDescPreamble } = require('./lib/clean-text.js');
const { generateRickLede } = require('./lib/rick-lede.js');
const { meetingDisplayName } = require('./lib/meeting-title.js');
const GD = process.argv[2], GH = process.argv[3];
const WEEK_START = process.argv[4] || new Date().toISOString().slice(0, 10);
const LABEL = process.argv[5] || 'This Week';
const OUT = process.argv[6] || 'weekly-email.html';
const PREVIEW = !!process.env.WEEKLY_PREVIEW;   // render an info@ review draft (banner + topic sections shown inline, merge tags neutralised) instead of the paste-ready Mailchimp HTML
// WEEKEND mode (WEEKEND=1): render the Friday "Weekend Ahead" events email
// instead of the Monday "Week Ahead". Same data/render machinery, but a shorter
// 3-day window (Fri–Sun; Thursday excluded), NO meetings section, and a curated best-of-the-weekend
// events list (top events by featuredScore, not one-per-day). WEEK_START is the
// Thursday the email covers. Everything below is unchanged for the weekly path.
const WEEKEND = !!process.env.WEEKEND;
const WINDOW_DAYS = WEEKEND ? 3 : 7;   // weekend email covers Fri–Sun (sent Friday)
const EMAIL_TITLE = WEEKEND ? 'The Weekend Ahead Outlook' : 'The Week Ahead Outlook';
const KICKER = WEEKEND ? 'Livable Telluride · Weekend Ahead Outlook' : 'Livable Telluride · Weekly Update';
const EVENTS_HEADING = WEEKEND ? 'Good Events This Weekend' : 'What to Attend';

// ── Week Ahead lede — edit data/week-ahead-lede.json (no code change needed).
// That file is a map keyed by week-start (the Monday the email covers,
// YYYY-MM-DD), with a "default" fallback. WEEK_START is computed by the Saturday
// workflow. If the file is missing/unreadable, fall back to a built-in string.
const FALLBACK_LEDE = WEEKEND
  ? "A few of the best things happening around the box canyon this weekend — pick one and get out there."
  : "A fresh week across the box canyon — public meetings, community events, and a few ways to get involved are all below.";
// Precedence (resolved below): a HUMAN-pinned dated entry in the lede JSON
// always wins; otherwise the intro DEFAULTS to a fresh Rick-voice summary of
// this window's real events (generated in the async block near the end, once
// the events/meetings are assembled); the generic "default"/FALLBACK strings
// are only a last resort for when there's no API key or generation fails.
let LEDE = FALLBACK_LEDE;
let LEDE_IS_OVERRIDE = false;   // a person deliberately set the intro for this date
try {
  const ledeFile = WEEKEND ? 'weekend-ahead-lede.json' : 'week-ahead-lede.json';
  const ledeMap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', ledeFile), 'utf8'));
  if (ledeMap[WEEK_START]) { LEDE = ledeMap[WEEK_START]; LEDE_IS_OVERRIDE = true; }
  else { LEDE = ledeMap.default || FALLBACK_LEDE; }
} catch (e) { console.error('lede json not read (' + e.message + ') — using fallback lede'); }

// Window [WEEK_START, WEEK_START + WINDOW_DAYS-1]: 7 days for the weekly,
// 4 days (Thu–Sun) for the weekend email.
const startD = new Date(WEEK_START + 'T00:00:00');
const days = []; for (let i = 0; i < WINDOW_DAYS; i++) { const d = new Date(startD); d.setDate(d.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
const dEnd = days[days.length - 1];
const inWeek = (iso) => iso >= days[0] && iso <= dEnd;

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
// The marquee festivals (user 2026-06-15) get a featured hero at the top of the
// events instead of competing as a one-per-day pick. Matched by name against
// TELLURIDE_FESTIVALS; an event whose title matches is pulled OUT of the daily
// picks so it doesn't double up with the hero.
const MAJOR_FEST_RE = /mountainfilm|bluegrass|yoga festival|jazz festival|mushroom festival|telluride film festival|autumn classic|original thinkers|horror show/i;

// Image fallbacks: some sources publish no photo (e.g. Norwood's town calendar),
// which leaves a text-only card next to ones with images. When an event has no
// image, the first matching entry here supplies one. Use freely-licensed /
// public-domain art we host ourselves so it never breaks or carries usage
// strings. (Norwood "Star Spangled Saturday Parade" → a public-domain c.1886
// small-town July 4th parade painting, Howland, hosted at /img/email/.)
const SITE_URL = 'https://livabletelluride.org';
// Specific, hand-picked title fallbacks — checked FIRST, so a named match here
// beats the generic category classifier below.
const IMG_FALLBACKS = [
  { match: /star.?spangled.*parade|\bnorwood\b[^.]*\bparade\b/i, img: SITE_URL + '/img/email/fourth-of-july-parade.jpg' },
  { match: /randy houser/i, img: SITE_URL + '/assets/digest/randy-houser.png' },   // source photo is a .webp (breaks in email)
];
// Category classifier — every EVENT card carries a photo. When a source has no
// usable image and no specific fallback matches, classify by keyword and use a
// representative, freely-licensed (CC0 / public-domain) photo we host ourselves
// under /assets/digest/fallbacks/<slug>.jpg (400x400, email-safe JPG). Ordered
// most-specific first; first match wins; the community-N rotation
// catches anything unmatched. To expand: add a {match, slug} row and commit the
// matching assets/digest/fallbacks/<slug>.jpg. (Meetings intentionally excluded.)
const FB = (slug) => SITE_URL + '/assets/digest/fallbacks/' + slug + '.jpg';
const CATEGORY_FALLBACKS = [
  // Morgan's local stock photos (added 2026-07-22) — before the broader
  // categories they'd otherwise fall into. Keep in sync with
  // build-events-index.js CATEGORY_FALLBACKS.
  { match: /farmers'? market/i,                                                         slug: 'farmersmarket' },
  { match: /\btennis\b|pickleball/i,                                                    slug: 'tennis' },
  { match: /\bhockey\b|ice.?skat/i,                                                     slug: 'hockey' },
  { match: /\bvot(?:e|ing|ers?)\b|election|ballot/i,                                    slug: 'voting' },
  { match: /\bbaseball\b|softball|little league|t-?ball/i,                              slug: 'baseball' },
  { match: /\bfilm\b|\bmovie\b|cinema|screening|documentary/i,                          slug: 'film' },
  { match: /\bhike\b|hiking|\btrail\b|\btrek\b|summit|wildflower|nature walk|backpack/i, slug: 'hiking' },
  { match: /\bbike\b|bicycle|cycling|mountain bike|\bMTB\b|gran fondo|pedal/i,           slug: 'cycling' },
  { match: /gallery|exhibit|\bart\b|painting|sculpture|\bartist\b|open studio|mural/i,   slug: 'art' },
  { match: /theat(?:er|re)|\bplay\b|improv|musical|opera|cabaret|\bdrama\b/i,            slug: 'theater' },
  { match: /farmers market|\bfood\b|dinner|brunch|tasting|brewery|\bbeer\b|\bwine\b|chef|culinary|bbq|barbecue|potluck|harvest/i, slug: 'food' },
  { match: /\bkids?\b|\bfamily\b|children|story ?time|\byouth\b|playgroup|toddler|puppet/i, slug: 'family' },
  { match: /\byoga\b|meditation|wellness|pilates|breathwork|sound bath|tai chi|qigong/i, slug: 'wellness' },
  { match: /lecture|\btalk\b|\bauthor\b|\breading\b|\bpanel\b|workshop|seminar|science|discussion|presentation|\bforum\b|book club|training|\bclinic\b|registration|\bclass\b|info session/i, slug: 'talk' },
  { match: /festival|parade|celebration|\bfair\b|fireworks|\bgala\b|jubilee/i,           slug: 'festival' },
  { match: /concert|live music|\bband\b|reggae|bluegrass|\bjazz\b|acoustic|singer|songwriter|music on the green|music on the mesa|chamber music|\bDJ\b|dance party|\bdance\b/i, slug: 'livemusic' },
];
// Catch-all "community" events rotate through licensed/owned regional photos
// (1-6 Adobe Stock Enhanced license, 7-10 Morgan's own town photos — see
// assets/digest/fallbacks/SOURCES.json), deterministic by title hash so an
// event keeps its photo across sends. Same scheme as build-events-index.js —
// keep the two in sync (incl. ROTATING_SLUGS).
const ROTATING_SLUGS = { farmersmarket: 3, tennis: 3, voting: 3 };
const titleHash = (title) => {
  let h = 0;
  const s = String(title || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
// PERMANENT RULE (Morgan 2026-07-23): Telluride photos back TELLURIDE events
// ONLY. Pools mirror build-events-index.js COMMUNITY_POOLS — keep in sync.
// (1-3,6 Adobe Telluride; 7-10 Morgan's town photos; 4 Ouray; 5 generic
// San Juans, safe for any town.) townHint = whatever location/town text the
// event carries; anything not clearly Telluride gets the conservative pool.
const COMMUNITY_POOLS = { telluride: [1, 2, 3, 5, 6, 7, 8, 9, 10], ouray: [4, 5], generic: [5] };
const communityImg = (title, townHint) => {
  const h = String(townHint || '');
  const pool = /mountain\s+village/i.test(h) ? COMMUNITY_POOLS.generic
    : /telluride/i.test(h) ? COMMUNITY_POOLS.telluride
    : /\b(ouray|ridgway)\b/i.test(h) ? COMMUNITY_POOLS.ouray
    : COMMUNITY_POOLS.generic;
  return FB('community-' + pool[titleHash(title) % pool.length]);
};
// Same fallback priority as build-events-index.js fallbackImg — keep in sync:
// Town Park venue → hand-pinned IMG_FALLBACKS → category (youth tennis = kids
// photo) → Mountain Village town default → generic community pool.
const imgFallback = (title, townHint) => {
  const t = title || '';
  const h = String(townHint || '');
  if (/\btown park\b/i.test(h) && !/mountain\s+village/i.test(h)) return FB('townpark');
  for (const f of IMG_FALLBACKS) if (f.match.test(t)) return f.img;
  for (const c of CATEGORY_FALLBACKS) if (c.match.test(t)) {
    if (c.slug === 'tennis' && /\byouth\b|\bkids?\b|\bjunior\b|\bchild/i.test(t)) return FB('tennis-3');
    const n = ROTATING_SLUGS[c.slug];
    return n ? FB(c.slug + '-' + ((titleHash(t) % n) + 1)) : FB(c.slug);
  }
  if (/mountain\s+village/i.test(h)) return FB('mountainvillage');
  return communityImg(t, townHint);
};
// Resolve an event image for EMAIL via the SHARED resolver in gov-helpers.js, so
// the events page and the email agree on which image an event gets. Email needs
// ABSOLUTE URLs and can read the repo, so we pass the origin + an existence
// check: a committed relative band photo → an absolute URL; a Music on the Green
// concert with no band photo → the series poster; anything else → a title-based
// fallback (e.g. the July 4th parade).
const resolveEventImage = G('resolveEventImage');
// .webp images silently fail in many email clients (Outlook, older iOS Mail),
// showing a broken-image box — so treat a .webp source as if there were no
// image, letting IMG_FALLBACKS / a hosted photo take over instead.
const emailUsableImg = (u) => /^https?:\/\//.test(u || '') && !/\.webp(\?|#|$)/i.test(u);
const resolveEmailImg = (e) => {
  if (typeof resolveEventImage === 'function') {
    const r = resolveEventImage(e, { origin: SITE_URL, exists: (p) => fs.existsSync('.' + p) });
    const primary = emailUsableImg(r.primary) ? r.primary : '';
    return primary || (emailUsableImg(r.fallback) ? r.fallback : '') || imgFallback(e.title, [e.town, e.location].filter(Boolean).join(' '));
  }
  const raw = e.img || e.imageUrl || '';   // graceful degrade if the shared helper is absent
  if (emailUsableImg(raw)) return raw;
  if (/^\/img\//.test(raw) && fs.existsSync('.' + raw)) return SITE_URL + raw;
  return imgFallback(e.title, [e.town, e.location].filter(Boolean).join(' '));
};

// ── Collect events from the source arrays ──
const EVENT_ARRAYS = ['WILKINSON_EVENTS','SHERIDAN_EVENTS','ALIBI_EVENTS','SHERBINO_EVENTS','NUCLA_NATURITA_EVENTS','CLUB_RED_SHOWS','FRESH_FOOD_HUB_EVENTS','COMMUNITY_EVENTS','MUSIC_ON_THE_GREEN','TELLURIDE_FARMERS_MARKET','BEACON_EVENTS','CHAMBER_MUSIC_EVENTS','TELLURIDE_SCIENCE_EVENTS','TELLURIDE_FOUNDATION_EVENTS','TELLURIDE_VENTURE_EVENTS','OURAY_COUNTY_EVENTS','NORWOOD_EVENTS','MOUNTAIN_VILLAGE_EVENTS','TELLURIDE_COM_EVENTS','KOTO_COMMUNITY_EVENTS','OURAY_RIDGWAY_EVENTS','SHERIDAN_OPERA_EVENTS'];
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
    if (/(^|:\s*)(postponed|cancell?ed)\b/i.test(e.title)) continue;   // don't feature a postponed/canceled event
    if (MAJOR_FEST_RE.test(e.title)) continue;           // marquee festivals → featured hero, not daily picks
    evts.push({
      title: e.title, date,
      href: e.link || e.href || e.url || '',
      summary: stripDescPreamble((e.summary || e.copy || e.description || '').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\*+/g, '').replace(/[\\|]/g, ' ').replace(/\s+/g, ' ').trim()),
      time: e.time || '', location: e.location || '', img: resolveEmailImg(e),
      isFestival: !!e.isFestival, source: e.sourceLabel || e.source || name,
    });
  }
}
// One per day: top featuredScore (tie → earlier start). Skip days with nothing.
const byDay = {};
for (const e of evts) { (byDay[e.date] = byDay[e.date] || []).push(e); }
let chosen = []; const usedTitles = new Set();
// Cross-day dedup key: alphabetise the distinctive 4+-char tokens of the title
// after dropping common stopwords. This is intentionally fuzzy so the same
// event listed under varying titles across sources collapses to one card.
// Concrete case: Telluride Theatre's Muleskinner's Ball is published by
// Sheridan Opera House as "Telluride Theatre Muleskinner's Ball Fundraiser"
// (correct Jun 27) and by Mountain Village's calendar as "The Muleskinner's
// Ball (GALA Fundraiser for Telluride Theatre)" with a wrong Jun 28 date —
// the old first-28-chars key let both render as separate days. Stripping
// stopwords + sorting tokens makes the two titles produce the same key, so
// only the first-day pick survives.
const TKEY_STOPWORDS = new Set(['gala','fundraiser','presents','featuring','annual','event','show','live','from','with','this']);
const tkey = (t) => {
  const cleaned = String(t || '')
    // "<show> With Special Guest <name>" is the SAME show as "<show>" — a common
    // cross-source title variant (e.g. KOTO vs telluride.com both list the Randy
    // Houser concert). Drop the tail so the two collapse to one card.
    .replace(/\bwith special guests?\b.*/i, '')
    // Aggregators append the venue to a title the venue itself lists bare:
    // "DARRELL SCOTT - Live at The Sherbino" (Ouray Ridgway) vs "DARRELL SCOTT"
    // (Sherbino Theater).
    .replace(/\blive at\b.*/i, '')
    // Apostrophes are deleted, not tokenised across. The token pass keeps words
    // of 4+ letters, so "Farmer's" produced "farmer" plus a discarded "s" and
    // never matched "Farmers" — which is how the Ridgway and Telluride farmers
    // markets each went out twice. Same fix as build-events-index.js normTitle.
    .replace(/['\u2018\u2019\u02bc`]/g, '')
    .toLowerCase();
  const tokens = (cleaned.match(/[a-z]+/g) || [])
    .filter(w => w.length >= 4 && !TKEY_STOPWORDS.has(w));
  return tokens.sort().join('-');
};
// Hand-pinned features: force a specific event as a given day's "What to Attend"
// pick, overriding the featuredScore auto-pick. Matched by title regex against
// that day's events; optional `link` replaces the event's URL with the canonical
// page. Pinning lives HERE (not in the event data) because the event arrays are
// bot-refreshed every 6h. Drop an entry once its date has passed.
const FEATURED_OVERRIDES = {
  '2026-07-04': { match: /rundola/i, link: 'https://telluridefoundation.org/rundola/' },  // Telluride Foundation Rundola — Run for Good
};

// The Weekend edition prefers events NOT already in the prior mailing(s): it
// sends Thursday, a few days after the Monday "Week Ahead" (which covers the
// same weekend), so a straight best-of would just replay Monday's picks. We
// read the last couple of sent broadcasts' archived HTML, collect their event
// links, and rank matching events AFTER the fresh ones — they still fill in if
// nothing fresher is worthy. Best-effort: no archive (e.g. a local /tmp run) →
// no preference applied.
const normHref = (u) => String(u || '').toLowerCase().trim().split('#')[0].split('?')[0].replace(/\/+$/, '');
function recentlyMailedHrefs() {
  const out = new Set();
  try {
    const rec = JSON.parse(fs.readFileSync('data/sent-broadcasts.json', 'utf8'));
    for (const r of rec.slice(-2)) {                              // prior Week Ahead + prior Weekend
      const m = String(r.href || '').match(/digest\/archive\/[^"'#?]+\.html/);
      if (!m || !fs.existsSync(m[0])) continue;
      const html = fs.readFileSync(m[0], 'utf8');
      for (const mm of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
        const h = normHref(mm[1].replace(/&amp;/g, '&'));
        if (/livabletelluride\.org|buy\.stripe\.com|list-manage\.com/.test(h)) continue;  // site chrome, not events
        out.add(h);
      }
    }
  } catch (e) { /* best-effort — leave the set empty */ }
  return out;
}

if (WEEKEND) {
  const MAILED = recentlyMailedHrefs();
  const wasMailed = (e) => MAILED.size > 0 && MAILED.has(normHref(e.href || e.link || e.url || ''));
  // Weekend Outlook: a curated "best of the weekend" list across the Fri–Sun
  // window. Two goals: quality (rank by featuredScore; drop the penalized
  // drop-in/class/clinic items) and GEOGRAPHIC SPREAD — a regional roundup
  // shouldn't be a dozen Telluride events. So we fill town-diverse first (≤2
  // per town, by score, which guarantees the smaller towns' happenings — e.g.
  // a Norwood or Ouray 4th-of-July event — surface), then top up to the cap
  // allowing event-rich towns more.
  const CAP = 12;
  // Lightweight town bucket for diversity only (display still uses townLabel).
  // Prefer location/title; the OURAY_RIDGWAY source name carries both towns, so
  // never infer town from it — fall through to the per-source names below.
  const evTown = (e) => {
    const lt = ((e.location || '') + ' ' + (e.title || '')).toLowerCase();
    if (/mountain village/.test(lt)) return 'mountain village';
    if (/norwood/.test(lt)) return 'norwood';
    if (/ridgway/.test(lt)) return 'ridgway';
    if (/ouray/.test(lt)) return 'ouray';
    if (/nucla|naturita/.test(lt)) return 'nucla';
    if (/\brico\b/.test(lt)) return 'rico';
    if (/ophir/.test(lt)) return 'ophir';
    if (/telluride/.test(lt)) return 'telluride';
    const src = (e.source || '').toLowerCase();
    if (/mountain village/.test(src)) return 'mountain village';
    if (/norwood/.test(src)) return 'norwood';
    if (/telluride/.test(src)) return 'telluride';
    return 'other';
  };
  // Always-include "pins": marquee Telluride 4th-of-July happenings readers
  // expect — the Parade and the Rundola — guaranteed in regardless of the
  // per-town diversity cap. The best-scored (usually photo-bearing) match for
  // each is taken; the fill then skips ALL pin-matching events so a second
  // parade/rundola feed can't double up. Dormant outside early July (no match).
  const PINS = [
    /\btelluride\b.*\bparade\b|telluride.*(?:fourth|4th|july).*parade/i,
    /\brundola\b/i,
  ];
  const isPinned = (e) => PINS.some((re) => re.test(e.title || ''));
  const seen = new Set();
  const uniq = evts
    .filter((e) => inWeek(e.date) && featuredScore(e) >= 0)   // drop penalized classes/clinics
    .filter((e) => { const k = tkey(e.title); if (seen.has(k)) return false; seen.add(k); return true; })
    // Fresh (not in the prior mailing) events first — ranked by score among
    // themselves — then the already-mailed ones as fill (also by score).
    .sort((a, b) =>
      (wasMailed(a) - wasMailed(b)) ||
      (featuredScore(b) - featuredScore(a)) ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const re of PINS) { const hit = uniq.find((e) => re.test(e.title) && !chosen.includes(e)); if (hit) chosen.push(hit); }
  const fillToCap = (maxPerTown) => {
    const perTown = {}; chosen.forEach((e) => { const t = evTown(e); perTown[t] = (perTown[t] || 0) + 1; });
    for (const e of uniq) {
      if (chosen.includes(e) || isPinned(e)) continue;   // pinned events (and their near-dupes) already represented
      const t = evTown(e); if ((perTown[t] || 0) >= maxPerTown) continue;
      perTown[t] = (perTown[t] || 0) + 1; chosen.push(e);
      if (chosen.length >= CAP) return;
    }
  };
  fillToCap(2);   // pass 1: ≤2 per town → smaller towns' events surface
  fillToCap(5);   // pass 2: top up to the cap, allowing event-rich towns more
  chosen.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || ((featuredStartHour(a.time) || 99) - (featuredStartHour(b.time) || 99)));
} else {
  for (const day of days) {
    const list = (byDay[day] || []).sort((a, b) => (featuredScore(b) - featuredScore(a)) || ((featuredStartHour(a.time) || 99) - (featuredStartHour(b.time) || 99)));
    // One DISTINCT event per day: skip an event whose title already ran earlier
    // this week (e.g. a multi-day festival) and take the next-best instead.
    const ov = FEATURED_OVERRIDES[day];
    let pick = ov ? list.find((e) => ov.match.test(e.title) && !usedTitles.has(tkey(e.title))) : null;
    if (pick && ov.link) pick = Object.assign({}, pick, { href: ov.link });
    if (!pick) pick = list.find((e) => !usedTitles.has(tkey(e.title))) || list[0];
    if (pick) { chosen.push(pick); usedTitles.add(tkey(pick.title)); }
  }
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
const MEETING_FNS = ['getTellurideMeetings','getCountyCachedMeetings','getMVMeetings','getSchoolMeetings','getFireMeetings','getMedMeetings','getRidgwayMeetings','getNorwoodMeetings','getOphirMeetings','getSmartMeetings','getAirportMeetings','getRicoMeetings','getOurayMeetings'];
const getMeetingSummary = G('getMeetingSummary');

// ── "Why This Matters" highlighting (ported from gov-hub.html) ──
// The Gov-Hub government page highlights any meeting whose title/summary
// matches a WHY_THIS_MATTERS entry — a tracked code amendment or high-level
// land-use issue (Carhenge, Society Turn, Shandoka, Comp Plan, wildfire code,
// etc.) — with a green-bordered card and a "Why This Matters" callout that
// links out to the relevant Deep Dive. We mirror that exact treatment here so
// the Week Ahead email flags the same consequential meetings the same way.
const WHY_THIS_MATTERS = G('WHY_THIS_MATTERS') || [];
function getWTMEntry(text) {
  for (const entry of WHY_THIS_MATTERS) {
    if (entry && entry.match && entry.match.test(text)) return entry;
  }
  return null;
}
// Map a WHY_THIS_MATTERS entry to its Deep Dive page — ported verbatim from
// gov-hub.html deepDiveFor() so the email points at the same context + docs.
function deepDiveFor(entry) {
  const src = (entry && entry.match && entry.match.source || '').toLowerCase();
  if (/carhenge|shandoka|chair\s*7/.test(src))                 return SITE + '/deep-dive-carhenge.html';
  if (/society|jensen|healthcare|facility|hospital/.test(src)) return SITE + '/deep-dive-society.html';
  if (/accelerated|comprehensive|forestry/.test(src))          return SITE + '/deep-dive-code.html';
  if (/wildfire|wui/.test(src))                                return SITE + '/deep-dive-wildfire.html';
  if (/gondola|smart/.test(src))                               return SITE + '/deep-dive-gondola.html';
  if (/lucarelli|aldasoro|diamond/.test(src))                  return SITE + '/deep-dive-diamond.html';
  return null;
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
const isWeak = (s) => !s || s.length < 32 || /agenda (tbd|not available|not yet|not posted)|hasn.t been posted|isn.t available|not available yet|no agenda|list of past meetings|meeting scheduled for|^regular meeting agenda/i.test(s);
// URLs that are an agenda *index*, not an agenda: CivicPlus AgendaCenter, a
// bare /agendas or /meetings path, a portal meeting list. See the agenda
// resolution in the meeting-collect loop below.
const GENERIC_AGENDA_PAGE = /agenda-?center|agendaminutes|meeting-?list|\/(agendas?|meetings?|agendas-and-minutes)\/?(?:[?#].*)?$/i;
// True when a URL can't be a specific agenda. Also catches a bare portal root
// (e.g. "https://sanmiguelcoco.portal.civicclerk.com" with no event path),
// which the county source emits for meetings whose packet isn't out yet.
function isGenericAgendaUrl(u) {
  if (!u) return true;
  try {
    const p = new URL(u);
    if (!p.search && (p.pathname === '' || p.pathname === '/')) return true;
  } catch (e) { /* not absolute — fall through to the pattern test */ }
  return GENERIC_AGENDA_PAGE.test(u);
}
// A URL that is the agenda DOCUMENT itself (a PDF, a portal file route), as
// opposed to a meeting page that may or may not have a packet attached.
const AGENDA_DOC_URL = /\.(?:pdf|docx?)(?:[?#]|$)|\/(?:files?|documents?|assets)\//i;
// Truncate without ever ending mid-sentence. Prefer cutting at a sentence
// boundary; otherwise drop the dangling (often source-truncated) last word and
// mark continuation with an ellipsis. This also cleans up source descriptions
// that arrive already cut mid-thought (e.g. "… featuring The North").
const sentenceEnd = (str) => Math.max(str.lastIndexOf('. '), str.lastIndexOf('! '), str.lastIndexOf('? '));
const trunc = (s, n) => {
  // Drop a source-supplied trailing truncation marker ("…" or "..") so it can't
  // masquerade as a real sentence end and leave a cut word like "the mus...".
  s = String(s || '').replace(/\s+/g, ' ').trim().replace(/\s*(?:\.{2,}|…)+$/, '').trim();
  // Fits entirely — return as-is. The sentence-boundary/ellipsis backoff below
  // is ONLY for strings we actually cut; running it on a complete string clipped
  // its last word and appended "…" (e.g. venue labels: "Sheridan Opera House" →
  // "Sheridan Opera…", town "Telluride" → "Telluride…").
  if (s.length <= n) return s;
  let out = s;
  if (s.length > n) {
    const w = s.slice(0, n);
    const end = sentenceEnd(w);
    if (end >= n * 0.5) return w.slice(0, end + 1).trim();   // clean full-sentence cut
    out = w.replace(/\s+\S*$/, '');                          // drop the partial last word
  }
  // If we'd end mid-sentence (no terminal punctuation), back off to the last
  // complete sentence; if there isn't one, drop the dangling word and add "…".
  if (!/[.!?…]$/.test(out)) {
    const end = sentenceEnd(out);
    if (end >= out.length * 0.5) out = out.slice(0, end + 1).trim();
    else out = out.replace(/\s+\S*$/, '').replace(/[,;:]+$/, '') + '…';
  }
  return out;
};
// EVERY government meeting from every source in MEETING_FNS is included — there is
// no body-type filter. (Until 2026-07-19 the section was limited to Town Council /
// BOCC / P&Z / HARC + small-town boards, dropping fire, housing authority, school,
// transit, airport, and other boards; that exclusion was removed so all public
// boards show.) Specific one-off meetings can still be hidden via MEETING_EXCLUDE.
// Specific, dated meetings to omit from the digest entirely — e.g. a special
// meeting whose posted agenda has nothing of broad public interest. Kept
// surgical on purpose: matched on source + EXACT date + a title regex, so it
// drops one meeting instance without suppressing future meetings of that body.
// Add one entry per meeting to hide; entries naturally go stale once the date
// passes out of the window.
const MEETING_EXCLUDE = [
  { source: 'county', date: '2026-07-22', title: /board of county commissioners/i },  // Special Meeting — agenda posted but nothing of broad public interest
];
const isExcludedMeeting = (source, date, title) =>
  MEETING_EXCLUDE.some((x) => x.source === (source || '').toLowerCase() && x.date === date && x.title.test(title || ''));
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
    if (isExcludedMeeting(m.source, date, m.title || name)) continue;   // specific dated meetings hidden from the digest (see MEETING_EXCLUDE)
    // Dedup key: alphabetise the title's word tokens before joining so word-order
    // anagrams collapse to the same key. Joint meetings show up in CivicWeb
    // under each commission's roster (e.g. "Special Meeting - HARC and P&Z" and
    // "Special Meeting - P&Z and HARC"); without the sort, the earlier
    // first-24-chars key let both render as separate cards.
    const titleTokens = (name.toLowerCase().match(/[a-z]+/g) || []).sort().join('');
    const key = src + '|' + date + '|' + titleTokens.slice(0, 32);
    if (meetSeen.has(key)) continue; meetSeen.add(key);
    let sm = ''; try { sm = (getMeetingSummary && getMeetingSummary(m)) || ''; } catch (e) {}
    sm = sm || m.description || '';
    // When the only "summary" we have is an agenda-not-posted placeholder, the
    // meeting is real but the agenda simply isn't out yet (agendas usually post a
    // few days before). Fall back to the body description PLUS a clear pending
    // note, so the card reads as "details coming" rather than looking empty — it
    // fills in on its own once the agenda posts (the digest re-renders daily).
    const agendaPending = /not posted|hasn['’]?t been posted|not available|not yet/i.test(sm);
    // Captured BEFORE sm is overwritten by the bodyDesc fallback: true means we
    // hold no agenda-derived content for this meeting at all.
    const noAgendaContent = isWeak(sm);
    if (isWeak(sm)) {
      sm = bodyDesc(name, src);
      if (agendaPending && !/agenda/i.test(sm)) sm += ' The agenda hasn’t been posted yet — details will follow closer to the meeting.';
    }
    // An agenda link must point at an ACTUAL agenda (Morgan, 2026-08-03: never
    // link to an agenda when there isn't one). Two ways a link lies:
    //
    //  1. agendaPending — the scraper already told us in plain words that the
    //     agenda "hasn't been posted yet". Sources still hand us a URL in that
    //     state: Telluride civicweb mints a MeetingInformation.aspx?Id= page
    //     for every scheduled meeting whether or not a packet is attached, so
    //     the link looks specific but leads to an empty shell. The summary
    //     text is the more reliable signal — trust it over the URL.
    //  2. The URL is an agenda *index* (a CivicPlus AgendaCenter, a bare
    //     "/agendas" path, or a portal root like sanmiguelcoco.portal
    //     .civicclerk.com with no event path) — where an agenda would live if
    //     one existed.
    //
    // And the quiet third case: no summary text at all (so no pending wording
    // to catch) plus a meeting-page URL. With no agenda-derived content we have
    // no evidence a packet exists, so a link is only safe when the URL is the
    // document itself. Far-out meetings sit here — e.g. Sep 10 Town Council
    // Budget carried a civicweb Id= link with a zero-length summary.
    //
    // Either way: no agenda link. The card's own text says the agenda is
    // pending, which is the honest thing to show.
    const rawAgenda = m.agendaLink || (m.hasAgenda ? m.link : '') || '';
    const agendaUnverified = noAgendaContent && !AGENDA_DOC_URL.test(rawAgenda);
    const agenda = (agendaPending || isGenericAgendaUrl(rawAgenda) || agendaUnverified) ? '' : rawAgenda;
    // Match the meeting against WHY_THIS_MATTERS (title + summary + description),
    // exactly like gov-hub.html's getWTMEntry(), so the same land-use / code
    // meetings get the "Why This Matters" highlight in the email.
    const wtm = getWTMEntry(name + ' | ' + sm + ' | ' + (m.description || ''));
    meetings.push({ name, date, src, srcKey: m.source || '', summary: trunc(sm, 520), agenda, link: m.link || (SITE + '/gov-hub.html'), hasAgenda: !!agenda, wtm,
      // Carried for the "Add to calendar" button only. eventTimes is the field
      // every get*Meetings() source populates ('' when the body publishes no
      // hour → the calendar entry lands as all-day).
      time: m.eventTimes || '', location: m.location || '' });
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
  med:                'bodadmin@tellmed.org',
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

// ── Emphasize proper-noun names & standalone addresses in meeting summaries ──
// Ported from gov-hub.html's emphasizeNames so the weekly digest bolds the SAME
// scannable entities (project/board names, street addresses) that the Gov-Hub
// meeting cards do. Heuristic: bold Title-Case word runs; a LONE Title-Case word
// is bolded only when it's NOT sentence-initial and NOT a generic civic/temporal
// word (Council, Board, months, Section, …). Operates on the raw text and escapes
// as it goes. Applied to meeting summaries only, via renderSummary().
const NAME_STOP = new Set(('The A An On In At As It This That These Those Its Their And But Or If '
  + 'After Before During While Also Both Two Three Four Five Several Additional Other Following New '
  + 'Council Board Commission Committee Ordinance Ordinances Resolution Resolutions Meeting Session '
  + 'Sessions Town County City District State Chair Mayor Public Staff Members Member Consent Agenda '
  + 'Work Executive Regular Special Substantial Councilors '
  + 'January February March April May June July August September October November December '
  + 'Monday Tuesday Wednesday Thursday Friday Saturday Sunday '
  + 'Section Stage Phase Article Item Step Unit No Yes '
  + 'Accommodations Building Buildings Preliminary Large Scale').split(/\s+/));
const _ADDR_DIR = '(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\\.?';
const _ADDR_SUF = '(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place|Cir|Circle|Trail|Trl|Pkwy|Parkway|Hwy|Highway)';
const _ADDR_W = "[A-Z][A-Za-z'’]*";
const _ADDR_SRC = '\\d+\\s+(?:' + _ADDR_DIR + '\\s+' + _ADDR_W + '(?:\\s+' + _ADDR_W + ')*(?:\\s+' + _ADDR_SUF + ')?|' + _ADDR_W + '(?:\\s+' + _ADDR_W + ')*\\s+' + _ADDR_SUF + ')';
const _RUN_SRC = "[A-Z][a-z]+(?:['’][A-Za-z]+)?(?:\\s+(?:of|the|[A-Z][a-z]+(?:['’][A-Za-z]+)?))*";
function emphasizeNames(raw) {
  const scanRe = new RegExp('(' + _ADDR_SRC + ')|(' + _RUN_SRC + ')', 'g');
  let html = '', last = 0, m;
  while ((m = scanRe.exec(raw)) !== null) {
    const start = m.index;
    html += esc(raw.slice(last, start));
    if (m[1]) {
      // A street address. Bold in full UNLESS it merely locates a named project
      // (introduced by "at"/"on") — there the project name carries the emphasis.
      const addr = m[1];
      const locates = /\b(?:at|on)\s+$/i.test(raw.slice(0, start));
      html += locates ? esc(addr) : '<strong>' + esc(addr) + '</strong>';
      last = start + addr.length;
      continue;
    }
    const run = m[2];
    let trimmed = run.replace(/(?:\s+(?:of|the))+$/, '');   // drop trailing connectors
    const tail = run.slice(trimmed.length);
    let leadThe = '';                                       // keep a leading "The" outside the bold
    if (/\s/.test(trimmed)) { const t = trimmed.match(/^(The\s+)(?=[A-Z])/); if (t) { leadThe = t[1]; trimmed = trimmed.slice(leadThe.length); } }
    const multi = /\s/.test(trimmed);
    const before = raw.slice(0, start).replace(/\s+$/, '');
    const sentenceStart = before === '' || /[.!?]$/.test(before);
    const sig = trimmed.split(/\s+/).filter((w) => !/^(?:of|the)$/i.test(w));
    const allStop = sig.length > 0 && sig.every((w) => NAME_STOP.has(w));
    const bold = !allStop && (multi || (!sentenceStart && !NAME_STOP.has(trimmed)));
    html += esc(leadThe) + (bold ? '<strong>' + esc(trimmed) + '</strong>' : esc(trimmed)) + esc(tail);
    last = start + run.length;
  }
  html += esc(raw.slice(last));
  return html;
}

// Render summary text supporting [text](url) markdown-style hyperlinks.
// Splits on the link pattern, escapes prose with esc(), and emits styled
// <a> tags for each link (http(s) only — anything else falls back to
// literal escaped text to avoid e.g. javascript: smuggling). Used to let
// MANUAL_SUMMARIES entries embed links like "read more about this
// project [here](https://livabletelluride.org/...)" without exposing raw
// HTML in the data file.
function renderSummary(s) {
  if (!s) return '';
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let out = '', lastIndex = 0, m;
  while ((m = re.exec(s)) !== null) {
    out += emphasizeNames(s.slice(lastIndex, m.index));
    const url = m[2].trim();
    if (/^https?:\/\//i.test(url)) {
      out += `<a href="${esc(url)}" style="color:#a0531f;text-decoration:underline;">${esc(m[1])}</a>`;
    } else {
      out += esc(m[0]);
    }
    lastIndex = m.index + m[0].length;
  }
  out += emphasizeNames(s.slice(lastIndex));
  return out;
}
const wd = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' });
const prettyDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
const commentMailto = (m) => { const board = boardName(m.name, m.src); const subject = `Re: the ${prettyDate(m.date)} ${board} meeting`; const body = `To the ${board},\n\nI'd like to share a comment on the ${prettyDate(m.date)} meeting:\n\n`; return `mailto:${encodeURIComponent(commentEmailFor(m.name, m.srcKey))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; };
const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : (SITE + '/events.html');
// ── "Add to calendar" ──────────────────────────────────────────────────────
// Every meeting and event card carries one (Morgan, 2026-08-11). Mail clients
// run no JS and won't follow a data: URI, so the digest can't hand over an .ics
// the way the website's cards do. The button instead links to
// /add-to-calendar.html with the event in the query string; that page offers
// the three routes that between them cover every client — an .ics download
// (Apple Calendar, Outlook desktop), Google Calendar, and Outlook.com. Param
// names must match the ones that page reads: t/d/e/tm/l/u/w.
const CAL_PAGE = SITE + '/add-to-calendar.html';
const calUrl = (ev) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '')) return '';
  const q = [['t', ev.title], ['d', ev.date], ['e', ev.endDate], ['tm', ev.time], ['l', ev.location], ['u', ev.url], ['w', ev.kind]]
    .filter(([, v]) => v)
    // Cap each value: a runaway source string shouldn't push the whole URL past
    // what a mail client will render as a link.
    .map(([k, v]) => k + '=' + encodeURIComponent(String(v).slice(0, 220)))
    .join('&');
  return CAL_PAGE + '?' + q;
};
// Light pill, sized to match the green "Comment" button it sits beside.
const calBtn = (ev) => {
  const u = calUrl(ev);
  return u ? `<a href="${esc(u)}" style="display:inline-block;background:#f1ece1;color:#a0531f;text-decoration:none;font-size:10.5px;font-weight:600;padding:3px 10px;border-radius:4px;vertical-align:middle;">&#128197; Add to calendar</a>` : '';
};
const ACT_SEP = ' &nbsp;&nbsp; ';
const mh = meetings.map((m) => {
  // No agenda → no link. The old fallback ("Meeting info →") pointed at the
  // body's agenda index, which is exactly the decoy the rule above exists to
  // prevent; the card's own text already says the agenda hasn't posted yet.
  const link = m.hasAgenda ? `<a href="${esc(m.agenda)}" style="color:#a0531f;text-decoration:underline;font-size:12.5px;font-weight:600;">View agenda →</a>` : '';
  // Small "Comment" button → opens the reader's mail client to the board's
  // public-comment inbox (only shown when we have a recipient for that body).
  const commentBtn = commentEmailFor(m.name, m.srcKey)
    ? `<a href="${esc(commentMailto(m))}" style="display:inline-block;background:#2f7a5f;color:#fff;text-decoration:none;font-size:10.5px;font-weight:600;padding:3px 10px;border-radius:4px;vertical-align:middle;">Comment</a>`
    : '';
  // Same headline the card shows — meetingDisplayName() exists precisely so the
  // name stands alone once separated from the jurisdiction chip, which is what
  // a calendar entry does. The URL is the VETTED agenda only (m.agenda, already
  // emptied for pending/index/unverified links above) — never m.link. Carrying
  // the raw link would smuggle the agenda-index decoy the rule at the top of
  // this file exists to prevent into the calendar entry and its landing page.
  const calendarBtn = calBtn({
    title: meetingDisplayName(m.name, m.src),
    date: m.date, time: m.time, location: m.location,
    url: m.agenda, kind: 'meeting',
  });
  // "Why This Matters" — mirror the Gov-Hub highlight: a green-bordered card
  // plus an info callout with the stakes and a Deep Dive link, for meetings
  // that touch a tracked code amendment or high-level land-use issue.
  const dd = m.wtm ? deepDiveFor(m.wtm) : '';
  const ddLink = dd ? ` <a href="${esc(dd)}" style="color:#2d6a4f;font-weight:700;text-decoration:underline;">Read the full Deep Dive →</a>` : '';
  const wtmBlock = m.wtm
    ? `<div style="margin:8px 0 4px;padding:10px 12px;background:#eef5f0;border-left:3px solid #2d6a4f;border-radius:4px;"><div style="font-family:Georgia,serif;font-size:10px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:#2d6a4f;margin-bottom:4px;">ℹ Why This Matters</div><div style="font-size:12.5px;color:#2c3b35;line-height:1.55;">${renderSummary(trunc(m.wtm.popup || m.wtm.impact || m.wtm.decision || '', 400))}${ddLink}</div></div>`
    : '';
  // Highlighted card (green border + faint tint) when a WHY_THIS_MATTERS entry
  // matched, matching gov-hub.html's `.meet-card.has-wtm` treatment.
  const tdStyle = m.wtm
    ? 'padding:14px 15px;border:2px solid #2d6a4f;border-radius:8px;background:#f7fbf8;'
    : 'padding:13px 0;border-top:1px solid #eef1ee;';
  // Comment button first, then Add to calendar, then the View-agenda link.
  const acts = [commentBtn, calendarBtn, link].filter(Boolean).join(ACT_SEP);
  return `<tr><td style="${tdStyle}"><span style="display:inline-block;background:#21443c;color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;white-space:nowrap;">${esc(wd(m.date)).toUpperCase()}</span><span style="font-size:12px;color:#7a8a85;margin-left:8px;">${esc(m.src)}</span><div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#1a2e29;margin-top:5px;">${esc(meetingDisplayName(m.name, m.src))}</div><div style="font-size:15.5px;color:#5a6b64;line-height:1.55;margin:4px 0 6px;">${renderSummary(m.summary)}</div>${wtmBlock}${acts}</td></tr>`;
}).join('');
const EV_ACCENT = '#a0531f'; // rust (toned down from the redder #a8401f) — complements the forest-green meeting badge
// Town/area label for an event card. Prefers the scraped venue string when one
// is present (e.g. "Sheridan Opera House · Telluride"); otherwise falls back to
// town keywords in the title, then to substring matches in the source label.
// The Ouray/Ridgway aggregator rarely populates Localist's `location`, which
// previously left a bare date badge with no place marker. The upstream collect
// loop overwrites e.source with e.sourceLabel ("Ouray Ridgway Calendar") when
// the label is set, so the source check must match label patterns, not just
// short codes like 'oray'.
function townLabel(e) {
  if (e.location && String(e.location).trim()) return e.location;
  const t = (e.title || '').toLowerCase();
  if (/\bridgway\b/.test(t)) return 'Ridgway';
  if (/\bouray\b/.test(t)) return 'Ouray';
  if (/\bnorwood\b/.test(t)) return 'Norwood';
  if (/\brico\b/.test(t)) return 'Rico';
  if (/\bmountain village\b/.test(t)) return 'Mountain Village';
  const s = String(e.source || '').toLowerCase();
  if (/ouray.*ridgway|ridgway.*ouray|\boray\b/.test(s)) return 'Ouray / Ridgway';
  if (/\bouray\b/.test(s)) return 'Ouray';
  if (/\bridgway\b/.test(s)) return 'Ridgway';
  if (/\bnorwood\b/.test(s)) return 'Norwood';
  if (/mountain village|\bmv\b/.test(s)) return 'Mountain Village';
  if (/san miguel county|\bcounty\b/.test(s)) return 'San Miguel County';
  if (/\brico\b/.test(s)) return 'Rico';
  if (/\bophir\b/.test(s)) return 'Ophir';
  return 'Telluride';
}
const evRow = (e) => {
  const u = safeUrl(e.href);
  const badge = `<span style="display:inline-block;background:${EV_ACCENT};color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;white-space:nowrap;">${esc(wd(e.date)).toUpperCase()}</span>`;
  const locText = townLabel(e);
  const loc = locText ? `<span style="font-size:12px;color:#7a8a85;margin-left:8px;">📍 ${esc(trunc(locText, 38))}</span>` : '';
  const text = `${badge}${loc}`
    + `<div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#1a2e29;margin-top:5px;"><a href="${esc(u)}" style="color:#1a2e29;text-decoration:none;">${esc(e.title)}</a></div>`
    + `<div style="font-size:15.5px;color:#5a6b64;line-height:1.55;margin:4px 0 6px;">${esc(trunc(e.summary, 200))}</div>`
    + [`<a href="${esc(u)}" style="color:${EV_ACCENT};text-decoration:underline;font-size:12.5px;font-weight:600;">Details →</a>`,
        calBtn({ title: e.title, date: e.date, time: e.time, location: locText, url: e.href, kind: 'event' })]
       .filter(Boolean).join(ACT_SEP);
  const img = (e.img && /^https?:\/\//.test(e.img))
    ? `<td class="ev-img-cell" width="78" valign="top" style="padding-right:14px;"><img src="${esc(e.img)}" width="78" height="78" alt="" style="display:block;width:78px;height:78px;border-radius:6px;border:0;object-fit:cover;background:#eef1ee;"></td>`
    : '';
  return `<tr><td style="padding:13px 0;border-top:1px solid #eef1ee;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${img}<td class="ev-text-cell" valign="top">${text}</td></tr></table></td></tr>`;
};
const eh = chosen.map(evRow).join('');
// A single closing note in Rick's voice at the very end of the email: civic
// engagement is valuable in every form — weighing in on a meeting, or simply
// turning out for a concert or a gallery opening. Replaces the old per-meeting
// "Actions You Can Take This Week" button list. (COMMENT_MAP / commentMailto()
// recipient wiring above is left in place for possible reuse.)
const closingNote = `<tr><td class="callout-wrap" style="padding:28px 34px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="callout-card" style="background:#f1ece1;border-left:4px solid #21443c;border-radius:6px;padding:19px 22px;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;margin-bottom:9px;">Why Showing Up Matters</div><p style="margin:0;font-size:14.5px;line-height:1.7;color:#2c3b35;">The decisions shaping this valley rarely arrive with a drumroll — they get made while most people are looking the other way. The fix is simple: keep showing up. Read an agenda and email the board before a vote, or just turn out for a council meeting, a concert on the green, or an opening at the gallery. None of it is too small. A community that keeps paying attention to itself, in the big ways and the little ones, is one that stays livable.</p></td></tr></table></td></tr>`;

// Donate ask — bottom of the email, just above the footer. A gentle, polite
// request to support the 501(c)(3); links straight to the Stripe checkout.
const donateBlock = `<tr><td class="sec-pad" style="padding:26px 34px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#21443c;border-radius:8px;padding:27px 26px;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#e3c87a;margin-bottom:9px;">Keep This Going</div><p style="margin:0 0 17px;font-size:14.5px;line-height:1.7;color:#e7efe9;">Livable Telluride is a reader-funded <strong>501(c)(3) nonprofit</strong> — no ads, no paywall. If this is useful to you, a gift of any size keeps it coming.</p><a href="https://buy.stripe.com/7sY7sD2TZ2MV5Vudf40Ba00" style="display:inline-block;background:#b58a2c;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 32px;border-radius:999px;">&#9829; Donate</a><div style="font-size:11.5px;color:#9fbcb0;margin-top:13px;">Secure checkout via Stripe &middot; Your gift is tax-deductible to the extent allowed by law.</div></td></tr></table></td></tr>`;

// "What We're Reading" box. Two sources, in priority order:
//   1. A manual editorial pick for a specific week (WHATS_READING_MANUAL, keyed
//      by that week's Monday) — use this to feature a specific essay/article.
//   2. Otherwise it AUTO-FILLS with the most recent substantive local news
//      story from the live Telluride Times feed — so the box always carries
//      current news and never silently goes empty. (It used to be hard-gated to
//      one week and had shown nothing since 2026-06-15.)
const WHATS_READING_MANUAL = {
  // Example / historical pick — copy this shape to feature a specific piece:
  '2026-06-15': {
    url: 'https://coloradosun.com/2026/06/13/opinion-stripped-for-parts-documentary/',
    title: 'When communities lose their newspapers, they lose more than news',
    source: 'The Colorado Sun · Essay by John Barry',
    blurb: 'This essay names exactly why Livable Telluride exists. When local newspapers are hollowed out, a community loses far more than headlines: it loses the shared facts, the accountability, and the civic infrastructure that democracy runs on. His prescription, that local journalism deserves the same public and philanthropic support we give schools and libraries, is the very idea behind this donor-funded nonprofit.',
  },
};
// Auto-pick the newest local news story worth reading. TELLURIDE_TIMES_ARTICLES
// also carries government press releases and meeting agendas (source "Town of
// Ridgway", "San Miguel County", etc.) — those aren't editorial reads, so
// restrict to actual newspaper articles (source "Telluride Times") and skip
// obituaries, legal roundups, and hearing notices. The blurb comes from `copy`
// (the article text); `claudeSummary` is a boolean quality flag, not text, so
// it only nudges ranking (prefer summarized stories), newest first.
function autoWhatsReading() {
  const arr = (typeof G === 'function' ? G('TELLURIDE_TIMES_ARTICLES') : null) || [];
  const isRealRead = (a) => a && a.title && a.copy && /^https?:\/\//i.test(a.href || '')
    && String(a.source || '') === 'Telluride Times'
    && !/\/obituaries\//i.test(a.href)
    && !/\/legals\//i.test(a.href)
    && !/^\s*legals?\b|public notices|notice of public hearing/i.test(a.title);
  const byNewest = (x, y) => (Date.parse(y.date) || 0) - (Date.parse(x.date) || 0);
  const a = arr.filter(x => isRealRead(x) && x.claudeSummary === true).sort(byNewest)[0]
         || arr.filter(isRealRead).sort(byNewest)[0];
  if (!a) return null;
  const raw = String(a.copy || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { url: a.href, title: a.title, source: a.source || 'Telluride Times', blurb: trunc(raw, 320) };
}
const WHATS_READING = WHATS_READING_MANUAL[WEEK_START] || autoWhatsReading();
const whatsReadingBox = WHATS_READING ? `<tr><td class="callout-wrap" style="padding:26px 34px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="callout-card" style="background:#f1ece1;border-left:4px solid #a0531f;border-radius:6px;padding:19px 22px;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;margin-bottom:9px;">→ What We're Reading</div><div style="font-family:Georgia,serif;font-size:16px;font-weight:700;color:#1a2e29;line-height:1.3;"><a href="${WHATS_READING.url}" style="color:#1a2e29;text-decoration:none;">${esc(WHATS_READING.title)}</a></div><div style="font-size:12px;color:#7a8a85;margin:3px 0 9px;">${esc(WHATS_READING.source)}</div><p style="margin:0;font-size:14px;line-height:1.65;color:#2c3b35;">${esc(WHATS_READING.blurb)}</p><a href="${WHATS_READING.url}" style="display:inline-block;margin-top:10px;color:#a0531f;text-decoration:underline;font-size:12.5px;font-weight:600;">Read it →</a></td></tr></table></td></tr>` : '';
// ── Featured-organization weekly rotation ───────────────────────────────
// Index 0 = the week of Mon Aug 3, 2026; advances one org each Monday.
//
// Anchored to the MONDAY OF THE WEEK BEING RENDERED, never to the moment of
// rendering. That distinction is the whole point: digest-refresh.yml drafts
// this email days ahead of the send, and an approved digest is frozen behind
// a lock file, so a render-time pick (the old floor(Date.now()/604800000),
// which rolled over Thursday 00:00 UTC only because the Unix epoch happens to
// be a Thursday) could advertise one org while the site showed another.
// Keying off WEEK_START makes the pick a property of the week the email
// covers, so it is identical whenever the render happens to run.
//
// The Friday "Weekend Ahead" digest snaps back to the Monday of its own week,
// so the Monday and Friday emails in a given week feature the same org.
// local-orgs.html carries a byte-for-byte equivalent of this function — change
// one, change the other.
const FEATURED_EPOCH_MONDAY = Date.UTC(2026, 7, 3);   // Mon Aug 3, 2026, 00:00 UTC
function featuredOrgIndex(isoDate, len) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (isNaN(d)) return 0;
  const dow = (d.getUTCDay() + 6) % 7;                 // Mon=0 … Sun=6
  const monday = d.getTime() - dow * 86400000;
  const weeks = Math.round((monday - FEATURED_EPOCH_MONDAY) / 604800000);
  return ((weeks % len) + len) % len;                  // negatives wrap forward
}

// The box itself. Spotlight copy comes from gov-data.js FEATURED_ORGS; the
// logo, website, and donate link are read live from the LOCAL_ORGS directory
// entry so they never drift. Add another org to FEATURED_ORGS and it joins the
// rotation. Falls back to What We're Reading if the pick can't be resolved.
function buildFeaturedOrgBox() {
  const picks = G('FEATURED_ORGS') || [];
  const dir = G('LOCAL_ORGS') || [];
  if (!picks.length) return '';
  const pick = picks[featuredOrgIndex(WEEK_START, picks.length)];
  const org = dir.find(o => o.name === pick.name);
  if (!org) { console.error(`FEATURED_ORGS: "${pick.name}" is not in LOCAL_ORGS — featured-org box skipped.`); return ''; }
  const abs = (u) => /^https?:\/\//i.test(u || '') ? u : '';
  // .webp logos silently break in Outlook / older iOS Mail — drop the image
  // rather than ship a broken-image box. Fix by adding a .png/.jpg copy to
  // /logo/ and pointing the LOCAL_ORGS entry at it.
  const logo = emailUsableImg(org.logo) ? abs(org.logo) : '';
  if (org.logo && !logo) console.error(`FEATURED_ORGS: "${org.name}" logo isn't email-safe (${org.logo}) — rendering without it.`);
  const site = abs(org.website), donate = abs(org.donate);
  const logoRow = logo
    ? `<tr><td align="center" style="padding:0 0 14px;"><img src="${logo}" alt="${esc(org.name)}" width="120" style="display:block;max-width:120px;height:auto;margin:0 auto;"></td></tr>`
    : '';
  let acts = '';
  if (donate) acts += `<a href="${donate}" style="display:inline-block;margin:12px 14px 0 0;color:#a0531f;text-decoration:underline;font-size:12.5px;font-weight:600;">Support them &#8594;</a>`;
  if (site) acts += `<a href="${site}" style="display:inline-block;margin:12px 0 0;color:#a0531f;text-decoration:underline;font-size:12.5px;font-weight:600;">Visit their site &#8594;</a>`;
  return `<tr><td class="callout-wrap" style="padding:26px 34px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="callout-card" style="background:#f1ece1;border-left:4px solid #a0531f;border-radius:6px;padding:19px 22px;">`
    + `<div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;margin-bottom:9px;">&#8594; Featured Organization</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${logoRow}</table>`
    + `<div style="font-family:Georgia,serif;font-size:16px;font-weight:700;color:#1a2e29;line-height:1.3;">${esc(org.name)}</div>`
    + `<p style="margin:8px 0 0;font-size:14px;line-height:1.65;color:#2c3b35;">${esc(pick.why)}</p>`
    + `<p style="margin:10px 0 0;font-size:14px;line-height:1.65;color:#2c3b35;"><strong>How you can help:</strong> ${esc(pick.how)}</p>`
    + `${acts}</td></tr></table></td></tr>`;
}
const featuredOrgBox = buildFeaturedOrgBox();
// Kept for reference / quick revert — set SHOW_LOOKING_FOR true to bring the
// freelance-writer recruitment ad back in place of the featured org.
const SHOW_LOOKING_FOR = false;
const LOOKING_FOR_MAILTO = "mailto:info@livabletelluride.org?subject=I%27m%20interested%20in%20the%20freelance%20position";
const whatsLookingForBox = `<tr><td class="callout-wrap" style="padding:26px 34px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="callout-card" style="background:#f1ece1;border-left:4px solid #a0531f;border-radius:6px;padding:19px 22px;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;margin-bottom:9px;">&#8594; What We're Looking For</div><div style="font-family:Georgia,serif;font-size:16px;font-weight:700;color:#1a2e29;line-height:1.3;">Write for Livable Telluride</div><p style="margin:8px 0 0;font-size:14px;line-height:1.65;color:#2c3b35;">Have you ever dreamed of being a local reporter &#8212; like Superman moonlighting at the Daily Planet? Now may be your time to shine. Livable Telluride is looking for local people interested in helping write about current events around the region. We'll start with paid freelance work and see where it goes, and our rates are competitive with other organizations. Send an email to <a href="${LOOKING_FOR_MAILTO}" style="color:#a0531f;text-decoration:underline;">info@livabletelluride.org</a> with a resume, a link to prior work if you have it, and a note about why you'd be a good fit.</p><a href="${LOOKING_FOR_MAILTO}" style="display:inline-block;margin-top:10px;color:#a0531f;text-decoration:underline;font-size:12.5px;font-weight:600;">I'm interested &#8594;</a></td></tr></table></td></tr>`;
// Featured Organization is the default callout; What We're Reading is the
// fallback when no featured org resolves (and the recruitment ad is opt-in).
const calloutBox = SHOW_LOOKING_FOR ? whatsLookingForBox : (featuredOrgBox || whatsReadingBox);
const section = (label, rows) => rows ? `<tr><td class="sec-pad" style="padding:24px 34px 0;"><div style="font-family:Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b58a2c;border-bottom:1px solid #d4c9b0;padding-bottom:8px;">→ ${label}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : '';
// Conditional per-interest extras — each block renders only for subscribers in
// that Mailchimp "Event Topics" group. The *|INTERESTED|* tags are raw (NOT
// html-escaped) so Mailchimp matches the literal group name including its "&".
const topicHtml = topicSections.map((td) =>
  `\n  *|INTERESTED:Event Topics:${td.group}|*` + section(td.label, td.events.map(evRow).join('')) + `*|END:INTERESTED|*`
).join('');

// ── Featured festival hero(s) ──
// The marquee Telluride festivals (Bluegrass, Mountainfilm, Yoga, Jazz,
// Mushroom, Film Fest, Autumn Classic, Original Thinkers, Horror Show) get a
// bold card at the top of the events whenever their run overlaps the week.
// Driven by TELLURIDE_FESTIVALS (gov-data.js) so they carry the official dates,
// logo, promo line, and ticket link. (User 2026-06-15.)
const MONTHS_F = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fpad = (n) => String(n).padStart(2, '0');
const fYear = startD.getFullYear();
const festISO = (f) => { const em = (f.endMonth != null ? f.endMonth : f.month); return { start: `${fYear}-${fpad(f.month + 1)}-${fpad(f.dayStart)}`, end: `${fYear}-${fpad(em + 1)}-${fpad(f.dayEnd)}` }; };
const festLabel = (f) => { const em = (f.endMonth != null ? f.endMonth : f.month); const right = (em === f.month) ? `${f.dayEnd}` : `${MONTHS_F[em]} ${f.dayEnd}`; return `${MONTHS_F[f.month]} ${f.dayStart}–${right}, ${fYear}`; };
const festivalsThisWeek = (G('TELLURIDE_FESTIVALS') || [])
  .filter((f) => MAJOR_FEST_RE.test(f.name))
  .filter((f) => { const r = festISO(f); return r.start <= dEnd && r.end >= days[0]; });
const festCard = (f) => {
  const link = f.ticketUrl || f.url || (SITE + '/events.html');
  const cta = f.ticketLabel || 'Festival Details';
  // The whole run as one multi-day all-day block (festISO gives inclusive
  // start/end; add-to-calendar.html handles the exclusive-DTEND arithmetic).
  const r = festISO(f);
  const calendarBtn = calBtn({ title: f.name, date: r.start, endDate: r.end, location: 'Telluride', url: link, kind: 'event' });
  const logoImg = f.logo
    ? `<img src="${esc(f.logo)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:contain;">`
    : `<div style="font-size:38px;line-height:64px;text-align:center;">${f.icon || '🎪'}</div>`;
  return `<tr><td class="sec-pad" style="padding:20px 34px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#21443c;border-radius:10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="fest-logo-cell" width="96" valign="middle" style="padding:16px 0 16px 16px;vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#fff;border-radius:10px;padding:8px;width:80px;height:80px;text-align:center;vertical-align:middle;">${logoImg}</td></tr></table></td><td class="fest-body-cell" valign="middle" style="padding:16px 18px;vertical-align:middle;"><div style="font-family:Georgia,serif;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#e3c87a;">&#9733; Festival This Week</div><div style="font-family:Georgia,serif;font-size:19px;font-weight:700;color:#fff;margin-top:4px;line-height:1.2;"><a href="${esc(link)}" style="color:#fff;text-decoration:none;">${esc(f.name)}</a></div><div style="font-size:13px;color:#a8c4b8;margin-top:3px;">${esc(festLabel(f))}</div>${f.promo ? `<p style="margin:8px 0 11px;font-size:13px;line-height:1.55;color:#e7efe9;">${esc(f.promo)}</p>` : '<div style="height:10px;"></div>'}<a href="${esc(link)}" style="display:inline-block;background:#b58a2c;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 20px;border-radius:999px;">${esc(cta)} &rarr;</a>${calendarBtn ? `<span style="display:inline-block;width:12px;">&nbsp;</span>${calendarBtn}` : ''}</td></tr></table></td></tr></table></td></tr>`;
};
const festivalHero = festivalsThisWeek.map(festCard).join('');

// (The old CUSTOMERIO=1 message_data mode was retired 2026-07-06 with the
// customerio-weekly.yml auto-broadcast — the weekly email now sends only
// through the human-approved Digest Review Desk, which uses this normal
// rendered-HTML output.)

// Everything from here (lede generation + HTML assembly + write) runs inside an
// async block because the Rick lede is generated via an async Claude call.
(async () => {

// DEFAULT the intro to a fresh Rick-voice summary of THIS window's real
// meetings + events — unless a human pinned a dated intro in the lede JSON
// (that override always wins). Best-effort: generateRickLede returns null when
// there's no ANTHROPIC_API_KEY or the call fails, and we keep the fallback.
if (!LEDE_IS_OVERRIDE) {
  const rickLede = await generateRickLede({
    cadence: WEEKEND ? 'weekend' : 'week',
    meetings: WEEKEND ? [] : meetings.map((m) => ({ title: m.name, date: m.date, summary: m.summary })),
    events: chosen.map((e) => ({ title: e.title, date: e.date, location: townLabel(e), summary: e.summary })),
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  if (rickLede) LEDE = rickLede;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
@media only screen and (max-width:480px){
  /* Event cards: stack image on top, text below, for easier mobile reading. */
  .ev-img-cell{display:block !important;width:100% !important;padding:0 0 10px 0 !important;}
  .ev-img-cell img{width:160px !important;height:160px !important;}
  .ev-text-cell{display:block !important;width:100% !important;}
  /* Festival hero: stack the logo above the text on phones. */
  .fest-logo-cell{display:block !important;width:100% !important;padding:14px 14px 0 !important;}
  .fest-body-cell{display:block !important;width:100% !important;padding:12px 14px 16px !important;}
  /* Callout cards (What We're Reading / Why Showing Up Matters): drop the
     accent bar and widen the text edge-to-edge for mobile readability. */
  .callout-wrap{padding-left:14px !important;padding-right:14px !important;}
  .callout-card{border-left:0 !important;padding:16px 16px !important;}
  /* Trim the 34px side padding on every main block so body text runs wider
     (longer lines, less right-edge whitespace) on phones. */
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
        <div style="font-family:Georgia,serif;font-size:14px;color:#a8c4b8;margin-top:3px;">${esc(LABEL)}</div>
      </td>
      <td width="74" valign="middle" align="right" style="vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr><td style="background:#ffffff;border-radius:8px;padding:5px;">
          <img src="https://livabletelluride.org/logo/Livable%20Telluride%20Logo.png" width="58" height="58" alt="Livable Telluride" style="display:block;width:58px;height:58px;border:0;">
        </td></tr></table>
      </td>
    </tr></table></td></tr>
  <tr><td class="sec-pad" style="padding:22px 34px 4px;">
    <span style="display:inline-block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#2f7a5f;background:rgba(47,122,95,.1);padding:3px 10px;border-radius:999px;">📅 ${esc(EMAIL_TITLE)}</span>
    <p style="margin:11px 0 0;font-size:15.5px;line-height:1.65;color:#2c3b35;">${esc(LEDE)}</p></td></tr>
  ${WEEKEND ? '' : section('Public Meetings This Week', mh)}
  ${festivalHero}
  ${section(EVENTS_HEADING, eh)}${WEEKEND ? '' : topicHtml}
  ${calloutBox}
  ${donateBlock}
  <tr><td class="sec-pad" style="padding:24px 34px 30px;border-top:1px solid #ddd6c8;">
    <div style="font-family:Georgia,serif;font-size:13px;font-weight:700;color:#21443c;">Livable Telluride</div>
    <div style="font-size:12px;color:#7a8a85;line-height:1.6;margin-top:4px;">Community information for Telluride, Mountain Village &amp; San Miguel County.<br>
    <a href="https://livabletelluride.org" style="color:#7a8a85;">livabletelluride.org</a> &nbsp;·&nbsp; <a href="{% unsubscribe_url %}" style="color:#7a8a85;">Unsubscribe</a> &nbsp;·&nbsp; <a href="https://livabletelluride.org/profile.html?email={{ customer.email | url_encode }}&amp;fname={{ customer.first_name | url_encode }}&amp;town={{ customer.region | url_encode }}" style="color:#7a8a85;">Update preferences</a></div></td></tr>
</table></td></tr></table></body></html>`;

// In preview mode, render an info@ review copy: a banner at the top, every topic
// section shown inline (subscribers only see the ones they opted into), and the
// personalization tags (Customer.io Liquid; legacy Mailchimp merge tags)
// neutralised so the footer/links aren't left broken.
let out = html;
if (PREVIEW) {
  // Where the reviewer edits this draft (edit with Claude + send): the hosted,
  // passphrase-gated Digest Review Desk. This link lives ONLY in the review
  // banner, which is inside this PREVIEW branch — so it is never present in the
  // real subscriber send (the non-preview HTML has no banner at all).
  const EDIT_URL = 'https://livabletelluride.org/digest-review.html';
  const editLink = `<br><a href="${EDIT_URL}" style="color:#ffe4c4;font-weight:700;text-decoration:underline;">Edit or send this draft at the Review Desk &rarr;</a>`;
  const banner = WEEKEND
    ? `  <tr><td style="background:#a8401f;padding:13px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#fff;line-height:1.5;">REVIEW DRAFT — this Friday's "Weekend Outlook" events email. Look it over, then approve to send.<br><span style="font-weight:400;">The intro is auto-written in Rick&rsquo;s voice from this weekend&rsquo;s events. To pin a specific intro instead, add a "${WEEK_START}" entry to data/weekend-ahead-lede.json and re-run the workflow.</span>${editLink}</td></tr>\n`
    : `  <tr><td style="background:#a8401f;padding:13px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#fff;line-height:1.5;">REVIEW DRAFT — the upcoming weekly email. Look it over, then send the saved copy through Mailchimp. The topic sections below show in full here; each subscriber only sees the ones they opted into.<br><span style="font-weight:400;">The intro is auto-written in Rick&rsquo;s voice from this week&rsquo;s meetings and events. To override it, reply with the new text (week-key ${WEEK_START}).</span>${editLink}</td></tr>\n`;
  out = out.replace('  <tr><td class="sec-pad" style="background:#21443c;padding:26px 34px;">', banner + '  <tr><td class="sec-pad" style="background:#21443c;padding:26px 34px;">')
           .replace(/\*\|INTERESTED:[^|]*\|\*/g, '').replace(/\*\|END:INTERESTED\|\*/g, '')
           .replace(/\*\|UNSUB\|\*/g, '#').replace(/\*\|[A-Z0-9_]+\|\*/g, '')
           .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, '#')
           .replace(/\{\{\s*customer\.[^}]*\}\}/g, '');
}
// Tag INTERNAL (livabletelluride.org) links with UTM params so newsletter-driven
// visits are attributable in Cloudflare Web Analytics (shows the ?utm_ pages) and
// any future analytics. External links (event sources, agenda hosts, Stripe) are
// left untouched. Anchors (#…) are preserved; existing query strings get "&amp;".
const utmCampaign = WEEKEND ? 'weekend-outlook' : 'week-ahead';
out = out.replace(/href="(https:\/\/livabletelluride\.org[^"]*)"/g, (m, url) => {
  const h = url.indexOf('#'); const base = h >= 0 ? url.slice(0, h) : url; const frag = h >= 0 ? url.slice(h) : '';
  const sep = base.includes('?') ? '&amp;' : '?';
  return 'href="' + base + sep + 'utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=' + utmCampaign + frag + '"';
});
// Encode every non-ASCII character as a numeric HTML entity so the output is
// pure ASCII — immune to charset/encoding mismatches when the HTML is pasted
// into Mailchimp or rendered by a mail client (fixes the "Telluride,Aos" /
// ",Ai" / "‚Üí" mojibake from UTF-8 being mis-decoded as MacRoman). Existing
// entities (&amp;, &#39;) are already ASCII and pass through untouched.
out = Array.from(out).map((ch) => { const cp = ch.codePointAt(0); return cp > 127 ? '&#' + cp + ';' : ch; }).join('');
fs.writeFileSync(OUT, out);
const SUBJECT = `${EMAIL_TITLE} — ${LABEL}`;
console.log('SUBJECT=' + SUBJECT);
console.log(`weekly-email: ${meetings.length} meetings (${meetings.filter(m=>m.hasAgenda).length} w/ agenda links), ${chosen.length} events → ${OUT}${PREVIEW ? ' [preview]' : ''}`);
console.log(`  conditional topic blocks: ${topicSections.map(t=>`${t.group} (${t.events.length})`).join(', ') || 'none this week'}`);

})().catch((e) => { console.error('weekly-email FATAL', e.message); process.exit(1); });
