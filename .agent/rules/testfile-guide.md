---
trigger: manual
---

Antigravity用 テスト実装指針（Testing Strategy）
Project Context:

Stack: Electron / React / TypeScript

Goal: テスト工数を最適化しつつ、保守性と安定性を担保する。

Priority Definition: エージェントは以下の優先度に従ってテストコード（Vitest/Jest/Playwright）の実装および動作検証を行ってください。

1. High Priority (Must Have / Automated)
対象: アプリケーションの核となるロジックと安全性 ここに含まれるコードは、変更のたびに自動テストで回帰バグがないか検証する必要があります。

IPC Communication (Main <-> Renderer)

ipcMain / ipcRenderer 間のメッセージパッシングが型安全に行われているか。

不正なチャンネルやデータ構造が渡された際のエラーハンドリング。

Main Process Logic (Node.js)

ファイルシステム操作（読み書き、パス解決）、OS固有機能へのアクセス処理。

これらが失敗するとアプリがクラッシュするため、重点的にテストする。

Complex Business Logic (Shared/Utils)

計算ロジック、データ変換処理、正規表現などの純粋なTypeScript関数。

UIに依存しない「ロジック単体」でのユニットテストを網羅する（カバレッジ目標: 高）。

2. Medium Priority (Should Have / Mocked)
対象: 外部連携と主要な状態管理 外部要因をモック（Mock）化し、自作コードの挙動を保証します。

Custom React Hooks & Context

複雑な状態遷移（State Machine）を持つフック。

UI描画を含めず、renderHook 等を用いてロジックの振る舞いのみをテストする。

External Integrations (OSC / API)

OSC通信や外部API接続箇所。

実際に通信は行わず、接続成功/失敗時のステータス変化が正しく処理されるかをモックで検証する。

3. Low Priority (Manual / Visual Check)
対象: 変更頻度が高いUI 自動テストのコストが高く、壊れやすいため、エージェントによる目視確認や簡易的なチェックに留めます。

Dumb UI Components

ロジックを持たない表示専用コンポーネント（見た目の崩れはStorybook等で確認すれば十分）。

Third-Party Libraries

ElectronやReact自体の機能動作テストは不要。

エージェントへの指示（Action Items）
Scaffold Testing Environment: まだ環境がない場合、Vitest および Playwright のセットアップを行ってください。

Generate Unit Tests: 上記 "High Priority" に該当する既存ファイル（特に main/ 配下や utils/）を特定し、単体テストを作成してください。

Create Verification Plan: 実装後は、テストスクリプトが全てパスすることを検証条件（Verification Criteria）としてください。
