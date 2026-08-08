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

# The content bot pushes to main ~8x/day, so this checkout is routinely behind
# and occasionally holds a local commit whose push lost a race. --ff-only then
# fails FOREVER, and the job wedges: on 2026-08-07 it had been re-drafting (and
# re-paying for) the same three transcripts every morning for ten days without
# ever landing them. So: try to fast-forward, and if we're carrying local
# commits, rebase them onto origin/main instead of giving up.
git fetch origin main || { log "FATAL: git fetch failed"; exit 1; }
if ! git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
  log "local commits present — rebasing onto origin/main"
  if ! git rebase origin/main; then
    git rebase --abort 2>/dev/null || true
    log "FATAL: rebase onto origin/main failed — needs a human"; exit 1
  fi
elif ! git merge --ff-only origin/main; then
  log "FATAL: fast-forward to origin/main failed"; exit 1
fi

# meeting-recaps.js needs playwright (Mountain Village's portal is a Blazor app
# that only renders in a browser). A checkout without scripts/node_modules threw
# MODULE_NOT_FOUND mid-run on 2026-08-06 and took the whole job down with it.
if [ ! -d scripts/node_modules ]; then
  log "scripts/node_modules missing — installing"
  (cd scripts && npm install --no-audit --no-fund) || log "npm install failed (continuing; per-source failures are now isolated)"
fi

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

if [ -z "$(git status --porcelain js/gov-helpers.js v2/vote-tracker.html data/)" ]; then
  log "No new recaps or votes — nothing to commit."
  exit 0
fi

# NOTE: scripts/pending/ is gitignored — it is an intermediate artifact.
# `git add`ing it fails the whole step, so only the published files go in.
#
# data/ is included because meeting-recaps.js now re-mirrors MEETING_RECAPS to
# data/meeting-recaps.json — the rebuilt pages read the mirror, not the JS
# const, so committing gov-helpers.js alone would leave the recap invisible.
git add js/gov-helpers.js v2/vote-tracker.html data/
git -c user.name="Gov Hub Bot" -c user.email="bot@livabletelluride.org" \
  commit -m "📝 Auto meeting recaps + vote tracker $(date +%F)" || { log "commit failed"; exit 1; }

# The content bot pushes to main on its own schedule; rebase our single
# MEETING_RECAPS change on top (conflict-free since nothing else writes it).
if ! git pull --rebase origin main; then
  log "rebase failed — aborting and bailing"; git rebase --abort 2>/dev/null || true; exit 1;
fi
if ! git push origin main; then log "push failed"; exit 1; fi

log "Pushed new recaps + vote-tracker updates."
