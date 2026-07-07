#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Hub-Bub surfacing · THE LOOP — run-pulse.js
// ════════════════════════════════════════════════════════════════════
//
// Daily. Turns recent local material into ONE (by default) Rick-voice
// discussion prompt awaiting your approval:
//   1. candidates — loadCandidates() (v1: recent meeting summaries)
//   2. dedup      — ask the Worker if this item was already surfaced (skip)
//   3. triage     — scoreItem(): <2 drop, 2-3 flag (log), >=4 eligible
//   4. pick       — the single highest-scoring new item (PULSE_MAX_PER_RUN)
//   5. context    — conditional: pull a prior related summary if flagged
//   6. draft      — writePrompt() with citation discipline
//   7. create     — POST to the Worker, which writes Firestore `pulse_drafts`
//                   and emails you the tokenized review link. Nothing publishes.
//
// Nothing reaches the live Hub-Bub feed without your approval in that email.
//
// Env: ANTHROPIC_API_KEY (triage + draft), EDITORIAL_SECRET (Worker auth —
//      shared with the editorial layer), PULSE_WORKER (URL override),
//      PULSE_WEEKS (window, default 3), PULSE_MAX_PER_RUN (default 1).

const { loadCandidates, httpJson, WORKER_DEFAULT, isPlaceholder, daysSince, SOURCE_LABELS } = require('./lib.js');
const { scoreItem } = require('./score-item.js');
const { writePrompt } = require('./write-prompt.js');
const { loadMeetings } = require('../editorial/lib.js');

const WORKER = process.env.PULSE_WORKER || process.env.EDITORIAL_WORKER || WORKER_DEFAULT;
const SECRET = process.env.EDITORIAL_SECRET || process.env.PULSE_SECRET || '';
const WEEKS = parseInt(process.env.PULSE_WEEKS || '3', 10);
const MAX_PER_RUN = parseInt(process.env.PULSE_MAX_PER_RUN || '1', 10);
const DRY = process.argv.includes('--dry-run');

const log = (...a) => console.log(...a);

// Has this candidate already been surfaced (drafted/flagged/published/denied)?
async function alreadySurfaced(id) {
  if (DRY || !SECRET) return false;
  try {
    const r = await httpJson('GET', `${WORKER}/pulse-exists?id=${encodeURIComponent(id)}&secret=${encodeURIComponent(SECRET)}`);
    return !!(r.json && r.json.exists);
  } catch (e) { return false; } // fail-open: better a rare dup than silent drop
}

// Light conditional enrichment (brief §4.4): if triage says the item builds on
// a prior decision and the candidate is a meeting, attach the most recent
// earlier non-placeholder summary from the same body.
function gatherContext(candidate, triage, allMeetings) {
  const ctx = [];
  const m = candidate.meeting;
  if (m && triage && Array.isArray(triage.needs_context) && triage.needs_context.length) {
    const prior = allMeetings
      .filter((x) => x.source === m.source && x.date < m.date && !isPlaceholder(x.summary))
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (prior) ctx.push({ text: `Earlier related meeting — ${SOURCE_LABELS[prior.source] || prior.source}, ${prior.title}, ${prior.date}`, body: prior.summary });
  }
  return ctx;
}

(async () => {
  if (!SECRET && !DRY) {
    log('· pulse: EDITORIAL_SECRET not set — nothing to do (configure the secret to activate). Exiting cleanly.');
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    log('· pulse: ANTHROPIC_API_KEY not set — cannot triage/draft. Exiting cleanly.');
    return;
  }

  const candidates = loadCandidates({ weeks: WEEKS });
  log(`· pulse: ${candidates.length} candidate(s) in the last ${WEEKS} week(s).`);

  // 1) dedup, then 2) triage the new ones
  const scored = [];
  for (const c of candidates) {
    if (await alreadySurfaced(c.id)) { log(`  skip (already surfaced): ${c.title}`); continue; }
    const triage = await scoreItem(c);
    let score = triage.score;
    if (c.submitted_by_human && score < 3) score = 3; // human floor
    const band = score < 2 ? 'drop' : score < 4 ? 'flag' : 'eligible';
    log(`  [${score}] ${band.padEnd(8)} ${c.title}${triage.error ? '  (triage error: ' + triage.error + ')' : ''}`);
    if (band === 'eligible') scored.push({ c, triage, score });
  }

  if (!scored.length) { log('· pulse: nothing scored >= 4 today — no prompt drafted.'); return; }

  // 3) pick the top N
  scored.sort((a, b) => b.score - a.score || (a.c.origin_date < b.c.origin_date ? 1 : -1));
  const picks = scored.slice(0, Math.max(1, MAX_PER_RUN));
  const allMeetings = loadMeetings();

  for (const { c, triage } of picks) {
    log(`· pulse: drafting "${c.title}" (score ${triage.score})`);
    const context = gatherContext(c, triage, allMeetings);
    let draft;
    try { draft = await writePrompt(c, { triage, context }); }
    catch (e) { log(`  ✗ draft failed: ${e.message}`); continue; }
    log(`  drafted "${draft.title}" (${draft.words} words)${draft.audit && !draft.audit.ok ? '  ⚠ audit: ' + draft.audit.problems.join('; ') : ''}`);
    if (draft.flaggedClaims.length) log(`  ⚠ flagged claims: ${draft.flaggedClaims.join(' | ')}`);

    if (DRY) { log('\n----- DRY RUN — would create -----\n' + JSON.stringify(draft, null, 2) + '\n'); continue; }

    try {
      const r = await httpJson('POST', `${WORKER}/pulse-create`, { secret: SECRET, draft });
      if (r.json && r.json.ok) log(`  ✓ created ${r.json.id}${r.json.emailed ? ' — review email sent' : ''}${r.json.skipped ? ' (skipped: ' + r.json.skipped + ')' : ''}`);
      else log(`  ✗ create failed: ${r.status} ${JSON.stringify(r.json)}`);
    } catch (e) { log(`  ✗ create error: ${e.message}`); }
  }
  log('· pulse: done.');
})().catch((e) => { console.error('pulse fatal:', e.message); process.exit(1); });
