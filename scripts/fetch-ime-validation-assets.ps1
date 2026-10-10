param([switch]$IncludeSmall)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $repoRoot '.tools'
$dependencyLock = Get-Content -LiteralPath (Join-Path $repoRoot 'helper/windows-dependencies.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force $tools | Out-Null

function Get-VerifiedFile([string]$Url, [string]$Target, [string]$Sha256, [long]$Bytes = 0) {
    if (Test-Path -LiteralPath $Target) {
        if ((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash -eq $Sha256 -and
            (!$Bytes -or (Get-Item -LiteralPath $Target).Length -eq $Bytes)) { return }
        throw "Existing asset is invalid; inspect it before retrying: $Target"
    }
    New-Item -ItemType Directory -Force (Split-Path $Target -Parent) | Out-Null
    $partial = "$Target.part"
    Invoke-WebRequest -Uri $Url -OutFile $partial
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $Sha256 -or
        ($Bytes -and (Get-Item -LiteralPath $partial).Length -ne $Bytes)) {
        throw "Downloaded asset failed size/SHA256 verification: $partial"
    }
    Move-Item -LiteralPath $partial -Destination $Target
}

$zip = Join-Path $tools 'llama-b4846-bin-win-avx-x64.zip'
Get-VerifiedFile $dependencyLock.llama.url $zip $dependencyLock.llama.sha256
Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $tools 'llama-b4846') -Force

$dictionary = Join-Path $tools 'azookey-dictionary'
$dictionaryRevision = $dependencyLock.dictionaryRevision
if (!(Test-Path -LiteralPath $dictionary)) {
    & git clone --no-checkout https://github.com/ensan-hcl/azooKey_dictionary_storage $dictionary
    if ($LASTEXITCODE -ne 0) { throw 'Dictionary clone failed' }
    & git -C $dictionary checkout --detach $dictionaryRevision
    if ($LASTEXITCODE -ne 0) { throw 'Dictionary checkout failed' }
}
$actual = & git -C $dictionary rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actual -ne $dictionaryRevision) { throw 'Dictionary revision mismatch' }
$changes = & git -C $dictionary status --porcelain
if ($LASTEXITCODE -ne 0 -or $changes) { throw 'Validation dictionary must have a clean working tree' }

$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'models/manifest.json') -Raw | ConvertFrom-Json
foreach ($model in $manifest.models) {
    if (!$IncludeSmall -and $model.id -ne 'zenz-v3.2-xsmall-q5-k-m') { continue }
    $url = "https://huggingface.co/$($model.repository)/resolve/$($model.revision)/$($model.filename)"
    $target = Join-Path $tools "models/$($model.id)/$($model.filename)"
    Get-VerifiedFile $url $target $model.sha256 $model.bytes
    Write-Output "Verified $($model.id): $target"
}
