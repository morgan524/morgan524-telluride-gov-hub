#!/bin/bash
# Health check for the always-on Mac mini: is everything the Livable Telluride
# automations need actually in place? Read-only; prints ✓ / ✗ per item and
# never prints a key or token.   bash ~/lt/scripts/mini/check.sh
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="$HOME/.local/bin:/opt/homebrew/opt/node@24/bin:/usr/local/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$(python3 -m site --user-base 2>/dev/null)/bin"
pass=0; fail=0
ok()  { printf '  ✓ %s\n' "$*"; pass=$((pass+1)); }
bad() { printf '  ✗ %s\n' "$*"; fail=$((fail+1)); }
chk() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1${3:+ — $3}"; fi; }

echo "Mac:"
TZ_NOW="$(readlink /etc/localtime | sed 's|.*zoneinfo/||')"
[ "$TZ_NOW" = "America/Denver" ] && ok "time zone America/Denver" || bad "time zone is $TZ_NOW — sudo systemsetup -settimezone America/Denver"
[ "$(pmset -g | awk '$1=="sleep"{print $2}')" = "0" ] && ok "never sleeps" || bad "sleep is on — sudo pmset -a sleep 0"
pmset -g | grep -q 'autorestart.*1' && ok "restarts after power failure" || bad "autorestart off — sudo pmset -a autorestart 1"
[ "$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)" = "$(id -un)" ] && ok "logs in automatically as $(id -un) (jobs resume after a restart)" || bad "automatic login is off — jobs won't run after a restart until someone logs in (System Settings → Users & Groups)"

echo "Tools:"
for c in git gh node npm claude python3; do chk "$c" "command -v $c" "not installed"; done
chk "node 24+" "node -e 'process.exit(+process.versions.node.split(\".\")[0]>=24?0:1)'"
chk "GitHub signed in" "gh auth status"
chk "git can push to the repo" "cd '$REPO' && git ls-remote --exit-code origin main"
chk "yt-dlp (meeting recaps)" "command -v yt-dlp" "brew install yt-dlp"
chk "playwright chromium (Mountain Village portal)" "ls ~/Library/Caches/ms-playwright | grep -q chromium" "cd ~/lt/scripts && npx playwright install chromium"

echo "Repo:"
case "$REPO" in *Dropbox*|*"Mobile Documents"*) bad "repo is in a synced folder: $REPO";; *) ok "repo at $REPO (not synced)";; esac
chk "on main and up to date" "cd '$REPO' && git fetch -q origin main && [ \"\$(git rev-parse HEAD)\" = \"\$(git rev-parse origin/main)\" ]" "cd $REPO && git pull"
chk "script dependencies installed" "[ -d '$REPO/scripts/node_modules' ]" "cd $REPO/scripts && npm ci"

echo "Keys (checked, never shown):"
if [ -s "$HOME/.anthropic_key" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' https://api.anthropic.com/v1/models -H "x-api-key: $(tr -d '\n' < "$HOME/.anthropic_key")" -H "anthropic-version: 2023-06-01")
  [ "$code" = "200" ] && ok "~/.anthropic_key works (meeting recaps)" || bad "~/.anthropic_key rejected (HTTP $code)"
else bad "~/.anthropic_key missing (meeting recaps)"; fi
[ "$(stat -f %Lp "$HOME/.anthropic_key" 2>/dev/null)" = "600" ] && ok "~/.anthropic_key readable only by you" || bad "chmod 600 ~/.anthropic_key"
TOK="$HOME/.config/livabletelluride/claude-oauth-token"
if [ -s "$TOK" ]; then
  out=$(CLAUDE_CODE_OAUTH_TOKEN="$(cat "$TOK")" claude -p "Reply with just OK" --max-turns 1 2>&1 | tail -1)
  echo "$out" | grep -qi ok && ok "Claude Code token works (Sunday follow-up)" || bad "Claude Code token didn't work: run claude setup-token, then re-run install.sh"
else bad "Claude Code token missing — run: bash $REPO/scripts/mini/install.sh"; fi

echo "Scheduled jobs:"
for j in org.livabletelluride.sunday-fix com.livabletelluride.meeting-recaps; do
  if launchctl print "gui/$(id -u)/$j" >/dev/null 2>&1; then
    prog=$(launchctl print "gui/$(id -u)/$j" | awk '/arguments = \{/{f=1;next} f&&/\}/{f=0} f{print $1}' | tail -1)
    [ -f "$prog" ] && ok "$j loaded → $prog" || bad "$j loaded but its script is missing ($prog)"
  else bad "$j not loaded — bash $REPO/scripts/mini/install.sh --with-recaps"; fi
done
L="$HOME/Library/Logs/livabletelluride"
[ -f "$L/meeting-recaps.log" ] && echo "    last recaps log line: $(tail -1 "$L/meeting-recaps.log" | cut -c1-120)"
ls "$L"/sunday-fix-*.log >/dev/null 2>&1 && echo "    last Sunday follow-up: $(ls -t "$L"/sunday-fix-*.log | head -1 | xargs basename) — $(tail -1 "$(ls -t "$L"/sunday-fix-*.log | head -1)" | cut -c1-100)"

echo
echo "$pass passed, $fail need attention."
