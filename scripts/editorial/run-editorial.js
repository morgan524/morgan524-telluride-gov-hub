#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Editorial layer · THE LOOP — run-editorial.js
// ════════════════════════════════════════════════════════════════════
//
// Runs after content-refresh (which produces/updates the meeting summaries).
// For each recent meeting:
//   1. dedup    — ask the Worker if a draft already exists (skip if so)
//   2. triage   — scoreMeeting(): <2 ignore, 2-3 flag (log only), >=4 draft
//   3. context  — conditional fetches (prior summary on follow_up_to; budget
//                 digest when spending is referenced)
//   4. draft    — writeDraft() with citation discipline
//   5. create   — POST the draft to the Worker, which writes Firestore and
//                 emails you the tokenized review link. Nothing publishes.
//
// Idempotent: the Worker skips meetings already drafted, so this is safe to run
// every refresh. Re-scoring non-draft meetings each run is cheap (small window;
// placeholders short-circuit free).
//
// Env: ANTHROPIC_API_KEY (triage + draft), EDITORIAL_SECRET (Worker auth),
//      EDITORIAL_WORKER (optional Worker URL override), EDITORIAL_WEEKS (window).

const { scoreMeeting } = require('./score-meeting.js');
const { writeDraft } = require('./write-draft.js');
const { loadMeetings, daysSince, meetingId, gatherContext, httpJson, WORKER_DEFAULT } = require('./lib.js');

const WORKER = process.env.EDITORIAL_WORKER || WORKER_DEFAULT;
const SECRET = process.env.EDITORIAL_SECRET || '';
const WEEKS = parseInt(process.env.EDITORIAL_WEEKS || '3', 10);
const DRY = process.argv.includes('--dry-run');

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('  ✗ ANTHROPIC_API_KEY not set'); process.exit(1); }
  if (!SECRET && !DRY) { console.error('  ✗ EDITORIAL_SECRET not set (needed to create drafts). Use --dry-run to triage only.'); process.exit(1); }

  const all = loadMeetings();
  const recent = all.filter((m) => daysSince(m.date) <= WEEKS * 7 && daysSince(m.date) >= 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  console.log(`\n  Editorial loop — ${recent.length} meeting(s) in the last ${WEEKS} weeks${DRY ? '  ·  DRY RUN' : ''}`);
  console.log('  ' + '─'.repeat(70));

  const counts = { skipped: 0, ignore: 0, flag: 0, draft: 0, created: 0, errors: 0 };

  for (const m of recent) {
    const id = meetingId(m);

    // 1. dedup
    if (!DRY) {
      try {
        const ex = await httpJson('GET', `${WORKER}/article-exists?id=${encodeURIComponent(id)}&secret=${encodeURIComponent(SECRET)}`);
        if (ex.json && ex.json.exists) { counts.skipped++; console.log(`  · already drafted (${ex.json.status})  ${m.date}  ${m.title}`); continue; }
      } catch (e) { /* if the check fails, fall through; /article-create is idempotent anyway */ }
    }

    // 2. triage
    let triage;
    try { triage = await scoreMeeting(m); }
    catch (e) { counts.errors++; console.log(`  ✗ triage error  ${m.date}  ${m.title}: ${e.message}`); continue; }

    if (triage.branch === 'ignore') { counts.ignore++; continue; }
    if (triage.branch === 'flag') { counts.flag++; console.log(`  • flag [${triage.score}]  ${m.date}  ${m.title}`); continue; }

    // 3 + 4. draft-worthy
    counts.draft++;
    console.log(`  ★ DRAFT [${triage.score}]  ${m.date}  ${m.title}`);
    if (DRY) continue;

    let draft;
    try {
      const context = gatherContext(m, triage, all);
      if (context.length) console.log(`      ↳ context: ${context.map((c) => c.text.split(' — ')[0]).join('; ')}`);
      draft = await writeDraft(m, { triage, context });
    } catch (e) { counts.errors++; console.log(`      ✗ draft error: ${e.message}`); continue; }

    draft.id = id;                 // deterministic Firestore doc id / dedup key
    if (!draft.audit.ok) console.log(`      ⚠ citation audit: ${draft.audit.problems.join('; ')}`);

    // 5. create (Worker writes Firestore + emails the review link)
    try {
      const res = await httpJson('POST', `${WORKER}/article-create`, { secret: SECRET, draft });
      if (res.json && res.json.ok) {
        if (res.json.skipped) { counts.skipped++; console.log(`      · already existed (${res.json.status})`); }
        else { counts.created++; console.log(`      ✓ created + ${res.json.emailed ? 'emailed' : 'NOT emailed (no relay)'}  → ${res.json.reviewUrl || id}`); }
      } else { counts.errors++; console.log(`      ✗ create failed: ${(res.json && res.json.msg) || res.status}`); }
    } catch (e) { counts.errors++; console.log(`      ✗ create error: ${e.message}`); }
  }

  console.log('  ' + '─'.repeat(70));
  console.log(`  drafted ${counts.draft} (created ${counts.created}) · flagged ${counts.flag} · ignored ${counts.ignore} · skipped ${counts.skipped}` + (counts.errors ? ` · errors ${counts.errors}` : ''));
  console.log('');
  if (counts.errors) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
