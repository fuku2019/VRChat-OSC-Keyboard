# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VRChat OSC Keyboard — a Windows Electron + React app that lets VRChat players type (with full Japanese IME conversion) using a physical or virtual keyboard while in VR, and sends the text to VRChat's chatbox via OSC. It also renders itself as a SteamVR overlay so it's usable without leaving the headset, using a Rust/napi-rs native module for OpenVR access.

## Commands

```bash
npm install                # install JS deps
npm run build:native       # build the Rust native module (native/) and sync it into place — required after any change under native/
npm run ime:build-dict     # regenerate Mozc dictionary shards (only needed after editing scripts/ime or the source dictionary)

npm run dev                # vite dev server only (browser, no Electron/overlay/OSC-bridge-in-Electron)
npm run electron:dev       # full app: vite + Electron together (electron.js loads http://localhost:5173)
npm run build               # vite build only
npm run dist                # vite build + electron-builder + rename-build-output.js -> release/

npm run test                # vitest watch mode
npm run test:run            # vitest run once (CI-style)
npx vitest run path/to/file.test.ts   # run a single test file
npx vitest run -t "test name"         # run tests matching a name

npm run typecheck           # tsc --noEmit
```

There is no lint script configured. Building the native module requires Rust (rustup), the MSVC C++ build tools, and LLVM (for bindgen) — see README.md "手動ビルド" for the exact installer links; these are one-time environment setup, not something to install per task.

Tests live next to the source file they cover (`Foo.ts` + `Foo.test.ts`), across both the renderer tree and `electron/`. Vitest uses jsdom (`vitest.config.ts`), so Electron-side tests mock `electron`/native bindings rather than running a real Electron process.

## Architecture

The app is two separate JS runtimes talking over Electron IPC, plus one native module:

1. **Renderer (root-level `App.tsx`, `components/`, `hooks/`, `stores/`, `services/`, `constants/`, `types/`)** — a Vite/React 19 SPA. State is centralized in `stores/configStore.ts` (Zustand, persisted to `localStorage`, and synced to the main process for things like OSC port). Most app behavior lives in hooks composed together in `App.tsx`: `useIME` (kana buffer/conversion state), `useKeyboardController` (physical + virtual key routing), `useOscSender`, `useSendHistory`, `useTypingIndicator`, `useTheme`, `useVrScrollSelectionGuard`. `window.electronAPI` (defined in `electron/preload.js`) is the only bridge to the main process; when running outside Electron (`npm run dev`), that global is absent/no-ops and OSC instead goes through the dev-only WebSocket bridge started by the `oscBridgePlugin` in `vite.config.ts`.

2. **Electron main process (`electron/`)** — owns app lifecycle (`main.js`), window creation (`services/WindowManager.js`), and all IPC handlers, split by concern under `electron/services/ipc/*IpcHandlers.js` and registered centrally in `electron/services/IpcHandlers.js`. Key subsystems:
   - `services/OscBridgeService.js` — the production OSC bridge (equivalent to the vite dev plugin, but running in Electron).
   - `services/ime/*` + `services/JapaneseConversionService.js` — the Japanese IME/conversion engine (Mozc-derived dictionary, segmentation, learning store). The renderer's `useIME` calls into this over IPC (`jp-ime:*` channels in `preload.js`); it does not run IME logic itself.
   - `overlay.js` + `overlay/*` (`capture.js`, `native.js`, `transform.js`, `state.js`) — creates and drives the SteamVR overlay, captures the Electron window's rendered frames into it, and manages OpenVR handles via the native module.
   - `input_handler.js` + `input/*` (`controllers.js`, `drag.js`, `events.js`, `mapping.js`, `smoothing.js`, `state.js`, `trigger.js`) — polls VR controller poses/triggers, computes overlay ray-intersection hits, and synthesizes mouse/cursor/scroll events that get sent to the renderer (see `onCursorMove`/`onTriggerState`/`onInputScroll` in `preload.js`) — this is how controllers "click" on the 2D UI rendered into the overlay.
   - `services/SteamVrManifestService.js` / `SteamVrSettingsService.js` — registers the app as a SteamVR overlay app and manages its auto-launch/binding settings.

3. **`native/` (Rust, napi-rs)** — compiles to `native/index.node`, exposing OpenVR (overlay creation, D3D11 texture submission, controller pose/input queries) to the main process. Source is organized under `native/src/overlay/*` (manager, handles, texture/overlay/input ops, math, types). Building it (`npm run build:native`) runs `napi build` then `scripts/sync-native.cjs` to place the compiled binary where `electron/` expects it. Rebuild whenever anything under `native/` changes — the compiled `.node`/`.dll` files are committed as build artifacts, not derived at install time.

### Data flow for a typical keystroke
Physical/virtual key → `useKeyboardController`/`useIME` (renderer) → if kana needs conversion, IPC to `JapaneseConversionService` (main) → `displayText` state → on send, `useOscSender` → WebSocket bridge (`OscBridgeService` in Electron, or the vite plugin in dev) → `node-osc` → VRChat's `/chatbox/input` OSC endpoint.

### Data flow for VR controller interaction
SteamVR controller pose (native module, polled in `input_handler.js`) → ray/overlay intersection → cursor/trigger events sent over IPC → renderer's `CursorOverlay.tsx` + `useVrScrollSelectionGuard` render a synthetic cursor and translate trigger presses into clicks on the normal DOM UI (the same UI the desktop window shows, captured into the overlay by `overlay/capture.js`).

## Notes specific to this repo

- `debug.config.json` toggles `enableDebugMode`, read by both `main.js` (window title) and exposed to the renderer via `isDebugMode` IPC.
- `release.json` and the `.github/workflows/*.yml` are about the GitHub Releases auto-update flow (`useUpdateChecker.ts` polls this); not something to hand-edit as part of feature work.
- Mozc dictionary licensing is tracked in `THIRD_PARTY_MOZC_DICTIONARY_LICENSES.txt`; regenerating shards (`npm run ime:build-dict`) is only needed when the source dictionary changes.
- Bilingual (Japanese/English) code comments are the existing convention throughout `electron/` and shared modules — match this style when editing those files.
