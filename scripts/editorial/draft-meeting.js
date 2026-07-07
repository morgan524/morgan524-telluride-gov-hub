#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Editorial layer · write_draft calibration harness — draft-meeting.js
// ════════════════════════════════════════════════════════════════════
//
// Scores a meeting, and if it lands in the 'draft' branch, drafts the article
// with writeDraft() so you can judge draft quality + citation discipline
// BEFORE the publish machinery exists. Writes the draft to
// scripts/editorial/draft-sample.json, which article-review.html?sample=1
// renders in the real decision page.
//
// Usage:
//   node scripts/editorial/draft-meeting.js                       # top draft-branch meeting, last 6 weeks
//   node scripts/editorial/draft-meeting.js --weeks=8
//   node scripts/editorial/draft-meeting.js --key="telluride|2026-06-23|Special Meeting - P&Z and HARC - Jun 23 2026"
//   node scripts/editorial/draft-meeting.js --force   # draft even if score < 4
//
// Needs ANTHROPIC_API_KEY.

const fs = require('fs');
const path = require('path');
const { extractJsObject } = require('../lib/extract.js');
const { scoreMeeting } = require('./score-meeting.js');
const { writeDraft } = require('./write-draft.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SAMPLE_PATH = path.join(__dirname, 'draft-sample.json');

function parseArgs(argv) {
  const o = { weeks: 6, key: null, force: false };
  for (const a of argv) {
    if (a === '--force') o.force = true;
    else if (a.startsWith('--weeks=')) o.weeks = parseInt(a.split('=')[1], 10) || 6;
    else if (a.startsWith('--key=')) o.key = a.slice('--key='.length).replace(/^["']|["']$/g, '');
  }
  return o;
}

function daysSince(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function loadMeetings() {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'js', 'gov-helpers.js'), 'utf8');
  const summaries = extractJsObject(src, 'MANUAL_SUMMARIES');
  if (!summaries) throw new Error('Could not extract MANUAL_SUMMARIES');
  return Object.entries(summaries).map(([key, summary]) => {
    const [source, date, ...rest] = key.split('|');
    return { key, source, date, title: rest.join('|'), summary };
  });
}

function stripTags(html) {
  return String(html || '')
    .replace(/<sup class="cite">(.*?)<\/sup>/g, ' $1')
    .replace(/<\/p>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n  ✗ ANTHROPIC_API_KEY is not set.\n');
    process.exit(1);
  }
  const meetings = loadMeetings();

  let target;
  if (opts.key) {
    target = meetings.find((m) => m.key === opts.key);
    if (!target) { console.error(`  ✗ No meeting with key: ${opts.key}`); process.exit(1); }
  }

  // Score candidate(s). With --key, score just that one. Otherwise score the
  // recent window and take the highest-scoring draft-branch meeting.
  const candidates = target ? [target] : meetings.filter((m) => daysSince(m.date) <= opts.weeks * 7 && daysSince(m.date) >= 0);

  console.log(`\n  Scoring ${candidates.length} candidate(s)…`);
  let best = null;
  for (const m of candidates) {
    const triage = await scoreMeeting(m);
    if (!best || triage.score > best.triage.score) best = { meeting: m, triage };
    if (target) break;
  }
  if (target && !best) best = { meeting: target, triage: await scoreMeeting(target) };

  const { meeting, triage } = best;
  console.log(`  Selected: [${triage.score}] ${triage.branch.toUpperCase()}  ${meeting.date}  ${meeting.title}`);

  if (triage.branch !== 'draft' && !opts.force) {
    console.log(`\n  This meeting scored ${triage.score} (branch: ${triage.branch}) — below the draft threshold.`);
    console.log(`  Re-run with --force to draft it anyway, or --key to target a specific meeting.\n`);
    process.exit(0);
  }

  console.log('  Drafting…\n');
  const draft = await writeDraft(meeting, { triage });

  console.log('  ' + '═'.repeat(72));
  console.log('  HEADLINE: ' + draft.title);
  console.log('  DEK:      ' + draft.dek);
  console.log('  SLUG:     ' + draft.slug);
  console.log('  ' + '─'.repeat(72));
  console.log(stripTags(draft.bodyHtml).split('\n').map((l) => '  ' + l).join('\n'));
  console.log('  ' + '─'.repeat(72));
  console.log('  SOURCES:');
  draft.citations.forEach((c) => console.log(`    [${c.marker}] ${c.text}${c.url ? '  <' + c.url + '>' : ''}`));
  if (draft.flaggedClaims.length) {
    console.log('  ⚠ FLAGGED (unverifiable from sources):');
    draft.flaggedClaims.forEach((f) => console.log('    • ' + f));
  }
  console.log('  ' + '─'.repeat(72));
  if (draft.audit.ok) {
    console.log('  ✓ Citation audit clean — every [n] is provided and listed; flag counts match.');
  } else {
    console.log('  ⚠ Citation audit problems:');
    draft.audit.problems.forEach((p) => console.log('    • ' + p));
  }
  console.log('  ' + '═'.repeat(72));

  fs.writeFileSync(SAMPLE_PATH, JSON.stringify(draft, null, 2));
  console.log(`  Draft written → ${path.relative(REPO_ROOT, SAMPLE_PATH)}`);
  console.log(`  Preview it in the real decision page:`);
  console.log(`    http://127.0.0.1:8000/article-review.html?sample=1\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
