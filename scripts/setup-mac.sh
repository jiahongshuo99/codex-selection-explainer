#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install Node.js, then run this script again." >&2
  exit 127
fi

exec node scripts/setup.mjs "$@"
