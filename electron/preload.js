// Preload script for Electron IPC communication / Electron IPC通信用のプリロードスクリプト
const { contextBridge, ipcRenderer } = require('electron');
const cursorMoveListenerMap = new WeakMap();
const cursorHideListenerMap = new WeakMap();
const triggerStateListenerMap = new WeakMap();
const inputScrollListenerMap = new WeakMap();
const downloadProgressListenerMap = new WeakMap();

// The settings window added three more push channels at once. This collapses
// the subscribe/unsubscribe pair that each of them would otherwise repeat.
// 設定ウィンドウの追加でプッシュ用チャンネルが一度に3つ増えた。それぞれで書き写す
// ことになる購読/解除の組を、これでまとめる。
function listenerPair(channel) {
  const listenerMap = new WeakMap();
  return {
    on: (callback) => {
      if (typeof callback !== 'function') return;
      const previous = listenerMap.get(callback);
      if (previous) {
        ipcRenderer.removeListener(channel, previous);
      }
      const wrapped = (_event, data) => callback(data);
      listenerMap.set(callback, wrapped);
      ipcRenderer.on(channel, wrapped);
    },
    off: (callback) => {
      if (typeof callback !== 'function') return;
      const wrapped = listenerMap.get(callback);
      if (!wrapped) return;
      ipcRenderer.removeListener(channel, wrapped);
      listenerMap.delete(callback);
    },
  };
}

const configBroadcast = listenerPair('config-broadcast');
const showTutorialRequest = listenerPair('show-tutorial');
const clearHistoryRequest = listenerPair('clear-history');
const vrStatusChanged = listenerPair('vr-status-changed');

// Expose protected methods to renderer process via contextBridge
// contextBridge経由でレンダラープロセスに保護されたメソッドを公開
contextBridge.exposeInMainWorld('electronAPI', {
  // Update OSC port in main process / メインプロセスでOSCポートを更新
  updateOscPort: (port) => ipcRenderer.invoke('update-osc-port', port),

  // Get current OSC port / 現在のOSCポートを取得
  getOscPort: () => ipcRenderer.invoke('get-osc-port'),

  // Check for updates / 更新を確認
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),

  // Download update / アップデートをダウンロード
  downloadUpdate: (url) => ipcRenderer.invoke('download-update', url),

  // Cancel download / ダウンロードをキャンセル
  cancelUpdateDownload: () => ipcRenderer.invoke('cancel-update-download'),

  // Install update / アップデートをインストール
  installUpdate: (destPath) => ipcRenderer.invoke('install-update', destPath),

  // Listen to download progress / ダウンロード進捗をリッスン
  onUpdateDownloadProgress: (callback) => {
    if (typeof callback !== 'function') return;
    const previous = downloadProgressListenerMap.get(callback);
    if (previous) {
      ipcRenderer.removeListener('update-download-progress', previous);
    }
    const wrapped = (_event, data) => callback(data);
    downloadProgressListenerMap.set(callback, wrapped);
    ipcRenderer.on('update-download-progress', wrapped);
  },
  removeUpdateDownloadProgress: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = downloadProgressListenerMap.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener('update-download-progress', wrapped);
    downloadProgressListenerMap.delete(callback);
  },

  // Open external URL / 外部URLを開く
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Log config change / 設定変更をログ出力
  logConfigChange: (key, oldValue, newValue) =>
    ipcRenderer.invoke('log-config-change', { key, oldValue, newValue }),

  // Send typing status to VRChat chatbox / VRChatチャットボックスにタイピング状態を送信
  sendTypingStatus: (isTyping) =>
    ipcRenderer.invoke('send-typing-status', isTyping),

  // Get current WebSocket bridge port / 現在のWebSocketブリッジポートを取得
  getBridgePort: () => ipcRenderer.invoke('get-bridge-port'),

  // Japanese IME candidate conversion / 日本語IME候補変換
  imeConvert: (kana, context) =>
    ipcRenderer.invoke('jp-ime:convert', kana, context),
  imeNextCandidate: () => ipcRenderer.invoke('jp-ime:next-candidate'),
  imeCommitCandidate: (candidateIndex, context) =>
    ipcRenderer.invoke('jp-ime:commit', candidateIndex, context),
  imeCancelConversion: () => ipcRenderer.invoke('jp-ime:cancel'),

  // Send window size to main process / メインプロセスにウィンドウサイズを送信
  sendWindowSize: (width, height) =>
    ipcRenderer.send('window-size', { width, height }),
  // Send renderer metrics to main process / レンダラーメトリクスをメインプロセスに送信
  sendRendererMetrics: (metrics) =>
    ipcRenderer.send('renderer-metrics', metrics),
  // Whether a controller hovers an element that clicks on trigger press
  // トリガー押下でクリックする要素にコントローラーが乗っているか
  sendVrInstantHover: (data) => ipcRenderer.send('vr-instant-hover', data),

  // VR Controller cursor events / VRコントローラーカーソルイベント
  onCursorMove: (callback) => {
    if (typeof callback !== 'function') return;
    const previous = cursorMoveListenerMap.get(callback);
    if (previous) {
      ipcRenderer.removeListener('input-cursor-move', previous);
    }
    const wrapped = (_event, data) => callback(data);
    cursorMoveListenerMap.set(callback, wrapped);
    ipcRenderer.on('input-cursor-move', wrapped);
  },
  removeCursorMoveListener: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = cursorMoveListenerMap.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener('input-cursor-move', wrapped);
    cursorMoveListenerMap.delete(callback);
  },
  onCursorHide: (callback) => {
    if (typeof callback !== 'function') return;
    const previous = cursorHideListenerMap.get(callback);
    if (previous) {
      ipcRenderer.removeListener('input-cursor-hide', previous);
    }
    const wrapped = (_event, data) => callback(data);
    cursorHideListenerMap.set(callback, wrapped);
    ipcRenderer.on('input-cursor-hide', wrapped);
  },
  removeCursorHideListener: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = cursorHideListenerMap.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener('input-cursor-hide', wrapped);
    cursorHideListenerMap.delete(callback);
  },
  onTriggerState: (callback) => {
    if (typeof callback !== 'function') return;
    const previous = triggerStateListenerMap.get(callback);
    if (previous) {
      ipcRenderer.removeListener('input-trigger-state', previous);
    }
    const wrapped = (_event, data) => callback(data);
    triggerStateListenerMap.set(callback, wrapped);
    ipcRenderer.on('input-trigger-state', wrapped);
  },
  removeTriggerStateListener: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = triggerStateListenerMap.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener('input-trigger-state', wrapped);
    triggerStateListenerMap.delete(callback);
  },

  // VR Controller scroll events / VRコントローラスクロールイベント
  onInputScroll: (callback) => {
    if (typeof callback !== 'function') return;
    const previous = inputScrollListenerMap.get(callback);
    if (previous) {
      ipcRenderer.removeListener('input-scroll', previous);
    }
    const wrapped = (_event, data) => callback(data);
    inputScrollListenerMap.set(callback, wrapped);
    ipcRenderer.on('input-scroll', wrapped);
  },
  removeInputScrollListener: (callback) => {
    if (typeof callback !== 'function') return;
    const wrapped = inputScrollListenerMap.get(callback);
    if (!wrapped) return;
    ipcRenderer.removeListener('input-scroll', wrapped);
    inputScrollListenerMap.delete(callback);
  },

  // Reset overlay position / オーバーレイ位置のリセット
  resetOverlayPosition: () => ipcRenderer.invoke('reset-overlay-position'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  getSteamVrAutoLaunch: () => ipcRenderer.invoke('get-steamvr-auto-launch'),
  setSteamVrAutoLaunch: (enabled) =>
    ipcRenderer.invoke('set-steamvr-auto-launch', enabled),
  getSteamVrBindings: () => ipcRenderer.invoke('get-steamvr-bindings'),
  openSteamVrBindingUi: () => ipcRenderer.invoke('open-steamvr-binding-ui'),
  // Check if running in debug mode  デバッグモードが有効か確認
  isDebugMode: () => ipcRenderer.invoke('is-debug-mode'),

  // Cross-window config sync / ウィンドウ間の設定同期
  broadcastConfig: (config) => ipcRenderer.send('config-changed', config),
  onConfigBroadcast: configBroadcast.on,
  removeConfigBroadcastListener: configBroadcast.off,

  // Actions the settings window delegates to the keyboard window
  // 設定ウィンドウがキーボードウィンドウへ委譲する操作
  requestShowTutorial: () => ipcRenderer.invoke('request-show-tutorial'),
  requestClearHistory: () => ipcRenderer.invoke('request-clear-history'),
  onShowTutorial: showTutorialRequest.on,
  removeShowTutorialListener: showTutorialRequest.off,
  onClearHistory: clearHistoryRequest.on,
  removeClearHistoryListener: clearHistoryRequest.off,

  // Which window this is, and whether VR mode is active / 自分がどのウィンドウか、VRモードが有効か
  getLaunchInfo: () => ipcRenderer.invoke('get-launch-info'),

  // Whether the SteamVR overlay is up yet / SteamVR オーバーレイが立ち上がったか
  getVrStatus: () => ipcRenderer.invoke('get-vr-status'),
  onVrStatusChanged: vrStatusChanged.on,
  removeVrStatusChangedListener: vrStatusChanged.off,
});
