# VrcLiveIme：Tauri / WebView2移行実行計画

作成日：2026-10-20（JST）

対象：`upstream/VRChat-OSC-Keyboard`。調査時のGit HEADは `3cc9d8d`、branchは `codex/zenzai-mvp`、working treeはclean。

本書は実行計画である。今回行うのは文書作成のみ。依存導入、branch作成、アプリ改修、ビルド、SteamVR登録変更は開始していない。実行開始時にHEADとworking treeを再記録する。

## 1. 目的と移行方針

Electronが同梱するChromium / Node.jsを配布物から除き、WindowsのWebView2 Runtimeを利用するTauri 2へ移行する。既存のReact画面、ローマ字入力、日本語変換、SteamVR操作、VRChatへのOSC送信を維持する。

最大の不確実性は、WebView2の描画をデスクトップ上にキーボードを表示せずSteamVRへ供給できるかである。最初に小さな実機検証を行い、成立後にアプリ全体を移植する。Tauri標準APIでElectronのoffscreen / paintを置換できるとは仮定しない。

| 項目 | 方針 |
|---|---|
| 初期対象 | Windows x64。最初の受入環境はWindows 11 + SteamVR実機 |
| UI | React / TypeScript / Tailwind / Zustand / Viteを継続 |
| ホスト | Tauri 2 + Rust。Windows固有の描画はWebView2 / Direct3D連携で実装 |
| VR | 既存OpenVR / D3D11処理の中核を再利用し、Node-API依存を分離 |
| IME | Swift helper、AzooKey / Zenzai、JSONL v1を維持 |
| OSC | 製品内の送信はRustからUDPで実施。Node.jsの常駐ブリッジを不要にする |
| WebView配布 | Evergreenの共有Runtimeを利用。未導入時のbootstrapper取得を設定 |
| 開発環境 | Node.js / npmはVite・Reactのビルドに使用。製品には同梱しない |
| 移行中 | Electron版を比較・復帰用に保持。既定起動経路の切替は受入後 |
| 初回の範囲外 | UI刷新、IMEエンジン変更、GPU推論、macOS / Linux対応、新規更新配信基盤 |

Windows 10の対応可否と最低OS / WebView2バージョンは、採用するキャプチャAPIの必要条件を確認した上でGate Aで決める。WebView2であることだけを根拠に対応OSを広げない。

## 2. 現行実装から確認した移植箇所

| 現行ファイル・領域（アプリrepo相対） | 移行内容 |
|---|---|
| `electron/main.js`, `bootstrap.js`, `services/WindowManager.js` | 起動、終了、desktop / VR切替、複数画面、SteamVR待機をRustへ |
| `electron/preload.js`, `types/global.d.ts`, `services/ipc/` | API一覧と型を棚卸しし、プラットフォーム共通契約とTauri実装へ |
| `electron/overlay/capture.js` | `paint` / `capturePage`をWebView2描画取得へ置換 |
| `electron/input_handler.js`, `electron/input/` | コントローラー処理、フィルタ、カーソル、トリガー、スクロールをRustへ |
| `native/src/overlay/` | `napi::Buffer`, `napi::Result`, `#[napi]`とOpenVRロジックを分離 |
| `electron/services/ime/`, `JapaneseConversionService.js` | helper監督とsession / revision管理をRustへ |
| `helper/`, `models/manifest.json` | エンジン・モデル固定を維持し、配置と起動元を変更 |
| `OscBridgeService.js`, `services/oscService.ts`, `hooks/useOscSender*` | RustのOSCコマンドを追加。外部ブリッジ設定があれば互換経路を残す |
| `stores/configStore.ts`, `hooks/useSendHistory.ts` | localStorageデータの引き継ぎ、複数画面の設定同期 |
| `SteamVrManifestService.js`, `SteamVrSettingsService.js`, `steamVrWatcher.js` | 登録・自動起動・状態監視をRustへ |
| `vite.config.ts`, `package.json`, `scripts/`, `.github/workflows/` | 開発ブリッジ抑止、Tauriビルド・配布・CI検証 |

現在の描画はoffscreen `paint`で更新画像を取得し、Rustへ渡す方式。90 FPSのキャプチャ目標、120 Hzの入力ポーリングがあるが、これは実測性能や移行後の保証値ではない。

既存配布ドキュメントではモデル重みは非同梱。サイズ比較も同じ条件で行う。手元の `release/win-unpacked/VrcLiveIme.exe` は約234.7 MiBだが、既存出力の観測値であり、新規再現ビルドの基準値ではない。

## 3. 目標構成と成果物

```text
React UI ── Platform API ── Tauri commands / events ── Rust host
                                                    ├─ OSC / UDP → VRChat
                                                    ├─ stdin/stdout JSONL → Swift IME helper
                                                    ├─ 設定保存 / SteamVR登録 / 起動管理
                                                    └─ VR core + WebView2 capture → D3D11 → OpenVR
```

配置候補は `src-tauri/`（製品ホスト）、`crates/vr-core/`（Node非依存のVR処理）、`platform/`（UI側の共通契約とElectron / Tauri adapter）。描画試作は `experiments/webview2-vr/` に隔離する。正確なcrate構成はGate Aの結果で確定する。

VR coreの公開境界は通常のRust型・エラーにする。GPU / COM / OpenVRオブジェクトを無条件に `Send` / `Sync` にせず、所有スレッド、破棄順、COM apartment、D3Dデバイス共有を設計してから接続する。

## 4. 実装順序と判定点

```text
P0 基準測定 → P1 WebView2 / VR試作 → Gate A 描画・入力の成立
  → P2 Rust core分離 + Tauri UI土台
  → P3 OSC・設定・アプリ管理 → P4 IME → P5 製品VR統合
  → P6 配布・サイズ比較 → Gate B 機能・性能・配布受入
  → P7 既定切替・Electron依存撤去
```

各Pをレビュー可能なコミット単位に分け、検証ログをアプリrepoの `docs/validation/tauri/` に保存する。Gateは測定に基づく技術判定であり、自動的に公開を行う手順ではない。

### P0：現行版の基準測定と互換仕様

1. 実行時のGit状態、OS、GPU / driver、SteamVR、HMD、WebView2 Runtime、Node / Rust / Swift / MSVC / SDKを記録する。移行作業用branchを用意し、元のコミットを保持する。
2. 現行版の `npm ci`, `npm run test:run`, `npm run typecheck`, `npm run build`, `npm run native:check`, `npm run build:native` を検証する。既存失敗は移行による失敗と分ける。
3. 同一helper stageを使い、配布ゲートに従う検証ビルドを作る。インストーラー圧縮サイズ、展開合計、本体・Chromium・helper / 辞書・その他の内訳を記録する。
4. desktop / VRで入力、ライブ変換、候補選択、確定、送信、履歴、設定、自動起動、SteamVR後起動・再起動を基準動作として記録する。
5. `preload.js`全API、起動引数・環境変数、localStorageキー、electron-storeの保存内容を一覧化し、移植先と受入項目を対応づける。更新配信は現状無効を維持する。
6. 同じ解像度・表示内容で、初回 / 通常起動時間、プロセス群のメモリ、CPU、GPU、描画更新間隔、入力から画面更新までの遅延を測る。idleと継続入力を分け、計測の限界も残す。

完了条件：比較可能な基準記録、互換API一覧、再現手順が揃う。実機未測定ならその項目を未完了とする。

### P1：WebView2からSteamVRへの最小試作

1. 安定版Tauri 2 / Wry / WebView2関連crateの組み合わせと必要Rust / SDKを調査して固定する。preview APIを必須条件にしない。
2. 静止画像、透明領域、色テスト、連番アニメーション、最小Reactキーボードを表示する試作を作る。現在のReact画面も読み込み、Tauri上でのUI互換を確認する。
3. CompositionControllerを使う合成ホストとWindows Graphics Capture等による取得経路を検証候補にする。CompositionController単体でWebView描画テクスチャが取得できるとは扱わない。
4. 必要に応じて通常のWebView2ウィンドウのキャプチャを比較用に作る。可視ウィンドウだけで動く経路は診断用途であり、最終合格にはしない。CPU readbackは比較・切り分け用とし、継続使用は実測で判断する。
5. 取得フレームをD3D11 / OpenVRへ供給し、BGRA / RGBA、premultiplied alpha、stride、上下方向、GPU adapter / device共有、同期と寿命を確認する。
6. デスクトップ上にキーボードを露出させず、非フォーカス、遮蔽、最小化、表示切替後にも更新が継続するか確認する。OSのキャプチャ許可や枠表示が必要になる場合は記録する。
7. VR座標からDOM座標へのDPI変換、左右カーソル、トリガー、スクロール、ドラッグを試す。既存のUIイベント経路を優先し、必要なネイティブ入力転送は別に検証する。
8. 通常のTauri / Wryホストに組み込めるかまで確認する。独立WebView2ホストだけで成功した結果を、そのままTauri成功としない。

Gate Aの合格条件：

- HMD実機でReactキーボードと透明領域が正常表示され、デスクトップに入力画面を出さず操作できる。
- カーソル・トリガー・スクロールが動作し、1操作につき意図したイベント数になる。
- idle後の最初の変更、カーソルを消した最後のフレーム、再表示時の更新が欠けない。
- 非フォーカス状態を含む30分の反復操作で、描画停止・再現性のあるクラッシュ・資源の継続増加がない。
- 同一条件で入力→表示p95の増加が暫定上限20 ms以内、継続更新間隔p95が基準の1.2倍以内。idle中は無駄な常時コピーを避ける。測定手法と最終閾値をP0で固定し、後から緩和する場合は理由を記録する。
- 利用API、最低OS / Runtime、Tauriへの組込み方法、既知制限を文書化できる。

直接測れない入力→光子遅延は、ホスト入力受信→フレーム提出の測定と区別し、体感のみで数値合格にしない。実機や計測環境不足は保留とする。

Gate A不成立時：製品全体の移植を進めず、原因・試した経路・残る制約を記録する。Tauri統合だけが阻害要因なら、Rust + Wry / WebView2直接ホストを同じ受入条件で評価候補にする。Electron継続・VR UIの別描画への変更は別の方針判断とし、自動的に採用しない。

### P2：Rust core分離とTauri UI土台

1. OpenVR / D3D11の処理をNode非依存のcrateへ抽出する。既存 `native` は薄いnapi wrapperにして、Electron比較版が動く状態を保つ。
2. TauriにReact / Viteを接続し、desktop画面・設定画面とリリース時の静的資産読み込みを実装する。
3. `PlatformApi`を定義し、Electron / Tauri adapterを用意する。UI内の `window.electronAPI` 直接参照を段階的にadapterへ寄せる。購読解除、エラー型、起動情報を含める。
4. Tauriのコマンド・イベントを画面ごとに許可し、ローカルUIのみに権限を与える。任意ファイル・任意実行・任意URLの汎用コマンドを公開しない。
5. Tauri開発時は `vite.config.ts` のNode OSCブリッジを起動しない条件を追加し、既存Electron / ブラウザー開発とのポート競合を防ぐ。

完了条件：両ホストで既存UIが起動し、Electron比較版のVR動作を維持したまま、TauriからRust coreを呼び出せる。

### P3：OSC・設定・起動管理の移植

1. Rustに `/chatbox/input` とtyping状態のOSC送信を実装し、文字列とboolの型・引数順・送信先・送信頻度を現行と照合する。UDP送信成功とVRChat受信成功を区別する。
2. 製品内送信をTauriコマンドへ切り替える。既存の外部WebSocketブリッジ指定が利用者向け機能ならadapterで維持する。WebSocketサーバーを製品へ残すのは必要性がある場合に限る。
3. 設定をRust側のschema付きファイルで原子的に保存し、画面間の同期を実装する。ウィンドウ位置・寸法、テーマ、OSC、VR設定、履歴などの現行キーを扱う。
4. WebView2のlocalStorageはElectronのものを自動共有しないため、旧Electron版にJSONエクスポート機能を用意し、Tauri版で検証・インポートする。electron-storeの既知ファイルも必要項目だけ読む。ChromiumのプロフィールDBを直接編集しない。
5. 移行処理はバージョン管理し、元データを保持する。欠損・破損・再実行・日本語パスを検証する。試作中の保存先・アプリID・SteamVR登録先を本番と分離する。
6. 起動引数、SteamVR待機・再接続、画面切替、終了、外部リンクを実装する。自動起動登録とmanifest更新は実行ファイルの絶対パス・引用符・アンインストールを検証する。

完了条件：desktopで設定・履歴の引き継ぎと保持、OSC送信、再起動が成立する。既存版の保存内容とSteamVR登録を試作が上書きしない。

### P4：Swift IME helper接続

1. Rustがhelperプロセスを所有し、同梱した固定パスから起動する。JSONL v1と既存session / revisionの契約を維持し、Tauri commandから非同期に呼ぶ。
2. 起動30秒・要求2秒・終了1秒の現行既定タイムアウト、実行中1件 + 待機最新1件、古い応答の破棄、世代管理、再起動回数制限を移植する。
3. UTF-8の分割受信、CRLF、行サイズ上限、不正JSON、stderr分離、異常終了、ウィンドウ閉鎖、アプリ終了時の子プロセス回収を検証する。
4. ローマ字→かなと入力reducerはUIに残す。かな全文・確定済み左文脈の渡し方、候補選択、確定と送信の境界、確定済みsnapshot送信を維持する。
5. Zenzai → AzooKey通常変換 → helper不能時のかな入力という障害時動作を維持する。モデルパスのCLI / 環境変数の優先順位も維持する。

完了条件：既存fake helperシナリオに相当するRust側テストと実helperによる日本語入力が通り、遅い変換・障害・連打で候補や送信内容が巻き戻らない。

### P5：製品のVR統合

1. P1の描画経路を製品ホストへ接続し、overlayの位置・表裏・サイズ・透明度・再配置・SteamVR bindingsを移植する。
2. 入力120 Hzと描画更新の責務を分離する。カーソル移動は必要に応じて最新値へ集約し、クリック / スクロールなど欠落できないイベントは別に扱う。
3. COM / GPU資源を所有スレッドで破棄し、再接続・サイズ変更・DPI変更・device lost・終了を処理する。UIスレッドでIMEやGPU待機をブロックしない。
4. P0の操作一式をdesktop / VRで実行する。長時間入力、左右同時操作、IME応答待ちの操作、SteamVR再起動を重点確認する。

完了条件：Electron版の主要機能と同等で、Gate Aの描画・入力基準を製品構成でも満たす。

### P6：配布・サイズ・クリーン環境検証

1. Tauri用NSISビルドを追加し、WebView2は共有Evergreenを使用する。未導入時はbootstrapper経由の導入、既存導入済みならオフライン起動を確認する。Runtime全体を同梱したサイズと混同しない。
2. helper / 辞書 / DLL / noticesをTauri resourcesへ配置し、実際のインストール先から解決する。sidecar指定を使う場合はtarget triple付き命名と周辺DLL配置を検証する。
3. `verify-ime-package.mjs` のstage検証を再利用し、配布物検証をTauriの配置にも対応させる。ファイルhash、固定revision、モデル非同梱、余分なprobe / 旧Mozc資産の除外を維持する。
4. 現行 `distributionReady=false` 等の配布ゲートを移植で迂回しない。辞書出自・notice・クリーン環境など既存未完了項目を引き継ぐ。
5. Node / Electron / Swift開発環境のないWindows環境で、インストール→desktop入力→IME→SteamVR→OSC→終了→更新インストール→アンインストールを確認する。PATH隔離だけをクリーン環境合格としない。
6. フロントエンド検証、Rust fmt / clippy / test、helper契約検証、Windows検証ビルドをCIに追加する。CI自動検証とVR実機検証を別に記録する。

Gate Bの合格条件：

- P0の互換表の全項目に合格または明示された仕様判断がある。desktop成功だけでVR受入としない。
- 同一helper / 辞書・モデル非同梱条件で、展開サイズと圧縮サイズがともに現行版より減少している。暫定目標は展開サイズ50%以上削減。未達の場合は内訳を示し、依存削減か構成見直しを行って判定を残す。
- 起動時間・CPU・メモリ・GPU・描画遅延を同一シナリオで比較し、Gate Aの性能基準を満たす。WebView2の子プロセスを含めて測り、共有Runtimeの容量は別欄に示す。
- クリーン環境、設定移行・再移行、SteamVR登録、終了時回収が通る。ライセンス・配布ゲートの未完了がない。
- 実行ファイル・依存lock・helper stageのhash、ソースrevision、使用Runtime / OSを記録できる。

### P7：既定切替とElectron依存の撤去

1. Gate Bを満たしたTauri版を既定の開発・配布経路へ変更し、README / manual / distribution / CIを更新する。
2. 最終アプリID `io.github.vrcliveime` とSteamVR key `vrcliveime.keyboard` を引き継ぐ。旧インストーラーと新インストーラーの所有関係、ショートカット、旧アンインストールが新設定を消さないことを確認する。
3. Electron版は復帰可能なGit状態とデータバックアップを残した上で、製品経路のElectron / napi wrapper / Nodeブリッジ依存を撤去する。Nodeのビルド用途は残す。
4. 更新feedは所有・設定・検証が済むまで無効を維持する。今回の実装から自動公開しない。

## 5. 検証範囲と復帰方針

自動テストは契約・データ・寿命管理へ集中する：OSC packetの型と内容、IMEの競合 / timeout / 障害復帰、設定移行の再実行、APIの購読解除、座標変換・イベント欠落を扱う。WebView2の描画とHMDの見え方は実機で確認し、モックだけで合格にしない。

Gate Aまでは既存Electron経路と保存先を保つ。Gate B前の試作は別ID・別保存先・別SteamVR keyを使い、インストーラーも区別する。失敗時は試作の登録を解除し、既存版の実行パスへ戻す。最終切替後も旧版が読める元データを保持し、設定形式の自動ダウングレード書込みは行わない。

## 6. 最初に着手する単位と見積もり

次の実装依頼ではP0とP1を最初の作業範囲とし、成果物を「基準測定」「試作ソース」「実機検証記録」「Gate Aの判定」に限定する。Gate A保留のまま、OSCやIMEの全面移植へ進まない。

工数は未見積もり。WebView2の描画取得、非表示時の動作、Tauriへの組込みに不確実性があるため、Gate A完了時にP2〜P7の見積もりを更新する。実機テストができない場合もデスクトップの試作・計測は進めるが、VR合格と移行完了は宣言しない。

## 7. 参照資料

現行根拠：`package.json`, `native/Cargo.toml`, `electron/main.js`, `electron/preload.js`, `electron/overlay/capture.js`, `electron/input/`, `electron/services/ime/HelperProcessService.js`, `stores/configStore.ts`, `docs/ime-helper-protocol.md`, `docs/distribution.md`。

2026-10-20に確認した一次資料：

- [Tauri WebView versions](https://v2.tauri.app/reference/webview-versions/)：WindowsではWebView2を利用する。
- [Calling Rust from the frontend](https://v2.tauri.app/develop/calling-rust/)：command / invokeによる接続。
- [Embedding external binaries](https://v2.tauri.app/develop/sidecar/)：sidecar配布方式。
- [Windows installer / WebView2 installation options](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options)：Runtime導入方式。
- [Microsoft WebView2 environment API](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2environment)：合成controller作成と入力転送の関連API。採用するWin32 API・安定版SDKでの利用条件はP1で確認する。
- [Tauri custom renderer feature request #13740](https://github.com/tauri-apps/tauri/issues/13740)：カスタム描画に関する要求。実装済み・移行成立の根拠には使わない。
