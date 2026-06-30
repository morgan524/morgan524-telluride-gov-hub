# Semi-automated vote-tracker entry extraction

Three pieces:

1. **`scripts/extract-votes.mjs`** — pulls votes out of meeting minutes
   via the Claude API, writes JSON to `scripts/pending/`.
2. **`scripts/diff-votes.mjs`** — calibration utility. Diffs a pending
   JSON against entries already committed in `v2/vote-tracker.html` so
   you can measure model accuracy on known-good meetings.
3. **`scripts/vote-tracker-config.json`** — per-entity rosters with
   date ranges, URL templates, and ID-prefix conventions.

## Quick start

```bash
# 1. Put your API key in the shell (the GitHub Actions secret name is
#    ANTHROPIC_API_KEY; same value works locally).
export ANTHROPIC_API_KEY=sk-ant-...

# 2. Sanity check: dry-run (no API call, no spend) — confirms the PDF
#    extracts cleanly and the prompt is well-formed.
node scripts/extract-votes.mjs \
  --pdf ~/Downloads/Minutes/2024/may_16-_2024_town_council_meeting_minutes.pdf \
  --entity tomv \
  --date 2024-05-16 \
  --dry-run

# 3. Real run — produces scripts/pending/tomv-2024-05-16.json.
node scripts/extract-votes.mjs \
  --pdf ~/Downloads/Minutes/2024/may_16-_2024_town_council_meeting_minutes.pdf \
  --entity tomv \
  --date 2024-05-16 \
  --asset-id 40000

# 4. Review the JSON before trusting it.
$EDITOR scripts/pending/tomv-2024-05-16.json
```

## Calibration: diff a pending JSON against committed ground truth

Once you've committed entries for a meeting by hand (like the Mar 21,
2024 TOMV batch), you can re-extract that same meeting and diff:

```bash
node scripts/extract-votes.mjs \
  --text /tmp/mv2024-march_21-_2024_town_council_meeting_minutes.txt \
  --entity tomv \
  --date 2024-03-21

node scripts/diff-votes.mjs \
  --pending scripts/pending/tomv-2024-03-21.json
```

The diff reports per-entry, per-field disagreements: outcome, tally,
title, and every member's vote. Use this to:

- **Calibrate** before trusting the script on unknown meetings.
- **Spot regressions** after tweaking the system prompt.
- **Discover model failure patterns** (e.g. mis-handling tabled motions,
  collapsing abstentions into "No", missing consent-agenda items).

## What the validator catches automatically

`extract-votes.mjs` runs deterministic checks before writing the JSON:

- Every roster member appears in every vote's `votes` object
- No unknown member ids in `votes`
- Tally arithmetic matches yes/no/abstain counts
- `outcome` ∈ {Passed, Failed, Tabled, Continued}
- `id` follows convention and is unique within the batch
- Descriptions don't start with procedural "On a MOTION by..." prose

Errors block the exit (code 1); warnings are advisory. The JSON is
written either way so you can inspect.

## What it does NOT do

- **No automatic insertion** into `v2/vote-tracker.html`. Human review
  step is non-optional. Insertion script is a separate (not-yet-built)
  tool.
- **No PDF download.** TOMV PDFs are gated by Cloudflare. Download
  manually via browser, then point `--pdf` at the local file.
- **No OCR for scanned PDFs.** If pdfjs returns <500 chars the script
  bails. For scans, use `pdftoppm -r 150 -png` and feed the resulting
  images to a vision model separately, OR use a separate OCR tool to
  produce a `.txt` and pass with `--text`.

## Cost expectations

- Sonnet ~$3/MTok input + $15/MTok output
- A typical TOMV meeting: ~50KB minutes text ≈ 12K input tokens, ~2K
  output tokens → roughly $0.07 per meeting
- The 13 remaining 2024 meetings ≈ $1 total
- A full multi-entity backfill (300 meetings) ≈ $20–30

## Entity config (`scripts/vote-tracker-config.json`)

Each entity declares its rosters as a list of date-ranged windows:

```json
{
  "tomv": {
    "label": "Mountain Village Town Council",
    "meetingPrefix": "Mountain Village Town Council",
    "idPrefix": "mv",
    "rosters": [
      { "start": "2024-01-01", "end": "2025-07-16",
        "members": ["prohaska","pearson","magid","mogenson","duprey","gomez","gilbride"] },
      { "start": "2025-07-17", "end": "2026-01-27",
        "members": ["prohaska","pearson","magid","mogenson","duprey","gomez","arguelles"] }
    ]
  }
}
```

When you add a new entity (e.g. Town of Telluride Council, school
board), grep the corresponding `*_ALL_MEMBERS` array in
`v2/vote-tracker.html` for the canonical member ids, then add a
rosters[] window covering the date range you want to backfill.

The BOCC and PC stubs in the file are placeholders — fill them before
relying on the script for those entities.
