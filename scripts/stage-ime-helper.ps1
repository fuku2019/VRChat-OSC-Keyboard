param([string]$Destination)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
if (!$Destination) { $Destination = Join-Path $repoRoot '.tools/ime-helper-stage' }
$Destination = [IO.Path]::GetFullPath($Destination)
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '.tools')) + [IO.Path]::DirectorySeparatorChar
if (!$Destination.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Staging destination must be inside repository .tools/' }
if ((Test-Path -LiteralPath $Destination) -and (Get-ChildItem -LiteralPath $Destination -Force)) { throw 'Staging destination must be empty; choose a new destination for another build' }
New-Item -ItemType Directory -Force $Destination | Out-Null
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
$swift = Get-Command swift -ErrorAction Stop
$readobj = Join-Path (Split-Path $swift.Source -Parent) 'llvm-readobj.exe'
$runtimeRoots = @($env:Path.Split(';') | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'swiftCore.dll')) } | Select-Object -Unique)
if (!$runtimeRoots) { throw 'Swift runtime DLL directory not found' }
$release = Join-Path $repoRoot 'helper/.build/x86_64-unknown-windows-msvc/release'
$llama = Join-Path $repoRoot '.tools/llama-b4846'
$lock = Get-Content -LiteralPath (Join-Path $repoRoot 'helper/windows-dependencies.json') -Raw | ConvertFrom-Json
foreach ($entry in $lock.llama.files.PSObject.Properties) {
    if ((Get-FileHash -LiteralPath (Join-Path $llama $entry.Name)).Hash -ne $entry.Value) { throw "Invalid b4846 dependency: $($entry.Name)" }
}
$searchRoots = @($release, $llama) + $runtimeRoots
$queue = [Collections.Generic.Queue[string]]::new()
$queue.Enqueue((Join-Path $release 'ZenzaiHelper.exe'))
$queue.Enqueue((Join-Path $llama 'ggml-cpu.dll')) # Runtime backend, possibly loaded dynamically.
$copied = @{}
$systemImports = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
while ($queue.Count) {
    $source = $queue.Dequeue()
    $name = Split-Path $source -Leaf
    if ($copied.ContainsKey($name)) { continue }
    Copy-Item -LiteralPath $source -Destination (Join-Path $Destination $name)
    $copied[$name] = @{ name = $name; source = $source; bytes = (Get-Item -LiteralPath $source).Length; sha256 = (Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant() }
    $imports = & $readobj --coff-imports $source
    if ($LASTEXITCODE -ne 0) { throw "Cannot inspect PE imports: $source" }
    foreach ($line in $imports) {
        if ($line -notmatch '^\s*Name:\s*(\S+\.dll)\s*$') { continue }
        $dll = $Matches[1]
        $found = $null
        foreach ($directory in $searchRoots) {
            $candidate = Join-Path $directory $dll
            if (Test-Path -LiteralPath $candidate) { $found = $candidate; break }
        }
        if ($found) { $queue.Enqueue($found) }
        elseif ($dll -match '^(api-ms-|ext-ms-)' -or (Test-Path -LiteralPath (Join-Path $env:SystemRoot "System32/$dll"))) { [void]$systemImports.Add($dll) }
        else { throw "Unresolved runtime import: $dll (from $name)" }
    }
}
$dictionary = Join-Path $repoRoot '.tools/azookey-dictionary'
$revision = & git -C $dictionary rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $revision -ne $lock.dictionaryRevision) { throw 'Dictionary revision mismatch' }
$changes = & git -C $dictionary status --porcelain
if ($LASTEXITCODE -ne 0 -or $changes) { throw 'Dictionary working tree was modified' }
Copy-Item -LiteralPath (Join-Path $dictionary 'Dictionary') -Destination (Join-Path $Destination 'Dictionary') -Recurse
$licenses = Join-Path $Destination 'THIRD_PARTY_LICENSES'
New-Item -ItemType Directory -Force $licenses | Out-Null
Copy-Item -LiteralPath (Join-Path $dictionary 'LICENSE') -Destination (Join-Path $licenses 'AzooKeyDictionary-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $repoRoot 'helper/.build/checkouts/AzooKeyKanaKanjiConverter/LICENSE') -Destination (Join-Path $licenses 'AzooKey-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $llama 'llama.cpp.txt') -Destination (Join-Path $licenses 'llama.cpp-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $repoRoot 'helper/.build/build-metadata.json') -Destination (Join-Path $Destination 'build-metadata.json')
@{
    distributionReady = $false
    remainingChecks = @('Swift/runtime/transitive redistribution notices', 'Swift-uninstalled Windows validation', 'Dictionary data provenance')
    files = @($copied.Values | Sort-Object name)
    systemImports = @($systemImports | Sort-Object)
    totalBytes = (Get-ChildItem -LiteralPath $Destination -Recurse -File | Measure-Object Length -Sum).Sum
} | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $Destination 'stage-manifest.json')
Write-Output "Staged helper: $Destination"
