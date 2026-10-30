#!/bin/sh

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Loom context: [LOOM_NODE_MISSING] Node.js is not available on PATH. The agent should reuse an installed runtime or install a supported Node.js (22.18+ in 22.x, 24.x, or 26+), verify node --version, and retry this command.' >&2
  exit 2
fi

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (!((major === 22 && minor >= 18) || major === 24 || major >= 26)) { console.error("Loom context: [LOOM_NODE_UNSUPPORTED] Node.js " + process.versions.node + " is unsupported. The agent should configure a supported Node.js (22.18+ in 22.x, 24.x, or 26+), verify node --version, and retry this command."); process.exit(2); }'
runtime_status=$?
if [ "$runtime_status" -ne 0 ]; then
  exit "$runtime_status"
fi

case "$0" in
  */*) cli_script="${0%/*}/cli.ts" ;;
  *) cli_script="./cli.ts" ;;
esac

exec node "$cli_script" "$@"
