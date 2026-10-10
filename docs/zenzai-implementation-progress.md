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
| Swift / CMake / clang on PATH | Not found |
| Visual Studio | Community 2022 directory exists; required CMake/LLVM tools not found in checked component paths |
| `npm ci` | Passed outside sandbox after sandbox npm failure; lockfile unchanged |
| Existing Vitest suite | 36 files / 445 tests passed outside sandbox |
| `npm run typecheck` | Passed |
| `npm run build` | Passed outside sandbox |
| `npm run build:native` | Failed: `openvr_sys` build cannot execute `cmake` (program not found) |
| Desktop / SteamVR / controller / actual OSC post | Not tested |

Sandbox test/build attempts failed with Vite `realpath` EPERM. The native
sandbox attempt failed resolving crates.io; the authorized retry fetched crates
and reached the CMake error above. These are recorded separately from source
regressions. No settings or learning database was edited. Native output was not
produced, so desktop/VR behavior has not been claimed as a passed baseline.

## P1 / P2: not yet validated

Swift is not available on PATH or in the checked standard Swift toolchain
locations. No Swift helper, GGUF inference, DLL ABI compatibility, model hash
verification, runtime staging or clean Windows validation has been completed.
Gate A remains open. No model was downloaded, no global toolchain was installed,
and no fake-helper result is counted as inference evidence.

Next environment work: install/activate Swift 6.1+ Windows development tools
supporting dependency traits, CMake and the required MSVC/LLVM components; rerun
the native baseline, then build the pinned AzooKey revision with ZenzaiCPU and
the b4846 headers/libraries before evaluating verified v3.2 model files.

## P3: transport implementation complete; real-helper contract test pending

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
  fake-helper fixture. `npm run test:ime-helper`: 30 passed. The fixture does no
  inference. Standard `test:run` now includes this suite after Vitest.
- Test fixtures excluded from electron-builder application files.

Production JapaneseConversionService, IPC, renderer, native overlay and OSC
paths are unchanged. No legacy dictionary or learning data was removed. P4–P7
switch/removal work awaits Gate A and the real-helper contract test. P8/VR and
P9/model download UI have not been started.
