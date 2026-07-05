#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Daily Maintenance
 * Runs via GitHub Actions once daily
 *
 * Combines:
 *   1. Expired legal notice cleanup
 *   2. Stale news article removal (>14 days)
 *   3. Expired community pulse post removal (>5 days)
 *   4. External link health check
 *   5. (retired) File parity check
 * ══════════════════════════════════════════════════════════════
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { serializeArray } = require('./lib/serialize.js');
const { extractJsArray } = require('./lib/extract.js');
const { assertParses } = require('./lib/write-guard.js');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HELPERS_JS = path.join(REPO_ROOT, 'js', 'gov-helpers.js');
const COMMUNITY_PULSE_JS = path.join(REPO_ROOT, 'js', 'community-pulse.js');
const INDEX_HTML = path.join(REPO_ROOT, 'index.html');
// Daily deterministic code/site review findings (gitignored — read by the
// "Daily review findings" issue step in maintenance.yml, never committed).
const REVIEW_FINDINGS_FILE = path.join(REPO_ROOT, 'review-findings.log');

const NEWS_MAX_AGE_DAYS = 14;
const PULSE_MAX_AGE_DAYS = 5;
const LINK_CHECK_SAMPLE_SIZE = 20; // Check 20 random links per run
const LINK_TIMEOUT_MS = 10000;

let issues = [];
let changed = false;
let reviewFindings = [];   // daily deterministic code/site review (separate from liveness `issues`)

// ── HTTP helper ──
function checkUrl(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'TellurideGovHub/2.0 (link-checker)' },
      timeout: LINK_TIMEOUT_MS
    }, (res) => {
      resolve({ url, status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 400 });
    });
    req.on('error', (err) => resolve({ url, status: 0, ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ url, status: 0, ok: false, error: 'timeout' }); });
  });
}

// Fetch text body + status + headers, with a timeout. Used by the liveness
// checks below (feed.xml freshness, Google Sheet CSV reachability) where
// we need to inspect content, not just status.
function fetchText(url, timeoutMs = 10000, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'TellurideGovHub/2.0 (liveness-check)',
        ...headers
      },
      timeout: timeoutMs
    }, (res) => {
      // Follow redirects once (Google Sheets pub URLs sometimes 302).
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location, timeoutMs, headers).then(resolve, reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout after ' + timeoutMs + 'ms')); });
  });
}

// ── JS file parsing helpers ──
// extractJsArray comes from ./lib/extract.js (string-aware bracket matcher).

function replaceJsArray(source, varName, arr) {
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*\\[`);
  const match = startRe.exec(source);
  if (!match) return source;
  let depth = 0, braceStart = match.index + match[0].length - 1;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        let end = i + 1;
        while (end < source.length && source[end] !== ';') end++;
        if (source[end] === ';') end++;
        // Serialize via the shared, unit-tested serializer (JSON.stringify-based)
        // rather than the old apostrophe-only escaper that lived here — that one
        // emitted raw newlines/backslashes and produced unterminated string
        // literals, corrupting gov-helpers.js (the 2026-07-01 outage). See
        // lib/serialize.js and lib/write-guard.js.
        const block = serializeArray(varName, arr);
        return source.slice(0, match.index) + block + source.slice(end);
      }
    }
  }
  return source;
}

function replaceConstString(source, varName, newValue) {
  const re = new RegExp(`(const\\s+${varName}\\s*=\\s*)'[^']*'`);
  return source.replace(re, `$1'${newValue}'`);
}

function today() { return new Date().toISOString().split('T')[0]; }

function parseDate(str) {
  if (!str) return null;
  // Try ISO format
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  // Try "Month Day, Year"
  const named = str.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) return new Date(`${named[1]} ${named[2]}, ${named[3]}`);
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// ══════════════════════════════════════════════════════════════
// ── Task 1: Expired Legal Notice Cleanup ──
// ══════════════════════════════════════════════════════════════

function cleanupLegalNotices(govHubSrc) {
  console.log('\n⚖️ Task 1: Legal notice cleanup...');
  const notices = extractJsArray(govHubSrc, 'LEGAL_NOTICES') || [];
  const todayStr = today();
  const active = notices.filter(n => {
    if (n.expires && n.expires < todayStr) {
      console.log(`  Expired: ${n.title} (${n.expires})`);
      return false;
    }
    return true;
  });
  const removed = notices.length - active.length;
  if (removed > 0) {
    console.log(`  Removed ${removed} expired notices`);
    govHubSrc = replaceJsArray(govHubSrc, 'LEGAL_NOTICES', active);
    govHubSrc = replaceConstString(govHubSrc, 'LEGAL_NOTICES_CACHE_DATE', todayStr);
    changed = true;
  } else {
    console.log(`  All ${notices.length} notices still active`);
  }
  return govHubSrc;
}

// ══════════════════════════════════════════════════════════════
// ── Task 2: Stale News Removal ──
// ══════════════════════════════════════════════════════════════

function cleanupNews(govHubSrc) {
  console.log('\n📰 Task 2: Stale news cleanup...');
  const cutoff = new Date(Date.now() - NEWS_MAX_AGE_DAYS * 86400000);

  for (const varName of ['TELLURIDE_TIMES_ARTICLES', 'KOTO_NEWSCASTS', 'KOTO_FEATURED_STORIES']) {
    const articles = extractJsArray(govHubSrc, varName) || [];
    const fresh = articles.filter(a => {
      const d = parseDate(a.date);
      if (d && d < cutoff) {
        console.log(`  Stale: [${varName}] ${a.title} (${a.date})`);
        return false;
      }
      return true;
    });
    if (fresh.length < articles.length) {
      govHubSrc = replaceJsArray(govHubSrc, varName, fresh);
      changed = true;
      console.log(`  ${varName}: removed ${articles.length - fresh.length}, kept ${fresh.length}`);
    } else {
      console.log(`  ${varName}: all ${articles.length} articles fresh`);
    }
  }
  return govHubSrc;
}

// ══════════════════════════════════════════════════════════════
// ── Task 3: Expired Community Pulse Posts ──
// ══════════════════════════════════════════════════════════════

function cleanupPulse(pulseSrc) {
  console.log('\n💬 Task 3: Community pulse cleanup...');
  const posts = extractJsArray(pulseSrc, 'COMMUNITY_PULSE_POSTS') || [];
  const cutoff = new Date(Date.now() - PULSE_MAX_AGE_DAYS * 86400000);
  const fresh = posts.filter(p => {
    const d = new Date(p.postedAt);
    if (d < cutoff) {
      console.log(`  Expired: ${p.title} (${p.postedAt})`);
      return false;
    }
    return true;
  });
  if (fresh.length < posts.length) {
    pulseSrc = replaceJsArray(pulseSrc, 'COMMUNITY_PULSE_POSTS', fresh);
    pulseSrc = replaceConstString(pulseSrc, 'COMMUNITY_PULSE_CACHE_DATE', today());
    changed = true;
    console.log(`  Removed ${posts.length - fresh.length} expired posts, kept ${fresh.length}`);
  } else {
    console.log(`  All ${posts.length} posts still fresh`);
  }
  return pulseSrc;
}

// ══════════════════════════════════════════════════════════════
// ── Task 4: Link Health Check ──
// ══════════════════════════════════════════════════════════════

async function checkLinks(govHubSrc, pulseSrc) {
  console.log('\n🔗 Task 4: Link health check...');

  // Extract all URLs from both files
  const urlRe = /https?:\/\/[^\s'"`,)}\]]+/g;
  const allUrls = new Set();
  let m;
  while ((m = urlRe.exec(govHubSrc)) !== null) allUrls.add(m[0]);
  urlRe.lastIndex = 0;
  while ((m = urlRe.exec(pulseSrc)) !== null) allUrls.add(m[0]);

  // Filter to actual content URLs (not API endpoints or internal refs).
  // Also drop URLs that captured template-literal source fragments — the
  // regex above doesn't exclude `$` or `{`, so an expression like
  // `${ev.urlname || ev.id}` inside a backtick string gets caught up to
  // the first whitespace as a fake URL. Anything containing `${` is
  // source code, not a real link.
  const contentUrls = [...allUrls].filter(u =>
    !u.includes('${') &&
    !u.includes('api.codetabs.com') &&
    !u.includes('api.allorigins.win') &&
    !u.includes('api.rss2json.com') &&
    !u.includes('civicweb.net/Services') &&
    !u.includes('RSSFeed.aspx') &&
    !u.includes('googleapis.com') &&
    !u.includes('firebaseio.com')
  );

  console.log(`  Total content URLs: ${contentUrls.length}`);

  // Sample random subset
  const sample = contentUrls
    .sort(() => Math.random() - 0.5)
    .slice(0, LINK_CHECK_SAMPLE_SIZE);

  console.log(`  Checking ${sample.length} random URLs...`);

  const results = await Promise.all(sample.map(checkUrl));
  // 403/429 = the origin refused our CI runner's IP (KOTO, Ridgway, some gov
  // hosts bot-block), NOT a removed page — those links work in a real browser.
  // Treat them as blocked-not-dead so genuine 404/410/5xx/DNS failures aren't
  // buried under IP-block noise.
  const blocked = results.filter(r => !r.ok && (r.status === 403 || r.status === 429));
  const dead = results.filter(r => !r.ok && r.status !== 403 && r.status !== 429);

  if (blocked.length > 0) {
    console.log(`  ℹ ${blocked.length} link(s) returned 403/429 (CI-IP blocked, not counted dead): ${blocked.slice(0, 5).map(b => b.url).join(', ')}`);
  }
  if (dead.length > 0) {
    console.log(`\n  ⚠️ ${dead.length} dead links found:`);
    for (const d of dead) {
      console.log(`    ${d.status || 'ERR'} ${d.url} ${d.error || ''}`);
      issues.push(`Dead link: ${d.url} (${d.status || d.error})`);
    }
  } else {
    console.log(`  ✓ All ${sample.length} checked links are healthy`);
  }
}

// ══════════════════════════════════════════════════════════════
// ── Task 5: (retired) ──
// ══════════════════════════════════════════════════════════════

function checkParity() {
  // telluride-gov-hub.html was deleted 2026-05-12. The site uses
  // a split-page architecture. No file-parity check needed.
  console.log('\n📄 Task 5: Parity check — skipped (single-source architecture)');
}

// ══════════════════════════════════════════════════════════════
// ── Liveness checks: off-machine pipeline health ──
// ══════════════════════════════════════════════════════════════
//
// The site has three "scheduled updates that happen off your machine"
// risks where the pipeline can break silently:
//   1. feed.xml stops being regenerated (content-refresh.yml broken,
//      build-rss-feed.js broken, GitHub Pages not serving)
//   2. Event-Sheet publish-to-web URL stops returning CSV (Apps Script
//      dead, Sheet deleted, publish disabled)
//   3. Mailchimp digest campaign paused (no API key check today, so we
//      can't detect this without opting in via MAILCHIMP_API_KEY)
//
// Each check pushes a human-readable description to `issues[]`. The
// existing "Report issues" step in maintenance.yml turns the file into
// a workflow warning, and the new failure-tracker step opens a tracked
// GitHub Issue if the workflow itself dies.

const FEED_URL = 'https://livabletelluride.org/feed.xml';
const FEED_STALE_HOURS = 12;
const EVENTS_CONFIG_FILE = path.join(REPO_ROOT, 'email-events-config.json');

async function checkFeedFreshness() {
  console.log('\n📰 Liveness: feed.xml freshness...');
  try {
    const res = await fetchText(FEED_URL, 10000);
    if (res.status !== 200) {
      issues.push(`feed.xml fetch returned HTTP ${res.status} — the site RSS feed is unreachable. URL: ${FEED_URL}`);
      return;
    }
    const m = res.body.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/);
    if (!m) {
      issues.push(`feed.xml does not contain <lastBuildDate> — RSS format may have broken in scripts/build-rss-feed.js`);
      return;
    }
    const lastBuild = new Date(m[1]);
    if (isNaN(lastBuild)) {
      issues.push(`feed.xml <lastBuildDate> is not a parseable date: "${m[1]}"`);
      return;
    }
    const hoursAgo = (Date.now() - lastBuild.getTime()) / 3600000;
    if (hoursAgo > FEED_STALE_HOURS) {
      issues.push(
        `feed.xml is STALE — lastBuildDate was ${hoursAgo.toFixed(1)}h ago ` +
        `(threshold: ${FEED_STALE_HOURS}h). Either content-refresh.yml stopped ` +
        `running, build-rss-feed.js is failing silently, or GitHub Pages isn't ` +
        `picking up commits. Check Actions tab for the most recent Content ` +
        `Refresh run.`
      );
    } else {
      console.log(`  ✓ feed.xml is fresh (lastBuildDate ${hoursAgo.toFixed(1)}h ago)`);
    }
  } catch (e) {
    issues.push(`feed.xml fetch failed: ${e.message}`);
  }
}

async function checkEventsSheet() {
  console.log('\n📥 Liveness: event Sheet CSV reachability...');
  let config;
  try {
    const raw = fs.readFileSync(EVENTS_CONFIG_FILE, 'utf8');
    config = JSON.parse(raw);
  } catch (e) {
    issues.push(`email-events-config.json missing or unreadable — email-to-events pipeline is misconfigured`);
    return;
  }
  if (!config.sheetCsvUrl) {
    console.log('  ℹ email-events-config.json has no sheetCsvUrl — pipeline is intentionally disabled');
    return;
  }
  try {
    const res = await fetchText(config.sheetCsvUrl, 15000);
    if (res.status !== 200) {
      issues.push(
        `Event Sheet CSV returned HTTP ${res.status}. The publish-to-web URL ` +
        `may have been disabled. Re-publish via Google Sheets → File → ` +
        `Share → Publish to web → Publish.`
      );
      return;
    }
    // Google Sheets publish-to-web sometimes serves HTML if "Stop publishing"
    // was clicked, even though the URL still returns 200. The CSV must have
    // the expected header row to be useful to content-refresh.js Task 5.
    const firstLine = (res.body || '').split('\n')[0];
    if (!/Status/i.test(firstLine) || !/Title/i.test(firstLine)) {
      issues.push(
        `Event Sheet CSV does not look like the expected schema. First row: ` +
        `"${firstLine.slice(0, 120)}". Expected to start with "Status,Title,Date,..." — ` +
        `the publish URL may be serving the wrong sheet tab or an HTML error page.`
      );
      return;
    }
    const rowCount = res.body.split('\n').filter(l => l.trim()).length - 1;
    console.log(`  ✓ Event Sheet CSV reachable (${rowCount} data rows)`);
  } catch (e) {
    issues.push(`Event Sheet CSV fetch failed: ${e.message}`);
  }
}


// ── Liveness: Telluride Times scrape (TT_AUTH_COOKIE) ──
// TT scraping uses an authenticated cookie (GH secret TT_AUTH_COOKIE) that
// expires silently. TELLURIDE_TIMES_ARTICLES is mixed-source (TT + gov news),
// so count actual "Telluride Times" items: if there are none, or the newest is
// stale, the cookie has likely expired (or the TT host/feed changed).
function checkTellurideTimesFreshness(govHubSrc) {
  console.log('\n📰 Liveness: Telluride Times scrape (TT_AUTH_COOKIE)...');
  const articles = extractJsArray(govHubSrc, 'TELLURIDE_TIMES_ARTICLES') || [];
  const tt = articles.filter(a => /telluride times/i.test(a.source || ''));
  if (tt.length === 0) {
    issues.push(
      `No "Telluride Times" articles in TELLURIDE_TIMES_ARTICLES — the TT scrape may be failing ` +
      `(TT_AUTH_COOKIE expired, or the TT feed/host changed). Check the latest content-refresh ` +
      `"[feed] Telluride Times HTTP …" log line; refresh the TT_AUTH_COOKIE secret if it's 401/empty.`
    );
    return;
  }
  const newest = tt.map(a => parseDate(a.date)).filter(Boolean).sort((a, b) => b - a)[0];
  if (newest) {
    const days = (Date.now() - newest.getTime()) / 86400000;
    if (days > 10) {
      issues.push(
        `Newest Telluride Times article is ${days.toFixed(0)} days old — the TT scrape may have ` +
        `stopped (TT_AUTH_COOKIE expired?). Refresh the cookie if TT has published since.`
      );
    } else {
      console.log(`  ✓ Newest Telluride Times article ${days.toFixed(1)} days old (${tt.length} TT items)`);
    }
  }
}

// ── Auto-maintain sitemap.xml from the public HTML pages ──
const SITEMAP_FILE = path.join(REPO_ROOT, 'sitemap.xml');
// Admin tools, email templates, and preview/scratch pages are NOT public.
const SITEMAP_EXCLUDE = new Set([
  'event-review.html', 'org-review.html', 'action-grid.html',
  'source-document.html', 'week-ahead-email-template.html', 'weekly-preview.html',
]);
function regenerateSitemap() {
  console.log('\n🗺  Task: regenerate sitemap.xml...');
  const base = 'https://livabletelluride.org';
  const locs = [];
  for (const f of fs.readdirSync(REPO_ROOT)) {
    if (!f.endsWith('.html') || SITEMAP_EXCLUDE.has(f)) continue;
    locs.push(f === 'index.html' ? base + '/' : `${base}/${f}`);
  }
  const pmDir = path.join(REPO_ROOT, 'projects-map');
  if (fs.existsSync(pmDir)) {
    for (const f of fs.readdirSync(pmDir)) {
      if (!f.endsWith('.html')) continue;
      locs.push(f === 'index.html' ? base + '/projects-map/' : `${base}/projects-map/${f}`);
    }
  }
  locs.sort((a, b) => (a === base + '/' ? -1 : b === base + '/' ? 1 : a.localeCompare(b)));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    locs.map(l => `  <url><loc>${l}</loc></url>`).join('\n') + `\n</urlset>\n`;
  let existing = '';
  try { existing = fs.readFileSync(SITEMAP_FILE, 'utf8'); } catch (_) {}
  if (xml !== existing) {
    fs.writeFileSync(SITEMAP_FILE, xml);
    console.log(`  ✓ sitemap.xml updated (${locs.length} URLs)`);
  } else {
    console.log(`  ✓ sitemap.xml current (${locs.length} URLs)`);
  }
}

// ══════════════════════════════════════════════════════════════
// ── Main ──
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ── Daily deterministic code/site review ──
// The pass/fail half of the manual review: JS syntax breakage,
// broken internal links / missing assets, and top-nav drift.
// Findings go to reviewFindings[] → review-findings.log → a
// dedicated GitHub issue (see maintenance.yml). Judgment-level
// review (data quality, UX) is the weekly Claude pass's job.
// ══════════════════════════════════════════════════════════════

const CANONICAL_NAV = ['Local News','Gov-Hub','Deep Dives','Events','Hub-Bub','Local Orgs','Projects Map','About','Donate'];

// Every .html that can carry the public top-nav (root + known subdirs).
function reviewHtmlFiles() {
  const out = [];
  for (const d of ['.', 'projects-map', 'v2']) {
    const dir = path.join(REPO_ROOT, d);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.html')) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

// 1. JS syntax — node --check every shipped/bot-managed script. A dropped
//    declaration in gov-data.js/gov-helpers.js silently breaks the site.
function reviewJsSyntax() {
  console.log('\n🔎 Review: JS syntax (node --check)');
  for (const d of ['js', 'scripts']) {
    const dir = path.join(REPO_ROOT, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
      try {
        execSync(`node --check ${JSON.stringify(path.join(dir, f))}`, { stdio: 'pipe' });
      } catch (e) {
        const out = ((e.stderr && e.stderr.toString()) || e.message || '');
        const line = out.split('\n').find(l => /Error/.test(l)) || 'parse error';
        reviewFindings.push(`JS syntax error in ${d}/${f}: ${line.trim()}`);
      }
    }
  }
}

// 2. Broken internal links / missing assets — every local href/src that
//    looks like a real static path must resolve on disk. Conservative:
//    rejects template literals and JS-built URLs to avoid false positives.
function reviewBrokenAssets() {
  console.log('\n🔎 Review: broken internal links / missing assets');
  const ref = /(?:href|src)\s*=\s*"([^"]+)"/g;
  for (const fp of reviewHtmlFiles()) {
    const src = fs.readFileSync(fp, 'utf8');
    const relName = path.relative(REPO_ROOT, fp);
    const fileDir = path.dirname(fp);
    const seen = new Set();
    let m;
    while ((m = ref.exec(src)) !== null) {
      const raw = m[1].trim();
      // External (non-livabletelluride) hosts, anchors, and non-http schemes — skip.
      if (/^(https?:)?\/\//i.test(raw) && !/^https?:\/\/(www\.)?livabletelluride\.org/i.test(raw)) continue;
      if (/^(#|mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
      let url = raw.replace(/^https?:\/\/(www\.)?livabletelluride\.org/i, '').split('#')[0].split('?')[0];
      if (!url) continue;
      // Only plain static path characters count as a real reference. This
      // rejects ${expr}, ' + var + ', and other runtime-built src/href.
      if (!/^[\w\-./%~]+$/.test(url)) continue;
      let rel;
      try { rel = decodeURIComponent(url); } catch (_) { continue; }
      if (seen.has(rel)) continue; seen.add(rel);
      let target = rel.startsWith('/') ? path.join(REPO_ROOT, rel.slice(1)) : path.join(fileDir, rel);
      if (rel.endsWith('/')) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) reviewFindings.push(`Missing asset in ${relName}: "${raw}"`);
    }
  }
}

// 3. Top-nav consistency — every page that carries the public nav must
//    have the canonical link set (no missing or stray links). Order/style
//    drift is intentionally not flagged here (too noisy for a daily gate).
function reviewNav() {
  console.log('\n🔎 Review: top-nav consistency');
  const navRe = /<nav class="topnav-links"[^>]*>([\s\S]*?)<\/nav>/;
  for (const fp of reviewHtmlFiles()) {
    const m = fs.readFileSync(fp, 'utf8').match(navRe);
    if (!m) continue; // no public top-nav (legal/admin/utility page) — skip
    const labels = [...m[1].matchAll(/<a[^>]*>([^<]*)<\/a>/g)]
      .map(x => x[1].replace(/\s+/g, ' ').trim()).filter(Boolean);
    const rel = path.relative(REPO_ROOT, fp);
    const missing = CANONICAL_NAV.filter(c => !labels.includes(c));
    const extra = labels.filter(l => !CANONICAL_NAV.includes(l));
    if (missing.length) reviewFindings.push(`Nav in ${rel} missing: ${missing.join(', ')}`);
    if (extra.length)   reviewFindings.push(`Nav in ${rel} unexpected link(s): ${extra.join(', ')}`);
  }
}

function runDailyReview() {
  reviewJsSyntax();
  reviewBrokenAssets();
  reviewNav();
  if (reviewFindings.length > 0) {
    console.log(`\n🔎 Daily review: ${reviewFindings.length} finding(s):`);
    reviewFindings.forEach(f => console.log(`  - ${f}`));
    fs.writeFileSync(REVIEW_FINDINGS_FILE, reviewFindings.map(f => `- ${f}`).join('\n') + '\n');
  } else {
    console.log('\n🔎 Daily review: no findings.');
    if (fs.existsSync(REVIEW_FINDINGS_FILE)) fs.unlinkSync(REVIEW_FINDINGS_FILE);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Telluride Gov Hub — Daily Maintenance');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════');

  let govHubSrc = fs.readFileSync(GOV_HELPERS_JS, 'utf8');
  let pulseSrc = fs.readFileSync(COMMUNITY_PULSE_JS, 'utf8');

  // Run all maintenance tasks
  govHubSrc = cleanupLegalNotices(govHubSrc);
  govHubSrc = cleanupNews(govHubSrc);
  pulseSrc = cleanupPulse(pulseSrc);
  await checkLinks(govHubSrc, pulseSrc);
  checkParity();

  // Liveness checks (off-machine pipeline health). Each soft-fails into
  // `issues` so all three run even if an earlier one finds a problem.
  await checkFeedFreshness();
  await checkEventsSheet();
  // checkMailchimpDigests() retired 2026-07-06 — Mailchimp is gone, so watching
  // it for send-freshness would false-alarm forever. The weekly send is now the
  // human-approved Customer.io Digest Review Desk; a CIO send-freshness check
  // could be added later (function kept, uncalled).
  checkTellurideTimesFreshness(govHubSrc);

  // Keep sitemap.xml in sync with the public HTML pages (git add -A commits it).
  regenerateSitemap();

  // Deterministic daily code/site review (JS syntax, broken assets, nav).
  runDailyReview();

  // Write updated files
  if (changed) {
    // Compile-check before writing so a bad serialize never ships a broken
    // data file (the last good file stays in place and the run fails loudly).
    assertParses('gov-helpers.js', govHubSrc);
    assertParses('community-pulse.js', pulseSrc);
    fs.writeFileSync(GOV_HELPERS_JS, govHubSrc);
    fs.writeFileSync(COMMUNITY_PULSE_JS, pulseSrc);
    console.log('\n✅ Maintenance complete — files updated.');
  } else {
    console.log('\n✓ Maintenance complete — no changes needed.');
  }

  // Summary
  if (issues.length > 0) {
    console.log(`\n⚠️ ${issues.length} issue(s) found:`);
    issues.forEach(i => console.log(`  - ${i}`));
    // Write issues to a file for the workflow to pick up
    const issueFile = path.join(REPO_ROOT, 'maintenance-issues.log');
    fs.writeFileSync(issueFile, `Maintenance Issues — ${new Date().toISOString()}\n\n${issues.join('\n')}\n`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
