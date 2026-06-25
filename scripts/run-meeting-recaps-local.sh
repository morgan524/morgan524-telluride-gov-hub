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

if [ -z "$(git status --porcelain js/gov-helpers.js)" ]; then
  log "No new recaps — nothing to commit."
  exit 0
fi

git add js/gov-helpers.js
git -c user.name="Gov Hub Bot" -c user.email="bot@livabletelluride.org" \
  commit -m "📝 Auto meeting recaps $(date +%F)" || { log "commit failed"; exit 1; }

# The content bot pushes to main on its own schedule; rebase our single
# MEETING_RECAPS change on top (conflict-free since nothing else writes it).
if ! git pull --rebase origin main; then
  log "rebase failed — aborting and bailing"; git rebase --abort 2>/dev/null || true; exit 1;
fi
if ! git push origin main; then log "push failed"; exit 1; fi

log "Pushed new recaps."
