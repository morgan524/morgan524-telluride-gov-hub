#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# Local runner for the meeting-recaps pipeline (intended for a Mac
# launchd job — see ~/Library/LaunchAgents/com.livabletelluride.meeting-recaps.plist).
#
# WHY LOCAL, NOT GITHUB ACTIONS: YouTube blocks caption/transcript downloads
# from GitHub runner datacenter IPs (verified — runs succeed but get 0-char
# transcripts). A residential IP (this Mac) works. So recaps run here.
#
# Does: pull main → generate recaps (yt-dlp + Claude) → commit + push, if any.
# Idempotent and safe to run daily; a no-op when there are no new meetings.
# ════════════════════════════════════════════════════════════════════
set -uo pipefail

# Resolve the repo from this script's location (portable — no hardcoded home).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

# launchd gives a minimal PATH; add node, git, gh (credential helper), and the
# pip --user bin where yt-dlp lives (computed so a python version bump is fine).
YTDLP_BIN="$(python3 -m site --user-base 2>/dev/null)/bin"
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${YTDLP_BIN}:${PATH:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [ ! -f "$HOME/.anthropic_key" ]; then log "FATAL: ~/.anthropic_key missing"; exit 1; fi
export ANTHROPIC_API_KEY="$(cat "$HOME/.anthropic_key")"

command -v yt-dlp >/dev/null 2>&1 || { log "FATAL: yt-dlp not on PATH ($YTDLP_BIN)"; exit 1; }
command -v node   >/dev/null 2>&1 || { log "FATAL: node not on PATH"; exit 1; }

cd "$REPO" || { log "FATAL: cannot cd $REPO"; exit 1; }

log "Starting. repo=$REPO"

# Discard any leftover uncommitted recap edits (regenerable) so the pull is clean.
git checkout -- js/gov-helpers.js 2>/dev/null || true
if ! git pull --ff-only origin main; then log "FATAL: git pull --ff-only failed"; exit 1; fi

if ! node scripts/meeting-recaps.js; then log "recap script exited non-zero"; exit 1; fi

# Vote tracker: meeting-recaps.js drops per-meeting drafts in scripts/pending/.
# Insert them straight into v2/vote-tracker.html — Morgan asked for this to run
# unattended (2026-07-23). insert-votes.mjs is the safety net: it skips any
# date already committed and skips meetings with 0 entries, and draftVotes only
# writes votes for ids on that date's roster, so a bad parse drops out rather
# than publishing garbage.
for pf in scripts/pending/*.json; do
  [ -e "$pf" ] || continue
  ent=$(basename "$pf" | sed 's/-[0-9][0-9-]*\.json$//')
  yr=$(basename "$pf" | sed 's/^.*-\([0-9]\{4\}\)-[0-9]\{2\}-[0-9]\{2\}\.json$/\1/')
  log "inserting votes: entity=$ent year=$yr ($(basename "$pf"))"
  node scripts/insert-votes.mjs --entity "$ent" --year "$yr" || log "insert-votes failed for $pf (continuing)"
done

if [ -z "$(git status --porcelain js/gov-helpers.js v2/vote-tracker.html scripts/pending)" ]; then
  log "No new recaps or votes — nothing to commit."
  exit 0
fi

git add js/gov-helpers.js v2/vote-tracker.html scripts/pending
git -c user.name="Gov Hub Bot" -c user.email="bot@livabletelluride.org" \
  commit -m "📝 Auto meeting recaps + vote tracker $(date +%F)" || { log "commit failed"; exit 1; }

# The content bot pushes to main on its own schedule; rebase our single
# MEETING_RECAPS change on top (conflict-free since nothing else writes it).
if ! git pull --rebase origin main; then
  log "rebase failed — aborting and bailing"; git rebase --abort 2>/dev/null || true; exit 1;
fi
if ! git push origin main; then log "push failed"; exit 1; fi

log "Pushed new recaps + vote-tracker updates."
