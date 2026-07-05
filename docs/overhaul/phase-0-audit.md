# Phase 0 Audit — Findings & Backlog (2026-06-28)

Read-only head-to-tail review of data, automation, and presentation/runtimes, run
as three parallel audits. Root-cause letters reference `docs/overhaul-plan.md` §2
(A=data-as-JS, B=multiple-sources-of-truth, C=copy-paste drift, D=timezone,
E=no-schema/field-drift, F=silent-failure, G=heuristics-for-data, H=automation
sprawl, I=three-runtimes, J=monolith pages).

## Executive summary

The site works, but it's held together by **static snapshots that silently rot,
heuristics that silently misfire, and pipelines that report success without
verifying it.** Three structural facts drive almost every bug:

1. **Meeting lists and meeting summaries are separate, and the lists are frozen.**
   All 11 `*_CACHED_DATA` lists are 47–96 days stale; the summary pipeline keeps
   writing `MANUAL_SUMMARIES` for meetings that the lists never gain a row for, so
   real meetings (e.g. the July county BOCC dates) have a summary but never render.
2. **Failures are silent by default.** A Worker reports `emailed:true` while the
   relay drops the message; `source-health` only alerts on count→0 (so a list that
   *stops growing* never trips it); scrapers `catch{warn}` and go stale.
3. **Logic and config are copy-pasted, not shared.** `featuredScore`, date
   helpers, JS-extract parsers, nav (18 pages), Firebase config (6×), the Worker
   URL (8×) — each a drift surface.

## Top cross-cutting risks (ranked, all areas)

| # | Risk | Root | Evidence |
|---|------|------|----------|
| 1 | **Editorial / full-summary approval emails are silently dropped** — `worker.js` `/article-create` sends `kind:"editorial"` and sets `emailed=true` *without* reading the relay; the Gmail relay only forwards `kind:"moderation"`. The full-summary pipeline is stalled at the human gate (same bug class we fixed for Instagram today). | F/I | worker.js ~L868–877 vs the corrected IG path ~L1164–1179 |
| 2 | **All 11 meeting lists stale + orphan summaries** — `patchAgendaUrls` can only edit existing rows, never add; `source-health` can't see "stopped growing." | B/C/F | gov-data.js cache dates 47–96d old; content-refresh.js:5016; source-health.js:74 |
| 3 | **`getMeetingSummary` UTC date-key bug** — `eventDate.toISOString().slice(0,10)` shifts evening/east-of-UTC dates a day → silent blank summaries. Same pattern in 5 other getters. | D | gov-helpers.js:7596 (+7656,7679,7374; build-rss 277,387) |
| 4 | **Three disagreeing summary stores + `AI_SUMMARIES` confusion** — static list vs `MANUAL_SUMMARIES` vs `AI_SUMMARIES`; the gov-hub "populated from Firestore" stub/comment is inaccurate (AI_SUMMARIES is actually baked static into gov-helpers.js). | C/I | gov-hub.html:1251; getMeetingSummary 3-store resolver |
| 5 | **Noon push-race** — `maintenance` + `housing` push WITHOUT `git pull --rebase`, colliding with `content-refresh` at `0 12 UTC`; loser fails or clobbers. | F/H | maintenance.yml, housing-refresh.yml |
| 6 | **HMAC seed coupled to `ANTHROPIC_API_KEY`** — rotating that key (done periodically) invalidates every outstanding review/moderation link; falls back to a guessable literal `"fallback"` if `MODERATION_SECRET` is unset. | I | worker.js:552 |
| 7 | **`/og` is an open SSRF** — fetches any URL, follows redirects, `Allow-Origin:*`, no host allow-list (unlike `/proxy`). | I | worker.js ~L1358 |
| 8 | **Object writes skip validation** — `MANUAL_SUMMARIES`/`MEETING_AGENDA_META` go through `serializeObject` with no sanitize/validate and no re-parse guard (the `[object Object]`/`undefined` corruption class lives here). | A/F | content-refresh.js:2996; lib/serialize.js |
| 9 | **Nav hand-duplicated across 18 pages, with drift** — footer was extracted to `site-footer.js`, nav never was; index has 22 links, two deep-dives carry an older nav. | J | per-page nav blocks |
| 10 | **Automation sprawl** — 6 dead/parallel Customer.io workflows, `monthly-citation-audit` is a BriefLink artifact orphaned here, quadruple weekly site-review coverage, `weekly-preview` Thursday/Saturday doc drift, several Mac-dependent scheduled tasks that no-op silently when the laptop is closed. | H/F | .github/workflows/*, scheduled tasks |
| 11 | **No schema; field-name divergence + heuristic identity** — `img/imageUrl/image`, `link/href/url`, `date/pubDate`; two disagreeing "is this summary real?" regexes (`isBadSummary` vs `isPlaceholderSummary`); fuzzy dedup/board-token matching. | E/G | gov-helpers.js field counts; isBadSummary vs content-refresh.js:1227 |
| 12 | **Front-end duplication & manual cache** — Firebase config 6×, Worker URL 8×, admin email 3×, three `?v=` cache-bust schemes, hand-maintained `sw.js` precache (lists gov-helpers but not gov-data). | I/J | events/hub-bub/local-orgs/etc.; sw.js |

## Per-area registers (condensed)

Full registers (with file:line evidence) are in the audit run; key points:

- **Data/pipelines:** content-refresh.js (6,705 lines) is the monolith producer;
  it rewrites the JS data files by string surgery via `lib/{extract,serialize}`.
  `build-rss-feed.js` has the *correct* UTC-snapped window (`withinRollingWindow`)
  that content-refresh and gov-helpers never adopted, and duplicates the extract
  parser inline. Three independent bracket-matchers exist. `lib/validate.js` skips
  records with no recognized date field. The only unit-tested code is `lib/`.
- **Automation/agents:** Mailchimp is the canonical ESP (live RSS campaign reads
  `feed.xml`); Customer.io is an unscheduled parallel trial (6 manual workflows).
  Editorial draft creation is actually `meeting-recaps.js --full-summaries`
  (local, launchd) — the documented `scoreMeeting→writeDraft` loop is not invoked.
  `full-summary-publish.yml` runs 96×/day but finds nothing because of risk #1.
- **Presentation/runtimes:** one Worker hosts 21 endpoints + 17 secrets. The
  DCL/readyState guard is now near-universal (the old blank-page fix propagated),
  but data still arrives via per-page async-injected scripts with copy-pasted
  fallbacks. CSS extraction is half-done (manifest exists; events/hub-bub still
  inline-heavy). `v2/vote-tracker.html` is 562 KB of inline data.

## Backlog

### P0 — quick wins ✅ COMPLETE (2026-06-28/29)
1. ✅ **Editorial approval email** — `worker.js` `/article-create` now sends
   `kind:"moderation"` and gates `emailed` on the relay response. Deployed
   (Worker v1.1.0). Unstalls `full-summary-publish.yml`. (Risk 1)
2. ✅ **Staleness/orphan detector** — `detectStaleData()` in `source-health.js`
   (cache-date age + future summaries with no list row), wired into
   `content-review.js`'s issue/email path. Commit `2191970`. On live data it
   flags 11 stale lists + 16 orphan future summaries. (Risks 2,4)
3. ✅ **MT-anchored date keys** — `localDateKey()` replaces `toISOString()` at the
   4 getter lookup sites in `gov-helpers.js`. Commit `308ac00`. Golden-checked:
   0/91 key changes (zero regression). (Risk 3)
4. ✅ **Rebase-before-push** added to maintenance / housing / festival / smc-watch.
   Commit `bc43a6c`. (Risk 5)
5. ✅ **`MODERATION_SECRET`** set as an explicit Worker secret (HMAC decoupled from
   `ANTHROPIC_API_KEY`). (Risk 6)
6. ✅ **`/og` SSRF guard** — `ogBlockedHost()` rejects private/loopback/link-local/
   metadata hosts + non-web ports (real previews still work). Deployed
   (v21897b53); verified 403 vs 200. (Risk 7)
7. ✅ **Corrupt-write guard** — `assertSerializedSafe()` rejects `[object Object]`
   and parse-checks the fragment before splicing in `replaceJsValue`. Commit
   `f4de54b`. (Risk 8)
8. ✅ **Retired dead automation** — deleted 4 Customer.io scaffolds + the BriefLink
   `monthly-citation-audit` + dead `weekly-preview.js`. Commit `33fc183`.
   (Kept `customerio-send-test`/`customerio-weekly`; the `weekly-website-review`
   scheduled task is MCP-managed, not a repo file — drop separately.) (Risk 10)

**Pending follow-up (not blocking):** reconcile `worker.js` into `main` — the live
Worker is ahead (Instagram funnel + fixes #1/#5/#6). Blocked on adding GitHub repo
secrets `INSTAGRAM_SECRET` / `PUBLER_API_KEY` / `PUBLER_WORKSPACE_ID` /
`PUBLER_IG_ACCOUNT_ID` so `deploy-worker.yml`'s secret push can't blank live
values; then commit `worker.js` → `main` and let auto-deploy own it.

**Deferred (same class, lower urgency):** the 3 remaining `toISOString().slice`
date-key sites in `gov-helpers.js` (`:2359`, `:7126/7131` — list/dedup, not getter
lookups) → fold into the Phase 3 shared date lib. See `docs/overhaul/phase-1-plan.md`.

### P1 — structural (the strangler phases)
- **Phase 1:** schemas for meeting/event/summary records; a **parity harness**
  capturing today's rendered digest + gov-hub output as fixtures; golden tests for
  `getMeetingSummary`, dedup, `featuredScore`, date handling.
- **Phase 2:** unify meeting **list + summary into one record**; make
  `content-refresh` add rows (not just patch); JSON-migrate one array at a time;
  normalize field names + timezones at the boundary.
- **Phase 3:** shared core lib (date/MT, dedup, scoring, classification) imported
  by scripts *and* pages; delete the copies; lock with tests.
- **Phase 4:** single canonical producer + observability (truthful status, loud
  failure); merge overlapping workflows; one ESP; one HMAC/secret story.
- **Phase 5:** shared nav/config (`site-nav.js`, `js/config.js`), finish CSS
  extraction, slim the monolith pages, render from the data layer.
- **Phase 6:** cutover + delete the old files (proven by parity).

## Notes / corrections to prior mental model
- `AI_SUMMARIES` is **not** a runtime Firestore read. **CORRECTION (2026-07-05,
  surfaced by the Phase 1 golden tests):** it is also **not** in `gov-helpers.js`
  — it is defined **inline only in `gov-hub.html`**, yet `getMeetingSummary()`
  (in gov-helpers.js, ~L8078) references it. So on every OTHER surface that loads
  gov-helpers (the digest via weekly-email, content-review, source-health,
  events) `getMeetingSummary` throws `ReferenceError: AI_SUMMARIES is not defined`
  on its first line — silently swallowed by each caller's `try/catch`, so its
  richer AI/MANUAL resolution is dead there and callers fall back to
  `m.description`. Risk class B/C/F. **Fix (deferred, parity-gated):** make
  `getMeetingSummary` default `AI_SUMMARIES` to `{}` in gov-helpers.js — but that
  changes what summaries the digest renders, so it waits for the parity harness.
  Interim: `lib/load-data.js` now injects `AI_SUMMARIES={}` into its sandbox so
  tooling (and the golden tests) get a working `getMeetingSummary`.
- The DCL-race class is largely fixed (readyState guard is near-universal); the
  residual risk is the *data*-load fallback, which is still per-page.
