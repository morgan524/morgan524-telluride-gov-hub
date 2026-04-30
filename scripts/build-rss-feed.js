#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — RSS Feed Builder
 * ══════════════════════════════════════════════════════════════
 *
 * Emits feed.xml at the repo root from the canonical site data in
 * js/gov-hub.js (news articles, KOTO newscasts/features, legal notices).
 *
 * Mailchimp's "RSS-driven email" campaign type reads this feed and emails
 * subscribers a daily digest of the newest items. Each item has a stable
 * GUID derived from its href so Mailchimp does NOT re-send the same items
 * across days.
 *
 * Run from the repo root:
 *   node scripts/build-rss-feed.js
 *
 * Wired into .github/workflows/content-refresh.yml so it regenerates every
 * 6 hours after the content refresh.
 * ══════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HUB_JS = path.join(REPO_ROOT, 'js', 'gov-hub.js');
const FEED_OUT = path.join(REPO_ROOT, 'feed.xml');

const SITE_URL = 'https://livabletelluride.org';
const FEED_TITLE = 'Livable Telluride — Daily Digest';
const FEED_DESC = 'News, meetings, and legal notices for the Telluride region (Town of Telluride, Mountain Village, San Miguel County, and surrounding communities).';
const MAX_AGE_DAYS = 7;            // include items from the last 7 days
const MAX_ITEMS = 30;              // hard cap on feed size
const MAX_LEGAL_NOTICES = 8;       // never let legal notices crowd out news

// ──────────────────────────────────────────────────────────────
// Read js/gov-hub.js and extract the relevant arrays/objects.
// Reuses the same Function-eval trick as content-refresh.js.
// ──────────────────────────────────────────────────────────────

function extractJsArray(source, varName) {
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*\\[`);
  const m = startRe.exec(source);
  if (!m) return null;
  let depth = 0, start = m.index + m[0].length - 1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      if (--depth === 0) {
        try { return new Function(`return (${source.slice(start, i + 1)})`)(); }
        catch (e) { console.warn(`  parse ${varName}: ${e.message}`); return null; }
      }
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rfc822(d) {
  return new Date(d).toUTCString();
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function withinWindow(d, days) {
  if (!d) return false;
  return (Date.now() - d.getTime()) / 86400000 <= days;
}

// Stable per-item GUID. Use href when available; fall back to a hash of
// title+date so Mailchimp doesn't think the same item is "new" tomorrow.
function guidFor(item) {
  if (item.href) return item.href;
  const seed = `${item.title}|${item.date || ''}|${item.source || ''}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return `${SITE_URL}/digest/${(h >>> 0).toString(16)}`;
}

// ──────────────────────────────────────────────────────────────
// Build items from each section.
// ──────────────────────────────────────────────────────────────

function buildNewsItems(src, articles, sourceLabel) {
  if (!Array.isArray(articles)) return [];
  return articles.flatMap((a) => {
    const d = parseDate(a.date);
    if (!withinWindow(d, MAX_AGE_DAYS)) return [];
    const desc = a.copy ? a.copy : `${a.source || sourceLabel} • ${a.date || ''}`;
    return [{
      title: a.title || '(untitled)',
      link: a.href || SITE_URL,
      pubDate: d,
      description: desc,
      categories: [a.source || sourceLabel, a.newsTopic].filter(Boolean),
      guid: guidFor(a),
    }];
  });
}

function buildLegalNoticeItems(notices) {
  if (!Array.isArray(notices)) return [];
  // We don't have a posted-on date for legal notices, so synthesize a pubDate
  // a couple of days in the past — enough to land BELOW today's actual news
  // in the feed sort, but recent enough that Mailchimp considers them "fresh".
  // Stable GUID derived from title+entity so Mailchimp dedupes correctly.
  const synthDate = new Date(Date.now() - 2 * 86400000);
  // Cap legal notices to MAX_LEGAL_NOTICES so they don't fill the whole feed.
  // Prefer those with the soonest deadline / earliest expiry first.
  const ranked = notices
    .filter((n) => n.title)
    .filter((n) => {
      if (!n.expires) return true;
      const exp = parseDate(n.expires);
      return !(exp && exp.getTime() < Date.now()); // drop already-expired
    })
    .sort((a, b) => {
      const ax = parseDate(a.expires) || new Date(8e15);
      const bx = parseDate(b.expires) || new Date(8e15);
      return ax - bx;
    })
    .slice(0, MAX_LEGAL_NOTICES);
  return ranked.map((n) => ({
    title: `[Legal Notice] ${n.title}`,
    link: `${SITE_URL}/#legals`,
    pubDate: synthDate,
    description: n.summary || `${n.entity || ''} — ${n.deadline || ''}`,
    categories: ['Legal Notice', n.type, n.entity].filter(Boolean),
    guid: `${SITE_URL}/legal-notice/${encodeURIComponent((n.title + '|' + (n.entity||'')).slice(0, 100))}`,
  }));
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Building RSS feed for Mailchimp');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════');

  const src = fs.readFileSync(GOV_HUB_JS, 'utf8');
  const tt = extractJsArray(src, 'TELLURIDE_TIMES_ARTICLES') || [];
  const koNews = extractJsArray(src, 'KOTO_NEWSCASTS') || [];
  const koFeat = extractJsArray(src, 'KOTO_FEATURED_STORIES') || [];
  const legal = extractJsArray(src, 'LEGAL_NOTICES') || [];

  console.log(`  Loaded: ${tt.length} TT/gov articles, ${koNews.length} KOTO newscasts, ${koFeat.length} KOTO features, ${legal.length} legal notices`);

  let items = [
    ...buildNewsItems('tt', tt, 'Telluride Times'),
    ...buildNewsItems('koto-newscasts', koNews, 'KOTO Community Radio'),
    ...buildNewsItems('koto-features', koFeat, 'KOTO Community Radio'),
    ...buildLegalNoticeItems(legal),
  ];

  // De-duplicate by guid, keep newest pubDate, sort newest first, cap.
  const byGuid = new Map();
  for (const it of items) {
    const cur = byGuid.get(it.guid);
    if (!cur || (it.pubDate && cur.pubDate && it.pubDate > cur.pubDate)) byGuid.set(it.guid, it);
  }
  items = [...byGuid.values()]
    .filter((it) => it.pubDate instanceof Date && !isNaN(it.pubDate.getTime()))
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, MAX_ITEMS);

  console.log(`  Emitting ${items.length} items (window: ${MAX_AGE_DAYS} days, max: ${MAX_ITEMS})`);

  const lastBuild = new Date();
  const itemsXml = items.map((it) => {
    const cats = (it.categories || []).map((c) => `      <category>${xmlEscape(c)}</category>`).join('\n');
    return `    <item>
      <title>${xmlEscape(it.title)}</title>
      <link>${xmlEscape(it.link)}</link>
      <guid isPermaLink="false">${xmlEscape(it.guid)}</guid>
      <pubDate>${rfc822(it.pubDate)}</pubDate>
      <description>${xmlEscape(it.description)}</description>
${cats}
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(FEED_TITLE)}</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(FEED_DESC)}</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
    <ttl>360</ttl>
${itemsXml}
  </channel>
</rss>
`;

  fs.writeFileSync(FEED_OUT, xml);
  console.log(`\n✅ Wrote ${FEED_OUT} (${xml.length} bytes)`);
}

main();
