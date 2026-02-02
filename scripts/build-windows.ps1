param(
  [string]$Bundle = "nsis",
  [switch]$SkipInstall,
  [string]$ArtifactDir = "dist-installers/windows"
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

$BundleDir = Join-Path $RootDir "src-tauri/target/release/bundle/$Bundle"
$Installers = Get-ChildItem -Path $BundleDir -Filter "*setup.exe" -File -ErrorAction SilentlyContinue

if (-not $Installers) {
  throw "Windows installer was not found in $BundleDir. The raw release executable is not the distributable installer; check the Tauri bundle output above."
}

$ArtifactPath = Join-Path $RootDir $ArtifactDir
New-Item -ItemType Directory -Force -Path $ArtifactPath | Out-Null
$Installers | Copy-Item -Destination $ArtifactPath -Force

Write-Host ""
Write-Host "Windows installer output:"
Get-ChildItem -Path $ArtifactPath -Filter "*setup.exe" -File | ForEach-Object {
  Write-Host "  $($_.FullName)"
}
