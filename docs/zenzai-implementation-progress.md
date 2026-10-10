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
