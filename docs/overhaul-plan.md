# Livable Telluride — Codebase & Automation Overhaul Plan

**Status:** APPROVED IN PRINCIPLE (2026-06-28). Strangler approach agreed; a total
from-scratch rewrite was explicitly ruled out. Phase 0 (audit) in progress.

**Goal:** end the recurring "holes" — silent breakage, stale data, decoupled
pipelines, drifted logic — by moving to a structured, validated, observable
architecture, built incrementally alongside the current site and cut over with
proof (parity), not faith.

---

## 1. Method: strangler, not greenfield

The destination is clean, new, well-architected files that fully replace the
current ones. The *method* is incremental, because this is a live civic site
with ~21 workflows, ~25 scripts, a Cloudflare Worker, a Firestore runtime layer,
two email platforms, and live integrations (CivicClerk, KOTO, Mailchimp,
Firebase, Publer). A big-bang rewrite would have to re-derive all of that from
memory and would leave the old system drifting for months. `docs/json-data-migration-plan.md`
already reached the same conclusion ("do NOT big-bang it").

**Strangler pattern:** build each clean new module beside the old, prove it
produces identical-or-better output via a **parity harness**, cut over one slice
at a time, then delete the old file. Reversible at every step; the live site
never goes dark. End state = all-new files, proven.

## 2. Root-cause taxonomy (the holes)

Every failure observed in the 2026-06-28 session maps to one of these:

| # | Root cause | Evidence |
|---|---|---|
| A | Data stored as executable JS, mutated by string surgery (470 KB of `const` literals in `gov-helpers.js`) | `endDate:"undefined"`; a dropped `const` nuking everything below it; parity-sync disaster |
| B | Multiple sources of truth that disagree — meeting *lists* (stale static `*_CACHED_DATA`) vs *summaries* (`MANUAL_SUMMARIES`) vs runtime `AI_SUMMARIES` (Firestore) | July 1 BOCC existed as a summary but not the list; TC summary in static store, digest read the empty runtime stub |
| C | Copy-pasted logic that drifts — `featuredScore`, `isGovMeetingTitle`, dedup, date helpers in 3+ files | a fix in one place doesn't reach the others |
| D | Ad-hoc timezone handling (`toISOString` UTC vs `America/Denver`) | recurring date off-by-one; an entire memory note exists for it |
| E | No schema / validation at boundaries; inconsistent field names (`img`/`imageUrl`, `link`/`href`/`url`, `date`/`pubDate`/`start_date`) | Rundola duplicated across 5 sources; scoring missed images on a field mismatch; `projects.json` "no runtime validator" |
| F | Silent failures / no observability | `emailed:true` lied; county cache stale since March, unnoticed; `isBadSummary` suppressed ~10 good summaries invisibly |
| G | Heuristics doing the job of structured data | `isBadSummary` regex false-positive; fuzzy `tkey` dedup; keyword `featuredScore`; title reconciliation guessing |
| H | Automation sprawl — 21 workflows, ~25 scripts, 5 `customerio-*`, overlapping review/refresh jobs, two ESPs | hard to reason about what runs, when, why |
| I | Three runtimes (Pages + Worker + Firestore) with data split across them | static-vs-runtime summary split |
| J | Monolithic pages, hand-duplicated nav/CSS/JS | nav drift across 20 pages; DCL-race blank page |

## 3. Target architecture

1. **One structured, validated data layer** — a canonical record per meeting
   carrying *both* list metadata *and* summary (no decoupled caches), one field
   per concept, MT-anchored dates with explicit tz. Same for events. JSON-in-repo
   **or** Firestore-as-source-of-truth (decision pending). Schema-validated on
   write and in CI.
2. **One pipeline per concern, idempotent + observable** — `content-refresh`
   emits canonical records (list+summary together). Each run reports counts and
   health; zero/anomalous output alerts. Writes data, not code.
3. **A shared core library** — date/MT, dedup, scoring, classification, sanitize:
   one implementation imported everywhere (scripts + pages). Builds on the
   existing tested `scripts/lib/` (`serialize`, `extract`, `validate`).
4. **Presentation separated from data** — shared nav/card/meeting components
   rendered from the data layer; slim the monolith pages. One nav, not 20.
5. **Tests + CI gates** — golden/regression fixtures for the brittle bits;
   CI blocks any commit failing schema, parity, or tests.
6. **Truthful observability** — every pipeline/agent writes a structured run
   record; one-glance health view (or daily health email). Verify, never assume.
7. **Consolidated automation** — registry of every workflow/agent/scheduled task
   (what, when, touches, secrets, owner); merge overlaps; **one ESP**.

## 4. Guardrails that prevent NEW holes

- Schema at every boundary (invalid data can't be written or deployed).
- Single source of truth per fact; everything else derived.
- Loud failure (0/anomalous output → alert, never silent ship).
- Golden tests for heuristic-heavy code (so a "fix" can't silently regress).
- One shared util lib (no second copy to drift).
- Definition of done for any data/pipeline change: schema-valid + tested + observable.

## 5. Phased roadmap (each phase reversible, parity-gated)

- **Phase 0 — Audit.** Findings register: every data source, pipeline, page,
  workflow, agent, secret; dependency map; holes ranked by risk × frequency.
  Deliverable: `docs/overhaul/` audit + prioritized backlog. (In progress.)
- **Phase 1 — Foundation & safety net.** Schemas; the parity harness (capture
  today's outputs as fixtures); golden tests around current behavior.
- **Phase 2 — Data layer.** Execute the JSON migration one array at a time;
  unify list+summary into one record; normalize fields/timezones. Parity-gated.
- **Phase 3 — Shared core lib.** Extract date/dedup/scoring/classification;
  replace the copies; lock with tests.
- **Phase 4 — Pipeline + automation consolidation.** Single canonical producer;
  observability + truthful status; merge overlapping workflows; pick one ESP.
- **Phase 5 — Presentation.** Shared nav/components; slim the monoliths; render
  from the data layer.
- **Phase 6 — Cutover & delete.** Once parity holds, retire the old files —
  the "new files replace the old" goal, proven.

## 6. Open decisions

1. Strangler approach — **agreed** (no total rewrite).
2. **Data store:** JSON-in-repo (simplest, keeps Pages) vs Firestore-as-single-source. Biggest fork.
3. **One ESP:** Mailchimp or Customer.io.
4. **Pace:** multi-week phased effort, not a weekend.

## 7. Tracking

Phase 0 output lands in `docs/overhaul/` (audit-findings + backlog). Progress is
tracked against the phases above; update this doc as phases complete.
