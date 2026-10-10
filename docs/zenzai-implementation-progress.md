# Zenzai implementation progress

Date: 2026-10-10 (JST)

Plan: [implementation plan](../../../docs/IMPLEMENTATION_PLAN.md).
Upstream baseline: `97cdab49918e7fb178988cc29f8b1d146ed9cde2`.
Working branch: `codex/zenzai-mvp`. The original working tree was clean.

## P0: baseline (partial)

| Check | Result |
| --- | --- |
| Node / npm | 24.14.0 / 11.9.0 |
| Rust | 1.94.0 |
| Swift / CMake | Initially absent; installed Swift 6.1.3 / CMake 3.31.8 |
| Visual Studio / LLVM | MSVC 19.43.34810.0 / Windows SDK 10.0.22621.0; Swift's libclang used for bindgen |
| `npm ci` | Passed outside sandbox after sandbox npm failure; lockfile unchanged |
| Existing Vitest suite | 36 files / 445 tests passed outside sandbox |
| `npm run typecheck` | Passed |
| `npm run build` | Passed outside sandbox |
| `npm run build:native` | Passed after CMake installation and `LIBCLANG_PATH` pointing to Swift usr/bin |
| Desktop / SteamVR / controller / actual OSC post | Not tested |

Sandbox test/build attempts failed with Vite `realpath` EPERM. The native
sandbox attempt failed resolving crates.io; the authorized retry fetched crates
and exposed missing CMake, then libclang. Both dependencies are now resolved.
No settings or learning database was edited. Desktop/VR behavior has not been
claimed as a passed baseline.

## P1: Windows release inference passes Gate A

Implemented a persistent Swift `ZenzaiHelper` and isolated `ZenzaiProbe`, pinned
AzooKey with ZenzaiCPU, Package.resolved, dictionary revision and both v3.2
Q5_K_M model revisions/sizes/SHA256. Model files remain in ignored `.tools/`.
The build validates b4846 binary hashes and records dependency/patch metadata.

Windows-specific findings and fixes:

- Process-local Git long paths resolve SPM dictionary-submodule path failures.
- External packages cannot use the upstream package-private `requestQuery`;
  whole-input candidates are filtered through public composing-count metadata.
- b4846 lacks the import library for `ggml_backend_dev_by_type`. A minimal
  `.def` generates the library from the existing ggml.dll export; no DLL or
  header was replaced.
- Separate tracked patches expose successful/failed llama_decode counts and
  model load attempts, and bound token batches before KV cache mutation.
- Direct Win32 ReadFile fixes Foundation stdin short-request buffering. A
  bounded reader queue and serial converter worker keep mutable state isolated.

Real-helper tests pass for dictionary-only, missing/corrupt model, xsmall,
small, Japanese/space paths and missing dictionary. Both models execute decode
successfully and load only once across requests/reset. Empty input and left
context work. Long readings fall back to AzooKey, then short readings recover
to Zenzai. The client status follows the actual per-request engine.

## P2: staging verified on development host; clean host/notices remain open

PE dependency traversal stages 21 DLLs, helper, dictionary and available
licenses, approximately 104.3 MB excluding models. An isolated PATH without
Swift SDK/runtime directories runs dictionary conversion and xsmall inference.
Actual-helper checks also pass for split UTF-8/CRLF, multiple lines, EOF,
malformed JSON, invalid UTF-8, oversized frames, terminal request errors and
missing DLL startup failure. Latest stage: `.tools/ime-helper-stage-v2`.

This does not establish behavior on a Swift-uninstalled clean Windows PC.
Swift/runtime/transitive dependency redistribution notices and detailed
dictionary provenance are incomplete. The stage manifest explicitly marks it
not ready for distribution; no installer/zip has been produced.

See [smoke evidence](validation/2026-10-10-helper-smoke.json) and
[reproduction instructions](../helper/README.md). Sample conversion times are
smoke measurements only, not P8 latency/VR acceptance or a model recommendation.

## P3: transport and real-helper contract tests pass

Implemented independently of Gate A:

- Engine JSDoc contract, ranked candidate normalization, KanaFallbackEngine and
  ZenzaiEngine adapter.
- Absolute-path hidden child launch, strict UTF-8 JSONL framing and bounded
  lines, protocol/result validation, one active and one latest waiting
  conversion, bounded reset barriers, and explicit Promise termination.
- Session reset invalidation before ready and during inference, generation
  guards across crashes/restarts, ready/request/shutdown timeouts, bounded
  restart backoff and disposal.
- [Protocol documentation](ime-helper-protocol.md), Node tests and real-child
  fake-helper fixture. `npm run test:ime-helper`: 31 passed. The fixture does no
  inference. Standard `test:run` now includes this suite after Vitest.
- Test fixtures excluded from electron-builder application files.

At the P3 checkpoint, application integration was still unchanged; 445 Vitest
tests and 31 transport tests passed, along with typecheck.

## P4: asynchronous facade and existing IPC connected

JapaneseConversionService now uses the async engine contract, with one segment
for the full unfinished reading and the engine's first candidate as preedit.
Kana fallback is last, rather than forced first. The application conversion
path no longer constructs legacy providers, Segmenter or LearningStore.
Legacy files/assets remain for separate removal in P7; existing DBs are untouched.

Main validates session/revision before mutation as well as after inference.
Cancel/release/disposal invalidate synchronously. Commit/cancel responses carry
their captured snapshot across reset acknowledgements. Stale results, candidate
snapshots and foreign sessions are rejected. Transport failure uses kana; helper
dictionary fallback retains its AzooKey classification and recovery is allowed.

Existing IPC channels and preload APIs now await the service and carry targets.
Only the keyboard main frame can edit. Reload/navigation completion, renderer
crash and destruction release the session. Settings can obtain status immediately.
Main warms the helper independently of window/overlay startup and waits for its
bounded shutdown before quitting. Renderer integration forwards session and
conversion revision; its live debounce/commit state machine is still P5 work.

Development defaults to .tools/ime-helper-stage. VRC_IME_HELPER_DIR overrides the
development stage, and VRC_IME_MODEL selects a manually installed model path.
Packaged helper paths are resolved centrally to resources/ime-helper/win-x64;
actual extraResources/installer integration is still P7. Missing helper yields
kana input; missing model yields helper dictionary conversion. No automatic
model download occurs.

Validation: 461 Vitest tests and 31 transport tests; typecheck and production
frontend build pass. New facade/IPC tests exercise inverted responses,
reset/commit overlap, stale targets, recovery and renderer lifecycle. Run
node scripts/test-ime-app-integration.mjs .tools/ime-helper-stage-v2 for the real
helper: xsmall gives 今日はいい天気, no/missing model uses AzooKey, missing helper
uses kana; cycling, commit, reset and a new session also pass. These are service
and mocked IPC checks, not a VR/OSC acceptance test. P2 clean-host/notices,
P5–P9 and installer/VR acceptance remain open.

## P5: live conversion and bounded commit state machine implemented

The renderer now debounces full-reading requests for 75ms, with independent
input/result revisions and IPC operation IDs. Kana and unfinished romaji remain
separate; returned candidates display the buffer as a suffix. Backspace deletes
buffer first and then kana, and re-converts the shortened full reading. Space
flushes debounce or cycles a current result. Numeric candidate shortcuts are
enabled only after Space; digits during automatic conversion remain text.

Explicit commit freezes composition and flushes any unsent conversion. It waits
at most 200ms for conversion or an in-flight candidate cycle, then commits the
fixed kana/buffer fallback if needed. Trailing n resolves to ん. Clear/Cancel
invalidate requests and deadlines; mode/caret boundaries commit the current
snapshot or kana, and history replacement discards composition. The reducer
exposes commitSeq and the committed text snapshot without timers, Promises or
DOM calls. The hook owns deadlines/debounce and rejects duplicate/stale replies.

Candidate clicks include the displayed result revision/text. Length filtering
retains engine indexes, so removing an overflowing candidate cannot commit a
different main-process candidate. Completion preserves the existing caret and
mutationSeq synchronization. Unmount releases the editing session, permitting
a remount in the same document; stale release requests cannot clear newer input.

Minimal application wiring shows committing/aria-busy, disables candidate/mode
selection while waiting and routes the primary key to commit whenever preedit
exists. Candidate number hints appear only in explicit selection mode. Full
OSC snapshot handling, send concurrency and engine/model UI remain P6 work.

Validation: 484 Vitest tests and 31 transport tests pass; typecheck and production
frontend build pass. Added controlled-timer tests cover burst debounce, buffer
preservation, inverted replies, Space flush, 200ms fallback, trailing n,
Clear/Cancel/history during commit, stale candidate clicks, candidate-cycle
completion, length limits, unmount and StrictMode. The real-helper facade smoke
still passes for xsmall, dictionary-only, missing model and missing helper.
These are automated logic/service checks, not measured UI latency or VR/OSC
acceptance. P6 is next; P2 clean-host/notices and P7–P9 remain open.

## P6: committed snapshots, OSC send integration and engine status implemented

The primary action commits preedit first and sends only on a later press with
no composition/commit wait. useIME exposes a committed text/edit-sequence
snapshot. useOscSender consumes that immutable snapshot without relying on a
setState flush; a synchronous in-flight guard prevents concurrent manual sends.
Failures retain input for retry. Successful sends record the captured text and
clear only the matching edit generation. The reducer checks again, protecting
queued edits as well as text edited and subsequently restored to the same value.
Newer input and its typing indicator survive a late send completion. Copy mode
uses the same snapshot/conditional-clear path with a separate concurrency guard.

Manual send and Clear cancel trailing auto-send. Empty input, disabling autoSend,
copy mode and unmount also discard queued previews. Previews remain silent and
are initiated by user mutations only; conversion replies alone do not send.
The existing WebSocket JSON and /chatbox/input OSC wire formats are unchanged.

A read-only status hook polls sequentially, stops on unmount and does not open
an IME editing session. The keyboard (including VR) and settings show preparing,
Zenzai, dictionary conversion or kana fallback, with visible explanations for
missing models, inference failure and unavailable helpers. Settings renderers
remain independent of keyboard editing/OSC hooks. No model download UI is added.

Validation: 497 Vitest tests in 38 files and 31 helper transport tests pass;
typecheck and production frontend build pass. Tests include commit-then-send,
unfinished preview versus conversion arrival, simultaneous presses, failed send
and retry, input changed during send, restored strings, queued edits, unmount,
status recovery and polling disposal. Vite test/build need the existing
outside-sandbox realpath workaround on this host.

Run node scripts/test-ime-osc-loopback.mjs for a real local WebSocket-to-UDP
check: Japanese text and emoji arrive as /chatbox/input with direct=true and
both sound=true and sound=false. The script uses an ephemeral localhost UDP
receiver, never VRChat's port 9000. Localhost connection requires execution
outside the sandbox on this host. This verifies bridge receive/wire behavior;
VRChat display, VR layout/controller acceptance and performance remain P8 work.
P7 packaging/legacy removal/CI is next; P2 clean-host/notices remain open.

## P7: packaging/CI and legacy removal implemented; distribution acceptance open

Implemented extraResources staging at resources/ime-helper/win-x64. Stage
manifests now inventory every payload file with size/SHA256, including dictionary
and license texts. Build metadata records the application revision/dirty status,
npm lock, Swift dependency lock, dictionary revision and AzooKey patch hashes.
Transitive Swift package license texts are copied from pinned source checkouts.
Git placeholders are removed before inventorying because electron-builder omits
them. No model weights or diagnostic probe are shipped.

verify-ime-package.mjs checks exact payload inventory, hashes, pinned dependencies
and patches, app/native/SteamVR resources, notices, fork bootstrap identity and
absence of old Mozc assets/providers/learning code in app.asar. afterPack always
checks structure; dist also enforces release readiness. dist:validation creates
explicitly unreleased NSIS/zip artifacts while reporting readiness=false. Gate
fault tests cover dictionary corruption, extra files, missing DLLs, path traversal
and incomplete readiness. NSIS/zip inspection handles directly extracted NSIS
payloads as well as nested app-64.7z payloads.

A separate commit (5025700) removed the legacy dictionary shards, generator,
MozcDictionaryProvider, MicroDictionaryProvider, Segmenter, LearningStore and
obsolete tests/license display from the current tree. Existing databases and Git
history were not touched. Removing those old resources does not resolve the
replacement dictionary's ancestry/provenance.

The fork now has a separate appId/executable/user data directory, SteamVR app key
and overlay keys. bootstrap.js configures user data before ESM services construct
electron-store, avoiding import-order access to upstream settings. Update check,
download and installation are disabled until a fork-owned feed is configured.
Manual model selection supports --ime-model, taking precedence over the existing
environment variable. Model paths remain main-process-only. README, helper and
repository guidance now describe this migration and the validation build.

Windows CI now includes tests/typecheck, pinned Swift helper build/stage, native
build, package gates and extracted artifact checks. A separate job downloads and
hash-checks xsmall, then tests inference on the staged helper. Release is manual,
requires a version tag and completed readiness checks, and creates a draft only.
The obsolete release-json updater no longer runs automatically after Release.
Workflow YAML parses locally; no remote CI run or public release was performed.

Validation at application source 7fa8d684853b5ff853382ac5f208a2c88befa858
(clean tree at staging): 488 Vitest tests in 38 files plus 31 helper transport
tests pass; typecheck and production build pass. Native code was unchanged;
packaging used the previously built native module. Stage fault tests and the
real helper facade (xsmall/dictionary/missing model/missing helper) pass. NSIS
and zip were generated and extracted; both contain 3,414 helper payload files
(99.55 MiB), expected DLLs/licenses, native assets and the fork's SteamVR key.
Extracted helpers convert Japanese and support candidate/commit/reset paths.
Installer: 126.95 MiB (within the unchanged 140/150 MiB thresholds). Zip:
172.76 MiB. Artifact hashes and scope are in
validation/2026-10-10-package-validation.json. A later inspector-only fix handles
the direct NSIS extraction format; it does not change the packaged application.

P7 is not complete as distribution acceptance. Dictionary provenance and full
Swift/runtime/MSVC/transitive notices remain open. The developer-host manifest
still classifies VCOMP140.dll through System32, so it cannot establish a clean
machine's runtime availability. Actual NSIS installation/application GUI startup,
Swift-uninstalled clean Windows and VR/OSC display acceptance have not been
performed. The release gate rejects the current stage for its outstanding
checks. P8 hardware/performance work is still open; see docs/distribution.md.

## P8: helper performance baseline recorded; hardware Gate B open

Added a versioned kana corpus and `npm run ime:benchmark` for both pinned v3.2
Q5_K_M models. It records three spawn-to-ready/first-user trials, 30 samples per
length for memoized replay and distinct-context workloads, real service-queue
traces at 50/75/100 ms debounce, CPU deltas, RAM snapshots, hashes and diagnostics.
Results include all failures/fallbacks/stale replies; successful current-result
percentiles are labelled separately. No production debounce/thread changes.

The retained run used a clean benchmark source tree (9951793), the verified P7
helper stage, and no concurrent tests/builds. Distinct-context long round-trip
p95: xsmall 132.77 ms, small 273.62 ms. With 75 ms debounce, estimated totals
before renderer work are 208/349 ms; actual UI latency is unmeasured. Both models
completed all requests without fallback, with one model load and zero decode
failures. Memoized results are explicitly separated from inference workloads.
Tests (488 +31) and typecheck pass. Production files/native code were unchanged.

See validation/2026-10-10-ime-performance.md and the adjacent raw JSON for
methodology, distributions and the acceptance matrix. SteamVR/VRChat were not
running at measurement start. Model-load/first-inference separation, Electron
IPC/UI paint, installed controller/OSC display, concurrent VR frame time and P7
distribution checks remain open. P8/Gate B is not accepted; P9 must wait.
