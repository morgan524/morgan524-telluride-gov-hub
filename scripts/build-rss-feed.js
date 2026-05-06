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
const BLOG_FEED_OUT = path.join(REPO_ROOT, 'feed-blog.xml');

const SITE_URL = 'https://livabletelluride.org';
const COMMUNITY_EVENTS_JSON = path.join(REPO_ROOT, 'community-events.json');
const FEED_TITLE = 'Livable Telluride — Daily Digest';
const FEED_DESC = 'News, upcoming meetings, and community events for the Telluride region (Town of Telluride, Mountain Village, San Miguel County, and surrounding communities).';
const BLOG_FEED_TITLE = 'Livable Telluride — Blog';
const BLOG_FEED_DESC = 'Long-form posts from Livable Telluride on housing, land use, civic decisions, and the issues shaping our valley.';
const MAX_AGE_DAYS = 7;             // backward window for news + blog
const MAX_FUTURE_DAYS = 14;         // forward window for meetings (only emit upcoming meetings within 14d)
const MAX_EVENT_FUTURE_DAYS = 60;   // forward window for events (events starting within 60d)
const MAX_ITEMS = 40;               // hard cap on feed size
const MAX_MEETINGS = 10;            // cap upcoming-meeting items per build
const MAX_EVENTS = 10;              // cap event items per build
const MAX_BLOG = 8;                 // cap blog items per build

// ──────────────────────────────────────────────────────────────
// Read js/gov-hub.js and extract the relevant arrays/objects.
// Reuses the same Function-eval trick as content-refresh.js.
// ──────────────────────────────────────────────────────────────

function extractJsObject(source, varName) {
  const startRe = new RegExp(`const\\s+${varName}\\s*=\\s*\\{`);
  const m = startRe.exec(source);
  if (!m) return null;
  let depth = 0, start = m.index + m[0].length - 1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      if (--depth === 0) {
        try { return new Function(`return (${source.slice(start, i + 1)})`)(); }
        catch (e) { console.warn(`  parse ${varName}: ${e.message}`); return null; }
      }
    }
  }
  return null;
}

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

// True if d falls in [now - daysBehind, now + daysAhead]. Used for meetings
// (which want recent past + upcoming) and events (which only want upcoming
// but with a small grace window for events that started today).
function withinRollingWindow(d, daysBehind, daysAhead) {
  if (!d) return false;
  const deltaMs = d.getTime() - Date.now();
  return deltaMs >= -daysBehind * 86400000 && deltaMs <= daysAhead * 86400000;
}

// Map MANUAL_SUMMARIES key prefix → readable source label.
const MEETING_SOURCE_LABELS = {
  telluride: 'Town of Telluride',
  mv: 'Mountain Village',
  county: 'San Miguel County',
  smart: 'SMART Transit',
  school: 'Telluride School District',
  fire: 'Telluride Fire Protection District',
  med: 'Telluride Medical Center',
  norwood: 'Town of Norwood',
  ophir: 'Town of Ophir',
  smrha: 'San Miguel Regional Housing Authority',
};

// Stable per-item GUID. Use href when available; fall back to a hash of
// title+date so Mailchimp doesn't think the same item is "new" tomorrow.
function guidFor(item) {
  if (item.href) return item.href;
  // Use firstSeen (date first scraped) so articles get a fresh GUID on the day
  // they're added — Mailchimp will include them in that day's digest.
  // Falls back to item.date for legacy articles without firstSeen.
  const seed = `${item.title}|${item.firstSeen || item.date || ''}|${item.source || ''}`;
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
    // Use firstSeen as pubDate so Mailchimp treats the article as new on the day it was scraped
    const pubDate = a.firstSeen ? parseDate(a.firstSeen) : d;
    return [{
      title: a.title || '(untitled)',
      link: a.href || SITE_URL,
      pubDate,
      description: desc,
      imageUrl: a.img || a.imageUrl || null,
      categories: [a.source || sourceLabel, a.newsTopic].filter(Boolean),
      guid: guidFor(a),
    }];
  });
}

function buildMeetingItems(summaries) {
  if (!summaries || typeof summaries !== 'object') return [];
  const items = [];
  for (const [key, summary] of Object.entries(summaries)) {
    if (!key || typeof key !== 'string') continue;
    const parts = key.split('|');
    if (parts.length < 3) continue;
    const [source, dateStr, ...titleParts] = parts;
    const title = titleParts.join('|');
    const meetingDate = parseDate(dateStr);
    if (!withinRollingWindow(meetingDate, 7, MAX_FUTURE_DAYS)) continue;
    const sourceLabel = MEETING_SOURCE_LABELS[source] || source;
    items.push({
      title: `[Meeting] ${title} — ${dateStr}`,
      link: `${SITE_URL}/#meetings`,
      pubDate: meetingDate,
      description: `${sourceLabel} • ${dateStr}\n\n${summary || '(see meeting page for details)'}`,
      categories: ['Meeting', sourceLabel].filter(Boolean),
      guid: `${SITE_URL}/meeting/${encodeURIComponent(`${source}|${dateStr}|${title.slice(0, 80)}`)}`,
    });
  }
  // Earliest upcoming first
  items.sort((a, b) => a.pubDate - b.pubDate);
  return items.slice(0, MAX_MEETINGS);
}

/**
 * Compute a "send slot" string for an event based on how far away it is.
 * Embedding the slot in the GUID means Mailchimp sees a NEW item each slot —
 * giving recurring send behaviour without re-sending every single day.
 *
 * Rules (from today's perspective):
 *   today          → slot = today's ISO date  (sends once on the day)
 *   1–7 days away  → slot = ISO week + "a" (Mon) or "b" (Thu) — up to 2x/week
 *   8–30 days away → slot = ISO year-week  — once per week
 *   31–60 days     → slot = year + 2-week block — every other week
 */
function eventSendSlot(eventDate, today) {
  const msPerDay = 86400000;
  const daysAway = Math.round((eventDate - today) / msPerDay);

  if (daysAway <= 0) {
    // Event is today (or past but within lookback)
    return today.toISOString().slice(0, 10);
  }

  // ISO week helper
  function isoWeek(d) {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return [tmp.getUTCFullYear(), Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7)];
  }

  const [yr, wk] = isoWeek(today);
  const weekStr = `${yr}-W${String(wk).padStart(2, '0')}`;

  if (daysAway <= 7) {
    // Up to 2 sends per week: Mon–Wed = slot "a", Thu–Sun = slot "b"
    const dow = today.getUTCDay(); // 0=Sun
    const half = (dow >= 4 || dow === 0) ? 'b' : 'a';
    return `${weekStr}-${half}`;
  }

  if (daysAway <= 30) {
    // Once per week
    return weekStr;
  }

  // Every 2 weeks
  return `${yr}-B${Math.ceil(wk / 2)}`;
}

function buildEventItems(...sources) {
  const events = sources.flatMap((s) => Array.isArray(s) ? s : []);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const items = [];
  for (const e of events) {
    if (!e || !e.title) continue;
    const eventDate = parseDate(e.date || e.startDate || e.Date);
    if (!withinRollingWindow(eventDate, 1, MAX_EVENT_FUTURE_DAYS)) continue;
    const desc = [
      e.location ? `📍 ${e.location}` : null,
      e.eventTimes || e.time ? `🕒 ${e.eventTimes || e.time}` : null,
      e.copy || e.description || '',
    ].filter(Boolean).join('\n');
    const slot = eventSendSlot(eventDate, today);
    items.push({
      title: `[Event] ${e.title} — ${e.date || ''}`,
      link: `${SITE_URL}/#events`,
      pubDate: today,          // use today so it's "new" in this slot
      description: desc,
      imageUrl: e.img || e.imageUrl || null,
      categories: ['Community Event', e.source].filter(Boolean),
      // Slot embedded in GUID → Mailchimp sees a fresh item each send window
      guid: `${SITE_URL}/event/${encodeURIComponent(`${e.title.slice(0, 80)}|${e.date || ''}|${slot}`)}`,
    });
  }
  items.sort((a, b) => parseDate(a.description.split('\n')[0]) - parseDate(b.description.split('\n')[0]) || a.title.localeCompare(b.title));
  return items.slice(0, MAX_EVENTS);
}

function buildBlogItems(posts) {
  if (!Array.isArray(posts)) return [];
  const items = [];
  for (const p of posts) {
    if (!p || !p.title) continue;
    const postDate = parseDate(p.date);
    if (!withinWindow(postDate, MAX_AGE_DAYS)) continue;
    const desc = p.excerpt || p.summary || (p.body ? String(p.body).replace(/<[^>]+>/g, '').slice(0, 400) : '');
    items.push({
      title: p.title,
      link: p.href || `${SITE_URL}/#blog`,
      pubDate: postDate,
      description: desc,
      categories: ['Blog', p.author].filter(Boolean),
      guid: p.href || `${SITE_URL}/blog/${encodeURIComponent(p.title.slice(0, 80) + '|' + (p.date || ''))}`,
    });
  }
  items.sort((a, b) => b.pubDate - a.pubDate);
  return items.slice(0, MAX_BLOG);
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
  const summaries = extractJsObject(src, 'MANUAL_SUMMARIES') || {};
  const events = extractJsArray(src, 'COMMUNITY_EVENTS') || [];
  const blogPosts = extractJsArray(src, 'BLOG_POSTS') || [];

  // community-events.json holds events submitted via email-to-events pipeline
  let jsonEvents = [];
  try {
    if (fs.existsSync(COMMUNITY_EVENTS_JSON)) {
      jsonEvents = JSON.parse(fs.readFileSync(COMMUNITY_EVENTS_JSON, 'utf8')) || [];
      if (!Array.isArray(jsonEvents)) jsonEvents = [];
    }
  } catch (e) {
    console.warn(`  community-events.json parse error: ${e.message}`);
  }

  console.log(`  Loaded: ${tt.length} TT/gov articles, ${koNews.length} KOTO newscasts, ${koFeat.length} KOTO features, ${Object.keys(summaries).length} meeting summaries, ${events.length + jsonEvents.length} events, ${blogPosts.length} blog posts`);

  // Main digest feed: news + meetings + events. Blog posts get their own feed.
  let items = [
    ...buildNewsItems('tt', tt, 'Telluride Times'),
    ...buildNewsItems('koto-newscasts', koNews, 'KOTO Community Radio'),
    ...buildNewsItems('koto-features', koFeat, 'KOTO Community Radio'),
    ...buildMeetingItems(summaries),
    ...buildEventItems(events, jsonEvents),
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

  // ── Minimum-4 filler: pad with upcoming events when digest is thin ──
  // If fewer than 4 unique items will go out, add the next upcoming
  // community events (within 60 days) so subscribers always get something.
  if (items.length < 4) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const existingGuids = new Set(items.map((i) => i.guid));
    const allEvents = [...events, ...jsonEvents];
    const filler = allEvents
      .filter((e) => e && e.title)
      .map((e) => {
        const eventDate = parseDate(e.date || e.startDate || e.Date);
        if (!withinRollingWindow(eventDate, 0, MAX_EVENT_FUTURE_DAYS)) return null;
        const slot = eventSendSlot(eventDate, today);
        const guid = `${SITE_URL}/event/${encodeURIComponent(`${e.title.slice(0, 80)}|${e.date || ''}|${slot}`)}`;
        if (existingGuids.has(guid)) return null;
        const desc = [
          e.location ? `📍 ${e.location}` : null,
          e.eventTimes || e.time ? `🕒 ${e.eventTimes || e.time}` : null,
          e.copy || e.description || '',
        ].filter(Boolean).join('\n');
        return { title: `[Event] ${e.title} — ${e.date || ''}`, link: `${SITE_URL}/#events`,
          pubDate: today, description: desc, categories: ['Community Event'], guid };
      })
      .filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title));
    for (const f of filler) {
      if (items.length >= 4) break;
      items.push(f);
    }
    console.log(`  Padded digest to ${items.length} items with upcoming-event filler`);
  }

  console.log(`  Emitting ${items.length} items to feed.xml (max: ${MAX_ITEMS})`);

  // ── feed-blog.xml RETIRED 2026-04-30 ──
  // Blog posts are now sent as regular Mailchimp campaigns (the user authors
  // them in the Mailchimp UI, sends them to the audience directly, and
  // content-refresh.js Task 6 syncs the campaign archive feed back into
  // BLOG_POSTS so they appear on the website's Blog tab). The separate
  // RSS-driven Blog Blast campaign is no longer needed, so we no longer
  // emit feed-blog.xml. Keeping buildBlogItems in case we want to re-enable.
  // To re-enable: uncomment the writeRssFeed() call below.
  //
  //   let blogItems = buildBlogItems(blogPosts)
  //     .filter((it) => it.pubDate instanceof Date && !isNaN(it.pubDate.getTime()))
  //     .sort((a, b) => b.pubDate - a.pubDate);
  //   writeRssFeed(BLOG_FEED_OUT, BLOG_FEED_TITLE, BLOG_FEED_DESC, `${SITE_URL}/feed-blog.xml`, blogItems);

  writeRssFeed(FEED_OUT, FEED_TITLE, FEED_DESC, `${SITE_URL}/feed.xml`, items);
}

function writeRssFeed(outPath, title, desc, selfUrl, items) {
  const lastBuild = new Date();
  const itemsXml = items.map((it) => {
    const cats = (it.categories || []).map((c) => `      <category>${xmlEscape(c)}</category>`).join('\n');
    // Make image URL absolute (site-relative paths need the domain prepended)
    let imgUrl = it.imageUrl || null;
    if (imgUrl && imgUrl.startsWith('/')) imgUrl = SITE_URL + imgUrl;
    const imgHtml = imgUrl ? `<img src="${imgUrl}" alt="" style="max-width:100%;height:auto;display:block;margin-bottom:8px;" />` : '';
    const descHtml = imgHtml + (it.description || '');
    const mediaTag = imgUrl ? `\n      <media:content url="${xmlEscape(imgUrl)}" medium="image" />` : '';
    return `    <item>
      <title>${xmlEscape(it.title)}</title>
      <link>${xmlEscape(it.link)}</link>
      <guid isPermaLink="false">${xmlEscape(it.guid)}</guid>
      <pubDate>${rfc822(it.pubDate)}</pubDate>
      <description><![CDATA[${descHtml}]]></description>${mediaTag}
${cats}
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${xmlEscape(title)}</title>
    <link>${SITE_URL}</link>
    <atom:link href="${selfUrl}" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(desc)}</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
    <ttl>360</ttl>
${itemsXml}
  </channel>
</rss>
`;

  fs.writeFileSync(outPath, xml);
  console.log(`✅ Wrote ${outPath} (${xml.length} bytes)`);
}

main();
