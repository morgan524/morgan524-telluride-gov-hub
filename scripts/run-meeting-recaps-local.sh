#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# Local runner for the meeting-recaps pipeline (intended for a Mac
# launchd job — see ~/Library/LaunchAgents/com.livabletelluride.meeting-recaps.plist).
#
# WHY LOCAL, NOT GITHUB ACTIONS: YouTube blocks caption/transcript downloads
# from GitHub runner datacenter IPs (verified — runs succeed but get 0-char
# transcripts). A residential IP (this Mac) works. So recaps run here.
#
# Does: pull main → generate recaps (yt-dlp + Claude) → EMAIL each for approval
# via the editorial Worker (--approval). Nothing is published here; an approved
# recap is written to MEETING_RECAPS by the Recap Publish workflow (cloud).
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

# Editorial secret — authenticates this job to the Worker for the email-approval
# flow (handled like the API key: a small file in $HOME, never in the repo).
if [ ! -f "$HOME/.editorial_secret" ]; then log "FATAL: ~/.editorial_secret missing"; exit 1; fi
export EDITORIAL_SECRET="$(cat "$HOME/.editorial_secret")"

# Pull so dedup sees the latest published recaps. We don't commit here — drafting
# only emails for approval; publishing is the cloud Recap Publish workflow's job.
git checkout -- js/gov-helpers.js 2>/dev/null || true
git pull --ff-only origin main 2>/dev/null || log "pull failed (continuing; dedup may be slightly stale)"

if ! node scripts/meeting-recaps.js --approval; then log "recap script exited non-zero"; exit 1; fi
log "Done — new recaps (if any) were emailed for approval."
