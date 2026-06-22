# Daily Content Review

**What it is:** a scheduled, report-only reviewer that checks the *content* of
the live data for editorial errors — the things infra/security checks miss.
Complements, does not replace: `weekly-review.yml` (infra/security/liveness) and
`maintenance.js` (cleanup + link sampling).

- **Script:** `scripts/content-review.js`
- **Workflow:** `.github/workflows/content-review.yml` — **4×/day at
  01/07/13/19 UTC**, i.e. 1 hour after each 6-hour content-refresh
  (00/06/12/18 UTC), so every refresh's output is reviewed. Plus
  `workflow_dispatch`.
- **Output:**
  - one auto-managed GitHub issue titled **🧭 Daily content review findings**
    — refreshed every run, auto-closed on a clean run (same pattern as
    maintenance's "🔎 Daily website review findings");
  - a **once-a-day email digest** to `info@livabletelluride.org` on the **13:00
    UTC (morning) run** (and on any manual dispatch). Reuses the
    `PREVIEW_SMTP_USER`/`PREVIEW_SMTP_PASS` secrets from weekly-preview via
    `dawidd6/action-send-mail`. Sends an "all clear" heartbeat when clean, or
    the findings list when not. The other three daily runs only refresh the
    issue — so exactly one email/day. If the SMTP secret is unset, the email is
    skipped and the issue remains the channel.

## What it checks

Deterministic (no API):
- **Duplicate events** — *within* an array, same title + date + **link** →
  `High` (true redundancy). Same title + date but **different link/time** →
  `Medium` "possible duplicate" (often legitimate multi-session events, e.g.
  KOTO `…/2026-06-24/1/` and `/2/` — flagged for a human, never auto-removed).
- **Cross-source same-date events** → one rolled-up `Low` spot-check (normal for
  an aggregator; the render-time dedup should merge them — verify none shows
  twice on the live Events tab).
- **Conflicting dates** — same event title in 2+ sources on *different* dates
  within 7 days → `High` (the Mountain-Village-wrong-dates trap; see the
  `mv-calendar-wrong-dates` memory note).
- **Bad dates** — unparseable (`localDate()` → null), wrong-year typos,
  far-future (>400d), `endDate` before start.
- **Past events still in data** → `Low` (usually hidden by the rolling render
  window; worth pruning only if it surfaces as "upcoming").
- **Missing title/date**, **mojibake** (UTF-8 double-encoding — *not* raw HTML
  entities, which are expected), **low-quality meeting summaries**
  (`isBadSummary()`).
- **Links** — malformed (scheme-less) grouped per source → `Medium`; dead
  (404/410/timeout) on notices/housing → `High`, on events → `Medium`.
  401/403/429 are treated as inconclusive (CI-IP/auth walls), not dead. Capped
  at 45 distinct links/run.

AI semantic pass (optional, needs `ANTHROPIC_API_KEY`; model
`claude-sonnet-4-6`, override via `CONTENT_REVIEW_MODEL`):
- Fuzzy near-duplicates, dates that contradict the title, mislabeled/garbled
  items, internal inconsistencies. Conservative prompt; failures are swallowed
  (`Low` "AI pass error") so they never break the deterministic run.

## Design decisions

- **Report-only by design.** It never edits `js/gov-helpers.js`, because
  `content-refresh.js` rewrites that file every 6h — a one-off deletion would be
  re-introduced on the next refresh. Real fixes belong at the source (the
  relevant scraper/dedup/parse step). The issue gives precise locations + line
  numbers + suggested fixes so a human or a Claude session can act.
- **Durable source-side fixes go through `sanitizeRecords()` in
  `content-refresh.js`** — a normalization pass applied to every array at the
  single write funnel (`replaceJsValue` → `serializeArray`). It currently:
  omits `undefined` field values (the `endDate:"undefined"` bug); collapses an
  immediately-repeated noise word in titles (Norwood's "Meeting Meeting");
  drops a wrong-year `endDate` (same month+day, later year) or an end-before-
  start; and collapses same-date title *reorderings* (CivicWeb's joint-meeting
  double-listing, e.g. "HARC and P&Z" vs "P&Z and HARC") while preserving
  identical-title multi-session events (KOTO "…/1/", "…/2/"). Add new
  source-quirk fixes here so they self-heal on every refresh.
  - **Not handled here:** cross-source *different-date* conflicts (e.g.
    Mountain Village publishing a Town Talk one day off from KOTO). Those are
    upstream-source errors (see memory: `mv-calendar-wrong-dates`); the review
    flags them, but resolving needs a source-trust rule, not a write-time
    normalization.
- **Auto-discovery.** Data arrays are discovered by evaluating
  `js/gov-data.js` + `js/gov-helpers.js` in a sandbox and keeping every
  array-of-objects, so **new event sources are reviewed automatically** with no
  code change.
- **Extensible.** Checks are a registry (`CHECKS[]` in the script). Add a check
  = push one function `(ctx) => { add(severity, category, title, detail) }`.
- **Severity calibration is deliberate** to avoid alarm fatigue: `High` =
  high-confidence real error; `Medium` = needs human judgment; `Low` =
  hygiene/spot-check. Retune in the relevant check, not the workflow.

## Running locally

```bash
node scripts/content-review.js                 # deterministic only
ANTHROPIC_API_KEY=sk-... node scripts/content-review.js   # + AI pass
```

Writes `content-review-findings.log` (human-readable) and
`content-review-findings.json` (full structured list, incl. items truncated in
the log) when there are findings; removes both on a clean run. Both are
gitignored — transient, read by the workflow's issue step, never committed.

## When this is a model-ID site

`scripts/content-review.js` hardcodes `claude-sonnet-4-6` for the AI pass — it's
listed in the `claude-model-inventory` memory note. It is NOT covered by the
content-refresh preflight (different workflow), but a model retirement only
degrades the optional AI pass to a swallowed `Low` "AI pass error"; the
deterministic checks are unaffected.
