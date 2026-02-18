# VRChat-OSC-Keyboard

Unleash your typing in VRChat.<br>
Directly send messages to the Chatbox via OSC using physical or virtual keyboards.

![logo](https://raw.githubusercontent.com/fuku2019/VRChat-OSC-Keyboard/refs/heads/main/docs/fake_logo_3.png)
<br>
↓ Note: The voice of VOICEVOX Zundamon is loud, so please be careful.

<video style="width: 100%; height: auto;" controls src="https://github.com/user-attachments/assets/cd2ba263-f580-4a85-8861-cc934f06c34e"></video>

<div align="center">

[![made_with](https://img.shields.io/badge/MADE_WITH%E2%99%A1-A2A2FF?logo=google)](https://antigravity.google)
[![dev](https://img.shields.io/badge/-@fuku_2019_vrc-e8439?label=&logo=X&logoColor=ffffff&color=6399AE&labelColor=00C2CB)](https://x.com/fuku_2019_vrc)

[![platform-windows](https://img.shields.io/badge/windows-platform?label=platform&labelColor=333333&color=357EC7)](https://windows.com)
![new_view_count](https://gitviews.com/repo/fuku2019/VRChat-OSC-Keyboard.svg?label-color=333333&style=flat)

  <!-- ![view_count](https://gitviews.com/repo/fuku2019/VRC-OSC-Keyboard.svg?label-color=333333&style=flat) -->

<!--
  ![cmoe_counter](https://counter.seku.su/cmoe?name=notAfuku2019&theme=mb)
-->

[**Japanese**](/README.md) | [English](https://github.com/fuku2019/VRChat-OSC-Keyboard/blob/main/docs/en/README.en.md)

</div>

## ✨ Features

- **Flexible Input:** Supports both the built-in virtual keyboard (Kana/English) and physical keyboards.
- **Seamless Japanese Input:** Leverage your preferred IME for Kanji conversion when using a physical keyboard. (Works for other languages too!)
- **Polished UI:** Features smooth animations and custom themes.
- **Clipboard Integration:** Automatically copies typed text to your clipboard.
- **Dedicated VR Overlay:** Control the keyboard directly within SteamVR.

## 🚀 Quick Start

1. **Download:** Get the latest `.exe` from [Releases](https://github.com/fuku2019/VRChat-OSC-Keyboard/releases/latest).
2. **Install:** Run the installer and follow the setup wizard.
3. **Configure VRChat:** Enable OSC via Action Menu ➔ Options ➔ OSC ➔ Enabled.
4. **Ready:** Type in the text box and hit send!

## 🗺️ Roadmap

- Kanji conversion (for virtual keyboard)
- Custom layouts

## ⚠️ Disclaimer

This is an **experimental tool** created by a VRChat enthusiast using Antigravity and Codex.
<br>
Use at your own risk. The author is not responsible for any issues that may arise from using this software.

## 👀 Demo / Introduction

[!TIP] You can enjoy the videos more by turning on the sound.

<details>
<summary>🎨 UI Customization</summary>

<video style="width: 100%; height: auto;" controls src="https://github.com/user-attachments/assets/6afb4e82-649f-44fb-b359-42fa86495ccb"></video>

</details>

<details>
<summary>⌨️ Basic Features</summary>

<video style="width: 100%; height: auto;" controls src="https://github.com/user-attachments/assets/fc8e216b-8f50-4271-896b-cee8c70a5dd8"></video>

<video style="width: 100%; height: auto;" controls src="https://github.com/user-attachments/assets/988b4c58-d770-46fa-ad06-91ad71321da8"></video>

</details>

<details>
  <summary>🎬 Others (VOICEVOX Zundamon Commentary)</summary>

We recommend unmuting.<br>
🫛🐱〈 "VSC" is a typo for VRC, meow

<video style="width: 100%; height: auto;" controls src="https://github.com/user-attachments/assets/8a650dfa-ebf4-455d-91ce-c526d8e19e1a"></video>

![zm_vok_0](https://github.com/user-attachments/assets/e7d60988-36bf-4302-9654-9d8162f98422)

</details>

<details>
  <summary> 🤯 𝓓𝓻𝓮𝓪𝓶 </summary>

The media content in this section differs from the actual operation, function, and appearance of the tool. Please enjoy it as a "Dream" inspired by this tool.
<br>

![waao](https://raw.githubusercontent.com/fuku2019/VRChat-OSC-Keyboard/refs/heads/main/docs/waao.jpg)

![udream_0](https://raw.githubusercontent.com/fuku2019/VRChat-OSC-Keyboard/refs/heads/main/docs/udream_0.png)

<video style="width: 100%; height: auto;" controls src="https://github.com/user-attachments/assets/aab2cf37-fc52-4324-a83e-8559a9d85e81"></video>

<video style="width: 100%; height: auto;" controls src="https://github.com/user-attachments/assets/119ae1cf-6a14-4134-a036-752c6de342ef"></video>

</details>

## 🛠️ Manual Build

### 1. Prerequisites

The following environment is required.

- **Node.js**: Install [Node.js](https://nodejs.org/en/download). LTS version recommended.
- **Rust**: Install [rustup](https://rustup.rs/).
- **C++ Build Tools**:
  - For Windows: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) and select "Desktop development with C++".
- **LLVM**: Required for generating Rust bindings.
  - For Windows: Download [LLVM](https://github.com/llvm/llvm-project/releases) Windows x64 (64-bit): installer.

### 2. Installation and Build

```bash
# Install dependencies
npm install
# Build native module (Rust)
npm run build:native
# Run build
npm run dist
```
