#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — RSS Feed Builder
 * ══════════════════════════════════════════════════════════════
 *
 * Emits feed.xml at the repo root from the canonical site data in
 * js/gov-helpers.js (news articles, KOTO newscasts/features, legal notices).
 *
 * Mailchimp's "RSS-driven email" campaign type reads this feed and emails
 * subscribers a daily digest of the newest items. Each item has a stable
 * GUID derived from its href so Mailchimp does NOT re-send the same items
 * across days.
 *
 * Run from the repo root:
 *   node scripts/build-rss-feed.js
 *
 * Wired into .github/workflows/content-refresh.yml so it regenerates every
 * 6 hours after the content refresh.
 * ══════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HELPERS_JS = path.join(REPO_ROOT, 'js', 'gov-helpers.js');
const FEED_OUT = path.join(REPO_ROOT, 'feed.xml');
const BLOG_FEED_OUT = path.join(REPO_ROOT, 'feed-blog.xml');

// ── "Week Ahead" AI lede + notable-meeting flags ──
// One Claude call per build (cached by the week's lineup hash) writes a
// short Rick-voice synthesis that leads the digest, and flags the meetings
// with a genuinely consequential agenda item. Degrades gracefully: no key
// / API error / parse error → feed builds normally with no lede or flags.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Use the floating Sonnet alias so a model retirement (like
// claude-sonnet-4-20250514 on 2026-06-15) doesn't silently break the
// Week-Ahead lede generation. The Claude preflight in
// scripts/content-refresh.js (which runs first in the same workflow)
// will fail the run before this script executes if the model is rejected.
const CLAUDE_MODEL = require('./lib/claude-model.js').SONNET;
const WEEK_AHEAD_CACHE = path.join(REPO_ROOT, 'data', 'week-ahead-cache.json');

// ── Per-topic event feeds (pilot, 2026-06) ──
// Each powers one RSS-driven Mailchimp campaign targeting the matching
// "Event Topics" interest group, so subscribers only hear about the kinds
// of events they opted into. `civic` is the Gov-Hub meetings; the other
// three are events classified by eventCategory(). Add more here + emit a
// feed below when expanding past the pilot four.
const CATEGORY_FEEDS = [
  { key: 'arts',     file: 'feed-arts.xml',     title: 'Livable Telluride — Music, Arts & Festivals', desc: 'Concerts, film, theater, gallery openings, and festivals — plus upcoming government meetings and comment deadlines.' },
  { key: 'civic',    file: 'feed-civic.xml',    title: 'Livable Telluride — Government Meetings',       desc: 'Upcoming council, commission, and board meetings across the region — with comment deadlines.' },
  { key: 'family',   file: 'feed-family.xml',   title: 'Livable Telluride — Family & Kids',             desc: 'Storytime, youth programs, and all-ages activities — plus upcoming government meetings and comment deadlines.' },
  { key: 'outdoors', file: 'feed-outdoors.xml', title: 'Livable Telluride — Outdoors & Recreation',     desc: 'Hikes, races, ski events, and stewardship days — plus upcoming government meetings and comment deadlines.' },
];

const SITE_URL = 'https://livabletelluride.org';
const COMMUNITY_EVENTS_JSON = path.join(REPO_ROOT, 'community-events.json');
// 2026-05-29: renamed from "Daily Digest" — the daily campaign was
// retired 2026-05-25 and the only consumer is now the Weekly digest
// Mailchimp campaign. Description updated to match the broader
// content: news + Gov-Hub meetings coming up + events for the week.
const FEED_TITLE = 'Livable Telluride — Weekly Digest';
const FEED_DESC = 'This week\'s upcoming Gov-Hub meetings and community events across the Telluride region (Town of Telluride, Mountain Village, San Miguel County, the Sheridan Opera House, The Alibi, Wilkinson Library, KOTO, telluride.com, and more).';
const BLOG_FEED_TITLE = 'Livable Telluride — Blog';
const BLOG_FEED_DESC = 'Long-form posts from Livable Telluride on housing, land use, civic decisions, and the issues shaping our valley.';
const MAX_AGE_DAYS = 7;             // backward window for news + blog (the past week)
// Weekly digest windows. The Mailchimp Weekly digest sends FRIDAY mornings
// (moved from Monday 2026-06-09), so the forward-looking sections should
// cover exactly the upcoming Friday→Thursday week. withinRollingWindow is
// INCLUSIVE on both ends (deltaDays in [0, N]), so N=6 means today (Friday,
// delta 0) through next Thursday (delta +6) = 7 calendar days, and it stops
// BEFORE the next Friday — so a next-Friday event lands in next week's email
// only, never doubled across two weeklies.
const MAX_FUTURE_DAYS = 6;          // forward window for meetings (Fri→Thu)
const MAX_EVENT_FUTURE_DAYS = 6;    // forward window for events (Fri→Thu)
const MAX_ITEMS = 60;               // hard cap on feed size
const MAX_MEETINGS = 15;            // cap upcoming-meeting items per build
const MAX_EVENTS = 25;              // cap event items per build (multi-source)
const MAX_BLOG = 8;                 // cap blog items per build

// ──────────────────────────────────────────────────────────────
// Read js/gov-helpers.js and extract the relevant arrays/objects.
// Reuses the same Function-eval trick as content-refresh.js.
// ──────────────────────────────────────────────────────────────

function extractJsObject(source, varName) {
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*\\{`);
  const m = startRe.exec(source);
  if (!m) return null;
  let depth = 0, start = m.index + m[0].length - 1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      if (--depth === 0) {
        try { return new Function(`return (${source.slice(start, i + 1)})`)(); }
        catch (e) { console.warn(`  parse ${varName}: ${e.message}`); return null; }
      }
    }
  }
  return null;
}

function extractJsArray(source, varName) {
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*\\[`);
  const m = startRe.exec(source);
  if (!m) return null;
  let depth = 0, start = m.index + m[0].length - 1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      if (--depth === 0) {
        try { return new Function(`return (${source.slice(start, i + 1)})`)(); }
        catch (e) { console.warn(`  parse ${varName}: ${e.message}`); return null; }
      }
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rfc822(d) {
  return new Date(d).toUTCString();
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function withinWindow(d, days) {
  if (!d) return false;
  return (Date.now() - d.getTime()) / 86400000 <= days;
}

// True if d falls in [today - daysBehind, today + daysAhead]. Compares at
// UTC-day granularity, NOT milliseconds — and NOT local time.
//
// The naive `(meetingDate.getTime() - Date.now()) / 86400000` approach has
// two latent bugs:
//   1. A meeting whose date string is "2026-05-25" parses to 00:00 UTC.
//      When this runs at noon UTC the raw delta is -12 hours = -0.5 days,
//      which under a `daysBehind=0` rule would (wrongly) exclude today's
//      meeting.
//   2. Mixing the bare-string UTC parse with `setHours(0,0,0,0)` (which
//      uses LOCAL time) produces a different "today" depending on the
//      machine's timezone. In MDT (UTC-6) "today's local midnight" is
//      6h ahead of "today's UTC midnight" — enough to flip the comparison.
//
// Snapping BOTH sides to UTC midnight via Date.UTC() makes the result
// timezone-stable: same answer in UTC, MDT, or anywhere else.
function withinRollingWindow(d, daysBehind, daysAhead) {
  if (!d) return false;
  const now = new Date();
  const todayUtc  = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(d.getUTCFullYear(),   d.getUTCMonth(),   d.getUTCDate());
  const deltaDays = Math.round((targetUtc - todayUtc) / 86400000);
  return deltaDays >= -daysBehind && deltaDays <= daysAhead;
}

// Map MANUAL_SUMMARIES key prefix → readable source label.
const MEETING_SOURCE_LABELS = {
  telluride: 'Town of Telluride',
  mv: 'Mountain Village',
  county: 'San Miguel County',
  smart: 'SMART Transit',
  school: 'Telluride School District',
  fire: 'Telluride Fire Protection District',
  med: 'Telluride Medical Center',
  norwood: 'Town of Norwood',
  ophir: 'Town of Ophir',
  smrha: 'San Miguel Regional Housing Authority',
};

// Stable per-item GUID. Use href when available; fall back to a hash of
// title+date so Mailchimp doesn't think the same item is "new" tomorrow.
function guidFor(item) {
  if (item.href) return item.href;
  // Use firstSeen (date first scraped) so articles get a fresh GUID on the day
  // they're added — Mailchimp will include them in that day's digest.
  // Falls back to item.date for legacy articles without firstSeen.
  const seed = `${item.title}|${item.firstSeen || item.date || ''}|${item.source || ''}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return `${SITE_URL}/digest/${(h >>> 0).toString(16)}`;
}

// ──────────────────────────────────────────────────────────────
// Build items from each section.
// ──────────────────────────────────────────────────────────────

function buildNewsItems(src, articles, sourceLabel) {
  if (!Array.isArray(articles)) return [];
  return articles.flatMap((a) => {
    const d = parseDate(a.date);
    if (!withinWindow(d, MAX_AGE_DAYS)) return [];
    const desc = a.copy ? a.copy : `${a.source || sourceLabel} • ${a.date || ''}`;
    // Use firstSeen as pubDate so Mailchimp treats the article as new on the day it was scraped
    const pubDate = a.firstSeen ? parseDate(a.firstSeen) : d;
    return [{
      title: a.title || '(untitled)',
      link: a.href || SITE_URL,
      pubDate,
      description: desc,
      imageUrl: a.img || a.imageUrl || null,
      categories: [a.source || sourceLabel, a.newsTopic].filter(Boolean),
      guid: guidFor(a),
    }];
  });
}

function buildMeetingItems(summaries) {
  if (!summaries || typeof summaries !== 'object') return [];
  const items = [];
  for (const [key, summary] of Object.entries(summaries)) {
    if (!key || typeof key !== 'string') continue;
    const parts = key.split('|');
    if (parts.length < 3) continue;
    const [source, dateStr, ...titleParts] = parts;
    const title = titleParts.join('|');
    const meetingDate = parseDate(dateStr);
    // Only TODAY-and-future meetings in the digest. Previously this allowed
    // 7 days backward, which meant the 2026-05-25 daily blast included
    // meetings from 2026-05-20 — all four of them already past. The digest
    // is for *upcoming* meetings; if a meeting already happened, surfacing
    // it in an email a recipient reads at lunch is actively confusing.
    if (!withinRollingWindow(meetingDate, 0, MAX_FUTURE_DAYS)) continue;
    const sourceLabel = MEETING_SOURCE_LABELS[source] || source;
    items.push({
      title: `[Meeting] ${title} — ${dateStr}`,
      link: `${SITE_URL}/gov-hub.html`,
      pubDate: meetingDate,
      description: `${sourceLabel} • ${dateStr}\n\n${summary || '(see meeting page for details)'}`,
      categories: ['Meeting', sourceLabel].filter(Boolean),
      guid: `${SITE_URL}/meeting/${encodeURIComponent(`${source}|${dateStr}|${title.slice(0, 80)}`)}`,
    });
  }
  // Earliest upcoming first
  items.sort((a, b) => a.pubDate - b.pubDate);
  return items.slice(0, MAX_MEETINGS);
}

/**
 * Compute a "send slot" string for an event based on how far away it is.
 * Embedding the slot in the GUID means Mailchimp sees a NEW item each slot —
 * giving recurring send behaviour without re-sending every single day.
 *
 * Rules (from today's perspective):
 *   today          → slot = today's ISO date  (sends once on the day)
 *   1–7 days away  → slot = ISO week + "a" (Mon) or "b" (Thu) — up to 2x/week
 *   8–30 days away → slot = ISO year-week  — once per week
 *   31–60 days     → slot = year + 2-week block — every other week
 */
function eventSendSlot(eventDate, today) {
  const msPerDay = 86400000;
  const daysAway = Math.round((eventDate - today) / msPerDay);

  if (daysAway <= 0) {
    // Event is today (or past but within lookback)
    return today.toISOString().slice(0, 10);
  }

  // ISO week helper
  function isoWeek(d) {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return [tmp.getUTCFullYear(), Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7)];
  }

  const [yr, wk] = isoWeek(today);
  const weekStr = `${yr}-W${String(wk).padStart(2, '0')}`;

  if (daysAway <= 7) {
    // Up to 2 sends per week: Mon–Wed = slot "a", Thu–Sun = slot "b"
    const dow = today.getUTCDay(); // 0=Sun
    const half = (dow >= 4 || dow === 0) ? 'b' : 'a';
    return `${weekStr}-${half}`;
  }

  if (daysAway <= 30) {
    // Once per week
    return weekStr;
  }

  // Every 2 weeks
  return `${yr}-B${Math.ceil(wk / 2)}`;
}

/**
 * Source priority for cross-source event dedup. Lower wins on the same
 * (normalized-title + date) key. Matches the priority list in
 * gov-helpers.js eventSourcePriority() (events.html dedup).
 *
 * Mirroring keeps the digest and the Events tab consistent — a
 * Sheridan show that's ALSO on telluride.com (the aggregator)
 * renders the Sheridan version on the site AND the Sheridan
 * version in the email.
 */
const EVENT_SOURCE_PRIORITY = {
  wilkinson:           0,
  koto:                1,
  sheridan:            2,
  alibi:               2,
  sherbino:            2,
  tellurideFoundation: 2,
  'TF Foundation':     2,
  musicOnTheGreen:     3,
  mountainvillage:     3,
  community:           3,
  email:               3,
  'telluride-com':     4,
};

function eventPriority(src) {
  if (src == null) return 5;
  const p = EVENT_SOURCE_PRIORITY[src];
  return p != null ? p : 5;
}

function normalizeEventTitle(t) {
  return String(t || '')
    .toLowerCase()
    // Drop a trailing venue suffix like "Tea & Tarot: Wilkinson Library, 2:30-4:30 pm"
    .replace(/:\s*[^:]*library.*$/i, '')
    .replace(/,\s*\d+(:\d+)?\s*-\s*\d+(:\d+)?\s*[ap]\.?m\.?.*$/i, '')
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');
}

function pickEventDate(e) {
  // Accept any of the field aliases the various source schemas use.
  return e.date || e.pubDate || e.startDate || e.Date || e.start_date || e.start;
}

// Classify an event into ONE pilot topic (arts / family / outdoors) for the
// per-topic feeds, or null (→ stays in the main weekly digest only). Order
// matters: kid-specific wins over outdoors wins over arts. The `civic` topic
// is NOT assigned here — it's the Gov-Hub meetings (buildMeetingItems).
// Source-name fallback catches music/arts venues whose event titles are just
// a band name with no obvious keyword (e.g. Music on the Green).
const ARTS_SOURCES = /music on the green|sheridan|alibi|sherbino|opera house/i;
function eventCategory(e) {
  const src = String(e.source || e.sourceLabel || '');
  const t = [e.title, e.description, e.copy, e.location, e.sourceLabel]
    .map((x) => String(x || '')).join(' ').toLowerCase();
  if (/\b(storytime|story time|kids?|children|youth|teens?|toddler|preschool|all[- ]ages|family|families|scouts?|baby|babies|tween)\b/.test(t)) return 'family';
  if (/\b(hike|hiking|trail|trailhead|bike|biking|cycling|ski|skiing|nordic|snowshoe|climb|climbing|river|raft|rafting|fish|fishing|paddle|kayak|run|running|race|5k|10k|marathon|clean[- ]?up|stewardship|archery|birding|wildflower|trek)\b/.test(t)) return 'outdoors';
  if (/\b(concert|live music|music|band|dj|open mic|singer|songwriter|symphony|orchestra|acoustic|jam|film|screening|cinema|movie|gallery|exhibit|exhibition|art walk|artist|theatre|theater|\bplay\b|dance|ballet|opera|festival|fest|jazz|bluegrass|blues|comedy)\b/.test(t)) return 'arts';
  if (ARTS_SOURCES.test(src)) return 'arts';
  return null;
}

function buildEventItems(...sources) {
  const events = sources.flatMap((s) => Array.isArray(s) ? s : []);

  // ── Pass 1: filter window + dedup keyed by (title-key + date) ──
  // Lower-priority source loses on collision; if priorities tie, first-seen wins
  // (sources are passed in priority order in main()).
  const winners = new Map(); // key -> event
  for (const e of events) {
    if (!e || !e.title) continue;
    const eventDate = parseDate(pickEventDate(e));
    if (!withinRollingWindow(eventDate, 0, MAX_EVENT_FUTURE_DAYS)) continue;
    const dateStr = eventDate.toISOString().slice(0, 10);
    const key = `${normalizeEventTitle(e.title)}|${dateStr}`;
    const existing = winners.get(key);
    if (!existing || eventPriority(e.source) < eventPriority(existing.source)) {
      winners.set(key, { ...e, _date: eventDate, _dateStr: dateStr });
    }
  }

  // ── Pass 2: build RSS items ──
  const items = [];
  for (const e of winners.values()) {
    const niceDate = e._date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
    const descParts = [];
    if (e.sourceLabel || e.source) descParts.push(`🎫 ${e.sourceLabel || e.source}`);
    if (e.location) descParts.push(`📍 ${e.location}`);
    if (e.time || e.eventTimes) descParts.push(`🕒 ${e.time || e.eventTimes}`);
    // Blank line then body
    descParts.push('');
    const body = String(e.description || e.copy || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (body) descParts.push(body);
    items.push({
      title: `[${niceDate}] ${e.title}`,
      // Prefer the SOURCE link (Sheridan / Alibi / Wilkinson detail page) so
      // subscribers can click straight through to tickets / RSVPs / details.
      // Only fall back to the local events page when no source URL exists
      // (legacy hand-curated COMMUNITY_EVENTS without href).
      link: e.link || e.href || `${SITE_URL}/events.html`,
      pubDate: e._date,
      description: descParts.join('\n'),
      imageUrl: e.imageUrl || e.img || null,
      _category: eventCategory(e),   // pilot topic key (arts/family/outdoors) or null
      categories: ['Community Event', e.sourceLabel || e.source].filter(Boolean),
      // Stable GUID — each event appears in the email exactly once.
      // Use the normalized title+date so cross-source dupes (Sheridan vs
      // telluride.com vs TT) collapse into one GUID even if they slip
      // through the Pass 1 dedup with a slightly different display title.
      guid: `${SITE_URL}/event/${encodeURIComponent(`${normalizeEventTitle(e.title)}|${e._dateStr}`)}`,
    });
  }
  // Sort by event date ascending — earliest first (most actionable in a digest).
  items.sort((a, b) => a.pubDate - b.pubDate);
  return items.slice(0, MAX_EVENTS);
}

function buildBlogItems(posts) {
  if (!Array.isArray(posts)) return [];
  const items = [];
  for (const p of posts) {
    if (!p || !p.title) continue;
    const postDate = parseDate(p.date);
    if (!withinWindow(postDate, MAX_AGE_DAYS)) continue;
    const desc = p.excerpt || p.summary || (p.body ? String(p.body).replace(/<[^>]+>/g, '').slice(0, 400) : '');
    items.push({
      title: p.title,
      link: p.href || `${SITE_URL}/#blog`,
      pubDate: postDate,
      description: desc,
      categories: ['Blog', p.author].filter(Boolean),
      guid: p.href || `${SITE_URL}/blog/${encodeURIComponent(p.title.slice(0, 80) + '|' + (p.date || ''))}`,
    });
  }
  items.sort((a, b) => b.pubDate - a.pubDate);
  return items.slice(0, MAX_BLOG);
}

// ──────────────────────────────────────────────────────────────
// "Week Ahead" AI lede + notable-meeting flags
// ──────────────────────────────────────────────────────────────

function callClaudeJson(prompt, maxTokens) {
  const body = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens || 800,
    messages: [{ role: 'user', content: prompt }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 45000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message)); return; }
          resolve((json.content?.[0]?.text || '').trim());
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body); req.end();
  });
}

function weekAheadPrompt(meetings, events) {
  return [
    'You are "Rick" — a long-time Telluride local writing the one-paragraph intro to Livable Telluride\'s weekly community email. You\'ve seen it all, you love this valley, and you\'re not cynical but you pay attention when something real is at stake. Voice: warm, plain-spoken, grounded.',
    '',
    'Below are the UPCOMING government meetings and community events for the coming week (Friday through Thursday) across the Telluride region.',
    '',
    'Return ONLY a JSON object (no markdown fence) with exactly two fields:',
    '',
    '1. "lede": a 2-4 sentence (50-90 word) plain-prose intro that orients a busy local. LEAD with the single biggest or most important thing this week, then briefly fold in the rest. Be specific and grounded — only use what\'s in the lists below; never invent times, prices, lineups, vote outcomes, or details you weren\'t given. No greeting, no sign-off, no "Rick here", no calls to action, no emoji.',
    '',
    '2. "notable": an array of the MEETINGS (referenced by their "id") that have a genuinely consequential or actionable item on the agenda — a vote, public hearing, ordinance/code change, contentious land-use or zoning item, budget/mill-levy/tax decision, or an open public-comment opportunity. For each, give a "stake": a one-line (<=15 word) reason a resident should care. ONLY include a meeting if its summary ACTUALLY reveals such an item. If a meeting\'s agenda is "not yet available"/"unavailable"/"TBD"/routine, OMIT it. Returning an empty array is correct and expected when no agendas reveal a real decision.',
    '',
    'MEETINGS:',
    JSON.stringify(meetings, null, 1),
    '',
    'EVENTS:',
    JSON.stringify(events, null, 1),
  ].join('\n');
}

async function generateWeekAhead(meetingItems, eventItems) {
  if (!ANTHROPIC_API_KEY) {
    console.log('  ℹ No ANTHROPIC_API_KEY — skipping Week Ahead lede + flags');
    return null;
  }
  const meetings = meetingItems.map((m, i) => ({
    id: i,
    title: String(m.title || '').replace(/^\[Meeting\]\s*/, ''),
    summary: String(m.description || '').replace(/\s+/g, ' ').trim().slice(0, 400),
  }));
  const events = eventItems.map((e) => ({
    title: String(e.title || '').replace(/^\[[^\]]*\]\s*/, ''),
    when: e.pubDate instanceof Date
      ? e.pubDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
      : '',
    where: (Array.isArray(e.categories) && e.categories[1]) || '',
  }));
  const hash = crypto.createHash('sha1')
    .update(JSON.stringify({ m: meetings, e: events.map((e) => `${e.title}|${e.when}`) }))
    .digest('hex');

  try {
    const cached = JSON.parse(fs.readFileSync(WEEK_AHEAD_CACHE, 'utf8'));
    if (cached && cached.hash === hash && cached.lede) {
      console.log('  ✓ Week Ahead cache hit (lineup unchanged)');
      return { lede: cached.lede, notable: cached.notable || [] };
    }
  } catch (_) { /* no cache yet */ }

  let raw;
  try {
    raw = await callClaudeJson(weekAheadPrompt(meetings, events), 900);
  } catch (e) {
    console.warn(`  ⚠ Week Ahead generation failed: ${e.message} — building feed without it`);
    return null;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim());
  } catch (e) {
    console.warn('  ⚠ Week Ahead JSON parse failed — building feed without it');
    return null;
  }
  if (!parsed || typeof parsed.lede !== 'string' || !parsed.lede.trim()) return null;
  const result = {
    lede: parsed.lede.trim(),
    notable: Array.isArray(parsed.notable)
      ? parsed.notable.filter((n) => n && Number.isInteger(n.id) && typeof n.stake === 'string' && n.stake.trim())
      : [],
  };
  try {
    fs.mkdirSync(path.dirname(WEEK_AHEAD_CACHE), { recursive: true });
    fs.writeFileSync(WEEK_AHEAD_CACHE, JSON.stringify({ hash, ...result }, null, 2) + '\n');
  } catch (_) { /* cache write is best-effort */ }
  console.log(`  ✓ Week Ahead lede generated (${result.notable.length} notable meeting(s) flagged)`);
  return result;
}

// Prepend the lede as the first feed item and flag the notable meetings
// IN PLACE on their meeting objects. Returns nothing; mutates inputs.
// Stable key for "this week" (year + week-of-year), used for the lede GUID
// and to scope the human-edit override to the correct week.
function currentWeekKey() {
  const now = new Date();
  const yr = now.getUTCFullYear();
  return `${yr}-${Math.floor((Date.UTC(yr, now.getUTCMonth(), now.getUTCDate()) - Date.UTC(yr, 0, 1)) / (7 * 86400000))}`;
}

// Human review/edit override. If data/week-ahead-override.json carries a lede
// for the CURRENT week, it replaces the AI-generated one — this is how a
// Thursday-review edit reaches Friday's send. Stale overrides (wrong week)
// are ignored, so last week's edit never leaks into this week.
function applyLedeOverride(weekAhead) {
  const file = path.join(REPO_ROOT, 'data', 'week-ahead-override.json');
  let ov;
  try { ov = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return weekAhead; }
  if (!ov || ov.weekKey !== currentWeekKey() || !ov.lede || !String(ov.lede).trim()) return weekAhead;
  console.log('  ✓ Week Ahead lede OVERRIDDEN by data/week-ahead-override.json (human edit)');
  return {
    lede: String(ov.lede).trim(),
    notable: Array.isArray(ov.notable) ? ov.notable : (weekAhead ? weekAhead.notable : []),
  };
}

function applyWeekAhead(items, meetingItems, weekAhead) {
  if (!weekAhead) return;
  // Flag notable meetings (objects are shared with `items` by reference).
  for (const n of weekAhead.notable || []) {
    const m = meetingItems[n.id];
    if (!m) continue;
    if (!/^⚡/.test(m.title)) m.title = '⚡ ' + m.title;
    m.description = `${m.description}\n\n⚡ Why it matters: ${n.stake.trim()}`;
  }
  // Prepend the lede item so it's always first in the email.
  if (weekAhead.lede) {
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 6));
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const range = `${fmt(now)}–${end.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })}`;
    // Week-stable GUID so Mailchimp sends the lede once per weekly digest.
    const weekKey = currentWeekKey();
    items.unshift({
      title: `📅 The Week Ahead — ${range}`,
      link: `${SITE_URL}/events.html`,
      pubDate: now,
      description: weekAhead.lede,
      categories: ['The Week Ahead'],
      guid: `${SITE_URL}/week-ahead/${weekKey}`,
    });
  }
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Building RSS feed for Mailchimp');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════');

  const src = fs.readFileSync(GOV_HELPERS_JS, 'utf8');
  const tt = extractJsArray(src, 'TELLURIDE_TIMES_ARTICLES') || [];
  const koNews = extractJsArray(src, 'KOTO_NEWSCASTS') || [];
  const koFeat = extractJsArray(src, 'KOTO_FEATURED_STORIES') || [];
  const smbf = extractJsArray(src, 'SMB_FORUM_ARTICLES') || [];
  const summaries = extractJsObject(src, 'MANUAL_SUMMARIES') || {};
  const events = extractJsArray(src, 'COMMUNITY_EVENTS') || [];
  const blogPosts = extractJsArray(src, 'BLOG_POSTS') || [];

  // ── Broaden the digest (2026-05-29): pull the next 7 days of events
  //    from EVERY live source the Events tab reads, not just the
  //    hand-curated COMMUNITY_EVENTS + email-submitted JSON. Listed in
  //    PRIORITY ORDER (highest-priority venue first) so when the dedup
  //    map sees a cross-source duplicate it keeps the authoritative
  //    source's link/image/description. The Mailchimp Weekly campaign
  //    uses this as a "what's coming up at the venues" section.
  const wilkinsonEvents = extractJsArray(src, 'WILKINSON_EVENTS') || [];
  const kotoEvents      = extractJsArray(src, 'KOTO_COMMUNITY_EVENTS') || [];
  const sheridanEvents  = extractJsArray(src, 'SHERIDAN_EVENTS') || [];
  const alibiEvents     = extractJsArray(src, 'ALIBI_EVENTS') || [];
  const sherbinoEvents  = extractJsArray(src, 'SHERBINO_EVENTS') || [];
  const tfEvents        = extractJsArray(src, 'TELLURIDE_FOUNDATION_EVENTS') || [];  // const name is TELLURIDE_…, not TF_… (the content-refresh scraper still writes to the defunct TF_ name, leaving this hand-curated const intact)
  const motgEvents      = extractJsArray(src, 'MUSIC_ON_THE_GREEN') || [];
  const tcomEvents      = extractJsArray(src, 'TELLURIDE_COM_EVENTS') || [];

  // community-events.json holds events submitted via email-to-events pipeline
  let jsonEvents = [];
  try {
    if (fs.existsSync(COMMUNITY_EVENTS_JSON)) {
      jsonEvents = JSON.parse(fs.readFileSync(COMMUNITY_EVENTS_JSON, 'utf8')) || [];
      if (!Array.isArray(jsonEvents)) jsonEvents = [];
    }
  } catch (e) {
    console.warn(`  community-events.json parse error: ${e.message}`);
  }

  const totalEventInputs =
    events.length + jsonEvents.length +
    wilkinsonEvents.length + kotoEvents.length +
    sheridanEvents.length + alibiEvents.length +
    sherbinoEvents.length + tfEvents.length +
    motgEvents.length + tcomEvents.length;

  console.log(`  Loaded: ${tt.length} TT/gov articles, ${koNews.length} KOTO newscasts, ${koFeat.length} KOTO features, ${smbf.length} SMBF articles, ${Object.keys(summaries).length} meeting summaries, ${totalEventInputs} event candidates (across 10 source arrays), ${blogPosts.length} blog posts`);

  // Build meetings + events separately so the per-topic feeds below can
  // reuse them (civic = meetings; arts/family/outdoors = classified events).
  const meetingItems = buildMeetingItems(summaries);
  // Event arrays in PRIORITY ORDER — Wilkinson (0) before KOTO (1)
  // before venues (2) before Music on the Green (3) before hand-curated
  // / email (3) before telluride.com aggregator (4). When the dedup
  // map sees a collision, the EARLIER source wins.
  const eventItems = buildEventItems(
    wilkinsonEvents,
    kotoEvents,
    sheridanEvents,
    alibiEvents,
    sherbinoEvents,
    tfEvents,
    motgEvents,
    events,
    jsonEvents,
    tcomEvents,
  );

  // "Week Ahead" AI lede + notable-meeting flags (best-effort; null if the
  // API key is absent or generation fails). Applied to the main feed below.
  let weekAhead = null;
  try { weekAhead = await generateWeekAhead(meetingItems, eventItems); }
  catch (e) { console.warn(`  ⚠ Week Ahead skipped: ${e.message}`); }
  // A human edit for this week (data/week-ahead-override.json) wins over the AI.
  weekAhead = applyLedeOverride(weekAhead);

  // Main digest feed: upcoming Gov-Hub meetings + community events.
  // News was REMOVED 2026-06-09 per request — the weekly email is now a
  // forward-looking "what's coming up" digest only. The news builders and
  // the tt/koNews/koFeat/smbf extracts above are left in place but unused,
  // so re-enabling news is a one-line restore here.
  let items = [
    ...meetingItems,
    ...eventItems,
  ];

  // De-duplicate by guid, keeping the later pubDate on a collision. The feed
  // is now entirely forward-looking, so sort SOONEST-first — a subscriber
  // reads the week chronologically (nearest items at the top) instead of
  // farthest-out-first.
  const byGuid = new Map();
  for (const it of items) {
    const cur = byGuid.get(it.guid);
    if (!cur || (it.pubDate && cur.pubDate && it.pubDate > cur.pubDate)) byGuid.set(it.guid, it);
  }
  items = [...byGuid.values()]
    .filter((it) => it.pubDate instanceof Date && !isNaN(it.pubDate.getTime()))
    .sort((a, b) => a.pubDate - b.pubDate)
    .slice(0, MAX_ITEMS);

  // Flag the notable meetings (in place) and prepend the Week Ahead lede so
  // it's the first thing in the email.
  applyWeekAhead(items, meetingItems, weekAhead);

  // No minimum-item filler — if nothing is genuinely new, Mailchimp should not send.

  console.log(`  Emitting ${items.length} items to feed.xml (max: ${MAX_ITEMS})`);

  // ── feed-blog.xml RETIRED 2026-04-30 ──
  // Blog posts are now sent as regular Mailchimp campaigns (the user authors
  // them in the Mailchimp UI, sends them to the audience directly, and
  // content-refresh.js Task 6 syncs the campaign archive feed back into
  // BLOG_POSTS so they appear on the website's Blog tab). The separate
  // RSS-driven Blog Blast campaign is no longer needed, so we no longer
  // emit feed-blog.xml. Keeping buildBlogItems in case we want to re-enable.
  // To re-enable: uncomment the writeRssFeed() call below.
  //
  //   let blogItems = buildBlogItems(blogPosts)
  //     .filter((it) => it.pubDate instanceof Date && !isNaN(it.pubDate.getTime()))
  //     .sort((a, b) => b.pubDate - a.pubDate);
  //   writeRssFeed(BLOG_FEED_OUT, BLOG_FEED_TITLE, BLOG_FEED_DESC, `${SITE_URL}/feed-blog.xml`, blogItems);

  writeRssFeed(FEED_OUT, FEED_TITLE, FEED_DESC, `${SITE_URL}/feed.xml`, items);

  // ── Per-topic event feeds (pilot) ──
  // civic = the upcoming Gov-Hub meetings; arts/family/outdoors = events
  // classified by eventCategory(). Each feeds one RSS-driven Mailchimp
  // campaign targeting the matching "Event Topics" interest group. We always
  // write the file (even with 0 items) so the feed URL resolves for Mailchimp;
  // an empty feed simply means that campaign has nothing to send.
  for (const f of CATEGORY_FEEDS) {
    // Every topic feed ALSO carries the Gov-Hub meetings, so a subscriber to
    // any single interest (arts/family/outdoors) still sees upcoming government
    // meetings + comment deadlines in that email. (civic IS the meetings.)
    const catItems = (f.key === 'civic'
      ? meetingItems.slice()
      : eventItems.filter((it) => it._category === f.key).concat(meetingItems))
      .filter((it) => it.pubDate instanceof Date && !isNaN(it.pubDate.getTime()))
      .sort((a, b) => a.pubDate - b.pubDate)   // earliest-upcoming first
      .slice(0, MAX_ITEMS);
    const outPath = path.join(REPO_ROOT, f.file);
    writeRssFeed(outPath, f.title, f.desc, `${SITE_URL}/${f.file}`, catItems);
    console.log(`  Emitting ${catItems.length} items to ${f.file}`);
  }
}

function writeRssFeed(outPath, title, desc, selfUrl, items) {
  const lastBuild = new Date();
  const itemsXml = items.map((it) => {
    const cats = (it.categories || []).map((c) => `      <category>${xmlEscape(c)}</category>`).join('\n');
    // Make image URL absolute (site-relative paths need the domain prepended)
    let imgUrl = it.imageUrl || null;
    if (imgUrl && imgUrl.startsWith('/')) imgUrl = SITE_URL + imgUrl;
    const imgHtml = imgUrl ? `<img src="${imgUrl}" alt="" width="600" style="max-width:600px;width:100%;height:auto;display:block;margin-bottom:8px;" />` : '';
    const descHtml = imgHtml + (it.description || '');
    const mediaTag = imgUrl ? `\n      <media:content url="${xmlEscape(imgUrl)}" medium="image" />` : '';
    return `    <item>
      <title>${xmlEscape(it.title)}</title>
      <link>${xmlEscape(it.link)}</link>
      <guid isPermaLink="false">${xmlEscape(it.guid)}</guid>
      <pubDate>${rfc822(it.pubDate)}</pubDate>
      <description><![CDATA[${descHtml}]]></description>${mediaTag}
${cats}
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${xmlEscape(title)}</title>
    <link>${SITE_URL}</link>
    <atom:link href="${selfUrl}" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(desc)}</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
    <ttl>360</ttl>
${itemsXml}
  </channel>
</rss>
`;

  fs.writeFileSync(outPath, xml);
  console.log(`✅ Wrote ${outPath} (${xml.length} bytes)`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
