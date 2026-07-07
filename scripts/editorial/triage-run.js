#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Editorial layer · Step 1 calibration harness — triage-run.js
// ════════════════════════════════════════════════════════════════════
//
// Runs scoreMeeting() against the meeting summaries already on disk
// (MANUAL_SUMMARIES in js/gov-helpers.js) so you can check whether the
// triage's newsworthiness judgments match yours BEFORE any drafting or
// publishing machinery is wired in.
//
// Usage:
//   node scripts/editorial/triage-run.js                 # last 4 weeks, live scoring
//   node scripts/editorial/triage-run.js --weeks=8       # last 8 weeks
//   node scripts/editorial/triage-run.js --all           # every summary on disk
//   node scripts/editorial/triage-run.js --dry-run       # list candidates, NO API calls
//   node scripts/editorial/triage-run.js --weeks=6 --dry-run
//
// Live scoring needs ANTHROPIC_API_KEY in the environment. --dry-run does
// not — it just shows which meetings WOULD be scored vs. short-circuited as
// placeholders, so you can sanity-check the data plumbing without a key.
//
// Writes a full JSON report to scripts/editorial/triage-report.json.

const fs = require('fs');
const path = require('path');
const { extractJsObject } = require('../lib/extract.js');
const { scoreMeeting, isPlaceholderSummary, branchForScore, TRIAGE_MODEL } = require('./score-meeting.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPORT_PATH = path.join(__dirname, 'triage-report.json');

// Human-readable source labels (mirrors build-rss-feed.js's map).
const SOURCE_LABELS = {
  telluride: 'Town of Telluride', mv: 'Mountain Village', county: 'San Miguel County',
  smart: 'SMART / Gondola', school: 'School District', fire: 'Fire District',
  med: 'Hospital District', norwood: 'Norwood', ophir: 'Ophir', smrha: 'SMRHA Housing',
};

function parseArgs(argv) {
  const o = { weeks: 4, all: false, dryRun: false };
  for (const a of argv) {
    if (a === '--all') o.all = true;
    else if (a === '--dry-run' || a === '--dryrun') o.dryRun = true;
    else if (a.startsWith('--weeks=')) o.weeks = parseInt(a.split('=')[1], 10) || 4;
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
  if (!summaries) throw new Error('Could not extract MANUAL_SUMMARIES from js/gov-helpers.js');
  return Object.entries(summaries).map(([key, summary]) => {
    const [source, date, ...rest] = key.split('|');
    return { key, source, date, title: rest.join('|'), summary };
  });
}

function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let meetings = loadMeetings();
  const total = meetings.length;
  if (!opts.all) {
    const maxDays = opts.weeks * 7;
    meetings = meetings.filter((m) => daysSince(m.date) <= maxDays && daysSince(m.date) >= 0);
  }
  // Most recent first.
  meetings.sort((a, b) => (a.date < b.date ? 1 : -1));

  const windowLabel = opts.all ? 'all summaries on disk' : `last ${opts.weeks} weeks`;
  console.log(`\n  Triage calibration run — ${windowLabel}`);
  console.log(`  ${meetings.length} of ${total} summaries in window` +
    (opts.dryRun ? '  ·  DRY RUN (no API calls)' : `  ·  model: ${TRIAGE_MODEL}`));
  console.log('  ' + '─'.repeat(72));

  if (!opts.dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error('\n  ✗ ANTHROPIC_API_KEY is not set. Either export it, or re-run with --dry-run.\n');
    process.exit(1);
  }

  const results = [];
  for (const m of meetings) {
    const label = SOURCE_LABELS[m.source] || m.source;
    if (opts.dryRun) {
      const placeholder = isPlaceholderSummary(m.summary);
      const tag = placeholder ? 'skip(placeholder)→0' : 'would score';
      console.log(`  ${m.date}  ${label.padEnd(22)}  ${tag.padEnd(20)}  ${trunc(m.title, 40)}`);
      results.push({ ...m, placeholder, wouldScore: !placeholder });
      continue;
    }
    let r;
    try {
      r = await scoreMeeting(m);
    } catch (e) {
      console.log(`  ${m.date}  ${label.padEnd(22)}  ERROR  ${e.message}`);
      results.push({ ...m, error: e.message });
      continue;
    }
    const bullet = r.branch === 'draft' ? '★' : r.branch === 'flag' ? '•' : ' ';
    console.log(`  ${bullet} ${m.date}  [${r.score}] ${r.branch.toUpperCase().padEnd(6)}  ${label.padEnd(20)}  ${trunc(m.title, 38)}`);
    for (const reason of r.reasons) console.log(`        ↳ ${reason}`);
    if (r.follow_up_to) console.log(`        ↳ follow-up to: ${r.follow_up_to}`);
    results.push(r);
  }

  console.log('  ' + '─'.repeat(72));
  if (!opts.dryRun) {
    const counts = { draft: 0, flag: 0, ignore: 0, error: 0 };
    for (const r of results) {
      if (r.error) counts.error++;
      else counts[branchForScore(r.score)]++;
    }
    console.log(`  ★ draft (≥4): ${counts.draft}   • flag (2-3): ${counts.flag}   ignore (<2): ${counts.ignore}` +
      (counts.error ? `   errors: ${counts.error}` : ''));
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    window: windowLabel,
    model: opts.dryRun ? null : TRIAGE_MODEL,
    dryRun: opts.dryRun,
    results,
  }, null, 2));
  console.log(`  Report written → ${path.relative(REPO_ROOT, REPORT_PATH)}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
