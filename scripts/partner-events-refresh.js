#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Partner Events Refresh
 * Runs via GitHub Actions (partner-events-refresh.yml), Mondays.
 *
 * Refreshes the two partner-venue event arrays in js/gov-helpers.js that the
 * 6-hourly content-refresh bot does NOT touch, because neither source has a
 * feed — both publish their schedule as human prose/markup on one page:
 *
 *   • BEACON_EVENTS        ← beacontelluride.com/upcoming-events
 *   • CHAMBER_MUSIC_EVENTS ← telluridechambermusic.org/events/
 *
 * WHY THIS SCRIPT EXISTS (2026-08-09): both arrays used to be refreshed by
 * Claude *scheduled tasks* running on Morgan's Mac. Those tasks pointed at
 * ~/Documents/Claude/Projects/Livable-Telluride2, the workspace retired on
 * 2026-06-26. From that day they fired weekly into a directory that no longer
 * existed and did nothing — silently, because the scheduler still recorded a
 * lastRunAt. BEACON_EVENTS sat frozen at 2026-06-11..07-10 (entirely in the
 * past) for a month before anyone noticed. Running in Actions removes the
 * local-machine dependency; the loud-failure rules below remove the silence.
 *
 * HOW CLAUDE IS USED: only to read prose and return STRUCTURED FACTS. It never
 * computes dates. Recurring events come back as {weekday}, specific ones as
 * {month, day}, and this script resolves both to real calendar dates in MT —
 * LLM date arithmetic is the classic source of off-by-one event listings.
 *
 * FAILURE POLICY — fail loudly, never silently no-op:
 *   • a source that won't fetch, won't parse, or yields ZERO events throws;
 *   • an array is never overwritten with an empty one;
 *   • a >60% drop in entry count throws (a page redesign, not a quiet season).
 * The workflow's ci-health-issue step turns any of these into a GitHub issue.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const {
  MT, mtToday, resolveMonthDay, weeklyOccurrences,
  fetchUrl, htmlToText, callClaudeJson
} = require('./lib/scrape.js');
const { assertParses }        = require('./lib/write-guard.js');
const { mirrorAll }           = require('./lib/json-mirror.js');
const { replaceJsArrayStrict } = require('./lib/replace.js');
const { extractJsArray }      = require('./lib/extract.js');
const { validateRecords }     = require('./lib/validate.js');

const REPO_ROOT      = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HELPERS_JS = path.join(REPO_ROOT, 'js', 'gov-helpers.js');
// --dry-run: do everything except write. For checking a source's extraction by
// hand after a page redesign, without touching the data files.
const DRY_RUN = process.argv.includes('--dry-run');

// How far ahead to project weekly recurrences.
const WEEKS_AHEAD = 6;
// Refuse a write that drops more than this share of the existing entries — a
// source page redesign looks exactly like "the season ended", and only one of
// those should be allowed to empty the Events page.
const MAX_SHRINK = 0.6;

const SYSTEM = `You extract event listings from a venue's own web page and return STRICT JSON.

Rules:
- Report only what the page states. Never invent an event, a time, or a description.
- NEVER compute or output a calendar date. Report months/days or a weekday exactly as the page gives them; the caller resolves real dates.
- Descriptions: one or two sentences, drawn from the page's own wording. No marketing padding.
- Return ONLY the JSON object. No prose, no code fence.`;

// ── Sources ───────────────────────────────────────────────────
const SOURCES = [
  {
    constName: 'BEACON_EVENTS',
    label: 'Beacon',
    url: 'https://www.beacontelluride.com/upcoming-events',
    keepLinks: false,
    prompt: (text) => `This is the Beacon (Telluride) "Upcoming Events" page as plain text.

Return JSON: { "events": [ ... ] } where each event is ONE of:

  { "kind": "dated",  "title": "...", "dates": [{"month": 8, "day": 14}, ...],
    "time": "6:00 PM", "description": "...", "location": "..." }

  { "kind": "weekly", "title": "...", "weekday": "Tuesday",
    "time": "6:00 PM", "description": "...", "location": "..." }

Use "dated" when the page names specific calendar dates, "weekly" when it says an
event happens every <weekday>.

EXCLUDE anything the page marks as paused, seasonal-and-not-currently-running, or
returning later (e.g. "on pause until winter", ski-season programs in summer).
Only list programs a reader could attend now.

"location" is the specific room/venue the page names, or "Beacon, Telluride" if it
names none. "time" is as printed (e.g. "7:00 PM", or "7:00-9:00 PM" for a range).

PAGE TEXT:
${text}`,
    // The Beacon logo is the card image for every Beacon entry.
    toEntry: (e, date) => ({
      title: e.title,
      link: 'https://www.beacontelluride.com/upcoming-events',
      description: e.description || '',
      date,
      time: e.time || '',
      source: 'beacon',
      sourceLabel: 'Beacon',
      category: 'Community Event',
      location: e.location || 'Beacon, Telluride',
      imageUrl: 'https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp'
    })
  },

  {
    constName: 'CHAMBER_MUSIC_EVENTS',
    label: 'Telluride Chamber Music',
    url: 'https://telluridechambermusic.org/events/',
    keepLinks: true,
    prompt: (text) => `This is the Telluride Chamber Music events page as plain text.
Links appear as [[href:/concert/some-slug]] markers immediately before the title
they belong to.

Return JSON: { "events": [
  { "title": "...", "month": 6, "day": 28, "time": "6:00 PM",
    "slug": "some-slug", "description": "...", "location": "..." }, ... ] }

Each concert card prints its date as "Weekday · Mon D · H:MM AM/PM" with NO year —
report "month" as a NUMBER 1-12 and "day" as a number. Do not guess a year.

"slug" is the final path segment of that concert's /concert/<slug> link. If a card
has no link, omit "slug".

"location" is the venue named on the card, or "Telluride" if none is named.
Every concert on the page must appear exactly once.

PAGE TEXT:
${text}`,
    toEntry: (e, date) => ({
      title: e.title,
      link: e.slug
        ? `https://telluridechambermusic.org/concert/${e.slug}`
        : 'https://telluridechambermusic.org/events/',
      description: e.description || '',
      date,
      time: e.time || '',
      source: 'chamber-music',
      sourceLabel: 'Telluride Chamber Music',
      category: 'Concert',
      location: e.location || 'Telluride',
      // The site names concert art after the slug; without one, events.html
      // falls back to the source logo (see docs/events-sources.md).
      ...(e.slug ? { imageUrl: `https://telluridechambermusic.org/concerts/${e.slug}.webp` } : {})
    })
  }
];

// The actionable identity of an event list: what a reader would notice changing.
// Deliberately excludes `description`, which is regenerated prose.
function sigOf(entries) {
  return JSON.stringify((entries || []).map(e =>
    [e.date, e.title, e.time, e.location, e.link, e.imageUrl].map(v => String(v ?? '')).join('|')
  ));
}

// Expand one Claude-reported event into concrete dated entries.
function expand(source, e, todayISO) {
  const out = [];
  if (!e || !e.title || !String(e.title).trim()) return out;

  if (e.kind === 'weekly') {
    for (const d of weeklyOccurrences(e.weekday, WEEKS_AHEAD, todayISO)) {
      out.push(source.toEntry(e, d));
    }
    return out;
  }

  // "dated" (Beacon) — a list of month/day pairs.
  if (Array.isArray(e.dates)) {
    for (const md of e.dates) {
      const d = resolveMonthDay(md?.month, md?.day, todayISO);
      if (d) out.push(source.toEntry(e, d));
    }
    return out;
  }

  // Single month/day (Chamber Music).
  const d = resolveMonthDay(e.month, e.day, todayISO);
  if (d) out.push(source.toEntry(e, d));
  return out;
}

async function refreshSource(source, govSrc, todayISO) {
  console.log(`\n── ${source.constName} ← ${source.url}`);

  const res = await fetchUrl(source.url);
  if (res.status !== 200) {
    throw new Error(`${source.label}: HTTP ${res.status} — cannot refresh ${source.constName}.`);
  }
  const text = htmlToText(res.text, { keepLinks: source.keepLinks }).slice(0, 60000);
  if (text.length < 400) {
    throw new Error(`${source.label}: page yielded only ${text.length} chars of text — layout changed or a challenge page was served.`);
  }
  console.log(`  fetched ${res.text.length} bytes → ${text.length} chars of text`);

  const answer = await callClaudeJson(SYSTEM, source.prompt(text));
  const raw = Array.isArray(answer?.events) ? answer.events : [];
  if (!raw.length) {
    throw new Error(`${source.label}: Claude found no events on a page that fetched fine — refusing to blank ${source.constName}.`);
  }

  // Expand → drop past dates → sort → validate.
  let entries = raw.flatMap(e => expand(source, e, todayISO))
                   .filter(e => e.date >= todayISO)
                   .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  const { kept, quarantined } = validateRecords(entries);
  for (const q of quarantined) console.warn(`  ⚠ dropped "${q.record.title}": ${q.reason}`);
  entries = kept;

  if (!entries.length) {
    throw new Error(`${source.label}: every extracted event resolved to a past date — refusing to blank ${source.constName}.`);
  }

  const existing = extractJsArray(govSrc, source.constName) || [];
  const upcomingExisting = existing.filter(e => String(e.date) >= todayISO).length;
  if (upcomingExisting > 0 && entries.length < upcomingExisting * (1 - MAX_SHRINK)) {
    throw new Error(
      `${source.label}: found ${entries.length} upcoming events but ${source.constName} already had ` +
      `${upcomingExisting} — a >${Math.round(MAX_SHRINK * 100)}% drop looks like a page redesign, not a schedule change. ` +
      `Refusing to write; check ${source.url}.`
    );
  }

  // Compare on the FACTS, not the prose. Claude rewords a description slightly
  // on every extraction, so deep-equality would report a change every Monday
  // and commit churn forever. If what a reader acts on — what/when/where/link —
  // is identical, the existing entries stay exactly as they are.
  const unchanged = sigOf(existing) === sigOf(entries);
  console.log(`  ${entries.length} upcoming entries (was ${existing.length}, ${upcomingExisting} upcoming)${unchanged ? ' — unchanged' : ''}`);
  if (!unchanged) {
    const range = `${entries[0].date} → ${entries[entries.length - 1].date}`;
    console.log(`  dates ${range}`);
  }

  return { entries, unchanged };
}

async function main() {
  const todayISO = mtToday();
  console.log(`Partner events refresh — today is ${todayISO} (${MT})`);

  let govSrc = fs.readFileSync(GOV_HELPERS_JS, 'utf8');
  const changedConsts = [];
  const failures = [];

  // Refresh each source independently: one broken partner site must not stop
  // the other from updating. Any failure still fails the run at the end.
  for (const source of SOURCES) {
    try {
      const { entries, unchanged } = await refreshSource(source, govSrc, todayISO);
      if (unchanged) continue;
      govSrc = replaceJsArrayStrict(govSrc, source.constName, entries);
      changedConsts.push([source.constName, entries]);
    } catch (e) {
      console.error(`  ✗ ${source.constName}: ${e.message}`);
      failures.push(`${source.constName}: ${e.message}`);
    }
  }

  if (changedConsts.length && DRY_RUN) {
    console.log(`\n🔎 --dry-run: would update ${changedConsts.map(([n]) => n).join(', ')} (nothing written)`);
    for (const [name, entries] of changedConsts) {
      console.log(`\n${name}:\n` + entries.map(e => `  ${e.date}  ${e.time || '—'}  ${e.title}`).join('\n'));
    }
  } else if (changedConsts.length) {
    // Compile-check the whole file before it lands: a dropped bracket in
    // gov-helpers.js silently nukes every const below it.
    assertParses('gov-helpers.js', govSrc);
    fs.writeFileSync(GOV_HELPERS_JS, govSrc, 'utf8');
    console.log(`\n✅ Wrote ${changedConsts.map(([n]) => n).join(', ')} to js/gov-helpers.js`);

    // Re-mirror to data/<name>.json after writing the JS const — the rebuilt
    // pages read the mirrors (js/lt-data.js), not the JS. Unconditional and
    // write-if-different, so it no-ops on a quiet run and self-heals drift.
    // A missing const is FATAL rather than mirrored as empty (audit P0-2).
    const { written, failures } = mirrorAll(REPO_ROOT);
    console.log(`   JSON mirrors: ${written.length} written/verified.`);
    if (failures.length) {
      throw new Error('JSON mirror FAILED — refusing to ship:\n  ' + failures.join('\n  '));
    }
  } else if (!failures.length) {
    console.log('\n✓ No changes — both partner calendars already current.');
  }

  if (failures.length) {
    throw new Error(`${failures.length} source(s) failed:\n  - ` + failures.join('\n  - '));
  }
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
