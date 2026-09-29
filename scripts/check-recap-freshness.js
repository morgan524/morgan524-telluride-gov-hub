#!/usr/bin/env node
/**
 * check-recap-freshness.js — weekly assurance for the Past Meetings recaps.
 *
 * Recaps are made ONLY on the Mac (scripts/run-meeting-recaps-local.sh via
 * launchd, 9:30 AM daily) because YouTube and Vimeo block transcript downloads
 * from GitHub runner IPs. Nothing noticed when that job stopped or when one
 * entity's channel broke (Rico produced zero recaps for months because its
 * titles carry no date — found 2026-09-29). This check is that signal
 * (Morgan, 2026-09-29).
 *
 * Two levels:
 *   PIPELINE — no recap for ANY entity in PIPELINE_MAX days (default 10).
 *              Several bodies meet every week, so this means the Mac job
 *              itself has stopped (Mac off, key missing, yt-dlp broken…).
 *   STALE    — one entity with no new recap in MAX_AGE days (default 45 ≈ 1.5
 *              monthly cycles, so one skipped meeting doesn't cry wolf).
 *   NEVER    — a watched entity with no recaps at all.
 *
 * Entities come from the CHANNELS list in scripts/meeting-recaps.js, so a new
 * channel is covered automatically.
 *
 * Usage:  node scripts/check-recap-freshness.js [--max-age-days N] [--pipeline-days N]
 * Exit 0 = all current. Exit 1 = something is stale (CI opens an issue).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { extractJsArray } = require('./lib/extract.js');

const ROOT = path.resolve(__dirname, '..');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? Number(process.argv[i + 1]) : d; };
const MAX_AGE = arg('--max-age-days', 45);
const PIPELINE_MAX = arg('--pipeline-days', 10);

const recapSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'meeting-recaps.js'), 'utf8');
const chBlock = recapSrc.slice(recapSrc.indexOf('const CHANNELS = ['), recapSrc.indexOf('];', recapSrc.indexOf('const CHANNELS = [')));
const channels = [...chBlock.matchAll(/sourceKey:\s*'([^']+)',\s*sourceLabel:\s*'([^']+)'/g)]
  .map((m) => ({ key: m[1], label: m[2] }));
if (!channels.length) { console.error('Could not read CHANNELS from scripts/meeting-recaps.js'); process.exit(2); }

const recaps = extractJsArray(fs.readFileSync(path.join(ROOT, 'js', 'gov-helpers.js'), 'utf8'), 'MEETING_RECAPS') || [];
const today = new Date(); today.setHours(0, 0, 0, 0);
const ageDays = (iso) => Math.round((today - new Date(iso + 'T00:00:00')) / 86400000);

let stale = false;
const lines = [];
const newestAll = recaps.map((r) => r.date).filter(Boolean).sort().pop();
if (!newestAll || ageDays(newestAll) > PIPELINE_MAX) {
  stale = true;
  lines.push(`✗ PIPELINE  no recap for ANY entity since ${newestAll || 'ever'}${newestAll ? ` (${ageDays(newestAll)}d)` : ''} — the Mac recap job has probably stopped`);
  lines.push('            ↳ check ~/Library/Logs/meeting-recaps.log and that the Mac is on at 9:30 AM');
}
for (const ch of channels) {
  const mine = recaps.filter((r) => r.sourceKey === ch.key);
  const latest = mine.map((r) => r.date).filter(Boolean).sort().pop();
  if (!latest) {
    stale = true;
    lines.push(`✗ NEVER     ${ch.label.padEnd(20)} no recaps at all — its channel may be broken or mis-parsed`);
  } else if (ageDays(latest) > MAX_AGE) {
    stale = true;
    lines.push(`⚠ STALE     ${ch.label.padEnd(20)} ${String(mine.length).padStart(3)} recaps, latest ${latest} (${ageDays(latest)}d ago)`);
  } else {
    lines.push(`✓ current   ${ch.label.padEnd(20)} ${String(mine.length).padStart(3)} recaps, latest ${latest} (${ageDays(latest)}d ago)`);
  }
}

console.log('Meeting recaps — weekly freshness check\n');
console.log(lines.join('\n'));
console.log(stale
  ? `\nAt least one entity is behind (STALE = nothing in ${MAX_AGE}+ days). Check whether the body actually met, then the channel URL / title format in scripts/meeting-recaps.js.`
  : '\nEvery watched entity is current.');
process.exit(stale ? 1 : 0);
