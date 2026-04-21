const MIN_NODE_VERSION = 24;

export function generateNodeScriptsRun(skillName: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v node &>/dev/null; then
  echo "error: Node.js is required but not found. Install Node.js >= ${MIN_NODE_VERSION}." >&2
  exit 1
fi

NODE_VERSION="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')"
if [ "$NODE_VERSION" -lt ${MIN_NODE_VERSION} ] 2>/dev/null; then
  echo "error: Node.js >= ${MIN_NODE_VERSION} required, found v$(node --version | tr -d v)" >&2
  exit 1
fi

export SKILL_DIR
exec node "$SKILL_DIR/bin/${skillName}.mjs" "$@"
`;
}
