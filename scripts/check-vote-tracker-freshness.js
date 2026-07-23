#!/usr/bin/env node
/**
 * check-vote-tracker-freshness.js — weekly assurance for the Board Vote Tracker.
 *
 * The tracker is updated automatically now (meeting-recaps.js drafts votes from
 * each meeting transcript, insert-votes.mjs splices them into
 * v2/vote-tracker.html, and run-meeting-recaps-local.sh commits the result).
 * This script is the WEEKLY CHECK that the automation is actually working: it
 * compares what we have RECAPPED against what the tracker has VOTES for, per
 * entity, and reports any meeting that got a recap but never got votes.
 *
 * Morgan asked for the tracker to be current at least once a week for every
 * entity (2026-07-23). Automation does the updating; this is what notices when
 * it silently stops — which is exactly what happened before: the auto-draft had
 * a `roster`/`rosters` typo and produced nothing for months, with no signal.
 *
 * Usage:  node scripts/check-vote-tracker-freshness.js [--json] [--max-age-days N]
 * Exit 0 = everything current. Exit 1 = something is behind (CI opens an issue).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { extractJsArray } = require('./lib/extract.js');

const ROOT = path.resolve(__dirname, '..');
const TRACKER = path.join(ROOT, 'v2', 'vote-tracker.html');
const GOV_HELPERS = path.join(ROOT, 'js', 'gov-helpers.js');
const JSON_OUT = process.argv.includes('--json');
const i = process.argv.indexOf('--max-age-days');
// 45 days ≈ 1.5 monthly cycles. These boards mostly meet monthly, so 21 days
// cried wolf on a body that met three weeks ago; 45 lets a single skipped
// meeting pass while still catching a pipeline that has genuinely died.
const MAX_AGE = i > -1 ? Number(process.argv[i + 1]) : 45;

// tracker entity → { label, idPrefix, sourceKey }. `sourceKey` is the recap
// channel this body's meetings would arrive on; if that channel isn't watched
// by meeting-recaps.js, nothing can ever reach the tracker for it.
const ENTITIES = {
  telluride: { label: 'Telluride Town Council',        idPrefix: 'v',    sourceKey: 'telluride' },
  bocc:      { label: 'San Miguel County BOCC',        idPrefix: 'bv',   sourceKey: 'county' },
  tomv:      { label: 'Mountain Village Town Council', idPrefix: 'mv',   sourceKey: 'mv' },
  drb:       { label: 'MV Design Review Board',        idPrefix: 'drb',  sourceKey: 'mv' },
  pc:        { label: 'SMC Planning Commission',       idPrefix: 'pv',   sourceKey: 'county' },
  rico:      { label: 'Rico Board of Trustees',        idPrefix: 'rico', sourceKey: 'rico' },
};

// Channels meeting-recaps.js actually pulls. Read from the script itself so
// this can't drift: adding a channel there fixes the report here automatically.
function watchedSourceKeys() {
  const src = fs.readFileSync(path.join(__dirname, 'meeting-recaps.js'), 'utf8');
  const block = src.slice(src.indexOf('const CHANNELS'), src.indexOf('];', src.indexOf('const CHANNELS')));
  return new Set([...block.matchAll(/sourceKey:\s*'([^']+)'/g)].map((m) => m[1]));
}

// Same routing meeting-recaps.js uses, so "recapped" and "tracked" line up.
function trackerEntityFor(sourceKey, title) {
  if (sourceKey === 'county' && /county commissioners|BOCC/i.test(title)) return 'bocc';
  if (sourceKey === 'county' && /planning commission/i.test(title)) return 'pc';
  if (sourceKey === 'mv' && /design review/i.test(title)) return 'drb';
  if (sourceKey === 'mv' && /town council/i.test(title)) return 'tomv';
  if (sourceKey === 'rico' && /trustees/i.test(title)) return 'rico';
  if (sourceKey === 'telluride' && /town council/i.test(title)) return 'telluride';
  return '';
}

// Vote dates per entity. Key quotes optional — the file mixes the original
// `id:'v2024-01'` style with newer single-line JSON entries.
function trackerDates(html, idPrefix) {
  const re = new RegExp(
    `["']?id["']?\\s*:\\s*['"]${idPrefix}\\d+-[^'"]+['"][^}]*?["']?date["']?\\s*:\\s*['"](\\d{4}-\\d{2}-\\d{2})['"]`,
    'gs'
  );
  return new Set([...html.matchAll(re)].map((m) => m[1]));
}

const html = fs.readFileSync(TRACKER, 'utf8');
const recaps = extractJsArray(fs.readFileSync(GOV_HELPERS, 'utf8'), 'MEETING_RECAPS') || [];
const today = new Date();
const ageDays = (d) => Math.floor((today - new Date(d + 'T12:00:00')) / 86400000);

const watched = watchedSourceKeys();
const report = [];
let stale = false;

for (const [key, meta] of Object.entries(ENTITIES)) {
  const have = trackerDates(html, meta.idPrefix);
  const latest = [...have].sort().pop() || null;

  // Meetings we recapped for this body that have NO votes in the tracker.
  const missing = recaps
    .filter((r) => trackerEntityFor(r.sourceKey, r.title || '') === key)
    .filter((r) => r.date && !have.has(r.date))
    .map((r) => ({ date: r.date, title: r.title }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const row = {
    entity: key, label: meta.label,
    voteCount: have.size,
    latestVote: latest,
    latestVoteAgeDays: latest ? ageDays(latest) : null,
    recappedButMissing: missing,
    watched: watched.has(meta.sourceKey),
  };
  // Order matters. UNWATCHED is checked FIRST because it's the failure that
  // hides: with no recap channel there is nothing to compare against, so
  // "recapped but missing" is empty and the body looks fine. That's exactly how
  // Mountain Village sat at Mar 19 2026 while reporting "quiet" — Morgan spotted
  // it, the check didn't (2026-07-23). A body nobody watches can never update.
  if (!row.watched) {
    row.status = 'UNWATCHED';
    row.why = `no recap channel for sourceKey '${meta.sourceKey}' in meeting-recaps.js CHANNELS — nothing can reach the tracker for this body`;
    stale = true;
  } else if (missing.length) {
    row.status = 'BEHIND'; stale = true;
  } else if (latest && ageDays(latest) > MAX_AGE) {
    // Watched but nothing landed in a long time. Not proof of a bug (a board
    // may genuinely not have met), but it is NOT "fine" — surface it.
    row.status = 'STALE'; stale = true;
    row.why = `watched, but no votes in ${ageDays(latest)} days — check whether meetings happened and were recapped`;
  } else {
    row.status = 'current';
  }
  report.push(row);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ generatedAt: today.toISOString(), maxAgeDays: MAX_AGE, stale, report }, null, 2));
} else {
  console.log('Board Vote Tracker — weekly freshness check\n');
  for (const r of report) {
    const flag = r.status === 'UNWATCHED' ? '✗ UNWATCHED'
      : r.status === 'BEHIND' ? '✗ BEHIND   '
      : r.status === 'STALE'  ? '⚠ STALE    '
      : '✓ current  ';
    console.log(`${flag}  ${r.label.padEnd(34)} ${String(r.voteCount).padStart(4)} votes  latest ${r.latestVote || 'none'}${r.latestVoteAgeDays != null ? ` (${r.latestVoteAgeDays}d ago)` : ''}`);
    if (r.why) console.log(`               ↳ ${r.why}`);
    for (const m of r.recappedButMissing) console.log(`               ↳ recapped but NOT in tracker: ${m.date} — ${m.title}`);
  }
  console.log(stale
    ? '\nAt least one tracked body is not current. UNWATCHED means no ingest path exists at all — that one will never fix itself.'
    : '\nEvery tracked body is current.');
}
process.exit(stale ? 1 : 0);
