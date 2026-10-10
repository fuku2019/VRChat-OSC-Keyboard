import { app } from 'electron';
import { configureAppIdentity } from './appIdentity.js';

// Configure paths before ESM services construct persistent stores.
// 永続ストアを生成するサービスのimportより先に保存先を分離する。
configureAppIdentity(app);
await import('./main.js');
