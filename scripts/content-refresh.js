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
const GOV_HUB_JS = path.join(REPO_ROOT, 'js', 'gov-hub.js');
const COMMUNITY_PULSE_JS = path.join(REPO_ROOT, 'js', 'community-pulse.js');
const EVENTS_CONFIG = path.join(REPO_ROOT, 'email-events-config.json');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const MAX_AGENDA_TEXT = 15000;
const NEWS_MAX_AGE_DAYS = 14;

// ── Agenda Sources ──
const AGENDA_SOURCES = {
  telluride: {
    label: 'Town of Telluride',
    meetingsApi: 'https://telluride-co.civicweb.net/Services/MeetingsService.svc/meetings',
    detailBase: 'https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=',
    type: 'civicweb'
  },
  county: {
    label: 'San Miguel County',
    portalBase: 'https://sanmiguelcoco.portal.civicclerk.com',
    calendarUrl: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=58',
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
const TELLURIDE_TIMES_RSS = 'https://www.telluridenews.com/search/?f=rss&t=article&c=news,news/*,business,business/*,sports,sports/*,opinion,opinion/*,obituaries,norwood_post,norwood_post/*,the_norwood_post,the_norwood_post/*,arts_and_entertainment,arts_and_entertainment/*&l=50&s=start_time&sd=desc';
// KOTO uses two category-specific feeds; the catch-all /feed/ misses some posts.
const KOTO_NEWSCASTS_RSS = 'https://koto.org/news-category/newscasts/feed/';
const KOTO_FEATURED_RSS = 'https://koto.org/news-category/featured-stories/feed/';
const COLORADO_SUN_RSS = 'https://coloradosun.com/feed/';
// Keywords that make a Colorado Sun article relevant to the Telluride region
const COLORADO_SUN_KEYWORDS = /telluride|san\s+miguel\s+county|mountain\s+village|ridgway|telski|chuck\s+horning/i;

// ── Regional News Feeds ──
// Sources with working RSS feeds. Articles go into REGIONAL_NEWS_ARTICLES in gov-hub.js.
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
    source: 'San Miguel Basin 4-H',
    sourceKey: '4h-smc',
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
]);

function maybeProxy(url) {
  const proxyBase = process.env.RSS_PROXY_URL;
  if (!proxyBase) return url; // no proxy configured — fall through
  let host;
  try { host = new URL(url).hostname; } catch (_) { return url; }
  if (!PROXY_HOSTS.has(host)) return url;
  return proxyBase.replace(/\/$/, '') + '/proxy?url=' + encodeURIComponent(url);
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

const SUMMARY_SYSTEM_PROMPT = `You are writing meeting summaries for the Telluride, Colorado region Gov Hub (livabletelluride.org). The voice is fixed and consistent across every summary the site generates.

VOICE — long-time local, observational, no advocacy:
You write like a thoughtful neighbor who has lived in the box canyon since the 1970s and has watched all the cycles of growth and change firsthand. You still love the place and the people. You see the recurring tensions — development versus carrying capacity, growth versus the environment, modernization versus the historic character that drew people here — without taking sides. You sound plainspoken, occasionally wry, never preachy or marketing-y.

VOICE RULES:
- Treat the substance straight: every fact, date, number, name in the agenda text is preserved. Voice changes the register, never the facts.
- Use lived-in details sparingly — one or two per summary, never more. Examples: "the box canyon," "since the early 70s," "almost everyone whether they like it or not." Don't overdo them; that becomes performative.
- Wry observational tone is welcome, especially when describing recurring patterns ("we've seen this before," "the same fight in new clothes," "doesn't sound like much until your kid's class size jumps by six"). Use these to land a point, never to mock anyone.
- Plainspoken sentences. Short ones are good. Em-dashes are fine.
- Critical of *processes* and *patterns* only — never of named individuals. Even when a process is broken, the framing is "this is the recurring problem," not "these officials are bad."
- NOT advocacy. The voice never tells the reader what to think, what's right, or what to do. Describe what's happening and why it matters in the local context, then trust the reader.
- Light tension is welcome — a vote will affect views, traffic, taxes, neighbors, class sizes — but don't crusade.
- Comfortable with civic vocabulary (PUD, rezoning, work session, second reading, BOCC, HARC, DRB) — use the terms naturally.

AVOID:
- Generic civic-tutorial phrasing ("This affects property owners, families, teachers...").
- Repetitive "Whether to approve…" sentence openings — fine occasionally, tedious in aggregate.
- Stacked adjectives or marketing energy.
- Editorial verdicts on what officials should do.
- Over-the-top folksiness or affected dialect.
- Any phrasing that resembles a press release.

CONTENT RULES (unchanged from before):
- Only summarize information actually present in the agenda text provided.
- If the agenda text is sparse or missing, say so briefly in the voice. Do NOT invent topics.
- Never hallucinate names, vote counts, or decisions not in the source text.
- Define government jargon inline only when essential — the site has a glossary tooltip layer that handles most terms.
- Keep the short summary to 1-3 sentences in the voice above.
- Provide 3-6 key topic bullets. Each bullet should be a brief phrase or single sentence, still in the voice.
- The "why it matters" section should connect agenda items to key local issues when relevant, written in the voice.

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

// ══════════════════════════════════════════════════════════════
// ── Task 1: Meeting Agenda Summaries ──
// ══════════════════════════════════════════════════════════════

async function fetchUpcomingMeetings() {
  const meetings = [];
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86400000); // 14 days ahead

  // Telluride — CivicWeb API
  try {
    const resp = await fetch(AGENDA_SOURCES.telluride.meetingsApi);
    if (resp.status === 200) {
      const data = JSON.parse(resp.text);
      const items = data.d || data || [];
      for (const m of (Array.isArray(items) ? items : [])) {
        const mDate = new Date(m.Date || m.date || m.MeetingDate);
        if (mDate >= now && mDate <= horizon) {
          meetings.push({
            source: 'telluride',
            date: mDate.toISOString().split('T')[0],
            title: m.Title || m.MeetingName || m.Body || 'Meeting',
            agendaUrl: m.AgendaUrl || (m.Id ? AGENDA_SOURCES.telluride.detailBase + m.Id : '')
          });
        }
      }
    }
  } catch (e) { console.warn('  CivicWeb fetch error:', e.message); }

  // County — RSS calendar
  try {
    const resp = await fetch(AGENDA_SOURCES.county.calendarUrl);
    if (resp.status === 200) {
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);
      for (const item of arr) {
        const mDate = new Date(item.pubDate || item['a10:updated'] || '');
        if (mDate >= now && mDate <= horizon) {
          meetings.push({
            source: 'county',
            date: mDate.toISOString().split('T')[0],
            title: item.title || 'County Meeting',
            agendaUrl: item.link || ''
          });
        }
      }
    }
  } catch (e) { console.warn('  County RSS error:', e.message); }

  return meetings;
}

async function extractAgendaText(url) {
  if (!url) return '';
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
    const agendaText = await extractAgendaText(m.agendaUrl);

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

  // Government RSS feeds
  for (const feed of NEWS_FEEDS) {
    try {
      const resp = await fetch(feed.url);
      if (resp.status !== 200) continue;
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);

      for (const item of arr) {
        const pubDate = new Date(item.pubDate || '');
        if (pubDate < cutoff) continue;
        articles.push({
          title: (item.title || '').trim(),
          source: feed.source,
          date: formatDate(pubDate),
          newsTopic: classifyNewsTopic(item.title || '', item.description || ''),
          copy: (item.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 300),
          href: (item.link || '').trim()
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
          img: enclosure?.$.url || ''
        });
      }
      if (newCount > 0) console.log(`  Summarized ${newCount} new TT article(s) from full text`);
    }
  } catch (e) { console.warn(`  Telluride Times RSS error: ${e.message}`); }

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

  // ── Town of Ridgway — Press Releases (PENDING: enable after May 8 site migration) ──
  // The current site (Drupal/Colorado state CMS) has no RSS feed and blocks automated
  // HTTP access. The new hosting environment goes live ~May 8, 2026.
  // On Monday May 11, run the Ridgway review scheduled task to:
  //   1. Check if the new site has RSS feeds (look for <link rel="alternate"> tags)
  //   2. If yes: add the feed URL below and uncomment the live scraper block
  //   3. If no RSS: uncomment the homepage HTML scraper below and add
  //      'townofridgway.colorado.gov' to both PROXY_HOSTS (here) and the
  //      Cloudflare Worker ALLOWED_HOSTS (worker.js)
  //
  // ── Live scraper (uncomment after confirming access) ──
  // const RIDGWAY_HOME = 'https://townofridgway.colorado.gov/';
  // const ridgwayArticles = [];
  // try {
  //   const resp = await fetch(RIDGWAY_HOME);  // add to PROXY_HOSTS if blocked
  //   if (resp.status === 200) {
  //     const html = resp.text;
  //     // Extract press release links — pattern: <a href="...files/documents/...">Title - Date</a>
  //     const linkRe = /<a[^>]+href="([^"]*\/files\/documents\/[^"]+\.pdf)"[^>]*>([^<]+?)<\/a>/gi;
  //     let m;
  //     while ((m = linkRe.exec(html)) !== null) {
  //       const href = m[1].startsWith('http') ? m[1] : `https://townofridgway.colorado.gov${m[1]}`;
  //       const rawText = m[2].replace(/\(opens in new window\)/gi, '').trim();
  //       // Extract date from link text: "Title - May 1, 2026" or "Title - April 14, 2026"
  //       const dateMatch = rawText.match(/[-–]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d+,?\s*\d{4})\s*$/i);
  //       const title = dateMatch ? rawText.slice(0, rawText.lastIndexOf(dateMatch[0])).trim() : rawText;
  //       const dateStr = dateMatch ? dateMatch[1] : '';
  //       const pubDate = dateStr ? new Date(dateStr) : new Date();
  //       if (pubDate < cutoff) continue;
  //       ridgwayArticles.push({
  //         title,
  //         source: 'Town of Ridgway',
  //         date: formatDate(pubDate),
  //         firstSeen: existingByHref.has(href)
  //           ? (existingByHref.get(href).firstSeen || new Date().toISOString().slice(0, 10))
  //           : new Date().toISOString().slice(0, 10),
  //         newsTopic: classifyNewsTopic(title, ''),
  //         copy: `Press release from the Town of Ridgway. Click to view the full PDF.`,
  //         claudeSummary: false,
  //         href,
  //         img: ''
  //       });
  //     }
  //     if (ridgwayArticles.length > 0) console.log(`  Found ${ridgwayArticles.length} Ridgway press release(s)`);
  //   } else {
  //     console.warn(`  Ridgway homepage HTTP ${resp.status}`);
  //   }
  // } catch (e) { console.warn(`  Ridgway scraper error: ${e.message}`); }

  // Deduplicate by href
  const seen = new Set();
  const dedup = arr => arr.filter(a => {
    if (!a.href || seen.has(a.href)) return false;
    seen.add(a.href);
    return true;
  });

  const ttArticles = dedup(articles.filter(a => a.source === 'Telluride Times'));
  const govArticles = dedup(articles.filter(a => a.source !== 'Telluride Times'));

  console.log(`  Found: ${ttArticles.length} Telluride Times, ${govArticles.length} gov news, ${kotoNewscasts.length} KOTO newscasts, ${kotoFeatured.length} KOTO stories, ${csSunArticles.length} Colorado Sun`);
  // When Ridgway is enabled: add ridgwayArticles to the dedup and log count above
  return { ttArticles: [...ttArticles, ...govArticles, ...dedup(csSunArticles)], kotoNewscasts: dedup(kotoNewscasts), kotoFeatured: dedup(kotoFeatured) };
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
          img: enclosure?.$.url || ''
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
// every 6h, filter to events starting in the next 7 days.

const KOTO_TRIBE_API = 'https://koto.org/wp-json/tribe/events/v1/events/?categories=community-calendar&per_page=50';

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
  const horizon = now + 7 * 86400000;
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
    const description = decodeHtmlEntities(
      String(e.description || e.excerpt || '').replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim().slice(0, 350);
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
  console.log(`  Kept ${events.length} events starting within 7 days`);
  return events;
}

// ══════════════════════════════════════════════════════════════
// ── Task 9: Wilkinson Public Library (LibCal) ──
// ══════════════════════════════════════════════════════════════
// telluridelibrary.libcal.com exposes api_events.php with the
// library's main calendar (cid=19928). The endpoint returns HTML
// rather than JSON, so we parse it with regex. Each event's detail
// page has an og:image we fetch for the card photo.

const WILKINSON_API = 'https://telluridelibrary.libcal.com/api_events.php?cid=19928&days=7';

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
    // Description (s-lc-ea-tdesc — sometimes present)
    const descMatch = /<tr class="s-lc-ea-tdesc"[\s\S]*?<td>([\s\S]*?)<\/td>\s*<\/tr>/i.exec(segment);
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
  console.log(`  LibCal returned ${parsed.length} event(s) within 7-day window`);
  const now = Date.now();
  const horizon = now + 7 * 86400000;
  const events = [];
  for (const p of parsed) {
    const t = p.fromDate.getTime();
    if (isNaN(t) || t < now - 86400000) continue;  // skip already-past
    if (t > horizon) continue;                      // skip beyond 7 days
    // Fetch the event detail page for og:image (rate-limited by sequential await)
    const imageUrl = await fetchWilkinsonEventImage(p.link);
    // Build a clean description: location + time + (extracted desc if any)
    const descParts = [];
    if (p.fromStr) descParts.push(p.fromStr.split(/\s+\w+,\s+/)[0] + (p.toStr ? ' – ' + p.toStr.split(/\s+\w+,\s+/)[0] : ''));
    if (p.description) descParts.push(p.description);
    events.push({
      title: decodeHtmlEntities(p.title),
      link: p.link,
      description: decodeHtmlEntities(descParts.join(' · ')).slice(0, 350) || 'Wilkinson Public Library event',
      pubDate: p.fromDate.toISOString(),
      source: 'wilkinson',
      sourceLabel: 'Wilkinson Public Library',
      category: 'Library Event',
      location: decodeHtmlEntities(p.location) || 'Wilkinson Public Library',
      imageUrl,
    });
  }
  events.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
  console.log(`  Kept ${events.length} event(s) within 7 days (with images fetched)`);
  return events;
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
      const copy = afterFirst.replace(location, '').replace(/^[^a-zA-Z]+/, '').slice(0, 300).trim();

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

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Telluride Gov Hub — Content Refresh');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════');

  let govHubSrc = readJsFile(GOV_HUB_JS);
  let pulseSrc = readJsFile(COMMUNITY_PULSE_JS);
  let changed = false;

  // ── 1. Meeting Summaries ──
  const existingSummaries = extractJsObject(govHubSrc, 'MANUAL_SUMMARIES') || {};
  const newSummaries = await refreshSummaries(existingSummaries);
  if (JSON.stringify(newSummaries) !== JSON.stringify(existingSummaries)) {
    govHubSrc = replaceJsValue(govHubSrc, 'MANUAL_SUMMARIES', newSummaries, true);
    govHubSrc = replaceConstString(govHubSrc, 'MANUAL_SUMMARIES_CACHE_DATE', today());
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

  // ── Write files ──
  if (changed) {
    fs.writeFileSync(GOV_HUB_JS, govHubSrc);
    fs.writeFileSync(COMMUNITY_PULSE_JS, pulseSrc);
    console.log('\n✅ Files updated — changes will be committed by the workflow.');
  } else {
    console.log('\n✓ No changes detected — nothing to commit.');
  }

  // Signal to the workflow whether there are changes
  process.exit(changed ? 0 : 78); // 78 = "neutral" in GitHub Actions
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
