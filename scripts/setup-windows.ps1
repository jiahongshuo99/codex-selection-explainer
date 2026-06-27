$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) {
  Write-Error "Node.js 20+ is required. Install Node.js, then run this script again."
  exit 127
}

& node "scripts/setup.mjs" @args
exit $LASTEXITCODE
