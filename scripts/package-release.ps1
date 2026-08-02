param(
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Release',
  [string]$RuntimePath = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageJsonPath = Join-Path $repoRoot 'package.json'
$packageJson = Get-Content $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$packageJson.version
if ([string]::IsNullOrWhiteSpace($version)) { throw 'package.json version is empty' }

if ([string]::IsNullOrWhiteSpace($RuntimePath)) {
  $RuntimePath = Join-Path $repoRoot ("build\debug-vs2026\runtime\$Configuration\notification-hub-runtime.exe")
}
$RuntimePath = (Resolve-Path $RuntimePath -ErrorAction Stop).Path

$distDir = Join-Path $repoRoot 'dist'
$stageDir = Join-Path $distDir 'notification-hub-vnext'
$zipPath = Join-Path $distDir "notification-hub-vnext-$version.zip"

Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir 'runtime') | Out-Null

$include = @(
  'package.json',
  'package-lock.json',
  'LICENSE',
  'schemas'
)
foreach ($relativePath in $include) {
  $source = Join-Path $repoRoot $relativePath
  if (-not (Test-Path $source)) { throw "Required package input is missing: $relativePath" }
  Copy-Item $source (Join-Path $stageDir $relativePath) -Recurse -Force
}
$pluginSource = Join-Path $repoRoot 'plugin'
if (-not (Test-Path (Join-Path $pluginSource 'manifest.json'))) { throw 'plugin/manifest.json is missing' }
Copy-Item (Join-Path $pluginSource '*') $stageDir -Recurse -Force
Copy-Item $RuntimePath (Join-Path $stageDir 'runtime\notification-hub-runtime.exe') -Force

$manifestPath = Join-Path $stageDir 'manifest.json'
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$manifest.id -ne 'notification-hub-vnext') { throw 'Package manifest id is not notification-hub-vnext' }
if ([string]$manifest.version -ne $version) { throw 'Package manifest version does not match package.json' }

$oldPluginReference = Get-ChildItem $stageDir -Recurse -File | Select-String -Pattern 'notification-hub-0\.2\.1|"id"\s*:\s*"notification-hub"' -AllMatches
if ($oldPluginReference) { throw 'Package contains legacy notification-hub identity or reference' }

Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $rootManifest = $zip.Entries | Where-Object { $_.FullName -eq 'manifest.json' }
  $nestedManifest = $zip.Entries | Where-Object { $_.FullName -match '(^|/)notification-hub-vnext/manifest\.json$' -or $_.FullName -match '(^|/)plugin/manifest\.json$' }
  $runtimeEntry = $zip.Entries | Where-Object { $_.FullName -eq 'runtime/notification-hub-runtime.exe' }
  if (-not $rootManifest) { throw 'Zip root does not contain manifest.json' }
  if ($nestedManifest) { throw 'Zip contains a nested plugin root' }
  if (-not $runtimeEntry) { throw 'Zip does not contain runtime/notification-hub-runtime.exe' }
}
finally {
  $zip.Dispose()
}

$hash = Get-FileHash $zipPath -Algorithm SHA256
Write-Host "Release ZIP: $zipPath"
Write-Host "SHA256: $($hash.Hash)"
