#!/bin/sh

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Loom context: [LOOM_NODE_MISSING] Node.js is not available on PATH. The agent should reuse an installed runtime or install a supported Node.js LTS (20+), verify node --version, and retry this command.' >&2
  exit 2
fi

node -e 'if (parseInt(process.versions.node, 10) < 20) { console.error("Loom context: [LOOM_NODE_UNSUPPORTED] Node.js " + process.versions.node + " is unsupported. The agent should configure a supported Node.js LTS (20+), verify node --version, and retry this command."); process.exit(2); }'
runtime_status=$?
if [ "$runtime_status" -ne 0 ]; then
  exit "$runtime_status"
fi

case "$0" in
  */*) context_script="${0%/*}/context.mjs" ;;
  *) context_script="./context.mjs" ;;
esac

exec node "$context_script" "$@"
