#!/usr/bin/env bash
# upload.sh — publish PDF(s) to the Livable Telluride site under
# newsletter/<topic>/ and print their public URLs. Fast: a --no-checkout
# worktree off origin/main (no 400-file checkout) + a direct push to main
# (no PR). Does NOT wait on the GitHub Pages build — the caller verifies links.
#
# Usage:
#   upload.sh <topic-slug> <src> [<src> ...]
#   upload.sh <topic-slug> "<src>::<clean-name.pdf>" ...   # explicit dest name
#
#   - <topic-slug>: folder under newsletter/ (lowercase-hyphen), e.g. lift-7
#   - <src>: absolute path to a .pdf. Bare path → name is auto-slugified.
#     Use SRC::DEST to set a clean/semantic filename (recommended).
#
# Env:
#   NEWSLETTER_REPO  override repo root (default: derived from this script)
#   DRY_RUN=1        do everything except the push (prints the planned commit)
set -euo pipefail

[ $# -ge 2 ] || { echo "usage: upload.sh <topic-slug> <src[::dest]> [...]" >&2; exit 2; }

TOPIC="$1"; shift
SITE="https://livabletelluride.org"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${NEWSLETTER_REPO:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# topic must be a clean slug
case "$TOPIC" in *[!a-z0-9-]*|"") echo "topic-slug must be lowercase letters/digits/hyphens: '$TOPIC'" >&2; exit 2;; esac

slugify() {
  local b; b="$(basename "$1")"; b="${b%.[Pp][Dd][Ff]}"
  printf '%s' "$b" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/\((final|draft|v[0-9]+)\)//g; s/[^a-z0-9]+/-/g; s/-+/-/g; s/^-//; s/-$//'
}

WT="$(mktemp -d)/nlpdf"
BR="newsletter-${TOPIC}-$$"
cleanup() { git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true; git -C "$REPO" branch -D "$BR" >/dev/null 2>&1 || true; git -C "$REPO" worktree prune >/dev/null 2>&1 || true; }
trap cleanup EXIT

git -C "$REPO" fetch -q origin main
git -C "$REPO" worktree add -q --no-checkout -b "$BR" "$WT" origin/main
DESTDIR="$WT/newsletter/$TOPIC"; mkdir -p "$DESTDIR"

URLS=(); N=0
for arg in "$@"; do
  if [[ "$arg" == *"::"* ]]; then SRC="${arg%%::*}"; DEST="${arg##*::}"; else SRC="$arg"; DEST="$(slugify "$arg").pdf"; fi
  [ -f "$SRC" ] || { echo "not found: $SRC" >&2; exit 1; }
  case "$DEST" in *[!a-z0-9.-]*) echo "dest name not URL-clean: '$DEST'" >&2; exit 2;; esac
  cp "$SRC" "$DESTDIR/$DEST"
  git -C "$WT" add -- "newsletter/$TOPIC/$DEST"
  URLS+=("$SITE/newsletter/$TOPIC/$DEST"); N=$((N+1))
done

git -C "$WT" commit -q -m "Add $N PDF(s) to newsletter/$TOPIC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

if [ "${DRY_RUN:-}" = "1" ]; then
  echo "DRY_RUN — would push these $N file(s) to origin/main:"
else
  if ! git -C "$WT" push -q origin "HEAD:main" 2>/dev/null; then
    # rare race: main advanced between fetch and push. Additive files never
    # conflict, so rebase onto the new tip and retry once.
    git -C "$REPO" fetch -q origin main
    git -C "$WT" rebase -q origin/main
    git -C "$WT" push -q origin "HEAD:main"
  fi
fi

echo "Published to newsletter/$TOPIC (live within ~1-2 min once Pages builds):"
printf '  %s\n' "${URLS[@]}"
