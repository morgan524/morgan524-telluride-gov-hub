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
 *   5. File parity check (index.html ↔ telluride-gov-hub.html)
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
const GOVHUB_HTML = path.join(REPO_ROOT, 'telluride-gov-hub.html');

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
// ── Task 5: File Parity Check ──
// ══════════════════════════════════════════════════════════════

function checkParity() {
  console.log('\n📄 Task 5: File parity check...');

  if (!fs.existsSync(INDEX_HTML) || !fs.existsSync(GOVHUB_HTML)) {
    console.log('  ⚠️ One or both HTML files missing');
    issues.push('Missing HTML file — index.html or telluride-gov-hub.html');
    return;
  }

  const indexHash = crypto.createHash('md5').update(fs.readFileSync(INDEX_HTML)).digest('hex');
  const govhubHash = crypto.createHash('md5').update(fs.readFileSync(GOVHUB_HTML)).digest('hex');

  if (indexHash !== govhubHash) {
    console.log('  ⚠️ index.html and telluride-gov-hub.html are out of sync — syncing...');
    // Copy the larger (more likely up-to-date) file over the smaller one
    const indexSize = fs.statSync(INDEX_HTML).size;
    const govhubSize = fs.statSync(GOVHUB_HTML).size;
    if (indexSize >= govhubSize) {
      fs.copyFileSync(INDEX_HTML, GOVHUB_HTML);
      console.log('  Copied index.html → telluride-gov-hub.html');
    } else {
      fs.copyFileSync(GOVHUB_HTML, INDEX_HTML);
      console.log('  Copied telluride-gov-hub.html → index.html');
    }
    changed = true;
  } else {
    console.log('  ✓ HTML files are in sync');
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
