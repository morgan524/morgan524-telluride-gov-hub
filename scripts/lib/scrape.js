// Shared scraping helpers for the weekly "read a partner's own web page"
// refreshers — partner-events-refresh.js and recurring-acts-refresh.js.
//
// These two jobs have the same shape: fetch a page that has no feed, turn its
// markup into text, ask Claude for STRUCTURED FACTS, and resolve those facts to
// real Mountain-time dates. The date logic in particular must not exist in two
// copies: divergent per-script copies of a date rule is the drift class this
// repo keeps getting bitten by (see lib/replace.js's header for the same story
// about const-replacers).
//
// Deliberately NOT merged with content-refresh.js's own fetch/Claude helpers:
// that script is a 7k-line single-run program whose helpers close over its
// module state (PROXY_HOSTS preflight, response cache, run counters). These are
// the standalone equivalents.

'use strict';

const https = require('https');
const http  = require('http');

// ── Mountain-time dates ───────────────────────────────────────
// Every date the site displays is America/Denver. NEVER derive "today" from
// toISOString() — the GH Actions runner is UTC and rolls the date over at 6pm
// MT, which silently shifts a whole evening's events to the next day.
const MT = 'America/Denver';

function mtToday() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: MT, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

// Treat YYYY-MM-DD as a calendar date, not an instant, so no zone can shift it.
function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(dt) {
  return dt.toISOString().slice(0, 10); // safe: dt is a UTC-constructed calendar date
}
function addDays(iso, n) {
  const dt = parseISO(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return toISO(dt);
}
function daysBetween(aISO, bISO) {
  return Math.round((parseISO(bISO) - parseISO(aISO)) / 86400000);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Next `count` occurrences of `weekday`, starting today (inclusive).
function weeklyOccurrences(weekday, count, todayISO) {
  const target = WEEKDAYS.indexOf(String(weekday || '').trim().toLowerCase());
  if (target < 0) return [];
  const delta = (target - parseISO(todayISO).getUTCDay() + 7) % 7;
  const out = [];
  for (let i = 0; i < count; i++) out.push(addDays(todayISO, delta + i * 7));
  return out;
}

// How far into the next year a rolled-forward month/day may land before we
// judge it a PAST listing instead.
const ROLLOVER_WINDOW_DAYS = 120;

// Resolve a bare month/day (these pages print no year) to a real date, or null
// if it refers to a date already past.
//
// The ambiguity: "Jun 12" with this year's June gone could mean either
//   (a) next year — a January concert listed in December, or
//   (b) an already-held date the page still lists — Beacon prints a whole
//       season ("Friday Feast — June 12, July 10, Aug 14") including past ones,
//       and so does the Movie Mondays lineup.
// Rolling everything forward turned Beacon's spent June/July dates into 2027
// entries (caught in the 2026-08-09 dry run). So we only roll forward when the
// next-year date is NEAR — a real upcoming listing is weeks away, not 10 months.
function resolveMonthDay(month, day, todayISO) {
  const m = Number(month), d = Number(day);
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const year = Number(String(todayISO).slice(0, 4));

  const thisYear = `${year}-${pad(m)}-${pad(d)}`;
  if (thisYear >= todayISO) return thisYear;

  const nextYear = `${year + 1}-${pad(m)}-${pad(d)}`;
  return daysBetween(todayISO, nextYear) <= ROLLOVER_WINDOW_DAYS ? nextYear : null;
}

// ── HTTP ──────────────────────────────────────────────────────
// Hosts that block GH-runner IPs must be routed through the Cloudflare Worker,
// exactly as content-refresh.js does. Keep this list a SUBSET of that script's
// PROXY_HOSTS *and* of the Worker's own allow-list — a host here that the Worker
// doesn't allow fails closed, which is the safe direction but still a bug.
const PROXY_HOSTS = new Set([
  'events.ourayridgwayevents.com',
]);

function maybeProxy(url) {
  const base = process.env.RSS_PROXY_URL;
  if (!base) return url; // dev / unset — direct fetch
  let host;
  try { host = new URL(url).hostname; } catch (_) { return url; }
  if (!PROXY_HOSTS.has(host)) return url;
  return base.replace(/\/$/, '') + '/proxy?url=' + encodeURIComponent(url);
}

// A normal browser UA: these are small marketing sites behind CDNs that answer
// bot UAs with a challenge page rather than content.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function fetchUrl(url, redirects = 0) {
  const target = maybeProxy(url);
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('Too many redirects: ' + url));
    const mod = target.startsWith('https') ? https : http;
    const req = mod.get(target, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 20000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, target).toString();
        return fetchUrl(loc, redirects + 1).then(resolve).catch(reject);
      }
      // Buffer, then decode ONCE as UTF-8. Chunk-wise decoding splits multi-byte
      // characters across boundaries and produces the mojibake documented in
      // docs/news-pipeline.md ("It’s" → "It<FFFD><FFFD><FFFD>s").
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
  });
}

async function fetchJson(url) {
  const res = await fetchUrl(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${url}`);
  try { return JSON.parse(res.text); }
  catch (e) { throw new Error(`Non-JSON response from ${url}: ${e.message}`); }
}

// ── HTML → text ───────────────────────────────────────────────
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ndash: '–', mdash: '—', hellip: '…', middot: '·'
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

// keepLinks leaves hrefs/img srcs inline as [[href:…]] / [[img:…]] markers so
// Claude can report a slug or a poster URL without us shipping raw markup.
function htmlToText(html, { keepLinks = false } = {}) {
  let s = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  if (keepLinks) {
    s = s
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi, ' [[href:$1]] ')
      .replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi, ' [[img:$1]] ');
  }
  return decodeEntities(
    s.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/article|\/tr)\s*\/?>/gi, '\n')
     .replace(/<[^>]+>/g, ' ')
  ).replace(/[ \t ]+/g, ' ')
   .replace(/\n\s*\n\s*\n+/g, '\n\n')
   .trim();
}

// ── Claude ────────────────────────────────────────────────────
// Returns parsed JSON. Throws on anything unusable — a partial or unparseable
// answer must never be allowed to degrade into "write an empty array".
function callClaudeJson(system, userPrompt, opts = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not set — refusing to run (a keyless run would write empty data).');
  }
  const { SONNET } = require('./claude-model.js');
  const body = JSON.stringify({
    model: opts.model || SONNET,
    max_tokens: opts.maxTokens || 8192,
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: userPrompt }]
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: opts.timeout || 90000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            return reject(new Error(`${json.error.type || 'error'}: ${json.error.message || JSON.stringify(json.error)}`));
          }
          if (json.stop_reason === 'max_tokens') {
            return reject(new Error('Claude hit max_tokens — the answer is truncated, so the result would be incomplete.'));
          }
          const text = json.content?.[0]?.text || '';
          const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          resolve(JSON.parse((fenced ? fenced[1] : text).trim()));
        } catch (e) {
          reject(new Error('Could not parse Claude response as JSON: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = {
  MT, mtToday, parseISO, toISO, addDays, daysBetween,
  weeklyOccurrences, resolveMonthDay, ROLLOVER_WINDOW_DAYS,
  fetchUrl, fetchJson, htmlToText, decodeEntities, callClaudeJson,
  PROXY_HOSTS, BROWSER_UA,
};
