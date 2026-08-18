param(
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Release',
  [string]$RuntimePath = '',
  [string]$AudioPath = '',
  [string]$AudioEnginePath = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageJsonPath = Join-Path $repoRoot 'package.json'
$packageJson = Get-Content $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$packageJson.version
if ([string]::IsNullOrWhiteSpace($version)) { throw 'package.json version is empty' }

if ([string]::IsNullOrWhiteSpace($RuntimePath)) {
  $RuntimePath = Join-Path $repoRoot ("build\vs2022-debug\runtime\$Configuration\notification-hub-runtime.exe")
}
$RuntimePath = (Resolve-Path $RuntimePath -ErrorAction Stop).Path
if ([string]::IsNullOrWhiteSpace($AudioPath)) {
  $AudioPath = Join-Path $repoRoot ("build\native-audio\runtime\$Configuration\notification-hub-audio-service.exe")
}
$AudioPath = (Resolve-Path $AudioPath -ErrorAction Stop).Path
if ([string]::IsNullOrWhiteSpace($AudioEnginePath)) {
  $AudioEnginePath = Join-Path $repoRoot ("build\native-audio\runtime\$Configuration\notification-hub-audio-engine.exe")
}
$AudioEnginePath = (Resolve-Path $AudioEnginePath -ErrorAction Stop).Path

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
Copy-Item $AudioPath (Join-Path $stageDir 'runtime\notification-hub-audio-service.exe') -Force
Copy-Item $AudioEnginePath (Join-Path $stageDir 'runtime\notification-hub-audio-engine.exe') -Force

# The release package is an installable artifact, not a source checkout.
# Do not publish repository-only test scripts that point at absent source paths.
$stagedPackageJsonPath = Join-Path $stageDir 'package.json'
$stagedPackage = Get-Content $stagedPackageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$stagedPackage.PSObject.Properties.Remove('scripts')
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
  $stagedPackageJsonPath,
  ($stagedPackage | ConvertTo-Json -Depth 20),
  $utf8NoBom
)

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
  $entryNames = $zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') }
  $rootManifest = $entryNames | Where-Object { $_ -eq 'manifest.json' }
  $nestedManifest = $entryNames | Where-Object { $_ -match '(^|/)notification-hub-vnext/manifest\.json$' -or $_ -match '(^|/)plugin/manifest\.json$' }
  $runtimeEntry = $entryNames | Where-Object { $_ -eq 'runtime/notification-hub-runtime.exe' }
  $audioEntry = $entryNames | Where-Object { $_ -eq 'runtime/notification-hub-audio-service.exe' }
  $audioEngineEntry = $entryNames | Where-Object { $_ -eq 'runtime/notification-hub-audio-engine.exe' }
  if (-not $rootManifest) { throw 'Zip root does not contain manifest.json' }
  if ($nestedManifest) { throw 'Zip contains a nested plugin root' }
  if (-not $runtimeEntry) { throw 'Zip does not contain runtime/notification-hub-runtime.exe' }
  if (-not $audioEntry) { throw 'Zip does not contain runtime/notification-hub-audio-service.exe' }
  if (-not $audioEngineEntry) { throw 'Zip does not contain runtime/notification-hub-audio-engine.exe' }
}
finally {
  $zip.Dispose()
}

# Keep only the installable artifact after validation; the staging tree is disposable.
Remove-Item $stageDir -Recurse -Force

$hash = Get-FileHash $zipPath -Algorithm SHA256
Write-Host "Release ZIP: $zipPath"
Write-Host "SHA256: $($hash.Hash)"
