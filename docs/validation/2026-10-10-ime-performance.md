# P8 developer-host performance baseline (Gate B open)

Measured 2026-10-10 on Windows 10.0.26200 x64, Ryzen 7 5700X3D,
16 logical CPUs, approximately 64 GiB RAM, Node 24.14.0. SteamVR/VRChat/
steam_link process names were absent at the start. This is a helper-only baseline,
not any of the required SteamVR/VRChat concurrent-load acceptance conditions.
Tests/builds were not run concurrently with the retained measurement. An earlier
measurement overlapping tests was discarded.

Raw samples, CPU/RAM snapshots, model/helper/stage/corpus hashes, source revision
and diagnostics: [2026-10-10-ime-benchmark.json](2026-10-10-ime-benchmark.json).
Benchmark source: 9951793fa8523c31ea2e92e49b4c80d970792117 (clean tree).
The staged helper is the existing P7 artifact, not a newly compiled helper;
its build metadata identifies application source 7fa8d68 and AzooKey d59a28e.
Model weights match the pinned v3.2 Q5_K_M manifests.

Reproduce from the repository root after staging verified dependencies and both
models with `scripts/fetch-ime-validation-assets.ps1 -IncludeSmall`:

```powershell
node scripts/verify-ime-package.mjs --stage .tools/ime-helper-package --development
npm run ime:benchmark
```

The command writes `.tools/ime-benchmark-results.json`; it does not launch the
application, alter settings, send OSC, or download models. Default samples are
30 per case/workload; `IME_BENCH_SAMPLES` can increase that count. Close other
benchmarks/builds before measuring. For each hardware load condition below,
retain a separate report with the condition, power mode and runtime versions.
Restarting the helper does not flush the OS file cache.

## Startup and conversion

Startup is spawn-to-ready, including dictionary initialization, model loading
and one warm-up inference. The first user request is **after** that warm-up.
These measurements do not separate model loading from first inference or
establish disk-cold latency. Three starts per model provide observations, not
a stable tail-latency estimate (nearest-rank p95/p99 equal max at this count).

| Model | Ready p50 / max (ms) | First user request p50 / max (ms) |
| --- | ---: | ---: |
| xsmall | 71.93 / 75.72 | 19.21 / 19.65 |
| small | 90.35 / 92.90 | 23.57 / 25.18 |

Warm conversions use a persistent helper, reset composition before each request,
and rotate short/medium/long inputs. `distinct-context` appends
`第N回の会話。` to the fixed left context, for N=1..30. Caches stay enabled;
this varies the resolved-conversion cache key while retaining normal shared
dictionary/prefix caching. It is not a completely uncached inference benchmark.
Readings and the timed edit trace are fixed in [ime-corpus-v1.json](ime-corpus-v1.json).
This kana-boundary corpus is not a romaji/UI test or a conversion-quality gold set.

All values below are milliseconds. Helper time includes conversion/candidate
construction. Round trip additionally includes Node scheduling and JSONL/service
overhead; their difference is **not** an isolated Electron IPC measurement.
Each row has 30 neural responses, with no errors or fallbacks. Percentiles use
nearest rank; with 30 samples p99 is max and should not be overinterpreted.

| Model | Case | Helper p50 / p95 / p99 | Round trip p50 / p95 / p99 |
| --- | --- | ---: | ---: |
| xsmall | short | 8.32 / 10.21 / 10.27 | 8.54 / 10.43 / 10.57 |
| xsmall | medium | 38.56 / 43.53 / 45.52 | 38.79 / 43.76 / 45.75 |
| xsmall | long | 119.64 / 132.51 / 134.78 | 119.94 / 132.77 / 135.10 |
| small | short | 25.75 / 29.44 / 31.96 | 26.00 / 29.69 / 32.25 |
| small | medium | 90.61 / 102.11 / 105.29 | 90.89 / 102.45 / 105.62 |
| small | long | 260.66 / 273.25 / 294.75 | 261.02 / 273.62 / 295.16 |

The separate `cached-replay` workload repeats identical inputs/contexts across
resets. Its round-trip p95 is only 1.10/2.84/3.26 ms (xsmall) and
1.13/2.94/3.25 ms (small). Those values demonstrate memoization, not general
inference speed. First medium/long observations remain in the raw samples and
produce much higher p99. Merely alternating three texts does not defeat the
upstream multi-entry cache. Final diagnostics show 127 successful decodes,
zero failed decodes and one model-load attempt in each measured helper process.

## Debounce trace and resource use

The same seven timed kana edits are replayed three times per debounce, using
distinct left contexts for each setting/trial. The service's real latest-only
queue is used. Latency starts at the **actual** edit callback and ends at service
receipt. Responses for revisions already superseded are recorded in raw samples
and excluded from current-result latency. This is neither React paint nor
overlay/controller latency. Different debounces emit different request counts;
the table alone cannot select a production debounce or compare typing quality.

| Model | Debounce | Current responses | Stop-to-service p50 / p95 / p99 (ms) |
| --- | ---: | ---: | ---: |
| xsmall | 50 ms | 18 | 57.14 / 65.29 / 65.29 |
| xsmall | 75 ms | 6 | 86.36 / 91.33 / 91.33 |
| xsmall | 100 ms | 6 | 110.76 / 115.76 / 115.76 |
| small | 50 ms | 7 | 61.68 / 79.38 / 79.38 |
| small | 75 ms | 6 | 102.74 / 106.88 / 106.88 |
| small | 100 ms | 6 | 127.46 / 133.37 / 133.37 |

No trace request failed or fell back. All final revisions completed. Small's
50 ms trace has fewer current responses because intermediate results became
stale. The trace contains short text; it does not cover the long-input tail.

| Model | Helper CPU time / phase wall | Average CPU, whole-machine scale | Lifetime peak working set | End private bytes |
| --- | ---: | ---: | ---: | ---: |
| xsmall | 63.08 s / 11.40 s | 34.58% | 69.23 MiB | 88.64 MiB |
| small | 116.84 s / 18.05 s | 40.46% | 130.60 MiB | 101.52 MiB |

CPU is process TotalProcessorTime delta over both warm workloads and all trace
trials (including waits/reset), divided by wall time and 16 logical CPUs.
It is not a sampled utilization peak or whole-app usage. Working set high-water
marks include startup and mapped model pages. Private bytes are end snapshots,
not peak memory. PowerShell resource snapshots run outside timed conversions.
CPU inference thread count is not exposed by the current helper CLI/options.
Upstream selects it privately from processor topology. No thread-count or
production debounce changes were made based on this baseline.

## Gate B and remaining acceptance work

The initial target is input-stop-to-UI p95 <=200 ms, with 50–100 ms as an
improvement goal. It has **not** been measured here. Adding the current 75 ms
debounce to the distinct-context long-input p95 gives approximately 208 ms
(xsmall) and 349 ms (small), before renderer/overlay work. These are arithmetic
estimates, not measured total-latency percentiles. Small long inputs are a
performance concern; xsmall is the better next hardware-test baseline. Do not
claim the short trace passes the UI gate or promote either model based on this
single host/corpus. Keep P9 and release readiness blocked on actual Gate B.

| Acceptance item | Evidence / remaining work |
| --- | --- |
| Unit/transport/type checks | 488 Vitest +31 transport tests and typecheck pass in this phase. Production code unchanged; P7 build evidence remains applicable. |
| NSIS/zip helper and dictionary, old Mozc absent | P7 extracted artifact checks passed; see package-validation.json. Actual installation/GUI startup remains pending. |
| Crash/timeout/missing model fallback; stale result rejection | Automated transport/reducer/facade evidence exists; repeat through installed controller/UI flows on hardware. |
| Full romaji -> kana -> whole-text conversion -> commit | Installed app/controller acceptance pending; this benchmark starts with kana. |
| Japanese OSC `/chatbox/input` in VRChat | P6 isolated loopback passed; actual VRChat display pending. |
| Clear/Backspace/mode/commit-wait/restart | Existing automated state tests pass; controller/UI acceptance pending. |
| Separate load / first inference / Electron IPC / UI paint | Add opt-in timing points on those boundaries; current helper ready protocol combines startup stages. |
| Concurrent performance | Repeat under SteamVR only, SteamVR + VRChat, and SteamVR + VRChat + Steam Link (if used), for both models and identical corpus/trace. |
| Frame-time regression | Capture repeated pre-change baselines on the same scene/HMD/refresh rate; derive acceptable variation from those runs, then compare CPU/GPU frame-time distributions under IME load. No invented fixed tolerance. |
| Clean Windows and notices | P7 runtime availability (including VCOMP140.dll), dictionary provenance, full notices and remote CI remain open. |

Hardware records should identify runtime/app/model versions, scene/avatar,
HMD/refresh rate, streaming settings, power mode, capture method, sample counts,
failures/fallbacks and p50/p95/p99. Measure end-to-end UI/overlay timing separately
from helper inference. Retain all stale/cancelled/failed outcomes when comparing
debounces; only accept a setting after checking controller typing/commit behavior
and concurrent frame time. P8 is partially implemented, not accepted.
