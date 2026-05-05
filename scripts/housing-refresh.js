#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Housing Listings Refresh
 * Runs via GitHub Actions on Monday & Thursday mornings
 *
 * Sources:
 *   • SMRHA WordPress REST API — for-sale deed-restricted units
 *   • SMRHA lottery page       — upcoming lottery notices
 *
 * Strategy:
 *   - Fetch active posts from smrha.org/wp-json/wp/v2/posts
 *   - Parse each post's excerpt for address, price, beds, tier, HOA
 *   - Replace all SMRHA-sourced for-sale entries in HOUSING_LISTINGS
 *   - Preserve all other entries (waitlists, market rentals, MLS, etc.)
 *   - Dedup by smrhaSlug so unchanged listings are not re-written
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const REPO_ROOT   = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HUB_JS  = path.join(REPO_ROOT, 'js', 'gov-hub.js');

const SMRHA_WP_API = 'https://smrha.org/wp-json/wp/v2/posts?per_page=20&status=publish' +
                     '&_fields=id,slug,link,title,excerpt,date';
const SMRHA_LOTTERY_URL = 'https://smrha.org/lottery/';

// ── HTTP helper ───────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'TellurideGovHub/2.0 (housing-refresh)' },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : 'https://smrha.org' + res.headers.location;
        return fetchUrl(loc).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
  });
}

// ── JS source helpers (same pattern as content-refresh.js) ───
function extractJsArray(source, varName) {
  const startRe = new RegExp('const\\s+' + varName + '\\s*=\\s*\\[');
  const match = startRe.exec(source);
  if (!match) return null;
  let depth = 0;
  const braceStart = match.index + match[0].length - 1;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        try { return new Function('return (' + source.slice(braceStart, i + 1) + ')')(); }
        catch (e) { return null; }
      }
    }
  }
  return null;
}

function serializeArray(varName, arr) {
  const safeKey = (k) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
  const items = arr.map(item => {
    const props = Object.entries(item).map(([k, v]) => {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const inner = Object.entries(v)
          .map(([ik, iv]) => safeKey(ik) + ': ' + JSON.stringify(String(iv)))
          .join(', ');
        return '    ' + safeKey(k) + ': { ' + inner + ' }';
      }
      if (Array.isArray(v)) {
        return '    ' + safeKey(k) + ': [' + v.map(i => JSON.stringify(String(i))).join(', ') + ']';
      }
      if (typeof v === 'boolean' || typeof v === 'number') {
        return '    ' + safeKey(k) + ': ' + v;
      }
      return '    ' + safeKey(k) + ': ' + JSON.stringify(String(v));
    });
    return '  {\n' + props.join(',\n') + '\n  }';
  });
  return 'const ' + varName + ' = [\n' + items.join(',\n') + '\n];';
}

function replaceJsArray(source, varName, newArr) {
  const startRe = new RegExp('const\\s+' + varName + '\\s*=\\s*\\[');
  const match = startRe.exec(source);
  if (!match) {
    console.warn('  ⚠ Could not find ' + varName + ' in source');
    return source;
  }
  let depth = 0;
  const braceStart = match.index + match[0].length - 1;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        let end = i + 1;
        while (end < source.length && source[end] !== ';') end++;
        if (source[end] === ';') end++;
        return source.slice(0, match.index) + serializeArray(varName, newArr) + source.slice(end);
      }
    }
  }
  return source;
}

// ── HTML / text helpers ───────────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#038;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── Parse a WP post into a HOUSING_LISTINGS entry ────────────
function parseSmrhaPost(post) {
  const title = (post.title && post.title.rendered) ? post.title.rendered.trim() : '';
  const raw   = (post.excerpt && post.excerpt.rendered) ? stripHtml(post.excerpt.rendered) : '';
  const url   = post.link  || ('https://smrha.org/' + post.slug + '/');
  const slug  = post.slug  || '';

  // ── Address ──────────────────────────────────────────────────
  // e.g. "398 South Davis Street, Unit SW-102" or "155 West Pacific Avenue, Unit 202"
  let address = '';
  const addrMatch = raw.match(
    /(\d+\s+[A-Z][A-Za-z0-9\s]+(?:Street|Avenue|Blvd|Drive|Road|Way|Lane|Court|Place|Loop|Circle|Trail)[,\s]+(?:Unit\s+[A-Z0-9-]+\s*)?)/i
  );
  if (addrMatch) {
    address = addrMatch[1].replace(/\s+/g, ' ').trim().replace(/,?\s*$/, '');
    if (!/Telluride|Mountain Village|Norwood/i.test(address)) {
      address += ', Telluride, CO 81435';
    }
  }

  // ── Price ─────────────────────────────────────────────────────
  let price = '';
  const priceMatch = raw.match(/(?:Sales?\s+Price\s*[~:\s$]*|~\s*\$\s*)([\d,]+)/i);
  if (priceMatch) {
    const num = parseInt(priceMatch[1].replace(/,/g, ''), 10);
    if (!isNaN(num)) price = '$' + num.toLocaleString() + ' (deed-restricted)';
  }

  // ── Beds / Baths / Sqft ───────────────────────────────────────
  const bedsMatch  = raw.match(/(\d+)[- ]?(?:BR|BD|Bedroom)/i);
  const bathsMatch = raw.match(/(\d+)[- ]?(?:BA|Bath)/i);
  const sqftMatch  = raw.match(/([\d,]+)\s*sq\s*ft/i);
  const bedParts = [];
  if (bedsMatch)  bedParts.push(bedsMatch[1] + ' Bedroom');
  if (bathsMatch) bedParts.push(bathsMatch[1] + ' Bath');
  if (sqftMatch)  bedParts.push('~' + sqftMatch[1].replace(/,/g, '') + ' sq ft');
  const beds = bedParts.join(', ');

  // ── Tier ──────────────────────────────────────────────────────
  let tier = '';
  // Lazy match stops at the word "Unit" (e.g. "Tier 2 Mitigation Unit", "Tier 1 Town Constructed Unit")
  // Stop just before the bedroom-count digit that immediately follows "Unit" (e.g. "Unit2-Bedroom")
  const tierMatch = raw.match(/Tier\s+\d+.*?(?=\d+-?Bedroom|\d+\s*Bedroom|\d+\s*Bath|$)/i);
  if (tierMatch) tier = tierMatch[0].trim().replace(/\s+/g, ' ');

  // ── HOA ───────────────────────────────────────────────────────
  let hoa = '';
  const hoaMatch = raw.match(/HOA\s+Dues?\s*\$\s*([\d.,]+)/i);
  if (hoaMatch) hoa = 'HOA $' + hoaMatch[1] + '/mo';

  // ── Note ──────────────────────────────────────────────────────
  const noteParts = [];
  if (tier) noteParts.push(tier + '.');
  if (hoa)  noteParts.push(hoa + '.');
  noteParts.push('Contact SMRHA for eligibility and application details.');
  const note = noteParts.join(' ');

  // ── Coordinates ───────────────────────────────────────────────
  let lat = 37.9375, lng = -107.8123;
  if (/\bNorwood\b/i.test(raw + address))              { lat = 38.1297; lng = -108.2867; }
  else if (/Mountain\s+Village/i.test(raw + address))  { lat = 37.9325; lng = -107.8497; }
  else if (/South\s+Davis/i.test(address))             { lat = 37.9281; lng = -107.8145; }
  else if (/Pacific\s+Ave/i.test(address))             { lat = 37.9352; lng = -107.8138; }

  return {
    title:     '🏠 ' + title,
    type:      'deed-sale',
    address:   address || 'Telluride area, CO 81435',
    lat,
    lng,
    beds,
    price,
    source:    'SMRHA',
    contact:   { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url,
    smrhaSlug: slug,
    note
  };
}

// ── Fetch and parse all active SMRHA listings ─────────────────
async function fetchSmrhaListings() {
  console.log('  Fetching SMRHA WordPress API...');
  const resp = await fetchUrl(SMRHA_WP_API);
  if (resp.status !== 200) {
    throw new Error('SMRHA WP API returned HTTP ' + resp.status);
  }
  let posts;
  try { posts = JSON.parse(resp.text); }
  catch (e) { throw new Error('SMRHA WP API JSON parse error: ' + e.message); }

  if (!Array.isArray(posts) || posts.length === 0) {
    console.log('  SMRHA API returned 0 posts');
    return [];
  }

  console.log('  Found ' + posts.length + ' SMRHA post(s)');
  const listings = posts.map(parseSmrhaPost);
  for (const l of listings) {
    console.log('    ✓ ' + l.title + ' — ' + l.price + ' — ' + l.address);
  }
  return listings;
}

// ── Check lottery page for upcoming notice ────────────────────
async function fetchLotteryNotice() {
  try {
    const resp = await fetchUrl(SMRHA_LOTTERY_URL);
    if (resp.status !== 200) return null;
    const text = stripHtml(resp.text);
    const dateMatch = text.match(
      /(?:lottery|drawing)\s+(?:will\s+be\s+held|is\s+scheduled|date)[^\n]*?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i
    );
    if (dateMatch) {
      const d = new Date(dateMatch[1]);
      if (d > new Date()) {
        console.log('  Upcoming lottery: ' + dateMatch[1]);
        return dateMatch[1];
      }
    }
    return null;
  } catch (e) {
    console.warn('  Lottery page error: ' + e.message);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Telluride Gov Hub — Housing Refresh');
  console.log('  ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════\n');

  const govHubSrc = fs.readFileSync(GOV_HUB_JS, 'utf8');
  const existingListings = extractJsArray(govHubSrc, 'HOUSING_LISTINGS') || [];
  console.log('  Current listings in gov-hub.js: ' + existingListings.length);

  // Partition: SMRHA for-sale (auto-managed) vs everything else
  // "auto" = has smrhaSlug, OR is source=SMRHA + type=deed-sale + hosted on smrha.org
  const isSmrhaAuto = (l) =>
    l.smrhaSlug ||
    (l.source === 'SMRHA' && l.type === 'deed-sale' &&
     l.url && /smrha\.org/.test(l.url));

  const keepListings = existingListings.filter(l => !isSmrhaAuto(l));
  const oldSmrha     = existingListings.filter(l =>  isSmrhaAuto(l));
  console.log('  Keeping ' + keepListings.length + ' non-SMRHA entries, replacing ' + oldSmrha.length + ' SMRHA entries');

  // Fetch fresh from API
  let freshSmrha = [];
  try {
    freshSmrha = await fetchSmrhaListings();
  } catch (e) {
    console.error('  ✗ Failed to fetch SMRHA listings: ' + e.message);
    console.log('  Keeping existing SMRHA entries unchanged.');
    return;
  }

  // Check lottery
  const lotteryDate = await fetchLotteryNotice();
  if (lotteryDate) {
    for (const l of freshSmrha) {
      l.note = 'Lottery scheduled ' + lotteryDate + '. ' + l.note;
    }
  }

  // Merge: SMRHA for-sale first, then the rest
  const merged = [...freshSmrha, ...keepListings];

  // Detect changes
  const oldSlugs = new Set(oldSmrha.map(l => l.smrhaSlug || l.url));
  const newSlugs = new Set(freshSmrha.map(l => l.smrhaSlug || l.url));
  const added    = freshSmrha.filter(l => !oldSlugs.has(l.smrhaSlug || l.url));
  const removed  = oldSmrha.filter(l => !newSlugs.has(l.smrhaSlug || l.url));

  if (added.length)   console.log('\n  ✦ New listings:     ' + added.map(l => l.title).join(', '));
  if (removed.length) console.log('  ✦ Removed listings: ' + removed.map(l => l.title).join(', '));

  const changed = added.length > 0 || removed.length > 0 ||
    JSON.stringify(freshSmrha.map(l => l.smrhaSlug)) !== JSON.stringify(oldSmrha.map(l => l.smrhaSlug)) ||
    JSON.stringify(freshSmrha.map(l => l.price + l.beds + l.note)) !== JSON.stringify(oldSmrha.map(l => l.price + l.beds + l.note));

  if (!changed) {
    console.log('\n✓ No housing changes — gov-hub.js unchanged.');
    return;
  }

  const updated = replaceJsArray(govHubSrc, 'HOUSING_LISTINGS', merged);
  fs.writeFileSync(GOV_HUB_JS, updated, 'utf8');

  console.log('\n✅ Updated HOUSING_LISTINGS:');
  console.log('   ' + freshSmrha.length + ' SMRHA for-sale + ' + keepListings.length + ' other = ' + merged.length + ' total');
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
