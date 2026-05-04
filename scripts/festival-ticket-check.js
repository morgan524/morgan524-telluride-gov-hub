#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Festival Ticket Status Checker
 * Runs via GitHub Actions every Monday at 10:00 UTC (4am Mountain)
 *
 * For each festival with a ticketUrl, fetches the page and looks
 * for sold-out / available signals in the raw HTML.
 * Patches ticketStatus and promo in js/gov-hub.js if anything changed.
 * ══════════════════════════════════════════════════════════════
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const REPO_ROOT  = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HUB_JS = path.join(REPO_ROOT, 'js', 'gov-hub.js');

const USER_AGENT    = 'Mozilla/5.0 (compatible; LivableTelluride-Bot/1.0; +https://livabletelluride.org)';
const FETCH_TIMEOUT = 15000;

// ── Keyword sets ──────────────────────────────────────────────────────────────
const SOLD_OUT_PATTERNS = [
  /sold[\s-]*out/i,
  /no\s+tickets?\s+(remaining|available|left)/i,
  /no\s+passes?\s+(remaining|available|left)/i,
  /tickets?\s+are\s+no\s+longer\s+available/i,
  /passes?\s+are\s+no\s+longer\s+available/i,
  /this\s+event\s+is\s+(sold[\s-]*out|full)/i,
  /registration\s+(is\s+)?(closed|full)/i,
  /waitlist\s+only/i,
];

const ON_SALE_PATTERNS = [
  /buy\s+(tickets?|passes?|now)/i,
  /purchase\s+(tickets?|passes?)/i,
  /get\s+(tickets?|passes?)/i,
  /tickets?\s+(are\s+)?(on\s+sale|available)/i,
  /passes?\s+(are\s+)?(on\s+sale|available)/i,
  /add\s+to\s+(cart|basket)/i,
  /register\s+now/i,
  /book\s+now/i,
  /order\s+(tickets?|passes?)/i,
];

// ── HTTP fetch with redirect follow ──────────────────────────────────────────
function fetchPage(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 4;
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    let body = '';
    const req = mod.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: FETCH_TIMEOUT,
    }, (res) => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        fetchPage(res.headers.location, redirectsLeft - 1).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        resolve({ ok: false, status: res.statusCode, html: '' });
        return;
      }
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 400000) req.destroy();
      });
      res.on('end', () => resolve({ ok: true, status: 200, html: body }));
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, html: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, html: '', error: 'timeout' }); });
  });
}

// ── Status detector ───────────────────────────────────────────────────────────
function detectStatus(html) {
  // Strip scripts/styles to reduce false positives, keep visible text only
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .slice(0, 300000);

  for (const re of SOLD_OUT_PATTERNS) {
    if (re.test(stripped)) return 'sold-out';
  }
  for (const re of ON_SALE_PATTERNS) {
    if (re.test(stripped)) return 'on-sale';
  }
  return null; // inconclusive — JS-heavy or unusual page
}

// ── gov-hub.js patcher ────────────────────────────────────────────────────────
function patchFestival(src, festName, newStatus, newPromo) {
  const escapedName = festName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const objRe = new RegExp(
    '(\\{[^{}]*?name:\\s*\'' + escapedName + '\'[^{}]*?\\})',
    'g'
  );

  let patched = false;
  const result = src.replace(objRe, (match) => {
    let updated = match;

    updated = updated.replace(
      /ticketStatus:\s*'[^']*'/,
      "ticketStatus: '" + newStatus + "'"
    );

    const safePromo = newPromo.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    updated = updated.replace(
      /promo:\s*'[^']*'/,
      "promo: '" + safePromo + "'"
    );

    if (updated !== match) patched = true;
    return updated;
  });

  return { result, patched };
}

// ── Promo builder ─────────────────────────────────────────────────────────────
function buildPromo(fest, newStatus, oldPromo) {
  if (newStatus === 'sold-out') {
    const hasWaitlist = /waitlist/i.test(oldPromo);
    return hasWaitlist
      ? fest.name + ' passes are sold out — join the waitlist on the festival site'
      : fest.name + ' passes/tickets are sold out';
  }
  if (newStatus === 'on-sale') {
    // Don't overwrite already-nuanced promo copy
    if (/on[\s-]sale|available now|on sale now/i.test(oldPromo)) return oldPromo;
    return fest.name + ' — tickets and passes on sale now';
  }
  return oldPromo;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Festival ticket status check — ' + new Date().toUTCString());
  console.log('Reading ' + GOV_HUB_JS + '\n');

  let src = fs.readFileSync(GOV_HUB_JS, 'utf8');

  // Extract TELLURIDE_FESTIVALS array block
  const arrayMatch = src.match(/const TELLURIDE_FESTIVALS\s*=\s*\[([\s\S]*?)\];/);
  if (!arrayMatch) {
    console.error('Could not locate TELLURIDE_FESTIVALS in gov-hub.js');
    process.exit(1);
  }

  // Parse individual festival objects
  const festRe = /\{[^{}]*?name:\s*'([^']+)'[^{}]*?\}/g;
  const festivals = [];
  let m;
  while ((m = festRe.exec(arrayMatch[1])) !== null) {
    const block = m[0];
    const name  = m[1];
    const get   = (field) => {
      const fm = block.match(new RegExp(field + ":\\s*'([^']*)'"));
      return fm ? fm[1] : '';
    };
    festivals.push({
      name,
      ticketUrl:    get('ticketUrl'),
      ticketStatus: get('ticketStatus'),
      promo:        get('promo'),
    });
  }

  console.log('Found ' + festivals.length + ' festivals\n');

  let changeCount = 0;
  let currentSrc  = src;

  for (const fest of festivals) {
    if (!fest.ticketUrl) {
      console.log('SKIP  ' + fest.name + ' — no ticketUrl');
      continue;
    }

    console.log('CHECK ' + fest.name);
    console.log('      ' + fest.ticketUrl);

    const { ok, status, html, error } = await fetchPage(fest.ticketUrl);

    if (!ok) {
      console.log('      WARN: fetch failed (HTTP ' + status + (error ? ', ' + error : '') + ') — skipping\n');
      continue;
    }

    const detected = detectStatus(html);

    if (!detected) {
      console.log('      SKIP: inconclusive (JS-heavy page) — keeping \'' + fest.ticketStatus + '\'\n');
      continue;
    }

    if (detected === fest.ticketStatus) {
      console.log('      OK:   status unchanged \'' + fest.ticketStatus + '\'\n');
      continue;
    }

    console.log('      CHANGE: \'' + fest.ticketStatus + '\' -> \'' + detected + '\'');
    const newPromo = buildPromo(fest, detected, fest.promo);
    const { result, patched } = patchFestival(currentSrc, fest.name, detected, newPromo);

    if (patched) {
      currentSrc = result;
      changeCount++;
      console.log('      PROMO: ' + newPromo + '\n');
    } else {
      console.log('      WARN: regex patch did not match — manual check needed\n');
    }

    // Be polite between requests
    await new Promise(r => setTimeout(r, 1500));
  }

  if (changeCount > 0) {
    fs.writeFileSync(GOV_HUB_JS, currentSrc, 'utf8');
    console.log('\nWrote ' + changeCount + ' change(s) to gov-hub.js');
  } else {
    console.log('\nNo changes — all statuses current');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
