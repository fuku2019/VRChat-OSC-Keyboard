# VRC-OSC-Keyboard
VRChatでの文字入力を、もっと自由に。<br>
OSC経由で、物理・仮想キーボードからチャットボックスへメッセージを直接送信できます。

![logo](/docs/fake_logo_3.png)
<br>
↓VOICEVOXずんだもんの声は大きいので注意が必要です。

https://github.com/user-attachments/assets/cd2ba263-f580-4a85-8861-cc934f06c34e

<div align="center">

  [![made_with](https://img.shields.io/badge/MADE_WITH%E2%99%A1-A2A2FF?logo=google)](https://antigravity.google)
  [![dev](https://img.shields.io/badge/-@fuku_2019_vrc-e8439?label=&logo=X&logoColor=ffffff&color=6399AE&labelColor=00C2CB)](https://x.com/fuku_2019_vrc)


  [![platform-windows](https://img.shields.io/badge/windows-platform?label=platform&labelColor=333333&color=357EC7)](https://windows.com)
  ![view_count](https://gitviews.com/repo/fuku2019/VRC-OSC-Keyboard.svg?label-color=333333&style=flat)

<!--
  ![cmoe_counter](https://counter.seku.su/cmoe?name=notAfuku2019&theme=mb)
-->

[**日本語**](/README.md) | [English](/docs/en/README.en.md)

</div>

## ✨ 機能・特徴
+ **マルチ入力対応:** 内蔵キーボード（かな・カナ・英）＆物理キーボードの両方に対応。
+ **日本語入力に強い:** 物理キーボード入力時は、使い慣れたIMEで漢字変換が可能。(もちろん漢字以外でも！)
+ **洗練されたUI:** 美しいアニメーションとカスタムテーマ機能を搭載。
+ **クリップボードにコピー:** チャットを送信するだけでなく、入力した文字をクリップボードにコピーすることができます。
+ **専用のVRオーバーレイ:** SteamVR上から直接キーボードを操作可能。

## 🚀 クイックスタート
1. ダウンロード: [Releases](https://github.com/fuku2019/VRC-OSC-Keyboard/releases/latest) から最新の .exe をダウンロード。
2. インストール: 実行してウィザードに従いインストールを完了。
3. VRChatの設定: アクションメニュー ➔ Options ➔ OSC ➔ Enabled を選択。
4. 準備完了: 本ツールのテキストボックスに入力し、送信ボタンを押してください！

## 🗺️ ロードマップ
+ 漢字変換機能
+ カスタムレイアウト

## ⚠️ 注意事項
一般VRChatterが、AntigravityやCodexを使って**適当に作った実験的**なツールです。
<br>
このソフトの使用によって発生したトラブルについては、自己責任でお願いします。

## 👀 デモ・紹介

[!TIP]音声をオンにして視聴すると、動画がより楽しめます。

<details>
<summary>🎨 UIのカスタマイズ</summary>

https://github.com/user-attachments/assets/6afb4e82-649f-44fb-b359-42fa86495ccb

</details>

<details>
<summary>⌨️ 基本機能</summary>

https://github.com/user-attachments/assets/fc8e216b-8f50-4271-896b-cee8c70a5dd8

https://github.com/user-attachments/assets/988b4c58-d770-46fa-ad06-91ad71321da8
</details>

<details>
  <summary>🎬 その他（VOICEVOXずんだもん解説）</summary>

  ミュートを解除することをオススメします。<br>
  🫛🐱〈 VSCはVRCの誤字なのにゃ

  https://github.com/user-attachments/assets/8a650dfa-ebf4-455d-91ce-c526d8e19e1a

  ![zm_vok_0](https://github.com/user-attachments/assets/e7d60988-36bf-4302-9654-9d8162f98422)


</details>

<details>
  <summary> 🤯 𝓓𝓻𝓮𝓪𝓶 </summary>

  このセクションのメディアコンテンツは、実際のツールの操作感、機能、外観とは異なります。本ツールに着想を得た「夢」としてお楽しみください。
  <br>

  ![waao](/docs/waao.jpg)

  ![udream_0](/docs/udream_0.png)

  https://github.com/user-attachments/assets/aab2cf37-fc52-4324-a83e-8559a9d85e81

  https://github.com/user-attachments/assets/119ae1cf-6a14-4134-a036-752c6de342ef

</details>

## 🛠️ 手動ビルド

### 1. 事前準備
以下の環境が必要です。

- **Node.js**: [Node.js](https://nodejs.org/ja/download)をインストールしてください。LTS バージョン推奨
- **Rust**: [rustup]([https://rustup.rs/](https://rust-lang.org/ja/tools/install/)) をインストールしてください
- **C++ ビルドツール**:
  - Windows の場合: [Visual Studio Build Tools](https://visualstudio.microsoft.com/ja/downloads/) をインストールし、「C++ によるデスクトップ開発」を選択
- **LLVM**: Rust のバインディング生成に必要です
  - Windows の場合: [LLVM](https://github.com/llvm/llvm-project/releases) Windows x64 (64-bit): installerをダウンロード

### 2. インストールとビルド
```bash
# ライブラリのインストール
npm install
# ネイティブモジュール (Rust) のビルド
npm run build:native
# ビルドの実行
npm run dist
```
