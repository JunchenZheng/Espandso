param(
  [string]$Bundle = "nsis",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

Require-Command "node"
Require-Command "npm"
Require-Command "cargo"

if (-not $SkipInstall) {
  Write-Host "Installing npm dependencies..."
  npm ci
}

$IconCandidates = @("icon.svg", "logo.svg", "icon.png", "logo.png")
$IconSource = $IconCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $IconSource) {
  throw "Source icon file not found. Add icon.svg, logo.svg, icon.png, or logo.png to the project root."
}

Write-Host "Generating Tauri icons from $IconSource..."
npm run tauri -- icon $IconSource

Write-Host "Building Windows installer bundle: $Bundle..."
npm run tauri -- build --bundles $Bundle

Write-Host ""
Write-Host "Windows bundle output:"
Write-Host "  src-tauri\target\release\bundle"
