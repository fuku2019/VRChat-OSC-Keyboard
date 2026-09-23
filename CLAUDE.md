# CLAUDE.md

このファイルは、Claude Code (claude.ai/code)がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

VRChat OSC Keyboard — VRChatのプレイヤーがVR内で仮想キーボードを使って日本語IME変換込みの入力を行い、そのテキストをOSC経由でVRChatのチャットボックスへ送信するWindows専用のElectron + Reactアプリ。キーボードはSteamVRオーバーレイとして描画され、ヘッドセットを外さずに操作できる。v2.3.0からVR専用で、デスクトップのキーボードはデバッグ用にだけ残っている(物理キーボード入力はデバッグ時のみ)。OpenVRへのアクセスにはRust/napi-rs製のネイティブモジュールを使用している。

## コマンド

```bash
npm install                # JS 依存関係のインストール
npm run build:native       # Rust ネイティブモジュール (native/) をビルドし、配置先へ同期する
npm run ime:build-dict     # Mozc 辞書シャードの再生成 (scripts/ime または元辞書を変更した場合のみ必要)

npm run dev                # vite dev server のみ (ブラウザ動作。OSC は vite の dev ブリッジプラグイン経由)
npm run electron:dev       # フル構成: vite + Electron を同時起動。デバッグ用のデスクトップキーボードで開く (--desktop-keyboard)
npm run electron:dev:vr    # 利用者と同じ VR モード (--vr --perf-log) で起動。デスクトップには設定ウィンドウだけが出る
npm run electron:dev:perf  # デスクトップキーボード + キャプチャ計測ログ (--desktop-keyboard --perf-log)
npm run electron:dev:vr:eps  # VR モード + カーソル送信しきい値の上書き (--cursor-epsilon=0.005)
npm run build              # vite build のみ
npm run dist               # vite build + electron-builder + rename-build-output.js -> release/

npm run test               # vitest ウォッチモード
npm run test:run           # vitest を 1 回だけ実行 (CI 相当)
npx vitest run path/to/file.test.ts   # 単一テストファイルの実行
npx vitest run -t "test name"         # 名前が一致するテストのみ実行

npm run typecheck          # tsc --noEmit (allowJs が有効なため electron/*.js も対象)
npm run native:check       # native/ に対する cargo clippy (-D warnings)
```

**`npm run electron:dev -- --vr`のように引数を足しても Electron には届かない**。`--`以降は`concurrently`自身が受け取ってしまうためである。起動引数が必要なら`package.json`に専用スクリプトを足すこと(上の`electron:dev:*`はそのために存在する)。

`npm run native:check`がこのリポジトリで**唯一**のlintである。JS/TS側にはリンターもフォーマッターも存在しない(eslint/prettier/biome/rustfmtの設定ファイルはどこにもない)。編集時は周囲のファイルのスタイルに合わせること:インデント2スペース、シングルクォート、セミコロンあり、末尾カンマあり。

`native/index.node`と生成される`.dll`/`.d.ts`は**gitignore対象**であるため、クローン直後の状態では`npm run build:native`が成功するまで`electron:dev`も`dist`も実行できない。このビルドにはrustup、MSVCの「C++によるデスクトップ開発」、およびLLVM (bindgen用)が必要 — インストーラのリンクはREADME.mdの「手動ビルド」を参照。これらは一度きりの環境構築であり、タスクごとに導入するものではない。`native/`配下を変更したら必ず再ビルドすること。

テストは対象ソースと同じ階層に配置する(`Foo.ts`に対して`Foo.test.ts`)。これはレンダラー側のツリーと`electron/`の両方で共通。Vitestはjsdom環境で動作するため(`vitest.config.ts`)、Electron側のテストは実際のElectronプロセスを起動せず`electron`とネイティブバインディングをモックする。`.agent/rules/testfile-guide.md`にはPlaywrightへの言及があるが、e2eテストの仕組みは実在しない。jsdomには`document.elementFromPoint`と`window.matchMedia`がないので、これらを使うコンポーネントのテストではスタブすること(`components/CursorOverlay.test.tsx`参照)。テストファイルは`package.json`の`build.files`にある`!**/*.test.*`でasarから除外されるので、同階層に置いても出荷物には入らない。

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
   - `services/vrOverlayService.js` — SteamVR Input(オーバーレイ表示トグルのアクション)の初期化とポーリング。`state.disabled`は**恒久的な失敗専用のラッチ**で、「オーバーレイマネージャーがまだない」で立ててはならない。VRモードの設定ウィンドウは初期化より先にバインディングを問い合わせるため、以前はここでラッチが立ってセッション中ずっとSteamVR入力が死んでいた。また、バインディングは`initialized=true`になってから1〜2秒遅れて非同期に解決されるので、`hooks/useSteamVrSettings.ts`は解決まで再試行している。
   - `cli.js` / `debugConfig.js` / `services/launchMode.js` — 起動引数の解析、デバッグ設定の読み込み、ウィンドウモードの判定(次節)。

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
コントローラーの姿勢(ネイティブモジュール、`input_handler.js`でポーリング) → レイとオーバーレイの交差判定 → IPCでカーソル/トリガーイベント送信 → `CursorOverlay.tsx`と`useVrScrollSelectionGuard`が疑似カーソルを描画し、トリガー押下をクリックへ変換。対象はキーボードウィンドウのDOM UIで、それを`overlay/capture.js`がオーバーレイへキャプチャしている(VRモードではこのウィンドウはオフスクリーン描画でデスクトップに出ない。次節)。

- `CursorOverlay.tsx`はマウント後に一度も再レンダーしない。カーソル要素は命令的に作り、`style.transform`の書き込みだけで動かす。**カーソルイベントごとにReactのstateを更新したり`top`/`left`で位置を与えたりしないこと**。オフスクリーン描画ではページの変化がそのままオーバーレイのフレームになるため、それがフレームごとの負荷を直接決める。`elementFromPoint`は4px以上動いたときだけ、`requestAnimationFrame`で1フレーム1回にまとめている(トリガー押下時だけは同期で確定させる)。
- カーソルを消す判断はmain側が持つ(レイが外れた瞬間に`input-cursor-hide`を送る)。レンダラー側に無操作タイムアウトを置かないこと。以前あったタイムアウトは、送信の間引きを入れた途端に静止中のカーソルを数秒おきに消していた。置かれたまま動かないコントローラーはネイティブ側が`GetTrackedDeviceActivityLevel`で除外している(`--keep-idle-cursors`で無効化)。
- 調整値は`electron/input/constants.js`にあり、起動引数で上書きできる: 1€フィルタ(`POINTER_MIN_CUTOFF`/`POINTER_BETA`、`--pointer-filter`)、ポーズ予測(`POSE_PREDICTION_SECONDS`=22ms、`--pose-ahead`、`0`で無効)、カーソル送信の間引き(`CURSOR_SEND_EPSILON`、`--cursor-epsilon`)。**`CURSOR_SEND_EPSILON`と`CURSOR_MOVE_EPSILON`は別物**で、前者はレンダラーへ送るかどうか、後者はドラッグの静止判定に使う。混ぜないこと。

### ウィンドウ構成とVRモード

**v3.0.0からアプリはVR専用**である。ウィンドウモードは2つあるが、利用者が使うのはvrだけで、desktopはデバッグ用に残している。

- **vr**(既定): キーボードウィンドウは`webPreferences.offscreen`のオフスクリーン描画で、デスクトップには出ない(`paint`イベントでキャプチャ)。デスクトップには`?mode=settings`で開く設定ウィンドウだけが出る。vsyncから切り離されるため遅延が大きく減るが、**OSのフォーカスを取れないので物理キーボード入力は使えない**(仮想キーのみ。READMEにも既知の問題として書いてある)。
- **desktop**(デバッグ用): キーボードウィンドウ1枚。デスクトップに表示され、`capturePage`のポーリングでオーバーレイへキャプチャされる。`--desktop-keyboard`か、デバッグモード(`--debug`または`debug.config.json`の`enableDebugMode`)で使う。`npm run electron:dev`は`--desktop-keyboard`付きで起動する。

モードは`electron/services/launchMode.js`の`resolveWindowMode`が**起動時に一度だけ**決める(`--vr` > `--desktop-keyboard` > デバッグならdesktop > vr)。SteamVRが動いているかには依存しないので、起動後にウィンドウを作り直すことはない。以前は「SteamVRがなければdesktopに作り直す」2段階の判定があり、起動のたびにウィンドウがちらついていた。**判定をSteamVRの状態や前回のモードの記憶に依存させないこと**。表示切替の設定(`vrOsrMode`)と「オーバーレイを起動しない」(`disableOverlay`)も削除済みで、古いビルドが残した値は`WindowManager.js`が起動時にストアから消している。

SteamVRより先に起動するのは普通の手順である。キーボードウィンドウは起動時に作られ、待つのはオーバーレイだけ。`electron/services/steamVrWatcher.js`がSteamVRをポーリングし(`isSteamVrRunningAsync`、3秒間隔)、起動を検知したら`main.js`の`startVrOverlay()`でオーバーレイを立ち上げる。vrserverのプロセスは`VR_Init`が通るようになる数秒前に現れるので、立ち上げに失敗しても上限回数まで再試行する。状態(`waiting`/`starting`/`running`/`failed`)は`vr-status-changed`で全ウィンドウへ送られ、設定ウィンドウの`components/VrStatusBanner.tsx`が表示する。待機するのはvrモードだけで、デバッグ用のdesktopモードは起動時に一度だけ確認し、SteamVRがなければ待たずにオーバーレイなしで動く。起動中にSteamVRが終了した場合の再待機は未実装(既知の制限)。

- 起動引数は`electron/cli.js`: `--vr` `--desktop-keyboard` `--debug` `--perf-log` `--pose-ahead` `--pointer-filter` `--cursor-epsilon` `--keep-idle-cursors`。
- レンダラーの分岐はルートの`index.tsx`で行う(`?mode=settings`なら`components/SettingsWindow.tsx`)。**`App.tsx`の中で分岐しないこと**。`App`はOSCブリッジとIME IPCを無条件に開くので、設定ウィンドウに2つ目のコピーができて衝突する。
- 設定ウィンドウは`SettingsModal`を`variant='panel'`で全面表示する。VRモードではこれがユーザーの見える唯一のウィンドウで、**閉じるとアプリが終了する**(オフスクリーンのウィンドウが生きている間`window-all-closed`は発火しないため、明示的に`app.quit()`している)。
- 2つのウィンドウ間の設定同期はmain経由のブロードキャスト(`electron/services/ipc/WindowIpcHandlers.js`が送信元以外へ中継)。受信側の`stores/configStore.ts`は**`setConfig`を呼ばずストアへ直書きする**(呼ぶと送り返してエコーが止まらない)。`storage`イベントはパッケージ版の`file://`で届く保証がないので使っていない。
- オフスクリーン描画は変化があったときしかフレームを作らない。そのため`overlay/capture.js`には、静止後120msに1枚だけ強制描画するsettle機構(最後の1枚が落ちると古い絵が残り続けるのを防ぐ)と、オーバーレイ非表示中のキャプチャ停止がある。どちらも消さないこと。
- オフスクリーンのウィンドウではDevToolsが当てにならないので、devではそのコンソールを`[renderer]`接頭辞でターミナルへ流している。
- `--perf-log`は1秒ごとに`[perf] fps/frame/total/bitmap/submit`を出す。無変化の間はフレームが出ないので、`frame`のp95/p99はその空白を含み、カクつきの指標にはならない。

### 設定モーダルの構成

`components/SettingsModal/`はレンダラー内で唯一のサブディレクトリ構成で、`App.tsx`からは`'./components/SettingsModal'`(=`index.tsx`)としてdefault importされる。1ファイルに戻ると1000行超になるため、次の置き場所を守ること。

- `index.tsx`は**シェルだけ**を持つ(サイドバー、タブ切替、`ConfirmDialog`、フックの合成)。設定項目そのもののUIは置かない。
- 設定項目は該当タブ(`GeneralTab` / `AppearanceTab` / `ConnectivityTab` / `SoundTab`)へ追加する。`index.tsx`に直接足さない。
- 行のUIとクラス定数は`settingsRows.tsx`の`ToggleRow` / `TextSwitchRow` / `SettingLabel` / `SECTION_LABEL_CLASS` / `selectedBtnClass`を再利用し、同じマークアップを新たに書かない。
- stateと副作用は`index.tsx`やタブに書かず、`hooks/`の専用フックへ置く: `useSettingsDraft`(ドラフト設定と数値入力)、`useSteamVrSettings`(SteamVRの自動起動登録とバインディング表示)、`useUpdateCheckStatus`(手動アップデート確認)、`useModalFocusTrap`(Tab巡回とEscape)、`useOverlayScrollForward`(VRスクロール転送)。
- `useSettingsDraft`のドラフトは**開いた瞬間にだけストアから再同期される一方、変更は即座にストアへ書き戻される**。この二重の挙動は`hooks/useSettingsDraft.test.ts`が固定しているので、変更するときはテストも確認すること。
- VRモードの設定ウィンドウも同じ`SettingsModal`を`variant='panel'`で使う。`panel`で変わるのはレイアウトのクラス、開閉アニメーション、VRスクロール転送の無効化だけで、設定項目は共通である。設定項目をどちらか一方にだけ足さないこと。
- 設定項目を1つ増やすだけなら通常は3箇所で済む: `types.ts`の`OscConfig`へフィールド追加(既定値は`constants/appConfig.ts`と`stores/configStore.ts`)、`constants/translations.ts`へ日英の文言追加、該当タブへ`ToggleRow`などを追加。

## ポートと実行時の前提

- OSC送信先: UDP `127.0.0.1:9000` (VRChatのデフォルト)、`/chatbox/input`に`[text, direct, sound]`を送る。ポートはユーザーが設定可能だが、**誤ったポートでも無言で失敗する** — ユーザーには何も通知されない。
- レンダラー ↔ ブリッジ: `127.0.0.1`上のWebSocket。`OscBridgeService.js`は8080〜8099を走査して空きポートを選ぶが、vite devプラグインは8080固定で`EADDRINUSE`時に警告を出すのみ。`npm run dev`と`npm run electron:dev`を同時に動かすと8080が競合する — `electron:dev`が`IS_ELECTRON=true`を設定しているのは、まさにviteプラグイン側を無効化するため。
- `vite.config.ts`は`base: './'`を設定している。これを変更するとパッケージ済みビルドが壊れる。
- チャットボックスの上限は`CHATBOX.MAX_LENGTH = 144`、120で警告。
- ユーザー側でVRChatのOSCを有効化しておく必要がある(Action Menu → Options → OSC → Enabled)。
- `.env`は不要。関与する環境変数は`IS_ELECTRON` (開発時)と`GH_TOKEN` (CI)のみ。

## devとパッケージ版の差

devではレンダラーがViteの開発サーバーから読み込まれるぶん遅く、メインプロセスの初期化処理が先に終わることが多い。パッケージ版はディスクから読むので速く、**devでは隠れる競合がパッケージ版でだけ出る**。VRモード導入時に見つかったバグ4件のうち2件(SteamVR入力のラッチ、バインディング一覧の早すぎる確定)はdevでは再現しなかった。VRまわりやウィンドウの起動順序に触れる変更は、`npm run dist`か`npx electron-builder --dir`で作ったビルドでも確かめること。

- SteamVRへのアプリ登録(`SteamVrManifestService.js`)は、起動のたびに`binary_path_windows`を**自分の実行ファイルのパス**で書き直す。リポジトリ内の`release/win-unpacked/`を実行すると登録先がそこに変わるので、確認後はインストール版を一度起動して戻すこと。`app_key`は実行ファイル名から作られる。
- パッケージ版を`cmd`から起動すると、終了後もプロンプトが戻らないように見えることがある。プロセスは終了しているので、残骸を疑う前に`Get-Process`で確認すること。

## リポジトリの慣習

- コメントは`electron/`、`constants/`、`vite.config.ts`、`native/`全体で**日本語と英語の併記**になっている — これらを編集する際は同じスタイルに合わせること。
- コミットメッセージは日本語が大半で、内容を説明する形式。conventional commitsのプレフィックスは使っていない。
- `debug.config.json`は`enableDebugMode`に加え、アップデートチェッカーのテスト用フラグ(`forceUpdateAvailable`、`mockLatestVersion`、`forceInstallerVersion`)を切り替える。`electron/debugConfig.js`がuserData → アプリ直下の順に探し、`--debug`を付けると`enableDebugMode`が強制的に有効になる。**`build.files`には含めないこと**。リポジトリのものは`forceUpdateAvailable: true`なので、出荷すると偽の更新通知が出る。
- 作業ツリーはCRLF(`core.autocrlf=true`)。新しく作るファイルも既存に合わせてCRLFにする。
- Mozc辞書のライセンスは`THIRD_PARTY_MOZC_DICTIONARY_LICENSES.txt`で管理している。`electron/assets/ime/mozc/shards/`配下のシャードは生成物であり、手で編集しない。
