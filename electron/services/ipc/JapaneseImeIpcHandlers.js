// IPC handlers for Japanese IME operations between Main and Renderer process
// Main-Rendererプロセス間の日本語IME操作用IPCハンドラー
import { ipcMain } from 'electron';
import { getJapaneseConversionService } from '../JapaneseConversionService.js';

function getService() {
  return getJapaneseConversionService();
}

// Register all Japanese IME IPC handlers / 全ての日本語IME IPCハンドラーを登録
export function registerJapaneseImeIpcHandlers() {
  // Convert kana to kanji candidates / かなを漢字候補に変換
  ipcMain.handle('jp-ime:convert', (event, kana, context = {}) => {
    try {
      const state = getService().convert(kana, context);
      return { success: true, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Cycle to next candidate / 次の候補に切り替え
  ipcMain.handle('jp-ime:next-candidate', () => {
    try {
      const state = getService().nextCandidate();
      return { success: true, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Commit selected candidate and record learning / 選択候補を確定し学習を記録
  ipcMain.handle('jp-ime:commit', (event, candidateIndex, context = {}) => {
    try {
      const { committed, state } = getService().commit(candidateIndex, context);
      return { success: true, committed, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Cancel current conversion / 現在の変換をキャンセル
  ipcMain.handle('jp-ime:cancel', () => {
    try {
      const state = getService().cancel();
      return { success: true, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
