# Parity harness

`scripts/parity/capture.js` — the safety mechanism the overhaul's strangler
method depends on. It snapshots the site's key outputs so a refactor can be
**proven** behavior-preserving instead of hoped to be.

## Use it around any risky change

```sh
# 1. Baseline BEFORE the change (on the current code)
node scripts/parity/capture.js /tmp/parity-before

# 2. Make the change (refactor a getter, migrate an array to JSON, extract a
#    shared helper, apply the deferred getMeetingSummary/AI_SUMMARIES fix, …)

# 3. Snapshot AFTER
node scripts/parity/capture.js /tmp/parity-after

# 4. The diff IS the effect of your change — nothing else.
diff -ru /tmp/parity-before /tmp/parity-after
```

- **Empty diff** → the change is provably behavior-preserving. Ship it.
- **Non-empty diff** → read it. Every line is something your change did. If it's
  all intended, ship; if anything is a surprise, you found a regression before it
  went live.

Optional args: `capture.js <out-dir> [weekStart] [label]` (default week
`2026-07-06`).

## What it captures

| File | What |
|------|------|
| `digest-weekly.html` / `digest-weekend.html` | the full rendered emails (end-to-end, via the real `weekly-email.js`) |
| `getCountyCachedMeetings.json` | normalized county meeting list (title, date, category, hasAgenda, agendaLink, description length) |
| `getTellurideMeetings.json` | same, for the Telluride source |
| `getMeetingSummary.json` | the resolved summary per county meeting (length + first 80 chars) |
| `resolveEventImage.json` | the image each Music on the Green concert resolves to |

More getters can be added to `capture.js` as later phases touch them.

## Determinism (important)

- The **digest render is deterministic** given the data files + `weekStart` — the
  same inputs always produce byte-identical HTML (verified: two back-to-back
  no-change captures diff empty).
- A few **data-layer getters filter by "today"** (e.g. county "future meetings
  only"). So run BEFORE and AFTER **close in time** (minutes, not days) — a real
  date rollover between the two runs is a legitimate difference, not a regression.
- Reads only local files. No network, no secrets — `MAILCHIMP_API_KEY` is cleared
  so the "What We're Reading" auto-source falls back deterministically.

## CI guard

`scripts/test/parity.test.js` runs the whole capture on every CI run (it does not
assert exact output — that rots daily as the bot rewrites the data). It fails the
build if the pipeline is broken: the digest won't render, a data file won't
evaluate, or a getter throws. That turns a class of silent breakage into a red
build.
