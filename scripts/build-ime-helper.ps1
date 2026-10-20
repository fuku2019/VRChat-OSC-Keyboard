param([string]$LlamaDirectory)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
if (!$LlamaDirectory) { $LlamaDirectory = Join-Path $repoRoot '.tools/llama-b4846' }
$LlamaDirectory = (Resolve-Path -LiteralPath $LlamaDirectory).Path
$dependencyLock = Get-Content -LiteralPath (Join-Path $repoRoot 'helper/windows-dependencies.json') -Raw | ConvertFrom-Json
foreach ($entry in $dependencyLock.llama.files.PSObject.Properties) {
    $file = Join-Path $LlamaDirectory $entry.Name
    if (!(Test-Path -LiteralPath $file)) { throw "Missing b4846 dependency: $($entry.Name)" }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.Value) { throw "Invalid b4846 dependency: $($entry.Name)" }
}
# Installers update persistent variables, which an already-running Codex process
# does not inherit. Apply the new tool paths only in this build process.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
if (!$env:SDKROOT) { $env:SDKROOT = [Environment]::GetEnvironmentVariable('SDKROOT', 'User') }
if (!$env:SDKROOT) { $env:SDKROOT = [Environment]::GetEnvironmentVariable('SDKROOT', 'Machine') }
$swift = Get-Command swift -ErrorAction Stop
$swiftBin = Split-Path $swift.Source -Parent
# The pinned release exports this CPU device API in ggml.dll, but ships only
# llama.lib. Generate its import library without changing either DLL or headers.
& (Join-Path $swiftBin 'llvm-dlltool.exe') -m i386:x86-64 -d (Join-Path $repoRoot 'helper/Windows/ggml.def') -l (Join-Path $LlamaDirectory 'ggml.lib')
if ($LASTEXITCODE -ne 0) { throw 'Failed to generate ggml import library' }
# SPM's nested dictionary submodules exceed MAX_PATH in this checkout. Keep
# Git's long-path setting local to this process, rather than changing user config.
$configIndex = if ($env:GIT_CONFIG_COUNT) { [int]$env:GIT_CONFIG_COUNT } else { 0 }
[Environment]::SetEnvironmentVariable("GIT_CONFIG_KEY_$configIndex", 'core.longpaths', 'Process')
[Environment]::SetEnvironmentVariable("GIT_CONFIG_VALUE_$configIndex", 'true', 'Process')
$env:GIT_CONFIG_COUNT = [string]($configIndex + 1)
$swiftInfo = (& $swift.Source --version | Out-String).Trim()
if ($swiftInfo -notmatch ('Swift version ' + [regex]::Escape($dependencyLock.swiftVersion) + '\b')) {
    throw "Expected Swift $($dependencyLock.swiftVersion); active toolchain is: $swiftInfo"
}
Write-Output $swiftInfo
Write-Output "llama.cpp import libraries: $LlamaDirectory"
Push-Location (Join-Path $repoRoot 'helper')
try {
    & $swift.Source package resolve
    if ($LASTEXITCODE -ne 0) { throw 'Swift dependency resolution failed' }
    $dependency = Join-Path $repoRoot 'helper/.build/checkouts/AzooKeyKanaKanjiConverter'
    $revision = & git -C $dependency rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $revision -ne $dependencyLock.azooKeyRevision) { throw 'AzooKey revision mismatch' }
    foreach ($patchFile in (Get-ChildItem -LiteralPath (Join-Path $repoRoot 'helper/patches') -Filter '*.patch' | Sort-Object Name)) {
        $patch = $patchFile.FullName
        & git -C $dependency apply --reverse --check $patch 2>$null
        if ($LASTEXITCODE -ne 0) {
            foreach ($source in @('ConversionAlgorithms/Zenzai/Zenz/Zenz.swift', 'ConversionAlgorithms/Zenzai/Zenz/ZenzContext.swift', 'ConverterAPI/KanaKanjiConverter.swift')) {
                (Get-Item -LiteralPath (Join-Path $dependency "Sources/KanaKanjiConverterModule/$source")).IsReadOnly = $false
            }
            & git -C $dependency apply --check $patch
            if ($LASTEXITCODE -ne 0) { throw "Patch does not match pinned AzooKey source: $($patchFile.Name)" }
            & git -C $dependency apply $patch
            if ($LASTEXITCODE -ne 0) { throw "Patch failed: $($patchFile.Name)" }
        }
    }
    & $swift.Source build -c release -Xlinker "/LIBPATH:$LlamaDirectory" -Xlinker ggml.lib
    if ($LASTEXITCODE -ne 0) { throw "Swift release build failed ($LASTEXITCODE)" }
    @{
        swiftVersion = $swiftInfo
        sdkRoot = $env:SDKROOT
        dependencyLockSha256 = (Get-FileHash -LiteralPath (Join-Path $repoRoot 'helper/windows-dependencies.json')).Hash.ToLowerInvariant()
        packageResolvedSha256 = (Get-FileHash -LiteralPath (Join-Path $repoRoot 'helper/Package.resolved')).Hash.ToLowerInvariant()
        azooKeyRevision = $revision
        traits = @('ZenzaiCPU')
        patches = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'helper/patches') -Filter '*.patch' | Sort-Object Name | ForEach-Object {
            @{ name = $_.Name; sha256 = (Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant() }
        })
    } | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $repoRoot 'helper/.build/build-metadata.json')
} finally { Pop-Location }
