import { ipcMain } from 'electron';
import { getJapaneseConversionService } from '../JapaneseConversionService.js';

function getService() {
  return getJapaneseConversionService();
}

export function registerJapaneseImeIpcHandlers() {
  ipcMain.handle('jp-ime:convert', (event, kana, context = {}) => {
    try {
      const state = getService().convert(kana, context);
      return { success: true, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jp-ime:next-candidate', () => {
    try {
      const state = getService().nextCandidate();
      return { success: true, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jp-ime:prev-candidate', () => {
    try {
      const state = getService().prevCandidate();
      return { success: true, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jp-ime:commit', (event, candidateIndex, context = {}) => {
    try {
      const { committed, state } = getService().commit(candidateIndex, context);
      return { success: true, committed, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('jp-ime:cancel', () => {
    try {
      const state = getService().cancel();
      return { success: true, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
