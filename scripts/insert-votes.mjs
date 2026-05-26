#!/usr/bin/env node
/**
 * insert-votes.mjs — splice extracted vote entries into vote-tracker.html
 *
 * Reads all pending JSONs from scripts/pending/, filters out dates that
 * already have committed entries in v2/vote-tracker.html, resolves
 * ID-prefix collisions across same-month meetings, formats each entry
 * to match the file's existing JS-literal style, and inserts the
 * resulting block between the last 2024 entry and the next-year
 * comment block.
 *
 * Usage:
 *   node scripts/insert-votes.mjs --entity tomv --year 2024 [--dry-run]
 *
 * Default: writes the new entries directly to v2/vote-tracker.html.
 * With --dry-run: prints what would be inserted and where; doesn't write.
 *
 * The script does NOT commit. Review with `git diff v2/vote-tracker.html`
 * before committing.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TRACKER_PATH = join(REPO_ROOT, 'v2', 'vote-tracker.html');
const PENDING_DIR = join(__dirname, 'pending');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, [])
);
const ENTITY = args.entity || 'tomv';
const YEAR = parseInt(args.year || '2024', 10);
const DRY_RUN = !!args['dry-run'];

// ─────── Load pending JSONs ─────────────────────────────────────────
const allFiles = readdirSync(PENDING_DIR)
  .filter(f => f.startsWith(`${ENTITY}-${YEAR}-`) && f.endsWith('.json'));
const pending = allFiles.map(f => ({
  file: f,
  data: JSON.parse(readFileSync(join(PENDING_DIR, f), 'utf8'))
}));
pending.sort((a, b) => a.data.date.localeCompare(b.data.date));
console.log(`Loaded ${pending.length} pending files`);

// ─────── Identify dates already committed in tracker ─────────────
// Scope by ID prefix so Town of MV (mv) doesn't get confused with
// Planning Commission (pv), BOCC (bocc), etc. — different entities
// often have meetings on overlapping dates. Each entity's ID prefix
// in vote-tracker.html doesn't always match its CLI name; this map
// holds the mapping.
const ENTITY_ID_PREFIX = {
  tomv:    'mv',     // Mountain Village Town Council    → id:'mv2024-...'
  drb:     'drb',    // MV Design Review Board           → id:'drb2026-...'
  bocc:    'bv',     // SMC Board of County Commissioners → id:'bv2024-...'
  pc:      'pv',     // SMC Planning Commission          → id:'pv2024-...'
  planning:'pv',     // alias
  telluride:'v',     // Town of Telluride                → id:'v2025-...'
};
const tracker = readFileSync(TRACKER_PATH, 'utf8');
const idPrefix = ENTITY_ID_PREFIX[ENTITY] || ENTITY;
const entityEntryRe = new RegExp(
  `id:\\s*['"]${idPrefix}\\d+-[^'"]+['"][^}]*?date:\\s*['"](\\d{4}-\\d{2}-\\d{2})['"]`,
  'gs'
);
const committedDates = new Set(
  [...tracker.matchAll(entityEntryRe)].map(m => m[1])
);

// ─────── Filter pending: skip committed dates, skip empty meetings ─
const toInsert = pending.filter(p => {
  if (p.data.entries.length === 0) {
    console.log(`  SKIP ${p.data.date}: 0 entries (likely all Exec Session)`);
    return false;
  }
  if (committedDates.has(p.data.date)) {
    console.log(`  SKIP ${p.data.date}: already committed (${p.data.entries.length} extracted entries not added)`);
    return false;
  }
  return true;
});

if (toInsert.length === 0) {
  console.log('\nNothing new to insert.');
  process.exit(0);
}

console.log(`\nInserting ${toInsert.length} meetings, ${toInsert.reduce((s, p) => s + p.data.entries.length, 0)} entries:`);
toInsert.forEach(p => console.log(`  ${p.data.date}: ${p.data.entries.length} entries`));

// ─────── Resolve ID-prefix collisions ─────────────────────────────
// Walk meetings in date order. For each meeting, look at the prefix
// (letter portion of the first entry's id). If that prefix has already
// been used in an earlier meeting in this batch, renumber starting
// from the next available number.
const prefixCounter = {};      // prefix → next-available N
const renameMap = {};          // oldId → newId, globally

for (const p of toInsert) {
  const entries = p.data.entries;
  if (entries.length === 0) continue;
  // Extract prefix: strip "mv2024-" + trailing digits.
  const firstId = entries[0].id;
  const match = firstId.match(/^(mv\d{4}-)([A-Z]+)\d+$/);
  if (!match) {
    console.warn(`  ⚠ ${p.data.date}: unexpected id format "${firstId}", entries kept as-is`);
    continue;
  }
  const [, base, letterPrefix] = match;
  const startN = prefixCounter[letterPrefix] || 1;
  entries.forEach((e, idx) => {
    const newId = `${base}${letterPrefix}${startN + idx}`;
    if (newId !== e.id) renameMap[`${p.data.date}|${e.id}`] = newId;
    e._newId = newId;
  });
  prefixCounter[letterPrefix] = startN + entries.length;
}

// Report renames
const renames = Object.entries(renameMap);
if (renames.length) {
  console.log(`\nResolved ${renames.length} ID collisions (renumbered):`);
  for (const [k, v] of renames.slice(0, 10)) {
    const [date, oldId] = k.split('|');
    console.log(`  ${date}: ${oldId} → ${v}`);
  }
  if (renames.length > 10) console.log(`  …and ${renames.length - 10} more`);
}

// ─────── Format entries as JS object literals ─────────────────────
// Match the existing style EXACTLY:
//   {
//     id:'X', date:'YYYY-MM-DD', year:Y,
//     meeting:'...',
//     minutesUrl:'...',
//     title:'...',
//     description:'...',
//     tags:['Tag1','Tag2'],
//     outcome:'Passed', tally:'7-0',
//     votes:{ prohaska:'Yes', pearson:'Yes', ... },
//   },

function escJs(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function fmtTags(tags) {
  return '[' + (tags || []).map(t => `'${escJs(t)}'`).join(',') + ']';
}

function fmtVotes(votes) {
  return '{ ' + Object.entries(votes).map(([k, v]) => `${k}:'${v}'`).join(', ') + ' }';
}

function fmtEntry(e) {
  const id = e._newId || e.id;
  return `  {
    id:'${id}', date:'${e.date}', year:${e.year},
    meeting:'${escJs(e.meeting)}',
    minutesUrl:'${escJs(e.minutesUrl)}',
    title:'${escJs(e.title)}',
    description:'${escJs(e.description)}',
    tags:${fmtTags(e.tags)},
    outcome:'${e.outcome}', tally:'${escJs(e.tally)}',
    votes:${fmtVotes(e.votes)},
  },`;
}

// ─────── Build the insertion block ─────────────────────────────────
function fmtDateHeader(isoDate, entries) {
  // "May 16, 2024"
  const [y, m, d] = isoDate.split('-').map(Number);
  const monthName = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'][m - 1];
  // Look for any non-default attendance to surface in the comment
  const roster = Object.keys(entries[0]?.votes || {});
  const absentees = new Set();
  const recusals = new Set();
  for (const e of entries) {
    for (const [k, v] of Object.entries(e.votes || {})) {
      if (v === 'Absent') absentees.add(k);
      if (v === 'Recused') recusals.add(k);
    }
  }
  const notes = [];
  if (absentees.size) notes.push(`${[...absentees].join('/')} absent on some votes`);
  if (recusals.size) notes.push(`${[...recusals].join('/')} recused on some votes`);
  const noteStr = notes.length ? ` — ${notes.join('; ')}` : '';
  return `  /* ── ${monthName} ${d}, ${y}${noteStr} ── */`;
}

const blocks = [];
for (const p of toInsert) {
  blocks.push(fmtDateHeader(p.data.date, p.data.entries));
  for (const e of p.data.entries) blocks.push(fmtEntry(e));
  blocks.push('');
}
const insertionText = blocks.join('\n');

// ─────── Find insertion point ──────────────────────────────────────
// Strategy: locate the LAST entry in the file whose id matches the
// entity prefix AND year === YEAR. Insert immediately after its
// closing `},`. Entity-scoping is critical because the same file
// contains entries from multiple entities (PC, BOCC, SMRHA, etc.)
// each with their own `year:2024` entries that we must NOT insert
// between.

const entityYearRe = new RegExp(
  `id:\\s*['"]${idPrefix}\\d+-[^'"]+['"][^}]*?year:\\s*${YEAR}\\b`,
  'gs'
);
const yearMatches = [...tracker.matchAll(entityYearRe)];
if (yearMatches.length === 0) {
  console.error(`No entries with id:'${idPrefix}...' year:${YEAR} found in tracker. Refusing to insert.`);
  process.exit(2);
}
const lastYearMatch = yearMatches[yearMatches.length - 1];
console.log(`\nLast existing ${idPrefix} year-${YEAR} entry at byte offset ${lastYearMatch.index}`);

// Walk forward from that match to find the closing `},\n` of the
// containing object literal.
let pos = lastYearMatch.index;
let depth = 0, inStr = null;
let closingPos = -1;
// Walk backward to find the `{` that opens this entry, then forward
// to its matching close.
while (pos > 0 && tracker[pos] !== '{') pos--;
for (let j = pos; j < tracker.length; j++) {
  const c = tracker[j];
  if (inStr) {
    if (c === '\\') { j++; continue; }
    if (c === inStr) inStr = null;
    continue;
  }
  if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
  if (c === '{') depth++;
  else if (c === '}') {
    depth--;
    if (depth === 0) {
      // Find the comma after `}` and the newline after that
      let k = j + 1;
      while (k < tracker.length && tracker[k] !== '\n') k++;
      closingPos = k + 1; // insert at start of next line
      break;
    }
  }
}
if (closingPos < 0) {
  console.error('Could not find end of last year-matching entry. Aborting.');
  process.exit(3);
}

// Trim consecutive blank lines after closingPos for clean insertion.
let trim = closingPos;
while (trim < tracker.length && tracker[trim] === '\n') trim++;
// Re-include one blank line before our block, plus our block, plus
// one blank line before whatever followed.
const before = tracker.slice(0, closingPos);
const after = tracker.slice(trim);
const merged = before + '\n' + insertionText + '\n' + after;

// ─────── Output ────────────────────────────────────────────────────
if (DRY_RUN) {
  console.log(`\n── Preview: would insert at byte offset ${closingPos} ──`);
  console.log(`Insertion block: ${insertionText.length} chars, ${insertionText.split('\n').length} lines`);
  console.log('First 1500 chars of insertion block:\n');
  console.log(insertionText.slice(0, 1500));
  if (insertionText.length > 1500) console.log(`\n... [${insertionText.length - 1500} more chars] ...`);
  console.log('\n(Run without --dry-run to write to v2/vote-tracker.html.)');
} else {
  writeFileSync(TRACKER_PATH, merged);
  console.log(`\n✓ Wrote ${merged.length - tracker.length} new chars to v2/vote-tracker.html`);
  console.log('Next: review with `git diff v2/vote-tracker.html` then commit.');
}
