# Packages the extension into dist/SnapWebAssistant-v<version>.zip
$ErrorActionPreference = 'Stop'

$manifest = Get-Content -Raw manifest.json | ConvertFrom-Json
$version = $manifest.version
$distDir = Join-Path $PSScriptRoot 'dist'
$outZip = Join-Path $distDir "SnapWebAssistant-v$version.zip"

if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
if (Test-Path $outZip) { Remove-Item $outZip }

$files = @(
  'manifest.json',
  'background.js',
  'content.js',
  'bridge.js',
  'popup.html',
  'popup.js',
  'README.md',
  'LICENSE'
)

# include icons if present
if (Test-Path (Join-Path $PSScriptRoot 'icons')) {
  Get-ChildItem -Path (Join-Path $PSScriptRoot 'icons') -File | ForEach-Object {
    $files += "icons/$($_.Name)"
  }
}

$staging = Join-Path $distDir 'staging'
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path $staging | Out-Null
foreach ($f in $files) {
  $src = Join-Path $PSScriptRoot $f
  if (Test-Path $src) {
    $dest = Join-Path $staging $f
    $parent = Split-Path $dest -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item $src $dest
  }
}

Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $outZip
Remove-Item -Recurse -Force $staging
Write-Host "Packaged: $outZip"