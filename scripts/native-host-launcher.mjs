export function buildNativeHostLauncher(options = {}) {
  return options.platform === "win32"
    ? buildWindowsNativeHostLauncher()
    : buildPosixNativeHostLauncher();
}

export function buildPosixNativeHostLauncher() {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'NODE_BIN="${CODEX_SELECTION_EXPLAINER_NODE_PATH:-}"',
    'if [[ -z "$NODE_BIN" ]] && command -v launchctl >/dev/null 2>&1; then',
    '  NODE_BIN="$(launchctl getenv CODEX_SELECTION_EXPLAINER_NODE_PATH || true)"',
    "fi",
    'if [[ -z "$NODE_BIN" && -f "$DIR/node-path.txt" ]]; then',
    '  NODE_BIN="$(head -n 1 "$DIR/node-path.txt")"',
    "fi",
    'if [[ -z "$NODE_BIN" ]]; then',
    '  NODE_BIN="$(command -v node || true)"',
    "fi",
    'if [[ -z "$NODE_BIN" ]]; then',
    '  echo "CODEX_SELECTION_EXPLAINER_NODE_PATH is not set. Run one of the setup scripts in scripts/." >&2',
    "  exit 127",
    "fi",
    'if [[ ! -x "$NODE_BIN" ]]; then',
    '  echo "CODEX_SELECTION_EXPLAINER_NODE_PATH does not point to an executable Node.js binary: $NODE_BIN" >&2',
    "  exit 127",
    "fi",
    'exec "$NODE_BIN" "$DIR/index.mjs"',
    ""
  ].join("\n");
}

export function buildWindowsNativeHostLauncher() {
  return [
    "@echo off",
    "setlocal",
    'set "DIR=%~dp0"',
    'set "NODE_BIN=%CODEX_SELECTION_EXPLAINER_NODE_PATH%"',
    'if "%NODE_BIN%"=="" for /f "tokens=2,*" %%A in (\'reg query HKCU\\Environment /v CODEX_SELECTION_EXPLAINER_NODE_PATH 2^>nul\') do set "NODE_BIN=%%B"',
    'if "%NODE_BIN%"=="" if exist "%DIR%node-path.txt" set /p NODE_BIN=<"%DIR%node-path.txt"',
    'if "%NODE_BIN%"=="" for %%I in (node.exe) do set "NODE_BIN=%%~$PATH:I"',
    'if "%NODE_BIN%"=="" (',
    "  echo CODEX_SELECTION_EXPLAINER_NODE_PATH is not set. Run scripts\\setup-windows.ps1. 1>&2",
    "  exit /b 127",
    ")",
    'if not exist "%NODE_BIN%" (',
    "  echo CODEX_SELECTION_EXPLAINER_NODE_PATH does not point to an executable Node.js binary: %NODE_BIN% 1>&2",
    "  exit /b 127",
    ")",
    '"%NODE_BIN%" "%DIR%index.mjs"',
    "exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n");
}
