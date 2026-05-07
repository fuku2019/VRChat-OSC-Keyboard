/**
 * デバッグ用の設定ファイル
 * このファイルはビルド後のアプリには含まれません。
 * 開発時（npm run electron:dev など）にデバッグモードを有効にする場合のみ、
 * enableDebugMode を true に変更して使用してください。
 */
export const debugConfig = {
  // デバッグモードを有効にするか (true の場合は以下の設定が優先される)
  enableDebugMode: false,

  // アップデート確認テスト用: 常にアップデートがあるとみなすか
  forceUpdateAvailable: false,

  // テスト用の最新バージョン文字列
  mockLatestVersion: 'v9.9',

  // インストーラー版として判定するか (false の場合はポータブル版として判定)
  forceInstallerVersion: true,
};
