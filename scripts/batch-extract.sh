#!/usr/bin/env bash
# batch-extract.sh — run extract-votes.mjs on a list of meetings with
# pacing that respects the 10K-tokens-per-minute rate limit. Skips any
# meeting whose pending/<entity>-<date>.json already exists, so you can
# re-run after a partial failure without redoing finished work.
#
# Usage:
#   ./scripts/batch-extract.sh
#
# Edit the MEETINGS array below to change the batch. Default = 13
# remaining 2024 TOMV meetings (7 PDFs + 6 scanned-as-text).
#
# Pacing: 75s between calls. A typical meeting consumes 12-16K input
# tokens; the org's 10K/min bucket needs ~60s to refill, plus a buffer.

set -u
cd "$(dirname "$0")/.."

SLEEP_SEC=${SLEEP_SEC:-75}
PENDING_DIR=scripts/pending

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY not set in environment"
  exit 1
fi

mkdir -p "$PENDING_DIR"

# Format: date | source-flag | path
MEETINGS=(
  "2024-04-04 | --pdf  | $HOME/Downloads/Minutes/2024/april_4-_2024_special_town_council_meeting_minutes.pdf"
  "2024-05-16 | --pdf  | $HOME/Downloads/Minutes/2024/may_16-_2024_town_council_meeting_minutes.pdf"
  "2024-06-12 | --text | /tmp/mv2024-june_12-_2024_special_town_council_meeting_minutes.txt"
  "2024-06-20 | --text | /tmp/mv2024-june_20-_2024_town_council_meeting_minutes.txt"
  "2024-07-09 | --pdf  | $HOME/Downloads/Minutes/2024/july_9-_2024_special_joint_town_council_meeting_minutes.pdf"
  "2024-07-18 | --pdf  | $HOME/Downloads/Minutes/2024/july_18-_2024_town_council_meeting_minutes.pdf"
  "2024-08-15 | --text | /tmp/mv2024-august_15-_2024_town_council_meeting_minutes.txt"
  "2024-09-19 | --pdf  | $HOME/Downloads/Minutes/2024/september_19-_2024_town_council_meeting_minutes.pdf"
  "2024-10-09 | --pdf  | $HOME/Downloads/Minutes/2024/october_9-_2024_town_council_special_meeting_minutes.pdf"
  "2024-10-17 | --pdf  | $HOME/Downloads/Minutes/2024/october_17-_2024_town_council_meeting_minutes.pdf"
  "2024-11-04 | --text | /tmp/mv2024-november_4-_2024_special_town_council_meeting_minutes.txt"
  "2024-11-21 | --text | /tmp/mv2024-november_21-_2024_town_council_meeting_minutes-1.txt"
  "2024-12-12 | --text | /tmp/mv2024-december_12-_2024_town_council_meeting_minutes.txt"
)

ENTITY=tomv
TOTAL=${#MEETINGS[@]}
DID=0
SKIPPED=0
FAILED=0
FIRST=1

echo "Batch: $TOTAL meetings, entity=$ENTITY, pacing=${SLEEP_SEC}s between calls"
echo ""

for meeting in "${MEETINGS[@]}"; do
  IFS='|' read -r date flag path <<< "$meeting"
  date=$(echo "$date" | xargs)
  flag=$(echo "$flag" | xargs)
  path=$(echo "$path" | xargs)
  outfile="$PENDING_DIR/$ENTITY-$date.json"

  if [[ -f "$outfile" ]]; then
    echo "── [$date] SKIP — already extracted ($outfile)"
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  if [[ ! -f "$path" ]]; then
    echo "── [$date] SKIP — source missing: $path"
    FAILED=$((FAILED+1))
    continue
  fi

  # Skip empty .txt files (the stale-OCR problem)
  if [[ "$flag" == "--text" ]]; then
    size=$(wc -c < "$path" | tr -d ' ')
    if (( size < 500 )); then
      echo "── [$date] SKIP — text file is ${size} bytes (needs OCR)"
      FAILED=$((FAILED+1))
      continue
    fi
  fi

  # Pace: skip sleep before the very first call
  if [[ $FIRST -eq 0 ]]; then
    echo "── [$date] waiting ${SLEEP_SEC}s for rate-limit window..."
    sleep "$SLEEP_SEC"
  fi
  FIRST=0

  echo "── [$date] extracting ($flag $(basename "$path"))..."
  if node scripts/extract-votes.mjs "$flag" "$path" --entity "$ENTITY" --date "$date"; then
    DID=$((DID+1))
  else
    FAILED=$((FAILED+1))
    echo "── [$date] FAILED — re-run the script to retry just this one"
  fi
  echo ""
done

echo ""
echo "Batch summary:"
echo "  Extracted: $DID"
echo "  Skipped:   $SKIPPED  (already done or unreachable source)"
echo "  Failed:    $FAILED"
echo ""
echo "Pending JSONs:"
ls -1 "$PENDING_DIR"/$ENTITY-2024-*.json 2>/dev/null | sed 's/^/  /'
