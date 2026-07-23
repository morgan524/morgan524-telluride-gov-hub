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
const MAX_AGE = i > -1 ? Number(process.argv[i + 1]) : 21;

// tracker entity → { label, idPrefix }. Mirrors the arrays in vote-tracker.html.
const ENTITIES = {
  telluride: { label: 'Telluride Town Council',        idPrefix: 'v' },
  bocc:      { label: 'San Miguel County BOCC',        idPrefix: 'bv' },
  tomv:      { label: 'Mountain Village Town Council', idPrefix: 'mv' },
  drb:       { label: 'MV Design Review Board',        idPrefix: 'drb' },
  pc:        { label: 'SMC Planning Commission',       idPrefix: 'pv' },
  rico:      { label: 'Rico Board of Trustees',        idPrefix: 'rico' },
};

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
  };
  // Behind if a recapped meeting has no votes at all. Age alone is NOT a
  // failure — a board that simply hasn't met yet is fine.
  if (missing.length) { row.status = 'BEHIND'; stale = true; }
  else if (latest && ageDays(latest) > MAX_AGE) { row.status = 'quiet'; }
  else { row.status = 'current'; }
  report.push(row);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ generatedAt: today.toISOString(), maxAgeDays: MAX_AGE, stale, report }, null, 2));
} else {
  console.log('Board Vote Tracker — weekly freshness check\n');
  for (const r of report) {
    const flag = r.status === 'BEHIND' ? '✗ BEHIND' : r.status === 'quiet' ? '· quiet ' : '✓ current';
    console.log(`${flag}  ${r.label.padEnd(34)} ${String(r.voteCount).padStart(4)} votes  latest ${r.latestVote || 'none'}${r.latestVoteAgeDays != null ? ` (${r.latestVoteAgeDays}d ago)` : ''}`);
    for (const m of r.recappedButMissing) console.log(`             ↳ recapped but NOT in tracker: ${m.date} — ${m.title}`);
  }
  console.log(stale
    ? '\nAt least one body has a recapped meeting with no votes in the tracker.'
    : '\nEvery tracked body is current.');
}
process.exit(stale ? 1 : 0);
