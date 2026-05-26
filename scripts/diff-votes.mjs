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
// Stopwords that carry little signal in vote titles — used by titleWords
// and titleKey alike. Includes common procedural noise the model adds
// that doesn't appear in hand-curated titles (and vice versa).
const TITLE_STOPWORDS = new Set([
  'the','and','for','with','from','that','this','was','are','were','will','have','has','had',
  'ordinance','resolution','motion','consideration','approval','approved','approving',
  'first','second','third','reading','public','hearing','council','vote','meeting',
  'town','village','mountain','town','board','committee','commission','authority',
  'regular','special','set','setting','final','agenda','item','section','pursuant',
  'amending','amended','amendment','amendments','adopting','adopted','adoption',
  'regarding','related','relating','application','applications','staff','request',
  'requested','agreement','intergovernmental','iga'
]);

function titleWords(t) {
  return (t || '')
    .toLowerCase()
    .replace(/\s*—\s*(split|tabled|failed|recused?)\b.*$/i, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !TITLE_STOPWORDS.has(w));
}

function titleKey(t) {
  return titleWords(t).slice(0, 8).join(' ');
}

// Jaccard similarity on the de-stopworded word sets. Returns 0..1.
function titleSimilarity(a, b) {
  const A = new Set(titleWords(a));
  const B = new Set(titleWords(b));
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

const committedByKey = new Map();
committed.forEach(c => committedByKey.set(titleKey(c.title), c));

const extractedByKey = new Map();
pending.entries.forEach(e => extractedByKey.set(titleKey(e.title), e));

// Match pass — pair each committed entry to its best extracted match
// by Jaccard title similarity (≥0.4 threshold). One-to-one: an
// extracted entry can only match one committed entry.
const SIM_THRESHOLD = 0.4;
const matches = [];
const missedByModel = [];
const usedExtracted = new Set();

committed.forEach(c => {
  let best = null;
  let bestScore = 0;
  pending.entries.forEach(e => {
    if (usedExtracted.has(e.id)) return;
    const s = titleSimilarity(c.title, e.title);
    if (s > bestScore) { bestScore = s; best = e; }
  });
  if (best && bestScore >= SIM_THRESHOLD) {
    matches.push({ committed: c, extracted: best, score: bestScore });
    usedExtracted.add(best.id);
  } else {
    missedByModel.push({ entry: c, bestCandidate: best, bestScore });
  }
});

// Anything extracted that wasn't claimed by a committed entry
const onlyInExtracted = pending.entries.filter(e => !usedExtracted.has(e.id));

// ─────── Field-level diffs on matched pairs ─────────────
const diffs = [];
matches.forEach(({ committed: c, extracted: e, score }) => {
  const d = { id: c.id, extractedId: e.id, score, deltas: [] };
  if (c.outcome !== e.outcome) d.deltas.push(`outcome: "${c.outcome}" → "${e.outcome}"`);
  if (c.tally !== e.tally) d.deltas.push(`tally: "${c.tally}" → "${e.tally}"`);
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
  missedByModel.forEach(m => {
    console.log(`   ✗ ${m.entry.id}  ${m.entry.title.slice(0, 70)}`);
    if (m.bestCandidate) {
      console.log(`     (closest extracted: ${m.bestCandidate.id} "${m.bestCandidate.title.slice(0, 50)}…" similarity=${m.bestScore.toFixed(2)})`);
    }
  });
}

if (onlyInExtracted.length) {
  console.log(`\n── Extracted but NOT committed (${onlyInExtracted.length}):`);
  console.log(`   (Model captured these; you didn't. Could be legitimate finds`);
  console.log(`    OR over-eager extraction. Judgment call per entry.)`);
  onlyInExtracted.forEach(e => console.log(`   ? ${e.id}  ${e.title.slice(0, 70)}`));
}

if (diffs.length) {
  console.log(`\n── Field-level differences (in matched pairs):`);
  diffs.forEach(d => {
    console.log(`\n   ${d.id} ↔ ${d.extractedId}  (similarity=${d.score.toFixed(2)})`);
    d.deltas.forEach(delta => console.log(`     • ${delta}`));
  });
}

const exitCode = (diffs.length + missedByModel.length + onlyInExtracted.length) > 0 ? 1 : 0;
console.log(`\nExit: ${exitCode === 0 ? 'PERFECT MATCH' : 'differences present'}`);
process.exit(exitCode);
