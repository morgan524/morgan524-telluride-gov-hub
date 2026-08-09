#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Content Auto-Fixer
 * Runs via GitHub Actions (content-autofix.yml), daily after the review.
 *
 * The daily content review has always been REPORT-ONLY: it finds editorial
 * errors and writes them to an issue for a human. This closes the loop — but
 * only as far as it safely can, which is the whole design.
 *
 * TWO TIERS, and the split is the point:
 *
 *   AUTO (committed straight to main) — fixes where the evidence is
 *   deterministic and the action is reversible:
 *     • a link that has returned 404/410 on N consecutive days → clear the
 *       href, KEEP the event. Losing a link is recoverable; deleting a real
 *       community event is not.
 *     • prune corrections whose window has passed.
 *
 *   PROPOSE (pull request, never auto-merged) — anything needing judgment:
 *     • two sources publishing different dates for the same event. Which one is
 *       right cannot be derived; it has to be checked against the organizer, and
 *       a wrong answer sends residents to a meeting on the wrong day.
 *
 * WHY IT WRITES CORRECTIONS, NOT DATA: every array it touches is re-scraped
 * from scratch every six hours. A fix applied to js/gov-helpers.js is gone by
 * the next refresh. So fixes are rows in data/content-corrections.json, which
 * content-refresh.js re-applies after each scrape.
 *
 * REFUSES TO GUESS. A date conflict is only proposed when the organizer's own
 * page states a date that matches one of the candidates. If the page can't be
 * fetched, or is ambiguous, the finding is left for the human — an unfixed
 * finding is a much smaller failure than a confidently wrong one.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { fetchUrl, htmlToText, callClaudeJson, mtToday } = require('./lib/scrape.js');
const {
  readCorrections, writeCorrections, pruneExpired, defaultExpiry, norm,
} = require('./lib/content-corrections.js');

const REPO_ROOT   = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const FINDINGS    = path.join(REPO_ROOT, 'content-review-findings.json');
const STATE_FILE  = path.join(REPO_ROOT, 'data', 'content-autofix-state.json');
const PROPOSALS   = path.join(REPO_ROOT, 'content-autofix-proposals.json');
const DRY_RUN     = process.argv.includes('--dry-run');

// A 404 must persist this many consecutive daily runs before the link is
// cleared. One bad response is a bad afternoon; three days is a dead page.
const DEAD_LINK_RUNS = 3;
// Never touch more than this many things in one run. A scraper breaking could
// otherwise turn one bad night into a mass edit.
const MAX_AUTO_FIXES = 10;
const MAX_PROPOSALS  = 8;

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; }
}

function loadFindings() {
  const doc = readJson(FINDINGS, null);
  if (!doc) throw new Error(`no ${path.basename(FINDINGS)} — run scripts/content-review.js first`);
  return Array.isArray(doc) ? doc : (doc.findings || []);
}

// ── AUTO tier ─────────────────────────────────────────────────
// Confirmed-dead links, but only after they stay dead. The review already
// downgrades 5xx/timeout/transport errors to unconfirmed, so `confirmed` here
// means a real 404/410 — the KOTO incident (ten live URLs returning 504 in one
// run) is exactly what this guards against.
function autoFixDeadLinks(findings, state, todayISO) {
  const dead = findings.filter(f => f.category === 'Broken link' && f.confirmed === true && f.url);
  const seenToday = new Set(dead.map(f => f.url));
  const streaks = { ...(state.deadLinkStreaks || {}) };

  for (const url of seenToday) {
    const prev = streaks[url] || { runs: 0, firstSeen: todayISO };
    // Only count once per day, so a manual re-run can't fast-forward a streak.
    streaks[url] = prev.lastSeen === todayISO ? prev
      : { runs: prev.runs + 1, firstSeen: prev.firstSeen, lastSeen: todayISO };
  }
  // A link that came back to life resets — pages get restored.
  for (const url of Object.keys(streaks)) if (!seenToday.has(url)) delete streaks[url];

  const ready = dead.filter(f => (streaks[f.url] || {}).runs >= DEAD_LINK_RUNS).slice(0, MAX_AUTO_FIXES);
  const rows = ready.map(f => ({
    id: `deadlink-${norm(f.itemTitle).replace(/\s+/g, '-').slice(0, 40)}-${todayISO}`,
    kind: 'clear-link',
    array: f.array,
    titleMatch: f.itemTitle,
    reason: `Link returned ${f.httpStatus || '404'} on ${DEAD_LINK_RUNS}+ consecutive daily runs. Event kept, dead href cleared.`,
    evidence: f.url,
    addedBy: 'content-autofix',
    addedOn: todayISO,
  }));
  for (const r of rows) r.expiresOn = defaultExpiry(r, todayISO);

  return { rows, streaks, pending: dead.length - ready.length };
}

// ── PROPOSE tier ──────────────────────────────────────────────
const VERIFY_SYSTEM = `You settle a calendar-date disagreement using ONE source: the page you are given.

Rules:
- Answer ONLY from that page. If it does not clearly state the event's date, say so.
- Never average, infer, or pick the more likely-looking option.
- "verdict" must be one of: "confirms" (the page states one of the candidate dates),
  or "unclear" (the page does not settle it).
- Return ONLY the JSON object. No prose, no code fence.`;

const verifyPrompt = (finding, pageText, pageUrl) => `EVENT: ${finding.eventTitle}

Two or more sources disagree about when it happens:
${finding.claims.map(c => `  - ${c.date}, according to: ${c.arrays.join(', ')}`).join('\n')}

Below is the text of ${pageUrl}, one of the linked pages.

Return JSON:
{ "verdict": "confirms" | "unclear",
  "date": "YYYY-MM-DD",          // only when verdict is "confirms"
  "quote": "the sentence on the page that states it",
  "note": "one short sentence" }

If the page states a date that is NOT among the candidates, use verdict "unclear"
and put the date you saw in "note" — a third date means something else is wrong
and a human should look.

PAGE TEXT:
${pageText}`;

async function proposeDateFixes(findings, todayISO) {
  const conflicts = findings
    .filter(f => f.category === 'Conflicting event dates' && Array.isArray(f.claims) && f.claims.length > 1)
    .slice(0, MAX_PROPOSALS);
  const proposals = [];
  const unresolved = [];

  for (const f of conflicts) {
    const linked = f.claims.filter(c => c.link);
    if (!linked.length) { unresolved.push({ finding: f, why: 'no linked page to check' }); continue; }

    // Check EVERY linked page, never stop at the first that confirms something.
    //
    // Stopping early made the answer depend on claim ordering: the first live
    // run concluded Aug 19 for "Best Day Ever" from telluride.com's page, while
    // a local run concluded Aug 18 from KOTO's — both pages state a date, and
    // they contradict each other. Whichever got checked first won. That is the
    // confidently-wrong outcome this whole tier exists to avoid.
    const confirmations = [];
    for (const claim of linked) {
      try {
        const res = await fetchUrl(claim.link);
        if (res.status !== 200) continue;
        const text = htmlToText(res.text).slice(0, 20000);
        if (text.length < 200) continue;
        const answer = await callClaudeJson(VERIFY_SYSTEM, verifyPrompt(f, text, claim.link));
        if (answer && answer.verdict === 'confirms' && f.claims.some(c => c.date === answer.date)) {
          confirmations.push({ ...answer, checkedUrl: claim.link });
        } else if (answer && answer.note) {
          unresolved.push({ finding: f, why: `${claim.link}: ${answer.note}` });
        }
      } catch (e) {
        unresolved.push({ finding: f, why: `${claim.link}: ${e.message}` });
      }
    }

    const distinct = [...new Set(confirmations.map(c => c.date))];
    if (distinct.length > 1) {
      // The sources contradict each other ON THEIR OWN PAGES. No amount of
      // re-reading settles that — somebody has to ring the organizer.
      unresolved.push({
        finding: f,
        why: `sources contradict each other on their own pages: ` +
             confirmations.map(c => `${c.date} per ${c.checkedUrl}`).join(' vs '),
      });
      continue;
    }

    const settled = confirmations[0] || null;
    if (!settled) {
      if (!unresolved.some(u => u.finding === f)) unresolved.push({ finding: f, why: 'no page settled it' });
      continue;
    }
    // Record every page that agreed, so the reviewer sees the corroboration.
    settled.corroboration = confirmations.map(c => c.checkedUrl);

    // Correct every array that disagrees with the confirmed date.
    const wrongClaims = f.claims.filter(c => c.date !== settled.date);
    const rows = [];
    for (const c of wrongClaims) {
      for (const arrName of c.arrays) {
        const row = {
          id: `datefix-${norm(f.eventTitle).replace(/\s+/g, '-').slice(0, 40)}-${settled.date}-${arrName.toLowerCase()}`,
          kind: 'event-date',
          array: arrName,
          titleMatch: f.eventTitle,
          wrongDate: c.date,
          correctDate: settled.date,
          reason: settled.note || `Organizer page states ${settled.date}.`,
          evidence: settled.checkedUrl,
          quote: settled.quote || '',
          addedBy: 'content-autofix',
          addedOn: todayISO,
        };
        row.expiresOn = defaultExpiry(row, todayISO);
        rows.push(row);
      }
    }
    if (rows.length) proposals.push({ finding: f, settled, rows });
  }

  return { proposals, unresolved };
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  const todayISO = mtToday();
  console.log(`Content auto-fix — ${todayISO} (America/Denver)${DRY_RUN ? ' [dry-run]' : ''}`);

  const findings = loadFindings();
  console.log(`  ${findings.length} finding(s) from the latest review`);

  const state = readJson(STATE_FILE, {});
  const { doc, corrections } = readCorrections(REPO_ROOT);

  // ── AUTO 1: prune expired corrections
  const { kept, removed } = pruneExpired(corrections, todayISO);
  if (removed.length) console.log(`  pruned ${removed.length} expired correction(s): ${removed.map(r => r.id).join(', ')}`);

  // ── AUTO 2: clear links that have stayed dead
  const { rows: deadRows, streaks, pending } = autoFixDeadLinks(findings, state, todayISO);
  if (pending > 0) console.log(`  ${pending} dead link(s) still building toward the ${DEAD_LINK_RUNS}-run threshold`);
  for (const r of deadRows) console.log(`  AUTO clear-link: "${r.titleMatch}" in ${r.array} (${r.evidence})`);

  const existingIds = new Set(kept.map(c => c.id));
  const autoRows = deadRows.filter(r => !existingIds.has(r.id));
  const nextCorrections = [...kept, ...autoRows];

  // ── PROPOSE: date conflicts, verified against the organizer
  const { proposals, unresolved } = await proposeDateFixes(findings, todayISO);
  for (const p of proposals) {
    console.log(`  PROPOSE date fix: "${p.finding.eventTitle}" -> ${p.settled.date} (per ${p.settled.checkedUrl})`);
  }
  for (const u of unresolved) console.log(`  left for a human: "${u.finding.eventTitle}" — ${u.why}`);

  const changedAuto = autoRows.length > 0 || removed.length > 0;

  if (DRY_RUN) {
    console.log(`\n🔎 dry-run: ${autoRows.length} auto fix(es), ${proposals.length} proposal(s) — nothing written`);
  } else {
    if (changedAuto) {
      doc.corrections = nextCorrections;
      writeCorrections(REPO_ROOT, doc);
      console.log(`\n✅ corrections file updated (${nextCorrections.length} active row(s))`);
    } else {
      console.log('\n✓ no automatic fixes needed');
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ deadLinkStreaks: streaks, lastRun: todayISO }, null, 2) + '\n');
    // The workflow reads this to decide whether to open a PR, and to write its body.
    fs.writeFileSync(PROPOSALS, JSON.stringify({
      date: todayISO,
      proposals: proposals.map(p => ({
        event: p.finding.eventTitle,
        confirmedDate: p.settled.date,
        evidence: p.settled.checkedUrl,
        quote: p.settled.quote || '',
        claims: p.finding.claims,
        rows: p.rows,
      })),
      unresolved: unresolved.map(u => ({ event: u.finding.eventTitle, why: u.why })),
    }, null, 2) + '\n');
  }

  console.log(`\nautoFixed=${autoRows.length + removed.length} proposed=${proposals.length} unresolved=${unresolved.length}`);
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
