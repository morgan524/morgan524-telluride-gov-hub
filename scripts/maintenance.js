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

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HUB_JS = path.join(REPO_ROOT, 'js', 'gov-hub.js');
const COMMUNITY_PULSE_JS = path.join(REPO_ROOT, 'js', 'community-pulse.js');
const INDEX_HTML = path.join(REPO_ROOT, 'index.html');

const NEWS_MAX_AGE_DAYS = 14;
const PULSE_MAX_AGE_DAYS = 5;
const LINK_CHECK_SAMPLE_SIZE = 20; // Check 20 random links per run
const LINK_TIMEOUT_MS = 10000;

let issues = [];
let changed = false;

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
function extractJsArray(source, varName) {
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*\\[`);
  const match = startRe.exec(source);
  if (!match) return null;
  let depth = 0, start = match.index + match[0].length - 1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        try { return new Function(`return (${source.slice(start, i + 1)})`)(); }
        catch { return null; }
      }
    }
  }
  return null;
}

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
        const items = arr.map(item => {
          const props = Object.entries(item).map(([k, v]) => {
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
              const inner = Object.entries(v).map(([ik, iv]) => `${ik}: '${String(iv).replace(/'/g, "\\'")}'`).join(', ');
              return `    ${k}: { ${inner} }`;
            }
            if (Array.isArray(v)) return `    ${k}: [${v.map(i => `'${String(i).replace(/'/g, "\\'")}'`).join(', ')}]`;
            if (typeof v === 'boolean' || typeof v === 'number') return `    ${k}: ${v}`;
            return `    ${k}: '${String(v).replace(/'/g, "\\'")}'`;
          });
          return `  {\n${props.join(',\n')}\n  }`;
        });
        const block = `const ${varName} = [\n${items.join(',\n')}\n];`;
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

  // Filter to actual content URLs (not API endpoints or internal refs)
  const contentUrls = [...allUrls].filter(u =>
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
  const dead = results.filter(r => !r.ok);

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
const MAILCHIMP_STALE_HOURS = 48;

async function checkFeedFreshness() {
  console.log('\n📰 Liveness: feed.xml freshness...');
  try {
    const res = await fetchText(FEED_URL, 10000);
    if (res.status !== 200) {
      issues.push(`feed.xml fetch returned HTTP ${res.status} — Mailchimp digest can't consume the feed. URL: ${FEED_URL}`);
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

async function checkMailchimpDigests() {
  console.log('\n📧 Liveness: Mailchimp digest campaigns...');
  const apiKey = process.env.MAILCHIMP_API_KEY;
  if (!apiKey) {
    console.log('  ℹ MAILCHIMP_API_KEY not set — skipping digest campaign check.');
    console.log('     To enable: create an API key at https://us15.admin.mailchimp.com/account/api/');
    console.log('     and add it as a GitHub Actions secret named MAILCHIMP_API_KEY.');
    return;
  }
  // Mailchimp API keys carry their data-center suffix: e.g. "abc123-us15".
  const dc = (apiKey.split('-')[1] || 'us15');
  const url = `https://${dc}.api.mailchimp.com/3.0/campaigns?status=sent&type=rss&count=10&sort_field=send_time&sort_dir=DESC`;
  try {
    const res = await fetchText(url, 15000, {
      // Mailchimp accepts HTTP Basic with "anystring:<api-key>".
      'Authorization': 'Basic ' + Buffer.from('anystring:' + apiKey).toString('base64'),
      'Accept': 'application/json'
    });
    if (res.status === 401) {
      issues.push(`Mailchimp API returned 401 — MAILCHIMP_API_KEY is invalid or revoked`);
      return;
    }
    if (res.status !== 200) {
      issues.push(`Mailchimp API returned HTTP ${res.status} for campaigns list`);
      return;
    }
    let parsed;
    try { parsed = JSON.parse(res.body); }
    catch (_) { issues.push('Mailchimp API returned non-JSON body'); return; }
    const campaigns = parsed.campaigns || [];
    if (campaigns.length === 0) {
      issues.push(
        `No RSS-driven Mailchimp campaigns have EVER been sent. The daily / ` +
        `weekly digest campaigns may not be configured. Set them up at ` +
        `https://us15.admin.mailchimp.com/ → Campaigns → Create → RSS-driven email.`
      );
      return;
    }
    const latest = campaigns[0];
    const sentAt = new Date(latest.send_time);
    const hoursSinceLast = (Date.now() - sentAt.getTime()) / 3600000;
    if (hoursSinceLast > MAILCHIMP_STALE_HOURS) {
      issues.push(
        `Newest Mailchimp RSS campaign was sent ${hoursSinceLast.toFixed(0)}h ago ` +
        `(threshold: ${MAILCHIMP_STALE_HOURS}h). The daily digest may be paused. ` +
        `Check https://us15.admin.mailchimp.com/ → Campaigns and confirm the ` +
        `RSS-driven campaign is enabled and points at livabletelluride.org/feed.xml.`
      );
    } else {
      console.log(`  ✓ Latest Mailchimp RSS campaign sent ${hoursSinceLast.toFixed(1)}h ago — "${latest.settings && latest.settings.subject_line || '?'}"`);
    }
  } catch (e) {
    issues.push(`Mailchimp API check failed: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// ── Main ──
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Telluride Gov Hub — Daily Maintenance');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════');

  let govHubSrc = fs.readFileSync(GOV_HUB_JS, 'utf8');
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
  await checkMailchimpDigests();

  // Write updated files
  if (changed) {
    fs.writeFileSync(GOV_HUB_JS, govHubSrc);
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
