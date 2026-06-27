function shellDoubleQuote(value) {
  return `"${String(value).replace(/[\\$"`]/g, "\\$&")}"`;
}

export function buildNativeHostLauncher({ nodePath }) {
  if (!nodePath || !nodePath.startsWith("/")) {
    throw new Error("nodePath must be an absolute path");
  }

  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `exec ${shellDoubleQuote(nodePath)} "$DIR/index.mjs"`,
    ""
  ].join("\n");
}
