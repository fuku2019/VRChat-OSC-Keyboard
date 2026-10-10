$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
& node (Join-Path $repoRoot 'scripts/test-ime-helper-integration.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Real helper integration failed' }
