# VrcLiveIme Windows packaging

The fork uses appId io.github.vrcliveime, executable VrcLiveIme.exe, user data
%APPDATA%/VrcLiveIme and the stable SteamVR key vrcliveime.keyboard. It does not
migrate, delete or share upstream settings/learning databases. Its update feed
is disabled until a fork-owned feed is configured. The Git remote still points
to upstream; no release is published automatically by local build commands.

Build the pinned Swift helper using helper/README.md, then run npm run ime:stage.
The packaging stage is .tools/ime-helper-package; the stage command refuses to
overwrite a nonempty directory. Keep earlier stages for comparison or choose
another explicit destination while iterating. Development's default stage stays
.tools/ime-helper-stage. Distribution resources reside at
resources/ime-helper/win-x64, outside app.asar. No model weights are packaged.

For a manually installed model:

```powershell
.\VrcLiveIme.exe --desktop --ime-model "C:\models\ggml-model-Q5_K_M.gguf"
```

--ime-model takes precedence over VRC_IME_MODEL. Model/executable paths stay in
main; no renderer-provided paths are accepted. No model means dictionary-only
conversion, and an unavailable helper preserves kana input.

## Validation and release gates

npm run dist:validation creates an explicitly unreleased NSIS installer and zip
for inspection, while allowing outstanding stage readiness checks. npm run dist
also requires distributionReady=true and no remainingChecks. Structural
verification hashes every helper file (including dictionary/notices), rejects
extra files/weights/probes, checks pinned dependencies and inspects app.asar for
old Mozc assets/providers/learning code. afterPack always runs structural checks.
Run node scripts/verify-ime-package.mjs --app release/win-unpacked --development
to repeat validation. Do not publish validation builds.

Before changing readiness, complete the documented dictionary provenance and
runtime/transitive notice review, validate on Windows without a Swift/toolchain
installation (PATH isolation alone is insufficient), and record the matching
source revision and package hashes. The current stage script deliberately leaves
readiness false; completing these checks requires a reviewed script/metadata
change, not editing a generated manifest to bypass the gate.

## Corresponding sources and rebuild

Retain this complete Git revision, package-lock.json, helper/Package.resolved,
helper/windows-dependencies.json, helper/patches, native/Cargo.lock, and source
for the pinned upstream dependencies. Stage build-metadata.json records build
toolchain, dependency/patch hashes, dictionary revision, application revision
and npm lock hash. Validation built from local changes must retain those changes
as well as HEAD; it is not a reproducible tagged source release.

For a public release, provide the complete corresponding sources alongside the
installer/zip, including local patches and build scripts. Fetch dependency
revisions from the pinned source URLs, apply patches through build-ime-helper.ps1,
build/stage, npm ci, npm run build:native, npm run test:run, npm run typecheck,
then npm run dist. The CI workflow validates this pipeline without publishing;
the release workflow must pass the readiness gate before creating a draft.
Actual installer launch/clean-host/SteamVR acceptance remains a separate check.
