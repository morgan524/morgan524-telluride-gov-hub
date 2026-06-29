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

### P0 — quick wins (small, safe, high-value; close holes now)
1. **Fix the editorial approval email** — in `worker.js` `/article-create`, send
   `kind:"moderation"` and gate `emailed` on `rj.ok` (mirror the IG path).
   *Unstalls the full-summary pipeline.* (Risk 1)
2. **Add a staleness/orphan alert to `source-health`** — flag each `*_CACHE_DATE`
   and each list's latest meeting date when older than N days; flag any
   `MANUAL_SUMMARIES`/`AI_SUMMARIES` key with no matching list row. (Risks 2,4)
3. **Central `mtDateKey()` fix** for the `toISOString` date-key bug across the 6
   getters + build-rss. (Risk 3)
4. **Add `git pull --rebase` (or stagger crons)** to maintenance / housing /
   festival / smc-watch push steps. (Risk 5)
5. **Set `MODERATION_SECRET`** as an explicit Worker secret. (Risk 6)
6. **Add a host allow-list to `/og`.** (Risk 7)
7. **Guard object writes** — parse-check + reject `"[object Object]"`/`"undefined"`
   before splicing in `replaceJsValue`. (Risk 8)
8. **Retire dead automation** — delete the Customer.io test/lookup/migration
   workflows + scripts (keep one ESP), remove `monthly-citation-audit`
   (BriefLink), drop the redundant `weekly-website-review` task, confirm/delete
   `weekly-preview.js`, fix the weekly doc drift. (Risk 10)

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
- `AI_SUMMARIES` is **not** a runtime Firestore read — it's generated static into
  `gov-helpers.js` by the pipeline and served as a global, same as
  `MANUAL_SUMMARIES`. The gov-hub stub comment is vestigial and misleading.
- The DCL-race class is largely fixed (readyState guard is near-universal); the
  residual risk is the *data*-load fallback, which is still per-page.
