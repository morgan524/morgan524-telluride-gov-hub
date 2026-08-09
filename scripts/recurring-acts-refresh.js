#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Recurring Acts Refresh
 * Runs via GitHub Actions (partner-events-refresh.yml), Mondays.
 *
 * Keeps recurring-acts.json current. Several event series have a GENERIC title
 * that hides the specific act of each occurrence — "Movie Mondays" is really
 * Top Gun on Aug 17; "Augment Summer Music Series" is really Charlie and the
 * Leatherheads on Sep 15. events.html renders these as single-day Daily cards
 * and suppresses the matching generic series from the Recurring calendar, so
 * this file is the only place the real act appears.
 *
 * WHY THIS SCRIPT EXISTS (2026-08-09): this was a Claude scheduled task on
 * Morgan's Mac, pointed at ~/Documents/Claude/Projects/Livable-Telluride2 — the
 * workspace retired 2026-06-26. It fired weekly into a missing directory and
 * did nothing. recurring-acts.json had not changed since the commit that
 * created it (2026-06-15). See partner-events-refresh.js for the same story.
 *
 * HOW IT WORKS
 *   1. KNOWN_SERIES are refreshed every run (Movie Mondays, Augment).
 *   2. DISCOVERY finds new rotating series the cheap, deterministic way: a
 *      series shows up in telluride.com's inline fcEventsData as the SAME event
 *      slug on many different dates. Claude only judges which of those repeats
 *      are rotating ACT series (concerts/films) versus markets, tours and
 *      exhibits — it is never asked to invent the candidate list.
 *   3. Each series' own detail page is read for the per-date lineup.
 *
 * Claude never computes a date: it reports the month/day the page prints and
 * lib/scrape.js resolves it in Mountain time.
 *
 * FAILURE POLICY — a series whose page is unreachable KEEPS its existing
 * entries rather than losing them (a bad afternoon at one venue must not empty
 * a card that was fine yesterday). A run where EVERY series fails throws, so
 * total breakage still opens a CI-health issue instead of passing quietly.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

const {
  MT, mtToday, addDays, resolveMonthDay,
  fetchUrl, fetchJson, htmlToText, callClaudeJson
} = require('./lib/scrape.js');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const ACTS_JSON = path.join(REPO_ROOT, 'recurring-acts.json');
const DRY_RUN   = process.argv.includes('--dry-run');

// Keep an occurrence for a week after it happens — the Daily view still shows
// "last night" while the rest of the site catches up.
const KEEP_PAST_DAYS = 7;
// Cap on detail pages opened for newly DISCOVERED series in one run. Known
// series are always refreshed and don't count against this.
const MAX_DISCOVERED = 5;
// A telluride.com slug must appear on at least this many distinct dates before
// it's considered a series at all.
const MIN_SERIES_DATES = 3;

// Series that already reach the Events page through a DEDICATED array in
// js/gov-helpers.js. Discovery finds them (they genuinely are rotating-act
// series) but adding them here would double-list every night.
//
// Music on the Green: MUSIC_ON_THE_GREEN already carries per-band entries —
// "Ben Musser & Walker Young — Music on the Green" on 2026-08-14 and five more,
// the exact acts and dates discovery returned on 2026-08-09. The pre-cutover
// events.html suppressed the generic span for precisely this reason.
const COVERED_ELSEWHERE = [
  /music on the green/i,
];

const LOCALIST_API = 'https://events.ourayridgwayevents.com/api/2/events?school=ridgwayouray&days=120&pp=100';
const TELLURIDE_CAL = 'https://www.telluride.com/festivals-events/events/';

// ── Series we always refresh ──────────────────────────────────
// `isMovie` matters twice: the title must keep the word "movie" (events.html's
// Recurring-suppress and the poster bot both detect on it), and the image is
// ALWAYS left empty because content-refresh fills movie posters from TMDB.
const KNOWN_SERIES = [
  {
    name: 'Movie Mondays',
    source: 'Ouray Ridgway Calendar',
    location: 'Hartwell Park, Ridgway',
    isMovie: true,
    // The Localist urlname changes with each film, so the detail URL has to be
    // looked up by title rather than hardcoded.
    resolveUrl: async () => {
      const feed = await fetchJson(LOCALIST_API);
      const ev = (feed.events || [])
        .map(e => e.event)
        .find(e => e && /movie mondays/i.test(e.title || ''));
      if (!ev?.urlname) throw new Error('no "Movie Mondays" event in the Ouray/Ridgway feed');
      return `https://events.ourayridgwayevents.com/event/${ev.urlname}`;
    }
  },
  {
    name: 'Augment Summer Music Series',
    source: 'Telluride.com',
    location: 'Elks Park, Telluride',
    isMovie: false,
    url: 'https://www.telluride.com/event/augment-summer-music-series/'
  }
];

// ── Prompts ───────────────────────────────────────────────────
const SYSTEM = `You read one event series' own web page and return STRICT JSON.

Rules:
- Report only what the page states. Never invent an act, a date, or a time.
- NEVER compute a calendar date. Report the month and day the page prints; the caller resolves the year.
- A page often lists the WHOLE season including dates already past. Report every date it lists — the caller drops the past ones.
- Return ONLY the JSON object. No prose, no code fence.`;

const lineupPrompt = (series, text) => `This is the page for the event series "${series.name}".

Return JSON: { "occurrences": [
  { "month": 8, "day": 17, "act": "Top Gun", "time": "8:30 PM", "description": "..." }, ... ] }

"act" is the SPECIFIC film/band/performer for that date — NOT the series name.
Omit any occurrence whose specific act the page does not name.
If the page names NO specific acts at all, return {"occurrences": []} — that is a
valid answer, not an error. Return the JSON either way; never explain in prose.
"month" is a NUMBER 1-12, "day" a number. Do not output a year.
"description" is one sentence in the page's own words about what the evening is.
If the page names a different venue for a date, add "location".

PAGE TEXT:
${text}`;

const classifyPrompt = (candidates) => `Below are event series from the Telluride events calendar, each repeating on several dates.

Return JSON: { "series": [ { "slug": "...", "name": "...", "location": "..." }, ... ] }

Include ONLY series where each occurrence is a DIFFERENT named act — a concert
series with a different band each time, or a film series with a different movie.
Those are the ones whose generic title hides what's actually on.

EXCLUDE anything where every occurrence is the same experience: farmers markets,
tastings, tours, gallery exhibits, art walks, fitness classes, open mics,
registration notices, and recurring happy hours.

"name" is the series' display name, cleaned of any HTML. "location" is the venue
if the title implies one, else "Telluride".

CANDIDATES:
${candidates.map(c => `- slug: ${c.slug}\n  title: ${c.title}\n  dates: ${c.dates.join(', ')}`).join('\n')}`;

// ── Discovery ─────────────────────────────────────────────────
function stripTags(s) {
  return htmlToText(String(s || '')).replace(/\s+/g, ' ').trim();
}

// telluride.com ships every event inline as window.fcEventsData (~560 entries).
// A series is simply the same /event/<slug>/ appearing on many distinct dates —
// no guessing required, which keeps Claude's job to classification only.
async function discoverTellurideSeries(todayISO) {
  const res = await fetchUrl(TELLURIDE_CAL);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for the Telluride.com calendar`);
  const m = res.text.match(/fcEventsData\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) throw new Error('fcEventsData not found — telluride.com changed its calendar markup');

  const events = JSON.parse(m[1]);
  const bySlug = new Map();
  for (const e of events) {
    const href = (e.href || e.url || '') + '';
    const slugMatch = href.match(/\/event\/([^/?#]+)/);
    const day = String(e.start || '').slice(0, 10);
    if (!slugMatch || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < todayISO) continue;
    const slug = slugMatch[1];
    if (!bySlug.has(slug)) bySlug.set(slug, { slug, title: stripTags(e.title), dates: new Set() });
    bySlug.get(slug).dates.add(day);
  }

  return [...bySlug.values()]
    .map(c => ({ ...c, dates: [...c.dates].sort() }))
    .filter(c => c.dates.length >= MIN_SERIES_DATES && c.title)
    .sort((a, b) => b.dates.length - a.dates.length);
}

// ── Image validation ──────────────────────────────────────────
// Only a URL we have actually confirmed is an image gets written. A hotlinked
// guess that 404s renders as a broken card, which is worse than the series-logo
// fallback events.html already provides.
function looksLikeImageUrl(u) {
  return /^https:\/\/[^\s"']+\.(jpg|jpeg|png|webp)(\?[^\s"']*)?$/i.test(String(u || ''));
}
function verifyImage(url) {
  return new Promise((resolve) => {
    try {
      const req = https.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
        resolve(res.statusCode === 200 && /^image\//i.test(res.headers['content-type'] || ''));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    } catch (_) { resolve(false); }
  });
}

// ── Per-series extraction ─────────────────────────────────────
async function extractSeries(series, todayISO) {
  const url = series.url || await series.resolveUrl();
  const res = await fetchUrl(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${url}`);

  const text = htmlToText(res.text, { keepLinks: !series.isMovie }).slice(0, 40000);
  if (text.length < 300) throw new Error(`only ${text.length} chars of text at ${url} — layout changed?`);

  // A page that loaded fine but names no specific acts is a real answer, not a
  // failure: the series simply has nothing to surface right now (its season is
  // over, or it turned out not to be an act series after all). Returning [] here
  // — rather than throwing — is what separates "nothing on" from "page broken";
  // only the latter carries stale entries forward.
  const answer = await callClaudeJson(SYSTEM, lineupPrompt(series, text));
  const occurrences = Array.isArray(answer?.occurrences) ? answer.occurrences : [];
  if (!occurrences.length) return [];

  const cutoff = addDays(todayISO, -KEEP_PAST_DAYS);
  const entries = [];
  for (const o of occurrences) {
    const act = String(o?.act || '').trim();
    if (!act) continue;
    const date = resolveMonthDay(o.month, o.day, todayISO);
    if (!date || date < cutoff) continue;

    let image = '';
    // Movie posters come from TMDB via content-refresh — never set one here.
    if (!series.isMovie && looksLikeImageUrl(o.image) && await verifyImage(o.image)) {
      image = o.image;
    }

    entries.push({
      series: series.name,
      date,
      title: `${series.name}: ${act}`,
      time: String(o.time || '').trim(),
      location: String(o.location || series.location || '').trim(),
      description: String(o.description || '').trim(),
      link: url,
      image,
      source: series.source
    });
  }
  return entries;
}

// What a reader would notice changing — descriptions are regenerated prose, so
// they're excluded or the file would churn every single Monday.
function sigOf(list) {
  return JSON.stringify((list || [])
    .map(e => [e.series, e.date, e.title, e.time, e.location, e.link].join('|'))
    .sort());
}

async function main() {
  const todayISO = mtToday();
  console.log(`Recurring acts refresh — today is ${todayISO} (${MT})`);

  const doc = JSON.parse(fs.readFileSync(ACTS_JSON, 'utf8'));
  const existing = Array.isArray(doc.series) ? doc.series : [];
  console.log(`  current file: ${existing.length} occurrences`);

  // Existing images are worth keeping: movie entries carry a TMDB poster that
  // content-refresh filled in, and this script deliberately never sets one.
  const imageByKey = new Map();
  for (const e of existing) if (e.image) imageByKey.set(`${e.series}|${e.date}`, e.image);

  // ── Build the series list: known first, then discovered.
  const seriesList = [...KNOWN_SERIES];
  try {
    const candidates = await discoverTellurideSeries(todayISO);
    console.log(`\n🔎 ${candidates.length} repeating Telluride.com series to classify`);
    if (candidates.length) {
      const known = new Set(seriesList.map(s => s.name.toLowerCase()));
      const picked = (await callClaudeJson(SYSTEM, classifyPrompt(candidates.slice(0, 40))))?.series || [];
      for (const p of picked) {
        if (!p?.slug || !p?.name || known.has(String(p.name).toLowerCase())) continue;
        if (COVERED_ELSEWHERE.some(re => re.test(p.name))) {
          console.log(`  – ${p.name} (already has its own array — skipping to avoid double-listing)`);
          continue;
        }
        if (seriesList.length - KNOWN_SERIES.length >= MAX_DISCOVERED) {
          console.log(`  … capped at ${MAX_DISCOVERED} discovered series; skipping the rest`);
          break;
        }
        seriesList.push({
          name: p.name,
          source: 'Telluride.com',
          location: p.location || 'Telluride',
          isMovie: /movie|film|cinema/i.test(p.name),
          url: `https://www.telluride.com/event/${p.slug}/`
        });
        console.log(`  + ${p.name}`);
      }
    }
  } catch (e) {
    // Discovery is an enhancement — losing it must not cost us the known series.
    console.warn(`  ⚠ discovery skipped: ${e.message}`);
  }

  // ── Refresh each series independently.
  const fresh = [];
  const carried = [];
  const failures = [];
  for (const series of seriesList) {
    try {
      const entries = await extractSeries(series, todayISO);
      fresh.push(...entries);
      if (!entries.length) {
        console.log(`\n· ${series.name}: page read fine, no upcoming named acts — nothing to surface`);
      } else {
        console.log(`\n✓ ${series.name}: ${entries.length} upcoming`);
        for (const e of entries) console.log(`    ${e.date}  ${e.title}`);
      }
    } catch (e) {
      failures.push(`${series.name}: ${e.message}`);
      const keep = existing.filter(x => x.series === series.name && x.date >= addDays(todayISO, -KEEP_PAST_DAYS));
      carried.push(...keep);
      console.warn(`\n⚠ ${series.name}: ${e.message}`);
      console.warn(`   keeping ${keep.length} existing occurrence(s) rather than dropping them`);
    }
  }

  if (failures.length === seriesList.length) {
    throw new Error(`every series failed:\n  - ` + failures.join('\n  - '));
  }

  // Series that are no longer tracked at all (a discovered series that stopped
  // repeating) keep their still-future entries until they age out naturally.
  const handled = new Set(seriesList.map(s => s.name));
  const untouched = existing.filter(e => !handled.has(e.series) && e.date >= addDays(todayISO, -KEEP_PAST_DAYS));

  const merged = [...fresh, ...carried, ...untouched]
    .map(e => {
      const prior = imageByKey.get(`${e.series}|${e.date}`);
      return e.image ? e : (prior ? { ...e, image: prior } : e);
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  console.log(`\n${merged.length} occurrences (${fresh.length} fresh, ${carried.length} carried, ${untouched.length} untracked)`);

  if (sigOf(existing) === sigOf(merged)) {
    console.log('✓ No changes — recurring-acts.json already current.');
  } else if (DRY_RUN) {
    console.log('\n🔎 --dry-run: would rewrite recurring-acts.json (nothing written)');
  } else {
    doc.series = merged;
    const out = JSON.stringify(doc, null, 2) + '\n';
    JSON.parse(out); // never ship a file events.html can't fetch-and-parse
    fs.writeFileSync(ACTS_JSON, out, 'utf8');
    console.log('\n✅ Wrote recurring-acts.json');
  }

  if (failures.length) {
    console.warn(`\n⚠ ${failures.length} of ${seriesList.length} series could not be refreshed (existing entries kept):`);
    for (const f of failures) console.warn('   - ' + f);
  }
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
