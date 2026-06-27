#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "/opt/homebrew/Cellar/node/26.3.1/bin/node" "$DIR/index.mjs"
