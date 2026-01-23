import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Enable globals for describe, it, expect / グローバル関数を有効化
    globals: true,
    // Use jsdom for DOM testing / DOM テスト用に jsdom を使用
    environment: 'jsdom',
    // Include test files / テストファイルのパターン
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // Exclude node_modules / node_modules を除外
    exclude: ['node_modules', 'dist', 'release'],
  },
});
