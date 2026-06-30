#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Livable Telluride — Daily Content Review
 * Runs via GitHub Actions once daily (content-review.yml)
 *
 * PURPOSE
 *   Catch CONTENT-CORRECTNESS errors that the infra/security checks
 *   (weekly-review.yml) and the cleanup tasks (maintenance.js) do NOT:
 *     • Duplicate events (within a source and across sources)
 *     • Past events still shown as "upcoming"
 *     • Wrong / unparseable / typo'd dates (e.g. wrong year)
 *     • The same event listed on CONFLICTING dates across sources
 *       (the Mountain-Village-wrong-dates trap — see memory note)
 *     • endDate before startDate
 *     • Missing required fields (no title / no date)
 *     • Garbled text / mojibake (UTF-8 double-encoding)
 *     • Bad / stub meeting summaries (isBadSummary)
 *     • Dead or malformed links (events, notices, housing)
 *     • An optional AI semantic pass (fuzzy near-dupes, dates that
 *       contradict the title, mislabeled or obviously-wrong items)
 *
 * DESIGN
 *   REPORT-ONLY. This script never edits site content. It writes a
 *   findings log; the workflow turns that log into a single, auto-
 *   refreshing GitHub issue (and auto-closes it on a clean run).
 *   We do NOT auto-edit js/gov-helpers.js because content-refresh.js
 *   rewrites that file every 6 hours — any real fix belongs at the
 *   source (the relevant dedup/parse step), not a one-off deletion
 *   that the next refresh would re-introduce. The issue gives precise
 *   locations + suggested fixes so a human or a Claude session can act.
 *
 *   Checks are a registry (CHECKS[]) — add a new check by pushing one
 *   function. Data arrays are AUTO-DISCOVERED from the evaluated data
 *   files, so new event sources get reviewed automatically.
 *
 * EXIT CODE
 *   Always 0 on a normal run (clean OR findings). A non-zero exit means
 *   the script itself crashed → the workflow's failure path opens a CI
 *   Health issue, mirroring maintenance.yml / content-refresh.yml.
 * ══════════════════════════════════════════════════════════════
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_DATA_JS = path.join(REPO_ROOT, 'js', 'gov-data.js');
const GOV_HELPERS_JS = path.join(REPO_ROOT, 'js', 'gov-helpers.js');
const FINDINGS_LOG = path.join(REPO_ROOT, 'content-review-findings.log');
const FINDINGS_JSON = path.join(REPO_ROOT, 'content-review-findings.json');
// Only the findings that need a human (Critical/High/Medium). Written when any
// exist; the workflow emails the owner only when this file is non-empty, so
// advisory-only (Low) days stay silent. Auto-fixable categories (exact dups,
// scheme-less links, MV wrong-dates) are handled at the source by
// content-refresh.js and won't appear here once that runs.
const FINDINGS_ACTIONABLE = path.join(REPO_ROOT, 'content-review-actionable.log');

// AI pass config. Floating Sonnet alias to match content-refresh.js; see
// memory/claude-model-inventory.md (this file is now a model-ID site).
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const REVIEW_MODEL = process.env.CONTENT_REVIEW_MODEL || require('./lib/claude-model.js').SONNET;

const LINK_CHECK_CAP = 45;      // max distinct links probed per run
const LINK_TIMEOUT_MS = 12000;
const FAR_FUTURE_DAYS = 400;    // an event date this far out is suspicious
const PAST_GRACE_DAYS = 1;      // strictly-before (today - grace) counts as stale
const AI_LOOKAHEAD_DAYS = 45;   // window of items handed to the AI pass

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

// ── findings accumulator ──
const findings = [];
function add(severity, category, title, detail, extra = {}) {
  findings.push({ severity, category, title, detail, ...extra });
}

// ════════════════════════════════════════════════════════════════
// 1. LOAD + EVALUATE THE DATA FILES
// ════════════════════════════════════════════════════════════════
// gov-data.js and gov-helpers.js declare disjoint top-level `const`s
// (verified — no name overlap), so we can concatenate and evaluate them
// in one sandboxed Function body, then capture every UPPER_SNAKE const
// plus the three helper fns we reuse (localDate, isBadSummary, truncate).
function loadData() {
  const dataSrc = fs.readFileSync(GOV_DATA_JS, 'utf8');
  const helpersSrc = fs.readFileSync(GOV_HELPERS_JS, 'utf8');
  const combined = dataSrc + '\n;\n' + helpersSrc;

  const constNames = [...new Set(
    [...combined.matchAll(/^const\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1])
  )];
  const helperNames = ['localDate', 'isBadSummary', 'truncate'];
  const captureNames = [...constNames, ...helperNames];

  const epilogue =
    '\n;return {' +
    captureNames.map(n => `${JSON.stringify(n)}:(typeof ${n}!=="undefined"?${n}:undefined)`).join(',') +
    '};';

  // Stub the browser globals the data files may reference. They are data +
  // pure functions, so nothing should execute against these at eval time,
  // but we pass harmless stubs to be safe.
  const stubWindow = {};
  const stubDoc = { addEventListener() {}, querySelector() {}, querySelectorAll() { return []; },
                    getElementById() { return null; }, createElement() { return {}; } };
  const stubStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

  let captured;
  try {
    const fn = new Function('window', 'document', 'navigator', 'localStorage', 'self', 'location',
      combined + epilogue);
    captured = fn(stubWindow, stubDoc, {}, stubStorage, stubWindow, { href: '', hash: '' }) || {};
  } catch (e) {
    throw new Error('Could not evaluate data files: ' + e.message);
  }

  const localDate = typeof captured.localDate === 'function' ? captured.localDate : fallbackLocalDate;
  const isBadSummary = typeof captured.isBadSummary === 'function' ? captured.isBadSummary : (() => false);

  // Keep only the captured values that are arrays of objects (event/meeting/
  // news/notice collections) plus a couple of keyed-object maps we check.
  const arrays = {};
  for (const name of constNames) {
    const v = captured[name];
    if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
      arrays[name] = v;
    }
  }
  return { arrays, captured, localDate, isBadSummary };
}

// Minimal fallback if the real localDate can't be captured.
function fallbackLocalDate(str) {
  if (!str) return null;
  const iso = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const d = new Date(str);
  return isNaN(d) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ════════════════════════════════════════════════════════════════
// 2. NORMALIZE INTO A UNIFIED RECORD MODEL
// ════════════════════════════════════════════════════════════════
// Classify each discovered array and flatten its objects into records we
// can run checks over, regardless of the exact source schema.
function classify(name) {
  if (/CACHED_DATA$/.test(name) || /(_MEETINGS|MEETINGS)$/.test(name)) return 'meeting';
  if (/(EVENTS|SHOWS|CONCERTS)$/.test(name) || name === 'MUSIC_ON_THE_GREEN') return 'event';
  if (/(ARTICLES|NEWS|NEWSCASTS|STORIES|BLOG_POSTS)$/.test(name) || /NEWS/.test(name)) return 'news';
  if (name === 'LEGAL_NOTICES') return 'notice';
  if (name === 'HOUSING_LISTINGS') return 'housing';
  if (name === 'HUMANE_SOCIETY_ANIMALS') return 'animal';
  return 'other';
}

function pickDate(o) {
  // event/meeting use `date` (named or ISO); news/library use `pubDate` (ISO).
  return o.date || o.pubDate || o.startDate || o.eventDate || null;
}
function pickTitle(o) {
  return o.title || o.name || o.headline || '';
}
function pickLink(o) {
  return o.href || o.link || o.url || '';
}

function buildRecords(arrays) {
  const records = [];
  for (const [name, arr] of Object.entries(arrays)) {
    const kind = classify(name);
    arr.forEach((o, idx) => {
      records.push({
        array: name, idx, kind,
        title: String(pickTitle(o)).trim(),
        rawDate: pickDate(o),
        endRaw: o.endDate || null,
        link: String(pickLink(o)).trim(),
        source: o.source || o.sourceLabel || name,
        obj: o
      });
    });
  }
  return records;
}

// ── text helpers ──
function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/&[a-z]+;|&#\d+;/g, ' ')   // strip html entities
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function isoOf(localDate, raw) {
  const d = localDate(raw);
  if (!d || isNaN(d)) return null;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayDenverIso() {
  // en-CA yields YYYY-MM-DD; pin to the site's timezone so "past" matches
  // what a Telluride reader sees, not the CI runner's UTC clock.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
}
function daysBetweenIso(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
// best-effort 1-based line numbers of every occurrence of a snippet
function linesOf(src, snippet, max = 5) {
  if (!snippet) return [];
  const out = [];
  let from = 0, i;
  while ((i = src.indexOf(snippet, from)) >= 0 && out.length < max) {
    out.push(src.slice(0, i).split('\n').length);
    from = i + snippet.length;
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
// 3. DETERMINISTIC CHECKS
// ════════════════════════════════════════════════════════════════
const TODAY = todayDenverIso();

function checkDuplicates(ctx) {
  const { records } = ctx;
  const evlike = records.filter(r => ['event', 'meeting', 'news'].includes(r.kind) && r.title);

  // (a) exact duplicates WITHIN the same array: same normalized title + same
  //     calendar date. Multi-day series (different dates) are NOT dupes.
  const within = new Map();
  for (const r of evlike) {
    const iso = isoOf(ctx.localDate, r.rawDate);
    const key = `${r.array}|${normTitle(r.title)}|${iso || 'nodate'}`;
    if (!within.has(key)) within.set(key, []);
    within.get(key).push(r);
  }
  for (const group of within.values()) {
    if (group.length < 2) continue;
    const r = group[0];
    const iso = isoOf(ctx.localDate, r.rawDate) || r.rawDate;
    const src = ctx.helpersSrc.includes(r.title) ? ctx.helpersSrc : ctx.dataSrc;
    const lines = linesOf(src, r.title, group.length);
    // Distinguish TRUE redundancy (same link/url → same thing scraped twice)
    // from legitimate multi-session same-day items (different link or time —
    // e.g. KOTO "/2026-06-24/1/" and "/2/" are two sessions, not a dup).
    const byLink = new Map();
    for (const g of group) {
      const sig = (g.link || JSON.stringify(g.obj.pubDate || g.obj.time || '')).trim();
      byLink.set(sig, (byLink.get(sig) || 0) + 1);
    }
    const trueDup = [...byLink.values()].some(n => n > 1);
    if (trueDup) {
      add('High', 'Duplicate event',
        `${group.length}× "${r.title}" in ${r.array} on ${iso}`,
        `${group.length} entries with the SAME title + date + link in ${r.array} — a true dedup miss. Keep one, remove the rest.` +
        (lines.length ? ` Near lines ${lines.join(', ')}.` : ''),
        { array: r.array, autofixClass: 'exact-dup' });
    } else {
      // Different links/times → usually legitimate (multi-session events, or two
      // distinct articles sharing a headline). Advisory only, not an action email.
      add('Low', 'Possible duplicate event',
        `${group.length}× "${r.title}" in ${r.array} on ${iso}`,
        `${group.length} entries share a title + date in ${r.array} but have different links/times — likely separate sessions of one event. Verify only if it looks wrong.` +
        (lines.length ? ` Near lines ${lines.join(', ')}.` : ''));
    }
  }

  // (b) cross-array same-date matches. For this multi-source aggregator this is
  //     NORMAL — KOTO and Telluride.com both list the same festival, and the
  //     render-time dedup merges them. So this is a LOW spot-check, rolled up
  //     into ONE finding (not one-per-pair) to keep the log actionable. The
  //     full list lives in the JSON artifact. A genuine bug here = the same
  //     event showing TWICE on the live Events tab (dedup-key miss).
  const cross = new Map();
  for (const r of evlike.filter(r => r.kind === 'event')) {
    const iso = isoOf(ctx.localDate, r.rawDate);
    if (!iso) continue;
    const key = `${normTitle(r.title)}|${iso}`;
    if (!cross.has(key)) cross.set(key, []);
    cross.get(key).push(r);
  }
  const pairs = [];
  for (const group of cross.values()) {
    const arrs = [...new Set(group.map(g => g.array))];
    if (arrs.length > 1) pairs.push(`"${group[0].title}" ${isoOf(ctx.localDate, group[0].rawDate)} (${arrs.join(' + ')})`);
  }
  if (pairs.length) {
    const shown = pairs.slice(0, 8);
    add('Low', 'Cross-source same-date events',
      `${pairs.length} event(s) listed in 2+ source arrays on the same date`,
      `Expected for an aggregator — the render-time dedup should merge each into one card. Spot-check that none shows TWICE on the live Events tab (if it does, the dedup key needs the sorted-token fix; see memory: weekly-email-dedup-joint-meetings):\n     • ` +
      shown.join('\n     • ') + (pairs.length > shown.length ? `\n     • …and ${pairs.length - shown.length} more (see content-review-findings.json)` : ''));
  }
}

function checkCrossSourceDateConflict(ctx) {
  // Same event title in 2+ arrays but on DIFFERENT dates → one source has the
  // wrong date (the Mountain-Village-publishes-wrong-dates trap).
  const { records } = ctx;
  const byTitle = new Map();
  for (const r of records.filter(r => r.kind === 'event' && r.title)) {
    const iso = isoOf(ctx.localDate, r.rawDate);
    if (!iso) continue;
    const k = normTitle(r.title);
    if (k.length < 6) continue;            // too-generic title → skip
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push({ ...r, iso });
  }
  for (const group of byTitle.values()) {
    const dates = [...new Set(group.map(g => g.iso))];
    const arrs = [...new Set(group.map(g => g.array))];
    if (dates.length > 1 && arrs.length > 1) {
      // only flag if the dates are close (within 7d) — far-apart same-title
      // items are usually a legitimately recurring event, not a conflict.
      const sorted = dates.slice().sort();
      if (daysBetweenIso(sorted[0], sorted[sorted.length - 1]) <= 7) {
        const r = group[0];
        add('High', 'Conflicting event dates',
          `"${r.title}" listed on ${dates.join(' vs ')} across ${arrs.join(', ')}`,
          `The same event has different dates in different sources. One is wrong — verify against the organizer/Sheridan/Telluride.com and correct the bad source (see memory: mv-calendar-wrong-dates).`);
      }
    }
  }
}

function checkDates(ctx) {
  const { records } = ctx;
  const curYear = +TODAY.slice(0, 4);
  for (const r of records) {
    if (r.kind === 'animal' || r.kind === 'other') continue;
    if (!r.rawDate) {
      if (r.kind === 'event' || r.kind === 'meeting') {
        add('High', 'Missing date', `"${r.title || '(no title)'}" in ${r.array} has no date`,
          `Event/meeting record without a parseable date field — it cannot sort correctly on the site.`);
      }
      continue;
    }
    const iso = isoOf(ctx.localDate, r.rawDate);
    if (!iso) {
      add('High', 'Unparseable date', `"${r.title}" in ${r.array}: date "${r.rawDate}" won't parse`,
        `localDate() returns null for this value — the item will be mis-sorted or dropped. Fix the date string format.`);
      continue;
    }
    const yr = +iso.slice(0, 4);
    if (yr < curYear - 1 || yr > curYear + 2) {
      add('High', 'Suspicious year', `"${r.title}" in ${r.array}: date ${iso}`,
        `Year ${yr} is far from the current year (${curYear}) — likely a typo (e.g. 2025 vs 2026).`);
      continue;
    }
    // far-future (only for events/meetings, not historical news)
    if ((r.kind === 'event' || r.kind === 'meeting')) {
      const ahead = daysBetweenIso(TODAY, iso);
      if (ahead > FAR_FUTURE_DAYS) {
        add('Medium', 'Far-future date', `"${r.title}" in ${r.array}: ${iso} (${ahead}d out)`,
          `Date is more than ${FAR_FUTURE_DAYS} days out — verify it isn't a year typo.`);
      }
    }
    // endDate before startDate
    if (r.endRaw) {
      const endIso = isoOf(ctx.localDate, r.endRaw);
      if (endIso && endIso < iso) {
        add('Medium', 'End before start', `"${r.title}" in ${r.array}: ${iso} → ${endIso}`,
          `endDate (${endIso}) is before the start date (${iso}).`);
      }
    }
  }
}

function checkPastEvents(ctx) {
  const { records } = ctx;
  for (const r of records.filter(r => r.kind === 'event')) {
    const iso = isoOf(ctx.localDate, r.rawDate);
    if (!iso) continue;
    const endIso = r.endRaw ? isoOf(ctx.localDate, r.endRaw) : null;
    const effectiveEnd = endIso && endIso >= iso ? endIso : iso;
    if (daysBetweenIso(effectiveEnd, TODAY) > PAST_GRACE_DAYS) {
      add('Low', 'Past event still listed', `"${r.title}" in ${r.array} ended ${effectiveEnd}`,
        `This event is over (>${PAST_GRACE_DAYS}d ago) but is still in the data. Usually harmless — the rolling render window hides past events. Worth pruning only if it surfaces as "upcoming".`);
    }
  }
}

function checkMissingTitle(ctx) {
  for (const r of ctx.records) {
    if ((r.kind === 'event' || r.kind === 'meeting' || r.kind === 'news') && !r.title) {
      add('High', 'Missing title', `Entry in ${r.array} (index ${r.idx}) has no title`,
        `A record without a title renders as a blank/garbled card.`);
    }
  }
}

// Detect UTF-8 double-encoding ("mojibake"). NOTE: raw HTML entities like
// &ccedil; are EXPECTED in some descriptions (decoded at render), so we do
// NOT flag those — only true double-encoded byte sequences.
const MOJIBAKE = /Ã[-¿]|Â[ -¿]|â€[]|ï¿½|Ã¢â‚¬/;
function checkMojibake(ctx) {
  for (const r of ctx.records) {
    const fields = [r.title, r.obj.description, r.obj.copy, r.obj.summary].filter(Boolean);
    for (const f of fields) {
      if (MOJIBAKE.test(String(f))) {
        add('Low', 'Garbled text (encoding)', `"${(r.title || '').slice(0, 60)}" in ${r.array}`,
          `A text field contains mojibake (UTF-8 double-encoding) — e.g. "Ã©" instead of "é". Re-encode the source string.`);
        break;
      }
    }
  }
}

function checkBadSummaries(ctx) {
  const ms = ctx.captured.MANUAL_SUMMARIES;
  if (!ms || typeof ms !== 'object') return;
  let count = 0;
  for (const [key, val] of Object.entries(ms)) {
    const text = typeof val === 'string' ? val : (val && val.summary) || '';
    if (text && ctx.isBadSummary(text)) {
      count++;
      if (count <= 8) {
        add('Low', 'Low-quality meeting summary', `MANUAL_SUMMARIES["${key}"]`,
          `isBadSummary() flags this as a stub/agenda-noise summary rather than a real topic list.`);
      }
    }
  }
  if (count > 8) add('Low', 'Low-quality meeting summary', `+${count - 8} more flagged summaries`,
    `${count} MANUAL_SUMMARIES entries total fail isBadSummary().`);
}

// ── link health (capped, with 403/429 treated as inconclusive) ──
function probe(url) {
  return new Promise(resolve => {
    let mod;
    try { mod = url.startsWith('https') ? https : http; }
    catch { return resolve({ url, status: 0, verdict: 'malformed' }); }
    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' },
      timeout: LINK_TIMEOUT_MS
    }, res => {
      const s = res.statusCode;
      res.resume();
      let verdict = 'ok';
      if (s >= 200 && s < 400) verdict = 'ok';
      else if (s === 401 || s === 403 || s === 429) verdict = 'blocked';   // CI-IP / auth wall, inconclusive
      else if (s === 404 || s === 410) verdict = 'dead';
      else verdict = 'suspect';
      resolve({ url, status: s, verdict });
    });
    req.on('error', () => resolve({ url, status: 0, verdict: 'dead' }));
    req.on('timeout', () => { req.destroy(); resolve({ url, status: 0, verdict: 'timeout' }); });
  });
}

async function checkLinks(ctx) {
  // Probe links from currently-relevant items: upcoming events + all notices
  // + housing. Cap to keep runtime + false-positives down.
  const relevant = ctx.records.filter(r => {
    if (r.kind === 'notice' || r.kind === 'housing') return true;
    if (r.kind === 'event') {
      const iso = isoOf(ctx.localDate, r.rawDate);
      return !iso || daysBetweenIso(TODAY, iso) >= -PAST_GRACE_DAYS; // today or future
    }
    return false;
  });
  const seen = new Map();   // url -> first record
  const malformed = new Map();   // array -> [ "title: link", ... ]
  for (const r of relevant) {
    if (!r.link) continue;
    if (!/^https?:\/\//i.test(r.link)) {
      if (!malformed.has(r.array)) malformed.set(r.array, []);
      malformed.get(r.array).push(`"${r.title}" → ${r.link}`);
      continue;
    }
    if (!seen.has(r.link)) seen.set(r.link, r);
  }
  // Group scheme-less links by source — usually a scraper that dropped the
  // "https://". One finding per array keeps the log readable.
  for (const [arr, list] of malformed) {
    add('Medium', 'Malformed link(s)', `${list.length} scheme-less link(s) in ${arr}`,
      `These hrefs lack "https://" and may render as broken relative links on livabletelluride.org. Fix at the scraper/source so the scheme is stored:\n     • ` +
      list.slice(0, 12).join('\n     • ') + (list.length > 12 ? `\n     • …and ${list.length - 12} more` : ''));
  }
  const urls = [...seen.keys()].slice(0, LINK_CHECK_CAP);
  const dropped = seen.size - urls.length;
  const results = await Promise.all(urls.map(probe));
  for (const res of results) {
    if (res.verdict === 'dead' || res.verdict === 'timeout' || res.verdict === 'suspect') {
      const r = seen.get(res.url);
      const sev = (r.kind === 'notice' || r.kind === 'housing') ? 'High' : 'Medium';
      add(sev, 'Broken link',
        `${res.status || res.verdict}: ${res.url}`,
        `Linked from "${r.title}" in ${r.array}. Status ${res.status || '—'} (${res.verdict}). Verify and update or remove the link.`);
    }
  }
  if (dropped > 0) {
    add('Low', 'Link check capped', `${dropped} additional links not probed this run`,
      `Probed ${urls.length}/${seen.size} distinct links (cap ${LINK_CHECK_CAP}). The rest rotate in on future runs / the maintenance sampler.`);
  }
}

// ════════════════════════════════════════════════════════════════
// 4. AI SEMANTIC PASS (optional — never fails the run)
// ════════════════════════════════════════════════════════════════
function anthropic(model, messages, maxTokens) {
  const body = JSON.stringify({ model, max_tokens: maxTokens, messages });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-length': Buffer.byteLength(body)
      }, timeout: 60000
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('AI request timeout')); });
    req.write(body); req.end();
  });
}

async function checkAI(ctx) {
  if (!ANTHROPIC_API_KEY) {
    console.log('  ℹ ANTHROPIC_API_KEY not set — skipping AI semantic pass');
    return;
  }
  // Build a compact digest of upcoming events + meetings only.
  const upcoming = ctx.records.filter(r => {
    if (!['event', 'meeting'].includes(r.kind)) return false;
    const iso = isoOf(ctx.localDate, r.rawDate);
    if (!iso) return true; // include unparseable so the AI can comment
    const d = daysBetweenIso(TODAY, iso);
    return d >= -PAST_GRACE_DAYS && d <= AI_LOOKAHEAD_DAYS;
  }).map(r => ({
    kind: r.kind, array: r.array, title: r.title,
    date: r.rawDate, end: r.endRaw || undefined, source: r.source
  }));

  if (!upcoming.length) { console.log('  ℹ AI pass: no upcoming items in window'); return; }

  const prompt =
    `Today is ${TODAY} (America/Denver). You are auditing the events/meetings feed for the ` +
    `Livable Telluride civic website for CONTENT ERRORS a careful editor would catch. Review this JSON list ` +
    `and report ONLY clear problems:\n` +
    `- duplicate or near-duplicate entries that should be merged\n` +
    `- a date that contradicts the title (e.g. title says "Friday" or "July 4th" but the date is a different day)\n` +
    `- an item mislabeled, garbled, or with an obviously wrong/placeholder value\n` +
    `- a civic detail that looks internally inconsistent\n` +
    `Do NOT flag legitimately recurring or multi-day items (same title on consecutive/different days is fine). ` +
    `Be conservative — no speculation. Return STRICT JSON only, an array of ` +
    `{"severity":"High|Medium|Low","category":"...","item":"<title> (<date>)","problem":"...","suggestedFix":"..."} ` +
    `(empty array [] if nothing is clearly wrong).\n\nDATA:\n` +
    JSON.stringify(upcoming).slice(0, 90000);

  let json;
  try {
    json = await anthropic(REVIEW_MODEL, [{ role: 'user', content: prompt }], 2048);
  } catch (e) {
    add('Low', 'AI pass error', 'AI semantic pass could not run', `Request failed: ${e.message}. Deterministic checks above are unaffected.`);
    return;
  }
  const text = (json && json.content && json.content[0] && json.content[0].text) || '';
  let items;
  try {
    const m = text.match(/\[[\s\S]*\]/);
    items = JSON.parse(m ? m[0] : text);
  } catch {
    console.log('  ℹ AI pass returned non-JSON — skipping');
    return;
  }
  if (!Array.isArray(items)) return;
  for (const it of items.slice(0, 25)) {
    const sev = ['High', 'Medium', 'Low'].includes(it.severity) ? it.severity : 'Low';
    add(sev, 'AI: ' + (it.category || 'content'), it.item || '(unspecified item)',
      `${it.problem || ''}${it.suggestedFix ? '\n    Suggested fix: ' + it.suggestedFix : ''}`,
      { ai: true });
  }
}

// Silent-scraper-failure detection. Reads the rolling baseline that
// content-refresh maintains (scripts/source-baselines.json) and flags any
// source whose item count collapsed — a High finding, so it flows into the
// exception email. See scripts/source-health.js + docs/content-review.md.
const sourceHealth = require('./source-health.js');
function checkSourceHealth(ctx) {
  let baseline;
  try { baseline = sourceHealth.readBaseline(REPO_ROOT); } catch { return; }
  if (!baseline || !baseline.sources || !Object.keys(baseline.sources).length) return;
  for (const a of sourceHealth.detectAnomalies(ctx.arrays, baseline)) {
    add(a.severity, 'Source may be broken', a.name, a.message);
  }
  // Staleness/orphan checks don't need the baseline — a frozen cached meeting
  // list or an orphaned future summary won't trip the count-based anomaly check.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  for (const a of sourceHealth.detectStaleData(ctx.captured, ctx.localDate, today)) {
    add(a.severity, 'Stale data / orphan summary', a.name, a.message);
  }
}

// ════════════════════════════════════════════════════════════════
// 5. CHECK REGISTRY + RUNNER
// ════════════════════════════════════════════════════════════════
const CHECKS = [
  checkSourceHealth,
  checkDuplicates,
  checkCrossSourceDateConflict,
  checkDates,
  checkPastEvents,
  checkMissingTitle,
  checkMojibake,
  checkBadSummaries,
  checkLinks,      // async
  checkAI          // async
];

function renderLog() {
  if (!findings.length) return '';
  findings.sort((a, b) =>
    (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) ||
    a.category.localeCompare(b.category));
  const counts = findings.reduce((m, f) => (m[f.severity] = (m[f.severity] || 0) + 1, m), {});
  const head = `Content review — ${TODAY} (America/Denver)\n` +
    `${findings.length} finding(s): ` +
    ['Critical', 'High', 'Medium', 'Low'].filter(s => counts[s]).map(s => `${counts[s]} ${s}`).join(', ') +
    `\n` + '─'.repeat(64) + '\n';
  const body = findings.map((f, i) =>
    `${i + 1}. [${f.severity}] ${f.category}\n   ${f.title}\n   ${String(f.detail).replace(/\n/g, '\n   ')}`
  ).join('\n\n');
  return head + body + '\n';
}

// Render only the findings that need a human (non-Low). Used for the
// exception-only email.
function renderActionable(list) {
  if (!list.length) return '';
  const head = `Content review — action needed — ${TODAY} (America/Denver)\n` +
    `${list.length} item(s) need your judgment (auto-fixable issues are handled by the bot and not listed):\n` +
    '─'.repeat(64) + '\n';
  const body = list.map((f, i) =>
    `${i + 1}. [${f.severity}] ${f.category}\n   ${f.title}\n   ${String(f.detail).replace(/\n/g, '\n   ')}`
  ).join('\n\n');
  return head + body + '\n';
}

async function main() {
  console.log(`Content review starting — today is ${TODAY} (America/Denver)`);
  const { arrays, captured, localDate, isBadSummary } = loadData();
  const records = buildRecords(arrays);
  console.log(`Discovered ${Object.keys(arrays).length} data arrays, ${records.length} records ` +
    `(events: ${records.filter(r => r.kind === 'event').length}, meetings: ${records.filter(r => r.kind === 'meeting').length}).`);

  const ctx = {
    arrays, captured, records, localDate, isBadSummary,
    dataSrc: fs.readFileSync(GOV_DATA_JS, 'utf8'),
    helpersSrc: fs.readFileSync(GOV_HELPERS_JS, 'utf8')
  };

  for (const check of CHECKS) {
    try {
      await check(ctx);
    } catch (e) {
      add('Low', 'Check error', `${check.name} threw`, `Internal error in a check: ${e.message}. Other checks ran normally.`);
    }
  }

  const log = renderLog();
  const actionable = findings.filter(f => f.severity !== 'Low');
  if (log) {
    fs.writeFileSync(FINDINGS_LOG, log);
    fs.writeFileSync(FINDINGS_JSON, JSON.stringify({ date: TODAY, findings }, null, 2));
    if (actionable.length) fs.writeFileSync(FINDINGS_ACTIONABLE, renderActionable(actionable));
    else if (fs.existsSync(FINDINGS_ACTIONABLE)) fs.unlinkSync(FINDINGS_ACTIONABLE);
    console.log(`\n${findings.length} finding(s) written to content-review-findings.log`);
    console.log(`ACTIONABLE=${actionable.length}`);
    console.log('─'.repeat(64));
    console.log(log);
  } else {
    // remove any stale logs from a previous run so the workflow closes the issue
    for (const f of [FINDINGS_LOG, FINDINGS_JSON, FINDINGS_ACTIONABLE]) if (fs.existsSync(f)) fs.unlinkSync(f);
    console.log('ACTIONABLE=0');
    console.log('✓ No content issues found — clean run.');
  }
}

main().catch(err => {
  console.error('FATAL:', err && err.stack || err);
  process.exit(1);
});
