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
  - an **exception-only email** to `info@livabletelluride.org`, decided once a
    day on the **13:00 UTC run** (and on manual dispatch). It emails **only when
    a finding needs a human** (non-`Low` severity → `content-review-actionable.log`
    is non-empty); otherwise it stays **silent**. On **Mondays** it sends a light
    weekly digest (status + current advisories) as a paper trail even when
    nothing needs action. Reuses the `PREVIEW_SMTP_USER`/`PREVIEW_SMTP_PASS`
    secrets via `dawidd6/action-send-mail`; if unset, email is skipped and the
    issue remains the channel.

**Severity → action:** `Critical`/`High`/`Medium` = actionable (emailed when
present). `Low` = advisory (issue + weekly digest only, never an action email).
Auto-fixable categories don't reach email at all — they're fixed at the source
(below) before the review sees them.

## What it checks

Deterministic (no API):
- **Silent scraper failure** — a source whose item count collapsed (0 now, but
  ≥3 recently) → `High`; a sharp partial drop (<20% of a ≥15 baseline) →
  `Medium`. This is the highest-value reliability check: it catches a source
  changing its HTML/feed and the scraper silently going stale. Powered by a
  rolling 14-day baseline (`scripts/source-baselines.json`) that
  `content-refresh.js` maintains via `scripts/source-health.js`; the review
  reads it. See **Source health** below.
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
- **Auto-fixes happen at the source in `content-refresh.js`, never by editing
  the data file directly.** Two pieces:
  - **`sanitizeRecords()`** — applied to every array at the single write funnel
    (`replaceJsValue` → `serializeArray`). It: omits `undefined` field values
    (the `endDate:"undefined"` bug); collapses repeated noise words in titles
    ("Meeting Meeting"); repairs scheme-less links (`ocrhm.org` →
    `https://ocrhm.org`); drops wrong-year/end-before-start `endDate`s; removes
    **exact duplicates** (same date+title+link); and collapses same-date title
    *reorderings* (CivicWeb joint-meeting double-listing) — all while preserving
    legit multi-session events (KOTO "…/1/", "…/2/") and two distinct articles
    sharing a headline. Add new source-quirk fixes here.
  - **`filterMvConflicts()`** (Task 21b, runs once per refresh) — drops a
    **Mountain Village** event copy when a *trusted* source (KOTO, Sheridan,
    Telluride.com, Telluride Science) lists the same event within ±3 days on a
    *different* date. The event still shows (from the trusted source); only the
    wrong-date duplicate is suppressed. See memory: `mv-calendar-wrong-dates`.
  - **`validateRecords()`** (`lib/validate.js`, write-time **quarantine**) — at
    the same funnel, *after* sanitize and *before* serialize, it drops records
    that are unambiguously broken: a present-but-unparseable date, or a dated
    entry with no title/name AND no content (a blank junk fragment). Deliberately
    conservative — a dated record that has a title OR any description is KEPT
    (the review flags a missing title; a human decides). Quarantines are logged,
    not silent; a whole source going malformed shrinks the array and trips
    source-health. Verified to quarantine 0 of the current ~780 live records.
  - **Eventual consistency:** `sanitizeRecords` runs when an array is (re)written,
    i.e. when that source's scrape changes — which for active event feeds is
    most refreshes. A static, already-clean array isn't needlessly rewritten.
    So a freshly-introduced quirk self-heals within a refresh cycle, not
    necessarily the same minute the review flags it. `filterMvConflicts` runs
    unconditionally every refresh.
  - **Still needs a human (not auto-fixed):** broken 404 links (often
    transient / the event may be fine), AI semantic flags, unparseable/missing
    dates, and cross-source conflicts where neither side is the known-unreliable
    MV. These become the exception email.
- **Auto-discovery.** Data arrays are discovered by evaluating
  `js/gov-data.js` + `js/gov-helpers.js` in a sandbox and keeping every
  array-of-objects, so **new event sources are reviewed automatically** with no
  code change.
- **Extensible.** Checks are a registry (`CHECKS[]` in the script). Add a check
  = push one function `(ctx) => { add(severity, category, title, detail) }`.
- **Severity calibration is deliberate** to avoid alarm fatigue: `High` =
  high-confidence real error; `Medium` = needs human judgment; `Low` =
  hygiene/spot-check. Retune in the relevant check, not the workflow.

## Source health (silent-scraper-failure detection)

The biggest reliability risk is a scraper silently breaking: a source changes
its HTML/feed, the selector matches nothing, the sync returns empty, and that
section goes stale for days with nobody noticing.

- **`scripts/source-health.js`** — run by `content-refresh.yml` after each
  refresh (it has git-write access). It records every data array's item count
  into a rolling **14-day baseline**, `scripts/source-baselines.json` (committed;
  stores only per-source `dailyMax` keyed by date, pruned to 14 days, so it
  doesn't churn). It exports `detectAnomalies()` / `readBaseline()` as a module.
- **`content-review.js`** requires that module and runs `checkSourceHealth` as
  its first check — so a collapsed source becomes a `High` finding and flows
  into the same issue + exception email. Alerting lives where the owner already
  looks; baseline-writing lives where there's commit access.
- **Thresholds:** 0 items when the 14-day max was ≥3 → `High`; current < 20% of
  a ≥15 baseline → `Medium`. `LEGAL_NOTICES` and `SMC_ALERTS` are excluded
  (legitimately sporadic). New sources auto-enroll once they first return data.
- **Shared loader:** both scripts evaluate the data files via
  `scripts/lib/load-data.js` (one copy of the eval-and-capture logic).

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

---

## Auto-fix (2026-08-09)

The review stays report-only. `scripts/content-autofix.js` +
`.github/workflows/content-autofix.yml` (**daily, 14:20 UTC** — ~80 min after
the 13:00 review, clear of the 15:00 digest jobs) act on its findings.

### Fixes are OVERRIDES, not data edits

Every array the review flags is re-scraped from scratch every six hours. Editing
a bad date in `js/gov-helpers.js` fixes nothing — the next refresh puts it back
and the finding returns forever. So fixes are rows in
**`data/content-corrections.json`**, which `content-refresh.js` re-applies after
each scrape (Task 21d, next to the source-trust and festival-anchor reconciles).

A row matches on array + normalized title + **the date the source currently
publishes**. That makes it self-retiring: when the source corrects itself the row
stops matching and does nothing. **Every row expires** (`expiresOn`, required,
pruned automatically) — a permanent override silently distorts data long after
the source fixed its mistake, and nobody remembers it exists.

Kinds: `event-date` (rewrite the date), `clear-link` (drop a dead href, **keep
the event**), `drop-event` (remove a phantom entry).

### Two tiers

| | What | Where it goes |
| --- | --- | --- |
| **AUTO** | a link 404/410-ing for **3 consecutive daily runs**; pruning expired corrections | committed to `main` |
| **PROPOSE** | which of two sources has an event's date right | a **pull request**, never auto-merged |

The split is by evidence, not by importance. A 404 seen three days running is
deterministic and the action is reversible — the event survives, only the href
goes. Which source has a date right cannot be derived; a wrong answer sends
residents somewhere on the wrong day, so it gets a human.

**It refuses to guess.** A date conflict is proposed only when the organizer's
own page states one of the candidate dates. Unfetchable, ambiguous, or a *third*
date → left for a human, and said so in the PR. An unfixed finding is a far
smaller failure than a confidently wrong one.

Blast-radius caps: `DEAD_LINK_RUNS` 3, `MAX_AUTO_FIXES` 10, `MAX_PROPOSALS` 8,
so a scraper breaking overnight can't become a mass edit.

### Review accuracy fixed at the same time

The fixer is only as good as the findings, so three false-positive classes were
corrected first — each of which it would otherwise have acted on:

- **5xx and transport errors are no longer "dead."** KOTO returned `504` on ten
  live event URLs in one run; every one loads in a browser. Only `404/410` is
  confirmed. Findings now carry `confirmed`, `verdict`, `url`, `array`.
- **A recurring series is not a date conflict.** If one array lists the event on
  more than one of the disputed dates, it's telling us it repeats — "Drop In Tech
  Time with Oliver" runs weekly and KOTO carries both the 9th and the 16th.
  Sources genuinely disagreeing each assert exactly one date.
- **Conflicts carry `claims`** (each date + the arrays asserting it + a link), so
  the fixer and a PR reviewer both see the evidence without re-deriving it.

Together these took a 57-finding report to 33, with the 8 "High" down to 4 real
ones.
