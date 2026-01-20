import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const version = packageJson.version;
const releaseDir = path.join(__dirname, '../release');
const oldPath = path.join(releaseDir, 'win-unpacked');
const newFolderName = `VRChat-OSC-Keyboard-${version}`;
const newPath = path.join(releaseDir, newFolderName);

// Wait function with retry / リトライ付きの待機関数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation(operation, maxRetries = 5, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await operation();
      return true;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries} after error: ${error.code || error.message}`);
      await sleep(delayMs);
    }
  }
}

async function main() {
  console.log(`Renaming build output...`);
  console.log(`Version: ${version}`);

  // Remove existing directory (with retry) / 既存フォルダを削除（リトライ付き）
  if (fs.existsSync(newPath)) {
    console.log(`Removing existing directory: ${newPath}`);
    await retryOperation(() => {
      fs.rmSync(newPath, { recursive: true, force: true });
    });
    // Wait a bit after deletion / 削除後に少し待機
    await sleep(500);
  }

  if (fs.existsSync(oldPath)) {
    try {
      // Rename operation (with retry) / リネーム操作（リトライ付き）
      await retryOperation(() => {
        fs.renameSync(oldPath, newPath);
      });
      console.log(`Successfully renamed '${oldPath}' to '${newPath}'`);

      // Rename executable / 実行可能ファイルの名前変更
      const exeName = `VRChat-OSC-Keyboard.exe`;
      const newExeName = `VRChat-OSC-Keyboard-${version}.exe`;
      const oldExePath = path.join(newPath, exeName);
      const newExePath = path.join(newPath, newExeName);

      if (fs.existsSync(oldExePath)) {
        await retryOperation(() => {
          fs.renameSync(oldExePath, newExePath);
        });
        console.log(`Successfully renamed executable to '${newExeName}'`);
      } else {
        console.warn(`Executable '${exeName}' not found in '${newPath}'. Check package.json executableName.`);
      }

    } catch (error) {
      console.error(`Error renaming directory:`, error);
      process.exit(1);
    }
  } else {
    console.error(`Directory not found: ${oldPath}`);
    console.log('Skipping rename (maybe build failed or target is not directory?)');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
