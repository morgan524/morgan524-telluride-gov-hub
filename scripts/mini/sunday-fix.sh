#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# Sunday follow-up on the always-on Mac mini (launchd, Sundays 6:15 AM MT).
#
# The 5:00 AM GitHub workflow (digest-sunday-review.yml) reviews and freezes
# the Monday digests and applies simple text fixes. This job then runs Claude
# Code headless (scripts/mini/sunday-fix-prompt.md) to fix the rest at the
# source, re-render once, mark each finding resolved in digest/review.json, and
# leave digest/review-followup.md for Morgan's afternoon review. It never sends
# email and never touches approval locks (enforced by the tool allow/deny lists
# below, not just the prompt).
#
# Installed by scripts/mini/install.sh. Logs: ~/Library/Logs/livabletelluride/.
# Manual run:  bash scripts/mini/sunday-fix.sh            (waits for today's review)
#              NO_WAIT=1 bash scripts/mini/sunday-fix.sh  (use whatever review exists)
# ════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
export PATH="$HOME/.local/bin:/opt/homebrew/opt/node@24/bin:/usr/local/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOG_DIR="$HOME/Library/Logs/livabletelluride"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/sunday-fix-$(date +%F).log"
exec >>"$LOG" 2>&1
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

TOKEN_FILE="$HOME/.config/livabletelluride/claude-oauth-token"
if [ -f "$TOKEN_FILE" ]; then export CLAUDE_CODE_OAUTH_TOKEN="$(cat "$TOKEN_FILE")"; fi
command -v claude >/dev/null || { log "FATAL: claude not on PATH"; exit 1; }
command -v gh >/dev/null     || { log "FATAL: gh not on PATH"; exit 1; }

cd "$REPO" || { log "FATAL: cannot cd $REPO"; exit 1; }
log "Starting. repo=$REPO"

sync_main() {
  git fetch -q origin main || return 1
  git checkout -q main 2>/dev/null || true
  git rebase -q --autostash origin/main || { git rebase --abort 2>/dev/null; return 1; }
}

# Wait (up to 3 hours) for TODAY's review: GitHub's scheduler often runs the
# 5:00 AM workflow late. "Today" is the review's UTC date.
TODAY_UTC="$(date -u +%F)"
for i in $(seq 1 36); do
  sync_main || { log "FATAL: could not sync main"; exit 1; }
  REVIEWED="$(node -e "try{console.log(require('./digest/review.json').reviewedAt.slice(0,10))}catch(e){console.log('')}")"
  if [ "$REVIEWED" = "$TODAY_UTC" ] && [ -f digest/freeze.json ]; then break; fi
  if [ -n "${NO_WAIT:-}" ]; then log "NO_WAIT: using review from ${REVIEWED:-none}"; break; fi
  [ "$i" = 36 ] && { log "Today's review never appeared (last: ${REVIEWED:-none}) — giving up"; exit 1; }
  log "waiting for today's review (have ${REVIEWED:-none}); retry in 5 min"; sleep 300
done

OPEN="$(node -e "const r=require('./digest/review.json');console.log((r.digests||[]).reduce((n,d)=>n+d.issues.filter(x=>!x.fixed&&!x.resolved).length,0))")"
log "open review items: $OPEN"
if [ "$OPEN" = "0" ]; then
  printf '# Review follow-up: %s\n\nNothing left for you to check this week.\n' "$(date +%F)" > digest/review-followup.md
  git add digest/review-followup.md && git -c user.name="Livable Telluride Mini" -c user.email="bot@livabletelluride.org" \
    commit -q -m "Sunday follow-up $(date +%F): nothing left to check" && git push -q
  log "Nothing to do."; exit 0
fi

ALLOWED=(
  Read Edit Write Glob Grep WebFetch
  "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)"
  "Bash(git add:*)" "Bash(git commit:*)" "Bash(git pull:*)" "Bash(git push:*)" "Bash(git fetch:*)"
  "Bash(node:*)" "Bash(npm test:*)" "Bash(cd:*)" "Bash(curl -s:*)" "Bash(grep:*)" "Bash(sed -n:*)"
  "Bash(sleep:*)" "Bash(date:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(head:*)" "Bash(tail:*)"
  "Bash(gh workflow run digest-sunday-review.yml:*)" "Bash(gh run list:*)" "Bash(gh run view:*)" "Bash(gh run watch:*)"
)
DENIED=(
  "Bash(gh workflow run digest-scheduled-send.yml:*)" "Bash(gh workflow run one-off-broadcast.yml:*)"
  "Bash(git push --force:*)" "Bash(git push -f:*)" "Bash(git reset:*)" "Bash(rm:*)"
  "Edit(digest/*.lock.json)" "Write(digest/*.lock.json)" "Edit(digest/freeze.json)" "Write(digest/freeze.json)"
)

log "running Claude Code"
claude -p "$(cat "$SCRIPT_DIR/sunday-fix-prompt.md")" \
  --permission-mode acceptEdits \
  --allowedTools "${ALLOWED[@]}" \
  --disallowedTools "${DENIED[@]}" \
  --max-turns 120 \
  --output-format text
STATUS=$?
log "Claude Code exited $STATUS"

# Belt and braces: never leave local edits behind (the next run's sync would
# stash them), and confirm no lock was touched.
if git status --porcelain | grep -q 'digest/.*\.lock\.json'; then log "WARNING: a lock file changed locally — restoring"; git checkout -- digest/*.lock.json 2>/dev/null; fi
exit $STATUS
