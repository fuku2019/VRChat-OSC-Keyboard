# Windows CPU helper development

`ZenzaiHelper` implements the [JSONL v1 protocol](../docs/ime-helper-protocol.md).
`ZenzaiProbe` is a separate single-conversion diagnostic tool. Gate A now passes
on the development Windows host with both pinned v3.2 models. Production IME
wiring and committed OSC snapshot sending are implemented. Windows packaging is
under validation; see [distribution](../docs/distribution.md).

## Toolchain

Verified build environment starts with Swift 6.1.3, CMake 3.31.8 and Visual
Studio 2022 MSVC x64 / Windows SDK 10.0.22621.0. Swift's installer also installs
its runtime and dependencies. Follow the [official Swift Windows installation
instructions](https://www.swift.org/install/windows/).

```powershell
winget install --id Swift.Toolchain --exact --version 6.1.3 --source winget
winget install --id Kitware.CMake --exact --version 3.31.8 --source winget
```

An already-running terminal may need refreshed PATH and SDKROOT. The helper build
script refreshes these only in its process and enables Git long paths only in
that process. It does not edit global Git configuration or system policy.

For the unchanged native overlay baseline, Swift's `usr/bin` contains
`libclang.dll`; set `LIBCLANG_PATH` to that directory for bindgen and ensure
CMake is on PATH before running `npm run build:native`.

## Assets and dependency locks

Run from the application repository root:

```powershell
./scripts/fetch-ime-validation-assets.ps1 -IncludeSmall
./scripts/build-ime-helper.ps1
```

The fetch script downloads to ignored `.tools/`, checks the b4846 archive's
SHA256, checks out dictionary revision
`4d418525b090cf49c219819d05a7e3cc2a4346eb`, and checks model sizes/SHA256 against
[`models/manifest.json`](../models/manifest.json). Model URLs include complete
revisions, never `main`. `-IncludeSmall` is optional; xsmall is the default.
An invalid existing file is rejected for inspection instead of overwritten.

AzooKey is pinned to `d59a28e4c7ca049aef04f29a91eae9677a7753f2` with the
`ZenzaiCPU` trait. Transitive Swift dependencies are recorded in Package.resolved.
DLL/archive hashes and toolchain versions are in `windows-dependencies.json`.
The build generates `ggml.lib` from `Windows/ggml.def`, since the b4846 archive
exports the CPU device function in `ggml.dll` but only ships `llama.lib`.
Neither DLL nor header is substituted. The DLL source matches upstream CI:
[b4846 Windows AVX x64](https://github.com/fkunn1326/llama.cpp/releases/tag/b4846).
Do not replace it with a newer release to hide an ABI/link failure.

## Probe

```powershell
$env:Path = "$PWD/.tools/llama-b4846;" + $env:Path
$probe = './helper/.build/x86_64-unknown-windows-msvc/release/ZenzaiProbe.exe'
& $probe './.tools/azookey-dictionary/Dictionary' 'きょうはいいてんき'
& $probe './.tools/azookey-dictionary/Dictionary' 'きょうはいいてんき' './.tools/models/zenz-v3.2-xsmall-q5-k-m/ggml-model-Q5_K_M.gguf'
```

Swift runtime DLLs must also be on PATH during development. stdout reports the
requested engine, model status, candidate list and elapsed conversion time.
`requestedEngine` is deliberately not a success claim: model load failures can
fall back inside AzooKey. The diagnostic patch exposes successful/failed
`llama_decode` counts and model load attempts; integration tests require a
successful decode and a single model load across requests/reset. Learning is
disabled; the helper does not access the legacy app settings or learning DB.

## Integration and staging

```powershell
./scripts/test-ime-helper-integration.ps1
./scripts/stage-ime-helper.ps1
node ./scripts/test-ime-stage.mjs
```

The real helper accepts `<dictionary-directory> [model.gguf]`. It warms the model
before `ready`, then reads stdin independently of the serial converter queue.
Model missing/load failure yields `engine: "azookey"`. Decode failure falls back
for that request; a subsequent short request can use Zenzai again. Empty
readings, reset and shutdown are supported. A second patch bounds model tokens
before KV cache mutation and before filling the 512-token batch. The upstream
default left context suffix is 40 characters.

Model downloads remain explicit developer validation actions, with hash checks
in the fetch and integration scripts. They are not automatic application
downloads and are not packaged inside the helper. See
[smoke results](../docs/validation/2026-10-10-helper-smoke.json).

The stage script inspects PE dependencies recursively and copies resolved
runtime dependencies, the CPU backend, dictionary and available license texts
into `.tools/ime-helper-stage`. It refuses a nonempty destination; use
`-Destination .tools/another-stage` for another build, then pass that path to
`test-ime-stage.mjs`. The test removes developer PATH/SDK/LIB settings and checks
conversion plus malformed input, UTF-8 framing, EOF and DLL failure. This is
PATH isolation on the development host, not a substitute for validation on a
Swift-uninstalled clean Windows machine. The manifest marks the stage as not
ready for distribution while notices/provenance remain open.

## Application integration (P4)

The main process uses the staged helper asynchronously. In PowerShell, select
the tested stage and a manually installed model before starting the app:

```powershell
$env:VRC_IME_HELPER_DIR = (Resolve-Path .tools/ime-helper-stage-v2).Path
$env:VRC_IME_MODEL = (Resolve-Path .tools/models/zenz-v3.2-xsmall-q5-k-m/ggml-model-Q5_K_M.gguf).Path
npm run electron:dev
```

Without a helper override, development uses .tools/ime-helper-stage. Without a
model, the helper uses AzooKey dictionary conversion. Without the staged helper,
the app preserves kana input. Executable/model paths are never accepted from a
renderer. Run `npm run ime:stage` (PowerShell 7) to prepare the packaging stage
`.tools/ime-helper-package`; electron-builder copies it outside app.asar.
Packaged model selection also accepts `--ime-model "C:\models\model.gguf"`.

Test the real application facade without launching SteamVR or posting OSC:

```powershell
node scripts/test-ime-app-integration.mjs .tools/ime-helper-stage-v2
```

## Provenance checks still open

The fixed dictionary checkout contains an Apache-2.0 LICENSE and a `TBW` README,
without a detailed data provenance statement or NOTICE. That alone does not
establish absence of Mozc-derived data. The model repositories advertise
Apache-2.0 in their card metadata. Full distribution notices, corresponding
sources, runtime licensing and clean Windows staging are still P2/P7 work.
