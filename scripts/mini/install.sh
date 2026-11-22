#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# One-time setup of Livable Telluride's always-on Mac mini.
#
#   bash scripts/mini/install.sh                # Sunday follow-up job only
#   bash scripts/mini/install.sh --with-recaps  # + the daily meeting-recaps job
#
# Installs launchd jobs that run as this macOS user (so the Mini should log in
# automatically after a restart):
#   org.livabletelluride.sunday-fix    Sundays 6:15 AM  scripts/mini/sunday-fix.sh
#   com.livabletelluride.meeting-recaps daily 9:30 AM   scripts/run-meeting-recaps-local.sh
# Safe to re-run; it replaces the jobs in place.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/livabletelluride"
CONF="$HOME/.config/livabletelluride"
WITH_RECAPS=0; [ "${1:-}" = "--with-recaps" ] && WITH_RECAPS=1
export PATH="$HOME/.local/bin:/opt/homebrew/opt/node@24/bin:/usr/local/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }

say "Checking this Mac"
case "$REPO" in *Dropbox*|*"Mobile Documents"*) echo "  ✗ The repo is inside a synced folder ($REPO). Clone it to ~/lt instead."; exit 1;; esac
ok "repo: $REPO"
for c in git gh node claude; do command -v "$c" >/dev/null && ok "$c: $(command -v "$c")" || { echo "  ✗ $c is not installed"; exit 1; }; done
node -e 'process.exit(+process.versions.node.split(".")[0] >= 24 ? 0 : 1)' && ok "node $(node --version)" || warn "node $(node --version) — 24 is recommended"
gh auth status >/dev/null 2>&1 && ok "GitHub signed in" || { echo "  ✗ run: gh auth login"; exit 1; }
TZ_NOW="$(readlink /etc/localtime | sed 's|.*zoneinfo/||')"
if [ "$TZ_NOW" = "America/Denver" ]; then ok "time zone America/Denver"; else
  warn "time zone is $TZ_NOW — the schedules use the Mac's clock. Fix with:"
  echo "      sudo systemsetup -settimezone America/Denver"
fi
[ -d "$REPO/scripts/node_modules" ] || (cd "$REPO/scripts" && npm ci --no-audit --no-fund)
ok "script dependencies installed"

say "Claude sign-in for unattended runs"
mkdir -p "$CONF" "$LOGS" "$AGENTS"; chmod 700 "$CONF"
if [ -s "$CONF/claude-oauth-token" ]; then ok "token already saved ($CONF/claude-oauth-token)"; else
  echo "  In ANOTHER Terminal window run:   claude setup-token"
  echo "  Sign in when asked, then copy the long token it prints (starts with sk-ant-)."
  read -r -s -p "  Paste the token here and press Return: " TOK; echo
  [ -n "$TOK" ] || { echo "  ✗ no token entered"; exit 1; }
  umask 077; printf '%s' "$TOK" > "$CONF/claude-oauth-token"; chmod 600 "$CONF/claude-oauth-token"
  ok "token saved"
fi

write_agent() {  # label script hour minute weekday(-1 = every day) logname
  local label="$1" script="$2" hour="$3" minute="$4" weekday="$5" logname="$6" wd=""
  [ "$weekday" -ge 0 ] && wd="    <key>Weekday</key><integer>$weekday</integer>"
  cat > "$AGENTS/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$script</string></array>
  <key>StartCalendarInterval</key>
  <dict>
$wd
    <key>Hour</key><integer>$hour</integer>
    <key>Minute</key><integer>$minute</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOGS/$logname</string>
  <key>StandardErrorPath</key><string>$LOGS/$logname</string>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$label.plist"
  ok "$label installed"
}

say "Installing scheduled jobs"
chmod +x "$SCRIPT_DIR/sunday-fix.sh"
write_agent org.livabletelluride.sunday-fix "$SCRIPT_DIR/sunday-fix.sh" 6 15 0 sunday-fix-launchd.log

if [ "$WITH_RECAPS" = 1 ]; then
  say "Meeting recaps (YouTube transcripts need a home internet connection, not GitHub's)"
  if [ ! -s "$HOME/.anthropic_key" ]; then
    read -r -s -p "  Paste the Anthropic API key used for recaps (sk-ant-api…): " KEY; echo
    umask 077; printf '%s' "$KEY" > "$HOME/.anthropic_key"; chmod 600 "$HOME/.anthropic_key"
  fi
  ok "~/.anthropic_key present"
  command -v yt-dlp >/dev/null || brew install yt-dlp
  ok "yt-dlp $(yt-dlp --version)"
  (cd "$REPO/scripts" && npx --yes playwright install chromium >/dev/null) && ok "playwright chromium installed"
  write_agent com.livabletelluride.meeting-recaps "$REPO/scripts/run-meeting-recaps-local.sh" 9 30 -1 meeting-recaps.log
  warn "Turn the recaps job OFF on your other Mac so it doesn't run twice."
fi

say "Done"
echo "  Logs:      $LOGS"
echo "  Test now:  NO_WAIT=1 bash $SCRIPT_DIR/sunday-fix.sh && tail -40 $LOGS/sunday-fix-\$(date +%F).log"
echo "  Keep the Mini awake:  sudo pmset -a sleep 0 disksleep 0 autorestart 1 womp 1"
