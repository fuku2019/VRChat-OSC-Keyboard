# CLAUDE.md

このファイルは、Claude Code (claude.ai/code)がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

VRChat OSC Keyboard — VRChatのプレイヤーがVR内にいながら物理キーボードまたは仮想キーボードで日本語IME変換込みの入力を行い、そのテキストをOSC経由でVRChatのチャットボックスへ送信するWindows専用のElectron + Reactアプリ。さらにSteamVRオーバーレイとして自身を描画することで、ヘッドセットを外さずに操作できる。OpenVRへのアクセスにはRust/napi-rs製のネイティブモジュールを使用している。

## コマンド

```bash
npm install                # JS 依存関係のインストール
npm run build:native       # Rust ネイティブモジュール (native/) をビルドし、配置先へ同期する
npm run ime:build-dict     # Mozc 辞書シャードの再生成 (scripts/ime または元辞書を変更した場合のみ必要)

npm run dev                # vite dev server のみ (ブラウザ動作。OSC は vite の dev ブリッジプラグイン経由)
npm run electron:dev       # フル構成: vite + Electron を同時起動 (Electron が http://localhost:5173 を読み込む)
npm run build              # vite build のみ
npm run dist               # vite build + electron-builder + rename-build-output.js -> release/

npm run test               # vitest ウォッチモード
npm run test:run           # vitest を 1 回だけ実行 (CI 相当)
npx vitest run path/to/file.test.ts   # 単一テストファイルの実行
npx vitest run -t "test name"         # 名前が一致するテストのみ実行

npm run typecheck          # tsc --noEmit (allowJs が有効なため electron/*.js も対象)
npm run native:check       # native/ に対する cargo clippy (-D warnings)
```

`npm run native:check`がこのリポジトリで**唯一**のlintである。JS/TS側にはリンターもフォーマッターも存在しない(eslint/prettier/biome/rustfmtの設定ファイルはどこにもない)。編集時は周囲のファイルのスタイルに合わせること:インデント2スペース、シングルクォート、セミコロンあり、末尾カンマあり。

`native/index.node`と生成される`.dll`/`.d.ts`は**gitignore対象**であるため、クローン直後の状態では`npm run build:native`が成功するまで`electron:dev`も`dist`も実行できない。このビルドにはrustup、MSVCの「C++によるデスクトップ開発」、およびLLVM (bindgen用)が必要 — インストーラのリンクはREADME.mdの「手動ビルド」を参照。これらは一度きりの環境構築であり、タスクごとに導入するものではない。`native/`配下を変更したら必ず再ビルドすること。

テストは対象ソースと同じ階層に配置する(`Foo.ts`に対して`Foo.test.ts`)。これはレンダラー側のツリーと`electron/`の両方で共通。Vitestはjsdom環境で動作するため(`vitest.config.ts`)、Electron側のテストは実際のElectronプロセスを起動せず`electron`とネイティブバインディングをモックする。`.agent/rules/testfile-guide.md`にはPlaywrightへの言及があるが、e2eテストの仕組みは実在しない。

## CIはコード品質をゲートしない

`.github/workflows/release.yml`は`v*`タグで起動し、`npm ci` → `build:native` → `dist`を実行するだけ。テストもtypecheckもclippyも**一切実行しない**ため、これらはローカル専用のゲートであり、コミット前に自分で走らせる必要がある。一方でCIが実際に強制しているのはインストーラのサイズゲートで、140MB超で警告、150MB超でリリースを失敗させる。アセットや辞書シャードを追加する際は注意すること(`sourcemap: false`、`removeLocales.cjs`、manualChunksが存在するのはこのため)。

`release.json`は`update-release-json.yml`がReleaseワークフロー完了後にGitHub APIのレスポンスをそのまま書き込んでコミットするファイルである — 手動で編集しないこと。**アプリ側はこのファイルを一切読んでいない。** アップデート確認の経路は`hooks/useUpdateChecker.ts` → `check-for-update` IPC → `electron/services/ipc/SystemIpcHandlers.js`で、メインプロセスがGitHubのreleases APIを直接fetchしている。したがって`release.json`を更新してもアプリの挙動は変わらない。

## アーキテクチャ

Electron IPCで通信する2つのJSランタイムと、1つのネイティブモジュールで構成される:

1. **レンダラー(ルート直下の`App.tsx`、`components/`、`hooks/`、`stores/`、`services/`、`constants/`、`types/`)** — Vite/React 19のSPA。`src/`を持たないフラット構成。`tsconfig.json`には`@/*`(リポジトリルート)の`paths`があるが、`vite.config.ts`にも`vitest.config.ts`にも`resolve.alias`がないため**実行時には解決されない**(型検査は通るがビルドで壊れる)。importは必ず相対パスで書くこと。状態は`stores/configStore.ts` (Zustand)に集約され、`localStorage`に永続化されるとともに、OSCポートなど一部はメインプロセスへ同期される。アプリの振る舞いの大半は`App.tsx`で合成されるフックにある: `useIME`、`useKeyboardController`、`useOscSender`、`useSendHistory`、`useTypingIndicator`、`useTheme`、`useVrScrollSelectionGuard`。メインプロセスへの橋渡しは`window.electronAPI` (`electron/preload.js`)のみ。Electron外(`npm run dev`)ではこのグローバルが存在せず、OSCは`vite.config.ts`の`oscBridgePlugin`が起動する開発専用WebSocketブリッジを経由する。

2. **Electronメインプロセス(`electron/`、素のESM `.js`)** — アプリのライフサイクル(`main.js`)、ウィンドウ生成(`services/WindowManager.js`)、および関心ごとに`electron/services/ipc/*IpcHandlers.js`へ分割され`electron/services/IpcHandlers.js`で一括登録されるIPCハンドラを担う。主要サブシステム:
   - `services/OscBridgeService.js` — 本番用のOSCブリッジ(vite devプラグインのElectron側相当)。
   - `services/ime/*` + `services/JapaneseConversionService.js` — 日本語IME/変換エンジン(Mozc由来の辞書、分割処理、学習ストア)。かな漢字変換の辞書引きは**メインプロセス側で動作する**。レンダラーの`hooks/imeReducer.ts`は`jp-ime:*` IPCチャンネル経由でこれを呼び出すが、Electron外(`npm run dev`)やIPC失敗時のために**かな/カタカナだけのローカルフォールバック候補**を自前で持っている。学習ストアへの記録はユーザーが実際に選択したアクティブ文節のみが対象(文節移動のUIが存在しないため、他の文節の`selectedIndex`はユーザーの選択ではない)。
   - `overlay.js` + `overlay/*` — SteamVRオーバーレイの生成と駆動、Electronウィンドウの描画フレームのキャプチャ、ネイティブモジュール経由のOpenVRハンドル管理。
   - `input_handler.js` + `input/*` — VRコントローラーの姿勢とトリガーをポーリングし、オーバーレイとのレイ交差判定を計算して、カーソル/トリガー/スクロールのイベントをレンダラーへ送る(`preload.js`の`onCursorMove`/`onTriggerState`/`onInputScroll`)。コントローラーで2D UIを「クリック」できるのはこの仕組みによる。
   - `services/SteamVrManifestService.js` / `SteamVrSettingsService.js` — SteamVRオーバーレイアプリとしての登録、自動起動およびバインディング設定の管理。

3. **`native/` (Rust, napi-rs)** — クレート名`vr-overlay-native`、`cdylib`、ターゲットは`x86_64-pc-windows-msvc`に固定。OpenVR (オーバーレイ生成、D3D11テクスチャ送出、コントローラーの姿勢・入力取得)をメインプロセスへ公開する。`Cargo.toml`で`unsafe_op_in_unsafe_fn = "deny"`を設定しているため、`unsafe fn`の内部であってもすべてのFFI呼び出しに明示的な`unsafe`ブロックが必要 — `unsafe`をgrepすれば未検査コードを網羅できる、という意図。`npm run build:native`は`napi build`の後に`scripts/sync-native.cjs`を実行する。

### 通常のキー入力のデータフロー
物理キー/仮想キー → `useKeyboardController`/`useIME` (レンダラー) → かな変換が必要ならIPCで`JapaneseConversionService` (メイン)へ → `displayText` state → 送信時に`useOscSender` → WebSocketブリッジ(Electronでは`OscBridgeService`、開発時はviteプラグイン) → `node-osc` → VRChatの`/chatbox/input`。

### 入力レイヤーの設計(キャレットの扱い)

入力状態は`hooks/imeReducer.ts`の**純粋なリデューサ1つ**に集約されている。DOM・ref・IPCを一切触らないため、入力の挙動はほぼすべて`hooks/imeReducer.test.ts`で単体検証できる。変更を加えるときはまずここを読むこと。

- **キャレットの正は`state.caret`ただ1つ**で、座標系は常に**確定テキスト(`input`)基準**。表示座標が必要な場合は`displayCaretOf()`などの導出関数を使い、独自に座標変換を書かない。以前は確定テキスト基準と表示基準の2つが混在し、確定後にキャレットが左端へ飛ぶ原因になっていた。
- **不変条件: `preeditStart !== null ⟺ (buffer !== '' || rawKana !== '')`**。「未確定文字列はあるが位置は未定」という状態を作らないこと。
- **DOMへキャレットを書き戻すのは`useKeyboardController.ts`の`useLayoutEffect`ただ1箇所**。`state.caretRevision`が変わったときだけ`setSelectionRange`する。個別のハンドラや`requestAnimationFrame`でキャレットを動かしてはならない。非同期のIPC応答を含む**すべての経路**がここに合流することで整合が保たれている。
- **`handleInputEffect`(タイピング表示・自動送信・履歴解除)は`state.mutationSeq`で駆動する**。`displayText`を監視してはならない。候補の巡回や変換応答はユーザーが何も打たずに表示文字列を変えるため、自動送信が誤発火し履歴走査が解除される。
- **IPCはリデューサの`pending`から`useEffect`が発射する**。呼び出し側から直接`window.electronAPI.ime*`を呼ばないこと。状態を捨てるアクションがリデューサ内で`requestId`を進めるため、遅れて届いた応答が確定済みテキストの裏で未確定文字列を復活させることがなくなる。
- レンダラーが変換状態を捨てる経路では**main側にも`cancel`を送る**(`pending: {kind: 'cancel'}`)。main は独自に変換状態を持つシングルトンなので、通知しないと古い`segments`のまま次の確定に応じてしまう。
- 確定時は`context.expectedText`にレンダラーが実際に確定した文字列を載せる。main は自身の合成結果と一致するときだけ学習する。

### VRコントローラー操作のデータフロー
コントローラーの姿勢(ネイティブモジュール、`input_handler.js`でポーリング) → レイとオーバーレイの交差判定 → IPCでカーソル/トリガーイベント送信 → `CursorOverlay.tsx`と`useVrScrollSelectionGuard`が疑似カーソルを描画し、トリガー押下をクリックへ変換。対象はデスクトップウィンドウと同一のDOM UIで、それを`overlay/capture.js`がオーバーレイへキャプチャしている。

### 設定モーダルの構成

`components/SettingsModal/`はレンダラー内で唯一のサブディレクトリ構成で、`App.tsx`からは`'./components/SettingsModal'`(=`index.tsx`)としてdefault importされる。1ファイルに戻ると1000行超になるため、次の置き場所を守ること。

- `index.tsx`は**シェルだけ**を持つ(サイドバー、タブ切替、`ConfirmDialog`、フックの合成)。設定項目そのもののUIは置かない。
- 設定項目は該当タブ(`GeneralTab` / `AppearanceTab` / `ConnectivityTab` / `SoundTab`)へ追加する。`index.tsx`に直接足さない。
- 行のUIとクラス定数は`settingsRows.tsx`の`ToggleRow` / `TextSwitchRow` / `SettingLabel` / `SECTION_LABEL_CLASS` / `selectedBtnClass`を再利用し、同じマークアップを新たに書かない。
- stateと副作用は`index.tsx`やタブに書かず、`hooks/`の専用フックへ置く: `useSettingsDraft`(ドラフト設定と数値入力)、`useSteamVrSettings`(SteamVRの自動起動登録とバインディング表示)、`useUpdateCheckStatus`(手動アップデート確認)、`useModalFocusTrap`(Tab巡回とEscape)、`useOverlayScrollForward`(VRスクロール転送)。
- `useSettingsDraft`のドラフトは**開いた瞬間にだけストアから再同期される一方、変更は即座にストアへ書き戻される**。この二重の挙動は`hooks/useSettingsDraft.test.ts`が固定しているので、変更するときはテストも確認すること。
- 設定項目を1つ増やすだけなら通常は3箇所で済む: `types.ts`の`OscConfig`へフィールド追加(既定値は`constants/appConfig.ts`と`stores/configStore.ts`)、`constants/translations.ts`へ日英の文言追加、該当タブへ`ToggleRow`などを追加。

## ポートと実行時の前提

- OSC送信先: UDP `127.0.0.1:9000` (VRChatのデフォルト)、`/chatbox/input`に`[text, direct, sound]`を送る。ポートはユーザーが設定可能だが、**誤ったポートでも無言で失敗する** — ユーザーには何も通知されない。
- レンダラー ↔ ブリッジ: `127.0.0.1`上のWebSocket。`OscBridgeService.js`は8080〜8099を走査して空きポートを選ぶが、vite devプラグインは8080固定で`EADDRINUSE`時に警告を出すのみ。`npm run dev`と`npm run electron:dev`を同時に動かすと8080が競合する — `electron:dev`が`IS_ELECTRON=true`を設定しているのは、まさにviteプラグイン側を無効化するため。
- `vite.config.ts`は`base: './'`を設定している。これを変更するとパッケージ済みビルドが壊れる。
- チャットボックスの上限は`CHATBOX.MAX_LENGTH = 144`、120で警告。
- ユーザー側でVRChatのOSCを有効化しておく必要がある(Action Menu → Options → OSC → Enabled)。
- `.env`は不要。関与する環境変数は`IS_ELECTRON` (開発時)と`GH_TOKEN` (CI)のみ。

## リポジトリの慣習

- コメントは`electron/`、`constants/`、`vite.config.ts`、`native/`全体で**日本語と英語の併記**になっている — これらを編集する際は同じスタイルに合わせること。
- コミットメッセージは日本語が大半で、内容を説明する形式。conventional commitsのプレフィックスは使っていない。
- `debug.config.json`は`enableDebugMode`に加え、アップデートチェッカーのテスト用フラグ(`forceUpdateAvailable`、`mockLatestVersion`、`forceInstallerVersion`)を切り替える。
- Mozc辞書のライセンスは`THIRD_PARTY_MOZC_DICTIONARY_LICENSES.txt`で管理している。`electron/assets/ime/mozc/shards/`配下のシャードは生成物であり、手で編集しない。
