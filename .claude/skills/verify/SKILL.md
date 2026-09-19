---
name: verify
description: このリポジトリのローカル品質ゲート(vitest、tsc、native/に変更がある場合はcargo clippy)を実行し、失敗内容を報告する。コミット前、PR作成前、または変更が妥当か検証を求められたときに使う。CIはこれらのチェックを一切実行しないため、ここが唯一のゲートになる。
---

# Verify

CI (`.github/workflows/release.yml`)はテストもtypecheckもclippyも実行せず、`v*`タグでインストーラをビルドするだけである。したがってこれらのチェックはローカル専用であり、省略すると壊れたコードがそのままリリースへ到達しうる。

## 手順

1. `native/`配下に変更があるかを判定する:
   `git diff --name-only HEAD -- native/` (ステージ済みおよび未追跡分も`git status --short -- native/`で確認する)

2. 以下を順に実行する。最初の失敗で中断せず、すべての結果を収集すること:
   - `npm run test:run` — vitestを1回実行
   - `npm run typecheck` — `tsc --noEmit`。`allowJs`が有効なため`electron/**/*.js`も対象に含まれる
   - `npm run native:check` — **手順1で`native/`に変更が見つかった場合のみ**。実体は`cargo clippy --all-targets -- -D warnings`なので、警告が1つでも出れば失敗扱いになる。Rustツールチェーンが必要であり、cargoが見つからない場合は成功として扱わず、その旨を報告すること。

3. チェックごとにpass / failを簡潔に報告する。失敗したものについては実際の出力を添えること — 失敗を成功としてまとめてはならない。

## 修正する場合

失敗の修正を依頼された場合は、チェックを弱めるのではなく原因そのものを直すこと。失敗するテストを削除したり`.skip`したりしない、`tsc`を黙らせるために`any`を足さない、clippyを黙らせるために`#[allow(...)]`を足さない(そのコードに対してlintが本当に不適切な場合のみ、理由を明示したうえで許容する)。

## 補足

- 単一テストファイル: `npx vitest run path/to/file.test.ts`、名前指定: `npx vitest run -t "test name"`。
- Vitestはjsdomのみ。Electron側のテストは`electron`とネイティブバインディングをモックしており、実ElectronやPlaywrightのハーネスは存在しない。したがってこのskillも含め、オーバーレイ・VR入力・実際のOSC送達はテストで一切カバーされない。変更が`electron/overlay*`、`electron/input*`、またはOSC通信に関わる場合は、ヘッドセット実機またはVRChat上での手動確認が必要である旨を報告に明記すること。
- `native/`配下を変更した場合、アプリを動かすには`npm run build:native`も必要になる。clippyが通ったことは、ディスク上の`.node`が最新であることを意味しない。
