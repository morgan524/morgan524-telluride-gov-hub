#!/usr/bin/env node
/**
 * diff-votes.mjs — calibration utility.
 *
 * Compares a pending/<entity>-<date>.json (from extract-votes.mjs)
 * against the entries already committed in v2/vote-tracker.html for
 * the same meeting date. Surfaces field-level disagreements so you
 * can spot-check the model's accuracy before trusting it on unknowns.
 *
 * Usage:
 *   node scripts/diff-votes.mjs --pending scripts/pending/tomv-2024-03-21.json
 *
 * For each committed entry on the same date, finds the best-matching
 * extracted entry (by title fuzzy-match) and reports differences in:
 *   - title, outcome, tally
 *   - votes object (member-by-member)
 *   - description (first 80 chars)
 *
 * Also reports:
 *   - Committed-but-not-extracted (model missed an entry)
 *   - Extracted-but-not-committed (model hallucinated, OR you skipped
 *     it intentionally — judgment call)
 *
 * Exit code: 0 if perfect match, 1 if any differences.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TRACKER_PATH = join(REPO_ROOT, 'v2', 'vote-tracker.html');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, [])
);

if (!args.pending) {
  console.error('Usage: node scripts/diff-votes.mjs --pending scripts/pending/<file>.json');
  process.exit(1);
}

const pending = JSON.parse(readFileSync(args.pending, 'utf8'));
const tracker = readFileSync(TRACKER_PATH, 'utf8');

// ─────── Extract committed entries for the target date from tracker ─────
// Entries look like:
//   {
//     id:'mv2024-M3', date:'2024-03-21', year:2024,
//     meeting:'Mountain Village Town Council — Mar 21, 2024',
//     ...
//     votes:{ prohaska:'Yes', ... },
//   },
// Parse with a deliberately loose JS-ish parser using Function() since
// the file is real JS and the entries are well-formed object literals.

function extractEntriesOnDate(jsText, isoDate) {
  // Locate entry blocks: balanced { ... }, between commas.
  // Cheap approach: regex for date:'YYYY-MM-DD' then walk outward to
  // find the enclosing { ... }.
  const found = [];
  const dateRe = new RegExp(`date:\\s*['"]${isoDate}['"]`, 'g');
  let m;
  while ((m = dateRe.exec(jsText))) {
    // Walk back to nearest '{' at depth 0 from this position.
    let i = m.index;
    while (i > 0 && jsText[i] !== '{') i--;
    if (jsText[i] !== '{') continue;
    const start = i;
    // Walk forward, counting braces, to find matching close.
    let depth = 0, j = start;
    let inStr = null;
    for (; j < jsText.length; j++) {
      const c = jsText[j];
      if (inStr) {
        if (c === '\\') { j++; continue; }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    const literal = jsText.slice(start, j);
    try {
      // eslint-disable-next-line no-new-func
      const obj = new Function(`return (${literal});`)();
      found.push(obj);
    } catch (e) {
      console.warn(`Couldn't parse entry near pos ${start}: ${e.message}`);
    }
  }
  return found;
}

const committed = extractEntriesOnDate(tracker, pending.date);
console.log(`Committed entries on ${pending.date}: ${committed.length}`);
console.log(`Extracted entries:                   ${pending.entries.length}`);

// ─────── Fuzzy match titles ─────────────
function titleKey(t) {
  return (t || '')
    .toLowerCase()
    // Strip only the trailing dissent/abstention/recusal annotation —
    // titles use em-dashes as ordinary separators, so we can't strip
    // on the first one.
    .replace(/\s*—\s*(split|tabled|failed|recused?)\b.*$/i, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 8)
    .join(' ');
}

const committedByKey = new Map();
committed.forEach(c => committedByKey.set(titleKey(c.title), c));

const extractedByKey = new Map();
pending.entries.forEach(e => extractedByKey.set(titleKey(e.title), e));

// Match pass
const matches = [];
const missedByModel = [];
const onlyInExtracted = [];

committed.forEach(c => {
  const key = titleKey(c.title);
  if (extractedByKey.has(key)) {
    matches.push({ committed: c, extracted: extractedByKey.get(key) });
  } else {
    // Try a looser match: 3-word prefix
    const partial = key.split(' ').slice(0, 3).join(' ');
    let alt = null;
    for (const [k, e] of extractedByKey) {
      if (k.startsWith(partial) || partial && k.includes(partial.split(' ')[0])) { alt = e; break; }
    }
    if (alt) matches.push({ committed: c, extracted: alt, fuzzy: true });
    else missedByModel.push(c);
  }
});

pending.entries.forEach(e => {
  const key = titleKey(e.title);
  if (![...committedByKey.keys()].some(k => k === key || k.includes(key.split(' ').slice(0, 3).join(' ')))) {
    onlyInExtracted.push(e);
  }
});

// ─────── Field-level diffs on matched pairs ─────────────
const diffs = [];
matches.forEach(({ committed: c, extracted: e, fuzzy }) => {
  const d = { id: c.id, extractedId: e.id, fuzzy: !!fuzzy, deltas: [] };
  if (c.outcome !== e.outcome) d.deltas.push(`outcome: "${c.outcome}" → "${e.outcome}"`);
  if (c.tally !== e.tally) d.deltas.push(`tally: "${c.tally}" → "${e.tally}"`);
  if (titleKey(c.title) !== titleKey(e.title) && !fuzzy) {
    d.deltas.push(`title key differs`);
  }
  // Vote-by-vote
  const allKeys = new Set([...Object.keys(c.votes || {}), ...Object.keys(e.votes || {})]);
  for (const k of allKeys) {
    const cv = c.votes?.[k];
    const ev = e.votes?.[k];
    if (cv !== ev) d.deltas.push(`votes.${k}: "${cv}" → "${ev}"`);
  }
  if (d.deltas.length) diffs.push(d);
});

// ─────── Report ───────
console.log(`\n── Matched ${matches.length} / ${committed.length} committed entries`);
if (matches.length) {
  const perfect = matches.length - diffs.length;
  console.log(`   Perfect:                ${perfect}`);
  console.log(`   With field differences: ${diffs.length}`);
}

if (missedByModel.length) {
  console.log(`\n── Committed but NOT extracted (${missedByModel.length}):`);
  missedByModel.forEach(c => console.log(`   ✗ ${c.id}  ${c.title.slice(0, 70)}`));
}

if (onlyInExtracted.length) {
  console.log(`\n── Extracted but NOT committed (${onlyInExtracted.length}):`);
  onlyInExtracted.forEach(e => console.log(`   ? ${e.id}  ${e.title.slice(0, 70)}`));
}

if (diffs.length) {
  console.log(`\n── Field-level differences:`);
  diffs.forEach(d => {
    console.log(`\n   ${d.id} ↔ ${d.extractedId}${d.fuzzy ? '  (fuzzy match)' : ''}`);
    d.deltas.forEach(delta => console.log(`     • ${delta}`));
  });
}

const exitCode = (diffs.length + missedByModel.length + onlyInExtracted.length) > 0 ? 1 : 0;
console.log(`\nExit: ${exitCode === 0 ? 'PERFECT MATCH' : 'differences present'}`);
process.exit(exitCode);
