import path from 'node:path';
import fs from 'node:fs';
import { HelperProcessService } from './HelperProcessService.js';
import { ZenzaiEngine } from './ZenzaiEngine.js';
import { KanaFallbackEngine } from './KanaFallbackEngine.js';

/** Executable/model paths belong to main, never to a renderer request. */
export function createAppEngine({ appDir, resourcesPath, isPackaged, helperDir, modelPath, log }) {
  const directory = helperDir && !isPackaged ? path.resolve(helperDir)
    : isPackaged ? path.join(resourcesPath, 'ime-helper', 'win-x64')
      : path.join(appDir, '.tools', 'ime-helper-stage');
  const executable = path.join(directory, 'ZenzaiHelper.exe');
  const dictionary = path.join(directory, 'Dictionary');
  if (process.platform !== 'win32' || !fs.existsSync(executable) || !fs.existsSync(dictionary)) {
    return new KanaFallbackEngine('helper-not-installed');
  }
  const client = new HelperProcessService({ executable, cwd: directory,
    args: [dictionary, ...(modelPath ? [path.resolve(modelPath)] : [])], log });
  // Warm up independently of the overlay. Status does not await model loading.
  void client.start().catch(() => {});
  return new ZenzaiEngine(client);
}
