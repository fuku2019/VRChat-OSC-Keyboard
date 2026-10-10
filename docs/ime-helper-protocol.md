# IME helper JSON Lines v1

Status: Electron transport, Windows release Swift helper and real-model contract
tests pass. See [helper build instructions](../helper/README.md) and
[validation results](validation/2026-10-10-helper-smoke.json). Production IME
integration is the next step; the existing application path is still unchanged.

## Transport

Electron main owns the child and launches an absolute executable path with an
argument array, `shell: false`, `windowsHide: true` and piped standard streams.
stdout contains only UTF-8 JSON objects, one per LF-terminated line; CRLF is
accepted. Logs go to stderr. The helper must flush every response and exit on
stdin EOF or `shutdown`. Debug messages on stdout are a protocol failure.

Every message has `v: 1` and `type`. One line is at most 1 MiB before LF, including
optional CR. Invalid UTF-8, malformed JSON, incompatible versions, unexpected
responses and mismatched identifiers terminate the helper generation.

## Messages

On startup the helper sends exactly one `ready` after its initial engine state is
known. A missing model can produce an AzooKey ready state. `engine: "zenzai"`
must mean that the model is available; file existence alone is insufficient.

```json
{"v":1,"type":"ready","engine":"azookey","reason":"model-unavailable"}
{"v":1,"type":"convert","id":1,"sessionId":"keyboard","revision":8,"text":"きょうはいいてんき","leftContext":""}
{"v":1,"type":"result","id":1,"sessionId":"keyboard","revision":8,"engine":"zenzai","candidates":[{"text":"今日はいい天気"}],"elapsedMs":73}
{"v":1,"type":"reset","id":2,"sessionId":"keyboard"}
{"v":1,"type":"reset","id":2,"sessionId":"keyboard"}
{"v":1,"type":"shutdown","id":3}
```

The first reset line is a request, the second its acknowledgement. Shutdown ends
the process; its process exit is the acknowledgement. Conversion/reset failures
reply with `error`, echoing `id` and `sessionId` (and `revision` for conversion):

```json
{"v":1,"type":"error","id":1,"sessionId":"keyboard","revision":8,"code":"model-unavailable"}
```

`id` is unique for the lifetime of the client, including restarts. The client also
guards every stream callback by a process generation. `sessionId` is a nonempty
string of at most 128 UTF-16 code units; `revision` is a nonnegative safe integer.
`text` and optional `leftContext` are strings of at most 4096 UTF-16 code units.
The renderer is responsible for only submitting established kana, excluding
unfinished romaji. Context is the committed prefix in the same input field.

Results echo the exact session/revision. `engine` is `zenzai`, `azookey` or `kana`;
it describes the actual conversion path for that result. `elapsedMs` is a finite
nonnegative helper measurement, excluding IPC time. At most 128 candidates may
be returned, each with a string `text` of at most 4096 UTF-16 code units. The
ZenzaiEngine adapter removes empty/duplicate candidates in ranking order and
appends the original kana if it is absent. Empty reading yields no fallback
candidate. The transport never classifies a successful AzooKey result as Zenzai.

## Scheduling and invalidation

There is one executing request and at most one waiting conversion across the
client. Replacing a waiting conversion rejects its Promise with `superseded`.
The executing request completes independently. Renderer/main revision checks
are still required before updating the IME snapshot; the client is not the
authority for the current composition.

`reset(sessionId)` immediately rejects that session's active/waiting conversions
with `cancelled`, including requests waiting for initial ready. An already
executing inference is not interrupted. Its response is validated and discarded,
then reset is sent and acknowledged before subsequent conversions. Reset
barriers are prioritized, with a limit of 32 waiting reset requests; excess
requests reject with `queue-full`. The helper must process converter state
serially and acknowledge reset only once its state has actually been cleared.

Timeouts default to 30 seconds for ready, 2 seconds for a dispatched conversion
or reset, and 1 second for graceful shutdown. Active request timeout terminates
the process, including any still-running synchronous inference. All outstanding
Promises reject on failure or disposal. Node stdin backpressure buffers a write;
the client does not resend it on drain, and never dispatches another request
until the active response arrives.

Failures trigger restart after 1, 2, then 4 seconds, with at most three retries in
60 seconds. Failed requests are never replayed. During backoff callers receive
`unavailable`; after exhausting retries status is `failed`. Disposal cancels
restarts, rejects pending work with `disposed`, sends shutdown/EOF, and kills a
child exceeding the grace period. Status can be read synchronously throughout
startup; overlay startup must not wait on the model.

## Engine boundary and verification

`convert(request): Promise<result>`, `reset(sessionId): Promise<void>`,
`dispose(): Promise<void>` and a synchronous `status` getter form the engine
boundary. `ZenzaiEngine` adapts the transport. `KanaFallbackEngine` is independent
of Mozc, dictionaries and learning stores. The application facade chooses it on
transport failure; the transport does not silently swallow cancellation/errors.

Run `npm run test:ime-helper` for dependency-free Node tests. The normal
`npm run test:run` also runs these tests after Vitest. The fixture exercises a
real child pipe with Japanese UTF-8 and CRLF; it performs no model inference.
Real Swift-helper integration runs with `scripts/test-ime-helper-integration.ps1`;
stage checks run with `node scripts/test-ime-stage.mjs`. The helper reports
decode/load diagnostics only to stderr. Clean Windows and VR checks remain
separate gates.

## Renderer IPC

The existing convert/next-candidate/commit/cancel channel names are retained.
Convert takes a reading and context containing a sessionId, increasing revision
and optional previousText (only the committed prefix in the same field).
Next-candidate and commit target the last conversion's sessionId/revision;
cancel targets the current or a newer revision and invalidates synchronously.
Commit may include expectedText; mismatched candidate snapshots are rejected.
Replies are awaited and failures contain a stable code. The main snapshot is
invalidated before inference and updated only if its local epoch and returned
session/revision still match. No dictionary learning is performed.

Only the keyboard window's main frame can edit. Its session is reset on reload,
renderer crash or destruction. Settings can read jp-ime:status without opening
an editing session. Status is immediately available during helper/model load.
Application quit waits for helper disposal, bounded by the transport's grace
period. The renderer forwards its existing request generation as a conversion
revision. Unmount uses jp-ime:release-session, which validates the target before
releasing ownership and resetting the helper session. A new hook can establish
a new session in the same document.

## Live input and commit deadlines (P5)

Every kana/buffer edit invalidates the prior result and queues the latest full
reading with a 75ms debounce. Buffer text is displayed after converted kana;
Backspace removes buffer first, then one kana. Space flushes debounce or cycles
a matching result and enables numeric candidate shortcuts. Automatic live
conversion keeps numbers as ordinary input. Candidate clicks carry the displayed
result revision and text; they cannot select a newer list by accident.

Commit freezes the current input, flushes any unsent conversion, and waits up
to 200ms. A completed result or candidate cycle commits the selected full text.
On expiry, that fixed reading and remaining romaji are committed; trailing n
resolves to ん. Clear/Cancel invalidate both requests and deadlines. Mode changes
and caret moves outside preedit commit the current visible text or kana without
waiting; history replacement discards composition. During an explicit commit
wait, typing, mode changes and duplicate commits are refused.

The pure reducer exposes commitSeq and committedText as the completion snapshot;
it contains no Promise, timer or DOM calls. The hook owns timers and IPC, guards
duplicate sends during flush/StrictMode, and releases the session on unmount.
Candidate overflow is filtered against the textarea limit while retaining engine
indexes for commits. Conversion-only changes do not bump mutationSeq. Wiring
the completion snapshot into OSC/manual-send handling is P6 work.
