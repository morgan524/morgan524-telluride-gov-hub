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
// Sonnet 4.0 (claude-sonnet-4-20250514) was retired by Anthropic on/around
// 2026-06-15, after which every Task 1 / Task 1b Claude call returned an
// error and stale "agenda hasn't been posted yet" placeholders never got
// regenerated. Use the current Sonnet alias so a model retirement doesn't
// silently break summaries again — Anthropic auto-points the alias at the
// latest stable Sonnet release.
const { SONNET, HAIKU } = require('./lib/claude-model.js');
const CLAUDE_MODEL = SONNET;
// HAIKU_MODEL mirrors deep-dive-refresh.js's model so the preflight below also
// covers Haiku (both run in this workflow). Both now resolve from
// lib/claude-model.js — a retirement bump happens once, there.
const HAIKU_MODEL = HAIKU;

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
// NOTE: keep `gallery,gallery/*` in the category list. TT files some real
// news stories (photo-led community coverage) under /gallery/news/ as
// `article` assets; without these categories the search RSS silently drops
// them. Verified 2026-06-26: "Pride bike ride on Sunday" lived at
// /gallery/news/ and never reached the feed. Gallery volume is tiny (~1 item
// per 50) and the local-news.html relevance filters still apply downstream.
const TELLURIDE_TIMES_RSS = 'https://www.telluridenews.com/search/?f=rss&t=article&c=news,news/*,news_release,news_release/*,business,business/*,sports,sports/*,opinion,opinion/*,obituaries,norwood_post,norwood_post/*,the_norwood_post,the_norwood_post/*,arts_and_entertainment,arts_and_entertainment/*,gallery,gallery/*&l=50&s=start_time&sd=desc';
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
  // Direct-PDF agenda hosts. These serve the agenda as a plain .pdf and
  // (like the news origins) can block GH-runner IPs, so route through the
  // Worker. Added 2026-05-28 after Med/Fire/Ophir meetings were missing
  // summaries + Zoom info — their agenda PDFs were fetched direct and
  // never reached / never parsed.
  'tellmed.org',
  'www.tellmed.org',
  'telluridefire.com',
  'www.telluridefire.com',
  'townofophir.colorado.gov',
  'www.townofophir.colorado.gov',
  'townofrico.colorado.gov',
  'www.townofrico.colorado.gov',
  // San Miguel Basin Forum (West End news) — Creative Circle CMS that
  // blocks GH runner IPs the same way Telluride Times does. Note: SMBF
  // has disabled the /search/?f=rss endpoint that TT exposes, so the
  // refresh scrapes the /news/ landing page HTML instead.
  'sanmiguelbasinforum.com',
  'www.sanmiguelbasinforum.com',
  // Sheridan Opera House — WordPress + Modern Events Calendar Lite plugin.
  // Parser scrapes /events/ landing page (3 upcoming events advertised).
  // Direct fetch works as of 2026-05-29; added to the proxy list defensively
  // since the host has nginx + Yoast and could plausibly start filtering
  // GH runner IPs the way TT and KOTO did.
  'sheridanoperahouse.com',
  'www.sheridanoperahouse.com',
  // Alibi Telluride — events are NOT in Squarespace's native calendar
  // (that's dormant, last update October 2023). The live events are
  // served by Event Calendar App (eventcalendarapp.com), embedded
  // via a div with calendar_id=14036 widgetUuid=bd9b821e-... on the
  // /calendar page. Parser hits the API directly.
  'alibitelluride.com',
  'www.alibitelluride.com',
  'api.eventcalendarapp.com',
  // Telluride.com — community calendar that aggregates events from
  // many local venues + groups. The /festivals-events/events/ page
  // ships all events inline as window.fcEventsData (300+ entries
  // with title, start/end dates, image, summary). Parser hits THIS
  // page once and extracts the array — much faster than the old
  // sitemap+per-page approach (which made 300+ HTTP requests).
  'telluride.com',
  'www.telluride.com',
  // Ouray/Ridgway community calendar — Localist API (same platform as the
  // school feeds). Already on the Worker allow-list; added here so
  // syncOurayRidgwayEvents() routes through the proxy and gets protection
  // if the Localist host ever blocks GH-runner IPs.
  'events.ourayridgwayevents.com',
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

// Ping one Anthropic model with a tiny request; throw with a diagnostic
// message if the API rejects the model (the retirement-detection signal)
// or the network is unreachable. Returns elapsed ms on success.
async function pingClaudeModel(model) {
  const body = JSON.stringify({
    model,
    max_tokens: 8,
    messages: [{ role: 'user', content: 'ok' }]
  });
  const t0 = Date.now();
  let json;
  try {
    json = await new Promise((resolve, reject) => {
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
        timeout: 15000
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error(`non-JSON response (HTTP ${res.statusCode}): ${data.slice(0, 200)}`)); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('preflight timed out after 15s')); });
      req.write(body);
      req.end();
    });
  } catch (e) {
    throw new Error(
      `Claude preflight FAILED — could not reach api.anthropic.com while testing "${model}": ${e.message}. ` +
      `Likely an outage or a transient network failure; re-run the workflow in a few minutes.`
    );
  }
  if (json.body && json.body.error) {
    const errType = json.body.error.type || 'error';
    const errMsg = json.body.error.message || JSON.stringify(json.body.error);
    throw new Error(
      `Claude preflight FAILED — model "${model}" rejected by the API ` +
      `(${errType}: ${errMsg}). The model has likely been retired by Anthropic. ` +
      `Update the corresponding constant: CLAUDE_MODEL (Sonnet) lives in scripts/content-refresh.js, ` +
      `scripts/build-rss-feed.js, scripts/extract-votes.mjs, and govhub-summary-backend/functions/index.js; ` +
      `HAIKU_MODEL is also in scripts/content-refresh.js and mirrors CLAUDE_MODEL in ` +
      `scripts/deep-dive-refresh.js. See memory/claude-model-inventory.md for the full checklist. ` +
      `The May 2025 retirement of claude-sonnet-4-20250514 produced 5 days of empty meeting summaries ` +
      `before being caught — this preflight is here to catch the next one within 6 hours.`
    );
  }
  if (json.status !== 200) {
    throw new Error(`Claude preflight FAILED — unexpected HTTP ${json.status} from api.anthropic.com while testing "${model}".`);
  }
  return Date.now() - t0;
}

// Probe the Anthropic API at startup with one tiny request per model the
// workflow uses. When Anthropic retires a model, every downstream Claude
// call returns an error and stale placeholder summaries pile up until
// someone notices. That happened with claude-sonnet-4-20250514 on
// 2026-06-15 20:48 UTC; the retirement was caught 5 days later, by which
// point the weekly email had shipped generic boilerplate for every
// meeting. Failing the run here triggers the if:failure() step in
// content-refresh.yml to open a CI Health issue within 6 hours of the
// next retirement.
//
// Pings BOTH models in the workflow:
//   * CLAUDE_MODEL (Sonnet) — used by Task 1 / 1b in this file and by
//     scripts/build-rss-feed.js's Week-Ahead lede generator.
//   * HAIKU_MODEL — used by scripts/deep-dive-refresh.js, which runs
//     later in the same workflow. Without this ping a Haiku retirement
//     would silently kill the daily deep-dive output.
async function checkClaudeHealth() {
  if (!ANTHROPIC_API_KEY) {
    console.log('  ℹ ANTHROPIC_API_KEY not set — skipping Claude preflight (Task 1 / 1b and deep-dive will be skipped)');
    return;
  }
  console.log(`🤖 Claude preflight: testing ${CLAUDE_MODEL} + ${HAIKU_MODEL}...`);
  const sonnetMs = await pingClaudeModel(CLAUDE_MODEL);
  const haikuMs  = await pingClaudeModel(HAIKU_MODEL);
  console.log(`  ✓ Claude OK (sonnet ${sonnetMs} ms, haiku ${haikuMs} ms)`);
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
      // Collect raw Buffers and decode ONCE as UTF-8 at the end. The old
      // `data += chunk` decoded each chunk separately, so a multi-byte char
      // (e.g. a curly apostrophe = E2 80 99) split across a chunk boundary
      // turned into replacement characters -- "It’s" -> "It<FFFD><FFFD><FFFD>s".
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Binary-safe variant of fetch(). The string-accumulating fetch() above
// corrupts binary payloads (data += chunk coerces bytes through utf-8),
// so PDF/image bodies must use this. Returns { status, buffer, headers }.
// Routes through maybeProxy + follows redirects, same as fetch().
function fetchBuffer(url, opts = {}) {
  url = maybeProxy(url);
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept': 'application/pdf,*/*',
        ...opts.headers
      },
      timeout: 20000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location, opts).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), headers: res.headers }));
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

// Returns a Date representing the moment when the Mountain Time clock reads
// year-monthIdx-day hour:minute. Use this when parsing a no-timezone local
// time from an upstream source (KOTO Tribe API, Wilkinson LibCal) on the bot
// runner (UTC). Otherwise `new Date("2026-05-29T19:30:00")` would treat
// 19:30 as UTC and the stored ISO would be off by 6–7 hours (event listed
// at 1:30 PM MDT instead of 7:30 PM MDT). DST-aware via probing both MDT
// (-06:00) and MST (-07:00) and picking the offset whose round-trip MT
// hour matches what we asked for.
function mtMoment(year, monthIdx, day, hour, minute) {
  for (const offHours of [6, 7]) {
    const asUTC = Date.UTC(year, monthIdx, day, hour + offHours, minute, 0);
    const cand = new Date(asUTC);
    const rendered = parseInt(cand.toLocaleString('en-US', {
      timeZone: 'America/Denver', hour12: false, hour: '2-digit'
    }), 10);
    if (rendered === hour) return cand;
  }
  // Fallback: MDT (May–Oct most years for the Telluride season).
  return new Date(Date.UTC(year, monthIdx, day, hour + 6, minute, 0));
}

// ══════════════════════════════════════════════════════════════
// ── Claude API — Meeting Summary Generation ──
// ══════════════════════════════════════════════════════════════

const SUMMARY_SYSTEM_PROMPT = `You are "Rick", the single named voice behind EVERY AI-written summary on livabletelluride.org (the Telluride, Colorado region Gov Hub). "Rick" is an internal persona name only — NEVER sign, name, quote, or refer to "Rick" anywhere in the output; just write in his voice. This voice is permanent and must never change, regardless of the agenda content or how this prompt is used.

THE VOICE — Rick is knowing, not cynical:
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
- PLANNING COMMISSION / PLANNING & ZONING (P&Z) / HARC (Historic & Architectural
  Review Commission) MEETINGS: do NOT report on single-family residences under
  review — individual single-family home variances, design reviews, COAs,
  setback/height/flood-elevation reviews for one house, or single-home
  construction/remodel/addition approvals. Omit them from the summary and the
  topics. Still cover subdivisions, PUDs, rezonings, multi-family /
  affordable-housing projects, commercial development, civic/public buildings,
  and code/text or guideline amendments. If only single-family-residence items
  are on the agenda (common for HARC), keep the summary to one brief sentence
  noting nothing of broad public consequence is on it, with an empty topics
  array. (Applies only when the meeting body is a Planning Commission, P&Z, or
  HARC — not Town Council, BOCC, etc.)
- Define government jargon inline only when essential — the site has a glossary tooltip layer that handles most terms.
- The "why it matters" section should connect agenda items to key local issues when relevant, written in the voice.

SHORT SUMMARY — HARD CONSTRAINTS:
- Length scales with the agenda, and err on the side of MORE detail — residents
  want to understand what's actually being decided, item by item. When a posted
  agenda offers real substance (code changes, multiple land-use items, consequential
  decisions), write a thorough ~150-220 words that walks through each substantive
  item. When the agenda is thin or routine, ~80-110 words. When no agenda is posted
  yet, 1-2 short sentences. Respect the upper cap; truncate lower-priority content first.
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
       and are dropped first if the word cap forces a choice.
- A summary with only routine items can be 1 sentence noting that nothing of consequence
  is on the agenda. Never pad — length should track how much is actually on the agenda.

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
  "shortSummary": "Overview for the meeting card. Scale to the agenda: ~50-70 words for a routine meeting, UP TO ~150 words when a posted agenda has substantive detail (code changes, multiple land-use items) worth spelling out for residents; 1 short sentence when no agenda is posted yet. Read as complete thoughts, never a fragment. Lead with the most consequential items (code changes / land use), then cover the rest. Voice-rule compliant.",
  "topics": ["topic 1", "topic 2", "topic 3"],
  "whyItMatters": "Paragraph connecting to key local issues, or empty string"
}`;

// Bump when the summary STYLE/length target changes. Agenda-backed summaries
// generated under an older version get regenerated ONCE (see refreshSummaries),
// so a prompt change rolls out to already-posted agendas instead of only new
// ones. v2 (2026-06-13): longer, more-detailed summaries when a real agenda exists.
const SUMMARY_VERSION = 4;

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
          if (json.error) { reject(new Error(`${json.error.type || 'error'}: ${json.error.message || JSON.stringify(json.error)}`)); return; }
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
async function callClaudeRaw(prompt, opts = {}) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('  ⚠ No ANTHROPIC_API_KEY — skipping Claude preview generation');
    return null;
  }
  const body = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens || 256,
    ...(opts.system ? { system: opts.system } : {}),
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
          if (json.error) { reject(new Error(`${json.error.type || 'error'}: ${json.error.message || JSON.stringify(json.error)}`)); return; }
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

// Ridgway + Rico. Neither fits loadCachedMeetings: Ridgway's CACHED_DATA
// stubs carry agendaUrl:null (the packet PDF is resolved at render time from
// RIDGWAY_AGENDA_MAP, keyed by "Month D, YYYY"), and Rico's regular meetings
// are GENERATED (3rd Wednesday monthly — mirror of getRicoMeetings() in
// gov-helpers.js) with PDFs resolved from RICO_AGENDA_MAP ("Month YYYY").
// Mirror that resolution here so refreshSummaries() summarizes their agendas
// like every other board's. Titles must match the get*Meetings() card titles
// exactly — source|date|title is the MANUAL_SUMMARIES lookup key.
// The maps are read from js/gov-helpers.js as last written, i.e. as of the
// PREVIOUS run (Task 20/20d rebuilds them later in this run) — at most one
// 6-hour cycle stale, fine because packets post days before the meeting.
function loadRidgwayRicoMeetings(now, horizon) {
  const out = [];
  const helpersSrc = readJsFile(GOV_HELPERS_JS);
  const dataSrc = readJsFile(GOV_DATA_JS);

  // Ridgway: meeting stubs from RIDGWAY_CACHED_DATA + agenda PDF from the map.
  const ridgwayMap = extractJsObject(helpersSrc, 'RIDGWAY_AGENDA_MAP') || {};
  for (const m of (extractJsArray(dataSrc, 'RIDGWAY_CACHED_DATA') || [])) {
    if (!m || !m.date) continue;
    const mDate = new Date(m.date);
    if (isNaN(mDate) || mDate < now || mDate > horizon) continue;
    out.push({
      source: 'ridgway',
      date: mDate.toISOString().split('T')[0],
      title: m.title || 'Meeting',
      agendaUrl: m.agendaUrl || ridgwayMap[m.date] || ''
    });
  }

  // Rico: 3rd-Wednesday regular meetings; agenda (fallback: full packet)
  // from the map.
  const ricoMap = extractJsObject(helpersSrc, 'RICO_AGENDA_MAP') || {};
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
  for (let i = 0; i <= 1; i++) {
    const base = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const firstDow = base.getDay();                      // 0=Sun..6=Sat
    const day = 1 + ((3 - firstDow + 7) % 7) + 14;       // 3rd Wednesday
    const mDate = new Date(base.getFullYear(), base.getMonth(), day);
    if (mDate < now || mDate > horizon) continue;
    const docs = ricoMap[MONTHS[base.getMonth()] + ' ' + base.getFullYear()] || {};
    out.push({
      source: 'rico',
      date: mDate.toISOString().split('T')[0],
      title: 'Rico Board of Trustees Regular Meeting',
      agendaUrl: docs.agenda || docs.packet || ''
    });
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

  // Ridgway + Rico — agenda PDFs resolved from the bot-maintained maps.
  try {
    meetings.push(...loadRidgwayRicoMeetings(now, horizon));
  } catch (e) {
    console.warn('  Ridgway/Rico meetings load error:', e.message);
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

/**
 * Returns { text, urls } — both the extracted agenda text and any PDF
 * link-annotation URLs (used by parseZoomFromAgenda to find Zoom URLs
 * that don't appear in the visible text layer). For HTML agenda pages,
 * urls is empty; only PDF extractors populate it.
 */
async function extractAgendaText(url) {
  if (!url) return { text: '', urls: [] };
  // CivicClerk portal URLs serve a React SPA shell — a bare fetch returns
  // only `<!doctype html>` boilerplate. The actual PDF is loaded inside a
  // DocAccess viewer iframe, gated by a per-request url_hash that the SPA
  // computes in-browser. We use Playwright to navigate the SPA the same
  // way a user would and intercept the PDF response from the network.
  // Falls back to '' (→ agendaSeedText fallback in refreshSummaries) if
  // Playwright isn't available locally / the PDF response wasn't captured.
  if (/\.portal\.civicclerk\.com\//i.test(url)) {
    try {
      const { extractCivicClerkAgendaPdf, extractPdfContent } = require('./civicclerk-pdf');
      const t0 = Date.now();
      const pdfBuf = await extractCivicClerkAgendaPdf(url);
      if (!pdfBuf) {
        console.log(`    CivicClerk Playwright: no PDF intercepted (${Date.now() - t0} ms)`);
        return { text: '', urls: [] };
      }
      const { text, urls } = await extractPdfContent(pdfBuf);
      const cleaned = text.replace(/\s+/g, ' ').trim();
      console.log(`    CivicClerk Playwright: ${cleaned.length} chars from PDF (${pdfBuf.length} bytes, ${urls.length} URLs, ${Date.now() - t0} ms)`);
      return { text: cleaned.slice(0, MAX_AGENDA_TEXT), urls };
    } catch (e) {
      console.warn(`    CivicClerk Playwright error: ${e.message}`);
      return { text: '', urls: [] };
    }
  }
  // Direct-PDF agenda (tellmed.org, telluridefire.com, SMART, MV packets,
  // etc.). The generic HTML path below tag-strips the response as text,
  // which turns a binary PDF into garbage — no usable agenda text, so no
  // AI summary and no Zoom parsing. Detect the .pdf URL, fetch the bytes,
  // and run the same pdfjs extractor used for CivicClerk PDFs.
  if (/\.pdf(\?|$)/i.test(url)) {
    try {
      const { extractPdfContent } = require('./civicclerk-pdf');
      const resp = await fetchBuffer(url);
      if (resp.status !== 200 || !resp.buffer || !resp.buffer.length) {
        console.warn(`    Direct PDF fetch failed (status ${resp.status}) for ${url}`);
        return { text: '', urls: [] };
      }
      const { text, urls } = await extractPdfContent(resp.buffer);
      const cleaned = (text || '').replace(/\s+/g, ' ').trim();
      console.log(`    Direct PDF: ${cleaned.length} chars (${resp.buffer.length} bytes, ${urls.length} URLs)`);
      return { text: cleaned.slice(0, MAX_AGENDA_TEXT), urls };
    } catch (e) {
      console.warn(`    Direct PDF extract error: ${e.message}`);
      return { text: '', urls: [] };
    }
  }
  // CivicWeb meeting-information pages (e.g. telluride-co.civicweb.net/Portal/
  // MeetingInformation.aspx?Id=…) embed the real agenda as a RELATIVE link
  // (/document/<id>/…pdf?handle=…) amid a sidebar list of past meetings. The
  // generic HTML path below would tag-strip that sidebar into "a list of past
  // meetings" junk (which is exactly why HARC summaries came out blank). So
  // find the agenda PDF link, resolve it to absolute, and extract the PDF.
  if (/\.civicweb\.net\/Portal\/MeetingInformation\.aspx/i.test(url)) {
    try {
      const resp = await fetch(url);
      if (resp.status === 200) {
        const m = resp.text.match(/href=["']([^"']*\/document\/\d+\/[^"']*\.pdf[^"']*)["']/i);
        if (m) {
          const pdfUrl = /^https?:/i.test(m[1]) ? m[1] : new URL(m[1], url).href;
          const { extractPdfContent } = require('./civicclerk-pdf');
          const pr = await fetchBuffer(pdfUrl);
          if (pr.status === 200 && pr.buffer && pr.buffer.length) {
            const { text, urls } = await extractPdfContent(pr.buffer);
            const cleaned = (text || '').replace(/\s+/g, ' ').trim();
            console.log(`    CivicWeb agenda PDF: ${cleaned.length} chars (${pr.buffer.length} bytes, ${urls.length} URLs)`);
            return { text: cleaned.slice(0, MAX_AGENDA_TEXT), urls };
          }
          console.warn(`    CivicWeb agenda PDF fetch failed (status ${pr.status}) for ${pdfUrl}`);
        } else {
          console.log('    CivicWeb meeting page: no agenda PDF link (agenda not posted yet)');
        }
      }
    } catch (e) { console.warn(`    CivicWeb agenda extract error: ${e.message}`); }
    // fall through to the generic HTML path below as a last resort
  }
  try {
    const resp = await fetch(url);
    if (resp.status !== 200) return { text: '', urls: [] };
    // Pull href URLs from the raw HTML before tag-stripping — agenda info
    // pages from CivicWeb / CivicEngage often link to the actual PDF and
    // Zoom URL via <a href>.
    const hrefRe = /href=["']([^"']+)["']/gi;
    const urls = [];
    let mh;
    while ((mh = hrefRe.exec(resp.text)) !== null) {
      const u = mh[1];
      if (/^https?:/i.test(u)) urls.push(u);
    }
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
    return { text: text.slice(0, MAX_AGENDA_TEXT), urls };
  } catch (e) {
    console.warn('  Agenda extract error:', e.message);
    return { text: '', urls: [] };
  }
}

/**
 * Parse Zoom meeting info from agenda text + URL list. CivicClerk and
 * CivicWeb agenda PDFs reliably include all four fields near the top:
 *   - Zoom URL (as a hyperlink annotation; comes via urls[])
 *   - Meeting ID    e.g.  "Meeting ID# 886 0088 9761"
 *   - Passcode      e.g.  "Passcode # 042834"
 *   - Phone number  e.g.  "Join by phone at 719-359-4580"
 * Returns an object with whichever fields could be extracted (possibly
 * empty). Caller decides whether to write the empty object — for the
 * gov-helpers.js MEETING_AGENDA_META map we only store entries with at
 * least one of zoomUrl / meetingId set.
 */
function parseZoomFromAgenda(text, urls) {
  const out = {};
  if (!text && (!urls || !urls.length)) return out;

  if (Array.isArray(urls)) {
    const zoomLink = urls.find((u) => /\bzoom\.us\//i.test(u));
    if (zoomLink) out.zoomUrl = zoomLink;
  }

  const t = String(text || '').replace(/\s+/g, ' ');

  // If no Zoom URL came from annotations, look in the visible text too
  // (some HTML agenda pages print the URL inline).
  if (!out.zoomUrl) {
    const inline = t.match(/https?:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/[^\s)\]>,]+/i);
    if (inline) out.zoomUrl = inline[0];
  }

  // Meeting ID — formats: "Meeting ID# 886 0088 9761", "Meeting ID 886 0088 9761",
  // "Meeting ID: 886 0088 9761". Allow optional internal spaces.
  const id = t.match(/Meeting\s*ID\s*[#:]?\s*(\d[\d\s]{7,16}\d)/i);
  if (id) out.meetingId = id[1].trim().replace(/\s+/g, ' ');

  // Passcode — formats: "Passcode # 042834", "Passcode: 042834", "Password: ...".
  // Allow alphanumerics + a few punctuation chars; cap at 30 chars so we
  // don't accidentally swallow following sentence text.
  const pc = t.match(/Pass(?:code|word)\s*[#:]?\s*([A-Za-z0-9._-]{4,30})/i);
  if (pc) out.passcode = pc[1].trim();

  // Phone — first US-format (XXX-XXX-XXXX or with parens) in the text.
  const ph = t.match(/(?:\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b)/);
  if (ph) out.phone = ph[0];

  return out;
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

// A "placeholder" summary is the stub written when an agenda isn't posted
// yet ("…agenda hasn't been posted yet." / "Agenda not yet available" /
// "Regular meeting agenda TBD" / "Work session agenda pending" / "Agenda
// details pending · …"). It MUST be treated as NOT-a-real-summary so it gets
// REGENERATED the moment a real agenda becomes available — otherwise the
// summary cache below skips the Claude call forever and the card stays frozen
// on the stub. This is exactly what kept the Medical Center / Fire / Ophir
// cards stale, and (2026-06-12) the BOCC card stuck on "Regular meeting agenda
// TBD" even after its agenda + packet were posted to CivicClerk.
// Keep these patterns ANCHORED to the word "agenda" so a real summary that
// merely mentions a "pending application" or "TBD" date isn't mistaken for a stub.
function isPlaceholderSummary(s) {
  if (!s || typeof s !== 'string') return true;
  return /agenda\s+(?:hasn'?t|has not)\s+been posted yet|agenda not yet available|no agenda(?:\s+text)?\s+available|agenda\s+(?:details\s+)?(?:tbd|pending|forthcoming|to be (?:determined|announced|posted))|meeting information unavailable|meeting scheduled for|list of past meetings|agenda content for this/i.test(s);
}

async function refreshSummaries(existingSummaries, existingAgendaMeta) {
  console.log('\n📋 Task 1: Refreshing meeting summaries...');
  const meetings = await fetchUpcomingMeetings();
  console.log(`  Found ${meetings.length} upcoming meetings`);

  const updated = { ...existingSummaries };
  const meta    = { ...(existingAgendaMeta || {}) };
  let newCount = 0;

  for (const m of meetings) {
    const key = `${m.source}|${m.date}|${m.title}`;

    // Persist the meeting's agenda deep link for the site/digest renderers.
    // Some sources (county CivicClerk especially) have real per-meeting
    // agenda URLs here (/event/<id>/files/agenda/<fileId>) that the card
    // renderers can't derive themselves — getCountyCachedMeetings' summary-
    // derived fallback used to link the bare portal home instead of the
    // agenda (caught on the Jul 15 2026 BOCC digest card). Cheap: comes
    // from the listing/API, no extra fetch.
    if (m.agendaUrl) {
      const prevMeta = (meta[key] && typeof meta[key] === 'object') ? meta[key] : {};
      if (prevMeta.agendaUrl !== m.agendaUrl) meta[key] = { ...prevMeta, agendaUrl: m.agendaUrl };
    }

    // Always (re)extract agenda zoom info if we don't have it yet —
    // separate from whether we already have a summary. A meeting might
    // have its summary cached from a prior run that didn't yet know how
    // to read PDF annotations.
    //
    // The valid shape is `{zoomUrl?, meetingId?, passcode?, phone?}` — an
    // object. A prior bug serialized the object as the literal string
    // "[object Object]"; we treat any non-object value (or empty object)
    // as missing so the broken entries get retried by the next run.
    const existingZoom = meta[key];
    const needAgendaZoom = !existingZoom
      || typeof existingZoom !== 'object'
      || (!existingZoom.zoomUrl && !existingZoom.meetingId);

    // A placeholder ("agenda not posted yet") counts as NO real summary, so
    // it gets regenerated the moment a real agenda appears.
    const isPlaceholder   = !!updated[key] && isPlaceholderSummary(updated[key]);
    const haveRealSummary = !!updated[key] && !isPlaceholder;
    // Version-gated upgrade: when there's a real agenda to work from but the
    // existing summary predates the current SUMMARY_VERSION (recorded in
    // meta[key].sv), regenerate it once. This rolls a prompt/length change out
    // to meetings whose agendas were already posted, not just future ones.
    const summaryVersion = (existingZoom && typeof existingZoom === 'object') ? existingZoom.sv : undefined;
    const needUpgrade = haveRealSummary && !!m.agendaUrl && summaryVersion !== SUMMARY_VERSION;

    if (haveRealSummary && !needUpgrade && !needAgendaZoom) {
      console.log(`  ✓ Already have summary + zoom meta for: ${key}`);
      continue;
    }
    if (haveRealSummary && !needUpgrade && needAgendaZoom && !m.agendaUrl) {
      // Have a real summary; no agenda URL to fetch zoom info from; skip.
      continue;
    }

    console.log(`  → Generating summary for: ${key}`);
    let { text: agendaText, urls: agendaUrls } = await extractAgendaText(m.agendaUrl);

    // Parse Zoom info from the agenda (text + PDF link annotations) and
    // stash it in MEETING_AGENDA_META keyed by source|date|title. Used
    // by gov-hub.html zoomPanel() to render the Zoom card on meetings
    // whose agenda PDF carries the Meeting ID / Passcode / phone /
    // join URL (every BOCC CivicClerk PDF, most CivicWeb PDFs).
    if (m.agendaUrl && (agendaText || (agendaUrls && agendaUrls.length))) {
      const zoom = parseZoomFromAgenda(agendaText, agendaUrls);
      if (zoom.zoomUrl || zoom.meetingId) {
        meta[key] = { ...(meta[key] || {}), ...zoom };  // merge, preserving sv
        const fields = Object.keys(zoom).filter(k => zoom[k]).join(', ');
        console.log(`    Zoom meta: ${fields}`);
      }
    }

    if (haveRealSummary && !needUpgrade) {
      // Had a real summary already; only the zoom-meta update mattered. Skip
      // the Claude call (which we'd otherwise re-do unnecessarily).
      continue;
    }
    // A placeholder stub with STILL no agenda text/seed (agenda genuinely
    // not posted yet): keep the existing stub and don't burn a Claude call
    // reproducing the same "not posted yet" sentence on every run. Once an
    // agenda IS posted, agendaText becomes truthy and we fall through to
    // regenerate a real summary below.
    if (isPlaceholder && !agendaText && !m.agendaSeedText) {
      continue;
    }

    // Fallback: when the agenda URL is unreachable (CivicClerk SPA shells,
    // PDFs we can't extract server-side) but the source still gave us
    // structured metadata about the meeting, hand that to Claude instead
    // of bailing. Better-than-nothing summary based on title + category
    // + agenda name + description.
    if (!agendaText && m.agendaSeedText) {
      agendaText = m.agendaSeedText;
      console.log(`    Using API-sourced seed text (${agendaText.length} chars; PDF body not reachable)`);
    }

    // A version-upgrade must NOT clobber a good existing summary when this run
    // couldn't fetch the agenda text (transient failure) — keep the old one.
    if (needUpgrade && !agendaText) {
      console.log(`    Upgrade deferred (no agenda text this run): ${key}`);
      continue;
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
        // Format as the flat summary string that gov-hub.js expects.
        // Prefer shortSummary (~50-word prose overview) — gives the
        // meeting card a substantive sentence or two instead of a row
        // of short topic bullets. Falls back to joined topics when
        // shortSummary is missing (e.g. older Claude responses).
        const topicBullets = (result.topics || []).join(' · ');
        updated[key] = result.shortSummary || topicBullets;
        meta[key] = { ...(meta[key] || {}), sv: SUMMARY_VERSION };  // record summary style version
        newCount++;
        console.log(`    ✓ Generated summary (${result.topics?.length || 0} topics)`);
      }
    } catch (e) {
      console.warn(`    ✗ Claude error: ${e.message}`);
    }

    // Rate limit — small delay between API calls
    await new Promise(r => setTimeout(r, 1500));
  }

  // Prune summaries + agenda-meta older than 30 days
  for (const key of Object.keys(updated)) {
    const parts = key.split('|');
    if (parts[1] && daysAgo(parts[1]) > 30) delete updated[key];
  }
  for (const key of Object.keys(meta)) {
    const parts = key.split('|');
    if (parts[1] && daysAgo(parts[1]) > 30) delete meta[key];
  }

  console.log(`  Summary refresh complete: ${newCount} new summaries, ${Object.keys(updated).length} total; ${Object.keys(meta).length} agenda-meta entries`);
  return { summaries: updated, agendaMeta: meta };
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

      // extractAgendaText now returns { text, urls } — we only need the
      // text portion here. urls are consumed by refreshSummaries' zoom-meta
      // extraction path, not by previews.
      const { text: agendaText } = m.agendaUrl
        ? await extractAgendaText(m.agendaUrl)
        : { text: '' };

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

// ── San Miguel Basin Forum (West End news) ──
// SMBF uses Creative Circle CMS (same as Telluride Times) but has the
// /search/?f=rss endpoint DISABLED — returns 403 from Varnish — so we
// scrape the /news/ landing page HTML instead.
//
// Each article card lives in a <div class="landing-story row"> block:
//
//   <a href='/stories/<slug>,<id>?'>
//     <img class="photo" src="https://zeta.creativecirclecdn.com/...">
//   </a>
//   <h3 class='heading-3'><a href='/stories/<slug>,<id>?'>Title</a></h3>
//   <div class='lead'><p>Summary text...</p>
//
// ─ Date handling (2026-05-26: print-edition convention) ─
//
// SMBF runs a print-first weekly. Stories appear in the print edition
// well before they're posted online, so the byline date inside each
// article's JSON-LD (`datePublished`) lags reality. Per user
// direction, we treat the "publish date" for our site as the day WE
// first observe the story on the SMBF website — i.e. `firstSeen` —
// not the article's byline date. Side-effect: we no longer need the
// per-article detail-page fetch the previous implementation used to
// pull JSON-LD; the landing page is all the data the renderer needs.
//
// Carry-forward: when an article we've already filed drops off the
// SMBF front-page rotation (which is short — ~5 stories visible at a
// time) but is still within the 35-day window, we keep it in our
// array. The display layer in local-news.html applies its own
// 35-day filter against `firstSeen`, so seed entries with sentinel
// firstSeen='2025-01-01' get hidden without being deleted (used to
// suppress the initial-deployment flood: see the 23 ancient-dated
// seed entries in js/gov-helpers.js).
// SMBF's public site is organized by editorial CATEGORY. We scrape the three
// English category landing pages below. (The combined /stories/ view also
// mixes in Spanish translations and other sections, and the old /news/-only
// scrape missed community/sports stories entirely.) Every category page uses
// the same Creative Circle markup (landing-story / heading-3 / lead /
// img.photo) and links to /stories/<slug>,<id>.
const SMBF_CATEGORY_URLS = [
  'https://www.sanmiguelbasinforum.com/news/',
  'https://www.sanmiguelbasinforum.com/community/',
  'https://www.sanmiguelbasinforum.com/sports/',
];
// Hard age cutoff. IMPORTANT: the category pages are NOT date-limited -- they
// show the 25 most-recent-in-category no matter how old, so /community/ still
// lists last year's "Trunk or Treat" etc. The landing cards carry no date, so
// we read each article's real datePublished from its detail page and drop
// anything older than this many days. (Was a firstSeen "day we saw it" model;
// user asked for a true article-age cutoff, 2026-07-02.)
const SMBF_MAX_AGE_DAYS = 30;

// High-signal Spanish function words. None of these occurs as a standalone
// word in an English news headline, so counting them is a cheap, false-
// positive-resistant language sniff for the SMBF English/Spanish twin cards.
const SPANISH_STOPWORDS = new Set([
  'de', 'el', 'la', 'los', 'las', 'del', 'para', 'por', 'una', 'uno', 'un',
  'con', 'es', 'en', 'su', 'sus', 'que', 'se', 'al', 'ano', 'anos', 'mas',
  'como', 'esta', 'este', 'esto', 'segun', 'hora', 'ni', 'pero', 'sobre',
  'entre', 'desde', 'hasta', 'muy', 'ya', 'son', 'fue', 'ser',
]);

function isSpanishTitle(title) {
  // Strip accents so 'año' -> 'ano' etc. match the ASCII stopword set.
  const norm = String(title).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = norm.split(/[^a-z]+/).filter(Boolean);
  if (!words.length) return false;
  let hits = 0;
  for (const w of words) if (SPANISH_STOPWORDS.has(w)) hits++;
  return hits >= 3;
}

// Pull an article's real publish date from its detail-page HTML. Prefers
// schema.org JSON-LD ("datePublished"), falls back to the <time datetime>
// tag. Returns an ISO yyyy-mm-dd string, or null if neither is present.
function extractSmbDate(html) {
  const ld = /"datePublished"\s*:\s*"([^"]+)"/i.exec(html);
  if (ld) {
    const d = new Date(ld[1]);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  const t = /<time[^>]*datetime=["']([^"']+)["']/i.exec(html);
  if (t) {
    const d = new Date(t[1]);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  return null;
}

const SMBF_DECODE = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ')
  // Strip AFTER decoding: callers tag-strip then decode, so an entity-encoded
  // tag (&lt;img onerror=…&gt;) would otherwise be reconstituted into live
  // markup that later renders unescaped. Remove any tags decoding produced so
  // this stays a plain-text decoder no matter the call order (defense in depth
  // behind the render-site escaping).
  .replace(/<[^>]*>/g, '');

// SMBF landing "lead" blocks often embed the KICKER + HEADLINE + BYLINE ahead
// of the body ("WILDFIRE A day in the life… By NATASHA HESSLER, Forum Intern
// The town of Ridgway…") — rendered verbatim that reads as garbage on a card
// (2026-07-22 report from Morgan). Strip those prefixes deterministically:
// anchor on the known title (most reliable), then peel an all-caps byline.
// This is the no-API fallback; new articles get a real Claude summary below.
function cleanSmbLead(lead, title) {
  let s = String(lead || '').replace(/\s+/g, ' ').trim();
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (t) {
    const i = s.toLowerCase().indexOf(t.toLowerCase());
    if (i >= 0 && i <= 60) s = s.slice(i + t.length).trim();   // kicker + headline gone
  }
  // Byline: name in CAPS ("By REGAN TUTTLE"), optional mixed-case role
  // (", Editor", ", Forum Intern"). Role list is closed — the body itself
  // starts with a capitalized word, so a free-form role match would eat it.
  s = s.replace(/^By\s+(?:[A-Z][A-Z.'’\-]*\s*){1,4}(?:,\s*(?:Editor|Publisher|Staff Writer|Staff Reporter|Reporter|Correspondent|Contributor|Columnist|Forum Intern|Intern)\b)?\s*/, '').trim();
  return s;
}

async function pullSmbForum(existingSmbArticles = []) {
  console.log('\n🌄 San Miguel Basin Forum: scraping category pages...');
  const cutoffMs = Date.now() - SMBF_MAX_AGE_DAYS * 86400000;
  const existingByHref = new Map(existingSmbArticles.map(a => [a.href, a]));

  // firstSeen now holds the article's REAL publish date (yyyy-mm-dd). Trust a
  // cached date only when a prior run stamped it from the article itself
  // (dateSource:'article') -- old records carried firstSeen = "day we saw it".
  const cachedDate = (href) => {
    const c = existingByHref.get(href);
    return (c && c.dateSource === 'article' && /^\d{4}-\d{2}-\d{2}$/.test(c.firstSeen || ''))
      ? c.firstSeen : null;
  };

  const out = [];
  const seenHrefs = new Set();
  let anyPageOk = false, newCount = 0, fetchedDetails = 0;

  for (const url of SMBF_CATEGORY_URLS) {
    let html;
    try {
      const resp = await fetch(url);
      if (resp.status !== 200) {
        console.warn(`  SMBF ${url} HTTP ${resp.status} -- skipping this category`);
        continue;
      }
      html = resp.text;
    } catch (e) {
      console.warn(`  SMBF ${url} fetch error: ${e.message} -- skipping this category`);
      continue;
    }
    anyPageOk = true;

    const blocks = html.split(/<div\s+class=["']landing-story[^"']*["'][^>]*>/i);
    blocks.shift(); // first piece is everything before the first card

    // Category pages are newest-first by date. Once we pass the age cutoff the
    // rest of the page is older too, so stop after a short run of stale cards
    // (a couple, to tolerate same-day ordering jitter) to bound detail fetches.
    let staleStreak = 0;
    for (const block of blocks) {
      const h3 = /<h3[^>]*class=['"][^'"]*heading-3[^'"]*['"][^>]*>\s*<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>\s*<\/h3>/.exec(block);
      if (!h3) continue;
      const rawHref = h3[1].trim().replace(/\?$/, '');
      const fullHref = rawHref.startsWith('http')
        ? rawHref
        : 'https://www.sanmiguelbasinforum.com' + (rawHref.startsWith('/') ? '' : '/') + rawHref;
      if (seenHrefs.has(fullHref)) continue; // a story can list in >1 category
      seenHrefs.add(fullHref);
      const title = SMBF_DECODE(h3[2].replace(/<[^>]+>/g, '').trim());
      if (!title) continue;
      // Skip the Spanish translation twins SMBF publishes beside each story.
      if (isSpanishTitle(title)) continue;

      // Resolve the real publish date (cache -> detail-page fetch). The same
      // detail page also feeds the Claude summary, so fetch it when either is
      // missing (a record that already has a claudeSummary never re-fetches).
      const cachedRec = existingByHref.get(fullHref);
      const needSummary = ANTHROPIC_API_KEY && !(cachedRec && cachedRec.claudeSummary);
      let iso = cachedDate(fullHref);
      let detailHtml = null;
      if (!iso || needSummary) {
        try {
          const d = await fetch(fullHref);
          fetchedDetails++;
          if (d.status === 200) {
            detailHtml = d.text;
            if (!iso) iso = extractSmbDate(d.text);
          }
        } catch (e) { /* undated -> skip below */ }
      }
      if (!iso) continue; // no date -> don't risk surfacing stale content

      if (new Date(iso + 'T00:00:00Z').getTime() < cutoffMs) {
        if (++staleStreak >= 2) break; // deep into the old part of the page
        continue;
      }
      staleStreak = 0;

      const leadM = /<div\s+class=['"]lead['"][^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const lead = leadM
        ? cleanSmbLead(SMBF_DECODE(leadM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()), title)
        : '';
      const imgM = /<img[^>]*class=["'][^"']*photo[^"']*["'][^>]*src=["']([^"']+)["']/i.exec(block);
      const img = imgM ? imgM[1] : '';
      if (!cachedRec) newCount++;

      // Summary: keep a cached Claude summary forever; otherwise try to
      // generate one from the detail page (SMBF is the same Creative Circle
      // CMS as TT, so the TT text extractor works). Fall back to the cleaned
      // landing lead. claudeSummary flips true only when Claude actually
      // produced text, so a failed attempt retries on a later run.
      let copy = lead || (cachedRec && cachedRec.copy) || '';
      let claudeSummary = !!(cachedRec && cachedRec.claudeSummary);
      if (claudeSummary) {
        copy = cachedRec.copy;
      } else if (detailHtml) {
        const fullText = extractTTArticleText(detailHtml);
        if (fullText) {
          const sum = await summarizeTTArticle(title, fullText, '', 'San Miguel Basin Forum');
          if (sum && sum.length > 40) { copy = sum; claudeSummary = true; }
          await new Promise(r => setTimeout(r, 800));   // be polite to SMBF
        }
      }
      copy = String(copy).replace(/\s+/g, ' ').trim();

      out.push({
        title,
        source: 'San Miguel Basin Forum',
        sourceKey: 'smb',
        date: formatDate(new Date(iso + 'T12:00:00Z')),
        firstSeen: iso,          // = the article's real publish date
        dateSource: 'article',   // marks the date as trustworthy for next run
        newsTopic: classifyNewsTopic(title, copy),
        copy: claudeSummary ? copy : copy.slice(0, 300),
        claudeSummary,
        href: fullHref,
        img: img || (cachedRec && cachedRec.img) || '',
        // Hand-set presentation overrides survive the per-run rebuild.
        ...(cachedRec && cachedRec.imgPos ? { imgPos: cachedRec.imgPos } : {}),
      });
    }
  }

  // If every category page failed, keep the existing list rather than wiping
  // the section on a transient proxy/network outage.
  if (!anyPageOk) {
    console.warn('  SMBF: all category pages failed -- preserving existing list');
    return existingSmbArticles;
  }

  // Newest first, by publish date.
  out.sort((a, b) => (b.firstSeen || '').localeCompare(a.firstSeen || ''));

  console.log(`  SMBF: ${out.length} article(s) within ${SMBF_MAX_AGE_DAYS} days ` +
    `(${newCount} new, ${fetchedDetails} detail fetch${fetchedDetails === 1 ? '' : 'es'})`);
  return out;
}


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

// Repair legacy "mojibake": runs of U+FFFD (replacement chars) left by the old
// chunk-split UTF-8 bug. In these short news excerpts the culprit is almost
// always a smart apostrophe inside a contraction/possessive ("It’s").
function repairMojibake(s) {
  return String(s).replace(/(\w)\uFFFD+(\w)/g, "$1'$2").replace(/\uFFFD+/g, "'");
}

async function refreshNews(existingTtArticles = [], existingSmbArticles = []) {
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

        // If we already have a Claude summary for this article, carry it forward.
        // One-shot backfill: cached letters that pre-date the letterAuthor
        // feature (commit 7f615b7) lack the field, leaving their cards without
        // the "By <author>" byline. Re-fetch just the full text (no re-summarize)
        // so we can extract the signature.
        const cachedHit = existingByHref.get(href);
        // Don't carry forward an entry that needs a fresh try: (a) text
        // corrupted by the old chunk-split UTF-8 bug (contains U+FFFD), or
        // (b) an EMPTY copy \u2014 a summary that failed at scrape time (e.g. a
        // transient auth/fetch miss produced a refusal we've since blanked, or
        // the TT_AUTH_COOKIE was briefly invalid). Retrying picks up a real
        // summary once the article is reachable again; if it still isn't, the
        // refusal guard keeps it blank. Self-healing instead of stuck-forever.
        const cachedRetry = cachedHit && (
          /\uFFFD/.test(cachedHit.copy || '') ||
          /\uFFFD/.test(cachedHit.letterAuthor || '') ||
          !String(cachedHit.copy || '').trim());
        if (existingByHref.has(href) && cachedHit.claudeSummary && !cachedRetry) {
          const cached = cachedHit;
          const isLetterCached = /\/letters_to_editor\//i.test(href);
          if (isLetterCached && !cached.letterAuthor && TT_AUTH_COOKIE) {
            try {
              const result = await fetchTTArticleDirect(href);
              if (result && result.status === 200) {
                const fullText = extractTTArticleText(result.text);
                const author = fullText ? extractLetterAuthor(fullText) : '';
                if (author) {
                  articles.push({ ...cached, letterAuthor: author });
                  await new Promise(r => setTimeout(r, 800));
                  continue;
                }
              }
              await new Promise(r => setTimeout(r, 800));
            } catch (e) {
              console.warn(`  Could not backfill letterAuthor for ${href}: ${e.message}`);
            }
          }
          articles.push(cached);
          continue;
        }

        // New article — try to get full text and summarize.
        let copy = rssCopy;
        let claudeSummary = false;
        let letterAuthor = '';
        let isLetter = /\/letters_to_editor\//i.test(href);
        // Letters are public (no paywall), and their RSS lead is usually just
        // the "Dear Editor," salutation — so always fetch+summarize letters,
        // even when no TT auth cookie is configured.
        if (TT_AUTH_COOKIE || isLetter) {
          try {
            const title = (item.title || '').trim();
            const result = await fetchTTArticleDirect(href);
            if (result && result.status === 200) {
              const fullText = extractTTArticleText(result.text);
              if (fullText) {
                if (!isLetter && isLetterBody(fullText)) isLetter = true;
                copy = await summarizeTTArticle(title, fullText, rssCopy);
                claudeSummary = true;
                newCount++;
                // For letters, parse the signature so the card can display
                // "By <Author>" under the icon. See extractLetterAuthor.
                if (isLetter) letterAuthor = extractLetterAuthor(fullText);
              }
            }
            // Small delay between fetches — be polite to TT's servers
            await new Promise(r => setTimeout(r, 800));
          } catch (e) {
            console.warn(`  Could not summarize ${href}: ${e.message}`);
          }
        }

        // Safety net: never let a useless lead (blank, or a bare salutation
        // like "Dear Editor,") reach a card. Prefer a non-useless RSS lead;
        // otherwise a neutral placeholder. No fabrication.
        if (isUselessCopy(copy)) {
          // Prefer a real RSS lead; otherwise leave the card summary BLANK.
          // Never echo the headline back as the "summary" (redundant on a card
          // that already shows the title) — a blank summary is better. This is
          // the path for a piece we couldn't fetch/summarize (e.g. an opinion
          // letter whose body isn't retrievable): headline + Read more, no text.
          copy = isLetter
            ? 'A letter to the editor published in the Telluride Times. Select "Read more" for the full letter.'
            : (!isUselessCopy(rssCopy) ? rssCopy : '');
          claudeSummary = false;
        }

        // Collapse whitespace/newlines in the summary to a single line. The RSS
        // copy paths above already do this, but a Claude summary
        // (summarizeTTArticle) can contain paragraph breaks — and these article
        // objects are serialized as SINGLE-quoted JS strings, where a raw
        // newline is a syntax error that breaks the whole gov-helpers.js file
        // (took down BLOG_POSTS + all dynamic content 2026-07-01). Keep copy
        // single-line so no writer can emit an unterminated string.
        if (typeof copy === 'string') copy = copy.replace(/\s+/g, ' ').trim();

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
          img: (enclosure?.$.url || '').replace(/[?&]resize=[^&]*/i, ''),
          // Only set when populated — keeps serialized output clean for
          // non-letter articles where the field would always be ''.
          ...(letterAuthor ? { letterAuthor } : {}),
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

  // Final safety net: repair any remaining legacy mojibake on carried-forward
  // (out-of-feed) entries the fresh-fetch path didn't touch.
  for (const art of articles) {
    if (typeof art.copy === 'string' && art.copy.indexOf('\uFFFD') >= 0) art.copy = repairMojibake(art.copy);
    if (typeof art.letterAuthor === 'string' && art.letterAuthor.indexOf('\uFFFD') >= 0) art.letterAuthor = repairMojibake(art.letterAuthor);
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

  // San Miguel Basin Forum — runs as part of the same news refresh tick
  // so it stays on the regular 6-hour schedule. Stored separately in
  // SMB_FORUM_ARTICLES so a future tweak to TT scraping can't accidentally
  // drop the SMBF data.
  let smbArticles = [];
  try {
    smbArticles = await pullSmbForum(existingSmbArticles);
  } catch (e) {
    console.warn(`  SMBF refresh error: ${e.message} — preserving existing`);
    smbArticles = existingSmbArticles || [];
  }

  console.log(`  Found: ${ttArticles.length} Telluride Times, ${govArticles.length} gov news, ${kotoNewscasts.length} KOTO newscasts, ${kotoFeatured.length} KOTO stories, ${csSunArticles.length} Colorado Sun, ${ridgwayArticles.length} Ridgway, ${smbArticles.length} SMBF`);
  return {
    ttArticles: [...ttArticles, ...govArticles, ...dedup(csSunArticles), ...dedup(ridgwayArticles)],
    kotoNewscasts: dedup(kotoNewscasts),
    kotoFeatured: dedup(kotoFeatured),
    smbArticles
  };
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
/**
 * Pull the author of a Letter to the Editor from the decoded article
 * body. TT letters reliably end with a closing salutation ("Sincerely,"
 * "Yours," "Thanks,", etc.) followed by 1-3 lines: the name, then often
 * a title/affiliation. This returns the name (and optional title) as a
 * single string suitable for rendering as "By <result>" on a card.
 * Returns '' when no plausible signature can be parsed.
 */
function extractLetterAuthor(fullText) {
  if (!fullText) return '';
  // Look in the last ~700 chars — letter bodies wrap with the signature
  // close to the end, after the salutation.
  const tail = fullText.slice(-700);
  // Take the LAST sign-off in the tail — a "Thanks, Max." mid-letter must not
  // shadow the real "Sincerely, <author>" signature at the end.
  const sigRe = /(?:Sincerely|Yours(?:\s+truly)?|Best(?:\s+regards)?|Thanks|Thank\s+you|Regards|Cheers|Respectfully)[,. ]+\s*([A-Z][A-Za-z'’\-.]+(?:\s+(?:[A-Z][A-Za-z'’\-.]+|[“"][^”"]{1,20}[”"])){0,3})/g;
  let sig = null, sm;
  while ((sm = sigRe.exec(tail)) !== null) sig = sm;
  if (sig) {
    let author = sig[1].trim();
    // Look at what immediately follows the name — often a title/role
    // ("Director, Rainbow Preschool") on its own short line.
    const after = tail.slice(sig.index + sig[0].length).trim();
    const nextLine = after.match(/^[\s,]*([A-Za-z][^,\n]{2,80}?)(?:\.\s|\n|$)/);
    if (nextLine && /^[A-Z]/.test(nextLine[1]) && !/^(?:and|or|the|to)\b/i.test(nextLine[1])) {
      author += ', ' + nextLine[1].trim();
    }
    return author.slice(0, 100);
  }
  // Fallback: scan the last ~5 short lines for a Title-Case name line.
  const lines = tail.split(/[\n.]+/).map(s => s.trim()).filter(s => s && s.length < 80);
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) {
    const m = lines[i].match(/^([A-Z][A-Za-z'’\-.]+(?:\s+[A-Z][A-Za-z'’\-.]+){1,3})\s*$/);
    if (m) return m[1];
  }
  return '';
}

// A letter body: salutation up top, or a signed-off closing near the end.
// Catches letters TT files under /opinion/ instead of /letters_to_editor/,
// which the URL-based check misses — those should still get the author
// byline and the letter placeholder (never a fully blank card).
function isLetterBody(fullText) {
  const t = String(fullText || '').trim();
  if (!t) return false;
  if (/\b(?:dear|to\s+the)\s+editor\b/i.test(t.slice(0, 300))) return true;
  return /\b(?:sincerely|respectfully(?:\s+submitted)?|gratefully|yours\s+truly)\s*,/i.test(t.slice(-250));
}

// True when a card "copy"/lead is useless to a reader: blank, or just a
// salutation ("Dear Editor," / "To the Editor"), or too short to be a summary.
function isUselessCopy(s) {
  if (!s) return true;
  const t = String(s).trim();
  if (/^(?:dear\s+editor|to\s+the\s+editor|editor)\s*[,:.]?\s*$/i.test(t)) return true;
  return t.replace(/[^a-z]/gi, '').length < 20;
}

// Paragraphs that are page chrome, not article text: the <noscript> paywall
// warning that precedes every encrypted block, and the weather-widget lines
// that sit at the top of every TT page.
const TT_PAGE_BOILERPLATE = /javascript is required|this page requires javascript|enable it in your browser|\b(?:high|low)\s+\d+\s*f\b|\bmph\b|\bwinds?\s+[nsew]|sunshine|partly cloudy|clear skies|^updated:\s/i;

function extractTTArticleText(html) {
  // 0. Scope to the article's own body region when the BLOX markers are
  //    present. The rest of the page carries noscript paywall warnings, the
  //    weather module, and trending-story teasers — the whole-page fallbacks
  //    below used to blend that noise into the text sent to the summarizer
  //    (or bury a short letter in it, producing a refusal → blank card).
  const rStart = html.indexOf('id="asset-content"');
  if (rStart >= 0) {
    let rEnd = html.indexOf('tncms-region-article_bottom', rStart);
    if (rEnd < 0) rEnd = html.indexOf('id="asset-below"', rStart);
    const region = rEnd > rStart ? html.slice(rStart, rEnd) : html.slice(rStart);
    // Walk the region in document order, collecting visible paragraphs and
    // decoded subscriber-only blocks as they appear — paywalled articles
    // interleave plain teaser <p>s with encrypted blocks.
    const pieces = [];
    const re = /<div[^>]*class="subscriber-only encrypted-content"[^>]*>([\s\S]*?)<\/div>|<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = re.exec(region)) !== null) {
      const raw = m[1] !== undefined ? decodeTncms(unescapeTncmsPayload(m[1])) : m[2];
      const plain = raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/\s{2,}/g, ' ').trim();
      if (plain && !TT_PAGE_BOILERPLATE.test(plain)) pieces.push(plain);
    }
    const joined = pieces.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (joined.length > 100) return joined;
  }

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

  // 3. Fallback: visible <p> paragraphs, minus the weather-widget lines that
  //    sit at the top of every TT article. Catches Letters to the Editor,
  //    whose body isn't always inside the containers above — without this the
  //    card falls back to the RSS lead, which for a letter is just the bare
  //    "Dear Editor," salutation.
  const paras = (html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [])
    .map(p => p
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ')
      .replace(/\s{2,}/g, ' ').trim())
    .filter(t => t && !TT_PAGE_BOILERPLATE.test(t));
  let joined = paras.join(' ').replace(/\s{2,}/g, ' ').trim();
  // If the letter salutation is present, start the text there (drops any
  // leftover weather/preamble before it).
  const dem = joined.search(/\bdear\s+editor\b/i);
  if (dem > 0) joined = joined.slice(dem);
  if (joined.length > 100) return joined;

  return null;
}

// A "meta-summary" / refusal: the model explaining WHY it can't summarize
// (corrupt/garbled text, paywall, no readable content, "can't be produced",
// "resubmit") instead of summarizing. NEVER store one — a blank card beats an
// apology about the source. Mirror of isRefusalSummary() in js/gov-helpers.js
// (keep the two in sync).
function isRefusalSummary(text) {
  if (!text) return false;
  const t = String(text);
  return /\b(?:article|article text|text|content|source)\b[^.!?]{0,60}\b(?:corrupt(?:ed)?|garbl(?:ed)?|unreadable|not readable|no readable content|isn'?t accessible|is not accessible|not accessible|(?:login\/)?paywall|boilerplate)\b/i.test(t)
      || /\b(?:can'?t|cannot|could ?n'?t|couldn'?t|unable to)\b[^.!?]{0,40}\b(?:produce|generate|summar\w*|extract|access|read|be produced)\b/i.test(t)
      || /\bresubmit\b|check the source article|based on what'?s visible|no reliable summary/i.test(t);
}

/**
 * Use Claude to write a 2-3 sentence summary of a TT article for the news card.
 * Voice: "Rick" — the site's single named summary persona (long-time local,
 * knowing not cynical, observational, no advocacy). Never named in output.
 * Falls back to rssFallback if the API call fails; returns '' (blank) if the
 * model produces a refusal/meta-summary rather than a real one.
 */
async function summarizeTTArticle(title, fullText, rssFallback, sourceName = 'Telluride Times') {
  if (!ANTHROPIC_API_KEY || !fullText) return rssFallback;

  const prompt = `Summarize the following ${sourceName} article in 2-3 sentences for a community news card. Write in the voice of "Rick" — the single named persona behind every AI summary on livabletelluride.org: a long-time local who has watched all the cycles, loves this region, and is not cynical but wary of major changes. Observational, factual, plainspoken, no advocacy or editorializing. ("Rick" is an internal persona name — NEVER name, sign, or refer to "Rick" in the output.) Do not start with the article title. Do not use phrases like "The article says" or "This piece covers." Just deliver the key facts in plain language. Keep it under 280 characters if possible.

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
          if (isRefusalSummary(text)) { resolve(''); return; }   // meta-summary → blank, never an apology
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
    } else if (o > 125) {
      // The encoder only shifts printable ASCII (33–125); non-ASCII plaintext
      // (curly quotes, em dashes, &nbsp;) passes through unchanged. The -47
      // branch below used to mangle these (“ → ῭, nbsp → q).
      result += text[i];
    } else if (o >= 79) {
      result += String.fromCharCode(o - 47);
    } else {
      result += String.fromCharCode(o + 47);
    }
  }
  return result;
}

// The cipher maps plaintext k/m/U/Q/V to < > & " ' — characters the page
// then serves HTML-escaped (&lt; &gt; &amp; …). Unescape them BEFORE
// decoding, or every k/m/U in the article decodes as multi-char junk
// ("lucky" → "lucU=Ejy"), which reads as corrupt text and makes the
// summarizer refuse → blank card. (Root cause of the 2026-07-08 blank
// letters and the garbled letter-author names.)
function unescapeTncmsPayload(payload) {
  return payload
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
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
    blocks.push(decodeTncms(unescapeTncmsPayload(m[1])));
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
          href: row.SourceURL || row.URL || row.url || row.Link || '',
          // Flyer/logo uploaded via the Submit-an-Event form (Firebase Storage),
          // carried through the Apps Script image Sheet column. events.html's
          // community-events.json push maps e.imageUrl onto the card. Accept
          // either header name ("Image" — what the Apps Script writes for a new
          // sheet — or "HeaderImage" — what the live sheet's column is named).
          imageUrl: row.Image || row.image || row.HeaderImage || row.headerimage || ''
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
// extractJsArray / extractJsObject live in a unit-tested lib now
// (scripts/lib/extract.js, scripts/test/extract.test.js).
const { extractJsArray, extractJsObject } = require('./lib/extract.js');
// JS→JSON migration (Phase 1): dual-write mirrored arrays to data/<name>.json.
const { mirrorAll } = require('./lib/json-mirror.js');
const { stripDescPreamble } = require('./lib/clean-text.js');

/**
 * Guard the JS-as-data write path. Object writes (MANUAL_SUMMARIES, agenda meta)
 * skip the array sanitize/validate funnel, and a single corrupt splice silently
 * breaks every const declared below it. Before writing, confirm the serialized
 * fragment carries no toString-coercion marker and parses as valid JS in
 * isolation (catches unbalanced brackets — the "dropped const nukes the rest of
 * the file" class). Throws on failure so the caller can keep the prior value.
 */
function assertSerializedSafe(varName, serialized) {
  if (/\[object Object\]/.test(serialized)) {
    throw new Error(`${varName}: serialization contains "[object Object]" (a value was coerced via toString)`);
  }
  try {
    // eslint-disable-next-line no-new-func
    new Function(serialized + '\n;return typeof ' + varName + ';');
  } catch (e) {
    throw new Error(`${varName}: serialized fragment does not parse — ${e.message}`);
  }
}

/**
 * Replace a const declaration's value in the source string.
 * Works for both objects and arrays.
 *
 * STRICT (2026-07-22 audit P0-3): a missing target const THROWS — the old
 * warn-and-continue silently dropped every update when a const was renamed or
 * targeted the wrong file (the Norwood/SMC_ALERTS bug shape). The bracket walk
 * (lib/replace.js locateConst) is string-aware, so brackets inside scraped
 * text can't mis-place the splice.
 */
function replaceJsValue(source, varName, newValue, isObject = false) {
  const { start, end } = locateConst(source, varName, isObject);

  let serialized;
  if (isObject) {
    serialized = serializeObject(varName, newValue);
  } else {
    // Funnel: normalize (sanitize) → validate (quarantine broken records)
    // → serialize. Quarantines are logged, not silent. A whole source
    // going malformed shrinks the array and trips source-health.
    const sane = sanitizeRecords(newValue);
    const { kept, quarantined } = validateRecords(sane);
    if (quarantined.length) {
      console.warn(`  ⚠ ${varName}: quarantined ${quarantined.length} malformed record(s) before write:`);
      for (const q of quarantined.slice(0, 10)) {
        console.warn(`      ${q.reason} — ${JSON.stringify(q.record).slice(0, 120)}`);
      }
    }
    serialized = serializeArray(varName, kept);
  }

  try {
    assertSerializedSafe(varName, serialized);
  } catch (e) {
    console.error(`  ✖ ${e.message} — ABORTING write of ${varName}, keeping previous value.`);
    return source;
  }
  return source.slice(0, start) + serialized + source.slice(end);
}

// Serialization + data sanitization live in unit-tested lib modules now
// (scripts/test/*.test.js). Imported here; used by replaceJsValue() above and
// the Mountain Village reconcile (Task 21b) below.
const { serializeObject, serializeArray } = require('./lib/serialize.js');
const { sanitizeRecords } = require('./lib/sanitize.js');
const { validateRecords } = require('./lib/validate.js');
const { locateConst, replaceConstStringStrict } = require('./lib/replace.js');

/**
 * Replace a simple const string value like: const FOO = '2026-04-22';
 * Strict — throws if the const is missing (lib/replace.js).
 */
const replaceConstString = replaceConstStringStrict;

// ══════════════════════════════════════════════════════════════
// ── Main ──
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ── Task 6: Blog from sent Customer.io broadcasts ──
// Mailchimp (and its campaign-archive RSS) was retired 2026-07-06. Blog posts
// now come from the newsletters actually SENT via the Digest Review Desk: the
// digest Worker /send archives each sent broadcast into data/sent-broadcasts.json
// (title, date, permalink, excerpt). syncBroadcastBlog() below turns any
// not-yet-listed broadcast into a BLOG_POSTS entry. Hand-curated posts (any
// non-'customerio' source) are never touched.

// Strip HTML tags and collapse whitespace for excerpt extraction.
function htmlToText(s) {
  return String(s || '')
    // Strip HTML comments FIRST — Outlook/MSO conditional comments
    // (<!--[if gte mso]>…<![endif]-->) wrap markup like
    // <o:PixelsPerInch>96</o:PixelsPerInch>, whose text ("96") otherwise
    // leaks into the excerpt once the surrounding tags are removed.
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Drop zero-width / invisible chars email tools use as preheader padding
    // (͏ U+034F, ‌‍ U+200C/D, U+200B, U+FEFF, soft hyphen U+00AD).
    .replace(/[​-‍﻿͏­]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// A logo/header image we do NOT want as a blog-card image — the site logo or the
// Mailchimp-hosted Livable Telluride logo reused across every newsletter header.
function isLogoImage(url) {
  if (!url) return true;
  const u = String(url).toLowerCase();
  return u.includes('234a1ccb-fc9c-7aab-8d5f-dab36d775b79') ||  // Mailchimp-hosted Livable logo
         u.includes('/logo/') ||
         u.includes('livable%20telluride%20logo') ||
         u.includes('livable-telluride-logo') ||
         /\blogo\b/.test(u);
}

// Pull the best image out of the newsletter HTML: prefer the first INTERIOR
// (content) image over the logo/header. Falls back to the first image only when
// no interior image exists.
function firstImageFromHtml(html) {
  if (!html) return '';
  // Mailchimp emails are heavy on tracking pixels and email-client compat
  // images, so we filter out 1x1 / sprite / boilerplate images.
  const re = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m, firstAny = '';
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (!url) continue;
    if (/(spacer|tracking|pixel|1x1|open\.gif|empty\.gif|transparent)/i.test(url)) continue;
    if (url.startsWith('data:')) continue;
    if (!firstAny) firstAny = url;
    if (!isLogoImage(url)) return url;   // first non-logo (interior) image wins
  }
  return firstAny;                        // fallback: first image (may be a logo)
}

// The recurring digest emails (weekly "Week Ahead Outlook", "Weekend Update /
// Outlook", and the RSS "Posts from Livable Telluride for …") should NOT appear
// on the public blog — only manually-authored newsletters do.
function isDigestTitle(t) {
  if (!t) return false;
  return /^Posts from Livable Telluride for /i.test(t) ||
         /Daily Digest|Weekly Digest|Daily Update|Weekly Update/i.test(t) ||
         /\bWeek Ahead\b/i.test(t) ||
         /\bWeekend\s+(Update|Outlook|Digest)\b/i.test(t);
}

const BLOG_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// Fetch a URL's HTML with a timeout; return '' on any failure.
async function fetchHtml(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': BLOG_UA }, signal: ctl.signal });
    if (!r.ok) return '';
    return await r.text();
  } catch (e) { return ''; }
  finally { clearTimeout(t); }
}

async function syncBroadcastBlog(existingPosts) {
  // 1. Prune any digest-titled post regardless of source — keeps the blog to
  //    real newsletters (removes the weekly "Week Ahead" / "Weekend" digests,
  //    including the customerio-sourced ones the old code left behind).
  let posts = existingPosts.filter((p) => {
    if (p && isDigestTitle(p.title)) { console.log(`  Pruning digest from blog: ${p.title}`); return false; }
    return true;
  });

  // 2. Add any not-yet-listed sent broadcast that ISN'T a digest.
  let sent = [];
  try {
    sent = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'sent-broadcasts.json'), 'utf8'));
  } catch (e) { sent = []; }
  if (Array.isArray(sent) && sent.length) {
    const haveHref = new Set(posts.map((p) => p && p.href));
    const additions = [];
    for (const b of sent) {
      if (!b || !b.href || haveHref.has(b.href)) continue;
      if (isDigestTitle(b.subject)) { console.log(`  Skipping digest broadcast: ${b.subject}`); continue; }
      additions.push({
        title:    String(b.subject || 'Newsletter'),
        date:     String(b.date || ''),
        href:     String(b.href),
        image:    'https://livabletelluride.org/logo/Livable%20Telluride%20Logo.png',
        excerpt:  String(b.excerpt || ''),
        category: 'Newsletter',
        source:   'customerio',
      });
      haveHref.add(b.href);
    }
    posts = [...additions, ...posts];  // sent-broadcasts.json is newest-first
  }

  // 3. Enrich: for posts whose card image is the logo (or missing), pull the first
  //    INTERIOR image + a clean excerpt. Fixes the logo-instead-of-content image
  //    and the MSO-comment "96" / CSS leaks in old excerpts. Idempotent (once a
  //    real image is set it's skipped) and never touches hand-curated posts (they
  //    have real images). The Mailchimp archive RSS feed still serves the CLEAN
  //    campaign body for legacy mailchimp posts — far better than the mailchi.mp
  //    PAGE, which wraps the body in archive chrome (share links, language menu).
  const needEnrich = posts.filter((p) => p && p.href && /^https?:\/\//i.test(p.href) && (!p.image || isLogoImage(p.image)));
  if (needEnrich.length) {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const feedByHref = new Map(), feedByTitle = new Map();
    const feedText = await fetchHtml('https://us15.campaign-archive.com/feed?u=5d9192289b9af78822f2f69bf&id=f83dc56387');
    if (feedText) {
      for (const chunk of feedText.split(/<item>/).slice(1)) {
        const link = ((chunk.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
        const title = ((chunk.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        const desc = ((chunk.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '').replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
        if (link) feedByHref.set(link, desc);
        if (title) feedByTitle.set(norm(title), desc);
      }
    }
    for (const p of needEnrich) {
      const desc = feedByHref.get(p.href) || feedByTitle.get(norm(p.title));
      if (desc) {
        const img = firstImageFromHtml(desc);
        if (img && !isLogoImage(img)) { p.image = img; }
        const text = htmlToText(desc).slice(0, 400);
        if (text) p.excerpt = text;
        console.log(`  Enriched from feed: ${p.title}`);
      } else {
        // Not in the mailchimp feed (e.g. a Customer.io newsletter) — fetch the
        // page for an interior image; keep the existing excerpt (page text may
        // carry archive chrome).
        const img = firstImageFromHtml(await fetchHtml(p.href));
        if (img && !isLogoImage(img)) { p.image = img; console.log(`  Interior image (page): ${p.title}`); }
      }
    }
  }
  return posts;
}

// ══════════════════════════════════════════════════════════════
// ── Task 7: Telluride Humane Society Adoptable Animals ──
// ══════════════════════════════════════════════════════════════
// Fetches the Shelterluv API for organization GID 36337 (Telluride
// Humane Society) and emits the current dogs + cats listings.
// Called from main() after Task 6.

const SHELTERLUV_GID = 36337;
const SHELTERLUV_API = `https://www.shelterluv.com/api/v3/available-animals/${SHELTERLUV_GID}`;

// Staggering rules (per user, 2026-05-26):
//
// 1. The day an animal is FIRST SEEN on Shelterluv, it appears on
//    Local News with photo + description + link to its profile page.
// 2. Each card stays visible until either (a) 30 days have elapsed
//    since its reveal date OR (b) the animal is no longer listed on
//    Shelterluv (= adopted or otherwise removed) — whichever comes
//    first.
// 3. If multiple animals of the same species are first-seen on the
//    same day, only ONE appears immediately; the next is queued for
//    2 days later, the next 2 days after that, etc. Dogs and cats
//    are independent queues so they don't compete with each other.
//
// Implementation: HUMANE_SOCIETY_ANIMALS entries now carry three
// scheduling fields the renderer reads:
//   - firstSeen   ISO date the bot first observed this animal in the API
//   - revealDate  ISO date the card becomes eligible to render (today
//                 for the first new-of-its-species, +2/+4/+6 days for
//                 same-day siblings, or pushed further out if an
//                 existing queued sibling is still pending)
//   - lastSeen    ISO date of the most recent API tick that returned
//                 this animal (used to detect "still listed" — if
//                 lastSeen falls behind today by a full refresh
//                 cycle it means the animal is gone from Shelterluv
//                 and the entry gets dropped)
//
// The state machine is implemented inside syncHumaneSocietyAnimals
// rather than in the renderer so the schedule is computed exactly
// once per refresh tick (=  deterministic across cache busters and
// across the two cards rendering on Local News + the future digest).
function _addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function syncHumaneSocietyAnimals(existingAnimals) {
  console.log('\n🐾 Task 7: Syncing Telluride Humane Society adoptable animals...');
  const carry = Array.isArray(existingAnimals) ? existingAnimals : [];
  let resp;
  try {
    resp = await fetch(SHELTERLUV_API);
  } catch (e) {
    console.warn(`  Fetch error: ${e.message} — preserving existing list`);
    return carry;
  }
  if (!resp || resp.status !== 200) {
    console.warn(`  Shelterluv API HTTP ${resp ? resp.status : 'no response'} — preserving existing list`);
    return carry;
  }
  let payload;
  try {
    payload = JSON.parse(resp.text);
  } catch (e) {
    console.warn(`  JSON parse error: ${e.message} — preserving existing list`);
    return carry;
  }
  // Endpoint returns either { animals: [...] } or a bare array. Normalize.
  const arr = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.animals) ? payload.animals : []);
  console.log(`  Shelterluv returned ${arr.length} adoptable animal(s)`);

  // ── Parse the current API response into our internal shape ──
  const apiAnimals = [];
  for (const a of arr) {
    if (!a) continue;
    const id = String(a.uniqueId || a.nid || a.id || '').trim();
    let name = (a.name || '').trim();
    const species = (a.species || '').trim();
    if (!id || !name || (species !== 'Dog' && species !== 'Cat')) continue;
    // The shelter encodes adoption status in the NAME field, e.g.
    // "ADOPTION PENDING! Frankie", "ADOPTED - Rex", "ON HOLD: Chloe".
    // Animals carrying any such marker are not actually available, so the
    // "adoptable dog/cat at Telluride Humane Society" card would be wrong.
    // Skip them. (Strip a leading marker too, as belt-and-suspenders, in
    // case the shelter ever leaves a clean-but-prefixed name.)
    const UNAVAILABLE_NAME = /\b(adoption\s+pending|adopted|on\s+hold|pending\s+adoption|not\s+available|coming\s+soon|in\s+foster|foster\s+only)\b/i;
    if (UNAVAILABLE_NAME.test(name)) continue;
    name = name.replace(/^\s*(adoption\s+pending!?|adopted|on\s+hold|pending)\s*[-:!]*\s*/i, '').trim();
    if (!name) continue;
    // Photos are objects ({id, name, url, isCover, ...}). Pull the URL
    // from the cover photo if present, else the first one.
    const photos = Array.isArray(a.photos) ? a.photos : [];
    let photo = '';
    if (photos.length > 0) {
      const cover = photos.find(p => p && p.isCover) || photos[0];
      photo = (cover && cover.url) || (typeof cover === 'string' ? cover : '');
    }
    // No real photo → the card falls back to the THS logo, which looks
    // like a broken/placeholder card. Require a genuine animal photo.
    if (!photo) continue;
    // age_group is an object — pull its .name field (e.g. "Young Dog")
    const ageGroupName = (a.age_group && typeof a.age_group === 'object')
      ? (a.age_group.name || '')
      : (typeof a.age_group === 'string' ? a.age_group : '');
    // Pre-weaning animals ("Unweaned"/"Nursing") aren't yet adoptable —
    // they're in the system but shouldn't be advertised as available.
    if (/^(unweaned|nursing)$/i.test(ageGroupName.trim())) continue;
    const breed = [a.breed, a.secondary_breed].filter(Boolean).join(' / ').trim();
    const summaryParts = [];
    if (ageGroupName) summaryParts.push(ageGroupName);
    if (breed) summaryParts.push(breed);
    if (a.sex) summaryParts.push(a.sex);
    const summary = summaryParts.join(' • ');
    apiAnimals.push({
      id, name, species, breed,
      ageGroup: ageGroupName,
      sex: a.sex || '',
      photo,
      profileUrl: a.public_url || '',
      summary,
    });
  }
  const apiById = new Map(apiAnimals.map(a => [a.id, a]));

  // ── Pass 1: carry forward existing animals that are still listed ──
  // Refresh photo/breed/summary in case the shelter updated them, but
  // KEEP the immutable scheduling fields (firstSeen, revealDate).
  // Drop animals that disappeared from the API (= adopted/removed) and
  // animals whose 30-day window has elapsed.
  const today = new Date().toISOString().slice(0, 10);
  const dropBefore = _addDays(today, -30);
  const out = [];
  for (const ex of carry) {
    if (!ex || !ex.id) continue;
    const fresh = apiById.get(ex.id);
    if (!fresh) continue;                                  // no longer listed
    if (ex.revealDate && ex.revealDate < dropBefore) continue; // > 30 days old
    out.push({
      ...fresh,
      firstSeen:  ex.firstSeen  || today,
      revealDate: ex.revealDate || today,
      lastSeen:   today,
    });
  }

  // ── Pass 2: add brand-new animals with staggered reveal dates ──
  // Dogs and cats are independent queues. For each species:
  //   1. Find the latest revealDate among the existing same-species
  //      animals we're carrying forward.  If that's in the future
  //      (= an already-queued sibling hasn't shown yet), the first
  //      newcomer is scheduled for that revealDate + 2 days — so
  //      newcomers chain neatly onto the existing queue instead of
  //      crowding the visible window.
  //   2. If everything existing has already been revealed, the first
  //      newcomer reveals TODAY (i.e. immediately).
  //   3. Each subsequent newcomer in the same batch gets +2 days.
  const carriedIds = new Set(out.map(a => a.id));
  const newcomers = apiAnimals.filter(a => !carriedIds.has(a.id));

  function stagger(species, batch) {
    if (batch.length === 0) return [];
    const sameSpecies = out.filter(a => a.species === species);
    let firstReveal = today;
    if (sameSpecies.length > 0) {
      const latestReveal = sameSpecies.reduce(
        (m, a) => (a.revealDate > m ? a.revealDate : m), ''
      );
      // Any same-species entry whose revealDate is in the future means
      // there's still a queue ahead of us. Chain onto it +2 days.
      if (latestReveal > today) {
        firstReveal = _addDays(latestReveal, 2);
      }
    }
    return batch.map((a, i) => ({
      ...a,
      firstSeen:  today,
      revealDate: i === 0 ? firstReveal : _addDays(firstReveal, i * 2),
      lastSeen:   today,
    }));
  }

  const newDogs = stagger('Dog', newcomers.filter(a => a.species === 'Dog'));
  const newCats = stagger('Cat', newcomers.filter(a => a.species === 'Cat'));
  out.push(...newDogs, ...newCats);

  // ── Reporting ──
  const dogs = out.filter(a => a.species === 'Dog').length;
  const cats = out.filter(a => a.species === 'Cat').length;
  const visibleToday = out.filter(a => a.revealDate <= today).length;
  const queued = out.length - visibleToday;
  if (newcomers.length > 0) {
    console.log(`  ${newcomers.length} new animal(s) ingested (${newDogs.length} dogs / ${newCats.length} cats)`);
    if (newDogs.length > 1 || newCats.length > 1) {
      const dogQueue = newDogs.map(d => `${d.name} ${d.revealDate}`).join(', ');
      const catQueue = newCats.map(c => `${c.name} ${c.revealDate}`).join(', ');
      if (dogQueue) console.log(`    Dog reveal queue: ${dogQueue}`);
      if (catQueue) console.log(`    Cat reveal queue: ${catQueue}`);
    }
  }
  console.log(`  ${out.length} tracked total (${dogs} dogs, ${cats} cats); ${visibleToday} visible today, ${queued} queued for future reveal`);
  return out;
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

// ── Task 16: Ouray/Ridgway Events (Localist RSS feed) ──
// Switched 2026-07-09 from the /api/2 JSON API to the calendar RSS feed
// (calendar/1.xml) — the Ouray/Ridgway team's official/blessed feed, so our
// automated pulls can be allow-listed instead of mimicking a browser. Routed
// through the proxy (host is in PROXY_HOSTS). Recurring events appear as one
// <item> per instance sharing the same <link>; we collapse by link into a
// first→last span (the client routes multi-day/recurring to the Recurring calendar).
const ORE_RSS_URL = 'https://events.ourayridgwayevents.com/calendar/1.xml';

// Unescape CDATA + the handful of XML entities Localist emits.
function decodeXmlText(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function syncOurayRidgwayEvents() {
  console.log('\n🏔  Task 16: Syncing Ouray/Ridgway events (Localist RSS)...');
  let xml;
  try {
    const resp = await fetch(ORE_RSS_URL);
    if (!resp || resp.status !== 200 || !resp.text) {
      console.warn(`  Ouray/Ridgway RSS HTTP ${resp ? resp.status : 'no response'}`);
      return null;
    }
    xml = resp.text;
  } catch (e) {
    console.warn(`  Ouray/Ridgway RSS fetch error: ${e.message}`);
    return null;
  }

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  if (items.length === 0) {
    console.log('  No <item> entries in the Ouray/Ridgway RSS feed');
    return [];
  }
  const field = (block, tag) => {
    const m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
    return m ? m[1].trim() : '';
  };

  const now = Date.now();
  const horizon = now + 60 * 86400000;
  // Collapse recurring/multi-day events: Localist lists one <item> per instance,
  // all sharing the event's <link>. Key by link, widen [start→end] across the
  // in-window instances, so an every-Tue/Thu class becomes ONE spanned row.
  const byLink = new Map();
  let skippedGov = 0, skippedPast = 0, skippedFar = 0;

  for (const it of items) {
    // RSS <title> = "Mon D, YYYY: Event Title at Venue". Strip the date prefix,
    // then peel the trailing " at <Venue>" into a location (Localist convention).
    const rawTitle = decodeXmlText(field(it, 'title')).replace(/\s+/g, ' ').trim();
    let title = rawTitle.replace(/^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}:\s*/, '').trim();
    let location = '';
    const lastAt = title.lastIndexOf(' at ');
    if (lastAt > 0) { location = title.slice(lastAt + 4).trim(); title = title.slice(0, lastAt).trim(); }
    if (!title) continue;

    if (GOV_MEETING_PATTERN_NODE.test(title)) { skippedGov++; continue; }
    // Permanently hidden niche events (per user 2026-06-15) — mirror of the
    // EXCLUDED_EVENTS list in events.html; keep the two in sync.
    if (/wright opera house guided tour|ridgway railroad museum|free train ride|summer bingo|ultimate frisbee/i.test(title)) continue;

    // <dc:date> is the event START (ISO w/ tz); pubDate mirrors it.
    const start = new Date(field(it, 'dc:date') || field(it, 'pubDate'));
    if (isNaN(start.getTime())) continue;
    const ms = start.getTime();
    if (ms < now - 86400000) { skippedPast++; continue; }
    if (ms > horizon) { skippedFar++; continue; }

    const link = decodeXmlText(field(it, 'link')) || 'https://events.ourayridgwayevents.com/';
    if (byLink.has(link)) {
      const g = byLink.get(link);
      if (ms < g.startMs) g.startMs = ms;
      if (ms > g.endMs) g.endMs = ms;
      continue;
    }
    let desc = decodeXmlText(field(it, 'description')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^https?:\/\/\S+$/.test(desc)) desc = '';
    desc = smartTruncate(stripDescPreamble(desc), EVENT_DESC_MAX);
    const img = it.match(/<media:content[^>]*url=['"]([^'"]+)['"]/);
    byLink.set(link, {
      title, link, description: desc,
      startMs: ms, endMs: ms, location,
      imageUrl: img ? img[1] : ''
    });
  }

  const events = [];
  for (const g of byLink.values()) {
    const startISO = new Date(g.startMs).toISOString();
    const startDay = startISO.slice(0, 10);
    const endDay = new Date(g.endMs).toISOString().slice(0, 10);
    events.push({
      title: g.title,
      link: g.link,
      description: g.description,
      pubDate: startISO,
      endDate: endDay !== startDay ? endDay : undefined,
      source: 'oray',
      sourceLabel: 'Ouray Ridgway Calendar',
      category: 'Community Event',
      location: g.location,
      imageUrl: g.imageUrl
    });
  }
  events.sort((a, b) => a.pubDate.localeCompare(b.pubDate));
  console.log(`  Ouray/Ridgway: ${events.length} events (RSS; collapsed by link; ${skippedPast} past, ${skippedFar} >60d, ${skippedGov} gov skipped)`);
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
    // Tribe API returns "YYYY-MM-DD HH:MM:SS" in the site's local TZ (Mountain
    // for KOTO). Parsing with `new Date()` on the bot's UTC runner would
    // interpret it as UTC — a 7:30 PM MDT concert would store 19:30Z and then
    // render as 1:30 PM MDT on the events page. Construct in MT explicitly.
    const _sm = startStr.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    const start = _sm
      ? mtMoment(+_sm[1], +_sm[2] - 1, +_sm[3], +_sm[4], +_sm[5])
      : new Date(startStr);
    if (isNaN(start.getTime())) continue;
    const endStr = e.end_date || startStr;
    const _em = endStr.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    const end = _em
      ? mtMoment(+_em[1], +_em[2] - 1, +_em[3], +_em[4], +_em[5])
      : new Date(endStr);
    if (!isNaN(end.getTime()) && end.getTime() < now) continue;
    if (start.getTime() > horizon) continue;
    const description = smartTruncate(decodeHtmlEntities(
      String(e.description || e.excerpt || '').replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' '), EVENT_DESC_MAX);
    let imageUrl = '';
    if (e.image && typeof e.image === 'object' && e.image.url) imageUrl = e.image.url;
    else if (typeof e.image === 'string') imageUrl = e.image;
    // koto.org/wp-content serves Cross-Origin-Resource-Policy: same-origin, so
    // browsers block the hotlink on our pages — don't store an image that can
    // never render (consumers fall back to category art). 2026-07-22 review.
    if (/koto\.org\/wp-content/i.test(imageUrl)) imageUrl = '';
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
    // Parse "From" datetime ("8:00 AM Friday, May 1, 2026" -> Date in MT).
    // LibCal renders times in the library's local TZ (Mountain); parsing with
    // `new Date()` on the bot's UTC runner would treat 8:00 AM as 8:00 UTC =
    // 2:00 AM MDT. Construct explicitly in MT via mtMoment.
    let fromDate;
    {
      const wm = fromStr.match(/^(\d{1,2}):(\d{2})\s*([AP])M\s+\w+,\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
      if (!wm) continue;
      let h = parseInt(wm[1], 10);
      const min = parseInt(wm[2], 10);
      if (/P/i.test(wm[3]) && h < 12) h += 12;
      if (/A/i.test(wm[3]) && h === 12) h = 0;
      const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
        .indexOf(wm[4].toLowerCase().slice(0, 3));
      if (monthIdx < 0) continue;
      fromDate = mtMoment(parseInt(wm[6], 10), monthIdx, parseInt(wm[5], 10), h, min);
    }
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


// ══════════════════════════════════════════════════════════════
// ── Task 10b: Sheridan Opera House events ──
// ══════════════════════════════════════════════════════════════
//
// Source: https://sheridanoperahouse.com/events/
// Platform: WordPress + Modern Events Calendar Lite (MEC) by Webnus.
//
// The /events/ landing page only renders the next ~3 upcoming events
// — that's the listing MEC is configured to show on this site. MEC's
// REST endpoints (/wp-json/mec/v1/events) return empty without
// auth, and the generic WP REST endpoint (/wp-json/wp/v2/mec-events)
// returns 333 lifetime events but no event-date metadata (MEC stores
// it in postmeta which isn't whitelisted on this site). So we parse
// the public listing HTML instead, which is plenty since Sheridan
// curates what they advertise.
//
// HTML shape per event (one mec-event-list block per show):
//   <div class="mec-event-image"><a href="<event-permalink>" ...>
//     <img src="<thumb>" ...></a></div>
//   <div class="mec-event-date mec-color"><i></i>
//     <span class="mec-start-date-label">Jun 13 2026</span></div>     ← single day
//   <div class="mec-event-date mec-color"><i></i>
//     <span class="mec-start-date-label">Jun 01 - 05 2026</span></div> ← multi-day
//   <div class="mec-event-time mec-color"></div>                     ← usually empty
//   <h4 class="mec-event-title"><a ...>Event Title</a></h4>
//
// Multi-day events get ONE card on their start date (per the
// "multi-day events first day only" memory note); endDate is set so
// events.html renders "Jun 1 — Jun 5".

const SHERIDAN_EVENTS_URL = 'https://sheridanoperahouse.com/events/';

const MONTH_ABBR = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Parse "Jun 13 2026" → { startDate: '2026-06-13', endDate: '2026-06-13' }
// Parse "Jun 01 - 05 2026" → { startDate: '2026-06-01', endDate: '2026-06-05' }
// Parse "Jun 28 - Jul 02 2026" (cross-month) → { startDate: '2026-06-28', endDate: '2026-07-02' }
function parseSheridanDate(label) {
  if (!label) return null;
  const s = String(label).trim();
  // Single-day:  "Jun 13 2026"
  let m = s.match(/^(\w{3})\s+(\d{1,2})\s+(\d{4})$/i);
  if (m) {
    const mon = MONTH_ABBR[m[1].toLowerCase()];
    if (mon == null) return null;
    const iso = `${m[3]}-${String(mon + 1).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
    return { startDate: iso, endDate: iso };
  }
  // Same-month range:  "Jun 01 - 05 2026"
  m = s.match(/^(\w{3})\s+(\d{1,2})\s*-\s*(\d{1,2})\s+(\d{4})$/i);
  if (m) {
    const mon = MONTH_ABBR[m[1].toLowerCase()];
    if (mon == null) return null;
    const monStr = String(mon + 1).padStart(2, '0');
    return {
      startDate: `${m[4]}-${monStr}-${String(parseInt(m[2], 10)).padStart(2, '0')}`,
      endDate:   `${m[4]}-${monStr}-${String(parseInt(m[3], 10)).padStart(2, '0')}`,
    };
  }
  // Cross-month range:  "Jun 28 - Jul 02 2026"
  m = s.match(/^(\w{3})\s+(\d{1,2})\s*-\s*(\w{3})\s+(\d{1,2})\s+(\d{4})$/i);
  if (m) {
    const mon1 = MONTH_ABBR[m[1].toLowerCase()];
    const mon2 = MONTH_ABBR[m[3].toLowerCase()];
    if (mon1 == null || mon2 == null) return null;
    return {
      startDate: `${m[5]}-${String(mon1 + 1).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`,
      endDate:   `${m[5]}-${String(mon2 + 1).padStart(2, '0')}-${String(parseInt(m[4], 10)).padStart(2, '0')}`,
    };
  }
  return null;
}

function parseSheridanEvents(html) {
  if (!html) return [];
  // Split on the event-image marker so each chunk is exactly one event.
  // MEC's list-classic skin renders each event as:
  //   <div class="mec-event-image"><a href="..."><img src="..."></a></div>
  //   <div class="mec-event-date"><span class="mec-start-date-label">…</span></div>
  //   <div class="mec-event-time"></div>
  //   <h4 class="mec-event-title"><a href="..." data-event-id="...">…</a></h4>
  // The image div is a clean boundary. Earlier "scan around the date span"
  // strategy mis-attributed images because adjacent events sit within the
  // 3000-char window and .match() returned the FIRST hit instead of the
  // event-local one.
  const chunks = html.split(/<div class="mec-event-image">/).slice(1);
  const events = [];
  for (const chunk of chunks) {
    const block = chunk.slice(0, 6000); // each event block fits comfortably
    // Image
    let imageUrl = '';
    const imgMatch = block.match(/<a[^>]*>[^<]*<img[^>]*src="([^"]+)"/);
    if (imgMatch) {
      // Strip WP's "-150x150" size suffix so we get a higher-res thumb.
      imageUrl = imgMatch[1].replace(/-\d+x\d+(\.\w+)$/, '$1');
    }
    // Date label
    const dateMatch = block.match(/<span class="mec-start-date-label">([^<]+)<\/span>/);
    if (!dateMatch) continue;
    const dateLabel = decodeHtmlEntities(dateMatch[1].trim());
    const dates = parseSheridanDate(dateLabel);
    if (!dates) continue;
    // Title + link
    const titleMatch = block.match(/<h4 class="mec-event-title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    if (!titleMatch) continue;
    const link = titleMatch[1];
    const title = decodeHtmlEntities(titleMatch[2].trim());
    if (!title || !link) continue;
    events.push({
      title, link, imageUrl, dateLabel,
      startDate: dates.startDate,
      endDate:   dates.endDate,
    });
  }
  return events;
}

async function syncSheridanEvents() {
  console.log('\n🎭 Task 10b: Syncing Sheridan Opera House events...');
  let resp;
  try { resp = await fetch(SHERIDAN_EVENTS_URL); }
  catch (e) { console.warn(`  Fetch error: ${e.message}`); return null; }
  if (!resp || resp.status !== 200) {
    console.warn(`  Sheridan HTTP ${resp ? resp.status : 'no response'}`);
    return null;
  }
  const parsed = parseSheridanEvents(resp.text);
  console.log(`  Listing has ${parsed.length} event block(s)`);
  // Filter to next 60 days (forward window, matching events.html's
  // render filter so we don't waste storage on items the client drops).
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const horizon = now.getTime() + 60 * 86400000;
  const events = [];
  for (const p of parsed) {
    const startMs = new Date(p.startDate + 'T00:00:00').getTime();
    if (isNaN(startMs)) continue;
    if (startMs < now.getTime() - 86400000) continue;  // already past
    if (startMs > horizon) continue;                    // beyond 60 days
    events.push({
      title:       p.title,
      link:        p.link,
      // Sheridan's listing page has no per-event blurb. Leave description
      // empty so syncEventDescriptions() (the Rick generator at the end of
      // main()) fills it with a real Rick-voice summary based on the
      // title + venue. Better than shipping the same generic boilerplate
      // for every show.
      description: '',
      pubDate:     p.startDate,
      endDate:     p.endDate !== p.startDate ? p.endDate : undefined,
      source:      'sheridan',
      sourceLabel: 'Sheridan Opera House',
      category:    'Concert / Performance',
      location:    'Sheridan Opera House • Telluride, CO',
      imageUrl:    p.imageUrl || '',
    });
  }
  // Sort ascending by start date
  events.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
  console.log(`  Kept ${events.length} Sheridan event(s) within 60 days`);
  return events;
}


// ══════════════════════════════════════════════════════════════
// ── Task 10c: The Alibi Telluride (Event Calendar App API) ──
// ══════════════════════════════════════════════════════════════
//
// Alibi is a Squarespace site, but their NATIVE Squarespace events
// collection is dormant (last update October 2023). The live shows
// are served by Event Calendar App (eventcalendarapp.com), embedded
// on /calendar via a div with calendar_id=14036 and a widget UUID.
// The widget JS hits api.eventcalendarapp.com/events?id=…&widgetUuid=…
// and we hit the same URL directly.
//
// Each event has: summary (title), shortDescription, image, friendlyUrl,
// timezoneStart / timezoneEnd (no-TZ ISO in venue's local time, i.e. MT),
// utcStartTime / utcEndTime (epoch seconds).
//
// Link policy: we link back to the Alibi's own page with the event's
// hash fragment, so the user lands at alibitelluride.com (not the
// third-party widget host) with the event modal pre-opened:
//   https://www.alibitelluride.com/calendar#eca-event=<friendlyUrl>

const ALIBI_ECA_URL =
  'https://api.eventcalendarapp.com/events' +
  '?id=14036&widgetUuid=bd9b821e-5a19-48b2-8c28-3dd0b4718bc1';

async function syncAlibiEvents() {
  console.log('\n🎸 Task 10c: Syncing The Alibi events (Event Calendar App)...');
  let resp;
  try { resp = await fetch(ALIBI_ECA_URL); }
  catch (e) { console.warn(`  ECA fetch error: ${e.message}`); return null; }
  if (!resp || resp.status !== 200) {
    console.warn(`  ECA HTTP ${resp ? resp.status : 'no response'}`);
    return null;
  }
  let data;
  try { data = JSON.parse(resp.text); }
  catch (e) { console.warn(`  ECA JSON parse error: ${e.message}`); return null; }
  const all = (data && Array.isArray(data.events)) ? data.events : [];
  console.log(`  ECA returned ${all.length} event(s) total`);

  const now = Date.now();
  const horizon = now + 60 * 86400000;
  const events = [];
  for (const e of all) {
    if (!e || !e.summary) continue;
    const utc = (typeof e.utcStartTime === 'number') ? e.utcStartTime * 1000 : null;
    if (utc == null) continue;
    if (utc < now - 86400000) continue;  // already past
    if (utc > horizon) continue;          // beyond 60 days
    // timezoneStart is the no-TZ ISO in MT — date portion is what events.html
    // wants for the calendar bucket; time portion goes in the separate `time`.
    const tzStart = String(e.timezoneStart || '');
    const dateStr = tzStart.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
    let timeStr = '';
    const tm = tzStart.match(/T(\d{2}):(\d{2})/);
    if (tm) {
      const h = parseInt(tm[1], 10);
      const m = tm[2];
      const hr12 = ((h + 11) % 12) + 1;
      timeStr = `${hr12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
    }
    const desc = smartTruncate(
      decodeHtmlEntities(String(e.shortDescription || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
      EVENT_DESC_MAX
    ) || 'Live music at The Alibi.';
    events.push({
      title:       decodeHtmlEntities(e.summary).trim(),
      link:        `https://www.alibitelluride.com/calendar#eca-event=${e.friendlyUrl || ''}`,
      description: desc,
      pubDate:     dateStr,
      time:        timeStr,
      source:      'alibi',
      sourceLabel: 'The Alibi',
      category:    'Live Music',
      location:    'The Alibi • Telluride, CO',
      imageUrl:    e.image || e.thumbnail || '',
    });
  }
  events.sort((a, b) => a.pubDate.localeCompare(b.pubDate));
  console.log(`  Kept ${events.length} Alibi event(s) within 60 days`);
  return events;
}


// ══════════════════════════════════════════════════════════════
// ── Per-event source/link overrides (hand-maintained corrections) ──
// Some scraped events carry the wrong producer or a dead link. First matching
// rule wins; applied by the Norwood + telluride.com builders before returning.
// Music on the Mesa (per NPRD email, 2026-07-20): the norwoodtown.com sitemap
// pages are empty and the Town is only a presenting sponsor — Norwood Park &
// Recreation District produces the series and submits it to calendars.
const EVENT_SOURCE_OVERRIDES = [
  { match: /music on the mesa/i,
    sourceLabel: 'Norwood Park & Recreation District',
    link: 'https://www.norwoodparkandrec.org/music-on-the-mesa-2026' },
];
function applyEventOverrides(events) {
  for (const ev of events || []) {
    const rule = EVENT_SOURCE_OVERRIDES.find(r => r.match.test(ev.title || ''));
    if (!rule) continue;
    if (rule.sourceLabel) ev.sourceLabel = rule.sourceLabel;
    if (rule.link) {
      if ('link' in ev) ev.link = rule.link;   // RSS-shaped records
      if ('href' in ev) ev.href = rule.link;   // href-shaped records
    }
  }
  return events;
}

// ── Task 19 (REPLACED): Telluride.com fcEventsData parser ──
// ══════════════════════════════════════════════════════════════
//
// Old strategy (still callable as syncTellurideComEventsLegacy below)
// hit the sitemap, extracted ~300 /event/<slug> URLs, fetched each
// page, and parsed JSON-LD Event schemas. That worked but ran 300+
// HTTP requests every 6 hours — slow and a noisy neighbor.
//
// New strategy: telluride.com/festivals-events/events/ ships ALL
// events inline as `window.fcEventsData=[…]` — a 410-element array
// with start, end, url, title HTML, eventContent (tooltip with
// <img src=…>), and color. One request, dozens of events.

const TELLURIDE_COM_EVENTS_URL = 'https://www.telluride.com/festivals-events/events/';

async function syncTelluridComEventsFast() {
  console.log('\n🎪 Task 19: Syncing Telluride.com events (fcEventsData)...');
  let resp;
  try { resp = await fetch(TELLURIDE_COM_EVENTS_URL); }
  catch (e) { console.warn(`  telluride.com fetch error: ${e.message}`); return null; }
  if (!resp || resp.status !== 200) {
    console.warn(`  telluride.com HTTP ${resp ? resp.status : 'no response'}`);
    return null;
  }
  const html = resp.text || '';
  const m = html.match(/fcEventsData\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) {
    console.warn('  fcEventsData array not found in HTML — page layout may have changed');
    return null;
  }
  let arr;
  try { arr = JSON.parse(m[1]); }
  catch (e) { console.warn(`  fcEventsData parse error: ${e.message}`); return null; }
  console.log(`  fcEventsData has ${arr.length} entries`);

  const todayMs = Date.now();
  const today = new Date(todayMs); today.setUTCHours(0, 0, 0, 0);
  const horizon = today.getTime() + 60 * 86400000;
  // Group rows by event URL. FullCalendar lists a recurring series (e.g.
  // "Games on the Green", Sat–Thu all summer) as one row PER occurrence date,
  // so emitting each row as its own card floods the grid with ~18 single-day
  // cards. Collapse each series into ONE entry spanning first→last date: the
  // renderer then shows a single date-range card, or — for spans ≥ 7 days —
  // routes it to the "Ongoing Events" sidebar, where a season-long series
  // belongs. Single-occurrence events are unaffected (min === max).
  const byUrl = new Map();
  for (const e of arr) {
    if (!e || !e.start || !e.url) continue;
    const startMs = new Date(e.start + 'T00:00:00Z').getTime();   // start/end are YYYY-MM-DD
    if (isNaN(startMs)) continue;
    const endStr = (e.end && e.end !== e.start) ? e.end : e.start;
    let endMs = new Date(endStr + 'T00:00:00Z').getTime();
    if (isNaN(endMs)) endMs = startMs;
    let title = '';
    const tm = (e.title || '').match(/fc-event-title--link[^>]*>\s*<a[^>]*>([^<]+)</);
    if (tm) title = decodeHtmlEntities(tm[1]).trim();
    if (!title) continue;
    const link = (e.url || '').startsWith('http') ? e.url : 'https://www.telluride.com' + e.url;
    let g = byUrl.get(link);
    if (!g) {
      const imMatch = (e.eventContent || '').match(/<img[^>]+src="([^"]+)"/);
      let imageUrl = imMatch ? imMatch[1] : '';
      if (imageUrl && imageUrl.startsWith('/')) imageUrl = 'https://www.telluride.com' + imageUrl;
      let summary = '';
      const sm = (e.eventContent || '').match(/<p>([^<]+)</);
      if (sm) summary = decodeHtmlEntities(sm[1]).trim();
      summary = smartTruncate(summary, EVENT_DESC_MAX);
      byUrl.set(link, { title, link, description: summary, imageUrl, minMs: startMs, maxMs: endMs });
    } else {
      if (startMs < g.minMs) g.minMs = startMs;
      if (endMs   > g.maxMs) g.maxMs = endMs;
    }
  }
  const events = [];
  for (const g of byUrl.values()) {
    // Keep when the span overlaps the [today-1d, +60d] window. A series that
    // already started but runs past today still shows (start in the past is
    // fine — the renderer gates ongoing events on endDate).
    if (g.maxMs < today.getTime() - 86400000) continue;   // whole series already over
    if (g.minMs > horizon) continue;                       // starts more than 60 days out
    const startISO = new Date(g.minMs).toISOString().slice(0, 10);
    const endISO   = new Date(g.maxMs).toISOString().slice(0, 10);
    events.push({
      title:       g.title,
      link:        g.link,
      description: g.description,
      pubDate:     startISO,
      endDate:     endISO !== startISO ? endISO : undefined,
      source:      'telluride-com',
      sourceLabel: 'Telluride.com',
      category:    'Community Event',
      location:    'Telluride, CO',
      imageUrl:    g.imageUrl,
    });
  }
  events.sort((a, b) => a.pubDate.localeCompare(b.pubDate));
  console.log(`  Kept ${events.length} telluride.com event(s) within 60 days (recurring series collapsed by URL)`);
  return applyEventOverrides(events);
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
    if (!resp || resp.status !== 200) { console.warn(`  Nucla-Naturita Tribe API HTTP ${resp ? resp.status : 'no response'}`); return null; }
    const data = JSON.parse(resp.text);
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
    if (!resp || resp.status !== 200) { console.warn(`  Club Red HTTP ${resp ? resp.status : 'no response'}`); return null; }
    const data = JSON.parse(resp.text);
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
    if (!resp || resp.status !== 200) { console.warn(`  Fresh Food Hub Tribe API HTTP ${resp ? resp.status : 'no response'}`); return null; }
    const data = JSON.parse(resp.text);
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
    if (!resp || resp.status !== 200) { console.warn(`  Sherbino Tribe API HTTP ${resp ? resp.status : 'no response'}`); return null; }
    const data = JSON.parse(resp.text);
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

// ── Task 22: Telluride Science events + Town Talks (Tribe Events JSON API) ──
// Covers BOTH https://telluridescience.org/events/ AND the /town-talks/ page:
// they're the same The Events Calendar entries (town talks carry the
// "Telluride Science Event" category and show on both pages), so this single
// Tribe API returns all of them. Verified 2026-06-15: the /events/ listing is
// 1:1 with the API; /town-talks/ adds only not-yet-published "Title TBD" talks,
// which flow in automatically once Telluride Science publishes them.
// Runs every refresh; emits the same shape as the hand-curated seed it replaces
// (link/description/time), so events.html's pushEvent reads it unchanged.
// Fetched direct (host doesn't block runner IPs); on any error returns null so
// the existing array carries forward instead of being wiped. per_page=100 is
// headroom (only ~10 are ever published at once).
const TELLURIDE_SCIENCE_TRIBE_API = 'https://telluridescience.org/wp-json/tribe/events/v1/events/?per_page=100&status=publish';

// "2026-06-16 18:30:00" -> "6:30 PM". The Tribe start/end strings are already
// in the venue-local timezone (America/Denver), so parse the clock components
// directly — do NOT new Date() them on a UTC runner.
function fmtTribeClock(s) {
  const m = String(s).match(/\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/);
  if (!m) return '';
  let h = parseInt(m[1], 10); const min = m[2];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${min} ${ap}`;
}

async function syncTellurideScienceEvents() {
  console.log('\n🔬 Task 22: Syncing Telluride Science events (Tribe API)...');
  let resp;
  try { resp = await fetch(TELLURIDE_SCIENCE_TRIBE_API); }
  catch (e) { console.warn('  Telluride Science fetch error:', e.message); return null; }
  // NOTE: the module-local fetch() returns { status, text, headers } — it has
  // no .ok and no .json(). Match the KOTO sync: gate on resp.status and parse
  // resp.text yourself.
  if (!resp || resp.status !== 200) {
    console.warn(`  Telluride Science Tribe API HTTP ${resp ? resp.status : 'no response'}`);
    return null;
  }
  let data;
  try { data = JSON.parse(resp.text); }
  catch (e) { console.warn('  Telluride Science JSON parse error:', e.message); return null; }
  const now = Date.now();
  const events = (data.events || [])
    .filter(ev => {
      if (!ev || !ev.start_date) return false;
      const t = new Date(ev.start_date.replace(' ', 'T')).getTime();
      return !isNaN(t) && t >= now - 86400000;   // drop only past events
    })
    .map(ev => {
      const startClock = fmtTribeClock(ev.start_date);
      const endClock   = fmtTribeClock(ev.end_date);
      const time = (startClock && endClock) ? `${startClock} – ${endClock}` : (startClock || '');
      const venue = (ev.venue && ev.venue.venue) ? ev.venue.venue : '';
      const city  = (ev.venue && ev.venue.city)  ? ev.venue.city  : '';
      const location = venue
        ? (city ? `${venue}, ${city}` : `${venue}, Telluride`)
        : 'Telluride Innovation Center, 300 S. Townsend, Telluride';
      return {
        title:       decodeHtmlEntities(ev.title || ''),
        date:        ev.start_date.slice(0, 10),
        time,
        location,
        description: ev.description ? decodeHtmlEntities(
                       smartTruncate(ev.description.replace(/<[^>]+>/g, ''), EVENT_DESC_MAX)) : '',
        link:        ev.url || 'https://telluridescience.org/events/',
        imageUrl:    (ev.image && ev.image.url) ? ev.image.url : '',
        sourceLabel: 'Telluride Science',
      };
    });
  console.log(`  Telluride Science events: ${events.length} upcoming`);
  return events;
}

// ── TMDB movie posters for recurring-acts.json ──
// Movie series ("Movie Mondays" etc.) are curated into recurring-acts.json by the
// weekly recurring-acts-review with image:"" (the events page then shows the
// series logo). When the TMDB_API_KEY secret is set, fill those movie entries
// with the film's official poster from The Movie Database. Only touches
// movie-series entries whose image is EMPTY — never clobbers a hand-set image or
// a band photo — and skips entirely when the key is absent.
async function tmdbPosterUrl(title) {
  const key = process.env.TMDB_API_KEY;
  if (!key || !title) return '';
  try {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${key}&include_adult=false&query=${encodeURIComponent(title)}`;
    const resp = await fetch(url);
    if (!resp || resp.status !== 200) return '';
    const data = JSON.parse(resp.text);
    const hit = (data.results || []).find(r => r.poster_path);
    return hit ? ('https://image.tmdb.org/t/p/w500' + hit.poster_path) : '';
  } catch (e) { return ''; }
}
async function enrichRecurringActsPosters() {
  console.log('\n🎬 Task 23: TMDB posters for recurring-acts.json movies...');
  if (!process.env.TMDB_API_KEY) { console.log('  TMDB_API_KEY not set — skipping (movie cards keep the series logo).'); return; }
  const file = path.join(__dirname, '..', 'recurring-acts.json');
  let obj;
  try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.warn('  recurring-acts.json read/parse failed: ' + e.message); return; }
  const arr = Array.isArray(obj.series) ? obj.series : [];
  let changed = 0;
  for (const e of arr) {
    if (e.image) continue;                              // keep existing / hand-set images
    if (!/\bmovie\b/i.test(e.series || '')) continue;   // movie series only (e.g. "Movie Mondays")
    const film = String(e.title || '').split(':').slice(1).join(':').trim() || String(e.title || '');
    const poster = await tmdbPosterUrl(film);
    if (poster) { e.image = poster; changed++; console.log(`  ✓ ${film} → poster`); }
    else console.log(`  – ${film} → no TMDB poster found`);
  }
  if (changed) { fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n'); console.log(`  Filled ${changed} poster(s) in recurring-acts.json.`); }
  else console.log('  No movie posters to fill.');
}


// Task 10 removed — Telluride Foundation events are hand-curated (see above).


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
      // The site has used both attribute orders (aria-label…href and
      // href…aria-label) — match either, or agenda links silently vanish.
      const agendaRe = /aria-label="Agenda attachment for (\d{4}-\d{2}-\d{2}) [^"]*"[^>]*href="([^"]+)"/g;
      const agendaRe2 = /href="([^"]+)"[^>]*aria-label="Agenda attachment for (\d{4}-\d{2}-\d{2}) [^"]*"/g;

      // Build agenda map by date
      const agendaMap = {};
      let am;
      while ((am = agendaRe.exec(html)) !== null) {
        if (!agendaMap[am[1]]) agendaMap[am[1]] = 'https://www.norwoodtown.com' + am[2];
      }
      while ((am = agendaRe2.exec(html)) !== null) {
        if (!agendaMap[am[2]]) agendaMap[am[2]] = 'https://www.norwoodtown.com' + am[1];
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
// Rebuilds MV_CACHED_DATA from the live Town-Council + Design-Review-Board
// pages every run (SMART-style true rebuild, NOT a URL patch). The old
// patch-only approach could attach agenda URLs to entries that already
// existed, but never ADD a meeting — so once the hand-curated list ran past
// its newest date, MV silently showed zero upcoming meetings even while the
// town kept posting agendas (the July 16 2026 meeting was being scraped and
// then discarded for exactly this reason). Both MV pages expose upcoming
// meetings as `content-cards` carrying the date + time range even before an
// agenda posts, so we mirror the page and match each card to its agenda/
// packet PDF by date. Returns null (preserve existing) on any fetch/parse
// anomaly so a site outage or markup change never blanks the section.
async function syncMVAgendas() {
  console.log('\n⛰  Rebuilding Mountain Village meeting stubs...');
  const ORIGIN = 'https://townofmountainvillage.com/';
  const LOCATION = 'Town Hall, 455 Mountain Village Blvd, Suite A';
  const PAGES = [
    { url: ORIGIN + 'government/town-council/town-council/', board: 'tc',  title: 'Town Council Meeting' },
    { url: ORIGIN + 'business/planning/design-review-board/', board: 'drb', title: 'Design Review Board' }
  ];
  const now = new Date();
  const lookback = new Date(now.getTime() - 14 * 86400000); // keep a just-passed meeting briefly
  const stubs = [];

  for (const pg of PAGES) {
    const html = await fetchPage(pg.url, `MV ${pg.board} page`);
    // Correlated-host failure: if either page can't be fetched, bail entirely
    // rather than half-rebuild and wipe the other board's meetings.
    if (!html) { console.warn(`  MV ${pg.board}: fetch failed — preserving existing MV_CACHED_DATA`); return null; }

    // 1. Agenda / packet PDFs on the page, keyed by "Month D, YYYY" from the
    //    filename slug. Prefer the highest file-id variant of each kind.
    const docs = {};
    const pdfRe = /site\/assets\/files\/(\d+)\/([a-z0-9_-]+)\.pdf/gi;
    let pm;
    while ((pm = pdfRe.exec(html)) !== null) {
      const id = parseInt(pm[1], 10);
      const slug = pm[2].toLowerCase();
      const kind = /packet/.test(slug) ? 'packet' : /agenda/.test(slug) ? 'agenda' : null;
      if (!kind) continue;
      // e.g. "may_21-_2026_town_council_meeting_agenda(-1)" or
      // "01_january_28-_2026_special_town_council_meeting_agenda".
      const sm = /(?:^|_)([a-z]+)_(\d{1,2})[-_]+(\d{4})_/.exec(slug);
      if (!sm) continue;
      const mIdx = MONTH_LOOKUP[sm[1]];
      if (mIdx === undefined) continue;
      const key = dateKeyFromYMD(sm[3], mIdx, sm[2]);
      docs[key] = docs[key] || {};
      if (!docs[key][kind] || id > docs[key][kind].id) docs[key][kind] = { url: ORIGIN + pm[0], id };
    }

    // 2. Meeting cards: date + time range live in the `content-cards__pre-heading`
    //    block, present even before an agenda posts. e.g.
    //    ...pre-heading>July 16th 2026<br>2:00 pm - 7:00 pm<h3...><a href=/...>Town Council Meeting...
    const cardRe = /content-cards__pre-heading["']?\s*>\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4})\s*<br\s*\/?>\s*([^<]*?)\s*<h3[^>]*>\s*<a\s+href=["']?([^\s>"']+)["']?\s*>\s*([^<]*)/gi;
    let cm, cardCount = 0;
    while ((cm = cardRe.exec(html)) !== null) {
      cardCount++;
      const dm = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/.exec(cm[1]);
      if (!dm) continue;
      const mIdx = MONTH_LOOKUP[dm[1].toLowerCase()];
      if (mIdx === undefined) continue;
      const dateKey = dateKeyFromYMD(dm[3], mIdx, dm[2]);
      const mDate = new Date(dateKey);
      if (isNaN(mDate) || mDate < lookback) continue;
      const time = (cm[2] || '').replace(/\b(am|pm)\b/gi, s => s.toUpperCase()).replace(/\s+/g, ' ').trim();
      const special = /special/i.test(cm[4] || '') || /special/i.test(cm[3] || '');
      const d = docs[dateKey] || {};
      const stub = {
        date: dateKey,
        time: time || null,
        title: pg.title,
        board: pg.board,
        agendaUrl: d.agenda ? d.agenda.url : null,
        packetUrl: d.packet ? d.packet.url : null,
        special,
        location: LOCATION
      };
      if (!d.agenda) stub.note = 'Agenda typically posted the Friday before.';
      stubs.push(stub);
    }
    console.log(`  MV ${pg.board}: ${cardCount} card(s), ${Object.keys(docs).length} date(s) with docs`);
  }

  // Safety floor: never publish an empty rebuild (would blank the section).
  if (!stubs.length) { console.warn('  MV: 0 stubs parsed — preserving existing MV_CACHED_DATA'); return null; }

  stubs.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`  MV: rebuilt ${stubs.length} stub(s) (${stubs.filter(s => s.agendaUrl).length} with agenda)`);
  return stubs;
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

// ── Generate + reconcile: shared meeting-list rebuild ─────────────────────────
// Merges real scraped meetings (authoritative dates + agenda URLs) with a few
// FORWARD cadence placeholders, so a board's section shows an upcoming date even
// in the gap before its next agenda posts. This is the fix for the static-list
// failure class: a patch-only sync could attach a URL to an existing stub but
// never ADD a meeting, so once a hand-curated list ran past its newest date the
// section silently went empty. Rules come from lib/schedule.js and were verified
// from each board's own meeting history — never guessed. Real scraped dates
// always win on a collision, and we project only a couple ahead, so a cadence
// that ever drifts self-corrects the moment the next real agenda is scraped (and
// the source-health "0 upcoming" alarm backstops a total miss).
//
//   scraped: [{ date:'Month D, YYYY', agendaUrl?, packetUrl?, title?, board?, time?, special? }]
//   cadence: { nth, weekday } | null   (null ⇒ scraped-only, no placeholder)
//   opts:    { title, location, time?, board?, note?, placeholders=2, skipMonths=[], lookbackDays=21 }
// Returns a sorted stub array, or null when there's nothing to publish (so the
// caller preserves the existing array rather than blanking the section).
const { nextOccurrences: _nextOccurrences } = require('./lib/schedule.js');
function assembleBoardStubs(scraped, cadence, opts, now = new Date()) {
  const lookbackDays = opts.lookbackDays == null ? 21 : opts.lookbackDays;
  const lookback = new Date(now.getTime() - lookbackDays * 86400000);
  const byDate = new Map();
  for (const s of (scraped || [])) {
    const d = new Date(s.date);
    if (isNaN(d) || d < lookback) continue;
    const stub = {
      date: s.date,
      time: s.time || opts.time || null,
      title: s.title || opts.title,
      agendaUrl: s.agendaUrl || null,
      packetUrl: s.packetUrl || null,
      special: !!s.special,
      location: s.location || opts.location
    };
    const bd = s.board || opts.board;
    if (bd) stub.board = bd;
    byDate.set(s.date + '|' + (bd || ''), stub);
  }
  if (cadence) {
    const placeholders = opts.placeholders == null ? 2 : opts.placeholders;
    for (const occ of _nextOccurrences(cadence, now, placeholders, opts.skipMonths || [])) {
      const key = occ.date + '|' + (opts.board || '');
      if (byDate.has(key)) continue;
      const stub = {
        date: occ.date, time: opts.time || null, title: opts.title,
        agendaUrl: null, packetUrl: null, special: false, location: opts.location
      };
      if (opts.board) stub.board = opts.board;
      if (opts.note) stub.note = opts.note;
      byDate.set(key, stub);
    }
  }
  const out = [...byDate.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
  return out.length ? out : null;
}

// Rebuild MED_CACHED_DATA: real Traction-Rec agendas + 4th-Thursday regulars.
// (Verified cadence: the regular board meeting is the 4th Thursday every month.)
async function rebuildMedMeetings() {
  console.log('\n🏥 Rebuilding Hospital District meetings...');
  const map = await syncMedAgendas();               // { 'Month D, YYYY': url } or null
  if (map === null) { console.warn('  Med: fetch failed — preserving existing MED_CACHED_DATA'); return null; }
  const scraped = Object.keys(map).map(date => ({ date, agendaUrl: map[date] }));
  return assembleBoardStubs(scraped, { nth: 4, weekday: 4 }, {
    title: 'Regular Board Meeting',
    time: '8:30 AM - 11:30 AM',
    location: '333 W Colorado Ave (2nd Floor), Telluride / Zoom',
    placeholders: 2,
    note: 'Next scheduled meeting -- agenda posted before the meeting.'
  });
}

// Rebuild SCHOOL_CACHED_DATA: scraped-only (no weekday placeholder). The Board
// of Education's meeting dates are set by the academic calendar and land on the
// 2nd / 3rd / last Tuesday depending on the month — there is NO reliable weekday
// cadence to project, so we never fabricate a date. Instead we rebuild straight
// from the posted agendas (syncSchoolAgendas already parses date + type from each
// PDF link), so School self-heals when the fall agendas post. During the summer
// recess gap it shows nothing upcoming — which is correct, and the source-health
// alarm covers it.
async function rebuildSchoolMeetings() {
  console.log('\n🏫 Rebuilding Board of Education meetings...');
  const items = await syncSchoolAgendas();          // [{ date, type, url }] or null
  if (items === null) { console.warn('  School: fetch failed — preserving existing SCHOOL_CACHED_DATA'); return null; }
  const TITLES = {
    monthly: 'Telluride Board of Education Monthly Meeting',
    work:    'Telluride Board of Education Work Session',
    special: 'Telluride Board of Education Special Meeting'
  };
  const scraped = items.map(it => ({
    date: it.date,
    agendaUrl: it.url,
    title: TITLES[it.type] || 'Telluride Board of Education Meeting'
  }));
  return assembleBoardStubs(scraped, null, {
    title: 'Telluride Board of Education Meeting',
    location: 'Bridal Veil District Conference Room / Zoom',
    placeholders: 0
  });
}

// Ophir: project the General Assembly's 3rd-Tuesday meetings forward (verified
// cadence). Existing recent entries are preserved; P&Z is as-needed (no reliable
// cadence, and its agenda filenames carry no day) so it gets no placeholder.
// Agenda URLs for the new GA stubs are attached by the existing Ophir agenda
// sync step (patchAgendaUrls, Task 0c) which runs after this.
function rebuildOphirMeetings(existing, now = new Date()) {
  return assembleBoardStubs(existing, { nth: 3, weekday: 2 }, {
    title: 'General Assembly Meeting', board: 'ga',
    placeholders: 2,
    note: 'Next scheduled meeting -- agenda posted closer to the date.'
  }, now);
}

// Ridgway: project the Town Council's 2nd-Wednesday regular meetings forward
// ("second Wednesday of the month", per the town's own page). Planning
// Commission is as-needed (no placeholder). Agenda URLs resolve from
// RIDGWAY_AGENDA_MAP by date at render time, so placeholders need none here.
function rebuildRidgwayMeetings(existing, now = new Date()) {
  return assembleBoardStubs(existing, { nth: 2, weekday: 3 }, {
    title: 'Ridgway Town Council Regular Meeting', board: 'council', time: '6:00 PM',
    placeholders: 2,
    note: 'Next scheduled meeting -- agenda posted the week before.'
  }, now);
}

// SMART (Telluride regional transit) — its colorado.gov board-meetings page
// lists, per month, two direct-PDF links titled "<Month> <YYYY> Board Agenda"
// and "<Month> <YYYY> Board Packet". (The PDF filenames themselves are wildly
// inconsistent — "Agenda2025.11.13_r.pdf", "SMART-Board-Agenda_June-11th-2026
// _distributed.pdf", etc. — so we key off the clean LINK TEXT, not the file
// name.)
//
// SMART meets the 2nd Thursday of the month, but not every month, and the old
// approach joined the page months to a HAND-CURATED SMART_CACHED_DATA stub
// list — which silently went stale (the list stopped at a fixed date, so newer
// meetings never rendered and their agendas were never picked up). This now
// REBUILDS SMART_CACHED_DATA from the live page every run: it emits a stub for
// each upcoming month (this month → +3) that has an agenda posted, PLUS the
// single next upcoming meeting as a placeholder so an upcoming meeting shows
// before its agenda posts. Agenda-driven, so it never goes stale and doesn't
// fabricate cards for months SMART skips. Returns the stub array, or null on
// fetch failure (carry forward the existing list). getSmartMeetings() and the
// summary pipeline both read SMART_CACHED_DATA unchanged, so keys stay aligned.
async function syncSmartAgendas() {
  console.log('\n🚌 Syncing SMART agenda + packet PDFs...');
  const PAGE = AGENDA_SOURCES.smart.pageUrl;
  const ORIGIN = 'https://smarttelluride.colorado.gov';
  const html = await fetchPage(PAGE, 'SMART board-meetings page');
  if (!html) return null;

  // 1. Page anchors → { 'Month YYYY': { agendaUrl, packetUrl } } (Title-case key).
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const byMonth = {};
  const aRe = /<a\b[^>]*href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(html)) !== null) {
    let href = m[1];
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (/special/i.test(text)) continue; // skip special-meeting rows; regular monthly only
    const t = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b[\s\S]*?\b(Agenda|Packet)\b/i);
    if (!t) continue;
    if (!/^https?:/i.test(href)) href = ORIGIN + (href.startsWith('/') ? href : '/' + href);
    const key = t[1][0].toUpperCase() + t[1].slice(1).toLowerCase() + ' ' + t[2];
    byMonth[key] = byMonth[key] || {};
    if (/agenda/i.test(t[3])) byMonth[key].agendaUrl = href;
    else byMonth[key].packetUrl = href;
  }
  if (!Object.keys(byMonth).length) { console.warn('  No SMART agenda links found — check HTML structure'); return null; }

  // 2. Rebuild SMART_CACHED_DATA stubs: 2nd Thursday of each month, this month
  //    → +3, only for months with an agenda posted, plus one upcoming placeholder.
  function secondThursday(year, month) {                 // month 0-based
    const firstDow = new Date(year, month, 1).getDay();  // 0=Sun..6=Sat
    const firstThu = 1 + ((4 - firstDow + 7) % 7);
    return firstThu + 7;
  }
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const stubs = [];
  let placeholderUsed = false;
  for (let i = 0; i <= 3; i++) {
    const base = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = base.getFullYear(), month = base.getMonth();
    const docs = byMonth[MONTHS[month] + ' ' + year] || {};
    const agendaUrl = docs.agendaUrl || null;
    const day = secondThursday(year, month);
    if (!agendaUrl) {
      // Only surface the single next upcoming meeting as a placeholder; don't
      // fabricate cards for later, un-agenda'd months (SMART skips some months).
      if (placeholderUsed || new Date(year, month, day) < todayMid) continue;
      placeholderUsed = true;
    }
    stubs.push({
      date: MONTHS[month] + ' ' + day + ', ' + year,
      time: '4:00 PM',
      title: 'SMART Board of Directors',
      location: 'SMART Office, Lawson Hill (also virtual — see agenda)',
      agendaUrl,
      packetUrl: docs.packetUrl || null
    });
  }
  console.log(`  SMART: ${Object.keys(byMonth).length} month(s) on page; rebuilt ${stubs.length} stub(s) (${stubs.filter(s => s.agendaUrl).length} with agenda)`);
  return stubs;
}

// San Miguel County — queries CivicClerk OData for upcoming events whose
// names match BOCC / Planning Commission / Open Space / etc., and returns
// a {dateKey: agendaUrl} map keyed by the gov-data.js date format
// ("Mon D, YYYY"). patchAgendaUrls() then folds the URLs into
// COUNTY_CACHED_DATA entries — both updating existing `agendaUrl:` fields
// and inserting new ones for entries that don't have the field yet (e.g.
// future BOCC stubs created with just `civicClerkId: null`).
//
// Why this exists: hand-curated entries in COUNTY_CACHED_DATA often lag
// the actual CivicClerk events. Special meetings or schedule changes
// would leave the "View Agenda" button on the gov-hub card pointing at
// the CivicClerk portal home page instead of the real PDF. This fixes
// that automatically for any upcoming event that's been published.
async function syncCountyAgendas() {
  console.log('\n🏛  Syncing San Miguel County agenda URLs from CivicClerk...');
  const now = new Date();
  const horizon = new Date(now.getTime() + 45 * 86400000);
  const toIso = (d) => d.toISOString().split('.')[0] + 'Z';
  const filter = `startDateTime ge ${toIso(now)} and startDateTime le ${toIso(horizon)}`;
  const url = `${AGENDA_SOURCES.county.apiBase}/Events?` +
    `$filter=${encodeURIComponent(filter)}` +
    `&$orderby=startDateTime` +
    `&$top=100`;

  const map = {};
  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    console.warn(`  CivicClerk fetch error: ${e.message}`);
    return map;
  }
  if (resp.status !== 200) {
    console.warn(`  CivicClerk API returned HTTP ${resp.status}`);
    return map;
  }
  let parsed;
  try { parsed = JSON.parse(resp.text); }
  catch (e) {
    console.warn(`  CivicClerk JSON parse error: ${e.message}`);
    return map;
  }
  const events = Array.isArray(parsed.value) ? parsed.value : [];
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  for (const ev of events) {
    if (!ev || ev.isDeleted) continue;
    if (ev.isPublished && String(ev.isPublished).toLowerCase() !== 'published') continue;
    // Limit to BOCC / Open Space / Planning to avoid stomping on unrelated
    // CACHED entries with the same date.
    if (!/board of county commissioners|planning commission|open space/i.test(ev.eventName || '')) continue;
    const pubFiles = Array.isArray(ev.publishedFiles) ? ev.publishedFiles : [];
    const agendaFile = pubFiles.find(f => f && f.type === 'Agenda');
    if (!agendaFile) continue;
    const agendaUrl =
      `${AGENDA_SOURCES.county.portalBase}/event/${ev.id}/files/agenda/${agendaFile.fileId}`;
    const start = new Date(ev.startDateTime || ev.eventDate);
    if (isNaN(start)) continue;
    // gov-data.js dates are in MT local calendar terms ("May 27, 2026"),
    // not UTC. CivicClerk timestamps come back in UTC but the date portion
    // is reliable for events scheduled in MT — so use the UTC date here,
    // matching how `localDate('May 27, 2026')` reads the gov-data string.
    const dateKey = `${months[start.getUTCMonth()]} ${start.getUTCDate()}, ${start.getUTCFullYear()}`;
    // First-write wins. If the same date has multiple matching events
    // (e.g. a regular BOCC + a special session), the hand-curated entry's
    // title should govern which one the card displays — but we can't know
    // that from here. Take the first; if it's wrong, the entry's
    // `agendaUrl:` can be set by hand and it won't be overwritten (the
    // updater only fires when the URL would actually change).
    if (!map[dateKey]) map[dateKey] = agendaUrl;
  }
  console.log(`  Found ${Object.keys(map).length} County agenda URL(s) on CivicClerk`);
  return map;
}

// Town of Telluride — queries the CivicWeb MeetingsService for upcoming HARC
// meetings and returns a {dateKey: agendaUrl} map keyed by gov-data.js's date
// format ("Mon D, YYYY"). patchAgendaUrls() folds the URL into the (all-HARC)
// TELLURIDE_CACHED_DATA so the gov-hub "View agenda" button points at the real
// CivicWeb meeting page instead of the generic HARC landing page — closing the
// hand-maintenance gap that left HARC cards link-less. Board-token filtering
// (historic & architectural / HARC) picks the HARC meeting out of the day's
// CivicWeb feed, which also lists Parks & Rec, Town Council, etc.; the shorter
// "Chair" agenda variant is skipped in favor of the full commission agenda.
async function syncTellurideAgendas() {
  console.log('\n🏛  Syncing Town of Telluride (HARC) agenda URLs from CivicWeb...');
  const now = new Date();
  const horizon = new Date(now.getTime() + 90 * 86400000);
  const fromStr = now.toISOString().split('T')[0];
  const toStr = horizon.toISOString().split('T')[0];
  const url = `${AGENDA_SOURCES.telluride.meetingsApiBase}` +
    `?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;
  const map = {};
  let resp;
  try { resp = await fetch(url); }
  catch (e) { console.warn(`  CivicWeb fetch error: ${e.message}`); return map; }
  if (resp.status !== 200) { console.warn(`  CivicWeb meetings API HTTP ${resp.status}`); return map; }
  let items;
  try { const p = JSON.parse(resp.text); items = Array.isArray(p) ? p : (p && (p.d || p.value)) || []; }
  catch (e) { console.warn(`  CivicWeb JSON parse error: ${e.message}`); return map; }
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  for (const m of items) {
    if (!m || m.Published !== true) continue;
    const name = m.Name || '';
    if (!/historic\s*(?:&|and)\s*architectural|\bharc\b/i.test(name)) continue; // HARC only
    if (/chair/i.test(name)) continue;                                          // skip "Chair" variant
    if (!m.Id) continue;
    const d = new Date(m.MeetingDate || m.MeetingDateTime || '');
    if (isNaN(d)) continue;
    const dateKey = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    if (!map[dateKey]) map[dateKey] = `${AGENDA_SOURCES.telluride.detailBase}${m.Id}`;
  }
  console.log(`  Found ${Object.keys(map).length} Telluride HARC agenda URL(s) on CivicWeb`);
  return map;
}

// Town of Telluride board/commission meetings the bot already summarizes but the
// site WASN'T rendering (it only showed HARC via TELLURIDE_CACHED_DATA): Town
// Council, Planning & Zoning Commission, Telluride Housing Authority
// Subcommittee, Ethics Commission, and the joint P&Z/HARC subcommittee. Returns
// an array of {date,title,agendaUrl,hasAgenda,location,time} for getTellurideMeetings
// to render, or null on fetch/parse failure (so a transient error never wipes the
// committed list). HARC stays in TELLURIDE_CACHED_DATA and is excluded here.
async function syncTellurideBoardMeetings() {
  console.log('\n🏛  Syncing Town of Telluride board meetings (Council, P&Z, Housing Authority, Ethics, Parks & Rec, joint) from CivicWeb...');
  const now = new Date();
  const horizon = new Date(now.getTime() + 90 * 86400000);
  const fromStr = now.toISOString().split('T')[0];
  const toStr = horizon.toISOString().split('T')[0];
  const url = `${AGENDA_SOURCES.telluride.meetingsApiBase}` +
    `?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;
  let resp;
  try { resp = await fetch(url); }
  catch (e) { console.warn(`  CivicWeb fetch error: ${e.message}`); return null; }
  if (resp.status !== 200) { console.warn(`  CivicWeb meetings API HTTP ${resp.status}`); return null; }
  let items;
  try { const p = JSON.parse(resp.text); items = Array.isArray(p) ? p : (p && (p.d || p.value)) || []; }
  catch (e) { console.warn(`  CivicWeb JSON parse error: ${e.message}`); return null; }
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  // Bodies to surface (HARC handled separately). The joint P&Z/HARC subcommittee
  // is caught by the Planning & Zoning pattern.
  const KEEP = /town council|planning\s*(?:&|and)\s*zoning|\bp&z\b|housing authority|ethics commission|parks?\s*(?:&|and)\s*rec/i;
  const out = [];
  const seen = new Set();
  for (const m of items) {
    if (!m) continue;
    const name = (m.Name || '').trim();
    if (/^(?:\(?cancelled?\)?:?\s*|CANCELLED\b)/i.test(name)) continue;  // skip cancelled
    if (!KEEP.test(name)) continue;
    if (/chair/i.test(name)) continue;                                  // skip shorter "Chair" agenda variants
    if (!m.Id) continue;
    const d = new Date(m.MeetingDate || m.MeetingDateTime || '');
    if (isNaN(d)) continue;
    const dateKey = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    const title = name
      .replace(/\s*-\s*[A-Za-z]{3,9}\.?\s+\d{1,2}\s+\d{4}\s*$/, '')   // drop CivicWeb date suffix
      .replace(/^\(?rescheduled\)?:?\s*/i, '')                        // "(RESCHEDULED) Parks & Rec…" — card shows the clean name; the date field is already the new date
      .trim();
    const dedup = dateKey + '|' + title.toLowerCase();
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    let time = '';
    const tm = String(m.MeetingDateTime || '').match(/T(\d{2}):(\d{2})/);
    if (tm) { const h = parseInt(tm[1], 10); time = `${((h + 11) % 12) + 1}:${tm[2]} ${h >= 12 ? 'PM' : 'AM'}`; }
    out.push({
      date: dateKey,
      title,
      agendaUrl: `${AGENDA_SOURCES.telluride.detailBase}${m.Id}`,
      hasAgenda: m.Published === true,
      location: (m.MeetingLocation || '').trim(),
      time,
      civicwebId: m.Id,
    });
  }
  out.sort((a, b) => (new Date(a.date) - new Date(b.date)));
  // Agenda PACKAGE detection: CivicWeb's per-meeting documents API lists the
  // full agenda package as DocumentType 4 (the agenda itself is type 1).
  // packetUrl → the direct /document/<id>/ PDF, which lights up the green
  // "Agenda Packet" button on Gov-Hub.
  for (const rec of out) {
    if (!rec.hasAgenda || !rec.civicwebId) continue;
    try {
      const dr = await fetch(`https://telluride-co.civicweb.net/Services/MeetingsService.svc/meetings/${rec.civicwebId}/meetingDocuments`);
      if (dr.status !== 200) continue;
      const docs = JSON.parse(dr.text);
      const pkg = (Array.isArray(docs) ? docs : []).find((d) => d && d.DocumentType === 4 && d.Id);
      if (pkg) rec.packetUrl = `https://telluride-co.civicweb.net/document/${pkg.Id}/`;
    } catch (e) { /* packet detection is best-effort */ }
  }
  const nPkg = out.filter((r) => r.packetUrl).length;
  console.log(`  Found ${out.length} Telluride board meeting(s) on CivicWeb (${nPkg} with agenda packages)`);
  return out;
}

// HARC lives in TELLURIDE_CACHED_DATA (hand-curated schedule) — same
// DocumentType-4 package detection, returned as {"Month D, YYYY": packetUrl}
// for patchAgendaUrls(..., 'packetUrl').
async function syncTellurideHarcPackets() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 90 * 86400000);
  const url = `${AGENDA_SOURCES.telluride.meetingsApiBase}` +
    `?from=${now.toISOString().split('T')[0]}&to=${horizon.toISOString().split('T')[0]}`;
  const map = {};
  let resp;
  try { resp = await fetch(url); } catch (e) { return map; }
  if (resp.status !== 200) return map;
  let items;
  try { const p = JSON.parse(resp.text); items = Array.isArray(p) ? p : (p && (p.d || p.value)) || []; }
  catch (e) { return map; }
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  for (const m of items) {
    if (!m || m.Published !== true || !m.Id) continue;
    if (!/historic\s*(?:&|and)\s*architectural|\bharc\b/i.test(m.Name || '')) continue;
    if (/chair/i.test(m.Name || '')) continue;
    const d = new Date(m.MeetingDate || m.MeetingDateTime || '');
    if (isNaN(d)) continue;
    try {
      const dr = await fetch(`https://telluride-co.civicweb.net/Services/MeetingsService.svc/meetings/${m.Id}/meetingDocuments`);
      if (dr.status !== 200) continue;
      const docs = JSON.parse(dr.text);
      const pkg = (Array.isArray(docs) ? docs : []).find((x) => x && x.DocumentType === 4 && x.Id);
      if (pkg) map[`${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`] = `https://telluride-co.civicweb.net/document/${pkg.Id}/`;
    } catch (e) { /* best-effort */ }
  }
  if (Object.keys(map).length) console.log(`  Found ${Object.keys(map).length} HARC agenda package(s)`);
  return map;
}

// Patches gov-data.js in place: for each (date → url) in `agendaMap`, finds
// the matching entry inside the given CACHED_DATA array and rewrites its
// `agendaUrl:` field. Scoped to the named array's brace block so the same
// date string in a different entity's array is untouched. Returns the
// updated source plus a count of fields changed.
function patchAgendaUrls(govDataSrc, arrayName, agendaMap, field = 'agendaUrl') {
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
    const escDate = dateKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Pass 1: update existing `<field>: null` or `<field>: '<old>'`.
    const updateRe = new RegExp(
      "(\\{[^{}]*date:\\s*'" + escDate + "'[^{}]*?" + field + ":\\s*)(null|'[^']*')",
      'g'
    );
    let matched = false;
    body = body.replace(updateRe, (full, prefix, current) => {
      matched = true;
      const newVal = "'" + url + "'";
      if (current === newVal) return full;
      changed++;
      return prefix + newVal;
    });
    if (matched) return;

    // Pass 2: the entry exists but has no `<field>:` field — insert one.
    // We anchor on a trailing field (location, type, civicClerkId, note) so
    // we land inside the same entry. Greedy `*` here (vs `*?` in Pass 1)
    // so we attach to the LAST such field in the entry, which keeps the
    // inserted agendaUrl near the end of the field list instead of awkwardly
    // squeezed between `time:` and `title:`.
    const insertRe = new RegExp(
      "(\\{[^{}]*date:\\s*'" + escDate + "'[^{}]*)(\\b(?:note|location|civicClerkId|type|time)\\s*:\\s*(?:'(?:[^'\\\\]|\\\\.)*'|null|true|false|\\d+))",
      'g'
    );
    body = body.replace(insertRe, (full, before, lastField) => {
      // Indent the new line to match surrounding fields (look back for indent).
      const m = before.match(/\n(\s+)[^\n]*$/);
      const indent = m ? m[1] : '    ';
      changed++;
      return before + lastField + ',\n' + indent + field + ": '" + url + "'";
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
  return applyEventOverrides(events);
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

  // Pattern 2: Specific dates in text (Month DD, YYYY). This runs BEFORE the
  // weekly recurrence pattern: a literal date like "Monday, February 16, 2026"
  // contains a weekday name that the weekly regex would otherwise misread as
  // "every Monday" and synthesise N false future occurrences. If we find a
  // specific date, trust it as authoritative for a one-off event.
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
  if (dates.length) return dates;

  // Pattern 3: Weekly on a specific weekday (e.g. "Saturdays" / "Every Friday").
  // Require an explicit recurrence marker: "every <day>", "each <day>", or the
  // plural form "<day>s". Bare "Monday" (e.g. inside the date string
  // "Monday, February 16, 2026") no longer triggers — that's handled by the
  // specific-date pattern above.
  const weeklyRe = /(?:every|each)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s\b/i;
  const wMatch = weeklyRe.exec(text);
  if (wMatch) {
    const weekday = weekdayMap[(wMatch[1] || wMatch[2]).toLowerCase()];
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

  return dates;
}

// Extract an og:<name> meta tag's content, tolerating unquoted property values
// AND unquoted content. MV's pages mix `property=og:title content="..."` (quoted
// content) with `property=og:image content=https://...png` (NO quotes on the
// image URL), so the old `content="([^"]+)"` regex silently dropped the image.
function mvOgContent(html, name) {
  const tag = (html.match(new RegExp('<meta[^>]*\\bog:' + name + '\\b[^>]*>', 'i')) || [])[0];
  if (!tag) return '';
  const c = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return c ? (c[1] || c[2] || c[3] || '') : '';
}

async function syncMountainVillageEvents() {
  console.log('\n🏔  Task 18: Syncing Mountain Village events (sitemap+pages)...');
  // Non-www host: MV moved canonical URLs off www (www 301-redirects here).
  const SITEMAP_URL = 'https://townofmountainvillage.com/sitemap.xml';
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

  // Extract event slugs from each <url> block. MV keeps ~1,100 historical event
  // pages in the sitemap, so fetching them all every run is wasteful. Match the
  // all-events path HOST-AGNOSTICALLY (robust to the www→non-www move, and if
  // they ever switch back), skip gov meetings (they belong in Gov-Hub), and keep
  // only pages whose <lastmod> is recent. MV creates a fresh page per occurrence
  // (e.g. "30th-annual-wild-west-fest"), so the current season's events have
  // recent lastmods while dead past events are >1yr stale — this bounds the
  // per-run fetch from ~1,100 to ~150.
  const LASTMOD_WINDOW_MS = 180 * 86400000;
  const sitemapNow = Date.now();
  const slugSet = new Set();
  const urlBlockRe = /<url>([\s\S]*?)<\/url>/gi;
  let block;
  while ((block = urlBlockRe.exec(sitemapXml)) !== null) {
    const seg = block[1];
    const loc = (seg.match(/<loc>\s*([^<]+?)\s*<\/loc>/i) || [])[1] || '';
    const sm = loc.match(/\/explore\/events\/all-events\/([^/<">\s]+)\/?$/i);
    if (!sm) continue;
    const slug = sm[1];
    if (MV_GOV_SLUG_RE.test(slug)) continue;
    const lastmod = (seg.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i) || [])[1] || '';
    const lm = lastmod ? new Date(lastmod).getTime() : NaN;
    if (!isNaN(lm) && (sitemapNow - lm) > LASTMOD_WINDOW_MS) continue; // stale past event
    slugSet.add(slug);
  }
  const slugs = Array.from(slugSet);
  console.log(`  MV: ${slugs.length} recent non-gov event slugs (lastmod <=180d)`);

  const now = Date.now();
  const fromMs = now - 86400000;        // allow yesterday (in case of timezone)
  const toMs   = now + 30 * 86400000;  // rolling 30-day window (per product rule:
                                        // only ever surface the next 30 days of MV
                                        // events; re-derived every 6h refresh)

  const events = [];
  let fetched = 0;

  for (const slug of slugs) {
    const url = 'https://townofmountainvillage.com/explore/events/all-events/' + slug + '/';
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

    // Extract metadata from og: tags (quote-tolerant — MV mixes quoted/unquoted)
    const ogTitle = mvOgContent(html, 'title')
                 || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const ogDesc  = mvOgContent(html, 'description');
    const ogImage = mvOgContent(html, 'image');

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
// Scrape one Ridgway colorado.gov board page (Council or Planning Commission)
// into a { "Month D, YYYY": agendaUrl } map. Both pages use the same table
// shape: <tr><td><strong>Month D, YYYY</strong></td> … <td><a>Agenda & Packet</a></td>
// (+ an optional <a>Minutes</a>). Returns {} on any fetch failure.
async function scrapeRidgwayAgendaPage(pageUrl, label) {
  const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  let html = null;
  try {
    const resp = await fetch(pageUrl, { headers: { 'User-Agent': SAFARI_UA, 'Accept': 'text/html,*/*' } });
    if (resp.status === 200) { html = resp.text; console.log(`  Ridgway ${label}: direct fetch 200`); }
    else console.warn(`  Ridgway ${label}: direct fetch HTTP ${resp.status}, trying proxy`);
  } catch (e) {
    console.warn(`  Ridgway ${label}: direct fetch error (${e.message}), trying proxy`);
  }
  if (!html) {
    try {
      const proxyUrl = maybeProxy(pageUrl);
      if (proxyUrl === pageUrl) { console.warn(`  No proxy configured — skipping Ridgway ${label}`); return {}; }
      const resp2 = await fetch(proxyUrl);
      if (resp2.status === 200) { html = resp2.text; console.log(`  Ridgway ${label}: proxy fetch 200`); }
      else { console.warn(`  Ridgway ${label}: proxy fetch HTTP ${resp2.status}`); return {}; }
    } catch (e2) {
      console.warn(`  Ridgway ${label}: proxy fetch error (${e2.message})`); return {};
    }
  }

  const agendaMap = {};
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const dateRe = /<strong[^>]*>\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4})\s*<\/strong>/i;
    const dateMatch = dateRe.exec(row);
    if (!dateMatch) continue;
    let rawDate = dateMatch[1].trim().replace(/\s+/g, ' ');
    if (!rawDate.includes(',')) rawDate = rawDate.replace(/(\d{4})$/, ', $1');
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) continue;
    const dateKey = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    // Prefer an Agenda/Packet link; explicitly skip Minutes-only links.
    const linkRe = /<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let linkMatch, agendaUrl = null;
    while ((linkMatch = linkRe.exec(row)) !== null) {
      const href = linkMatch[1];
      const text = linkMatch[2];
      if (/minutes/i.test(text)) continue;
      if (/agenda|packet/i.test(text) || /agenda|packet/i.test(href)) {
        agendaUrl = href.startsWith('http') ? href : `https://townofridgway.colorado.gov${href}`;
        break;
      }
      if (!agendaUrl) agendaUrl = href.startsWith('http') ? href : `https://townofridgway.colorado.gov${href}`;
    }
    if (agendaUrl && !agendaMap[dateKey]) agendaMap[dateKey] = agendaUrl;
  }
  console.log(`  Ridgway ${label}: ${Object.keys(agendaMap).length} agenda link(s)`);
  return agendaMap;
}

// Task 20: scrape BOTH Ridgway board pages (Town Council 2nd-Wed, Planning
// Commission 3rd-Wed) and merge into one date→agenda map for RIDGWAY_AGENDA_MAP.
// Council and PC never meet on the same date, so a single map serves both;
// getRidgwayMeetings() in gov-helpers.js looks up the agenda by meeting date.
async function syncRidgwayAgendas() {
  console.log('\n🏔  Task 20: Scraping Ridgway Council + Planning Commission agendas...');
  const council = await scrapeRidgwayAgendaPage('https://townofridgway.colorado.gov/i-want-to/ridgway-town-council', 'Town Council');
  const pc = await scrapeRidgwayAgendaPage('https://townofridgway.colorado.gov/i-want-to/ridgway-planning-commission', 'Planning Commission');
  const merged = Object.assign({}, council, pc);
  const count = Object.keys(merged).length;
  if (count === 0) {
    console.warn('  No Ridgway agendas found — check HTML structure');
    return null;
  }
  console.log(`  Ridgway: ${count} total agenda link(s) (council + PC)`);
  return merged;
}

// Task 20d: scrape the Town of Rico Board of Trustees page into a
// { "<label>": { agenda, packet, minutes } } map for RICO_AGENDA_MAP.
// Rico's Drupal page lists each meeting's Agenda / Packet / Minutes as separate
// PDF links whose VISIBLE TEXT is clean and consistent ("May 2026 Agenda",
// "June 2026 Special Meeting Packet", "February 2026 Work Session Minutes"),
// even though the underlying filenames are messy. We group by the label minus
// its trailing kind word; getRicoMeetings() in gov-helpers.js looks up the
// "<Month> <Year>" key for each generated 3rd-Wednesday regular meeting.
async function syncRicoAgendas() {
  console.log('\n⛏  Task 20d: Scraping Town of Rico Board of Trustees agendas...');
  const html = await fetchGovPage('https://townofrico.colorado.gov/government/board-of-trustees', 'Rico Board of Trustees');
  if (!html) return null;
  const MONTHS = new Set(['January','February','March','April','May','June','July','August','September','October','November','December']);
  const map = {};
  const re = /<a\b[^>]*href="([^"]*\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (!href.startsWith('http')) href = 'https://townofrico.colorado.gov' + (href.startsWith('/') ? href : '/' + href);
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
    // Label = everything before the trailing kind word; kind = agenda|packet|minutes.
    const km = text.match(/^(.*?)\b(Agenda|Packet Addendum|Packet|Minutes)\s*$/i);
    if (!km) continue;
    const key = km[1].trim().replace(/[-–]\s*$/, '').trim();
    const kind = /packet/i.test(km[2]) ? 'packet' : (/minutes/i.test(km[2]) ? 'minutes' : 'agenda');
    if (!key) continue;
    const first = key.split(/\s+/)[0];
    if (!MONTHS.has(first)) continue;                 // must start with a month name
    const ym = key.match(/\b(20\d\d)\b/);
    if (!ym || +ym[1] < 2024) continue;               // skip pre-2024 archive
    if (!map[key]) map[key] = {};
    if (!map[key][kind]) map[key][kind] = href;
  }
  const count = Object.keys(map).length;
  if (!count) { console.warn('  No Rico agenda links found — check HTML structure'); return null; }
  console.log(`  Rico: ${count} meeting(s) with agenda/packet/minutes links`);
  return map;
}

// Generic colorado.gov-style page fetch: try direct, fall back to CF proxy.
async function fetchGovPage(pageUrl, label) {
  const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  try {
    const resp = await fetch(pageUrl, { headers: { 'User-Agent': SAFARI_UA, 'Accept': 'text/html,*/*' } });
    if (resp.status === 200) return resp.text;
    console.warn(`  ${label}: direct HTTP ${resp.status}, trying proxy`);
  } catch (e) { console.warn(`  ${label}: direct error (${e.message}), trying proxy`); }
  try {
    const proxyUrl = maybeProxy(pageUrl);
    if (proxyUrl === pageUrl) { console.warn(`  ${label}: no proxy configured`); return null; }
    const resp2 = await fetch(proxyUrl);
    if (resp2.status === 200) return resp2.text;
    console.warn(`  ${label}: proxy HTTP ${resp2.status}`);
  } catch (e2) { console.warn(`  ${label}: proxy error (${e2.message})`); }
  return null;
}

// Collect agenda/packet PDF links { href, hay } from a colorado.gov page,
// dropping obvious non-meeting documents (permits, checklists, FEMA flyers…).
function collectGovPdfLinks(html, origin) {
  const out = [];
  const re = /<a\b[^>]*href="([^"]*\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].startsWith('http') ? m[1] : origin + (m[1].startsWith('/') ? m[1] : '/' + m[1]);
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
    let fn = ''; try { fn = decodeURIComponent(href.split('/').pop()); } catch { fn = href.split('/').pop(); }
    const hay = (text + ' ' + fn).replace(/&amp;/g, '&');
    if (/minutes|permit|checklist|charter|fema|winter\s*storm|warning|emergency|brochure|triangle|operations|application/i.test(hay)) continue;
    out.push({ href, hay });
  }
  return out;
}

const SCHOOL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Ophir (General Assembly + Planning & Zoning) — colorado.gov. The two boards'
// agenda filenames are wildly inconsistent (GA = Month-Day-Year, PZ = Month-Year
// with no day), so we REVERSE-MATCH: for each OPHIR_CACHED_DATA stub we look for
// a page link whose text+filename mentions that stub's month + day + year + board
// keyword (GA vs P&Z). GA and PZ never meet on the same date, so a single
// { 'Month D, YYYY': url } map (for patchAgendaUrls) serves both.
async function syncOphirAgendas(govDataSrc) {
  console.log('\n⛰  Task 20b: Scraping Ophir GA + P&Z agendas...');
  const ORIGIN = 'https://townofophir.colorado.gov';
  const gaHtml = await fetchGovPage('https://townofophir.colorado.gov/general-assembly-2', 'Ophir General Assembly');
  const pzHtml = await fetchGovPage('https://townofophir.colorado.gov/planning-and-zoning', 'Ophir Planning & Zoning');
  if (!gaHtml && !pzHtml) return null;
  const links = [
    ...(gaHtml ? collectGovPdfLinks(gaHtml, ORIGIN) : []),
    ...(pzHtml ? collectGovPdfLinks(pzHtml, ORIGIN) : [])
  ];
  if (!links.length) return null;
  const block = (govDataSrc.match(/const\s+OPHIR_CACHED_DATA\s*=\s*\[[\s\S]*?\n\];/) || [''])[0];
  const entries = block.match(/\{[^{}]*\}/g) || [];
  const map = {};
  for (const ent of entries) {
    const dm = ent.match(/date:\s*'([^']+)'/);
    const bm = ent.match(/board:\s*'(ga|pz)'/);
    if (!dm || !bm) continue;
    const date = dm[1], board = bm[1];
    const mm = date.match(/^(\w+)\s+(\d{1,2}),\s*(\d{4})$/);
    if (!mm) continue;
    const mon = mm[1], day = +mm[2], yr = mm[3];
    const dayRe = new RegExp(`(?:^|[^\\d])${day}(?:st|nd|rd|th)?(?:[^\\d]|$)`);
    const monRe = new RegExp('\\b' + mon + '\\b', 'i');
    const boardRe = board === 'ga' ? /\bGA\b|general\s*assembly/i : /\bP\s*&?\s*Z\b|PZ|planning/i;
    const cands = links.filter(l => monRe.test(l.hay) && l.hay.includes(yr) && dayRe.test(l.hay) && boardRe.test(l.hay));
    if (!cands.length) continue;
    cands.sort((a, b) => (/agenda/i.test(b.hay) ? 1 : 0) - (/agenda/i.test(a.hay) ? 1 : 0));
    map[date] = cands[0].href;
  }
  console.log(`  Ophir: matched ${Object.keys(map).length} agenda(s) to stubs`);
  return Object.keys(map).length ? map : null;
}

// Telluride School District (Board of Education) — tellurideschool.org. The
// agenda/packet links carry a clean "M.D.YY" date AND a meeting type in the
// link text ("8.26.25 Monthly Meeting"). The board holds same-date Work
// Session + Monthly Meeting pairs, so we match on date AND type, not date alone.
// Returns a list [{ date:'Month D, YYYY', type:'work'|'monthly'|'special', url }].
async function syncSchoolAgendas() {
  console.log('\n🏫 Task 20c: Scraping Telluride Board of Education agendas...');
  const html = await fetchGovPage('https://www.tellurideschool.org/agendasandminutes', 'School District agendas');
  if (!html) return null;
  const out = [];
  const re = /<a\b[^>]*href="([^"]*\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].startsWith('http') ? m[1] : 'https://www.tellurideschool.org' + m[1];
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const dm = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2})\b/);
    if (!dm) continue;
    const mo = +dm[1], da = +dm[2], yr = 2000 + +dm[3];
    if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
    let type = 'monthly';
    if (/work\s*session/i.test(text)) type = 'work';
    else if (/special/i.test(text)) type = 'special';
    out.push({ date: `${SCHOOL_MONTHS[mo - 1]} ${da}, ${yr}`, type, url: href });
  }
  console.log(`  School: ${out.length} agenda link(s) parsed`);
  return out.length ? out : null;
}

// Patch SCHOOL_CACHED_DATA agendaUrl fields by matching date + meeting type
// (the board's title encodes the type). Needed because patchAgendaUrls keys on
// date alone, which can't tell a same-day Work Session from a Monthly Meeting.
function patchSchoolAgendas(govDataSrc, items) {
  const sm = /const\s+SCHOOL_CACHED_DATA\s*=\s*\[/.exec(govDataSrc);
  if (!sm) return { src: govDataSrc, changed: 0 };
  let depth = 0, arrStart = sm.index + sm[0].length - 1, arrEnd = arrStart;
  for (let i = arrStart; i < govDataSrc.length; i++) {
    if (govDataSrc[i] === '[') depth++;
    else if (govDataSrc[i] === ']') { depth--; if (depth === 0) { arrEnd = i; break; } }
  }
  const before = govDataSrc.slice(0, arrStart + 1);
  const after = govDataSrc.slice(arrEnd);
  let changed = 0;
  const body = govDataSrc.slice(arrStart + 1, arrEnd).replace(/\{[^{}]*\}/g, (ent) => {
    const dm = ent.match(/date:\s*'([^']+)'/);
    if (!dm) return ent;
    const titleM = ent.match(/title:\s*'([^']*)'/) || ent.match(/title:\s*"([^"]*)"/);
    const title = titleM ? titleM[1] : '';
    let type = 'monthly';
    if (/work\s*session/i.test(title)) type = 'work';
    else if (/special/i.test(title)) type = 'special';
    const hit = items.find(it => it.date === dm[1] && it.type === type);
    if (!hit) return ent;
    const newVal = "'" + hit.url + "'";
    if (/agendaUrl:\s*(?:null|'[^']*')/.test(ent)) {
      return ent.replace(/agendaUrl:\s*(null|'[^']*')/, (full, cur) => {
        if (cur === newVal) return full;
        changed++;
        return 'agendaUrl: ' + newVal;
      });
    }
    // No agendaUrl field yet — insert one after the title.
    changed++;
    return ent.replace(/(title:\s*(?:'[^']*'|"[^"]*"))/, '$1,\n    agendaUrl: ' + newVal);
  });
  return { src: before + body + after, changed };
}

// ══════════════════════════════════════════════════════════════
// ── Rick AI summary generator for events without source content ──
// ══════════════════════════════════════════════════════════════
//
// Every event on livabletelluride.org/events.html has a summary block
// that needs ~40-100 words explaining what the event is. Most sources
// give us this for free:
//   - Wilkinson Library — full description from LibCal HTML
//   - KOTO Community Calendar — Tribe Events `description` field
//   - The Alibi — `shortDescription` from the ECA API
//   - telluride.com — tooltip text from fcEventsData
//   - COMMUNITY_EVENTS / community-events.json — hand-written `copy`
//
// But some sources only give us title + venue + date:
//   - Sheridan Opera House — MEC listing page has no per-event blurb
//   - Email-submitted events sometimes omit a description
//   - Future sources we haven't picked a parser for yet
//
// For those, we ask Claude (acting as "Rick" — see the SUMMARY_SYSTEM_PROMPT
// at the top of this file and the voice_rick memory note) to write a
// short, grounded 2-sentence event summary based on whatever metadata
// we DO have. The output gets written into the event's `description`
// field so events.html doesn't need to know which summaries are AI.
//
// CACHING: Claude API calls cost money, and the bot runs every 6 hours
// with ~250 events on average. Caching is essential. We key by
// (source|title|date) and persist to data/event-summaries-cache.json.
// Once an event has a Rick summary, it stays cached until the title
// or date changes. Cache lives in the repo so it persists across
// runner invocations.

// fs + path already required at the top of the file (lines 19-20).
// REPO_ROOT already defined at line 23.
const EVENT_SUMMARY_CACHE_PATH = path.join(REPO_ROOT, 'data', 'event-summaries-cache.json');

const RICK_EVENT_USER_PROMPT_TEMPLATE = (e) => `Write a 2-sentence (40-70 word) description for this event, to display on a Telluride community events page. Stay grounded — DO NOT invent facts you weren't told (specific times, prices, lineup names, performer biographies, ticket details). If the title or context is sparse, write a generic but accurate description ("a concert at The Alibi" / "a free library program for kids") rather than making things up. No sign-off, no quotes, no "Rick says", no calls to action. Plain prose.

Title: ${e.title || '(no title)'}
Date: ${e.pubDate || e.date || '(no date)'}
${e.time ? 'Time: ' + e.time + '\n' : ''}Location: ${e.location || '(no location)'}
Source/Venue: ${e.sourceLabel || e.source || '(unknown)'}
Category: ${e.category || '(general)'}
Existing description (may be empty or generic): ${(e.description || e.copy || '').slice(0, 300) || '(none)'}`;

function loadEventSummaryCache() {
  try {
    if (fs.existsSync(EVENT_SUMMARY_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(EVENT_SUMMARY_CACHE_PATH, 'utf8')) || {};
    }
  } catch (e) { console.warn(`  Cache parse error: ${e.message}`); }
  return {};
}

function saveEventSummaryCache(cache) {
  try {
    const dir = path.dirname(EVENT_SUMMARY_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(EVENT_SUMMARY_CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (e) { console.warn(`  Cache write error: ${e.message}`); }
}

function eventSummaryCacheKey(e) {
  const src   = String(e.source || e.sourceLabel || 'unknown').toLowerCase().slice(0, 30);
  const title = String(e.title || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
  const date  = String(e.pubDate || e.date || '').slice(0, 10);
  return `${src}|${title}|${date}`;
}

/**
 * True if this event's description is either missing or so generic
 * that it doesn't actually tell the user anything specific. The
 * threshold is 80 characters because under that we tend to have
 * boilerplate like "Show at the Sheridan Opera House."
 */
function eventNeedsSummary(e) {
  const desc = (e.description || e.copy || '').trim();
  if (desc.length < 80) return true;
  if (/^show at the/i.test(desc)) return true;
  if (/see the .* page for tickets and details/i.test(desc)) return true;
  return false;
}

/**
 * Fill in `description` on every event across the given arrays where
 * one is missing/boilerplate. Returns the count of events updated.
 * Caches generated summaries to avoid re-calling the API on every cron
 * tick. Skips silently if ANTHROPIC_API_KEY is not set.
 */
async function syncEventDescriptions(eventArrays) {
  console.log('\n🎤 Task 21: Rick AI summaries for events with no source content...');
  if (!ANTHROPIC_API_KEY) {
    console.log('  ⚠ No ANTHROPIC_API_KEY — skipping Rick summary generation');
    return 0;
  }

  const cache = loadEventSummaryCache();
  const all = eventArrays.flatMap(a => Array.isArray(a) ? a : []);
  const candidates = all.filter(eventNeedsSummary);
  console.log(`  ${candidates.length} event(s) need a description (out of ${all.length} total)`);

  let cacheHits = 0, generated = 0, errors = 0;
  for (const ev of candidates) {
    const key = eventSummaryCacheKey(ev);
    if (cache[key]) {
      ev.description = cache[key];
      cacheHits++;
      continue;
    }
    // Generate via Claude
    try {
      const text = await callClaudeRaw(RICK_EVENT_USER_PROMPT_TEMPLATE(ev));
      if (text && text.length >= 40) {
        ev.description = text;
        cache[key] = text;
        generated++;
      } else {
        errors++;
        console.warn(`    ⚠ Empty/short response for: ${ev.title}`);
      }
      // Small pause to avoid spamming the API
      await new Promise(r => setTimeout(r, 250));
    } catch (e) {
      errors++;
      console.warn(`    ✗ Claude error for "${ev.title}": ${e.message}`);
    }
  }

  saveEventSummaryCache(cache);
  console.log(`  Rick: ${cacheHits} from cache, ${generated} newly generated, ${errors} errors`);
  return generated;
}

// ══════════════════════════════════════════════════════════════
// ── Task 24: Hub-Bub Question of the Day ──
// ══════════════════════════════════════════════════════════════
//
// One Rick-voiced discussion question per Mountain-Time day for the Hub-Bub
// board, distilled from the freshest civic material this run already gathered
// (meeting previews + summaries + Telluride Times articles). Voice and
// no-invented-facts discipline are salvaged from the retired Pulse writer
// (scripts/pulse/write-prompt.js, removed in de3ef72), with one addition:
// 2-4 short poll choices so readers can react with one tap. This task only
// writes the question (DAILY_QUESTIONS in gov-helpers.js → mirrored to
// data/daily-questions.json); votes live client-side in Firestore
// (daily_questions/{date}). Runs at most once per MT day — the 06:00 UTC run
// (midnight MT) normally generates it, so the question is up by morning.

const DAILY_QUESTION_SYSTEM_PROMPT = `You are "Rick", the single named voice behind Livable Telluride, a civic site for the Telluride, Colorado region. "Rick" is an internal persona name ONLY — never sign it, name it, or refer to it in the output. You are writing today's QUESTION OF THE DAY for the community board (Hub-Bub): one short discussion prompt that invites residents to weigh in.

THE VOICE — dry, wry, plainspoken old-timer:
You've lived in the box canyon for years and watched the cycles. You still love it; you're just not surprised. Short sentences. Em-dashes fine. One lived-in detail at most ("the box canyon," "up here") — more is costume. Never flowery, never a press release, never cynical.

THE JOB — surface the tension, DON'T take a side (this is non-negotiable):
- From the numbered CANDIDATES, PICK the single item most likely to get neighbors talking — a real local tension, decision, or change. Prefer items where reasonable people will genuinely disagree.
- Lay out what's happening and WHY people will have opinions — present BOTH sides fairly.
- Never advocate, never say what should happen, never tell people what to think. You name the disagreement; you do not settle it.
- End the body on a genuine OPEN QUESTION back to the community.

THE HARD RULES on facts (do not violate):
- EVERY concrete fact — a date, a number, a dollar figure, a name, a vote, a fee — must come from the candidate text you picked. If it isn't there, leave it out. NEVER invent a figure, name, vote count, fee, cap, statute, or attribution.
- Don't state outcomes that haven't happened: a work session or recommendation is not a final vote. If nothing's binding yet, say so plainly.

THE POLL CHOICES:
- 2 to 4 short first-person stances a resident could tap (each under 40 characters). They must be distinct, mutually exclusive answers to your closing question — e.g. "Worth it", "Bad trade", "Need more info". A hedge option ("It's complicated") is allowed as the last one. Plain sentence case, no punctuation at the end.

SHAPE:
- title: short, plain, a little wry is fine, no clickbait, no colon-stuffing.
- body: 60-100 words. Opens by laying out the item, turns to the tension, presents the sides, closes with a short open question. Plain text, normal paragraph breaks (\\n\\n), no markup, no citations in the body.

OUTPUT — return ONLY valid JSON, no prose, no code fence:
{
  "pick": <number of the candidate you chose>,
  "title": "",
  "body": "…60-100 words ending on an open question…",
  "choices": ["", ""]
}`;

// Pure calendar-date shift on a YYYY-MM-DD string (no timezone involved).
function shiftISODate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

async function refreshDailyQuestion(govHubSrc, existingQuestions) {
  console.log('\n❓ Task 24: Hub-Bub Question of the Day...');
  if (!ANTHROPIC_API_KEY) { console.log('  Skipped (no ANTHROPIC_API_KEY).'); return null; }

  // MT calendar day — the bot runs on UTC runners (see time_handling memory).
  const todayMT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  if (existingQuestions.some(q => q && q.date === todayMT)) {
    console.log(`  Already have a question for ${todayMT} — skipping.`);
    return null;
  }

  // ── Gather candidates from data already refreshed earlier this run ──
  const candidates = [];
  const seenMeetingKeys = new Set();
  const addMeetingItem = (key, text, kind) => {
    if (!text || typeof text !== 'string' || text.trim().length < 120) return;
    const parts = key.split('|');
    if (parts.length !== 3) return;
    const [, date, title] = parts;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    // Previews look ahead; summaries may also cover just-held meetings.
    const lo = kind === 'summary' ? shiftISODate(todayMT, -5) : todayMT;
    if (date < lo || date > shiftISODate(todayMT, 10)) return;
    if (seenMeetingKeys.has(date + '|' + title)) return;   // preview + summary of the same meeting
    seenMeetingKeys.add(date + '|' + title);
    candidates.push({ label: `Meeting — ${title} (${date})`, text: text.trim(), url: '/gov-hub.html', topics: ['meeting'] });
  };
  const previews = extractJsObject(govHubSrc, 'MEETING_PREVIEWS') || {};
  for (const [k, v] of Object.entries(previews)) addMeetingItem(k, v, 'preview');
  const summaries = extractJsObject(govHubSrc, 'MANUAL_SUMMARIES') || {};
  for (const [k, v] of Object.entries(summaries)) addMeetingItem(k, v, 'summary');

  const ttArticles = extractJsArray(govHubSrc, 'TELLURIDE_TIMES_ARTICLES') || [];
  for (const a of ttArticles) {
    if (!a || !a.copy || String(a.copy).trim().length < 120) continue;
    if (!a.firstSeen || a.firstSeen < shiftISODate(todayMT, -3)) continue;
    if (/obituar|in memoriam|celebration of life/i.test(a.title || '')) continue;
    candidates.push({ label: `News — ${a.title} (${a.source || 'Telluride Times'})`, text: String(a.copy).trim(), url: a.href || '', topics: [a.newsTopic || 'news'] });
  }

  if (candidates.length === 0) { console.log('  No fresh candidates today — no question.'); return null; }
  const shortlist = candidates.slice(0, 10);

  const recentTitles = existingQuestions.slice(0, 7).map(q => q && q.title).filter(Boolean);
  let userPrompt = `Write today's Question of the Day. Pick ONE candidate and build ONLY from its text.\n`;
  if (recentTitles.length) {
    userPrompt += `\nRecent questions — do NOT repeat these topics:\n${recentTitles.map(t => `- ${t}`).join('\n')}\n`;
  }
  userPrompt += `\nCANDIDATES:\n`;
  shortlist.forEach((c, i) => { userPrompt += `\n[${i + 1}] ${c.label}\n"""\n${c.text.slice(0, 1500)}\n"""\n`; });
  userPrompt += `\nReturn ONLY the JSON object.`;

  let parsed;
  try {
    const raw = await callClaudeRaw(userPrompt, { maxTokens: 1024, system: DAILY_QUESTION_SYSTEM_PROMPT });
    if (!raw) return null;
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
  } catch (e) {
    console.warn(`  ✗ Daily question generation failed: ${e.message}`);
    return null;
  }

  // ── Validate hard before anything ships ──
  const picked = shortlist[(parsed.pick | 0) - 1];
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
  const words = body ? body.split(/\s+/).length : 0;
  const choices = Array.isArray(parsed.choices)
    ? [...new Set(parsed.choices.filter(c => typeof c === 'string').map(c => c.trim()).filter(c => c && c.length <= 40))]
    : [];
  const problems = [];
  if (!picked) problems.push(`bad pick (${parsed.pick})`);
  if (!title || title.length > 120) problems.push('bad title');
  if (words < 30 || words > 140) problems.push(`body ${words} words`);
  if (isRefusalSummary(body)) problems.push('refusal body');
  if (choices.length < 2 || choices.length > 4) problems.push(`${choices.length} usable choices`);
  if (problems.length) {
    console.warn(`  ✗ Daily question rejected (${problems.join('; ')}) — no question today.`);
    return null;
  }

  console.log(`  ✓ "${title}" (from: ${picked.label})`);
  return { date: todayMT, title, body, choices, sourceUrl: picked.url || '', topics: picked.topics || [] };
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

  // Same idea for the Claude API: the configured CLAUDE_MODEL must be
  // valid before Task 1 / Task 1b run, or every meeting summary call
  // errors silently and stale "agenda hasn't been posted yet"
  // placeholders pile up in MANUAL_SUMMARIES until someone notices the
  // weekly email looks wrong. claude-sonnet-4-20250514 was retired
  // 2026-06-15 20:48 UTC and produced 5 days of broken summaries
  // before being caught. A single tiny test call at startup catches
  // the next retirement within 6 hours.
  await checkClaudeHealth();

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
    ['FIRE_CACHED_DATA',      syncFireAgendas],
    ['COUNTY_CACHED_DATA',    syncCountyAgendas],
    ['TELLURIDE_CACHED_DATA', syncTellurideAgendas]
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

  // HARC agenda PACKAGES (DocumentType 4) → packetUrl on TELLURIDE_CACHED_DATA
  // (green "Agenda Packet" button; requested 2026-07-21).
  try {
    const harcPackets = await syncTellurideHarcPackets();
    if (harcPackets && Object.keys(harcPackets).length > 0) {
      const { src, changed: n } = patchAgendaUrls(govDataSrc, 'TELLURIDE_CACHED_DATA', harcPackets, 'packetUrl');
      if (n > 0) { govDataSrc = src; govDataChanged = true; console.log(`  TELLURIDE_CACHED_DATA: patched ${n} packetUrl field(s)`); }
    }
  } catch (e) { console.warn('  HARC packet sync failed:', e.message); }

  // ── 0a. Mountain Village: rebuild MV_CACHED_DATA from the live TC + DRB pages ──
  // syncMVAgendas() now returns a freshly-generated stub array (upcoming
  // Town-Council + Design-Review-Board meetings, each matched to its agenda/
  // packet PDF) instead of a URL-patch map, so MV never goes stale. Bump
  // MV_CACHE_DATE so the source-health staleness check stays green.
  try {
    const mvStubs = await syncMVAgendas();
    if (mvStubs && mvStubs.length) {
      const existing = extractJsArray(govDataSrc, 'MV_CACHED_DATA') || [];
      if (JSON.stringify(mvStubs) !== JSON.stringify(existing)) {
        govDataSrc = replaceJsValue(govDataSrc, 'MV_CACHED_DATA', mvStubs, false);
        govDataChanged = true;
        console.log(`  MV_CACHED_DATA: rebuilt (${mvStubs.length} meetings)`);
      }
      govDataSrc = replaceConstString(govDataSrc, 'MV_CACHE_DATE', today());
      govDataChanged = true;
    }
  } catch (e) {
    console.warn(`  MV agenda sync error: ${e.message}`);
  }

  // ── 0a2. Hospital District: rebuild MED_CACHED_DATA (real agendas + 4th-Thu) ──
  try {
    const medStubs = await rebuildMedMeetings();
    if (medStubs && medStubs.length) {
      const existing = extractJsArray(govDataSrc, 'MED_CACHED_DATA') || [];
      if (JSON.stringify(medStubs) !== JSON.stringify(existing)) {
        govDataSrc = replaceJsValue(govDataSrc, 'MED_CACHED_DATA', medStubs, false);
        govDataChanged = true;
        console.log(`  MED_CACHED_DATA: rebuilt (${medStubs.length} meetings)`);
      }
      govDataSrc = replaceConstString(govDataSrc, 'MED_CACHE_DATE', today());
      govDataChanged = true;
    }
  } catch (e) { console.warn(`  Med rebuild error: ${e.message}`); }

  // ── 0a3. Board of Education: rebuild SCHOOL_CACHED_DATA from posted agendas ──
  try {
    const schoolStubs = await rebuildSchoolMeetings();
    if (schoolStubs && schoolStubs.length) {
      const existing = extractJsArray(govDataSrc, 'SCHOOL_CACHED_DATA') || [];
      if (JSON.stringify(schoolStubs) !== JSON.stringify(existing)) {
        govDataSrc = replaceJsValue(govDataSrc, 'SCHOOL_CACHED_DATA', schoolStubs, false);
        govDataChanged = true;
        console.log(`  SCHOOL_CACHED_DATA: rebuilt (${schoolStubs.length} meetings)`);
      }
      govDataSrc = replaceConstString(govDataSrc, 'SCHOOL_CACHE_DATE', today());
      govDataChanged = true;
    }
  } catch (e) { console.warn(`  School rebuild error: ${e.message}`); }

  // ── 0a4. Ophir: project General Assembly (3rd-Tue) meetings forward ──
  //   Runs BEFORE the Ophir agenda sync (0c) so patchAgendaUrls can attach
  //   agendas to the freshly-projected GA stubs.
  try {
    const existing = extractJsArray(govDataSrc, 'OPHIR_CACHED_DATA') || [];
    const ophirStubs = rebuildOphirMeetings(existing);
    if (ophirStubs && ophirStubs.length) {
      if (JSON.stringify(ophirStubs) !== JSON.stringify(existing)) {
        govDataSrc = replaceJsValue(govDataSrc, 'OPHIR_CACHED_DATA', ophirStubs, false);
        govDataChanged = true;
        console.log(`  OPHIR_CACHED_DATA: rebuilt (${ophirStubs.length} meetings)`);
      }
      govDataSrc = replaceConstString(govDataSrc, 'OPHIR_CACHE_DATE', today());
      govDataChanged = true;
    }
  } catch (e) { console.warn(`  Ophir rebuild error: ${e.message}`); }

  // ── 0a5. Ridgway: project Town Council (2nd-Wed) meetings forward ──
  //   Agenda URLs resolve from RIDGWAY_AGENDA_MAP by date at render time.
  try {
    const existing = extractJsArray(govDataSrc, 'RIDGWAY_CACHED_DATA') || [];
    const ridgwayStubs = rebuildRidgwayMeetings(existing);
    if (ridgwayStubs && ridgwayStubs.length) {
      if (JSON.stringify(ridgwayStubs) !== JSON.stringify(existing)) {
        govDataSrc = replaceJsValue(govDataSrc, 'RIDGWAY_CACHED_DATA', ridgwayStubs, false);
        govDataChanged = true;
        console.log(`  RIDGWAY_CACHED_DATA: rebuilt (${ridgwayStubs.length} meetings)`);
      }
      govDataSrc = replaceConstString(govDataSrc, 'RIDGWAY_CACHE_DATE', today());
      govDataChanged = true;
    }
  } catch (e) { console.warn(`  Ridgway rebuild error: ${e.message}`); }

  // ── 0b. SMART: rebuild SMART_CACHED_DATA from the live board-meetings page ──
  // syncSmartAgendas() now returns a freshly-generated stub array (2nd-Thursday
  // dates + agenda/packet URLs + one upcoming placeholder) instead of patching a
  // hand-curated list, so SMART never goes stale. Bump SMART_CACHE_DATE so the
  // source-health staleness check stays green.
  try {
    const smartStubs = await syncSmartAgendas();
    if (smartStubs && smartStubs.length) {
      const existing = extractJsArray(govDataSrc, 'SMART_CACHED_DATA') || [];
      if (JSON.stringify(smartStubs) !== JSON.stringify(existing)) {
        govDataSrc = replaceJsValue(govDataSrc, 'SMART_CACHED_DATA', smartStubs, false);
        govDataChanged = true;
        console.log(`  SMART_CACHED_DATA: rebuilt (${smartStubs.length} meetings)`);
      }
      govDataSrc = replaceConstString(govDataSrc, 'SMART_CACHE_DATE', today());
      govDataChanged = true;
    }
  } catch (e) {
    console.warn(`  SMART agenda sync error: ${e.message}`);
  }

  // ── 0c. Ophir (GA + P&Z) agenda URLs ──
  try {
    const ophirMap = await syncOphirAgendas(govDataSrc);
    if (ophirMap && Object.keys(ophirMap).length) {
      const r = patchAgendaUrls(govDataSrc, 'OPHIR_CACHED_DATA', ophirMap);
      if (r.changed > 0) {
        govDataSrc = r.src; govDataChanged = true;
        console.log(`  OPHIR_CACHED_DATA: patched ${r.changed} agendaUrl field(s)`);
      }
    }
  } catch (e) {
    console.warn(`  Ophir agenda sync error: ${e.message}`);
  }

  // ── 0d. Telluride Board of Education — now handled by the 0a3 rebuild above,
  //   which regenerates SCHOOL_CACHED_DATA from the posted agendas (date + type
  //   + URL all come straight from syncSchoolAgendas), so the old patch-only
  //   step (patchSchoolAgendas) is no longer needed.

  // ── 1. Meeting Summaries + Agenda-derived Zoom info ──
  // refreshSummaries now also parses Zoom URL / Meeting ID / Passcode /
  // Phone out of each agenda PDF (CivicClerk + CivicWeb) and stores it
  // in a parallel MEETING_AGENDA_META map. gov-hub.html zoomPanel reads
  // that map first, falling back to the static MEETING_ZOOM_LINKS /
  // MEETING_PASSCODES config for sources without an agenda PDF.
  const existingSummaries = extractJsObject(govHubSrc, 'MANUAL_SUMMARIES') || {};
  const existingMeta      = extractJsObject(govHubSrc, 'MEETING_AGENDA_META') || {};
  const { summaries: newSummaries, agendaMeta: newMeta } = await refreshSummaries(existingSummaries, existingMeta);
  if (JSON.stringify(newSummaries) !== JSON.stringify(existingSummaries)) {
    govHubSrc = replaceJsValue(govHubSrc, 'MANUAL_SUMMARIES', newSummaries, true);
    govHubSrc = replaceConstString(govHubSrc, 'MANUAL_SUMMARIES_CACHE_DATE', today());
    changed = true;
  }
  if (JSON.stringify(newMeta) !== JSON.stringify(existingMeta)) {
    govHubSrc = replaceJsValue(govHubSrc, 'MEETING_AGENDA_META', newMeta, true);
    changed = true;
  }

  // ── 1a. Telluride board/commission meetings (Town Council, P&Z, Housing
  // Authority Subcommittee, Ethics, joint P&Z/HARC) — surfaced via
  // TELLURIDE_BOARD_MEETINGS so the site renders the bodies the bot already
  // summarizes (was HARC-only). Returns null on fetch failure → keep existing.
  try {
    const existingTellBoard = extractJsArray(govHubSrc, 'TELLURIDE_BOARD_MEETINGS') || [];
    const newTellBoard = await syncTellurideBoardMeetings();
    if (newTellBoard !== null && JSON.stringify(newTellBoard) !== JSON.stringify(existingTellBoard)) {
      govHubSrc = replaceJsValue(govHubSrc, 'TELLURIDE_BOARD_MEETINGS', newTellBoard, false);
      changed = true;
      console.log(`  TELLURIDE_BOARD_MEETINGS: ${newTellBoard.length} meeting(s)`);
    }
  } catch (e) {
    console.warn(`  Telluride board meetings sync error: ${e.message}`);
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
  // SMBF lives in its own array — kept isolated from TT so a future TT
  // scraper change can't accidentally drop SMBF entries (user explicitly
  // asked that it be on a regular schedule and "not lost in other updates").
  const existingSmbArticles = extractJsArray(govHubSrc, 'SMB_FORUM_ARTICLES') || [];
  const { ttArticles, kotoNewscasts, kotoFeatured, smbArticles } =
    await refreshNews(existingTtArticles, existingSmbArticles);
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
  // SMBF: write whenever the array changed in any way (length, content,
  // ordering). Skip the write only when byte-identical to preserve the
  // "no diff, no commit" optimization in the workflow.
  if (JSON.stringify(smbArticles) !== JSON.stringify(existingSmbArticles)) {
    govHubSrc = replaceJsValue(govHubSrc, 'SMB_FORUM_ARTICLES', smbArticles, false);
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

  // ── 6. Blog from sent Customer.io broadcasts ──
  // Turn any newsletter sent via the Digest Review Desk (recorded in
  // data/sent-broadcasts.json by the digest Worker) into a BLOG_POSTS entry.
  const existingBlogPosts = extractJsArray(govHubSrc, 'BLOG_POSTS') || [];
  const updatedBlogPosts = await syncBroadcastBlog(existingBlogPosts);
  // Compare content, not just length — the enrich pass changes images/excerpts
  // in place (same count) and pruning digests changes count.
  if (JSON.stringify(updatedBlogPosts) !== JSON.stringify(existingBlogPosts)) {
    govHubSrc = replaceJsValue(govHubSrc, 'BLOG_POSTS', updatedBlogPosts, false);
    changed = true;
    const delta = updatedBlogPosts.length - existingBlogPosts.length;
    console.log(`  BLOG_POSTS: ${delta >= 0 ? '+' : ''}${delta} (net); images/excerpts/digests updated`);
  }

  // ── 7. Telluride Humane Society Adoptable Animals ──
  // Pass the existing array IN so syncHumaneSocietyAnimals can preserve
  // each animal's `firstSeen` / `revealDate` (the stagger scheduling
  // fields) across runs. On API error the sync returns the existing
  // list unchanged.
  const existingAnimals = extractJsArray(govHubSrc, 'HUMANE_SOCIETY_ANIMALS') || [];
  const newAnimals = await syncHumaneSocietyAnimals(existingAnimals);
  if (Array.isArray(newAnimals)) {
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

  // ── 10b. Sheridan Opera House Events ──
  const newSheridanEvents = await syncSheridanEvents();
  if (newSheridanEvents !== null && newSheridanEvents !== undefined) {
    const existingSheridan = extractJsArray(govHubSrc, 'SHERIDAN_EVENTS') || [];
    if (JSON.stringify(newSheridanEvents) !== JSON.stringify(existingSheridan)) {
      govHubSrc = replaceJsValue(govHubSrc, 'SHERIDAN_EVENTS', newSheridanEvents, false);
      changed = true;
      console.log(`  SHERIDAN_EVENTS updated (was ${existingSheridan.length}, now ${newSheridanEvents.length})`);
    }
  }

  // ── 10c. The Alibi (Event Calendar App) ──
  const newAlibiEvents = await syncAlibiEvents();
  if (newAlibiEvents !== null && newAlibiEvents !== undefined) {
    const existingAlibi = extractJsArray(govHubSrc, 'ALIBI_EVENTS') || [];
    if (JSON.stringify(newAlibiEvents) !== JSON.stringify(existingAlibi)) {
      govHubSrc = replaceJsValue(govHubSrc, 'ALIBI_EVENTS', newAlibiEvents, false);
      changed = true;
      console.log(`  ALIBI_EVENTS updated (was ${existingAlibi.length}, now ${newAlibiEvents.length})`);
    }
  }

  // ── 10 (removed): Telluride Foundation events are HAND-CURATED in
  //    gov-helpers.js (TELLURIDE_FOUNDATION_EVENTS). The old scraper wrote to a
  //    dead const name (TF_FOUNDATION_EVENTS, nothing read it) and its result was
  //    discarded every run. Removed per audit to stop the waste and protect the
  //    hand-curated list.


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

  // ── 19. Telluride.com Events (fcEventsData fast parser, 2026-05-29) ──
  // Previous implementation (syncTelluridComEvents) fetched the sitemap
  // then each /event/<slug>/ page individually — 300+ HTTP requests
  // per run. The new fast version hits one page and parses the inline
  // fcEventsData array. Old function kept above for fallback.
  const newTelluridComEvents = await syncTelluridComEventsFast();
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
  // REMOVED (2026-07-22 audit P0-3): the write here targeted OURAY_CACHED_DATA /
  // OURAY_CACHE_DATE, consts that don't exist in any live file — it silently
  // no-opped since the May 2026 gov-hub.js retirement. Ouray meetings actually
  // surface via getOurayMeetings() in gov-helpers.js, which reads the
  // 'ouray|<date>|…' MANUAL_SUMMARIES keys written by the agenda/summary task
  // (AGENDA_SOURCES.ouray above) — so the dead write path and its redundant
  // syncOurayMeetings() AgendaCenter fetch are removed rather than resurrected.

  // ── Norwood meetings: rebuild (scraped agendas + cadence placeholders) ──
  // NORWOOD_CACHED_DATA lives in gov-data.js — patch THAT buffer. The town's
  // meeting pages list only PAST meetings (each posts with its agenda shortly
  // before the date), so a scrape-only rebuild goes empty in the gap between
  // agenda postings — that's what wiped the list on 2026-07-22. Cadences
  // verified from the town's own 2026 history (never guessed): Board of
  // Trustees = 2nd Wednesday (1/14, 2/11, 3/11, 4/8, 5/13, 6/10, 7/8); P&Z =
  // 3rd Monday (3/16, 4/20, 5/18, 6/15 — shifts when that Monday is a
  // holiday, and the real agenda wins on reconcile when it posts).
  const newNorwoodData = await syncNorwoodMeetings();
  if (newNorwoodData === null) {
    console.warn('  Norwood: fetch failed — preserving existing NORWOOD_CACHED_DATA');
  } else {
    const norwoodNote = 'Next scheduled meeting -- agenda posted before the meeting.';
    const botStubs = assembleBoardStubs(newNorwoodData.filter(e => e.board === 'bot'),
      { nth: 2, weekday: 3 },
      { title: 'Board of Trustees Meeting', board: 'bot', placeholders: 2, note: norwoodNote });
    const pzStubs = assembleBoardStubs(newNorwoodData.filter(e => e.board === 'pz'),
      { nth: 3, weekday: 1 },
      { title: 'Planning and Zoning Commission Meeting', board: 'pz', placeholders: 2, note: norwoodNote });
    const norwoodStubs = [...(botStubs || []), ...(pzStubs || [])]
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (norwoodStubs.length) {
      const existingNorwood = extractJsArray(govDataSrc, 'NORWOOD_CACHED_DATA') || [];
      if (JSON.stringify(norwoodStubs) !== JSON.stringify(existingNorwood)) {
        govDataSrc = replaceJsValue(govDataSrc, 'NORWOOD_CACHED_DATA', norwoodStubs, false);
        govDataChanged = true;
        console.log(`  NORWOOD_CACHED_DATA: rebuilt (${norwoodStubs.length} meetings)`);
      }
      govDataSrc = replaceConstString(govDataSrc, 'NORWOOD_CACHE_DATE', today());
      govDataChanged = true;
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

  // ── Task 22: Telluride Science Town Talks ──
  const newScienceEvents = await syncTellurideScienceEvents();
  if (newScienceEvents !== undefined && newScienceEvents !== null) {
    const existingScience = extractJsArray(govHubSrc, 'TELLURIDE_SCIENCE_EVENTS') || [];
    if (JSON.stringify(newScienceEvents) !== JSON.stringify(existingScience)) {
      govHubSrc = replaceJsValue(govHubSrc, 'TELLURIDE_SCIENCE_EVENTS', newScienceEvents, false);
      changed = true;
      console.log(`  TELLURIDE_SCIENCE_EVENTS updated (was ${existingScience.length}, now ${newScienceEvents.length})`);
    }
  }

  // ── Task 23: fill movie posters in recurring-acts.json (writes its own file;
  //    committed by the workflow's git add -A). No-op without TMDB_API_KEY. ──
  try { await enrichRecurringActsPosters(); } catch (e) { console.warn('  recurring-acts poster enrich failed:', e.message); }

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

  // ── Task 20d: Rico agenda map ──
  const newRicoAgendas = await syncRicoAgendas();
  if (newRicoAgendas !== null) {
    const rawRico = (() => {
      const startRe = /const\s+RICO_AGENDA_MAP\s*=\s*\{/;
      const mm = startRe.exec(govHubSrc);
      if (!mm) return {};
      let depth = 0, start = mm.index + mm[0].length - 1;
      for (let i = start; i < govHubSrc.length; i++) {
        if (govHubSrc[i] === '{') depth++;
        else if (govHubSrc[i] === '}') { depth--; if (depth === 0) {
          try { return JSON.parse(govHubSrc.slice(start, i + 1)); } catch { return {}; }
        }}
      }
      return {};
    })();
    if (JSON.stringify(newRicoAgendas) !== JSON.stringify(rawRico)) {
      govHubSrc = replaceJsValue(govHubSrc, 'RICO_AGENDA_MAP', newRicoAgendas, true);
      changed = true;
      console.log(`  RICO_AGENDA_MAP updated: ${Object.keys(newRicoAgendas).length} entries`);
    }
  }

  // ── Task 21: Rick AI summaries for events with no source content ──
  // Runs AFTER all event syncs so it sees the freshest versions of each
  // array. Reads the per-source arrays back out of govHubSrc (which has
  // them as JS literals), generates Rick summaries for entries with no
  // description, then writes the patched arrays back into govHubSrc.
  const eventArrayNames = [
    'WILKINSON_EVENTS', 'KOTO_COMMUNITY_EVENTS', 'SHERIDAN_EVENTS',
    'ALIBI_EVENTS', 'SHERBINO_EVENTS', 'NUCLA_NATURITA_EVENTS',
    'CLUB_RED_SHOWS', 'FRESH_FOOD_HUB_EVENTS',
    'MUSIC_ON_THE_GREEN', 'COMMUNITY_EVENTS', 'TELLURIDE_COM_EVENTS',
    'OURAY_COUNTY_EVENTS', 'MOUNTAIN_VILLAGE_EVENTS', 'NORWOOD_EVENTS',
  ];
  const arraySnapshot = {};
  for (const name of eventArrayNames) {
    arraySnapshot[name] = extractJsArray(govHubSrc, name) || [];
  }
  const flattened = Object.values(arraySnapshot);
  const updated = await syncEventDescriptions(flattened);
  if (updated > 0) {
    // Some descriptions were generated — write each array back into govHubSrc
    for (const name of eventArrayNames) {
      const arr = arraySnapshot[name];
      if (!arr || arr.length === 0) continue;
      govHubSrc = replaceJsValue(govHubSrc, name, arr, false);
    }
    changed = true;
    console.log(`  ${updated} event description(s) generated by Rick — gov-helpers.js will commit.`);
  }

  // ── Task 21b: Reconcile cross-source date conflicts by source trust ──
  // Runs after all event arrays are in govHubSrc. Generalized MV-wrong-dates
  // fix: any source ranked LOW in lib/source-trust.js has its date-conflicting
  // copies dropped against higher-trust sources. Currently only Mountain
  // Village is LOW; adding another unreliable source is a one-line config edit.
  {
    const { reconcileByTrust } = require('./lib/source-trust.js');
    const reconcileNames = [
      'KOTO_COMMUNITY_EVENTS', 'SHERIDAN_EVENTS', 'TELLURIDE_COM_EVENTS', 'TELLURIDE_SCIENCE_EVENTS',
      'WILKINSON_EVENTS', 'COMMUNITY_EVENTS', 'ALIBI_EVENTS', 'SHERBINO_EVENTS',
      'NUCLA_NATURITA_EVENTS', 'CLUB_RED_SHOWS', 'FRESH_FOOD_HUB_EVENTS',
      'OURAY_COUNTY_EVENTS', 'OURAY_RIDGWAY_EVENTS', 'NORWOOD_EVENTS', 'MOUNTAIN_VILLAGE_EVENTS',
    ];
    const arraysByName = {};
    for (const n of reconcileNames) arraysByName[n] = extractJsArray(govHubSrc, n) || [];
    const result = reconcileByTrust(arraysByName);
    for (const [name, { kept, dropped }] of Object.entries(result)) {
      govHubSrc = replaceJsValue(govHubSrc, name, kept, false);
      changed = true;
      console.log(`  Trust reconcile: dropped ${dropped.length} wrong-date copy(ies) from ${name}:`);
      for (const d of dropped) console.log(`    - "${d.title}" ${d.mvDate} vs trusted ${d.trustedDate}`);
    }
  }

  // ── Task 24: Hub-Bub Question of the Day ──
  // Runs after previews/summaries/news are final in govHubSrc so the question
  // is built from what this run will actually ship. At most one per MT day.
  try {
    const existingQuestions = extractJsArray(govHubSrc, 'DAILY_QUESTIONS') || [];
    const newQuestion = await refreshDailyQuestion(govHubSrc, existingQuestions);
    if (newQuestion) {
      govHubSrc = replaceJsValue(govHubSrc, 'DAILY_QUESTIONS', [newQuestion, ...existingQuestions].slice(0, 30), false);
      changed = true;
      console.log(`  DAILY_QUESTIONS: "${newQuestion.title}" queued for ${newQuestion.date}`);
    }
  } catch (e) {
    console.warn('  Daily question task failed (non-fatal):', e.message);
  }

  // ── Guard: never ship a data file that won't parse ──
  // A single unterminated string (e.g. a bot summary with a raw newline) would
  // take the whole file — and every page that loads it — offline (happened
  // 2026-07-01: BLOG_POSTS + all dynamic content went dark). new Function()
  // COMPILES the source (top-level const/function are valid function-body
  // statements) WITHOUT executing it; a SyntaxError aborts the run before any
  // write, so the last good file stays in place and the workflow commits nothing.
  const assertParses = (label, src) => {
    try { new Function(src); }
    catch (e) { throw new Error(`${label} would be INVALID JS (${e.message}) — aborting write so a broken file is never shipped.`); }
  };
  if (changed) { assertParses('gov-helpers.js', govHubSrc); assertParses('community-pulse.js', pulseSrc); }
  if (govDataChanged) assertParses('gov-data.js', govDataSrc);

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

  // ── JS→JSON migration (Phase 1): mirror bot-managed arrays to data/<name>.json
  // alongside the JS literal (write-if-different, so no-op on a no-change run).
  // No client reads these yet; test/json-mirror.test.js asserts they match the
  // JS. Runs regardless of `changed` so the mirror self-heals if it ever drifts.
  // Mirrors come from the EVALUATED on-disk files (mirrorAll → lib/load-data.js),
  // which handles IIFE consts string-extraction can't. A missing/mistyped const
  // is FATAL: the run aborts (nothing commits, CI Health issue opens) instead of
  // shipping a valid-but-empty mirror over live data (2026-07-22 audit P0-2).
  // Runs after the JS files are written so it always mirrors what will ship.
  {
    const { written, failures } = mirrorAll(REPO_ROOT);
    console.log(`  JSON mirrors: ${written.length} written/verified.`);
    if (failures.length) {
      throw new Error('JSON mirror FAILED — refusing to ship (a missing const would be mirrored as empty and wipe live data):\n  ' + failures.join('\n  '));
    }
  }
  // Precomputed week-meetings.json: all sources aggregated via the shared
  // getters (incl. CivicClerk-config meetings the raw seeds miss), so the
  // homepage/gov-hub read ONE file. Runs after the data files are written.
  try { require('./build-week-meetings.js').run(REPO_ROOT); }
  catch (e) { console.warn('  week-meetings build failed: ' + e.message); }
  // Precomputed events-index.json: all 22 event mirrors normalized, deduped,
  // filtered, town-pinned, with category-fallback images (redesign events page).
  try { require('./build-events-index.js').run(REPO_ROOT); }
  catch (e) { console.warn('  events-index build failed: ' + e.message); }
  // Deep-dive ⇄ gov-hub cross-reference: which upcoming/recent meetings touch
  // each deep-dive topic, plus staleness flags (data/deep-dive-watch.json).
  try { require('./build-deep-dive-watch.js').run(REPO_ROOT); }
  catch (e) { console.warn('  deep-dive-watch build failed: ' + e.message); }
  // Featured Action of the Week (homepage) — picks the top upcoming
  // deep-dive-linked meeting from the watch + week-meetings just built.
  try { require('./build-featured-action.js').run(REPO_ROOT); }
  catch (e) { console.warn('  featured-action build failed: ' + e.message); }

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
