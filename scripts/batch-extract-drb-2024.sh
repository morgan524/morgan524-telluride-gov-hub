#!/usr/bin/env bash
# batch-extract-drb-2024.sh — run extract-votes.mjs on the 13 MV Design
# Review Board meetings for 2024. Mirrors batch-extract.sh; skips any
# meeting whose pending/<entity>-<date>.json already exists.
#
# Usage:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   ./scripts/batch-extract-drb-2024.sh

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
BASE="$HOME/Downloads/MV Planning/2024"
MEETINGS=(
  "2024-01-04 | --pdf | $BASE/january_4-_2024_design_review_board_meeting_minutes-1.pdf"
  "2024-02-01 | --pdf | $BASE/february_1-_2024_design_review_board_meeting_minutes.pdf"
  "2024-03-07 | --pdf | $BASE/march_7-_2024_design_review_board_meeting_minutes.pdf"
  "2024-04-04 | --pdf | $BASE/april_4-_2024_design_review_board_meeting_minutes.pdf"
  "2024-05-02 | --pdf | $BASE/may_2-_2024_design_review_board_meeting_minutes.pdf"
  "2024-05-23 | --pdf | $BASE/may_23-_2024_special_design_review_board_meeting_minutes.pdf"
  "2024-06-06 | --pdf | $BASE/june_6-_2024_design_review_board_meeting_minutes.pdf"
  "2024-07-11 | --pdf | $BASE/july_11-_2024_design_review_board_minutes.pdf"
  "2024-08-01 | --pdf | $BASE/august_1-_2024_design_review_board_meeting_minutes.pdf"
  "2024-09-05 | --pdf | $BASE/september_5-_2024_design_review_board_meeting_minutes.pdf"
  "2024-10-03 | --pdf | $BASE/october_3-_2024_design_review_board_meeting_minutes.pdf"
  "2024-11-07 | --pdf | $BASE/november_7-_2024_design_review_board_meeting_minutes.pdf"
  "2024-12-05 | --pdf | $BASE/december_5-_2024_design_review_board_meeting_minutes.pdf"
)

ENTITY=drb
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
