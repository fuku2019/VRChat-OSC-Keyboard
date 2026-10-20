$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$release = Join-Path $repoRoot 'release'
$sevenZip = & node (Join-Path $repoRoot 'scripts/resolve-7zip.mjs')
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $sevenZip)) { throw 'Cannot resolve electron-builder 7zip' }
$inspection = Join-Path $repoRoot ('.tools/artifact-inspection-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $inspection | Out-Null
$installer = Get-ChildItem -LiteralPath $release -Filter 'VrcLiveIme-Setup-*.exe' | Select-Object -First 1
$zip = Get-ChildItem -LiteralPath $release -Filter '*.zip' | Where-Object { $_.Name -notmatch 'sources' } | Select-Object -First 1
if (!$installer -or !$zip) { throw 'Expected NSIS installer and zip' }
if ($installer.Length -gt 140MB) { Write-Warning 'Installer exceeds the existing 140 MiB warning threshold' }
if ($installer.Length -gt 150MB) { throw 'Installer exceeds the existing 150 MiB size gate' }
$nsis = Join-Path $inspection 'nsis'
& $sevenZip x $installer.FullName "-o$nsis" '-y' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot extract NSIS payload' }
$installed = $nsis
if (!(Test-Path -LiteralPath (Join-Path $installed 'VrcLiveIme.exe'))) {
    $archive = Get-ChildItem -LiteralPath $nsis -Filter 'app-64.7z' -Recurse | Select-Object -First 1
    if (!$archive) { throw 'NSIS x64 application payload missing' }
    $installed = Join-Path $inspection 'installed'
    & $sevenZip x $archive.FullName "-o$installed" '-y' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect NSIS application' }
}
$portable = Join-Path $inspection 'portable'
& $sevenZip x $zip.FullName "-o$portable" '-y' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect portable zip' }
foreach ($appPath in @($installed, $portable)) {
    & node (Join-Path $repoRoot 'scripts/verify-ime-package.mjs') --app $appPath --development
    if ($LASTEXITCODE -ne 0) { throw "Extracted package verification failed: $appPath" }
    & node (Join-Path $repoRoot 'scripts/test-ime-app-integration.mjs') (Join-Path $appPath 'resources/ime-helper/win-x64') --dictionary-only
    if ($LASTEXITCODE -ne 0) { throw 'Extracted helper conversion failed' }
}
[pscustomobject]@{ installer = $installer.Name; installerMiB = [math]::Round($installer.Length / 1MB, 2); zip = $zip.Name; zipMiB = [math]::Round($zip.Length / 1MB, 2); inspection = $inspection; scope = 'Extracted payload and helper conversion; not an installed app/VR acceptance test' } | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $release 'ime-artifact-validation.json')
Write-Output 'PASS NSIS and zip contents; extracted helpers convert Japanese'
