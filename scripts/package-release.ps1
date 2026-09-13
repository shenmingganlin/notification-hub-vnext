param(
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Release',
  [string]$RuntimePath = '',
  [string]$AudioEnginePath = '',
  [switch]$SkipStagingRuntimeSmoke
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$canonicalVersion = (Get-Content (Join-Path $repoRoot 'VERSION') -Raw -Encoding UTF8).Trim()
if ($canonicalVersion -ne '0.1.6') { throw "VERSION must be exactly 0.1.6, got '$canonicalVersion'" }

$packageJsonPath = Join-Path $repoRoot 'package.json'
$packageJson = Get-Content $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$packageJson.version -ne $canonicalVersion) { throw 'package.json version does not match VERSION' }
$manifestSourcePath = Join-Path $repoRoot 'plugin\manifest.json'
$manifestSource = Get-Content $manifestSourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$manifestSource.version -ne $canonicalVersion) { throw 'plugin/manifest.json version does not match VERSION' }

# Keep -Configuration compatible, but derive only the active CMake preset output.
$currentPresetRoot = Join-Path $repoRoot ("build\debug-vs2026\runtime\$Configuration")
if ([string]::IsNullOrWhiteSpace($RuntimePath)) {
  $RuntimePath = Join-Path $currentPresetRoot 'notification-hub-runtime.exe'
}
if ([string]::IsNullOrWhiteSpace($AudioEnginePath)) {
  $AudioEnginePath = Join-Path $currentPresetRoot 'notification-hub-audio-engine.exe'
}

function Resolve-ReleaseArtifact([string]$label, [string]$candidatePath, [string]$expectedName) {
  $absoluteCandidate = $candidatePath
  if (-not [System.IO.Path]::IsPathRooted($absoluteCandidate)) {
    $absoluteCandidate = Join-Path $repoRoot $absoluteCandidate
  }
  if (-not (Test-Path -LiteralPath $absoluteCandidate -PathType Leaf)) {
    throw "$label is missing: $candidatePath. Build the current debug-vs2026 preset or pass -$label explicitly."
  }
  $item = Get-Item -LiteralPath $absoluteCandidate
  if ($item.Name -ne $expectedName) { throw "$label must be $expectedName, got $($item.Name)" }
  if ($item.Length -le 0) { throw "$label is empty: $($item.FullName)" }
  return $item
}

function Invoke-StagingRuntimeSmoke([string]$stagingRoot, [bool]$skip) {
  $stagedRuntimePath = Join-Path $stagingRoot 'runtime\notification-hub-runtime.exe'
  if ($skip) {
    Write-Warning 'Staging Runtime smoke was explicitly skipped; release manifest will record not-run.'
    return [ordered]@{ status = 'not-run'; reason = 'explicit -SkipStagingRuntimeSmoke'; command = '--self-test' }
  }
  if (-not (Test-Path -LiteralPath $stagedRuntimePath -PathType Leaf)) {
    throw "Staging Runtime smoke cannot run; staged executable is missing: $stagedRuntimePath"
  }
  $smokeOutput = & $stagedRuntimePath --self-test 2>&1
  $exitCode = $LASTEXITCODE
  $smokeOutput | ForEach-Object { Write-Host "staging runtime: $_" }
  if ($exitCode -ne 0) {
    throw "Staging Runtime smoke failed with exit code $exitCode"
  }
  return [ordered]@{ status = 'passed'; reason = 'staged executable returned 0'; command = '--self-test' }
}

$runtimeItem = Resolve-ReleaseArtifact 'RuntimePath' $RuntimePath 'notification-hub-runtime.exe'
$audioEngineItem = Resolve-ReleaseArtifact 'AudioEnginePath' $AudioEnginePath 'notification-hub-audio-engine.exe'
if ($runtimeItem.Directory.FullName -ne $audioEngineItem.Directory.FullName) {
  throw "Runtime and audio engine must come from the same build output directory. Runtime='$($runtimeItem.Directory.FullName)', Audio='$($audioEngineItem.Directory.FullName)'"
}
$artifactTimeDeltaSeconds = [math]::Abs(($runtimeItem.LastWriteTimeUtc - $audioEngineItem.LastWriteTimeUtc).TotalSeconds)
if ($artifactTimeDeltaSeconds -gt 86400) {
  throw "Runtime and audio engine timestamps differ by more than 24 hours ($artifactTimeDeltaSeconds seconds); refuse a mixed-age release"
}
foreach ($artifact in @($runtimeItem, $audioEngineItem)) {
  $fileVersion = [string]$artifact.VersionInfo.ProductVersion
  if (-not [string]::IsNullOrWhiteSpace($fileVersion) -and $fileVersion -ne $canonicalVersion) {
    throw "$($artifact.Name) PE ProductVersion '$fileVersion' does not match VERSION '$canonicalVersion'"
  }
}

$distDir = Join-Path $repoRoot 'dist'
$stageDir = Join-Path $distDir 'notification-hub-vnext'
$zipPath = Join-Path $distDir "notification-hub-vnext-$canonicalVersion.zip"
$releaseManifestPath = Join-Path $distDir "notification-hub-vnext-$canonicalVersion.release-manifest.json"

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
Remove-Item (Join-Path $stageDir 'commands') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $runtimeItem.FullName (Join-Path $stageDir 'runtime\notification-hub-runtime.exe') -Force
Copy-Item $audioEngineItem.FullName (Join-Path $stageDir 'runtime\notification-hub-audio-engine.exe') -Force

$runtimeDependencySource = Join-Path $repoRoot 'node_modules\adm-zip'
$runtimeDependencyTarget = Join-Path $stageDir 'node_modules\adm-zip'
if (-not (Test-Path (Join-Path $runtimeDependencySource 'adm-zip.js'))) { throw 'Required production dependency is missing: node_modules/adm-zip/adm-zip.js' }
New-Item -ItemType Directory -Path (Join-Path $stageDir 'node_modules') -Force | Out-Null
Copy-Item $runtimeDependencySource $runtimeDependencyTarget -Recurse -Force

$stagedPackageJsonPath = Join-Path $stageDir 'package.json'
$stagedPackage = Get-Content $stagedPackageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$stagedPackage.PSObject.Properties.Remove('scripts')
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($stagedPackageJsonPath, ($stagedPackage | ConvertTo-Json -Depth 20), $utf8NoBom)

$manifestPath = Join-Path $stageDir 'manifest.json'
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$manifest.id -ne 'notification-hub-vnext') { throw 'Package manifest id is not notification-hub-vnext' }
if ([string]$manifest.version -ne $canonicalVersion) { throw 'Package manifest version does not match VERSION' }

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
  $audioEngineEntry = $entryNames | Where-Object { $_ -eq 'runtime/notification-hub-audio-engine.exe' }
  $admZipEntry = $entryNames | Where-Object { $_ -eq 'node_modules/adm-zip/adm-zip.js' }
  $legacyAudioEntry = $entryNames | Where-Object { $_ -eq 'runtime/notification-hub-audio-service.exe' }
  $commandEntries = $entryNames | Where-Object { $_ -match '^commands/' }
  if (-not $rootManifest) { throw 'Zip root does not contain manifest.json' }
  if ($nestedManifest) { throw 'Zip contains a nested plugin root' }
  if (-not $runtimeEntry) { throw 'Zip does not contain runtime/notification-hub-runtime.exe' }
  if (-not $audioEngineEntry) { throw 'Zip does not contain runtime/notification-hub-audio-engine.exe' }
  if (-not $admZipEntry) { throw 'Zip does not contain node_modules/adm-zip/adm-zip.js' }
  if ($legacyAudioEntry) { throw 'Zip must not contain the retired audio-service executable' }
  if ($commandEntries) { throw 'Zip must not contain repository-only command modules' }
}
finally {
  $zip.Dispose()
}

$stagingVerification = Invoke-StagingRuntimeSmoke $stageDir $SkipStagingRuntimeSmoke.IsPresent
Remove-Item $stageDir -Recurse -Force

$zipHash = Get-FileHash $zipPath -Algorithm SHA256
$zipItem = Get-Item $zipPath
$releaseManifest = [ordered]@{
  version = $canonicalVersion
  stagingVerification = $stagingVerification
  package = [ordered]@{
    path = $zipItem.FullName
    sha256 = $zipHash.Hash
    sizeBytes = $zipItem.Length
    lastWriteTimeUtc = $zipItem.LastWriteTimeUtc.ToString('o')
  }
  build = [ordered]@{
    configuration = $Configuration
    outputDirectory = $runtimeItem.Directory.FullName
    artifactTimeDeltaSeconds = $artifactTimeDeltaSeconds
    runtime = [ordered]@{
      path = $runtimeItem.FullName
      sizeBytes = $runtimeItem.Length
      lastWriteTimeUtc = $runtimeItem.LastWriteTimeUtc.ToString('o')
    }
    audioEngine = [ordered]@{
      path = $audioEngineItem.FullName
      sizeBytes = $audioEngineItem.Length
      lastWriteTimeUtc = $audioEngineItem.LastWriteTimeUtc.ToString('o')
    }
  }
}
[System.IO.File]::WriteAllText($releaseManifestPath, ($releaseManifest | ConvertTo-Json -Depth 10), $utf8NoBom)

Write-Host "Release ZIP: $($zipItem.FullName)"
Write-Host "Release manifest: $releaseManifestPath"
Write-Host "SHA256: $($zipHash.Hash)"
Write-Host "Build output: $($runtimeItem.Directory.FullName)"
Write-Host "Artifact times (UTC): runtime=$($runtimeItem.LastWriteTimeUtc.ToString('o')), audio=$($audioEngineItem.LastWriteTimeUtc.ToString('o'))"
Write-Host "Sizes: zip=$($zipItem.Length) bytes, runtime=$($runtimeItem.Length) bytes, audioEngine=$($audioEngineItem.Length) bytes"
