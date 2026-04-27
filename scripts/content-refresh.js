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
  { url: 'https://telluride-co.gov/RSSFeed.aspx?ModID=1&CID=Town-News-1', source: 'Town of Telluride', category: 'Town News' },
  { url: 'https://telluride-co.gov/RSSFeed.aspx?ModID=1&CID=Marshals-Department-12', source: 'Town of Telluride', category: "Marshal's Dept" },
  { url: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml', source: 'San Miguel County', category: 'News' },
  { url: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=63&CID=All-0', source: 'San Miguel County', category: 'Alert' },
  { url: 'https://telluride-co.gov/RSSFeed.aspx?ModID=63&CID=All-0', source: 'Town of Telluride', category: 'Alert' }
];

// ── Telluride Times scrape config ──
const TELLURIDE_TIMES_RSS = 'https://www.telluridenews.com/search/?f=rss&t=article&c=news,news/*&l=25&s=start_time&sd=desc';
const KOTO_RSS = 'https://koto.org/feed/';

// ══════════════════════════════════════════════════════════════
// ── HTTP Helpers ──
// ══════════════════════════════════════════════════════════════

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'TellurideGovHub/2.0 (github-actions-bot)', ...opts.headers },
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

async function refreshNews() {
  console.log('\n📰 Task 2: Refreshing news articles...');
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

  // Telluride Times RSS
  try {
    const resp = await fetch(TELLURIDE_TIMES_RSS);
    if (resp.status === 200) {
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);
      for (const item of arr) {
        const pubDate = new Date(item.pubDate || '');
        if (pubDate < cutoff) continue;
        const enclosure = item.enclosure;
        articles.push({
          title: (item.title || '').trim(),
          source: 'Telluride Times',
          date: formatDate(pubDate),
          newsTopic: classifyNewsTopic(item.title || '', item.description || ''),
          copy: (item.description || '').replace(/<[^>]+>/g, '').trim().slice(0, 300),
          href: (item.link || '').trim(),
          img: enclosure?.$.url || ''
        });
      }
    }
  } catch (e) { console.warn(`  Telluride Times RSS error: ${e.message}`); }

  // KOTO RSS
  const kotoNewscasts = [];
  const kotoFeatured = [];
  try {
    const resp = await fetch(KOTO_RSS);
    if (resp.status === 200) {
      const xml = await parseXml(resp.text);
      const items = xml?.rss?.channel?.item;
      const arr = Array.isArray(items) ? items : (items ? [items] : []);
      for (const item of arr) {
        const pubDate = new Date(item.pubDate || '');
        if (pubDate < cutoff) continue;
        const title = (item.title || '').trim();
        const entry = {
          title,
          source: 'KOTO Community Radio',
          date: formatDate(pubDate),
          newsTopic: classifyNewsTopic(title, item.description || ''),
          href: (item.link || '').trim()
        };
        if (/newscast/i.test(title)) {
          kotoNewscasts.push(entry);
        } else {
          kotoFeatured.push(entry);
        }
      }
    }
  } catch (e) { console.warn(`  KOTO RSS error: ${e.message}`); }

  // Deduplicate by href
  const seen = new Set();
  const dedup = arr => arr.filter(a => {
    if (!a.href || seen.has(a.href)) return false;
    seen.add(a.href);
    return true;
  });

  const ttArticles = dedup(articles.filter(a => a.source === 'Telluride Times'));
  const govArticles = dedup(articles.filter(a => a.source !== 'Telluride Times'));

  console.log(`  Found: ${ttArticles.length} Telluride Times, ${govArticles.length} gov news, ${kotoNewscasts.length} KOTO newscasts, ${kotoFeatured.length} KOTO stories`);
  return { ttArticles: [...ttArticles, ...govArticles], kotoNewscasts: dedup(kotoNewscasts), kotoFeatured: dedup(kotoFeatured) };
}

// ══════════════════════════════════════════════════════════════
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
// ── Task 4: Legal Notices ──
// ══════════════════════════════════════════════════════════════

async function refreshLegalNotices(existingNotices) {
  console.log('\n⚖️ Task 4: Checking legal notices...');
  // Remove expired notices
  const now = today();
  const kept = existingNotices.filter(n => {
    if (n.expires && n.expires < now) {
      console.log(`  Expired: ${n.title}`);
      return false;
    }
    return true;
  });
  console.log(`  ${kept.length} active notices (removed ${existingNotices.length - kept.length} expired)`);
  return kept;
}

// ══════════════════════════════════════════════════════════════
// ── Task 5: Email Events Sync ──
// ══════════════════════════════════════════════════════════════

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
    // Parse CSV rows
    const lines = resp.text.trim().split('\n');
    if (lines.length <= 1) { console.log('  No events in sheet'); return []; }
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const events = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, idx) => row[h] = vals[idx] || '');
      if (row.Title || row.title || row.Event) {
        events.push({
          title: row.Title || row.title || row.Event || '',
          date: row.Date || row.date || '',
          time: row.Time || row.time || '',
          location: row.Location || row.location || '',
          description: row.Description || row.description || '',
          source: 'Community Submitted',
          href: row.URL || row.url || row.Link || ''
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
  const { ttArticles, kotoNewscasts, kotoFeatured } = await refreshNews();
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
  if (events && events.length > 0) {
    const eventsJson = path.join(REPO_ROOT, 'community-events.json');
    fs.writeFileSync(eventsJson, JSON.stringify(events, null, 2));
    changed = true;
    console.log(`  Wrote ${events.length} events to community-events.json`);
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
