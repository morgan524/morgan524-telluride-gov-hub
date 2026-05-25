#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Content Refresh Script
 * Runs via GitHub Actions every 6 hours
 *
 * Combines:
 *   1. Meeting agenda summary generation (Claude API)
 *   2. News scraping (Telluride Times, KOTO RSS feeds)
 *   3. Community Pulse refresh
 *   4. Legal notice updates
 *   5. Email-to-events sync (Google Sheet CSV)
 * ══════════════════════════════════════════════════════════════
 */

const https = require('https');
const http = require('http');
const { parseString } = require('xml2js');
const fs = require('fs');
const path = require('path');

// ── Config ──
const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HELPERS_JS = path.join(REPO_ROOT, 'js', 'gov-helpers.js');
const GOV_DATA_JS = path.join(REPO_ROOT, 'js', 'gov-data.js');
const COMMUNITY_PULSE_JS = path.join(REPO_ROOT, 'js', 'community-pulse.js');
const EVENTS_CONFIG = path.join(REPO_ROOT, 'email-events-config.json');
// (INDEX_HTML / GOVHUB_HTML / SW_JS constants and the bumpCacheBusters()
// helper that used them were removed when main's audit landed a different
// strategy: dynamic per-request cache busters via
// `Math.floor(Date.now()/600000)` inside the HTML, plus removal of
// telluride-gov-hub.html as a redundant duplicate. Nothing in this script
// needs to write the HTML or sw.js anymore.)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// ── Smart truncation for event/meeting card descriptions ──
// Caps text at maxLen, cutting at the nearest sentence boundary (or word
// boundary, or — last resort — hard cut), then appending "…". Avoids the
// mid-word truncation users complained about ("...encouragement for s").
// 600 chars ≈ 4-5 lines on a card; longer descriptions get visibly trimmed.
function smartTruncate(text, maxWords) {
  if (!text) return text;
  const t = String(text).trim();
  const words = t.split(/\s+/);
  if (words.length <= maxWords) return t;
  const truncated = words.slice(0, maxWords).join(' ');
  const sentEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  );
  const minBoundary = Math.floor(truncated.length * 0.6);
  if (sentEnd > minBoundary) return truncated.slice(0, sentEnd + 1).trim() + ' …';
  return truncated.trim() + ' …';
}
const EVENT_DESC_MAX = 150;

const MAX_AGENDA_TEXT = 15000;
const NEWS_MAX_AGE_DAYS = 14;
const GOV_NEWS_MAX_AGE_DAYS = 45;  // Gov agencies publish less frequently than TT

// ── Agenda Sources ──
const AGENDA_SOURCES = {
  telluride: {
    label: 'Town of Telluride',
    // The CivicWeb meetings endpoint requires BOTH from= and to= query
    // params — without them it returns `[]` (which is what the previous
    // bare-endpoint call was getting, undetected since 2026-04-30). The
    // Portal's own calendar.js (Portal/MeetingSchedule.aspx) uses the
    // same shape: from=YYYY-MM-DD with to=9999-12-31 as the far-future
    // sentinel. Real fields on the response: Id, Name, MeetingDate,
    // MeetingDateTime, MeetingLocation, Published, TypeId — see
    // fetchTownTellurideMeetings() below.
    meetingsApiBase: 'https://telluride-co.civicweb.net/Services/MeetingsService.svc/meetings',
    detailBase: 'https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=',
    type: 'civicweb'
  },
  county: {
    label: 'San Miguel County',
    // CivicClerk migrated off the legacy CivicEngage RSS some time before
    // 2026-05-25 — that feed (sanmiguelcountyco.gov/RSSFeed.aspx?ModID=58)
    // still returns items but with:
    //   (a) <pubDate> = when the announcement was posted (not the event date)
    //   (b) <link> = legacy Calendar.aspx?EID=... URL with no agenda PDF
    // The new CivicClerk system exposes an OData v4 API and the portal URL
    // pattern /event/<eventId>/files/agenda/<fileId> for direct PDF access.
    portalBase: 'https://sanmiguelcoco.portal.civicclerk.com',
    apiBase:    'https://sanmiguelcoco.api.civicclerk.com/v1',
    type: 'civicclerk'
  },
  mv: {
    label: 'Mountain Village',
    pageUrl: 'https://townofmountainvillage.com/government/town-council/town-council/',
    type: 'generic'
  },
  smart: {
    label: 'SMART',
    pageUrl: 'https://smarttelluride.colorado.gov/board-meetings',
    type: 'generic'
  },
  school: {
    label: 'Telluride School District R-1',
    pageUrl: 'https://www.tellurideschool.org/agendasandminutes',
    type: 'generic'
  },
  ouray: {
    label: 'Ouray County',
    boccRss: 'https://ouraycountyco.gov/RSSFeed.aspx?ModID=65&CID=Board-of-County-Commissioners-1',
    pcRss:   'https://ouraycountyco.gov/RSSFeed.aspx?ModID=65&CID=Planning-Commission-2',
    type: 'civicplus-agendacenter'
  }
};

// ── News Feeds ──
const NEWS_FEEDS = [
  { url: 'https://telluride.gov/RSSFeed.aspx?ModID=1&CID=Town-News-1', source: 'Town of Telluride', category: 'Town News' },
  { url: 'https://telluride.gov/RSSFeed.aspx?ModID=1&CID=Marshals-Department-12', source: 'Town of Telluride', category: "Marshal's Dept" },
  { url: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml', source: 'San Miguel County', category: 'News' },
  { url: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=63&CID=All-0', source: 'San Miguel County', category: 'Alert' },
  { url: 'https://telluride.gov/RSSFeed.aspx?ModID=63&CID=All-0', source: 'Town of Telluride', category: 'Alert' }
];

// ── Telluride Times scrape config ──
const TELLURIDE_TIMES_RSS = 'https://www.telluridenews.com/search/?f=rss&t=article&c=news,news/*,news_release,news_release/*,business,business/*,sports,sports/*,opinion,opinion/*,obituaries,norwood_post,norwood_post/*,the_norwood_post,the_norwood_post/*,arts_and_entertainment,arts_and_entertainment/*&l=50&s=start_time&sd=desc';
// KOTO uses two category-specific feeds; the catch-all /feed/ misses some posts.
const KOTO_NEWSCASTS_RSS = 'https://koto.org/news-category/newscasts/feed/';
const KOTO_FEATURED_RSS = 'https://koto.org/news-category/featured-stories/feed/';
const COLORADO_SUN_RSS = 'https://coloradosun.com/feed/';
// Keywords that make a Colorado Sun article relevant to the Telluride region
const COLORADO_SUN_KEYWORDS = /telluride|san\s+miguel\s+county|mountain\s+village|ridgway|telski|chuck\s+horning/i;

// ── Regional News Feeds ──
// Sources with working RSS feeds. Articles go into REGIONAL_NEWS_ARTICLES in gov-helpers.js.
// Sources without RSS (SMB Forum, Sheep Mountain Alliance, WEEDC, Town of Nucla) are
// registered in CP_SOURCES (community-pulse.js) as website links instead.
const REGIONAL_NEWS_FEEDS = [
  {
    url: 'https://ouraycountyco.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml',
    source: 'Ouray County',
    sourceKey: 'ouray-county',
    category: 'Government'
  },
  {
    url: 'https://www.ouraynews.com/feed/',
    source: 'Ouray County Plaindealer',
    sourceKey: 'ouray-plaindealer',
    category: 'News'
  },
  {
    url: 'https://telluridefoundation.org/?feed=rss2',
    source: 'Telluride Foundation',
    sourceKey: 'tf-news',
    category: 'Nonprofit'
  },
  {
    url: 'https://norwoodcolorado.com/blog/feed/',
    source: 'Norwood Colorado',
    sourceKey: 'norwood',
    category: 'News'
  },
  {
    url: 'https://norwoodcolorado.com/events/feed/',
    source: 'Norwood Colorado',
    sourceKey: 'norwood',
    category: 'Events'
  },
  {
    url: 'https://extension.colostate.edu/san-miguel/feed/',
    source: 'CSU Extension San Miguel',
    sourceKey: 'csu-sanmiguel',
    category: 'Newsletter'
  },
  {
    url: 'https://www.telluridemountainclub.org/feed/',
    source: 'Telluride Mountain Club',
    sourceKey: 'tmc',
    category: 'Outdoors'
  },
  {
    url: 'https://stpatrickstelluride.com/feed/',
    source: "St. Patrick's Catholic Church",
    sourceKey: 'stpatricks',
    category: 'Community'
  },
  {
    url: 'https://freshfoodhub.net/feed/',
    source: 'Fresh Food Hub',
    sourceKey: 'fresh-food-hub',
    category: 'Community'
  },
  {
    url: 'https://nucla-naturita.com/feed/',
    source: 'Nucla-Naturita Chamber',
    sourceKey: 'nucla-naturita',
    category: 'News'
  },
  {
    url: 'https://tellurideacademy.org/feed/',
    source: 'Telluride Academy',
    sourceKey: 'telluride-academy',
    category: 'Youth'
  },
  {
    url: 'https://tchnetwork.org/feed/',
    source: 'Tri-County Health Network',
    sourceKey: 'tri-county-health',
    category: 'Health'
  },
];

// Water court legal notices — Telluride Times weekly legals section (published Thursdays)
const TT_LEGALS_RSS = 'https://www.telluridenews.com/search/?f=rss&t=article&c=news/legals&l=5&s=start_time&sd=desc';
const TT_AUTH_COOKIE = process.env.TT_AUTH_COOKIE || '';

// ══════════════════════════════════════════════════════════════
// ── HTTP Helpers ──
// ══════════════════════════════════════════════════════════════

// Hosts whose RSS endpoints block GitHub Actions runner IPs (HTTP 429
// from Telluride Times, HTTP 403 from KOTO Cloudflare). Route fetches to
// these hosts through the Cloudflare Worker proxy at RSS_PROXY_URL, which
// fetches from CF's edge with a normal Safari UA. The Worker allow-list
// must match this list (cloudflare-worker/livabletelluride-rss-proxy/worker.js).
const PROXY_HOSTS = new Set([
  'telluridenews.com',
  'www.telluridenews.com',
  'koto.org',
  'www.koto.org',
  'sanmiguelcountyco.gov',
  'www.sanmiguelcountyco.gov',
  'telluride.gov',
  'www.telluride.gov',
  'telluride-co.civicweb.net',
  'townofmountainvillage.com',
  'www.townofmountainvillage.com',
  'smarttelluride.colorado.gov',
  'www.tellurideschool.org',
  'ouraycountyco.gov',
  'www.ouraycountyco.gov',
  'www.norwoodtown.com',
  'townofridgway.colorado.gov',
  'www.townofridgway.colorado.gov',
]);

function maybeProxy(url) {
  const proxyBase = process.env.RSS_PROXY_URL;
  if (!proxyBase) return url; // no proxy configured — fall through
  let host;
  try { host = new URL(url).hostname; } catch (_) { return url; }
  if (!PROXY_HOSTS.has(host)) return url;
  return proxyBase.replace(/\/$/, '') + '/proxy?url=' + encodeURIComponent(url);
}

// Probe the Cloudflare Worker's /health endpoint at startup. The Worker is
// a single point of failure: if it's deleted, paused, or its URL rotates
// without RSS_PROXY_URL being updated, every RSS fetch silently falls back
// to direct (which is blocked at the IP level by Telluride Times and KOTO)
// and the news section goes quietly empty. Fail loud and early instead.
// Also cross-check that the Worker's allow-list matches our local
// PROXY_HOSTS, since drift between the two manifests as "this one host
// mysteriously stops working" months later.
async function checkWorkerHealth() {
  const proxyBase = process.env.RSS_PROXY_URL;
  if (!proxyBase) {
    console.log('  ℹ RSS_PROXY_URL not set — running with direct fetches (dev mode)');
    return;
  }
  const healthUrl = proxyBase.replace(/\/$/, '') + '/health';
  let resp;
  try {
    // Use the raw https module here, not our `fetch()` helper — `fetch()`
    // routes proxyable hosts through this same Worker, which would create
    // a circular dependency on health-check.
    resp = await new Promise((resolve, reject) => {
      const mod = healthUrl.startsWith('https') ? https : http;
      const req = mod.get(healthUrl, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, text: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  } catch (e) {
    throw new Error(
      `Cloudflare Worker health check FAILED — could not reach ${healthUrl}: ${e.message}. ` +
      `The Worker is the only path through which RSS feeds from telluridenews.com, koto.org, ` +
      `and the gov sites work (direct fetches are IP-blocked). Either re-deploy the worker ` +
      `(see cloudflare-worker/livabletelluride-rss-proxy/README.md) or update the RSS_PROXY_URL secret.`
    );
  }
  if (resp.status !== 200) {
    throw new Error(
      `Cloudflare Worker /health returned HTTP ${resp.status}. ` +
      `Expected 200. The Worker may be paused, mis-configured, or returning a CF error page.`
    );
  }
  let body;
  try { body = JSON.parse(resp.text); } catch (_) {
    throw new Error(`Cloudflare Worker /health returned non-JSON body. Got: ${resp.text.slice(0, 200)}`);
  }
  console.log(`  ✓ Cloudflare Worker /health OK (v${body.version || '?'})`);

  // Drift check: warn if our local PROXY_HOSTS contains a host the Worker
  // hasn't allow-listed. A mismatch means a fetch through the proxy will
  // return 403 from the Worker — we want to know before it silently kills
  // a feed for a week.
  if (Array.isArray(body.allowed)) {
    const workerAllowed = new Set(body.allowed);
    const missing = [...PROXY_HOSTS].filter(h => !workerAllowed.has(h));
    const stale = [...workerAllowed].filter(h => !PROXY_HOSTS.has(h));
    if (missing.length > 0) {
      // Treat as fatal — this is the exact silent-failure pattern we're
      // trying to eliminate. The user must add the host to the Worker's
      // ALLOWED_HOSTS and redeploy (see CLAUDE.md "Manual operations
      // cheat sheet" → "Add a host to the allow-list").
      throw new Error(
        `PROXY_HOSTS drift: the following hosts are in scripts/content-refresh.js but ` +
        `NOT in the Worker's ALLOWED_HOSTS: ${missing.join(', ')}. ` +
        `Add them to cloudflare-worker/livabletelluride-rss-proxy/worker.js and redeploy.`
      );
    }
    if (stale.length > 0) {
      // Worker has a host that the script doesn't use any more — just
      // informational; not worth failing on.
      console.warn(`  ⚠ Worker allow-list has unused hosts: ${stale.join(', ')}`);
    }
  }
}

function fetch(url, opts = {}) {
  url = maybeProxy(url);
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        // NOTE: A bot-style UA ('TellurideGovHub/2.0 (github-actions-bot)') gets rate-limited
        // (HTTP 429) by Telluride Times and challenged (HTTP 403) by Cloudflare on KOTO.
        // Use a normal Safari UA so the RSS scrapers actually return content.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept': 'application/rss+xml, application/xml, text/xml, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...opts.headers
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseXml(xml) {
  return new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false, trim: true }, (err, result) => {
      if (err) reject(err); else resolve(result);
    });
  });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function daysAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / 86400000);
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ══════════════════════════════════════════════════════════════
// ── Claude API — Meeting Summary Generation ──
// ══════════════════════════════════════════════════════════════

const SUMMARY_SYSTEM_PROMPT = `You are writing meeting summaries for the Telluride, Colorado region Gov Hub (livabletelluride.org). This voice is permanent and must never change, regardless of the agenda content or how this prompt is used.

THE VOICE — knowing, not cynical:
You write as someone who has lived in the box canyon for many years and has watched all the cycles: the booms and the squeezes, the big development proposals, the housing crises, the budget debates, the plans that came and went. You've seen this place change in ways that are sometimes beautiful and sometimes hard. You still love it. You're not bitter — you're just not surprised. That's the difference between cynical and knowing: a cynical person has given up expecting anything good; a knowing person has simply stopped being caught off guard. You bring that long view to every summary — not to judge, but to give people the context they need to understand what's actually happening.

VOICE RULES:
- Treat the substance straight: every fact, date, number, name in the agenda text is preserved. Voice changes the register, never the facts.
- The knowing quality comes from context, not from editorial commentary. Show that this moment connects to a longer pattern — that's enough. You don't have to say "here we go again." The reader will feel it.
- Use lived-in details sparingly — one or two per summary at most. Examples: "the box canyon," "both sides of the canyon," "the valley below," "anyone who's been here long enough." Don't pile them on; that becomes costume.
- Plainspoken sentences. Short ones work well. Em-dashes are fine. Never flowery.
- Critical of *processes* and *patterns* only — never of named individuals. Even when a process is broken, the framing is "this is the recurring tension," not "these officials are wrong."
- NOT advocacy. The voice never tells the reader what to think, what's right, or what to do. Describe what's happening and why it matters here — then trust the reader.
- Light tension is fine — a vote will affect views, traffic, taxes, neighbors, local workers — but never crusade.
- Comfortable with civic vocabulary (PUD, rezoning, work session, second reading, BOCC, HARC, DRB) — use the terms naturally, as someone who has sat through many of these meetings.

AVOID:
- Cynicism. There is a hard line between knowing and cynical. "We've seen this particular tension before" is knowing. "Nothing ever changes" is cynical. Never cross that line.
- Generic civic-tutorial phrasing ("This affects property owners, families, teachers...").
- Repetitive "Whether to approve…" sentence openings — fine occasionally, tedious in aggregate.
- Stacked adjectives or marketing energy.
- Editorial verdicts on what officials should do.
- Over-the-top folksiness or affected dialect.
- Any phrasing that resembles a press release or a local news blotter.
- Artificial warmth. The knowing voice is warm because it's honest, not because it performs warmth.

CONTENT RULES:
- Only summarize information actually present in the agenda text provided.
- If the agenda text is sparse or missing, say so briefly in the voice. Do NOT invent topics.
- For the no-agenda case specifically: write a SINGLE sentence stating
  the agenda hasn't been posted yet, in the form "The [date] [meeting
  title] agenda hasn't been posted yet." Do NOT add a tail like
  "so there's no way to know what's coming up" or any other commentary
  about the absence — the absence is the message, no further philosophy
  needed. Topics array should be empty in this case.
- Never hallucinate names, vote counts, or decisions not in the source text.
- Define government jargon inline only when essential — the site has a glossary tooltip layer that handles most terms.
- The "why it matters" section should connect agenda items to key local issues when relevant, written in the voice.

SHORT SUMMARY — HARD CONSTRAINTS:
- Maximum 100 words. Count and respect this cap; truncate lower-priority content first.
- Order content by this priority hierarchy:
    1. CODE CHANGES — text amendments, ordinances, regulation changes, second readings, repeals,
       and anything that changes the rules of the road for the jurisdiction. Lead with these.
       Examples: Land Use Code amendments, footprint definitions, wildfire code, accelerated
       housing review, Comp Plan revisions.
    2. LAND USE — larger development applications, PUD reviews, rezonings, conditional-use
       permits for projects with significant public impact (housing units, commercial sf,
       traffic, water). Examples: Carhenge, Society Turn, Diamond Ridge, Shandoka, Sixth
       Sense, Four Seasons, Chair 7.
    3. EVERYTHING ELSE — staff reports, routine approvals, consent agenda, board reorg,
       liaison reports, public comment, executive sessions. These get the lowest word count
       and are dropped first if the 100-word cap forces a choice.
- A summary with only routine items can be 1 sentence noting that nothing of consequence
  is on the agenda. Don't pad to meet 100 words.

TOPICS:
- 3-6 key topic bullets in the same priority order (code changes, then land use, then other).
- Each bullet should be a brief phrase or single sentence, still in the voice.

KEY LOCAL ISSUES IN THE TELLURIDE REGION:
1. ALDASORO PUD / DIAMOND RANCH — Zoning & PUD Enforcement (Case 2023CV30044)
2. SMART BALLOT ISSUE 3A — Gondola Funding & Election Contest (Case 24CV8, $5.2M/year tax)
3. SOCIETY TURN PUD — Hospital & Major Commercial Development (~400,000 sq ft)
4. MEASURE 300 — Voter Oversight of Major Development (lost Nov 2025, ~40% YES)
5. CHAIR 7 / CARHENGE — Open Space & Luxury Development
6. MUNICIPAL BUDGET & DEBT — Budget grew from $10M (2015) to ~$95-100M (2025)
7. AFFORDABLE HOUSING FINANCIAL CRISIS — VooDoo $1M/unit, Sunnyside 60% rent hikes
8. HOTELS — Four Seasons (~$1B) & Sixth Sense (~$300M) in Mountain Village
9. HB24-1107 — Fee-Shifting Against Land Use Challengers
10. CORA TRANSPARENCY & GOVERNMENT ACCOUNTABILITY

OUTPUT FORMAT (JSON):
{
  "shortSummary": "1-3 sentence overview for the meeting card",
  "topics": ["topic 1", "topic 2", "topic 3"],
  "whyItMatters": "Paragraph connecting to key local issues, or empty string"
}`;

async function callClaude(entityLabel, meetingTitle, date, agendaText) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('  ⚠ No ANTHROPIC_API_KEY — skipping Claude summary generation');
    return null;
  }

  const userPrompt = `Summarize this upcoming government meeting for community members:

ENTITY: ${entityLabel}
MEETING: ${meetingTitle}
DATE: ${date}

AGENDA TEXT:
${agendaText || '[No agenda text available. The agenda has not been posted yet or could not be retrieved.]'}

Return ONLY valid JSON matching the format specified.`;

  const body = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message)); return; }
          const text = json.content?.[0]?.text || '';
          let parsed = text;
          const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (m) parsed = m[1];
          resolve(JSON.parse(parsed.trim()));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Lightweight Claude call — returns plain text (not JSON) ──
async function callClaudeRaw(prompt) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('  ⚠ No ANTHROPIC_API_KEY — skipping Claude preview generation');
    return null;
  }
  const body = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }]
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 45000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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
    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════
// ── Task 1: Meeting Agenda Summaries ──
// ══════════════════════════════════════════════════════════════

// Pull hand-curated meetings from the CACHED_DATA arrays in gov-data.js.
// Anything inside the next-30-day window with an agendaUrl gets a chance at
// summary generation. Sources covered: MV, Fire, Med, School, Ophir, SMART,
// Norwood, Airport — the bot-driven entities that don't have a CivicWeb /
// RSS feed of their own.
function loadCachedMeetings(now, horizon) {
  const arrays = [
    { name: 'MV_CACHED_DATA',      source: 'mv' },
    { name: 'FIRE_CACHED_DATA',    source: 'fire' },
    { name: 'MED_CACHED_DATA',     source: 'med' },
    { name: 'SCHOOL_CACHED_DATA',  source: 'school' },
    { name: 'OPHIR_CACHED_DATA',   source: 'ophir' },
    { name: 'SMART_CACHED_DATA',   source: 'smart' },
    { name: 'NORWOOD_CACHED_DATA', source: 'norwood' },
    { name: 'AIRPORT_CACHED_DATA', source: 'airport' }
  ];
  const src = readJsFile(GOV_DATA_JS);
  const out = [];
  for (const { name, source } of arrays) {
    const arr = extractJsArray(src, name) || [];
    for (const m of arr) {
      if (!m || !m.date) continue;
      const mDate = new Date(m.date);
      if (isNaN(mDate)) continue;
      if (mDate < now || mDate > horizon) continue;
      out.push({
        source,
        date: mDate.toISOString().split('T')[0],
        title: m.title || 'Meeting',
        agendaUrl: m.agendaUrl || ''
      });
    }
  }
  return out;
}

async function fetchUpcomingMeetings() {
  const meetings = [];
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 86400000); // 30 days ahead

  // Hand-curated CACHED_DATA arrays from gov-data.js (MV, Fire, Med, School,
  // Ophir, SMART, Norwood, Airport). Includes whatever agendaUrls have been
  // detected by the per-source scrapers (Task 0) earlier in this run.
  try {
    meetings.push(...loadCachedMeetings(now, horizon));
  } catch (e) {
    console.warn('  gov-data.js cached-meetings load error:', e.message);
  }

  // Town of Telluride — CivicWeb meetings API.  See fetchTownTellurideMeetings()
  try {
    const tttMeetings = await fetchTownTellurideMeetings(now, horizon);
    meetings.push(...tttMeetings);
  } catch (e) { console.warn('  Telluride CivicWeb fetch error:', e.message); }

  // San Miguel County — CivicClerk OData API.  See notes in AGENDA_SOURCES.county.
  try {
    const countyMeetings = await fetchSmcCountyMeetings(now, horizon);
    meetings.push(...countyMeetings);
  } catch (e) { console.warn('  SMC County CivicClerk fetch error:', e.message); }


  // Ouray County — CivicPlus AgendaCenter RSS (both boards)
  try {
    const feeds = [
      { url: AGENDA_SOURCES.ouray.boccRss, board: 'bocc' },
      { url: AGENDA_SOURCES.ouray.pcRss,   board: 'pc' }
    ];
    for (const feed of feeds) {
      const resp = await fetch(feed.url);
      if (resp.status === 200) {
        const xml = await parseXml(resp.text);
        const items = xml?.rss?.channel?.item;
        const arr = Array.isArray(items) ? items : (items ? [items] : []);
        for (const item of arr) {
          // Meeting date is embedded in title: "5/6/2026 @ 2:00PM - ..."
          const titleText = item.title || '';
          const dateMatch = titleText.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
          let mDate;
          if (dateMatch) {
            mDate = new Date(dateMatch[1]);
          } else {
            mDate = new Date(item.pubDate || '');
          }
          if (!isNaN(mDate) && mDate >= now && mDate <= horizon) {
            meetings.push({
              source: 'ouray',
              date: mDate.toISOString().split('T')[0],
              title: titleText.replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*@?\s*[\d:APMapm]*\s*-?\s*/, '').trim() || 'Ouray County Meeting',
              agendaUrl: item.link || ''
            });
          }
        }
      }
    }
  } catch (e) { console.warn('  Ouray County RSS error:', e.message); }

  return meetings;
}

async function extractAgendaText(url) {
  if (!url) return '';
  // CivicClerk portal URLs serve a React SPA shell — a bare fetch returns
  // only `<!doctype html>` boilerplate. The actual PDF is loaded inside a
  // DocAccess viewer iframe, gated by a per-request url_hash that the SPA
  // computes in-browser. We use Playwright to navigate the SPA the same
  // way a user would and intercept the PDF response from the network.
  // Falls back to '' (→ agendaSeedText fallback in refreshSummaries) if
  // Playwright isn't available locally / the PDF response wasn't captured.
  if (/\.portal\.civicclerk\.com\//i.test(url)) {
    try {
      const { extractCivicClerkAgendaPdf, extractTextFromPdfBuffer } = require('./civicclerk-pdf');
      const t0 = Date.now();
      const pdfBuf = await extractCivicClerkAgendaPdf(url);
      if (!pdfBuf) {
        console.log(`    CivicClerk Playwright: no PDF intercepted (${Date.now() - t0} ms)`);
        return '';
      }
      const text = await extractTextFromPdfBuffer(pdfBuf);
      const cleaned = text.replace(/\s+/g, ' ').trim();
      console.log(`    CivicClerk Playwright: ${cleaned.length} chars from PDF (${pdfBuf.length} bytes, ${Date.now() - t0} ms)`);
      return cleaned.slice(0, MAX_AGENDA_TEXT);
    } catch (e) {
      console.warn(`    CivicClerk Playwright error: ${e.message}`);
      return '';
    }
  }
  try {
    const resp = await fetch(url);
    if (resp.status !== 200) return '';
    // Strip HTML tags, clean whitespace
    let text = resp.text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, MAX_AGENDA_TEXT);
  } catch (e) {
    console.warn('  Agenda extract error:', e.message);
    return '';
  }
}

/**
 * Fetch upcoming Town of Telluride meetings from the CivicWeb meetings API.
 *
 *   GET /Services/MeetingsService.svc/meetings?from=YYYY-MM-DD&to=9999-12-31
 *
 * Three bugs in the previous code that this fix corrects:
 *   1. The bare endpoint (no query params) returns `[]`. Both `from` and
 *      `to` are required; the Portal's own calendar.js passes
 *      `to=9999-12-31` as the far-future sentinel.
 *   2. The previous code looked for m.Title || m.MeetingName || m.Body.
 *      The API actually returns `m.Name` — every record was falling
 *      through to the 'Meeting' default, which would have produced
 *      worthless titles even if data had been flowing.
 *   3. No `hasAgenda` flag. The API exposes `m.Published: bool` —
 *      true once the agenda PDF is available on the meeting info page.
 *
 * The agendaUrl points at the meeting INFORMATION page (not the agenda
 * PDF directly). CivicWeb embeds agenda + minutes + media links on
 * that page; extractAgendaText can scrape it because it's static HTML
 * (no SPA shell, unlike CivicClerk).
 */
async function fetchTownTellurideMeetings(now, horizon) {
  const out = [];
  const fromStr = now.toISOString().split('T')[0];                // YYYY-MM-DD
  const url = `${AGENDA_SOURCES.telluride.meetingsApiBase}` +
    `?from=${encodeURIComponent(fromStr)}` +
    `&to=${encodeURIComponent('9999-12-31')}`;
  const resp = await fetch(url);
  if (resp.status !== 200) {
    console.warn(`  CivicWeb meetings API HTTP ${resp.status}`);
    return out;
  }
  let items;
  try {
    const parsed = JSON.parse(resp.text);
    items = Array.isArray(parsed) ? parsed : (parsed?.d || []);
  } catch (e) {
    console.warn('  CivicWeb JSON parse error:', e.message);
    return out;
  }
  for (const m of items) {
    if (!m) continue;
    const mDate = new Date(m.MeetingDate || m.MeetingDateTime || '');
    if (isNaN(mDate)) continue;
    if (mDate < now || mDate > horizon) continue;

    // Filter out cancelled meetings — they're in the feed with names
    // like "CANCELLED: Planning & Zoning Commission Chair - May 28 2026"
    // and "(Cancelled) Town Council Retreat - Jun 04 2026". Surfacing
    // them as upcoming would be misleading.
    if (m.Name && /^(?:\(?cancelled?\)?:?\s*|CANCELLED\b)/i.test(m.Name.trim())) continue;

    const agendaUrl = m.Id
      ? `${AGENDA_SOURCES.telluride.detailBase}${m.Id}`
      : '';
    // Seed text from API metadata — fallback when extractAgendaText can't
    // pull useful body from the meeting info page (eg. agenda not yet
    // published, just a placeholder page).
    const seedParts = [
      m.Name           ? `Meeting: ${m.Name}`                : '',
      m.MeetingDateTime ? `When: ${m.MeetingDateTime}`       : '',
      m.MeetingLocation ? `Location: ${m.MeetingLocation}`   : '',
      m.Published === true ? 'Agenda published.' : 'Agenda not yet published.',
    ].filter(Boolean);

    out.push({
      source: 'telluride',
      date: mDate.toISOString().split('T')[0],
      title: (m.Name || 'Town of Telluride Meeting').trim(),
      agendaUrl,
      hasAgenda: !!agendaUrl && m.Published === true,
      agendaSeedText: seedParts.join('\n'),
    });
  }
  return out;
}

/**
 * Fetch upcoming San Miguel County meetings from the CivicClerk OData API.
 *
 *   GET /v1/Events?$filter=startDateTime ge <today> and startDateTime le <horizon>
 *
 * Returns one meeting object per upcoming event with:
 *   - source: 'county'
 *   - date: 'YYYY-MM-DD' (real event date, not RSS pubDate)
 *   - title: eventName
 *   - agendaUrl: portal /event/<id>/files/agenda/<fileId> URL when a
 *     publishedFile of type "Agenda" exists; otherwise empty string
 *   - hasAgenda: boolean
 *   - agendaSeedText: a fallback "agenda body" cobbled together from the
 *     API's eventName + eventDescription + agendaName + categoryName.
 *     Used by refreshSummaries when extractAgendaText can't reach the
 *     actual PDF (which is always, for now — see note in extractAgendaText).
 *
 * The CivicClerk OData endpoint also offers GetEventFileStream(fileId,
 * fileType, plainText=true) which would give the PDF as text, but the
 * function requires the SPA's DocAccess url_hash and returns 500 from a
 * server-side curl. Pulling that off needs a headless browser; not in
 * scope for now. The seed text is a deliberate stop-gap so cards still
 * get *some* AI summary instead of being summary-less.
 */
async function fetchSmcCountyMeetings(now, horizon) {
  const out = [];
  const toIso = (d) => d.toISOString().split('.')[0] + 'Z'; // OData wants no millis
  const filter = `startDateTime ge ${toIso(now)} and startDateTime le ${toIso(horizon)}`;
  const url = `${AGENDA_SOURCES.county.apiBase}/Events?` +
    `$filter=${encodeURIComponent(filter)}` +
    `&$orderby=startDateTime` +
    `&$top=100`;
  const resp = await fetch(url);
  if (resp.status !== 200) {
    console.warn(`  CivicClerk API returned HTTP ${resp.status}`);
    return out;
  }
  let parsed;
  try { parsed = JSON.parse(resp.text); }
  catch (e) {
    console.warn('  CivicClerk JSON parse error:', e.message);
    return out;
  }
  const events = Array.isArray(parsed.value) ? parsed.value : [];
  for (const ev of events) {
    if (!ev || ev.isDeleted) continue;
    if (ev.isPublished && String(ev.isPublished).toLowerCase() !== 'published') continue;
    const startDate = new Date(ev.startDateTime || ev.eventDate);
    if (isNaN(startDate)) continue;
    // The OData filter already bounds the range; this guard catches edge
    // cases (timezone math, removed events).
    if (startDate < now || startDate > horizon) continue;

    const agendaFile = Array.isArray(ev.publishedFiles)
      ? ev.publishedFiles.find((f) => f && f.type === 'Agenda')
      : null;
    const agendaUrl = agendaFile
      ? `${AGENDA_SOURCES.county.portalBase}/event/${ev.id}/files/agenda/${agendaFile.fileId}`
      : '';

    // Build a structured "seed" agenda body. Not the actual PDF content
    // (see extractAgendaText note), but more useful for Claude than just
    // the title — captures category, agenda title, free-text description.
    const seedParts = [
      ev.categoryName ? `Category: ${ev.categoryName}` : '',
      ev.eventName    ? `Event: ${ev.eventName}`       : '',
      ev.agendaName   ? `Agenda: ${ev.agendaName}`     : '',
      ev.eventDescription ? `Description: ${ev.eventDescription}` : '',
      agendaFile?.name ? `Agenda file: ${agendaFile.name}` : '',
    ].filter(Boolean);
    const agendaSeedText = seedParts.join('\n');

    out.push({
      source: 'county',
      date: startDate.toISOString().split('T')[0],
      title: (ev.eventName || 'County Meeting').trim(),
      agendaUrl,
      hasAgenda: !!agendaUrl,
      agendaSeedText,
    });
  }
  return out;
}

async function refreshSummaries(existingSummaries) {
  console.log('\n📋 Task 1: Refreshing meeting summaries...');
  const meetings = await fetchUpcomingMeetings();
  console.log(`  Found ${meetings.length} upcoming meetings`);

  const updated = { ...existingSummaries };
  let newCount = 0;

  for (const m of meetings) {
    const key = `${m.source}|${m.date}|${m.title}`;
    if (updated[key]) {
      console.log(`  ✓ Already have summary for: ${key}`);
      continue;
    }

    console.log(`  → Generating summary for: ${key}`);
    let agendaText = await extractAgendaText(m.agendaUrl);

    // Fallback: when the agenda URL is unreachable (CivicClerk SPA shells,
    // PDFs we can't extract server-side) but the source still gave us
    // structured metadata about the meeting, hand that to Claude instead
    // of bailing. Better-than-nothing summary based on title + category
    // + agenda name + description.
    if (!agendaText && m.agendaSeedText) {
      agendaText = m.agendaSeedText;
      console.log(`    Using API-sourced seed text (${agendaText.length} chars; PDF body not reachable)`);
    }

    if (!agendaText && !ANTHROPIC_API_KEY) {
      console.log(`    Skipped (no agenda text and no API key)`);
      continue;
    }

    try {
      const result = await callClaude(
        AGENDA_SOURCES[m.source]?.label || m.source,
        m.title, m.date, agendaText
      );
      if (result?.shortSummary) {
        // Format as the flat summary string that gov-hub.js expects
        const topicBullets = (result.topics || []).join(' · ');
        updated[key] = topicBullets || result.shortSummary;
        newCount++;
        console.log(`    ✓ Generated summary (${result.topics?.length || 0} topics)`);
      }
    } catch (e) {
      console.warn(`    ✗ Claude error: ${e.message}`);
    }

    // Rate limit — small delay between API calls
    await new Promise(r => setTimeout(r, 1500));
  }

  // Prune summaries older than 30 days
  for (const key of Object.keys(updated)) {
    const parts = key.split('|');
    if (parts[1] && daysAgo(parts[1]) > 30) {
      delete updated[key];
    }
  }

  console.log(`  Summary refresh complete: ${newCount} new, ${Object.keys(updated).length} total`);
  return updated;
}

// ══════════════════════════════════════════════════════════════
// ── Task 1b: Pre-Meeting Previews (from legal notices + agendas) ──
// ══════════════════════════════════════════════════════════════

// Entity key mapping: legal notice entityLogo → meeting source key
const NOTICE_ENTITY_TO_SOURCE = {
  telluride: 'telluride',
  county:    'county',
  mv:        'mv',
  norwood:   'norwood',
  ophir:     'ophir',
  school:    'school',
  fire:      'fire',
  med:       'med',
  smart:     'smart',
  airport:   'airport',
  smrha:     'smrha',
  assessor:  'county',  // assessor notices → county meetings
};

async function refreshMeetingPreviews(existingPreviews, govHubSrc) {
  console.log('\n📋 Task 1b: Refreshing meeting previews from legal notices...');

  // Extract current LEGAL_NOTICES from gov-helpers.js source
  let legalNotices = [];
  try {
    legalNotices = extractJsArray(govHubSrc, 'LEGAL_NOTICES') || [];
  } catch (e) {
    console.warn('  Could not parse LEGAL_NOTICES:', e.message);
  }
  console.log(`  Found ${legalNotices.length} legal notices to scan`);

  const meetings = await fetchUpcomingMeetings();
  console.log(`  Found ${meetings.length} upcoming meetings`);

  if (meetings.length === 0) {
    console.log('  No upcoming meetings found — skipping preview generation');
    // Prune expired entries but keep the rest
    const pruned = {};
    const now = new Date();
    for (const [key, val] of Object.entries(existingPreviews)) {
      const datePart = key.split('|')[1];
      if (datePart && new Date(datePart) >= now) pruned[key] = val;
    }
    return pruned;
  }

  const updated = {};
  // Carry forward previews for meetings still in the future
  const now = new Date();
  for (const [key, val] of Object.entries(existingPreviews)) {
    const datePart = key.split('|')[1];
    if (datePart && new Date(datePart) >= now) updated[key] = val;
  }

  let newCount = 0;

  for (const m of meetings) {
    const key = `${m.source}|${m.date}|${m.title}`;

    // Skip if we already have a preview for this meeting
    if (updated[key]) {
      console.log(`  ✓ Already have preview for: ${key}`);
      continue;
    }

    const meetingDate = new Date(m.date + 'T00:00:00');

    // Find legal notices from the same entity that are likely related to this meeting
    // A notice is "related" if:
    //   (a) its entityLogo maps to the meeting's source, AND
    //   (b) its expiry date is within 60 days of the meeting date (i.e., recently published)
    const relatedNotices = legalNotices.filter(notice => {
      const noticeSource = NOTICE_ENTITY_TO_SOURCE[notice.entityLogo];
      if (noticeSource !== m.source) return false;
      if (!notice.expires) return false;
      const expiresDate = new Date(notice.expires + 'T00:00:00');
      const daysDiff = (expiresDate - meetingDate) / 86400000;
      // Notice expires within 60 days after meeting OR up to 5 days before meeting
      return daysDiff >= -5 && daysDiff <= 60;
    });

    if (relatedNotices.length === 0) {
      // Also check agenda text for description-based preview
      if (!m.agendaUrl) {
        console.log(`  ⊘ No notices or agenda for: ${key}`);
        continue;
      }
    }

    console.log(`  → Generating preview for: ${key} (${relatedNotices.length} notices, agenda: ${!!m.agendaUrl})`);

    try {
      // Build context from legal notices + agenda text
      const noticeContext = relatedNotices.map(n =>
        `[${n.type || 'Notice'}] ${n.title}: ${(n.summary || '').slice(0, 200)}`
      ).join('\n');

      const agendaText = m.agendaUrl ? await extractAgendaText(m.agendaUrl) : '';

      if (!noticeContext && !agendaText) {
        console.log(`    Skipped (no context available)`);
        continue;
      }

      const contextBlock = [
        noticeContext ? `RELATED LEGAL NOTICES:
${noticeContext}` : '',
        agendaText ? `AGENDA TEXT (excerpt):
${agendaText.slice(0, 1500)}` : ''
      ].filter(Boolean).join('\n\n');

      const prompt = `You are summarizing what a local government body is expected to discuss at an upcoming meeting.

Meeting: ${AGENDA_SOURCES[m.source]?.label || m.source} — ${m.title}
Date: ${m.date}

${contextBlock}

Write a plain-text preview of 50 words or less describing the key issues or agenda items expected at this meeting. Use a neutral, factual tone. No bullet points. No headers. Start directly with the content (e.g., "Council is expected to..." or "Board will consider...").`;

      const response = await callClaudeRaw(prompt);
      if (response && response.trim()) {
        updated[key] = response.trim().slice(0, 400); // cap at 400 chars
        newCount++;
        console.log(`    ✓ Generated preview (${response.trim().length} chars)`);
      }
    } catch (e) {
      console.warn(`    ✗ Preview generation error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`  Preview refresh complete: ${newCount} new, ${Object.keys(updated).length} total`);
  return updated;
}

// ══════════════════════════════════════════════════════════════
// ── Task 2: News Articles (RSS) ──
// ══════════════════════════════════════════════════════════════

function classifyNewsTopic(title, desc) {
  const text = `${title} ${desc}`.toLowerCase();
  if (/zoning|planning|land.use|pud|development|building|permit|harc|historic/i.test(text)) return 'land-use';
  if (/housing|affordable|deed.restrict|smrha|rent|workforce/i.test(text)) return 'housing';
  if (/fire|marshal|police|sheriff|rescue|accident|crash|wildfire|evacuation/i.test(text)) return 'public-safety';
  if (/budget|tax|revenue|bond|debt|fiscal|appropriation/i.test(text)) return 'government';
  if (/council|commission|board|election|vote|ballot|ordinance/i.test(text)) return 'government';
  if (/water|sewer|road|transit|gondola|smart|infrastructure|bridge/i.test(text)) return 'infrastructure';
  if (/school|student|education|teacher|district/i.test(text)) return 'education';
  if (/art|festival|music|film|concert|gallery|theater|culture/i.test(text)) return 'arts-culture';
  if (/ski|mountain|trail|outdoor|recreation|park|open.space/i.test(text)) return 'recreation';
  if (/health|medical|hospital|clinic|covid|mental/i.test(text)) return 'health';
  return 'community';
}

async function refreshNews(existingTtArticles = []) {
  console.log('\n📰 Task 2: Refreshing news articles...');
  // Build a lookup of articles we already have Claude summaries for, keyed by href.
  // These survive the refresh — we carry the cached summary forward instead of re-fetching.
  const existingByHref = new Map(existingTtArticles.map(a => [a.href, a]));
  const articles = [];
  const cutoff = new Date(Date.now() - NEWS_MAX_AGE_DAYS * 86400000);
  const govCutoff = new Date(Date.now() - GOV_NEWS_MAX_AGE_DAYS * 86400000);

  // Government RSS feeds — use longer 45-day window (gov agencies publish infrequently)
  for (const feed of NEWS_FEEDS) {
    // Skip "Website News" — just site-management notices ("Stay Connected", etc.)
    if (feed.category === 'Website News') continue;
    try {
      const resp = await fetch(feed.url);
      if (resp.status !== 200) continue;
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);

      for (const item of arr) {
        const pubDate = new Date(item.pubDate || '');
        if (pubDate < govCutoff) continue;
        // Skip meeting announcements — covered in Gov-Hub
        const title = (item.title || '').trim();
        if (/meeting/i.test(title) && /\d{1,2}[\/-]\d{1,2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(title)) continue;
        const enclosure = item.enclosure;
        const rawImg = (enclosure?.$.url || item['media:thumbnail']?.$.url || '').replace(/[?&]resize=[^&]*/i, '');
        // Also try to extract image from description HTML
        let descImg = rawImg;
        if (!descImg) {
          const imgMatch = (item.description || '').match(/<img[^>]+src=["']([^"']+)["']/i);
          if (imgMatch) descImg = imgMatch[1];
        }
        articles.push({
          title,
          source: feed.source,
          date: formatDate(pubDate),
          newsTopic: classifyNewsTopic(title, item.description || ''),
          copy: (item.description || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().slice(0, 300),
          href: (item.link || '').trim(),
          img: descImg
        });
      }
    } catch (e) {
      console.warn(`  RSS error (${feed.source}): ${e.message}`);
    }
  }

  // Telluride Times RSS — with full-text Claude summaries for new articles
  try {
    const resp = await fetch(TELLURIDE_TIMES_RSS);
    if (resp.status === 200) {
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);
      let newCount = 0;
      for (const item of arr) {
        const pubDate = new Date(item.pubDate || '');
        if (pubDate < cutoff) continue;
        const href = (item.link || '').trim();
        const enclosure = item.enclosure;
        const rssCopy = (item.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 300);

        // If we already have a Claude summary for this article, carry it forward unchanged
        if (existingByHref.has(href) && existingByHref.get(href).claudeSummary) {
          articles.push(existingByHref.get(href));
          continue;
        }

        // New article — try to get full text and summarize
        let copy = rssCopy;
        let claudeSummary = false;
        if (TT_AUTH_COOKIE) {
          try {
            const title = (item.title || '').trim();
            const result = await fetchTTArticleDirect(href);
            if (result && result.status === 200) {
              const fullText = extractTTArticleText(result.text);
              if (fullText) {
                copy = await summarizeTTArticle(title, fullText, rssCopy);
                claudeSummary = true;
                newCount++;
              }
            }
            // Small delay between fetches — be polite to TT's servers
            await new Promise(r => setTimeout(r, 800));
          } catch (e) {
            console.warn(`  Could not summarize ${href}: ${e.message}`);
          }
        }

        articles.push({
          title: (item.title || '').trim(),
          source: 'Telluride Times',
          date: formatDate(pubDate),
          firstSeen: existingByHref.has(href)
            ? (existingByHref.get(href).firstSeen || new Date().toISOString().slice(0, 10))
            : new Date().toISOString().slice(0, 10),
          newsTopic: classifyNewsTopic(item.title || '', item.description || ''),
          copy,
          claudeSummary,
          href,
          img: (enclosure?.$.url || '').replace(/[?&]resize=[^&]*/i, '')
        });
      }
      if (newCount > 0) console.log(`  Summarized ${newCount} new TT article(s) from full text`);
    }
  } catch (e) { console.warn(`  Telluride Times RSS error: ${e.message}`); }

  // ── Merge-back: preserve existing TT articles not returned by this RSS run ──
  // The RSS feed is a rolling window (last 50 articles, last 14 days). If an
  // article wasn't returned this run — due to timing, a category not yet in
  // the feed URL, a CF proxy hiccup, or a manually-added entry — it would be
  // silently dropped when the bot serializes the new array. That's the root
  // cause of repeated "articles disappeared" incidents.
  //
  // Fix: after the RSS pass, scan existingByHref for TT articles that are
  // still within the 14-day window but not already in the scraped array.
  // Add them back so manually-added or RSS-delayed articles survive bot runs.
  {
    const scrapedHrefs = new Set(articles.map(a => a.href));
    for (const [href, existing] of existingByHref) {
      if (scrapedHrefs.has(href)) continue;               // already in this run
      if (existing.source !== 'Telluride Times') continue; // gov news handled separately
      const pub = new Date(existing.date || existing.firstSeen || '');
      if (!isNaN(pub) && pub >= cutoff) {
        articles.push(existing);   // carry forward — still within window
        scrapedHrefs.add(href);    // prevent duplication if loop runs twice
      }
    }
  }

  // ── og:image enhancement pass ──────────────────────────────────────────
  // For TT articles that don't yet have a hi-res photo, fetch the article
  // page through the CF Worker proxy and pull <meta property="og:image">.
  // Cap at 15 new fetches per run (≈5 seconds extra) with a 350 ms delay
  // between requests to be polite.  The `imgHiRes` flag is persisted on the
  // article object so already-fetched articles are skipped on future runs.
  {
    const OG_MAX_PER_RUN = 15;
    let ogFetched = 0;
    for (const art of articles) {
      if (art.source !== 'Telluride Times') continue;
      if (art.imgHiRes) continue;           // already have hi-res from a prior run
      if (ogFetched >= OG_MAX_PER_RUN) break;
      const ogUrl = await fetchTTOgImage(art.href);
      if (ogUrl) {
        art.img = ogUrl;
        art.imgHiRes = true;
        ogFetched++;
      } else {
        art.imgHiRes = true;                // mark attempted so we don't retry forever
      }
      await new Promise(r => setTimeout(r, 350));
    }
    if (ogFetched > 0) console.log(`  Fetched og:image for ${ogFetched} TT article(s)`);
  }


  // KOTO RSS
  const kotoNewscasts = [];
  const kotoFeatured = [];

  async function pullKotoFeed(url, bucket) {
    try {
      const resp = await fetch(url);
      if (resp.status !== 200) {
        console.warn(`  KOTO feed (${url}) HTTP ${resp.status}`);
        return;
      }
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);
      for (const item of arr) {
        const pubDate = new Date(item.pubDate || '');
        if (pubDate < cutoff) continue;
        const title = (item.title || '').trim();
        // Clean the RSS description: strip HTML, drop the canonical
        // "The post <link>X</link> appeared first on <link>KOTO FM</link>" trailer.
        let copy = (item.description || '').replace(/<[^>]+>/g, ' ');
        copy = copy.replace(/The post [\s\S]*?appeared first on [\s\S]*?\./i, '');
        copy = copy.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        // KOTO descriptions are bullet-style ("- Topic 1\n- Topic 2"). Convert
        // them to a comma-separated single line for the card preview.
        copy = copy.replace(/^[-•]\s*/g, '').replace(/\s*[-•]\s+/g, '; ').slice(0, 350);
        bucket.push({
          title,
          source: 'KOTO Community Radio',
          date: formatDate(pubDate),
          newsTopic: classifyNewsTopic(title, item.description || ''),
          copy,
          href: (item.link || '').trim()
        });
      }
    } catch (e) {
      console.warn(`  KOTO RSS error (${url}): ${e.message}`);
    }
  }

  await pullKotoFeed(KOTO_NEWSCASTS_RSS, kotoNewscasts);
  await pullKotoFeed(KOTO_FEATURED_RSS, kotoFeatured);

  // Colorado Sun — filtered to Telluride/San Miguel County local coverage
  const csSunArticles = [];
  try {
    const resp = await fetch(COLORADO_SUN_RSS);
    if (resp.status === 200) {
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);
      for (const item of arr) {
        const pubDate = new Date(item.pubDate || '');
        if (pubDate < cutoff) continue;
        const title = (item.title || '').trim();
        const rawDesc = item.description || item['content:encoded'] || '';
        const descText = rawDesc.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
        // Only include articles whose title or description mention our local keywords
        if (!COLORADO_SUN_KEYWORDS.test(title) && !COLORADO_SUN_KEYWORDS.test(descText)) continue;
        const href = (item.link || '').trim();
        // Extract thumbnail from description HTML (WordPress puts it there)
        const imgMatch = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
        const img = imgMatch ? imgMatch[1] : '';
        csSunArticles.push({
          title,
          source: 'Colorado Sun',
          date: formatDate(pubDate),
          firstSeen: existingByHref.has(href)
            ? (existingByHref.get(href).firstSeen || new Date().toISOString().slice(0, 10))
            : new Date().toISOString().slice(0, 10),
          newsTopic: classifyNewsTopic(title, descText),
          copy: descText.slice(0, 350),
          claudeSummary: false,
          href,
          img
        });
      }
      if (csSunArticles.length > 0) console.log(`  Found ${csSunArticles.length} relevant Colorado Sun article(s)`);
    } else {
      console.warn(`  Colorado Sun RSS HTTP ${resp.status}`);
    }
  } catch (e) { console.warn(`  Colorado Sun RSS error: ${e.message}`); }

  // ── Town of Ridgway — Press Releases ──
  // Drupal 10 / Colorado state CMS. No RSS feed available. Direct HTTP access works (200);
  // Cloudflare Worker returns 403 for this host so we fetch direct (not via proxy).
  // Activated 2026-05-11 after confirming site migration completed May 8.
  const RIDGWAY_HOME = 'https://townofridgway.colorado.gov/';
  const ridgwayArticles = [];
  try {
    const resp = await fetch(RIDGWAY_HOME);
    if (resp.status === 200) {
      const html = resp.text;
      // Extract press release links — pattern: <a href="...files/documents/...pdf">Title - Date</a>
      const linkRe = /<a[^>]+href="([^"]*\/files\/documents\/[^"]+\.pdf)"[^>]*>([^<]+?)<\/a>/gi;
      let m;
      while ((m = linkRe.exec(html)) !== null) {
        const href = m[1].startsWith('http') ? m[1] : `https://townofridgway.colorado.gov${m[1]}`;
        const rawText = m[2].replace(/\(opens in new window\)/gi, '').trim();
        // Extract date from link text: "Title - May 1, 2026" or "Title - April 14, 2026"
        const dateMatch = rawText.match(/[-–]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d+,?\s*\d{4})\s*$/i);
        const title = dateMatch ? rawText.slice(0, rawText.lastIndexOf(dateMatch[0])).trim() : rawText;
        const dateStr = dateMatch ? dateMatch[1] : '';
        const pubDate = dateStr ? new Date(dateStr) : new Date();
        if (pubDate < cutoff) continue;
        ridgwayArticles.push({
          title,
          source: 'Town of Ridgway',
          date: formatDate(pubDate),
          firstSeen: existingByHref.has(href)
            ? (existingByHref.get(href).firstSeen || new Date().toISOString().slice(0, 10))
            : new Date().toISOString().slice(0, 10),
          newsTopic: classifyNewsTopic(title, ''),
          copy: `Press release from the Town of Ridgway. Click to view the full PDF.`,
          claudeSummary: false,
          href,
          img: ''
        });
      }
      if (ridgwayArticles.length > 0) console.log(`  Found ${ridgwayArticles.length} Ridgway press release(s)`);
    } else {
      console.warn(`  Ridgway homepage HTTP ${resp.status}`);
    }
  } catch (e) { console.warn(`  Ridgway scraper error: ${e.message}`); }

  // Deduplicate by href
  const seen = new Set();
  const dedup = arr => arr.filter(a => {
    if (!a.href || seen.has(a.href)) return false;
    seen.add(a.href);
    return true;
  });

  const ttArticles = dedup(articles.filter(a => a.source === 'Telluride Times'));
  const govArticles = dedup(articles.filter(a => a.source !== 'Telluride Times'));

  console.log(`  Found: ${ttArticles.length} Telluride Times, ${govArticles.length} gov news, ${kotoNewscasts.length} KOTO newscasts, ${kotoFeatured.length} KOTO stories, ${csSunArticles.length} Colorado Sun, ${ridgwayArticles.length} Ridgway`);
  return { ttArticles: [...ttArticles, ...govArticles, ...dedup(csSunArticles), ...dedup(ridgwayArticles)], kotoNewscasts: dedup(kotoNewscasts), kotoFeatured: dedup(kotoFeatured) };
}

// ══════════════════════════════════════════════════════════════

// ── Regional News Refresh ──
// ══════════════════════════════════════════════════════════════

async function refreshRegionalNews(existingRegional = []) {
  console.log('\n🗺️  Regional news: Refreshing RSS feeds...');
  const existingByHref = new Map(existingRegional.map(a => [a.href, a]));
  const articles = [];
  const cutoff = new Date(Date.now() - NEWS_MAX_AGE_DAYS * 86400000);

  for (const feed of REGIONAL_NEWS_FEEDS) {
    try {
      const resp = await fetch(feed.url);
      if (resp.status !== 200) {
        console.warn(`  Regional RSS (${feed.source}) HTTP ${resp.status}`);
        continue;
      }
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);
      let count = 0;
      for (const item of arr) {
        const pubDate = new Date(item.pubDate || '');
        if (pubDate < cutoff) continue;
        const href = (item.link || '').trim();
        if (!href) continue;
        // Carry forward existing entry unchanged if we already have it
        if (existingByHref.has(href)) {
          articles.push(existingByHref.get(href));
          count++;
          continue;
        }
        const title = (item.title || '').trim();
        const rawDesc = item.description || item['content:encoded'] || '';
        const copy = rawDesc.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
          .replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        const enclosure = item.enclosure;
        articles.push({
          title,
          source: feed.source,
          sourceKey: feed.sourceKey,
          date: formatDate(pubDate),
          newsTopic: classifyNewsTopic(title, copy),
          copy,
          href,
          img: (enclosure?.$.url || '').replace(/[?&]resize=[^&]*/i, '')
        });
        count++;
      }
      console.log(`  ${feed.source}: ${count} article(s)`);
    } catch (e) {
      console.warn(`  Regional RSS error (${feed.source}): ${e.message}`);
    }
  }

  // Sort by date descending, deduplicate by href
  const seen = new Set();
  return articles
    .filter(a => { if (seen.has(a.href)) return false; seen.add(a.href); return true; })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ── Task 3: Community Pulse ──
// ══════════════════════════════════════════════════════════════

async function refreshCommunityPulse(existingPosts) {
  console.log('\n💬 Task 3: Refreshing community pulse...');
  // Community Pulse posts are curated from Facebook/Instagram which can't be
  // reliably scraped via RSS. Keep existing posts, prune expired ones (>5 days old).
  const now = new Date();
  const kept = existingPosts.filter(p => {
    const posted = new Date(p.postedAt);
    const ageDays = (now - posted) / 86400000;
    return ageDays <= 5;
  });
  console.log(`  Kept ${kept.length} of ${existingPosts.length} posts (pruned ${existingPosts.length - kept.length} expired)`);
  return kept;
}

// ══════════════════════════════════════════════════════════════
// ── TT Full-Text Helpers (shared by news summaries + legals) ──
// ══════════════════════════════════════════════════════════════

/**
 * Extract readable article text from a fetched TT page.
 * Priority: (1) TNCMS subscriber-only encrypted blocks, (2) open asset-body div.
 * Returns plain text or null if nothing usable was found.
 */
function extractTTArticleText(html) {
  // 1. Paywalled blocks (most articles)
  const tncmsText = extractTncmsText(html);
  if (tncmsText && tncmsText.length > 100) return tncmsText;

  // 2. Non-paywalled article body (free content)
  const bodyMatch = html.match(/<div[^>]+class="[^"]*(?:asset-body|article-body|field-items)[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (bodyMatch) {
    const plain = bodyMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ').trim();
    if (plain.length > 100) return plain;
  }
  return null;
}

/**
 * Use Claude to write a 2-3 sentence summary of a TT article for the news card.
 * Voice: long-time local resident, observational, no advocacy.
 * Falls back to rssFallback if the API call fails.
 */
async function summarizeTTArticle(title, fullText, rssFallback) {
  if (!ANTHROPIC_API_KEY || !fullText) return rssFallback;

  const prompt = `Summarize the following Telluride Times article in 2-3 sentences for a community news card. Write as a long-time local resident would describe it — observational, factual, no advocacy or editorializing. Do not start with the article title. Do not use phrases like "The article says" or "This piece covers." Just deliver the key facts in plain language. Keep it under 280 characters if possible.

TITLE: ${title}

ARTICLE TEXT:
${fullText.slice(0, 4000)}`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = (json.content?.[0]?.text || '').trim();
          resolve(text.length > 20 ? text : rssFallback);
        } catch (_) { resolve(rssFallback); }
      });
    });
    req.on('error', () => resolve(rssFallback));
    req.on('timeout', () => { req.destroy(); resolve(rssFallback); });
    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════
// ── Task 4: Legal Notices ──
// ══════════════════════════════════════════════════════════════

/**
 * TNCMS content cipher — decodes subscriber-only encrypted article blocks.
 * Involutive (same function encodes and decodes):
 *   char < 33  → pass-through (whitespace/control)
 *   char >= 79 → subtract 47
 *   char 33–78 → add 47
 * Verified against live Telluride Times articles (April 2026).
 */
function decodeTncms(text) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const o = text.charCodeAt(i);
    if (o < 33) {
      result += text[i];
    } else if (o >= 79) {
      result += String.fromCharCode(o - 47);
    } else {
      result += String.fromCharCode(o + 47);
    }
  }
  return result;
}

/**
 * Fetch a Telluride Times article directly with subscriber auth cookie.
 * Bypasses the RSS proxy — the proxy can't forward cookies, and direct
 * article requests with valid JWT cookies succeed even from GH Actions IPs.
 */
async function fetchTTArticleDirect(url) {
  if (!TT_AUTH_COOKIE) return null;
  return new Promise((resolve) => {
    const opts = {
      headers: {
        'Cookie': `tncms-auth=${TT_AUTH_COOKIE}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 20000
    };
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchTTArticleDirect(res.headers.location));
        return;
      }
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, text: body }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Fetch og:image from a Telluride Times article page (unauthenticated, via
 * the CF Worker proxy). Returns the hi-res image URL string or '' on failure.
 * The custom fetch() in this script already routes telluridenews.com through
 * the Worker, so no extra config is needed here.
 */
async function fetchTTOgImage(href) {
  try {
    const resp = await fetch(href);
    if (resp.status !== 200) return '';
    // og:image can appear in two attribute orders
    const m = resp.text.match(/<meta[^>]+property=["'`]og:image["'`][^>]+content=["'`]([^"'`]+)["'`]/i)
           || resp.text.match(/<meta[^>]+content=["'`]([^"'`]+)["'`][^>]+property=["'`]og:image["'`]/i);
    if (!m) return '';
    // Strip resize query params (same pattern as RSS enclosure cleanup)
    return m[1].replace(/[?&]resize=[^&]*/i, '').split('?')[0];
  } catch (_) {
    return '';
  }
}


/**
 * Extract and decode all TNCMS-encrypted subscriber content blocks from
 * article HTML. Returns plain text suitable for Claude parsing.
 */
function extractTncmsText(html) {
  const re = /class="subscriber-only encrypted-content"[^>]*>([\s\S]*?)<\/div>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    blocks.push(decodeTncms(m[1]));
  }
  if (blocks.length === 0) return null;
  const combined = blocks.join('\n');
  // Strip HTML tags, decode common entities
  return combined
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Colorado Water Division 4 protest deadline: last day of the month
 * following the publication month (standard CO water court schedule).
 * e.g. published April 2026 → expires June 30, 2026
 */
function waterCourtExpiry(publishDateStr) {
  const d = new Date(publishDateStr + 'T12:00:00Z');
  // day 0 of (month + 2) = last day of (month + 1)
  const exp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0));
  return exp.toISOString().split('T')[0];
}

/**
 * Build a short paper key from a publish date, e.g. "2026-05-08" → "ttimes_0508"
 */
function ttPaperKey(dateStr) {
  return 'ttimes_' + dateStr.replace(/-/g, '').slice(4); // "MMDD"
}

/**
 * Use Claude to extract structured water court notice data from legal notice text.
 * Returns an array of LEGAL_NOTICES-formatted objects (may be empty).
 */
/**
 * Maps a Claude-returned notice type to LEGAL_NOTICES display fields.
 */
function noticeTypeToFields(type) {
  switch (type) {
    case 'water-court':    return { icon: '💧', iconClass: 'type-bid',     label: 'Water Court',    entity: 'Colorado District Court, Water Division No. 4', logo: 'water_court' };
    case 'ordinance':      return { icon: '📋', iconClass: 'type-hearing',  label: 'Ordinance',      entity: 'Town of Telluride',                              logo: 'telluride' };
    case 'housing':        return { icon: '🏠', iconClass: 'type-hearing',  label: 'Housing Notice', entity: 'San Miguel Regional Housing Authority',           logo: 'smrha' };
    case 'public-entity':  return { icon: '🏛️', iconClass: 'type-rfp',     label: 'Public Notice',  entity: 'San Miguel County',                              logo: 'county' };
    case 'tax-finance':    return { icon: '💰', iconClass: 'type-tax',      label: 'Tax & Finance',  entity: 'San Miguel County Assessor',                     logo: 'assessor' };
    case 'utilities':      return { icon: '💧', iconClass: 'type-hearing',  label: 'Utilities',      entity: 'Town of Telluride',                              logo: 'telluride' };
    default:               return { icon: '📄', iconClass: 'type-hearing',  label: 'Public Notice',  entity: 'San Miguel County',                              logo: 'county' };
  }
}

/**
 * Parse ALL legal notice types from a decoded TT legals article using Claude.
 * Handles: water court, vesting/ordinance, election, housing, public hearings,
 * RFPs/bids, tax notices, utility restrictions.
 * Returns LEGAL_NOTICES-formatted objects.
 */
async function parseLegalNoticesWithClaude(rawText, articleUrl, publishDate) {
  if (!ANTHROPIC_API_KEY || !rawText) return [];

  const paperKey = ttPaperKey(publishDate);
  const shortDate = `${parseInt(publishDate.slice(5, 7), 10)}/${parseInt(publishDate.slice(8, 10), 10)}`;

  const userPrompt = `You are extracting ALL legal notices from a Telluride Times "Legals & Public Notices" section for San Miguel County, Colorado.

Extract EVERY distinct notice. For each one return a JSON object with:
- filterTag: one of "water-court" | "ordinance" | "housing" | "public-entity" | "tax-finance" | "utilities"
  * water-court: Colorado Water Court applications, diligence findings, augmentation plans
  * ordinance: vesting notices, election notices, adopted/proposed ordinances, zoning
  * housing: deed-restricted housing sales, lotteries, affordable housing authority notices
  * public-entity: RFPs, ITBs, RFQs, public hearings, public comments, government procurement
  * tax-finance: property tax notices, assessments, financial services
  * utilities: water restrictions, sewer notices, utility rate changes, road closures
- title: concise title in format "Type -- Subject (Identifier if any)"
- summary: 2-3 sentence plain-English summary for community members. Include: who filed/issued it, what it's about, where it applies, and any key deadline or protest period.
- deadline: the action deadline stated in the notice (protest deadline, closing date, hearing date, etc.)
- expires: YYYY-MM-DD when this notice should drop off the site. Use the deadline date if explicit; otherwise estimate: water-court=last day of month after next, vesting=30 days from pub, election=election date, ordinance=60 days, public hearing=hearing date, RFP=closing date or 90 days, utilities=end of restriction period or 90 days.
- address: physical location the notice applies to (NOT attorney/applicant mailing address). Section/township/range or street address.
- noticeKey: a short unique slug for dedup, e.g. case number for water court, "vesting-116-e-columbia" for vesting notices, "ord-1630" for ordinances.
- entity: the government entity or applicant name
- caseNumber: water court case number if applicable, else null

Return a JSON array. If nothing found, return [].

TEXT (${publishDate}):
${rawText.slice(0, 10000)}`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { console.log('  Claude error:', json.error.message); resolve([]); return; }
          const text = json.content?.[0]?.text || '';
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (!jsonMatch) { resolve([]); return; }
          const parsed = JSON.parse(jsonMatch[0]);
          if (!Array.isArray(parsed)) { resolve([]); return; }

          const notices = parsed
            .filter(n => n && n.filterTag && n.title)
            .map(n => {
              const fields = noticeTypeToFields(n.filterTag);
              // Water court gets the Division 4 entity; others use the notice's own entity
              const entity = n.filterTag === 'water-court'
                ? 'Colorado District Court, Water Division No. 4'
                : (n.entity || fields.entity);
              return {
                title: n.title,
                entity,
                entityClass: 'ent-county',
                entityLogo: fields.logo,
                icon: fields.icon,
                iconClass: fields.iconClass,
                type: fields.label,
                filterTag: n.filterTag,
                summary: n.summary || '',
                deadline: n.deadline || '',
                expires: n.expires || waterCourtExpiry(publishDate),
                dates: shortDate,
                papers: [paperKey],
                url: articleUrl,
                address: n.address || '',
                noticeKey: n.noticeKey || '',
                ...(n.caseNumber ? { caseNumber: n.caseNumber } : {})
              };
            });

          const byTag = {};
          notices.forEach(n => { byTag[n.filterTag] = (byTag[n.filterTag] || 0) + 1; });
          console.log(`  Claude extracted ${notices.length} notice(s) from ${paperKey}:`, JSON.stringify(byTag));
          resolve(notices);
        } catch (e) {
          console.log('  Parse error from Claude response:', e.message);
          resolve([]);
        }
      });
    });
    req.on('error', (e) => { console.log('  Claude request error:', e.message); resolve([]); });
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(body);
    req.end();
  });
}

/**
 * Fetch the TT legals RSS feed and return any articles not yet represented
 * in existing water court notices. Compares by paper key (date-based).
 */
/**
 * Scrape all open bids from a CivicPlus Bids.aspx page (SMC or Town of Telluride).
 * Returns LEGAL_NOTICES-formatted objects for any bids not already in existingNotices.
 */
async function scrapeCivicPlusBids(baseUrl, entityName, entityLogo, existingNotices) {
  const results = [];
  // Build set of bidIDs we already have so we don't re-add
  const seenBidIds = new Set(
    existingNotices.filter(n => n.smcBidID || n.totBidID).map(n => String(n.smcBidID || n.totBidID))
  );
  const bidIdField = baseUrl.includes('sanmiguelcounty') ? 'smcBidID' : 'totBidID';

  let listHtml;
  try {
    const resp = await fetch(baseUrl);
    if (resp.status !== 200) { console.log(`  Bids page ${baseUrl} returned ${resp.status}`); return []; }
    listHtml = resp.text;
  } catch (e) { console.log(`  Bids fetch error: ${e.message}`); return []; }

  // Extract unique bid IDs + titles from listing page
  const bidMap = new Map();
  const re = /href="bids\.aspx\?bidID=(\d+)"[^>]*>([^<]+)</g;
  let m;
  while ((m = re.exec(listHtml)) !== null) {
    if (!bidMap.has(m[1])) bidMap.set(m[1], m[2].trim());
  }

  console.log(`  Found ${bidMap.size} open bid(s) on ${entityName} bids page`);

  for (const [bidId, title] of bidMap) {
    if (seenBidIds.has(bidId)) {
      console.log(`  Bid #${bidId} already in notices — skipping`);
      continue;
    }

    // Fetch detail page to get closing date and description
    let detailHtml = '';
    try {
      const detailUrl = baseUrl.replace(/Bids\.aspx.*/i, '') + `bids.aspx?bidID=${bidId}`;
      const dr = await fetch(detailUrl);
      if (dr.status === 200) detailHtml = dr.text;
      await new Promise(r => setTimeout(r, 600));
    } catch (_) {}

    // Extract closing date
    let closingDate = '';
    let expiresDate = '';
    const closingMatch = detailHtml.match(/Closing[^<"]{0,20}["']?\s*[>:]?\s*([\d]{1,2}\/[\d]{1,2}\/[\d]{4})/i);
    if (closingMatch) {
      closingDate = closingMatch[1];
      try {
        const d = new Date(closingDate);
        expiresDate = d.toISOString().split('T')[0];
      } catch (_) {}
    }
    if (!expiresDate) {
      // No explicit closing — set 90 days from today
      const d = new Date();
      d.setDate(d.getDate() + 90);
      expiresDate = d.toISOString().split('T')[0];
    }

    // Extract description snippet
    let desc = '';
    const descMatch = detailHtml.match(/class="widgetItemText"[^>]*>([\s\S]{30,600}?)<\/div>/);
    if (descMatch) desc = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);

    // Determine type from title
    const titleLower = title.toLowerCase();
    let bidType = 'Request for Proposal';
    if (/\brfq\b|quote/i.test(titleLower)) bidType = 'Request for Quote';
    if (/\bitb\b|invitation.to.bid/i.test(titleLower)) bidType = 'Invitation to Bid';

    const detailUrl = baseUrl.replace(/Bids\.aspx.*/i, '') + `bids.aspx?bidID=${bidId}`;
    const noticeEntry = {
      title: `${bidType} -- ${title}`,
      entity: entityName,
      entityClass: 'ent-county',
      entityLogo: entityLogo,
      icon: '🏛️',
      iconClass: 'type-rfp',
      type: bidType,
      filterTag: 'public-entity',
      summary: desc || `${entityName} is seeking qualified respondents for: ${title}.`,
      deadline: closingDate ? `Closes ${closingDate}` : 'Open until contracted',
      expires: expiresDate,
      dates: `${parseInt(today().slice(5, 7), 10)}/${parseInt(today().slice(8, 10), 10)}`,
      url: detailUrl,
      address: '',
      [bidIdField]: bidId
    };
    console.log(`  New bid: ${title} (closes ${closingDate || 'TBD'})`);
    results.push(noticeEntry);
  }
  return results;
}

async function fetchNewLegalsArticles(existingNotices) {
  if (!TT_AUTH_COOKIE) {
    console.log('  TT_AUTH_COOKIE not set — skipping TT legals scrape');
    return [];
  }

  // Build set of paper keys already recorded across ALL TT-sourced notices
  const seenKeys = new Set();
  for (const n of existingNotices) {
    if (Array.isArray(n.papers)) n.papers.forEach(p => { if (p.startsWith('ttimes_')) seenKeys.add(p); });
  }

  // Build dedup sets to prevent duplicate notices within a run
  const seenCases = new Set(existingNotices.filter(n => n.caseNumber).map(n => n.caseNumber));
  const seenNoticeKeys = new Set(existingNotices.filter(n => n.noticeKey).map(n => n.noticeKey));

  let rssText;
  try {
    const resp = await fetch(maybeProxy(TT_LEGALS_RSS));
    if (resp.status !== 200) { console.log(`  Legals RSS HTTP ${resp.status}`); return []; }
    rssText = resp.text;
  } catch (e) { console.log('  Legals RSS fetch error:', e.message); return []; }

  let parsedRss;
  try { parsedRss = await parseXml(rssText); } catch (e) { console.log('  Legals RSS parse error:', e.message); return []; }

  const items = parsedRss?.rss?.channel?.item;
  if (!items) return [];
  const articles = Array.isArray(items) ? items : [items];

  const newNotices = [];

  for (const item of articles) {
    const link = item.link || '';
    const pubDateRaw = item.pubDate || '';
    if (!link || !pubDateRaw) continue;

    const pubDate = new Date(pubDateRaw).toISOString().split('T')[0];
    const paperKey = ttPaperKey(pubDate);

    if (seenKeys.has(paperKey)) {
      console.log(`  Legals ${paperKey} already processed — skipping`);
      continue;
    }

    console.log(`  New legals issue: ${item.title || link} (${pubDate})`);
    const result = await fetchTTArticleDirect(link);
    if (!result || result.status !== 200) { console.log(`  Could not fetch (HTTP ${result?.status})`); continue; }

    const plainText = extractTncmsText(result.text);
    if (!plainText) { console.log('  No TNCMS content — cookie may have expired'); continue; }
    console.log(`  Decoded ${plainText.length} chars`);

    const notices = await parseLegalNoticesWithClaude(plainText, link, pubDate);

    for (const n of notices) {
      // Dedup by case number (water court) or noticeKey (everything else)
      const key = n.caseNumber || n.noticeKey;
      if (key && (seenCases.has(key) || seenNoticeKeys.has(key))) {
        console.log(`  Skipping duplicate: ${key}`);
        continue;
      }
      if (n.caseNumber) seenCases.add(n.caseNumber);
      if (n.noticeKey) seenNoticeKeys.add(n.noticeKey);
      newNotices.push(n);
    }

    seenKeys.add(paperKey);
  }

  return newNotices;
}

async function refreshLegalNotices(existingNotices) {
  console.log('\n⚖️  Task 4: Checking legal notices...');

  // 1. Remove expired notices
  const now = today();
  const kept = existingNotices.filter(n => {
    if (n.expires && n.expires < now) { console.log(`  Expired: ${n.title}`); return false; }
    return true;
  });
  if (existingNotices.length - kept.length > 0)
    console.log(`  Removed ${existingNotices.length - kept.length} expired notice(s)`);

  // 2. TT Legals — all notice types (water court, ordinance, housing, public-entity, etc.)
  const newFromTT = await fetchNewLegalsArticles(kept);
  if (newFromTT.length > 0) console.log(`  Adding ${newFromTT.length} new notice(s) from TT legals`);

  // 3. SMC Bids page — open RFPs / ITBs / RFQs
  const newSMCBids = await scrapeCivicPlusBids(
    'https://www.sanmiguelcountyco.gov/Bids.aspx',
    'San Miguel County', 'county', [...kept, ...newFromTT]
  );

  // 4. Town of Telluride Bids page
  const newTownBids = await scrapeCivicPlusBids(
    'https://www.telluride.gov/Bids.aspx',
    'Town of Telluride', 'telluride', [...kept, ...newFromTT, ...newSMCBids]
  );

  const result = [...kept, ...newFromTT, ...newSMCBids, ...newTownBids];
  console.log(`  ${result.length} active notice(s) total`);
  return result;
}

// ══════════════════════════════════════════════════════════════
// ── Task 5: Email Events Sync ──
// ══════════════════════════════════════════════════════════════

/**
 * RFC 4180-ish CSV parser. Handles:
 *   - quoted fields containing commas (e.g. "Town Park, Telluride")
 *   - quoted fields containing literal newlines (e.g. multi-line description)
 *   - escaped quotes inside quoted fields ("she said ""hi""")
 *   - bare CR/LF/CRLF row terminators
 * Returns: { headers: string[], rows: string[][] }
 *
 * The previous implementation split on \n and , and broke on every Google
 * Sheets export with a comma in a Location cell or a newline in Description.
 */
function parseCSV(text) {
  const records = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        // Treat \r\n as one terminator
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') records.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
  }
  // Final cell / row
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== '') records.push(row);
  }
  if (records.length === 0) return { headers: [], rows: [] };
  return { headers: records[0].map((h) => String(h).trim()), rows: records.slice(1) };
}

async function syncEmailEvents() {
  console.log('\n📅 Task 5: Syncing email events...');
  try {
    const config = JSON.parse(fs.readFileSync(EVENTS_CONFIG, 'utf8'));
    if (!config.sheetCsvUrl) {
      console.log('  No Google Sheet URL configured — skipping');
      return null;
    }
    const resp = await fetch(config.sheetCsvUrl);
    if (resp.status !== 200) {
      console.warn(`  Sheet fetch failed: HTTP ${resp.status}`);
      return null;
    }
    const { headers, rows } = parseCSV(resp.text);
    if (rows.length === 0) { console.log('  No events in sheet'); return []; }
    const events = [];
    for (const vals of rows) {
      const row = {};
      headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
      // Skip rows whose Status is anything other than 'new' / blank.
      // The Apps Script sets Status='new'; the GH Action below bumps it to
      // 'added' once it's been picked up. Anything else (skipped, notified,
      // duplicate, ...) means we explicitly chose not to publish this row.
      const status = (row.Status || row.status || '').toLowerCase();
      if (status && status !== 'new' && status !== 'added') continue;
      if (row.Title || row.title || row.Event) {
        events.push({
          title: row.Title || row.title || row.Event || '',
          date: row.Date || row.date || '',
          time: row.Time || row.time || '',
          location: row.Location || row.location || '',
          description: row.Description || row.description || '',
          source: 'Community Submitted',
          href: row.SourceURL || row.URL || row.url || row.Link || ''
        });
      }
    }
    console.log(`  Found ${events.length} events from sheet`);
    return events;
  } catch (e) {
    console.warn(`  Events sync error: ${e.message}`);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// ── File I/O — Read & Write JS Data Arrays ──
// ══════════════════════════════════════════════════════════════

function readJsFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Extract a JS object literal assigned to `const NAME = { ... };`
 * Returns the parsed object or null.
 */
function extractJsObject(source, varName) {
  // Match from "const VARNAME = {" to the closing "};" at the same nesting level
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*\\{`);
  const match = startRe.exec(source);
  if (!match) return null;

  let depth = 0;
  let start = match.index + match[0].length - 1; // position of opening {
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        const objStr = source.slice(start, i + 1);
        try {
          // Use Function to evaluate as JS (handles single-quoted strings, template literals, etc.)
          return new Function(`return (${objStr})`)();
        } catch (e) {
          console.warn(`  Could not parse ${varName}: ${e.message}`);
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Extract a JS array assigned to `const NAME = [ ... ];`
 */
function extractJsArray(source, varName) {
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*\\[`);
  const match = startRe.exec(source);
  if (!match) return null;

  let depth = 0;
  let start = match.index + match[0].length - 1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        const arrStr = source.slice(start, i + 1);
        try {
          return new Function(`return (${arrStr})`)();
        } catch (e) {
          console.warn(`  Could not parse ${varName}: ${e.message}`);
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Replace a const declaration's value in the source string.
 * Works for both objects and arrays.
 */
function replaceJsValue(source, varName, newValue, isObject = false) {
  const bracket = isObject ? '{' : '[';
  const closeBracket = isObject ? '}' : ']';
  const escapedBracket = bracket === '[' ? '\\[' : '\\{';
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*${escapedBracket}`);
  const match = startRe.exec(source);
  if (!match) {
    console.warn(`  Could not find ${varName} in source for replacement`);
    return source;
  }

  let depth = 0;
  let start = match.index;
  let braceStart = match.index + match[0].length - 1;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === bracket) depth++;
    else if (source[i] === closeBracket) {
      depth--;
      if (depth === 0) {
        // Find the semicolon after closing bracket
        let end = i + 1;
        while (end < source.length && source[end] !== ';') end++;
        if (source[end] === ';') end++;

        const serialized = isObject
          ? serializeObject(varName, newValue)
          : serializeArray(varName, newValue);

        return source.slice(0, start) + serialized + source.slice(end);
      }
    }
  }
  return source;
}

function serializeObject(varName, obj) {
  // Use JSON.stringify so keys and values are always safely quoted as JS
  // string literals — handles apostrophes, backslashes, newlines, control
  // chars, and unicode without manual escaping.  The keys produced are valid
  // ECMAScript object property names because every JSON-stringified string is
  // a valid JS string literal.
  const entries = Object.entries(obj).map(([k, v]) => {
    return `  ${JSON.stringify(String(k))}:\n    ${JSON.stringify(String(v))}`;
  });
  return `const ${varName} = {\n${entries.join(',\n\n')}\n};`;
}

function serializeArray(varName, arr) {
  // JS object property names without quotes must be valid identifiers; if
  // they aren't (e.g. contain special chars), fall back to JSON.stringify so
  // the key gets quoted.  All string values flow through JSON.stringify so
  // apostrophes, backslashes, newlines, and control chars are safe.
  const safeKey = (k) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
  const items = arr.map(item => {
    const props = Object.entries(item).map(([k, v]) => {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const inner = Object.entries(v).map(([ik, iv]) => `${safeKey(ik)}: ${JSON.stringify(String(iv))}`).join(', ');
        return `    ${safeKey(k)}: { ${inner} }`;
      }
      if (Array.isArray(v)) {
        return `    ${safeKey(k)}: [${v.map(i => JSON.stringify(String(i))).join(', ')}]`;
      }
      if (typeof v === 'boolean' || typeof v === 'number') {
        return `    ${safeKey(k)}: ${v}`;
      }
      return `    ${safeKey(k)}: ${JSON.stringify(String(v))}`;
    });
    return `  {\n${props.join(',\n')}\n  }`;
  });
  return `const ${varName} = [\n${items.join(',\n')}\n];`;
}

/**
 * Replace a simple const string value like: const FOO = '2026-04-22';
 */
function replaceConstString(source, varName, newValue) {
  const re = new RegExp(`(const\\s+${varName}\\s*=\\s*)'[^']*'`);
  return source.replace(re, `$1'${newValue}'`);
}

// ══════════════════════════════════════════════════════════════
// ── Main ──
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ── Task 6: Mailchimp Blog Sync ──
// ══════════════════════════════════════════════════════════════
// Pulls the audience archive RSS feed (every campaign sent to the
// Livable Telluride audience) and merges any campaigns we haven't
// already captured into the BLOG_POSTS array. Hand-curated entries
// (source: 'livable-telluride.org') are NEVER touched — only entries
// with source: 'mailchimp' are managed by this sync.

const MAILCHIMP_ARCHIVE_FEED =
  'https://us15.campaign-archive.com/feed?u=5d9192289b9af78822f2f69bf&id=f83dc56387';

// Strip HTML tags and collapse whitespace for excerpt extraction.
function htmlToText(s) {
  return String(s || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull the first reasonable image URL out of the campaign HTML.
function firstImageFromHtml(html) {
  if (!html) return '';
  // Look for <img ... src="..."> — Mailchimp emails are heavy on tracking
  // pixels and email-client compat images, so we filter out 1x1 / sprite /
  // common boilerplate images.
  const re = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (!url) continue;
    if (/(spacer|tracking|pixel|1x1|open\.gif|empty\.gif|transparent)/i.test(url)) continue;
    if (url.startsWith('data:')) continue;
    return url;
  }
  return '';
}

async function syncMailchimpBlog(existingPosts) {
  console.log('\n📰 Task 6: Syncing Mailchimp blog archive...');
  let resp;
  try {
    resp = await fetch(MAILCHIMP_ARCHIVE_FEED);
  } catch (e) {
    console.warn(`  Fetch error: ${e.message}`);
    return null;
  }
  if (!resp || resp.status !== 200) {
    console.warn(`  Archive feed HTTP ${resp ? resp.status : 'no response'}`);
    return null;
  }

  let parsed;
  try {
    parsed = await parseXml(resp.text);
  } catch (e) {
    console.warn(`  XML parse error: ${e.message}`);
    return null;
  }
  const items = parsed?.rss?.channel?.item;
  const arr = Array.isArray(items) ? items : (items ? [items] : []);
  console.log(`  Archive feed returned ${arr.length} campaigns`);

  if (!arr.length) return existingPosts;

  // Active prune: drop any existing mailchimp-source entries that match
  // the digest-skip pattern. This cleans up past mistakes (digest emails
  // that leaked into the blog before the skip pattern was added).
  const isDigestTitle = (t) => {
    if (!t) return false;
    return (/^Posts from Livable Telluride for /i.test(t) ||
            /Daily Digest|Weekly Digest|Daily Update|Weekly Update/i.test(t));
  };
  const prunedExisting = existingPosts.filter(p => {
    if (p && p.source === 'mailchimp' && isDigestTitle(p.title)) {
      console.log(`  Pruning leaked digest from blog: ${p.title}`);
      return false;
    }
    return true;
  });

  // Index existing posts by href AND by normalized title, so we don't
  // duplicate a Mailchimp campaign whose content was already hand-curated
  // as a livabletelluride.org post (same title, different URL).
  const normTitle = (s) => String(s || '')
    .toLowerCase()
    .replace(/[\u201C\u201D\u2018\u2019]/g, '')   // smart quotes
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const existingByHref = new Map();
  const existingByTitle = new Map();
  for (const p of prunedExisting) {
    if (p && p.href) existingByHref.set(p.href, p);
    if (p && p.title) existingByTitle.set(normTitle(p.title), p);
  }

  // Build entries for any campaign we haven't seen.
  const newEntries = [];
  for (const item of arr) {
    const href = item.link || '';
    if (!href) continue;
    if (existingByHref.has(href)) continue;
    const title = (item.title || '').trim();
    if (!title) continue;
    if (existingByTitle.has(normTitle(title))) {
      console.log(`  Skipping duplicate-by-title: ${title}`);
      continue;
    }
    // Skip campaigns whose title is flagged private (convention for one-offs
    // that should NOT appear on the public blog).
    if (/\[(private|skip|internal|test)\]/i.test(title)) {
      console.log(`  Skipping private campaign: ${title}`);
      continue;
    }
    // Skip the auto-generated daily/weekly digest emails. Their titles
    // are 'Posts from Livable Telluride for MM/DD/YYYY' (Mailchimp's
    // RSS-driven campaign uses *|RSSFEED:DATE|* in the subject line).
    // Those go to opt-in subscribers via feed.xml and shouldn't appear
    // on the public blog tab — only manually-authored campaigns should.
    if (/^Posts from Livable Telluride for /i.test(title) ||
        /Daily Digest|Weekly Digest|Daily Update|Weekly Update/i.test(title)) {
      console.log(`  Skipping digest campaign: ${title}`);
      continue;
    }
    const desc = item.description || '';
    const text = htmlToText(desc).slice(0, 400);
    const image = firstImageFromHtml(desc);
    let dateStr = item.pubDate || '';
    // Normalize to a friendly format consistent with the migrated posts.
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    newEntries.push({
      title,
      date: dateStr,
      href,
      image: image || '',
      excerpt: text,
      category: 'Newsletter',
      source: 'mailchimp',
    });
    console.log(`  + New campaign: ${title}`);
  }

  if (!newEntries.length) {
    console.log('  No new Mailchimp campaigns to add');
    return prunedExisting;
  }

  // Prepend new entries (newest from feed first), preserving existing
  // (already-pruned) posts.
  return [...newEntries, ...prunedExisting];
}

// ══════════════════════════════════════════════════════════════
// ── Task 7: Telluride Humane Society Adoptable Animals ──
// ══════════════════════════════════════════════════════════════
// Fetches the Shelterluv API for organization GID 36337 (Telluride
// Humane Society) and emits the current dogs + cats listings.
// Called from main() after Task 6.

const SHELTERLUV_GID = 36337;
const SHELTERLUV_API = `https://www.shelterluv.com/api/v3/available-animals/${SHELTERLUV_GID}`;

async function syncHumaneSocietyAnimals() {
  console.log('\n🐾 Task 7: Syncing Telluride Humane Society adoptable animals...');
  let resp;
  try {
    resp = await fetch(SHELTERLUV_API);
  } catch (e) {
    console.warn(`  Fetch error: ${e.message}`);
    return null;
  }
  if (!resp || resp.status !== 200) {
    console.warn(`  Shelterluv API HTTP ${resp ? resp.status : 'no response'}`);
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(resp.text);
  } catch (e) {
    console.warn(`  JSON parse error: ${e.message}`);
    return null;
  }
  // Endpoint returns either { animals: [...] } or a bare array. Normalize.
  const arr = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.animals) ? payload.animals : []);
  console.log(`  Shelterluv returned ${arr.length} adoptable animal(s)`);

  const animals = [];
  for (const a of arr) {
    if (!a) continue;
    const id = String(a.uniqueId || a.nid || a.id || '').trim();
    const name = (a.name || '').trim();
    const species = (a.species || '').trim();
    if (!id || !name || (species !== 'Dog' && species !== 'Cat')) continue;
    // Photos are objects ({id, name, url, isCover, ...}). Pull the URL
    // from the cover photo if present, else the first one.
    const photos = Array.isArray(a.photos) ? a.photos : [];
    let photo = '';
    if (photos.length > 0) {
      const cover = photos.find(p => p && p.isCover) || photos[0];
      photo = (cover && cover.url) || (typeof cover === 'string' ? cover : '');
    }
    // age_group is an object — pull its .name field (e.g. "Young Dog")
    const ageGroupName = (a.age_group && typeof a.age_group === 'object')
      ? (a.age_group.name || '')
      : (typeof a.age_group === 'string' ? a.age_group : '');
    const breed = [a.breed, a.secondary_breed].filter(Boolean).join(' / ').trim();
    const summaryParts = [];
    if (ageGroupName) summaryParts.push(ageGroupName);
    if (breed) summaryParts.push(breed);
    if (a.sex) summaryParts.push(a.sex);
    const summary = summaryParts.join(' • ');
    animals.push({
      id,
      name,
      species,
      breed,
      ageGroup: ageGroupName,
      sex: a.sex || '',
      photo,
      profileUrl: a.public_url || '',
      summary,
    });
  }
  console.log(`  Parsed ${animals.length} dogs/cats (${animals.filter(x=>x.species==='Dog').length} dogs, ${animals.filter(x=>x.species==='Cat').length} cats)`);
  return animals;
}

// ══════════════════════════════════════════════════════════════
// ── Task 8: KOTO Community Calendar (Tribe Events JSON API) ──
// ══════════════════════════════════════════════════════════════
// koto.org runs The Events Calendar (Tribe) WordPress plugin which
// exposes a JSON API for the community-calendar category. Fetch
// every 6h, filter to events starting in the next 30 days.

const KOTO_TRIBE_API = 'https://koto.org/wp-json/tribe/events/v1/events/?categories=community-calendar&per_page=100';

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&ldquo;/g, '"')
    .replace(/&#8221;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '\u2013')
    .replace(/&#8212;|&mdash;/g, '\u2014')
    .replace(/&#038;|&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}


// ── Ouray County events (non-governmental) ──
// The county's CivicEngage iCalendar feed includes BOCC, City Council, work
// sessions, plus community events (Wildfire Aware Fair, water summits, etc.).
// We pull all of it but filter out anything matching the governmental-meeting
// regex — gov meetings are already covered by the BOCC + PC RSS feeds and
// surface on the Gov-Hub tab; we don't want them duplicated on Events.
const OURAY_COUNTY_ICS_URL = 'https://ouraycountyco.gov/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar';
// MUST stay in sync with GOV_MEETING_PATTERN in js/gov-data.js. Both regexes
// share the same vocabulary so client-side filtering and bake-time filtering
// agree on what counts as a "government meeting".
const GOV_MEETING_PATTERN_NODE = /board|council|commission|work\s*session|hearing|planning|zoning|harc|ecology|drb|design\s*review|budget|ordinance|executive|legislative|caucus|quorum|town\s*hall|roundtable|stakeholder|housing\s*code\s*update|\bssr\b/i;

// Minimal RFC 5545 iCal parser — extracts VEVENT blocks with SUMMARY, DTSTART,
// DTEND, LOCATION, DESCRIPTION, UID, URL. Handles line folding (RFC 5545 § 3.1)
// and standard escapes (\n, \,, \;, \\).
function parseICalEvents(icsText) {
  if (!icsText) return [];
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const out = [];
  const blockRe = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let m;
  while ((m = blockRe.exec(unfolded)) !== null) {
    const block = m[1];
    const get = name => {
      const re = new RegExp('(?:^|\\n)' + name + '(?:;[^:\\n]*)?:([^\\r\\n]*)');
      const mm = re.exec(block);
      return mm ? mm[1].trim() : '';
    };
    const decode = s => String(s).replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    const parseDt = raw => {
      const mm = String(raw).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
      if (!mm) return null;
      return new Date(+mm[1], +mm[2] - 1, +mm[3], +(mm[4] || 9), +(mm[5] || 0), +(mm[6] || 0));
    };
    const summary = decode(get('SUMMARY'));
    if (!summary) continue;
    const start = parseDt(get('DTSTART'));
    if (!start || isNaN(start.getTime())) continue;
    const end = parseDt(get('DTEND'));
    out.push({
      summary, start, end,
      uid: get('UID'),
      url: get('URL'),
      location: decode(get('LOCATION')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      description: decode(get('DESCRIPTION')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    });
  }
  return out;
}

async function syncOurayCountyEvents() {
  console.log('\n🏔  Task 15: Syncing Ouray County non-governmental events...');
  let resp;
  try { resp = await fetch(OURAY_COUNTY_ICS_URL); }
  catch (e) { console.warn(`  Fetch error: ${e.message}`); return null; }
  if (!resp || resp.status !== 200) {
    console.warn(`  Ouray County iCal HTTP ${resp ? resp.status : 'no response'}`);
    return null;
  }
  const parsed = parseICalEvents(resp.text || '');
  const now = Date.now();
  const horizon = now + 30 * 86400000;
  const seen = new Set();
  const events = [];
  let skippedGov = 0;
  for (const ev of parsed) {
    const startMs = ev.start.getTime();
    if (startMs < now) continue;
    if (startMs > horizon) continue;
    if (GOV_MEETING_PATTERN_NODE.test(ev.summary)) { skippedGov++; continue; }
    const key = (ev.uid || ev.summary) + '|' + ev.start.toISOString().slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);
    let link = ev.url || '';
    if (!link || !/^https?:/i.test(link)) {
      link = ev.uid
        ? `https://ouraycountyco.gov/Calendar.aspx?EID=${ev.uid}`
        : 'https://ouraycountyco.gov/calendar.aspx?CID=14';
    }
    events.push({
      title: ev.summary,
      link,
      description: smartTruncate(ev.description || '', EVENT_DESC_MAX),
      pubDate: ev.start.toISOString(),
      source: 'ouraycounty',
      sourceLabel: 'Ouray County',
      category: 'Community Event',
      location: ev.location || 'Ouray County',
      imageUrl: ''
    });
  }
  console.log(`  Ouray County: ${events.length} non-gov events kept (${skippedGov} gov meetings skipped)`);
  return events;
}

// ── Task 16: Ouray/Ridgway Events (Localist JSON API) ──
// Fetches from events.ourayridgwayevents.com using the same Localist API
// the client uses, but server-side so the data is baked into gov-helpers.js.
// The client's fetchOurayRidgwayEvents() prefers OURAY_RIDGWAY_EVENTS if
// it is non-empty, falling back to a live client-side API call.
const LOCALIST_ORE_URL = 'https://events.ourayridgwayevents.com/api/2/events?school=ridgwayouray&days=60&pp=100';

async function syncOurayRidgwayEvents() {
  console.log('\n🏔  Task 16: Syncing Ouray/Ridgway events (Localist)...');
  let json;
  try {
    const resp = await fetch(LOCALIST_ORE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    if (!resp || resp.status !== 200) {
      console.warn(`  Localist API HTTP ${resp ? resp.status : 'no response'}`);
      return null;
    }
    json = JSON.parse(resp.text);
  } catch (e) {
    console.warn(`  Localist fetch/parse error: ${e.message}`);
    return null;
  }

  const rawEvents = Array.isArray(json && json.events) ? json.events : [];
  if (rawEvents.length === 0) {
    console.log('  No events returned from Localist API');
    return [];
  }

  const now = Date.now();
  const horizon = now + 60 * 86400000;
  const seen = new Set();
  const events = [];
  let skippedGov = 0;
  let skippedPast = 0;

  for (const wrapped of rawEvents) {
    const ev = wrapped && wrapped.event;
    if (!ev || ev.private || ev.status !== 'live') continue;

    // Skip government meetings
    if (GOV_MEETING_PATTERN_NODE.test(ev.title || '')) { skippedGov++; continue; }

    // Parse start date from event_instances
    const inst = Array.isArray(ev.event_instances) && ev.event_instances[0]
      && ev.event_instances[0].event_instance;
    const startStr = inst && inst.start;
    let startDate = startStr ? new Date(startStr) : (ev.first_date ? new Date(ev.first_date + 'T19:00:00') : null);
    if (!startDate || isNaN(startDate.getTime())) continue;

    const startMs = startDate.getTime();
    if (startMs < now - 86400000) { skippedPast++; continue; } // allow today's events
    if (startMs > horizon) continue;

    const uid = String(ev.id || ev.urlname || ev.title);
    const key = uid + '|' + startDate.toISOString().slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);

    // Clean description
    let desc = (ev.description_text || '')
      .replace(/\n/g, ' ').replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^https?:\/\/\S+$/.test(desc)) desc = '';
    desc = smartTruncate(desc, EVENT_DESC_MAX);

    events.push({
      title: (ev.title || '').trim(),
      link: ev.url || `https://events.ourayridgwayevents.com/event/${ev.urlname || ev.id}`,
      description: desc,
      pubDate: startDate.toISOString(),
      source: 'oray',
      sourceLabel: 'Ouray Ridgway Calendar',
      category: 'Community Event',
      location: ev.location || '',
      imageUrl: ev.photo_url || ''
    });
  }

  console.log(`  Ouray/Ridgway: ${events.length} events (${skippedPast} past, ${skippedGov} gov skipped)`);
  return events;
}

async function syncKotoCommunityEvents() {
  console.log('\n🎵 Task 8: Syncing KOTO Community Calendar...');
  let resp;
  try { resp = await fetch(KOTO_TRIBE_API); }
  catch (e) { console.warn(`  Fetch error: ${e.message}`); return null; }
  if (!resp || resp.status !== 200) {
    console.warn(`  KOTO Tribe API HTTP ${resp ? resp.status : 'no response'}`);
    return null;
  }
  let payload;
  try { payload = JSON.parse(resp.text); }
  catch (e) { console.warn(`  JSON parse error: ${e.message}`); return null; }
  const arr = Array.isArray(payload.events) ? payload.events
    : (Array.isArray(payload) ? payload : []);
  console.log(`  Tribe API returned ${arr.length} community-calendar event(s)`);
  const now = Date.now();
  const horizon = now + 30 * 86400000;
  const events = [];
  for (const e of arr) {
    if (!e || !e.title) continue;
    const startStr = e.start_date || '';
    if (!startStr) continue;
    const start = new Date(startStr.replace(' ', 'T'));
    if (isNaN(start.getTime())) continue;
    const endStr = e.end_date || startStr;
    const end = new Date(endStr.replace(' ', 'T'));
    if (!isNaN(end.getTime()) && end.getTime() < now) continue;
    if (start.getTime() > horizon) continue;
    const description = smartTruncate(decodeHtmlEntities(
      String(e.description || e.excerpt || '').replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' '), EVENT_DESC_MAX);
    let imageUrl = '';
    if (e.image && typeof e.image === 'object' && e.image.url) imageUrl = e.image.url;
    else if (typeof e.image === 'string') imageUrl = e.image;
    let venueName = '';
    if (e.venue && typeof e.venue === 'object') {
      venueName = e.venue.venue || '';
      if (e.venue.city && venueName && !venueName.includes(e.venue.city)) {
        venueName += ', ' + e.venue.city;
      } else if (e.venue.city && !venueName) {
        venueName = e.venue.city;
      }
    }
    events.push({
      title: decodeHtmlEntities(e.title),
      link: e.url || '',
      description,
      pubDate: start.toISOString(),
      source: 'koto',
      sourceLabel: 'KOTO',
      category: 'Community Event',
      location: venueName,
      imageUrl,
    });
  }
  events.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
  console.log(`  Kept ${events.length} events starting within 30 days`);
  return events;
}

// ══════════════════════════════════════════════════════════════
// ── Task 9: Wilkinson Public Library (LibCal) ──
// ══════════════════════════════════════════════════════════════
// telluridelibrary.libcal.com exposes api_events.php with the
// library's main calendar (cid=19928). The endpoint returns HTML
// rather than JSON, so we parse it with regex. Each event's detail
// page has an og:image we fetch for the card photo.

const WILKINSON_API = 'https://telluridelibrary.libcal.com/api_events.php?cid=19928&days=30';

function parseWilkinsonHtml(html) {
  const events = [];
  const tableBlocks = html.split(/<table\b[^>]*class="[^"]*s-lc-ea-tb[^"]*"[^>]*>/i).slice(1);
  for (const block of tableBlocks) {
    const tableEnd = block.indexOf('</table>');
    const segment = tableEnd >= 0 ? block.slice(0, tableEnd) : block;
    // Title + link
    const titleMatch = /<tr class="s-lc-ea-ttit"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(segment);
    if (!titleMatch) continue;
    const link = titleMatch[1].replace(/&amp;/g, '&');
    const title = titleMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    // From / To
    const fromMatch = /<tr class="s-lc-ea-from"[\s\S]*?<td>([\s\S]*?)<\/td>\s*<\/tr>/i.exec(segment);
    const toMatch = /<tr class="s-lc-ea-to"[\s\S]*?<td>([\s\S]*?)<\/td>\s*<\/tr>/i.exec(segment);
    const fromStr = fromMatch ? fromMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    const toStr = toMatch ? toMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    // Location
    const locMatch = /<tr class="s-lc-ea-tloc"[\s\S]*?<td>([\s\S]*?)<\/td>\s*<\/tr>/i.exec(segment);
    const location = locMatch ? locMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    // Description (s-lc-ea-tdes — sometimes present)
    const descMatch = /<tr class="s-lc-ea-tdes"[\s\S]*?<td>([\s\S]*?)<\/td>\s*<\/tr>/i.exec(segment);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    // Parse "From" datetime ("8:00 AM Friday, May 1, 2026" -> Date)
    const fromDate = new Date(fromStr.replace(/^(\d+:\d+\s*[AP]M)\s+\w+,\s+/, '$1 '));
    if (isNaN(fromDate.getTime())) continue;
    events.push({ title, link, fromDate, fromStr, toStr, location, description });
  }
  return events;
}

async function fetchWilkinsonEventImage(url) {
  try {
    const resp = await fetch(url);
    if (!resp || resp.status !== 200) return '';
    const m = /<meta\s+property="og:image"\s+content="([^"]+)"/i.exec(resp.text);
    return m ? m[1].replace(/&amp;/g, '&') : '';
  } catch (_) { return ''; }
}

async function syncWilkinsonEvents() {
  console.log('\n📚 Task 9: Syncing Wilkinson Public Library events...');
  let resp;
  try { resp = await fetch(WILKINSON_API); }
  catch (e) { console.warn(`  Fetch error: ${e.message}`); return null; }
  if (!resp || resp.status !== 200) {
    console.warn(`  LibCal HTTP ${resp ? resp.status : 'no response'}`);
    return null;
  }
  const parsed = parseWilkinsonHtml(resp.text);
  console.log(`  LibCal returned ${parsed.length} event(s) within 30-day window`);
  const now = Date.now();
  const horizon = now + 30 * 86400000;
  const events = [];
  for (const p of parsed) {
    const t = p.fromDate.getTime();
    if (isNaN(t) || t < now - 86400000) continue;  // skip already-past
    if (t > horizon) continue;                      // skip beyond 30 days
    // Fetch the event detail page for og:image (rate-limited by sequential await)
    const imageUrl = await fetchWilkinsonEventImage(p.link);
    // Build a clean description: location + time + (extracted desc if any)
    const descParts = [];
    if (p.fromStr) descParts.push(p.fromStr.split(/\s+\w+,\s+/)[0] + (p.toStr ? ' – ' + p.toStr.split(/\s+\w+,\s+/)[0] : ''));
    if (p.description) descParts.push(p.description);
    events.push({
      title: decodeHtmlEntities(p.title),
      link: p.link,
      description: smartTruncate(decodeHtmlEntities(descParts.join(' · ')), EVENT_DESC_MAX) || 'Wilkinson Public Library event',
      pubDate: p.fromDate.toISOString(),
      source: 'wilkinson',
      sourceLabel: 'Wilkinson Public Library',
      category: 'Library Event',
      location: decodeHtmlEntities(p.location) || 'Wilkinson Public Library',
      imageUrl,
    });
  }
  events.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
  console.log(`  Kept ${events.length} event(s) within 30 days (with images fetched)`);
  return events;
}


// ── Task 11: Nucla-Naturita Events (Tribe Events API, weekly) ──
// Source: https://nucla-naturita.com/events/
// Checks the Tribe Events API every Monday; returns [] on other days.
const NUCLA_TRIBE_API = 'https://nucla-naturita.com/wp-json/tribe/events/v1/events/?per_page=20&status=publish';

async function syncNuclaNaturitaEvents() {
  const dow = new Date().getUTCDay();
  if (dow !== 1) {
    console.log('\n📅 Task 11: Nucla-Naturita Events — skipping (weekly, runs Mondays)');
    return undefined; // undefined = no update needed
  }
  console.log('\n📅 Task 11: Syncing Nucla-Naturita events (Tribe API)...');
  try {
    const resp = await fetch(NUCLA_TRIBE_API);
    if (!resp.ok) { console.warn(`  Nucla-Naturita Tribe API HTTP ${resp.status}`); return null; }
    const data = await resp.json();
    const events = (data.events || []).map(ev => ({
      title:     ev.title || '',
      href:      ev.url   || 'https://nucla-naturita.com/events/',
      date:      ev.start_date || '',
      endDate:   ev.end_date   || '',
      location:  (ev.venue && ev.venue.venue) ? ev.venue.venue : (ev.venue && ev.venue.address ? ev.venue.address.city : ''),
      copy:      ev.description ? smartTruncate(ev.description.replace(/<[^>]+>/g,''), EVENT_DESC_MAX) : '',
    }));
    console.log(`  Nucla-Naturita events: ${events.length}`);
    return events;
  } catch (e) {
    console.warn('  Nucla-Naturita events error:', e.message);
    return null;
  }
}

// ── Task 12: Club Red Telluride Shows (Squarespace, weekly) ──
// Source: https://www.clubredtelluride.com/shows
// Checks the Squarespace JSON API every Monday.
const CLUB_RED_URL = 'https://www.clubredtelluride.com/shows?format=json';

async function syncClubRedShows() {
  const dow = new Date().getUTCDay();
  if (dow !== 1) {
    console.log('\n🎸 Task 12: Club Red Shows — skipping (weekly, runs Mondays)');
    return undefined;
  }
  console.log('\n🎸 Task 12: Syncing Club Red Telluride shows...');
  try {
    const resp = await fetch(CLUB_RED_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivableTelluride/1.0)' }
    });
    if (!resp.ok) { console.warn(`  Club Red HTTP ${resp.status}`); return null; }
    const data = await resp.json();
    const itemCount = (data.collection && data.collection.itemCount) || 0;
    if (itemCount === 0) {
      console.log('  Club Red: 0 shows currently listed');
      return [];
    }
    // When shows are added as Squarespace events, extract from mainContent HTML
    const html = data.mainContent || '';
    const shows = [];
    // Extract show blocks: look for date + title patterns in heading/paragraph tags
    const headings = [...html.matchAll(/<h[1-4][^>]*>([^<]+)<\/h[1-4]>/gi)]
      .map(m => m[1].trim())
      .filter(t => t && !t.match(/^(upcoming|shows|stay tuned|buy tickets)/i));
    const dateRe = /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s*20\d{2})?/i;
    for (let i = 0; i < headings.length; i++) {
      const title = headings[i];
      const dateMatch = html.match(dateRe);
      shows.push({
        title,
        href:  'https://www.clubredtelluride.com/shows',
        date:  dateMatch ? dateMatch[0] : '',
        location: 'Club Red, Mountain Village',
        copy:  'Live music at Club Red Telluride. 580 Mountain Village Blvd.',
      });
    }
    console.log(`  Club Red shows found: ${shows.length}`);
    return shows;
  } catch (e) {
    console.warn('  Club Red error:', e.message);
    return null;
  }
}

// ── Task 13: Fresh Food Hub Events (Tribe Events API, weekly) ──
// Source: https://freshfoodhub.net/get-involved/#newsandupdates
const FRESH_FOOD_HUB_TRIBE_API = 'https://freshfoodhub.net/wp-json/tribe/events/v1/events/?per_page=20&status=publish';

async function syncFreshFoodHubEvents() {
  const dow = new Date().getUTCDay();
  if (dow !== 1) {
    console.log('\n🌽 Task 13: Fresh Food Hub Events — skipping (weekly, runs Mondays)');
    return undefined;
  }
  console.log('\n🌽 Task 13: Syncing Fresh Food Hub events (Tribe API)...');
  try {
    const resp = await fetch(FRESH_FOOD_HUB_TRIBE_API);
    if (!resp.ok) { console.warn(`  Fresh Food Hub Tribe API HTTP ${resp.status}`); return null; }
    const data = await resp.json();
    const events = (data.events || []).map(ev => ({
      title:    ev.title || '',
      href:     ev.url   || 'https://freshfoodhub.net/get-involved/',
      date:     ev.start_date || '',
      endDate:  ev.end_date   || '',
      location: (ev.venue && ev.venue.venue) ? ev.venue.venue : 'Norwood, CO',
      copy:     ev.description ? smartTruncate(ev.description.replace(/<[^>]+>/g,''), EVENT_DESC_MAX) : '',
    }));
    console.log(`  Fresh Food Hub events: ${events.length}`);
    return events;
  } catch (e) {
    console.warn('  Fresh Food Hub events error:', e.message);
    return null;
  }
}


// ── Task 14: Sherbino Theater Events (Tribe Events API, weekly) ──
// Source: https://sherbino.org/events/
// Checks the Tribe Events API every Monday. Same stack as KOTO/Nucla/FreshFoodHub.
const SHERBINO_TRIBE_API = 'https://sherbino.org/wp-json/tribe/events/v1/events/?per_page=30&status=publish';

async function syncSherbinoEvents() {
  const dow = new Date().getUTCDay();
  if (dow !== 1) {
    console.log('\n🎭 Task 14: Sherbino Theater Events — skipping (weekly, runs Mondays)');
    return undefined;
  }
  console.log('\n🎭 Task 14: Syncing Sherbino Theater events (Tribe API)...');
  try {
    const resp = await fetch(SHERBINO_TRIBE_API);
    if (!resp.ok) { console.warn(`  Sherbino Tribe API HTTP ${resp.status}`); return null; }
    const data = await resp.json();
    const now = Date.now();
    const horizon = now + 30 * 86400000;
    const events = (data.events || [])
      .filter(ev => {
        if (!ev || !ev.start_date) return false;
        const t = new Date(ev.start_date.replace(' ', 'T')).getTime();
        return !isNaN(t) && t >= now - 86400000 && t <= horizon;
      })
      .map(ev => ({
        title:    decodeHtmlEntities(ev.title || ''),
        href:     ev.url || 'https://sherbino.org/events/',
        date:     ev.start_date || '',
        endDate:  ev.end_date   || '',
        // Always include "Ridgway" in the location so the Events tab town
        // chip + town-badge image both classify Sherbino correctly. Without
        // appending the city, "The Sherbino" alone falls through to the
        // Telluride default badge.
        location: (ev.venue && ev.venue.venue && ev.venue.city)
                    ? `${ev.venue.venue}, ${ev.venue.city}`
                  : (ev.venue && ev.venue.venue) ? `${ev.venue.venue}, Ridgway`
                  : (ev.venue && ev.venue.city) ? ev.venue.city
                  : 'Ridgway, CO',
        copy:     ev.description ? decodeHtmlEntities(
                    smartTruncate(ev.description.replace(/<[^>]+>/g, ''), EVENT_DESC_MAX)) : '',
        imageUrl: (ev.image && ev.image.url) ? ev.image.url : '',
      }));
    console.log(`  Sherbino events: ${events.length} (within 30 days)`);
    return events;
  } catch (e) {
    console.warn('  Sherbino events error:', e.message);
    return null;
  }
}

// ── Task 10: Telluride Foundation Events (HTML scraper) ──
// The TF events page is a manually-maintained WPBakery page — no RSS.
// We fetch the HTML, parse each wpb_text_column block for event data,
// and keep only future events.
async function syncTelluridFoundationEvents() {
  console.log('\n🌲 Task 10: Syncing Telluride Foundation events...');
  try {
    const res = await fetch('https://telluridefoundation.org/tf-events/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivableTelluride/1.0)' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Each event lives inside a .wpb_wrapper div. Pull all of them.
    const blockRe = /<div class="wpb_wrapper">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    const events = [];
    const seen = new Set();

    // Decode common HTML entities
    const decode = s => s
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
      .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
      .replace(/&#8216;|&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    let m;
    while ((m = blockRe.exec(html)) !== null) {
      const block = m[1];
      // Strip all tags to plain text
      const plain = decode(block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (!plain) continue;

      // Must contain a day-of-week + month date pattern
      const dateRe = /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})/gi;
      const dateMatches = [...plain.matchAll(dateRe)];
      if (!dateMatches.length) continue;

      // Title: bold/underlined text before the first date (strip leading fluff)
      const firstDateIdx = plain.indexOf(dateMatches[0][1]);
      let rawTitle = plain.slice(0, firstDateIdx).trim();
      // Remove stray "Upcoming Events:" prefix if present
      rawTitle = rawTitle.replace(/^(?:PLEASE JOIN US!?\s*)?(?:Upcoming Events:?\s*)?/i, '').trim();
      if (!rawTitle || rawTitle.length < 4) continue;
      // Use first 120 chars max
      const title = rawTitle.slice(0, 120).replace(/\s+/g, ' ').trim();

      // Time: HH:MM AM/PM – HH:MM AM/PM
      const timeM = plain.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)\s*[–-]\s*\d{1,2}:\d{2}\s*(?:AM|PM))/i);
      const eventTimes = timeM ? timeM[1].replace(/\s*[–-]\s*/g, ' – ') : '';

      // Location: bold text right after the time line (usually a venue name)
      // Heuristic: text between time and the long description (first sentence)
      let location = '';
      if (timeM) {
        const afterTime = plain.slice(plain.indexOf(timeM[1]) + timeM[1].length).trim();
        // Take text up to first sentence-ending period or long gap
        const locM = afterTime.match(/^([^.\n]{3,60}?)(?:\s{2,}|\.|The |Join |Both |All )/);
        if (locM) location = locM[1].trim();
      }

      // Description: everything after the first date+time block, up to ~300 chars
      const afterFirst = plain.slice(firstDateIdx).replace(dateRe, '').replace(timeM ? timeM[1] : '', '');
      const copy = smartTruncate(afterFirst.replace(location, '').replace(/^[^a-zA-Z]+/, ''), EVENT_DESC_MAX);

      // For multi-date events (same title, two locations), emit one entry per future date
      for (const dm of dateMatches) {
        const eventDate = new Date(dm[1]);
        if (isNaN(eventDate.getTime()) || eventDate < today) continue;
        const key = title.slice(0, 40) + '|' + eventDate.toISOString().slice(0, 10);
        if (seen.has(key)) continue;
        seen.add(key);
        events.push({
          title,
          date: eventDate.toISOString(),
          location: location || 'Telluride Area',
          eventTimes,
          copy,
          href: 'https://telluridefoundation.org/tf-events/',
          source: 'Telluride Foundation',
          sourceKey: 'tf-news'
        });
      }
    }

    console.log(`  Found ${events.length} upcoming TF events`);
    return events;
  } catch (e) {
    console.error('  TF events scrape error:', e.message);
    return null; // null = skip update
  }
}


// ══════════════════════════════════════════════════════════════
// ── Task N: Sync Ouray County Meetings from CivicPlus RSS ──
// ══════════════════════════════════════════════════════════════
async function syncOurayMeetings() {
  console.log('\n🏔️  Syncing Ouray County meetings from AgendaCenter RSS...');
  const now = new Date();
  const horizon = now.getTime() + 60 * 86400000;  // 60-day window
  const pruneDate = new Date(now.getTime() - 7 * 86400000); // prune >7 days past

  const feedDefs = [
    { url: 'https://ouraycountyco.gov/RSSFeed.aspx?ModID=65&CID=Board-of-County-Commissioners-1', board: 'bocc' },
    { url: 'https://ouraycountyco.gov/RSSFeed.aspx?ModID=65&CID=Planning-Commission-2', board: 'pc' }
  ];

  const entries = [];
  for (const feedDef of feedDefs) {
    try {
      const resp = await fetch(feedDef.url);
      if (resp.status !== 200) {
        console.log(`  HTTP ${resp.status} for ${feedDef.board} feed`);
        return null;  // don't clobber on error
      }
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);
      for (const item of arr) {
        const titleText = item.title || '';
        const dateMatch = titleText.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
        let mDate;
        if (dateMatch) {
          mDate = new Date(dateMatch[1]);
        } else {
          const pubMatch = titleText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
          mDate = pubMatch ? new Date(pubMatch[1]) : new Date(item.pubDate || '');
        }
        if (isNaN(mDate)) continue;
        if (mDate < pruneDate || mDate.getTime() > horizon) continue;

        const cleanTitle = titleText
          .replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*@?\s*[\d:APMapm]*\s*(AM|PM)?\s*-?\s*/, '')
          .trim() || (feedDef.board === 'bocc' ? 'BOCC Meeting' : 'Planning Commission Meeting');

        const dateStr = mDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        entries.push({
          date: dateStr,
          title: cleanTitle,
          board: feedDef.board,
          agendaUrl: item.link || null
        });
      }
    } catch (e) {
      console.warn('  Ouray RSS error:', e.message);
      return null;
    }
  }

  // Sort by date ascending
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`  Found ${entries.length} Ouray County meeting(s)`);
  return entries;
}

// ══════════════════════════════════════════════════════════════
// ── Task N: Sync Norwood Meetings from HTML pages ──
// ══════════════════════════════════════════════════════════════
async function syncNorwoodMeetings() {
  console.log('\n🏘️  Syncing Norwood meetings from meeting pages...');
  const now = new Date();
  const pruneDate = new Date(now.getTime() - 7 * 86400000);
  const horizon = now.getTime() + 60 * 86400000;

  const pageDefs = [
    { url: 'https://www.norwoodtown.com/board-of-trustees-meetings?year=2026', board: 'bot' },
    { url: 'https://www.norwoodtown.com/planning-and-zoning-commission-meetings?year=2026', board: 'pz' }
  ];

  const entries = [];
  for (const pageDef of pageDefs) {
    try {
      const resp = await fetch(pageDef.url);
      if (resp.status !== 200) {
        console.log(`  HTTP ${resp.status} for ${pageDef.board}`);
        return null;
      }
      const html = resp.text;
      // Extract meeting entries via aria-label: "View [title] on YYYY-MM-DD"
      const viewRe = /aria-label="View ([^"]+) on (\d{4}-\d{2}-\d{2})"/g;
      const agendaRe = /aria-label="Agenda attachment for (\d{4}-\d{2}-\d{2}) [^"]*"[^>]*href="([^"]+)"/g;

      // Build agenda map by date
      const agendaMap = {};
      let am;
      while ((am = agendaRe.exec(html)) !== null) {
        if (!agendaMap[am[1]]) agendaMap[am[1]] = 'https://www.norwoodtown.com' + am[2];
      }

      let vm;
      while ((vm = viewRe.exec(html)) !== null) {
        const title = vm[1];
        const dateStr = vm[2];
        const mDate = new Date(dateStr + 'T12:00:00'); // noon local to avoid tz
        if (mDate < pruneDate || mDate.getTime() > horizon) continue;
        const agendaUrl = agendaMap[dateStr] || null;
        const humanDate = mDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        entries.push({ date: humanDate, title, board: pageDef.board, agendaUrl });
      }
    } catch (e) {
      console.warn('  Norwood scrape error:', e.message);
      return null;
    }
  }

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`  Found ${entries.length} Norwood meeting(s)`);
  return entries;
}


// ─────────────────────────────────────────────────────────────────────
// Per-source agenda-URL detection for entities whose CACHED_DATA arrays
// in gov-data.js are hand-curated (MV, Fire, Med). These return
// { "Month D, YYYY": "https://...agenda.pdf" } maps; main() patches the
// matching entry's agendaUrl in gov-data.js so the data layer stays
// authoritative and downstream helpers/summary generation pick it up.
// ─────────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_LOOKUP = {};
MONTH_NAMES.forEach((m, i) => {
  MONTH_LOOKUP[m.toLowerCase()] = i;
  MONTH_LOOKUP[m.slice(0, 3).toLowerCase()] = i;
});

function dateKeyFromYMD(y, m0, d) {
  return `${MONTH_NAMES[m0]} ${parseInt(d, 10)}, ${y}`;
}

async function fetchPage(url, label) {
  try {
    const target = maybeProxy(url);
    const resp = await fetch(target);
    if (resp.status !== 200) {
      console.warn(`  ${label}: HTTP ${resp.status}`);
      return null;
    }
    return resp.text;
  } catch (e) {
    console.warn(`  ${label}: fetch error (${e.message})`);
    return null;
  }
}

// Mountain Village — PDFs at townofmountainvillage.com/site/assets/files/<id>/
// Filename pattern: <month>_<dd>-_<yyyy>_town_council_meeting_agenda(?:-N)?.pdf
async function syncMVAgendas() {
  console.log('\n⛰  Syncing Mountain Village agenda PDFs...');
  const PAGE = 'https://townofmountainvillage.com/government/town-council/town-council/';
  const html = await fetchPage(PAGE, 'MV town-council page');
  if (!html) return null;

  // Match every site/assets/files/<id>/<slug>.pdf that looks like an agenda
  const pdfRe = /site\/assets\/files\/(\d+)\/([a-z0-9_-]+)\.pdf/gi;
  const map = {};
  let m;
  while ((m = pdfRe.exec(html)) !== null) {
    const slug = m[2].toLowerCase();
    if (!/agenda/.test(slug)) continue;
    // Match filenames like  "may_21-_2026_town_council_meeting_agenda(-1)"
    // or "01_january_28-_2026_special_town_council_meeting_agenda".
    const sm = /(?:^|_)([a-z]+)_(\d{1,2})[-_]+(\d{4})_/.exec(slug);
    if (!sm) continue;
    const mIdx = MONTH_LOOKUP[sm[1]];
    if (mIdx === undefined) continue;
    const key = dateKeyFromYMD(sm[3], mIdx, sm[2]);
    const url = 'https://townofmountainvillage.com/' + m[0];
    // Prefer agenda over packet; prefer most-recent (highest file id) variant
    if (!map[key] || parseInt(m[1], 10) > parseInt(map[key].id, 10)) {
      map[key] = { url, id: m[1], slug };
    }
  }
  const result = {};
  Object.keys(map).forEach(k => { result[k] = map[k].url; });
  console.log(`  Found ${Object.keys(result).length} MV agenda PDF(s)`);
  return result;
}

// Shared parser for the Traction Rec CMS used by both Fire and Hospital
// Districts. Walks meeting slug positions and PDF positions independently,
// then pairs each meeting with the first agenda PDF that falls between it
// and the next meeting slug. This avoids the trap where a future meeting
// (no agenda yet) on the listing page borrows the next past meeting's PDF.
function parseTractionRecAgendas(html, host) {
  const meetingRe = /\/(\d{4})-(\d{2})-(\d{2})-[a-z0-9-]*(?:board|meeting)[a-z0-9-]*/g;
  const pdfRe = /\/files\/([a-z0-9]+)\/([^"'\s<>]*[Aa]genda[^"'\s<>]*\.pdf)/g;
  const meetings = [];
  const pdfs = [];
  let m;
  while ((m = meetingRe.exec(html)) !== null) {
    meetings.push({ pos: m.index, year: m[1], month: m[2], day: m[3] });
  }
  while ((m = pdfRe.exec(html)) !== null) {
    pdfs.push({ pos: m.index, hash: m[1], name: m[2] });
  }
  // Dedupe meetings by date, keeping the FIRST occurrence (which is where
  // the card starts on the page); the duplicates are just second anchors
  // inside the same card.
  const seen = new Set();
  const uniqMeetings = [];
  for (const mt of meetings) {
    const key = `${mt.year}-${mt.month}-${mt.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqMeetings.push(mt);
  }
  const map = {};
  for (let i = 0; i < uniqMeetings.length; i++) {
    const mt = uniqMeetings[i];
    const nextPos = i + 1 < uniqMeetings.length ? uniqMeetings[i + 1].pos : Infinity;
    const candidate = pdfs.find(p => p.pos > mt.pos && p.pos < nextPos);
    if (!candidate) continue;
    const key = dateKeyFromYMD(mt.year, parseInt(mt.month, 10) - 1, mt.day);
    map[key] = `https://${host}/files/${candidate.hash}/${candidate.name}`;
  }
  return map;
}

async function syncFireAgendas() {
  console.log('\n🚒 Syncing Fire District agenda PDFs...');
  const PAGE = 'https://www.telluridefire.com/board-meetings';
  const html = await fetchPage(PAGE, 'Fire District board-meetings page');
  if (!html) return null;
  const map = parseTractionRecAgendas(html, 'www.telluridefire.com');
  console.log(`  Found ${Object.keys(map).length} Fire District agenda PDF(s)`);
  return map;
}

async function syncMedAgendas() {
  console.log('\n🏥 Syncing Hospital District agenda PDFs...');
  const PAGE = 'https://www.tellmed.org/board-meetings';
  const html = await fetchPage(PAGE, 'Hospital District board-meetings page');
  if (!html) return null;
  const map = parseTractionRecAgendas(html, 'www.tellmed.org');
  console.log(`  Found ${Object.keys(map).length} Hospital District agenda PDF(s)`);
  return map;
}

// Patches gov-data.js in place: for each (date → url) in `agendaMap`, finds
// the matching entry inside the given CACHED_DATA array and rewrites its
// `agendaUrl:` field. Scoped to the named array's brace block so the same
// date string in a different entity's array is untouched. Returns the
// updated source plus a count of fields changed.
function patchAgendaUrls(govDataSrc, arrayName, agendaMap) {
  const startRe = new RegExp('const\\s+' + arrayName + '\\s*=\\s*\\[', 'g');
  const startMatch = startRe.exec(govDataSrc);
  if (!startMatch) return { src: govDataSrc, changed: 0 };

  let depth = 0;
  const arrStart = startMatch.index + startMatch[0].length - 1;
  let arrEnd = arrStart;
  for (let i = arrStart; i < govDataSrc.length; i++) {
    if (govDataSrc[i] === '[') depth++;
    else if (govDataSrc[i] === ']') {
      depth--;
      if (depth === 0) { arrEnd = i; break; }
    }
  }
  const before = govDataSrc.slice(0, arrStart + 1);
  let body = govDataSrc.slice(arrStart + 1, arrEnd);
  const after = govDataSrc.slice(arrEnd);

  let changed = 0;
  Object.keys(agendaMap).forEach(dateKey => {
    const url = agendaMap[dateKey];
    if (!url) return;
    // Build a regex that finds a single entry block starting with `date: '<dateKey>'`
    // (single-quoted, just like the source) and ending at the entry-closing `},`.
    const escDate = dateKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entryRe = new RegExp(
      "(\\{[^{}]*date:\\s*'" + escDate + "'[^{}]*?agendaUrl:\\s*)(null|'[^']*')",
      'g'
    );
    body = body.replace(entryRe, (full, prefix, current) => {
      const newVal = "'" + url + "'";
      if (current === newVal) return full;
      changed++;
      return prefix + newVal;
    });
  });

  return { src: before + body + after, changed };
}


// ── SMC AlertCenter: fetch active alerts and store as event-shaped objects ──
async function refreshSmcAlerts(existingAlerts = []) {
  console.log('\n🚨 SMC AlertCenter: Refreshing active alerts...');
  const RSS_URL = 'https://www.sanmiguelcountyco.gov/RSSFeed.aspx?ModID=63&CID=All-0';
  const cutoff = new Date(Date.now() - 30 * 86400000); // 30-day window
  const existingByHref = new Map((existingAlerts || []).map(a => [a.href, a]));
  const alerts = [];
  try {
    const resp = await fetch(RSS_URL);
    if (resp.status !== 200) {
      console.warn(`  SMC AlertCenter RSS HTTP ${resp.status} — carrying forward existing`);
      return existingAlerts;
    }
    const xml = await parseXml(resp.text);
    const items = xml?.rss?.channel?.item;
    const arr = Array.isArray(items) ? items : (items ? [items] : []);
    for (const item of arr) {
      const pubDate = new Date(item.pubDate || '');
      if (isNaN(pubDate) || pubDate < cutoff) continue;
      const href = (item.link || '').trim();
      const title = (item.title || '').trim();
      const desc = (item.description || '').replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
      alerts.push({
        title,
        source: 'San Miguel County',
        sourceLabel: 'San Miguel County',
        category: 'Alert',
        date: pubDate.toISOString().slice(0, 10),
        pubDate: pubDate.toISOString(),
        copy: desc,
        href,
        img: ''
      });
    }
    console.log(`  SMC AlertCenter: ${alerts.length} active alert(s)`);
  } catch (e) {
    console.warn(`  SMC AlertCenter RSS error: ${e.message} — carrying forward existing`);
    return existingAlerts;
  }
  return alerts;
}


// ── Engage Telluride — daily scrape of published project key dates ──
async function refreshEngageMeetings(existing = []) {
  const BASE = 'https://engagetelluride.org';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today.getTime() + 60 * 86400000); // 60 days ahead
  const results = [];

  try {
    // 1. Fetch the projects page and extract published slugs
    const projectsRes = await fetch(BASE + '/projects');
    if (projectsRes.status !== 200) throw new Error('projects page HTTP ' + projectsRes.status);
    const projectsHtml = projectsRes.text;

    // Extract href from project-tile__link anchors within published tile blocks
    const slugSet = new Set();
    // Tiles: data-state='published' appears in the wrapping div, href in the inner anchor
    // Pattern: find each tile block marked published, then grab its project-tile__link href
    const tileBlockRe = /data-state='published'[\s\S]{0,800}?class="project-tile__link"\s+href="(\/[^"]+)"/gi;
    let m;
    while ((m = tileBlockRe.exec(projectsHtml)) !== null) slugSet.add(m[1]);
    // Also the reverse (href before state marker in same card)
    const tileBlockRe2 = /class="project-tile__link"\s+href="(\/[^"]+)"[\s\S]{0,800}?data-state='published'/gi;
    while ((m = tileBlockRe2.exec(projectsHtml)) !== null) slugSet.add(m[1]);
    const slugs = [...slugSet];
    console.log(`  Engage Telluride: ${slugs.length} published projects found`);

    for (const slug of slugs) {
      try {
        // 2. Fetch the project page to find Key Date widget IDs
        const projRes = await fetch(BASE + slug);
        if (projRes.status !== 200) continue;
        const projHtml = projRes.text;

        const widgetIds = [];
        const widgetRe = /id='KeyDateWidget_(\d+)'/gi;
        while ((m = widgetRe.exec(projHtml)) !== null) widgetIds.push(m[1]);
        if (widgetIds.length === 0) continue;

        // 3. Fetch each key dates widget page
        for (const wid of widgetIds) {
          try {
            const kdUrl = BASE + slug + '/widgets/' + wid + '/key_dates';
            const kdRes = await fetch(kdUrl);
            if (kdRes.status !== 200) continue;
            const kdHtml = kdRes.text;

            // Parse keydate-wrap blocks: anchor name, date, heading
            const wrapRe = /<a name='(\d+)'><\/a>[\s\S]{0,200}?<div class='nomargin keydate__date'>([^<]+)<\/div>\s*<h2 class='keydate__heading'>([^<]+)<\/h2>/gi;
            while ((m = wrapRe.exec(kdHtml)) !== null) {
              const anchor = m[1];
              const rawDate = m[2].trim();
              const title = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

              const d = new Date(rawDate);
              if (isNaN(d.getTime())) continue;
              d.setHours(0, 0, 0, 0);
              if (d < today || d > cutoff) continue;

              const dateStr = d.toISOString().slice(0, 10);
              const tl = title.toLowerCase();
              const board = /\bharc\b/.test(tl) ? 'harc'
                : /planning\s*&?\s*zoning|p\s*&?\s*z\b/.test(tl) ? 'pz'
                : /town\s*council/.test(tl) ? 'council'
                : /ccaase/.test(tl) ? 'ccaase'
                : /parks/.test(tl) ? 'parks'
                : /liquor/.test(tl) ? 'liquor'
                : 'other';

              const projectName = slug.replace(/^\//, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

              results.push({ projectName, projectUrl: BASE + slug, title, date: dateStr, board, dateUrl: kdUrl + '#' + anchor });
            }
          } catch (e2) {
            console.warn(`  Engage key_dates error (${slug}/widgets/${wid}): ${e2.message}`);
          }
        }
      } catch (e1) {
        console.warn(`  Engage project error (${slug}): ${e1.message}`);
      }
    }

    // Deduplicate by projectUrl|date|board
    const seen = new Set();
    const deduped = results.filter(r => {
      const key = r.projectUrl + '|' + r.date + '|' + r.board;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    deduped.sort((a, b) => a.date.localeCompare(b.date));
    console.log(`  Engage Telluride: ${deduped.length} upcoming key date(s) found`);
    return deduped;

  } catch (e) {
    console.warn(`  Engage Telluride scrape error: ${e.message} — carrying forward existing`);
    return existing;
  }
}

// ══════════════════════════════════════════════════════════════════
// ── Task 17: Norwood Town events/notices (sitemap approach) ──
// ══════════════════════════════════════════════════════════════════
// norwoodtown.com is a React SPA — the /public-notices page renders
// nothing server-side. We use the sitemap instead: every dated entry
// has the format https://www.norwoodtown.com/YYYY-MM-DD-slug-title,
// from which we extract the date and derive a readable title.

async function syncNorwoodEvents() {
  console.log('\n🏔  Task 17: Syncing Norwood Town events (sitemap)...');
  const SITEMAP_URL = 'https://www.norwoodtown.com/sitemap.xml';
  let xml;
  try {
    const resp = await fetch(SITEMAP_URL);
    if (!resp || resp.status !== 200) {
      console.warn(`  Norwood sitemap HTTP ${resp ? resp.status : 'no response'}`);
      return null;
    }
    xml = resp.text || '';
  } catch (e) {
    console.warn(`  Norwood sitemap fetch error: ${e.message}`);
    return null;
  }

  const now = Date.now();
  const past7  = now - 7  * 86400000;
  const future = now + 90 * 86400000;

  // Slug-title cleaning helpers
  function slugToTitle(slug) {
    return slug
      .replace(/-/g, ' ')
      .replace(/\b(nwc|nsd|rfp|ton|bocc)\b/gi, s => s.toUpperCase())
      .replace(/\bmesa\b/gi, 'Mesa')
      .replace(/\btoo\b/gi, 'too')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  }

  function classifySlug(slug) {
    const s = slug.toLowerCase();
    if (/notice|bid|rfp|request.for.proposal/.test(s)) return 'Public Notice';
    if (/closed|holiday/.test(s)) return 'Town Closure';
    if (/music|festival|concert|fair|rodeo|pioneer|car.show/.test(s)) return 'Community Event';
    if (/board|trustee|planning|commission|meeting|nwc/.test(s)) return 'Government Meeting';
    return 'Community Event';
  }

  const dateSlugRe = /https?:\/\/www\.norwoodtown\.com\/(\d{4}-\d{2}-\d{2})-([a-z0-9][^<\s"]+)/gi;
  const seen = new Set();
  const events = [];
  let match;

  while ((match = dateSlugRe.exec(xml)) !== null) {
    const dateStr = match[1];      // e.g. "2026-05-12"
    const slug    = match[2];      // e.g. "nwc-meeting"
    const eventDate = new Date(dateStr + 'T12:00:00');
    const ms = eventDate.getTime();
    if (isNaN(ms) || ms < past7 || ms > future) continue;
    const key = dateStr + '|' + slug;
    if (seen.has(key)) continue;
    seen.add(key);

    const title = slugToTitle(slug);
    const category = classifySlug(slug);
    const link = 'https://www.norwoodtown.com/' + dateStr + '-' + slug;

    events.push({
      title,
      link,
      description: '',
      pubDate: eventDate.toISOString(),
      source: 'norwood',
      sourceLabel: 'Town of Norwood',
      category,
      location: 'Norwood, CO',
      imageUrl: ''
    });
  }

  events.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
  console.log(`  Norwood: ${events.length} events/notices from sitemap`);
  return events;
}

// ══════════════════════════════════════════════════════════════════
// ── Task 18: Mountain Village events (sitemap + page scrape) ──
// ══════════════════════════════════════════════════════════════════
// The RecurMe calendar on townofmountainvillage.com is AJAX-only;
// static HTML returns no event links. We use the sitemap for slugs,
// fetch each individual page for og:title/og:description/og:image,
// and parse the human-readable "When" section to generate per-
// occurrence Date objects within the 60-day window.

const MV_GOV_SLUG_RE = /town-council|council-meeting|planning-commission|special-meeting|executive-session|work-session|advisory|certification|training|food-safety|food-protection|business-development|board-of/i;

function parseMVWhenText(whenText, fromMs, toMs) {
  const dates = [];
  if (!whenText) return dates;
  const text = whenText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Pattern 1: "The Nth weekday of each month" (e.g. "The third Wednesday of each month")
  const ordinalMap = { first:0, second:1, third:2, fourth:3, fifth:4, last:-1 };
  const weekdayMap = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
  const monthlyRe = /(?:the\s+)?(\w+)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+of\s+each\s+month/i;
  const mMatch = monthlyRe.exec(text);
  if (mMatch) {
    const ordinal = ordinalMap[mMatch[1].toLowerCase()];
    const weekday = weekdayMap[mMatch[2].toLowerCase()];
    if (ordinal !== undefined && weekday !== undefined) {
      const cur = new Date(fromMs);
      cur.setDate(1);
      cur.setHours(12, 0, 0, 0);
      // Generate for next 3 months
      for (let mo = 0; mo < 3; mo++) {
        const year = cur.getFullYear();
        const month = cur.getMonth();
        // Find the Nth weekday
        let count = -1;
        let day = new Date(year, month, 1);
        let target = null;
        if (ordinal >= 0) {
          while (day.getMonth() === month) {
            if (day.getDay() === weekday) {
              count++;
              if (count === ordinal) { target = new Date(day); break; }
            }
            day.setDate(day.getDate() + 1);
          }
        } else {
          // "last" weekday of the month
          day = new Date(year, month + 1, 0); // last day of month
          while (day.getMonth() === month) {
            if (day.getDay() === weekday) { target = new Date(day); break; }
            day.setDate(day.getDate() - 1);
          }
        }
        if (target) {
          target.setHours(12, 0, 0, 0);
          const ms = target.getTime();
          if (ms >= fromMs && ms <= toMs) dates.push(target);
        }
        cur.setMonth(cur.getMonth() + 1);
      }
      return dates;
    }
  }

  // Pattern 2: Weekly on a specific weekday (e.g. "Saturdays" / "Every Friday")
  const weeklyRe = /(?:every\s+|each\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?/i;
  const wMatch = weeklyRe.exec(text);
  if (wMatch) {
    const weekday = weekdayMap[wMatch[1].toLowerCase()];
    const cur = new Date(fromMs);
    // Advance to first matching weekday
    while (cur.getDay() !== weekday) cur.setDate(cur.getDate() + 1);
    cur.setHours(12, 0, 0, 0);
    while (cur.getTime() <= toMs) {
      dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 7);
    }
    return dates;
  }

  // Pattern 3: Specific dates in text (Month DD, YYYY)
  const specificRe = /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/gi;
  let sMatch;
  while ((sMatch = specificRe.exec(text)) !== null) {
    const d = new Date(sMatch[0]);
    if (!isNaN(d.getTime())) {
      d.setHours(12, 0, 0, 0);
      const ms = d.getTime();
      if (ms >= fromMs && ms <= toMs) dates.push(d);
    }
  }
  return dates;
}

async function syncMountainVillageEvents() {
  console.log('\n🏔  Task 18: Syncing Mountain Village events (sitemap+pages)...');
  const SITEMAP_URL = 'https://www.townofmountainvillage.com/sitemap.xml';
  let sitemapXml;
  try {
    const resp = await fetch(SITEMAP_URL);
    if (!resp || resp.status !== 200) {
      console.warn(`  MV sitemap HTTP ${resp ? resp.status : 'no response'}`);
      return null;
    }
    sitemapXml = resp.text || '';
  } catch (e) {
    console.warn(`  MV sitemap fetch error: ${e.message}`);
    return null;
  }

  // Extract event page slugs
  const slugRe = /https?:\/\/www\.townofmountainvillage\.com\/explore\/events\/all-events\/([^/<">\s]+)\//gi;
  const slugSet = new Set();
  let m;
  while ((m = slugRe.exec(sitemapXml)) !== null) {
    const slug = m[1];
    if (!MV_GOV_SLUG_RE.test(slug)) slugSet.add(slug);
  }
  const slugs = Array.from(slugSet);
  console.log(`  MV: ${slugs.length} non-gov event slugs found`);

  const now = Date.now();
  const fromMs = now - 86400000;        // allow yesterday (in case of timezone)
  const toMs   = now + 60 * 86400000;  // 60-day window

  const events = [];
  let fetched = 0;

  for (const slug of slugs) {
    const url = 'https://www.townofmountainvillage.com/explore/events/all-events/' + slug + '/';
    let html;
    try {
      const resp = await fetch(url);
      if (!resp || resp.status !== 200) continue;
      html = resp.text || '';
      fetched++;
    } catch (e) {
      continue;
    }
    // Throttle
    await new Promise(r => setTimeout(r, 400));

    // Extract metadata from og: tags
    const ogTitle = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || [])[1]
                 || (html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i) || [])[1]
                 || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const ogDesc  = (html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) || [])[1]
                 || (html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i) || [])[1]
                 || '';
    const ogImage = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1]
                 || (html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i) || [])[1]
                 || '';

    // Extract "When" section
    const whenMatch = html.match(/When<\/h[123456]>([\s\S]{0,600}?)(?:<h[123456]|<\/section|<\/div)/i)
                   || html.match(/When<\/strong>([\s\S]{0,400}?)(?:<strong|<\/p|<br\s*\/?>)/i);
    const whenText = whenMatch ? whenMatch[1] : '';

    const occurrences = parseMVWhenText(whenText, fromMs, toMs);
    if (occurrences.length === 0) continue;

    const title = decodeHtmlEntities(ogTitle).trim();
    const description = smartTruncate(decodeHtmlEntities(ogDesc).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), EVENT_DESC_MAX);
    const link = url;

    for (const d of occurrences) {
      events.push({
        title,
        link,
        description,
        pubDate: d.toISOString(),
        source: 'mv',
        sourceLabel: 'Mountain Village',
        category: 'Community Event',
        location: 'Mountain Village, CO',
        imageUrl: ogImage
      });
    }
  }

  events.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
  console.log(`  Mountain Village: ${events.length} event occurrences from ${fetched} pages`);
  return events;
}

// ══════════════════════════════════════════════════════════════════
// ── Task 19: Telluride.com events (sitemap + JSON-LD / date list) ──
// ══════════════════════════════════════════════════════════════════
// telluride.com is a ProcessWire CMS. We fetch the sitemap to get
// event slugs, then visit each page: first try JSON-LD Event schema
// (multi-day festivals have startDate/endDate), then fall back to
// parsing individual <li> date entries in the "u-featured-bullets"
// section (recurring events like Farmers Market list each date).

async function syncTelluridComEvents() {
  console.log('\n🎪  Task 19: Syncing Telluride.com events (sitemap+pages)...');
  const SITEMAP_URL = 'https://www.telluride.com/sitemap.xml';
  let sitemapXml;
  try {
    const resp = await fetch(SITEMAP_URL);
    if (!resp || resp.status !== 200) {
      console.warn(`  Telluride.com sitemap HTTP ${resp ? resp.status : 'no response'}`);
      return null;
    }
    sitemapXml = resp.text || '';
  } catch (e) {
    console.warn(`  Telluride.com sitemap fetch error: ${e.message}`);
    return null;
  }

  // Extract /event/SLUG URLs (not /events/, /festivals-events/ etc.)
  const slugRe = /https?:\/\/www\.telluride\.com\/event\/([^/<">\s]+)/gi;
  const urlSet = new Set();
  let m;
  while ((m = slugRe.exec(sitemapXml)) !== null) {
    urlSet.add('https://www.telluride.com/event/' + m[1]);
  }
  const urls = Array.from(urlSet);
  console.log(`  Telluride.com: ${urls.length} event URLs in sitemap`);

  const now = Date.now();
  const fromMs = now - 86400000;
  const toMs   = now + 60 * 86400000;

  const events = [];
  let fetched = 0;

  for (const url of urls) {
    let html;
    try {
      const resp = await fetch(url);
      if (!resp || resp.status !== 200) continue;
      html = resp.text || '';
      fetched++;
    } catch (e) {
      continue;
    }
    await new Promise(r => setTimeout(r, 250));

    // Metadata
    const ogTitle = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || [])[1]
                 || (html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i) || [])[1]
                 || '';
    const ogDesc  = (html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) || [])[1]
                 || (html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i) || [])[1]
                 || '';
    const ogImage = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1]
                 || (html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i) || [])[1]
                 || '';

    if (!ogTitle) continue;
    const title       = decodeHtmlEntities(ogTitle).trim();
    const description = smartTruncate(decodeHtmlEntities(ogDesc).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), EVENT_DESC_MAX);

    // Strategy 1: JSON-LD Event schema
    const ldBlocks = [];
    const ldRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldRe.exec(html)) !== null) ldBlocks.push(ldMatch[1]);

    let handled = false;
    for (const block of ldBlocks) {
      let ld;
      try { ld = JSON.parse(block); } catch (_) { continue; }
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (!item || item['@type'] !== 'Event') continue;
        const start = item.startDate ? new Date(item.startDate) : null;
        const end   = item.endDate   ? new Date(item.endDate)   : null;
        if (!start || isNaN(start.getTime())) continue;
        const location = (item.location && (item.location.name || item.location.address)) || 'Telluride, CO';
        // Multi-day festivals get ONE entry on the start day. The renderer
        // (js/gov-helpers.js — see ev.endDate handling) shows a date range like
        // "May 1 — May 3" when endDate is present, so the user still sees
        // the full span without the event card duplicating every day.
        start.setHours(12, 0, 0, 0);
        const ms = start.getTime();
        if (ms >= fromMs && ms <= toMs) {
          const ev = {
            title, link: url, description,
            pubDate: start.toISOString(),
            source: 'telluride-com', sourceLabel: 'Telluride.com',
            category: 'Community Event',
            location, imageUrl: ogImage
          };
          if (end && !isNaN(end.getTime()) && end > start) {
            ev.endDate = end.toISOString();
          }
          events.push(ev);
        }
        handled = true;
        break;
      }
      if (handled) break;
    }
    if (handled) continue;

    // Strategy 2: HTML <li> date list (recurring events e.g. Farmers Market)
    // Look for a "Dates" heading followed by <ul>/<li> items
    const datesSection = html.match(/(?:Dates?|Schedule)<\/[^>]+>([\s\S]{0,3000}?)(?:<h[123456]|<\/section)/i);
    if (!datesSection) continue;
    const listItems = datesSection[1].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    for (const li of listItems) {
      const rawDate = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) continue;
      d.setHours(12, 0, 0, 0);
      const ms = d.getTime();
      if (ms < fromMs || ms > toMs) continue;
      events.push({
        title, link: url, description,
        pubDate: d.toISOString(),
        source: 'telluride-com', sourceLabel: 'Telluride.com',
        category: 'Community Event',
        location: 'Telluride, CO', imageUrl: ogImage
      });
    }
  }

  events.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
  console.log(`  Telluride.com: ${events.length} event occurrences from ${fetched} pages`);
  return events;
}

// ── Task 20: Ridgway Town Council Agenda Scraper ──
// ══════════════════════════════════════════════════════════════
//
// Fetches the Ridgway Town Council meetings page and extracts a map of
// meeting date → agenda PDF URL.  The page is a plain Drupal CMS table:
//
//   <tr>
//     <td><strong>May 13, 2026</strong></td>
//     <td>[minutes link or empty]</td>
//     <td><a href="/sites/.../Town-Council-Regular-Meeting-Packet.pdf">Agenda &amp; Packet</a></td>
//   </tr>
//
// The returned object is written into RIDGWAY_AGENDA_MAP in gov-helpers.js so
// client-side rendering can show a dark-green "Agenda Posted →" button that
// links directly to the PDF.
//
// Fetch strategy: try direct first (Ridgway's Colorado state CMS host is
// usually reachable from GitHub Actions IPs).  If blocked, fall back to the
// CF Worker proxy (requires townofridgway.colorado.gov in ALLOWED_HOSTS —
// already added to the worker source; redeploy if needed).
//
async function syncRidgwayAgendas() {
  const PAGE_URL = 'https://townofridgway.colorado.gov/i-want-to/ridgway-town-council';
  const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

  console.log('\n🏔  Task 20: Scraping Ridgway Town Council agendas...');

  let html = null;
  // Try direct fetch first
  try {
    const resp = await fetch(PAGE_URL, {
      headers: { 'User-Agent': SAFARI_UA, 'Accept': 'text/html,*/*' }
    });
    if (resp.status === 200) {
      html = resp.text;
      console.log('  Ridgway agenda page: direct fetch 200');
    } else {
      console.warn(`  Ridgway agenda page: direct fetch HTTP ${resp.status}, trying proxy`);
    }
  } catch (e) {
    console.warn(`  Ridgway agenda page: direct fetch error (${e.message}), trying proxy`);
  }

  // Fallback: CF Worker proxy
  if (!html) {
    try {
      const proxyUrl = maybeProxy(PAGE_URL);
      if (proxyUrl === PAGE_URL) {
        console.warn('  No proxy configured — skipping Ridgway agenda scrape');
        return null;
      }
      const resp2 = await fetch(proxyUrl);
      if (resp2.status === 200) {
        html = resp2.text;
        console.log('  Ridgway agenda page: proxy fetch 200');
      } else {
        console.warn(`  Ridgway agenda page: proxy fetch HTTP ${resp2.status}`);
        return null;
      }
    } catch (e2) {
      console.warn(`  Ridgway agenda page: proxy fetch error (${e2.message})`);
      return null;
    }
  }

  // Parse the agenda table.
  // Row pattern: <td><strong>MONTH DD, YYYY</strong></td> ... <td>...<a href="URL">...</a>...</td>
  // We extract each <tr> block and look for a date + an agenda PDF link.
  const agendaMap = {};
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // Match each <tr>…</tr> block
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];

    // Extract date from <strong>Month D, YYYY</strong>
    const dateRe = /<strong[^>]*>\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4})\s*<\/strong>/i;
    const dateMatch = dateRe.exec(row);
    if (!dateMatch) continue;

    // Normalise date: "May 13, 2026" — ensure comma
    let rawDate = dateMatch[1].trim().replace(/\s+/g, ' ');
    if (!rawDate.includes(',')) rawDate = rawDate.replace(/(\d{4})$/, ', $1');
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) continue;
    const dateKey = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    // Extract agenda PDF link — prefer links whose text contains "Agenda"
    const linkRe = /<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let linkMatch;
    let agendaUrl = null;
    while ((linkMatch = linkRe.exec(row)) !== null) {
      const href = linkMatch[1];
      const text = linkMatch[2];
      if (/agenda/i.test(text) || /agenda/i.test(href)) {
        agendaUrl = href.startsWith('http') ? href : `https://townofridgway.colorado.gov${href}`;
        break;
      }
      // Accept any PDF as fallback if no "Agenda" label found
      if (!agendaUrl) {
        agendaUrl = href.startsWith('http') ? href : `https://townofridgway.colorado.gov${href}`;
      }
    }
    if (agendaUrl) {
      agendaMap[dateKey] = agendaUrl;
    }
  }

  const count = Object.keys(agendaMap).length;
  if (count === 0) {
    console.warn('  No Ridgway agendas found in page — check HTML structure');
    return null;
  }
  console.log(`  Found ${count} Ridgway agenda link(s):`, Object.keys(agendaMap).join(', '));
  return agendaMap;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Telluride Gov Hub — Content Refresh');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════');

  // Pre-flight: the Cloudflare Worker proxy is required for the
  // IP-blocked feeds (Telluride Times, KOTO). If it's broken, fail
  // loud at the top — better than silently producing an empty refresh
  // and only noticing days later when the news section goes stale.
  // The failure-tracker step in content-refresh.yml will turn this into
  // a tracked GitHub Issue automatically.
  await checkWorkerHealth();

  let govHubSrc = readJsFile(GOV_HELPERS_JS);
  let govDataSrc = readJsFile(GOV_DATA_JS);
  let pulseSrc = readJsFile(COMMUNITY_PULSE_JS);
  let changed = false;
  let govDataChanged = false;

  // ── 0. Per-source agenda URL detection (MV / Fire / Med) ──
  // Patches CACHED_DATA entries in gov-data.js with newly-published agenda
  // PDF URLs. Runs BEFORE summary generation so any agenda detected this
  // run can be summarized in the same run.
  for (const [arrName, syncFn] of [
    ['MV_CACHED_DATA',   syncMVAgendas],
    ['FIRE_CACHED_DATA', syncFireAgendas],
    ['MED_CACHED_DATA',  syncMedAgendas]
  ]) {
    try {
      const agendaMap = await syncFn();
      if (agendaMap && Object.keys(agendaMap).length > 0) {
        const { src, changed: n } = patchAgendaUrls(govDataSrc, arrName, agendaMap);
        if (n > 0) {
          govDataSrc = src;
          govDataChanged = true;
          console.log(`  ${arrName}: patched ${n} agendaUrl field(s)`);
        }
      }
    } catch (e) {
      console.warn(`  ${arrName} agenda sync error: ${e.message}`);
    }
  }

  // ── 1. Meeting Summaries ──
  const existingSummaries = extractJsObject(govHubSrc, 'MANUAL_SUMMARIES') || {};
  const newSummaries = await refreshSummaries(existingSummaries);
  if (JSON.stringify(newSummaries) !== JSON.stringify(existingSummaries)) {
    govHubSrc = replaceJsValue(govHubSrc, 'MANUAL_SUMMARIES', newSummaries, true);
    govHubSrc = replaceConstString(govHubSrc, 'MANUAL_SUMMARIES_CACHE_DATE', today());
    changed = true;
  }

  // ── 1b. Meeting Previews (from legal notices + agendas) ──
  const existingPreviews = extractJsObject(govHubSrc, 'MEETING_PREVIEWS') || {};
  const newPreviews = await refreshMeetingPreviews(existingPreviews, govHubSrc);
  if (JSON.stringify(newPreviews) !== JSON.stringify(existingPreviews)) {
    govHubSrc = replaceJsValue(govHubSrc, 'MEETING_PREVIEWS', newPreviews, true);
    changed = true;
  }

  // ── 2. News ──
  const existingTtArticles = extractJsArray(govHubSrc, 'TELLURIDE_TIMES_ARTICLES') || [];
  const { ttArticles, kotoNewscasts, kotoFeatured } = await refreshNews(existingTtArticles);
  if (ttArticles.length > 0) {
    govHubSrc = replaceJsValue(govHubSrc, 'TELLURIDE_TIMES_ARTICLES', ttArticles, false);
    changed = true;
  }
  if (kotoNewscasts.length > 0) {
    govHubSrc = replaceJsValue(govHubSrc, 'KOTO_NEWSCASTS', kotoNewscasts, false);
    changed = true;
  }
  if (kotoFeatured.length > 0) {
    govHubSrc = replaceJsValue(govHubSrc, 'KOTO_FEATURED_STORIES', kotoFeatured, false);
    changed = true;
  }


  // ── 2b. Regional News ──
  const existingRegional = extractJsArray(govHubSrc, 'REGIONAL_NEWS_ARTICLES') || [];
  const freshRegional = await refreshRegionalNews(existingRegional);
  if (freshRegional.length > 0) {
    govHubSrc = replaceJsValue(govHubSrc, 'REGIONAL_NEWS_ARTICLES', freshRegional, false);
    changed = true;
  }

  // ── 2c. SMC AlertCenter ──
  const existingSmcAlerts = extractJsArray(govHubSrc, 'SMC_ALERTS') || [];
  const freshSmcAlerts = await refreshSmcAlerts(existingSmcAlerts);
  if (JSON.stringify(freshSmcAlerts) !== JSON.stringify(existingSmcAlerts)) {
    govHubSrc = replaceJsValue(govHubSrc, 'SMC_ALERTS', freshSmcAlerts, false);
    changed = true;
  }

  // ── 2d. Engage Telluride project meeting key dates (daily) ──
  const existingEngageMeetings = extractJsArray(govHubSrc, 'ENGAGE_MEETINGS') || [];
  const freshEngageMeetings = await refreshEngageMeetings(existingEngageMeetings);
  if (JSON.stringify(freshEngageMeetings) !== JSON.stringify(existingEngageMeetings)) {
    govHubSrc = replaceJsValue(govHubSrc, 'ENGAGE_MEETINGS', freshEngageMeetings, false);
    changed = true;
  }

  // ── 3. Community Pulse ──
  const existingPosts = extractJsArray(pulseSrc, 'COMMUNITY_PULSE_POSTS') || [];
  const freshPosts = await refreshCommunityPulse(existingPosts);
  if (freshPosts.length !== existingPosts.length) {
    pulseSrc = replaceJsValue(pulseSrc, 'COMMUNITY_PULSE_POSTS', freshPosts, false);
    pulseSrc = replaceConstString(pulseSrc, 'COMMUNITY_PULSE_CACHE_DATE', today());
    changed = true;
  }

  // ── 4. Legal Notices ──
  const existingNotices = extractJsArray(govHubSrc, 'LEGAL_NOTICES') || [];
  const freshNotices = await refreshLegalNotices(existingNotices);
  if (freshNotices.length !== existingNotices.length) {
    govHubSrc = replaceJsValue(govHubSrc, 'LEGAL_NOTICES', freshNotices, false);
    govHubSrc = replaceConstString(govHubSrc, 'LEGAL_NOTICES_CACHE_DATE', today());
    changed = true;
  }

  // ── 5. Email Events ──
  const events = await syncEmailEvents();
  // Write whenever syncEmailEvents() returned successfully — including the
  // empty-array case. If we only wrote on length > 0, marking every row as
  // 'skipped' would leave a stale event lingering on the live site forever.
  if (events !== null && events !== undefined) {
    const eventsJson = path.join(REPO_ROOT, 'community-events.json');
    const newJson = JSON.stringify(events, null, 2);
    let prev = '';
    try { prev = fs.readFileSync(eventsJson, 'utf8'); } catch (_) {}
    if (prev !== newJson) {
      fs.writeFileSync(eventsJson, newJson);
      changed = true;
      console.log(`  Wrote ${events.length} events to community-events.json`);
    } else {
      console.log(`  community-events.json unchanged (${events.length} events)`);
    }
  }

  // ── 6. Mailchimp Blog Sync ──
  const existingBlogPosts = extractJsArray(govHubSrc, 'BLOG_POSTS') || [];
  const updatedBlogPosts = await syncMailchimpBlog(existingBlogPosts);
  if (updatedBlogPosts && updatedBlogPosts.length !== existingBlogPosts.length) {
    govHubSrc = replaceJsValue(govHubSrc, 'BLOG_POSTS', updatedBlogPosts, false);
    changed = true;
  }

  // ── 7. Telluride Humane Society Adoptable Animals ──
  const newAnimals = await syncHumaneSocietyAnimals();
  if (newAnimals !== null && newAnimals !== undefined) {
    const existingAnimals = extractJsArray(govHubSrc, 'HUMANE_SOCIETY_ANIMALS') || [];
    if (JSON.stringify(newAnimals) !== JSON.stringify(existingAnimals)) {
      govHubSrc = replaceJsValue(govHubSrc, 'HUMANE_SOCIETY_ANIMALS', newAnimals, false);
      changed = true;
      console.log(`  HUMANE_SOCIETY_ANIMALS updated (was ${existingAnimals.length}, now ${newAnimals.length})`);
    }
  }

  // ── 8. KOTO Community Calendar ──
  const newKotoEvents = await syncKotoCommunityEvents();
  if (newKotoEvents !== null && newKotoEvents !== undefined) {
    const existingKotoEvents = extractJsArray(govHubSrc, 'KOTO_COMMUNITY_EVENTS') || [];
    if (JSON.stringify(newKotoEvents) !== JSON.stringify(existingKotoEvents)) {
      govHubSrc = replaceJsValue(govHubSrc, 'KOTO_COMMUNITY_EVENTS', newKotoEvents, false);
      changed = true;
      console.log(`  KOTO_COMMUNITY_EVENTS updated (was ${existingKotoEvents.length}, now ${newKotoEvents.length})`);
    }
  }

  // ── 9. Wilkinson Library Events ──
  const newWilkinsonEvents = await syncWilkinsonEvents();
  if (newWilkinsonEvents !== null && newWilkinsonEvents !== undefined) {
    const existingWilk = extractJsArray(govHubSrc, 'WILKINSON_EVENTS') || [];
    if (JSON.stringify(newWilkinsonEvents) !== JSON.stringify(existingWilk)) {
      govHubSrc = replaceJsValue(govHubSrc, 'WILKINSON_EVENTS', newWilkinsonEvents, false);
      changed = true;
      console.log(`  WILKINSON_EVENTS updated (was ${existingWilk.length}, now ${newWilkinsonEvents.length})`);
    }
  }

  // ── 10. Telluride Foundation Events ──
  const newTfEvents = await syncTelluridFoundationEvents();
  if (newTfEvents !== null && newTfEvents !== undefined) {
    const existingTf = extractJsArray(govHubSrc, 'TF_FOUNDATION_EVENTS') || [];
    if (JSON.stringify(newTfEvents) !== JSON.stringify(existingTf)) {
      govHubSrc = replaceJsValue(govHubSrc, 'TF_FOUNDATION_EVENTS', newTfEvents, false);
      changed = true;
      console.log(`  TF_FOUNDATION_EVENTS updated (was ${existingTf.length}, now ${newTfEvents.length})`);
    }
  }


  // ── 11. Nucla-Naturita Events ──
  const newNuclaEvents = await syncNuclaNaturitaEvents();
  if (newNuclaEvents !== undefined && newNuclaEvents !== null) {
    const existingNucla = extractJsArray(govHubSrc, 'NUCLA_NATURITA_EVENTS') || [];
    if (JSON.stringify(newNuclaEvents) !== JSON.stringify(existingNucla)) {
      govHubSrc = replaceJsValue(govHubSrc, 'NUCLA_NATURITA_EVENTS', newNuclaEvents, false);
      changed = true;
      console.log(`  NUCLA_NATURITA_EVENTS updated (was ${existingNucla.length}, now ${newNuclaEvents.length})`);
    }
  }

  // ── 12. Club Red Shows ──
  const newClubRedShows = await syncClubRedShows();
  if (newClubRedShows !== undefined && newClubRedShows !== null) {
    const existingClubRed = extractJsArray(govHubSrc, 'CLUB_RED_SHOWS') || [];
    if (JSON.stringify(newClubRedShows) !== JSON.stringify(existingClubRed)) {
      govHubSrc = replaceJsValue(govHubSrc, 'CLUB_RED_SHOWS', newClubRedShows, false);
      changed = true;
      console.log(`  CLUB_RED_SHOWS updated (was ${existingClubRed.length}, now ${newClubRedShows.length})`);
    }
  }

  // ── 13. Fresh Food Hub Events ──
  const newFfhEvents = await syncFreshFoodHubEvents();
  if (newFfhEvents !== undefined && newFfhEvents !== null) {
    const existingFfh = extractJsArray(govHubSrc, 'FRESH_FOOD_HUB_EVENTS') || [];
    if (JSON.stringify(newFfhEvents) !== JSON.stringify(existingFfh)) {
      govHubSrc = replaceJsValue(govHubSrc, 'FRESH_FOOD_HUB_EVENTS', newFfhEvents, false);
      changed = true;
      console.log(`  FRESH_FOOD_HUB_EVENTS updated (was ${existingFfh.length}, now ${newFfhEvents.length})`);
    }
  }


  // ── 15. Ouray County Events (iCal feed, non-governmental only) ──
  const newOurayCountyEvents = await syncOurayCountyEvents();
  if (newOurayCountyEvents !== undefined && newOurayCountyEvents !== null) {
    const existingOC = extractJsArray(govHubSrc, 'OURAY_COUNTY_EVENTS') || [];
    if (JSON.stringify(newOurayCountyEvents) !== JSON.stringify(existingOC)) {
      govHubSrc = replaceJsValue(govHubSrc, 'OURAY_COUNTY_EVENTS', newOurayCountyEvents, false);
      changed = true;
      console.log(`  OURAY_COUNTY_EVENTS updated (was ${existingOC.length}, now ${newOurayCountyEvents.length})`);
    }
  }

  // ── 16. Ouray/Ridgway Events (Localist JSON API) ──
  const newOurayRidgwayEvents = await syncOurayRidgwayEvents();
  if (newOurayRidgwayEvents !== undefined && newOurayRidgwayEvents !== null) {
    const existingOR = extractJsArray(govHubSrc, 'OURAY_RIDGWAY_EVENTS') || [];
    if (JSON.stringify(newOurayRidgwayEvents) !== JSON.stringify(existingOR)) {
      govHubSrc = replaceJsValue(govHubSrc, 'OURAY_RIDGWAY_EVENTS', newOurayRidgwayEvents, false);
      changed = true;
      console.log(`  OURAY_RIDGWAY_EVENTS updated (was ${existingOR.length}, now ${newOurayRidgwayEvents.length})`);
    }
  }


  // ── 17. Norwood Town Events / Notices (sitemap) ──
  const newNorwoodEvts = await syncNorwoodEvents();
  if (newNorwoodEvts !== undefined && newNorwoodEvts !== null) {
    const existingNE = extractJsArray(govHubSrc, 'NORWOOD_EVENTS') || [];
    if (JSON.stringify(newNorwoodEvts) !== JSON.stringify(existingNE)) {
      govHubSrc = replaceJsValue(govHubSrc, 'NORWOOD_EVENTS', newNorwoodEvts, false);
      changed = true;
      console.log(`  NORWOOD_EVENTS updated (was ${existingNE.length}, now ${newNorwoodEvts.length})`);
    }
  }

  // ── 18. Mountain Village Events (sitemap + page scrape) ──
  const newMVEvents = await syncMountainVillageEvents();
  if (newMVEvents !== undefined && newMVEvents !== null) {
    const existingMV = extractJsArray(govHubSrc, 'MOUNTAIN_VILLAGE_EVENTS') || [];
    if (JSON.stringify(newMVEvents) !== JSON.stringify(existingMV)) {
      govHubSrc = replaceJsValue(govHubSrc, 'MOUNTAIN_VILLAGE_EVENTS', newMVEvents, false);
      changed = true;
      console.log(`  MOUNTAIN_VILLAGE_EVENTS updated (was ${existingMV.length}, now ${newMVEvents.length})`);
    }
  }

  // ── 19. Telluride.com Events (sitemap + JSON-LD / date list) ──
  const newTelluridComEvents = await syncTelluridComEvents();
  if (newTelluridComEvents !== undefined && newTelluridComEvents !== null) {
    const existingTC = extractJsArray(govHubSrc, 'TELLURIDE_COM_EVENTS') || [];
    if (JSON.stringify(newTelluridComEvents) !== JSON.stringify(existingTC)) {
      govHubSrc = replaceJsValue(govHubSrc, 'TELLURIDE_COM_EVENTS', newTelluridComEvents, false);
      changed = true;
      console.log(`  TELLURIDE_COM_EVENTS updated (was ${existingTC.length}, now ${newTelluridComEvents.length})`);
    }
  }

  // ── 14. Sherbino Theater Events ──
  const newSherbinoEvents = await syncSherbinoEvents();

  // ── Ouray County meetings ──
  const newOurayData = await syncOurayMeetings();
  if (newOurayData !== null) {
    const existingOuray = extractJsArray(govHubSrc, 'OURAY_CACHED_DATA') || [];
    if (JSON.stringify(newOurayData) !== JSON.stringify(existingOuray)) {
      govHubSrc = replaceJsValue(govHubSrc, 'OURAY_CACHED_DATA', newOurayData, false);
      govHubSrc = replaceConstString(govHubSrc, 'OURAY_CACHE_DATE', today());
      changed = true;
    }
  }

  // ── Norwood meetings ──
  const newNorwoodData = await syncNorwoodMeetings();
  if (newNorwoodData !== null) {
    const existingNorwood = extractJsArray(govHubSrc, 'NORWOOD_CACHED_DATA') || [];
    if (JSON.stringify(newNorwoodData) !== JSON.stringify(existingNorwood)) {
      govHubSrc = replaceJsValue(govHubSrc, 'NORWOOD_CACHED_DATA', newNorwoodData, false);
      govHubSrc = replaceConstString(govHubSrc, 'NORWOOD_CACHE_DATE', today());
      changed = true;
    }
  }

  if (newSherbinoEvents !== undefined && newSherbinoEvents !== null) {
    const existingSherbino = extractJsArray(govHubSrc, 'SHERBINO_EVENTS') || [];
    if (JSON.stringify(newSherbinoEvents) !== JSON.stringify(existingSherbino)) {
      govHubSrc = replaceJsValue(govHubSrc, 'SHERBINO_EVENTS', newSherbinoEvents, false);
      changed = true;
      console.log(`  SHERBINO_EVENTS updated (was ${existingSherbino.length}, now ${newSherbinoEvents.length})`);
    }
  }

  // ── Task 20: Ridgway agenda map ──
  const newRidgwayAgendas = await syncRidgwayAgendas();
  if (newRidgwayAgendas !== null) {
    // extractJsObject helper for plain objects (uses the same bracket-matching
    // logic as extractJsArray but with '{' as the bracket character).
    const rawObj = (() => {
      const startRe = /const\s+RIDGWAY_AGENDA_MAP\s*=\s*\{/;
      const m = startRe.exec(govHubSrc);
      if (!m) return {};
      let depth = 0, start = m.index + m[0].length - 1;
      for (let i = start; i < govHubSrc.length; i++) {
        if (govHubSrc[i] === '{') depth++;
        else if (govHubSrc[i] === '}') { depth--; if (depth === 0) {
          try { return JSON.parse(govHubSrc.slice(start, i + 1)); } catch { return {}; }
        }}
      }
      return {};
    })();
    if (JSON.stringify(newRidgwayAgendas) !== JSON.stringify(rawObj)) {
      govHubSrc = replaceJsValue(govHubSrc, 'RIDGWAY_AGENDA_MAP', newRidgwayAgendas, true);
      changed = true;
      console.log(`  RIDGWAY_AGENDA_MAP updated: ${Object.keys(newRidgwayAgendas).length} entries`);
    }
  }

  // ── Write files ──
  if (changed) {
    fs.writeFileSync(GOV_HELPERS_JS, govHubSrc);
    fs.writeFileSync(COMMUNITY_PULSE_JS, pulseSrc);
    console.log('\n✅ Files updated — changes will be committed by the workflow.');
  } else {
    console.log('\n✓ No gov-helpers / pulse changes — nothing to commit.');
  }
  if (govDataChanged) {
    fs.writeFileSync(GOV_DATA_JS, govDataSrc);
    console.log('✅ gov-data.js updated with newly-detected agenda URLs.');
    changed = true;
  }

  // ── Note: the old "regenerate data-only.js from gov-helpers.js" step has been
  // retired (2026-05-18). Everything that used to live in gov-helpers.js + be
  // mirrored to data-only.js is now in gov-helpers.js as the ONE source of
  // truth. Bots (this script, maintenance.js, build-rss-feed.js,
  // housing-refresh.js, deep-dive-refresh.js) read/write gov-helpers.js
  // directly. All HTML pages load gov-helpers.js. No extraction step. ──

  // (Cache-buster auto-bumping removed during the 2026-05-15 merge with
  // main — main's audit established a dynamic per-request approach in HTML
  // using `Math.floor(Date.now()/600000)`, which makes a server-side bump
  // unnecessary.)

  // The workflow's "Check for changes" step uses `git diff` to decide
  // whether to commit, so we don't need to signal change-vs-no-change via
  // exit code. Exit 0 on any normal completion — exit 1 (from the catch
  // below) is reserved for fatal errors and will fail the workflow visibly.
  await closeCivicClerkBrowserIfOpen();
  process.exit(0);
}

// Best-effort cleanup of the Playwright Chromium process if extractAgendaText
// launched one during the run. process.exit() would kill it anyway but
// explicit close avoids dangling-handle warnings in the workflow logs.
async function closeCivicClerkBrowserIfOpen() {
  try {
    const mod = require('./civicclerk-pdf');
    if (mod && typeof mod.closeBrowser === 'function') {
      await mod.closeBrowser();
    }
  } catch {
    // Module not installed (running on a host without scripts/node_modules,
    // or before `npm install`) — nothing to close.
  }
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeCivicClerkBrowserIfOpen();
  process.exit(1);
});
