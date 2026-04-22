#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Housing Listings Refresh
 * Runs via GitHub Actions on Monday & Thursday mornings
 *
 * Checks SMRHA and Telluride News for new deed-restricted
 * housing listings, lotteries, and rental opportunities.
 * ══════════════════════════════════════════════════════════════
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HUB_JS = path.join(REPO_ROOT, 'js', 'gov-hub.js');

// ── Sources ──
const SMRHA_URL = 'https://smrha.org';
const SMRHA_LOTTERY_URL = 'https://smrha.org/lottery';
const SMRHA_RENTALS_URL = 'https://smrha.org/rentals';
const TELLURIDE_NEWS_HOUSING = 'https://www.telluridenews.com/search/?f=rss&t=article&c=news&q=housing+deed+restricted&l=10&s=start_time&sd=desc';

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'TellurideGovHub/2.0 (housing-checker)' },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

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
        try { return new Function(`return (${source.slice(start, i + 1)})`)(); }
        catch (e) { return null; }
      }
    }
  }
  return null;
}

async function checkSmrha() {
  console.log('🏠 Checking SMRHA for housing updates...');
  const pages = [SMRHA_URL, SMRHA_LOTTERY_URL, SMRHA_RENTALS_URL];
  const results = [];

  for (const url of pages) {
    try {
      const resp = await fetch(url);
      if (resp.status === 200) {
        // Extract text content for change detection
        const text = resp.text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        results.push({ url, textLength: text.length, snippet: text.slice(0, 500) });
      }
    } catch (e) {
      console.warn(`  Error checking ${url}: ${e.message}`);
    }
  }

  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Telluride Gov Hub — Housing Refresh');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════');

  const govHubSrc = fs.readFileSync(GOV_HUB_JS, 'utf8');
  const existingListings = extractJsArray(govHubSrc, 'HOUSING_LISTINGS') || [];
  console.log(`  Current listings: ${existingListings.length}`);

  // Check SMRHA pages for updates
  const smrhaPages = await checkSmrha();
  for (const page of smrhaPages) {
    console.log(`  ${page.url}: ${page.textLength} chars`);
  }

  // Remove listings with expired deadlines
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  let changed = false;

  const activeListings = existingListings.filter(listing => {
    if (listing.deadline) {
      // Try to parse deadline date
      const deadlineMatch = listing.deadline.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
      if (deadlineMatch) {
        const dDate = new Date(`${deadlineMatch[1]} ${deadlineMatch[2]}, ${deadlineMatch[3]}`);
        if (dDate < now) {
          console.log(`  Expired listing: ${listing.title} (deadline: ${listing.deadline})`);
          changed = true;
          return false;
        }
      }
    }
    return true;
  });

  if (changed) {
    // Rebuild the HOUSING_LISTINGS in the file
    const items = activeListings.map(item => {
      const props = Object.entries(item).map(([k, v]) => {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          const inner = Object.entries(v).map(([ik, iv]) => `${ik}: '${String(iv).replace(/'/g, "\\'")}'`).join(', ');
          return `    ${k}: { ${inner} }`;
        }
        if (typeof v === 'boolean' || typeof v === 'number') return `    ${k}: ${v}`;
        return `    ${k}: '${String(v).replace(/'/g, "\\'")}'`;
      });
      return `  {\n${props.join(',\n')}\n  }`;
    });
    const newBlock = `const HOUSING_LISTINGS = [\n${items.join(',\n')}\n];`;

    // Replace in source
    const startRe = /const\s+HOUSING_LISTINGS\s*=\s*\[/;
    const match = startRe.exec(govHubSrc);
    if (match) {
      let depth = 0;
      let braceStart = match.index + match[0].length - 1;
      for (let i = braceStart; i < govHubSrc.length; i++) {
        if (govHubSrc[i] === '[') depth++;
        else if (govHubSrc[i] === ']') {
          depth--;
          if (depth === 0) {
            let end = i + 1;
            while (end < govHubSrc.length && govHubSrc[end] !== ';') end++;
            if (govHubSrc[end] === ';') end++;
            const updated = govHubSrc.slice(0, match.index) + newBlock + govHubSrc.slice(end);
            fs.writeFileSync(GOV_HUB_JS, updated);
            console.log(`\n✅ Updated HOUSING_LISTINGS: ${activeListings.length} active (removed ${existingListings.length - activeListings.length} expired)`);
            break;
          }
        }
      }
    }
  } else {
    console.log('\n✓ No housing changes detected.');
  }

  // Log SMRHA snippets for manual review in the Actions log
  console.log('\n── SMRHA Page Snapshots (for manual review) ──');
  for (const page of smrhaPages) {
    console.log(`\n${page.url}:`);
    console.log(page.snippet.slice(0, 300));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
