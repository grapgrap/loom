#!/usr/bin/env bash
# Install loom Agent Skills for OpenAI Codex CLI.
#
# Creates symlinks under $HOME/.agents/skills/loom-* (or $CODEX_SKILLS_DIR)
# pointing to this repository's skills/. Re-run to update after `git pull`.
#
# Usage:
#   bash scripts/install-codex.sh            # install/update
#   bash scripts/install-codex.sh --remove   # remove symlinks
#
# Environment:
#   CODEX_SKILLS_DIR  Override target dir (default: $HOME/.agents/skills)

set -euo pipefail

LOOM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${CODEX_SKILLS_DIR:-$HOME/.agents/skills}"
SKILLS=(shape plan task review calibrate)

if [[ "${1:-}" == "--remove" ]]; then
  for skill in "${SKILLS[@]}"; do
    dst="$TARGET/loom-$skill"
    if [[ -L "$dst" ]]; then
      rm "$dst"
      echo "removed $dst"
    fi
  done
  exit 0
fi

mkdir -p "$TARGET"

for skill in "${SKILLS[@]}"; do
  src="$LOOM_DIR/skills/$skill"
  dst="$TARGET/loom-$skill"
  if [[ ! -d "$src" ]]; then
    echo "warn: $src not found, skipping" >&2
    continue
  fi
  if [[ -e "$dst" && ! -L "$dst" ]]; then
    echo "error: $dst exists and is not a symlink; refusing to overwrite" >&2
    exit 1
  fi
  ln -sfn "$src" "$dst"
  echo "linked $dst -> $src"
done

cat <<EOF

Installed loom skills for Codex.
Invoke from Codex with: \$shape, \$plan, \$task, \$review, \$calibrate
EOF
