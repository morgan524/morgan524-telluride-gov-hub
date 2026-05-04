#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Deep Dive Auto-Update
 *
 * Runs as part of the content-refresh GitHub Action.
 * Pulls recent Town of Telluride and San Miguel County meeting
 * agendas + news, asks Claude whether each item touches a Deep Dive
 * topic, and writes factual updates into DEEP_DIVE_UPDATES in gov-hub.js.
 *
 * Rules enforced in the Claude prompt:
 *   - Report only what was actually decided, discussed, or scheduled
 *   - No speculation about motives or hidden agendas
 *   - Observational tone: "The BOCC voted to..." not "In a suspicious move..."
 *   - If uncertain whether something is relevant, skip it
 * ══════════════════════════════════════════════════════════════
 */

'use strict';
const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');

const REPO_ROOT  = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HUB_JS = path.join(REPO_ROOT, 'js', 'gov-hub.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL      = 'claude-haiku-4-5-20251001'; // fast + cheap for triage
const USER_AGENT        = 'LivableTelluride-Bot/1.0 (+https://livabletelluride.org)';

// ── Deep Dive topic keyword map ───────────────────────────────────────────────
// Only content that matches at least one keyword is sent to Claude.
// Keys match LAND_USE_ISSUES object keys in gov-hub.js.
const TOPICS = {
  carhenge: {
    label: 'Carhenge / Shandoka',
    keywords: ['carhenge', 'shandoka', 'lot l', 'chair 7', 'c7cc',
               '700 w pacific', 'lift 7 neighborhood', 'southwest area plan', 'swap'],
  },
  society: {
    label: 'Society Turn / Valley Floor Entrance',
    keywords: ['society turn', 'valley floor', 'genesee', 'roundabout.*develop',
               'highway 145.*project', 'valley entrance', '19.7.*acre'],
  },
  code: {
    label: 'Code Changes & Accelerated Review',
    keywords: ['hb24-1107', 'hb 24-1107', 'accelerated review', 'land use code',
               'luca', 'stakeholder.*roundtable', 'ssr.*housing', 'prop.*123',
               'proposition 123', 'short.term rental', 'str.*ordinance',
               'zoning.*reform', 'planning.*capacity', 'housing.*code.*amend'],
  },
  wildfire: {
    label: 'Wildfire Resiliency',
    keywords: ['wildfire', 'wui', 'defensible space', 'fire.*evacuation',
               'evacuation.*route', 'fire.*code', 'wildland.*urban',
               'fire.*resilien', 'ignis', 'fire.*mitigation'],
  },
  diamond: {
    label: 'Diamond Ridge',
    keywords: ['diamond ridge', 'diamond ranch', 'aldasoro.*rezone',
               'community housing.*zone.*county', 'diamond.*pud'],
  },
  gondola: {
    label: 'Gondola 3A',
    keywords: ['gondola 3a', '3a gondola', 'gondola.*mountain village',
               'mountain village.*gondola', 'new gondola', 'second gondola',
               'gondola.*project', 'gondola.*study', 'gondola.*agreement'],
  },
};

// ── Sources — Town + County only, as Morgan specified ────────────────────────
const NEWS_FEEDS = [
  { url: 'https://telluride.gov/RSSFeed.aspx?ModID=1&CID=Town-News-1',
    source: 'Town of Telluride', type: 'news' },
  { url: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml',
    source: 'San Miguel County', type: 'news' },
  { url: 'https://telluride.gov/RSSFeed.aspx?ModID=63&CID=All-0',
    source: 'Town of Telluride', type: 'alert' },
  { url: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=63&CID=All-0',
    source: 'San Miguel County', type: 'alert' },
];

const MEETING_SOURCES = [
  { label: 'Town of Telluride',
    api: 'https://telluride-co.civicweb.net/Services/MeetingsService.svc/meetings',
    detailBase: 'https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=' },
  { label: 'San Miguel County',
    rss: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=58' },
];

// How far back to look for recent content (days)
const LOOKBACK_DAYS = 14;

// ── HTTP helper ───────────────────────────────────────────────────────────────
function get(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 3;
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? https : http;
    let body = '';
    const req = mod.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 15000 }, res => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        get(res.headers.location, redirectsLeft - 1).then(resolve);
        return;
      }
      res.setEncoding('utf8');
      res.on('data', c => { body += c; if (body.length > 300000) req.destroy(); });
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body }));
    });
    req.on('error', e => resolve({ ok: false, status: 0, body: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, body: '', error: 'timeout' }); });
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(dateStr) {
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

// ── RSS parser ────────────────────────────────────────────────────────────────
function parseRssItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const get = tag => {
      const r = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`);
      const fm = r.exec(block);
      return fm ? (fm[1] || fm[2] || '').trim() : '';
    };
    const pubDate = get('pubDate');
    if (pubDate && daysAgo(pubDate) > LOOKBACK_DAYS) continue;
    items.push({
      title: get('title'),
      link:  get('link'),
      desc:  get('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
      date:  pubDate
        ? new Date(pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : today(),
      isoDate: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : today(),
    });
  }
  return items;
}

// ── Keyword filter — pre-screen before sending to Claude ─────────────────────
function matchedTopics(text) {
  const lc = text.toLowerCase();
  return Object.entries(TOPICS).filter(([, t]) =>
    t.keywords.some(kw => new RegExp(kw, 'i').test(lc))
  ).map(([key]) => key);
}

// ── Claude API call ───────────────────────────────────────────────────────────
function callClaude(systemPrompt, userPrompt) {
  if (!ANTHROPIC_API_KEY) return Promise.resolve(null);
  const body = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
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
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 45000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { resolve(null); return; }
          const text = (json.content?.[0]?.text || '').trim();
          const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          resolve(JSON.parse(fence ? fence[1].trim() : text));
        } catch (_) { resolve(null); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a factual civic analyst for livabletelluride.org — a non-partisan community information site for the Telluride, Colorado region. You review local government meeting agendas, decisions, and news releases to identify whether they relate to any of the community's major ongoing issues.

VOICE RULES (enforce strictly):
- Report only what was actually decided, discussed, voted on, or scheduled. Never speculate about motives, hidden agendas, or political intent.
- Observational tone: "The BOCC voted 3-2 to..." not "In a controversial move..."
- Do not characterize actions as "suspicious," "secretive," "unusual," or similar. Just state what happened.
- If a connection to a topic is uncertain or thin, return an empty updates array — do not stretch.
- Copy field: 1-2 plain sentences max. What happened. Why it matters to this topic. That's it.
- Titles: factual, descriptive, no editorializing.

OUTPUT: Return ONLY valid JSON — no prose, no explanation outside the JSON block.`;

// ── Triage prompt ─────────────────────────────────────────────────────────────
function buildTriagePrompt(item, matchedTopicKeys) {
  const topicDescs = matchedTopicKeys.map(k =>
    `- "${k}" (${TOPICS[k].label})`
  ).join('\n');

  return `A local government item may relate to one or more of these Deep Dive topics:
${topicDescs}

ITEM:
Source: ${item.source}
Date: ${item.date}
Title: ${item.title}
Text: ${item.desc}
URL: ${item.link || '(no url)'}

For each topic this item actually relates to, produce an update. If it does not meaningfully relate to any topic, return {"updates":[]}.

Return JSON:
{
  "updates": [
    {
      "topic": "<topic key from the list above>",
      "type": "news",
      "source": "${item.source}",
      "articleDate": "${item.date}",
      "title": "<factual headline, max 90 chars>",
      "copy": "<1-2 sentences: what happened and why it matters to this topic>",
      "href": "${item.link || ''}",
      "addedDate": "${today()}"
    }
  ]
}

If a clear, specific decision changed the project's current status or next step, you may also add a type="status" entry:
{
  "topic": "<key>",
  "type": "status",
  "statusCopy": "<updated 2-3 sentence factual description of current status>",
  "nextStep": "<specific next action or hearing, with date if known>",
  "addedDate": "${today()}"
}
Only include type="status" if something clearly changed phase or a specific decision was made.`;
}

// ── gov-hub.js patcher ────────────────────────────────────────────────────────
function extractDeepDiveUpdates(src) {
  const re = /const DEEP_DIVE_UPDATES\s*=\s*\[/;
  const m  = re.exec(src);
  if (!m) return [];
  let depth = 0, start = m.index + m[0].length - 1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') {
      depth--;
      if (depth === 0) {
        try { return new Function('return ' + src.slice(start, i + 1))(); }
        catch (_) { return []; }
      }
    }
  }
  return [];
}

function serializeUpdates(arr) {
  if (!arr.length) return 'const DEEP_DIVE_UPDATES = [];';
  const items = arr.map(u => {
    const props = Object.entries(u).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`);
    return '{\n' + props.join(',\n') + '\n}';
  });
  return 'const DEEP_DIVE_UPDATES = [\n' + items.join(',\n') + '\n];';
}

function patchDeepDiveUpdates(src, newArr) {
  const re = /const DEEP_DIVE_UPDATES\s*=\s*\[/;
  const m  = re.exec(src);
  if (!m) { console.warn('DEEP_DIVE_UPDATES not found in gov-hub.js'); return src; }
  let depth = 0, start = m.index;
  for (let i = m.index + m[0].length - 1; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') {
      depth--;
      if (depth === 0) {
        let end = i + 1;
        while (end < src.length && src[end] !== ';') end++;
        if (src[end] === ';') end++;
        return src.slice(0, start) + serializeUpdates(newArr) + src.slice(end);
      }
    }
  }
  return src;
}

// ── Deduplicate by title similarity ──────────────────────────────────────────
function isDuplicate(existing, candidate) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cn = norm(candidate.title || '');
  return existing.some(u => {
    if (u.topic !== candidate.topic || u.type !== candidate.type) return false;
    const en = norm(u.title || '');
    // Same title or same href
    if (u.href && candidate.href && u.href === candidate.href) return true;
    // Levenshtein-ish: if titles share >70% common chars, treat as duplicate
    if (!en || !cn) return false;
    const shorter = en.length < cn.length ? en : cn;
    const longer  = en.length < cn.length ? cn : en;
    let matches = 0;
    for (const ch of shorter) if (longer.includes(ch)) matches++;
    return matches / longer.length > 0.7;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Deep Dive refresh — ' + new Date().toUTCString());

  if (!ANTHROPIC_API_KEY) {
    console.warn('No ANTHROPIC_API_KEY — skipping deep-dive refresh');
    process.exit(0);
  }

  // Read current state
  let src = fs.readFileSync(GOV_HUB_JS, 'utf8');
  const existing = extractDeepDiveUpdates(src);
  console.log('Existing DEEP_DIVE_UPDATES: ' + existing.length + ' entries');

  // Prune entries older than 60 days
  const pruned = existing.filter(u => !u.addedDate || daysAgo(u.addedDate) <= 60);
  if (pruned.length < existing.length)
    console.log('Pruned ' + (existing.length - pruned.length) + ' old entries');

  const allUpdates = [...pruned];
  let newCount = 0;

  // ── Fetch RSS news items ──────────────────────────────────────────────────
  console.log('\nFetching news feeds...');
  const newsItems = [];
  for (const feed of NEWS_FEEDS) {
    const { ok, body } = await get(feed.url);
    if (!ok) { console.log('  SKIP ' + feed.source + ': fetch failed'); continue; }
    const items = parseRssItems(body).map(i => ({ ...i, source: feed.source }));
    console.log('  ' + feed.source + ' (' + feed.type + '): ' + items.length + ' items');
    newsItems.push(...items);
  }

  // ── Fetch recent meeting agendas ──────────────────────────────────────────
  console.log('\nFetching meeting agendas...');
  const agendaItems = [];

  // Town of Telluride — CivicWeb API
  try {
    const { ok, body } = await get(MEETING_SOURCES[0].api);
    if (ok) {
      const data = JSON.parse(body);
      const meetings = data.d || data || [];
      for (const m of meetings.slice(0, 10)) {
        const dateStr = m.MeetingDate || m.Date || '';
        if (!dateStr || daysAgo(dateStr) > LOOKBACK_DAYS) continue;
        const title = m.Name || m.MeetingName || m.Title || 'Meeting';
        const agendaUrl = m.AgendaUrl || (m.Id ? MEETING_SOURCES[0].detailBase + m.Id : '');
        let agendaText = title;
        if (agendaUrl) {
          const { ok: aOk, body: ab } = await get(agendaUrl);
          if (aOk) agendaText += ' ' + ab.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
        }
        agendaItems.push({
          source: 'Town of Telluride', title, date: new Date(dateStr).toLocaleDateString('en-US',
            { month: 'short', day: 'numeric', year: 'numeric' }),
          isoDate: new Date(dateStr).toISOString().slice(0, 10),
          desc: agendaText.slice(0, 500), link: agendaUrl,
        });
      }
      console.log('  Town of Telluride meetings: ' + agendaItems.length);
    }
  } catch (e) { console.warn('  Town meetings error: ' + e.message); }

  // San Miguel County — RSS
  try {
    const { ok, body } = await get(MEETING_SOURCES[1].rss);
    if (ok) {
      const items = parseRssItems(body).map(i => ({ ...i, source: 'San Miguel County' }));
      agendaItems.push(...items);
      console.log('  San Miguel County meetings: ' + items.length);
    }
  } catch (e) { console.warn('  County meetings error: ' + e.message); }

  // ── Triage all items ──────────────────────────────────────────────────────
  const allItems = [...newsItems, ...agendaItems];
  console.log('\nTriaging ' + allItems.length + ' items against ' + Object.keys(TOPICS).length + ' topics...');

  for (const item of allItems) {
    const text = (item.title + ' ' + item.desc).toLowerCase();
    const matched = matchedTopics(text);
    if (!matched.length) continue;

    console.log('  MATCH: "' + item.title.slice(0, 60) + '" → [' + matched.join(', ') + ']');

    let result;
    try {
      result = await callClaude(SYSTEM_PROMPT, buildTriagePrompt(item, matched));
    } catch (e) {
      console.warn('    Claude error: ' + e.message);
      continue;
    }

    if (!result || !Array.isArray(result.updates) || !result.updates.length) {
      console.log('    Claude: not relevant enough — skipping');
      continue;
    }

    for (const update of result.updates) {
      if (!update.topic || !update.type) continue;
      if (isDuplicate(allUpdates, update)) {
        console.log('    DUP: "' + (update.title || update.type) + '" — skipping');
        continue;
      }
      allUpdates.push(update);
      newCount++;
      console.log('    +UPDATE [' + update.topic + '/' + update.type + ']: ' + (update.title || update.statusCopy || '').slice(0, 70));
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // ── Write back ────────────────────────────────────────────────────────────
  if (newCount > 0 || pruned.length < existing.length) {
    src = patchDeepDiveUpdates(src, allUpdates);
    fs.writeFileSync(GOV_HUB_JS, src, 'utf8');
    console.log('\nWrote ' + allUpdates.length + ' total entries to DEEP_DIVE_UPDATES (' + newCount + ' new)');
  } else {
    console.log('\nNo changes — DEEP_DIVE_UPDATES unchanged');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal: ' + err.message);
  process.exit(1);
});
