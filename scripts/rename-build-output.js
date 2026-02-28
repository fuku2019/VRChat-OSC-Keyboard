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
const newFolderName = `VRChat-OSC-Keyboard-v${version}`;
const newPath = path.join(releaseDir, newFolderName);
const RETRYABLE_ERROR_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

// Wait function with retry / リトライ付きの待機関数
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableError(error) {
  return RETRYABLE_ERROR_CODES.has(error?.code);
}

async function retryOperation(
  operation,
  {
    maxRetries = 5,
    delayMs = 1000,
    shouldRetry = (error) => isRetryableError(error),
  } = {},
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await operation();
      return true;
    } catch (error) {
      if (!shouldRetry(error)) throw error;
      if (i === maxRetries - 1) throw error;
      console.log(
        `Retry ${i + 1}/${maxRetries} after error: ${error.code || error.message}`,
      );
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
    }, { maxRetries: 10, delayMs: 1000 });
    // Wait a bit after deletion / 削除後に少し待機
    await sleep(500);
  }

  if (fs.existsSync(oldPath)) {
    try {
      // Rename operation (with retry) / リネーム操作（リトライ付き）
      await retryOperation(() => {
        fs.renameSync(oldPath, newPath);
      }, { maxRetries: 20, delayMs: 1000 });
      console.log(`Successfully renamed '${oldPath}' to '${newPath}'`);

      // Rename executable / 実行可能ファイルの名前変更
      const exeName = `VRChat-OSC-Keyboard.exe`;
      const newExeName = `VRChat-OSC-Keyboard-v${version}.exe`;
      const oldExePath = path.join(newPath, exeName);
      const newExePath = path.join(newPath, newExeName);

      if (fs.existsSync(oldExePath)) {
        await retryOperation(() => {
          fs.renameSync(oldExePath, newExePath);
        }, { maxRetries: 20, delayMs: 1000 });
        console.log(`Successfully renamed executable to '${newExeName}'`);
      } else {
        console.warn(
          `Executable '${exeName}' not found in '${newPath}'. Check package.json executableName.`,
        );
      }

      // Rename installer / インストーラーの名前変更
      const installerName = `VRChat OSC Keyboard Setup ${version}.exe`;
      const newInstallerName = `VRChat OSC Keyboard Setup v${version}.exe`;
      const oldInstallerPath = path.join(releaseDir, installerName);
      const newInstallerPath = path.join(releaseDir, newInstallerName);

      if (fs.existsSync(oldInstallerPath)) {
        try {
          await retryOperation(() => {
            fs.renameSync(oldInstallerPath, newInstallerPath);
          }, { maxRetries: 30, delayMs: 1000 });
          console.log(`Successfully renamed installer to '${newInstallerName}'`);
        } catch (error) {
          if (isRetryableError(error)) {
            console.warn(
              `Installer rename skipped due to file lock (${error.code}). Keeping original name: '${installerName}'`,
            );
          } else {
            throw error;
          }
        }
      } else {
        console.warn(
          `Installer '${installerName}' not found. It may not have been generated.`,
        );
      }
    } catch (error) {
      console.error(`Error renaming directory:`, error);
      process.exit(1);
    }
  } else {
    console.error(`Directory not found: ${oldPath}`);
    console.log(
      'Skipping rename (maybe build failed or target is not directory?)',
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
