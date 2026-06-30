# Phase 1 — Foundation & Safety Net (plan)

**Status:** PLANNED (queued after Phase 0 / P0, completed 2026-06-28/29).
**Goal:** build the safety net that makes Phases 2–6 safe to execute. Nothing in
Phase 1 changes site behavior — it only *locks in* current behavior so any later
refactor can be proven equivalent (parity), validated (schema), and regression-
checked (golden tests). This is the strangler net.

**Definition of done for Phase 1:** `npm test` runs, in CI, (a) schema conformance
over the live data files, (b) a parity snapshot diff, and (c) golden tests for the
brittle logic — and a red result blocks the change. After this, Phase 2 can move
one array at a time behind the net.

---

## Deliverable A — Schemas + conformance check

Define the canonical record shapes and validate the *current* data against them
(report-only first, then enforce). Builds on the existing `scripts/lib/validate.js`.

- **New `scripts/lib/schemas.js`** (pure, no deps) — declares, for each record type,
  the canonical field per concept plus an alias map for the legacy variants the
  audit found:
  - **Meeting:** `{ source, sourceLabel, title, date (YYYY-MM-DD, MT), time?, location?, agendaUrl?, zoomUrl?, status?, summaryKey? }`
  - **Event:** `{ title, date (YYYY-MM-DD), endDate?, time?, location?, source, link?, image?, isFestival?, … }` — canonical: `image` (aliases `img`/`imageUrl`), `link` (aliases `href`/`url`), `date` (alias `pubDate`/`start_date`).
  - **Summary entry:** key `source|YYYY-MM-DD|title`; value `{ shortSummary, … }`.
- **`validateAgainstSchema(record, type)`** → `{ ok, errors[] }`. Reuse in the
  write path later (Phase 2).
- **CI wire-up:** a `scripts/test/schema-conformance.test.js` that loads the live
  data via `lib/load-data.js` and asserts every record conforms (or lists drift).
  Start as a **warning count**, flip to a hard failure once the data is clean.
- *Note:* this only defines + checks shapes; it does **not** migrate storage (that's
  Phase 2). The alias map is what lets Phase 2 normalize without breaking readers.

## Deliverable B — Parity harness (the cutover gate)

Snapshot what the site produces *today* so every later refactor is a no-op until we
intend otherwise.

- **Deterministic inputs:** pin "today" via the existing date args/env so output is
  stable run-to-run. Capture three canonical outputs:
  1. **Weekly digest** — `weekly-email.js` non-preview HTML for a fixed week.
  2. **Gov-hub meetings** — `get*Meetings()` + `getMeetingSummary()` resolved for a
     fixed reference date (list + which summary each row resolves to).
  3. **Events** — the events-page data array for a fixed window (post dedup/sort).
- **Fixtures:** `scripts/test/fixtures/parity/*.json|html`. A `npm run snapshot`
  regenerates them (run intentionally when data legitimately changes).
- **Test:** `scripts/test/parity.test.js` re-renders and diffs against the fixtures.
  A diff = either an intended change (update the fixture in the same PR) or a
  regression (stop). This is the gate Phases 2–6 run before every cutover.
- *Risk:* fixtures drift as real data changes; the `snapshot` step + a short README
  make "regenerate vs investigate" an explicit decision, never silent.

## Deliverable C — Golden tests for the brittle logic

Lock the heuristics that have silently misfired, so a future "fix" can't regress
them (the `isBadSummary` over-rejection is the cautionary tale).

- **Make the functions importable.** `getMeetingSummary`, `localDateKey`,
  `localDate`, `isBadSummary` live in browser-global `gov-helpers.js`. Extend
  `lib/load-data.js`'s `captureNames` to expose them (it already captures
  `localDate`/`isBadSummary`), so tests can call the real implementations.
- **Tables to lock:**
  - `getMeetingSummary` — exact key hit, board-token fuzzy match, ` -- CANCELED`
    suffix, `isBadSummary` rejection, single-meeting partial fallback, and the
    `localDateKey` date cases (incl. a timestamped/evening date that the old
    `toISOString` path got wrong).
  - `localDate` / `localDateKey` — date-string → key table (ISO, "Month D, YYYY",
    timestamped, non-MT) with expected MT calendar day.
  - dedup (`lib/sanitize.js` token key / cross-source) — pairs that must / must not
    merge (the multi-source Rundola case).
  - `featuredScore` (weekly-email.js) — ordering expectations for representative
    meetings vs events (and the image-required rule).
- **Files:** extend `scripts/test/` (node:test, no new deps). Several `lib/*` already
  have tests; the gap is the `gov-helpers.js` logic + `featuredScore`.

---

## Suggested execution order (next session)

1. **C-first** — extend `load-data.js` capture + write golden tests that pass
   against *current* behavior. (Cheapest; immediately catches accidental
   regressions while doing B.)
2. **B** — build the parity harness + fixtures + `npm run snapshot`.
3. **A** — schemas + report-only conformance; clean up drift; then enforce.
4. Wire all three into `test.yml` so CI is the gate. Update `docs/overhaul-plan.md`
   Phase 1 → done; begin **Phase 2** (unify meeting list+summary into one record;
   make `content-refresh` *add* rows, not just patch — the structural fix for the
   orphan-summary class the Phase 0 #2 detector now merely *reports*).

## Dependencies / decisions already settled
- **Data store:** JSON-in-repo (keeps GitHub Pages); **ESP:** Mailchimp. (Per
  2026-06-28 decision.) Phase 2 migrates arrays to JSON one at a time, parity-gated.
- The 3 deferred `toISOString` date sites get folded into the Phase 3 shared date
  lib (one `localDateKey`/`mtDateKey` imported everywhere).
