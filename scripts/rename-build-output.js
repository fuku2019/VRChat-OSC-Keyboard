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

console.log(`Renaming build output...`);
console.log(`Version: ${version}`);

if (fs.existsSync(newPath)) {
  console.log(`Removing existing directory: ${newPath}`);
  fs.rmSync(newPath, { recursive: true, force: true });
}

if (fs.existsSync(oldPath)) {
  try {
    fs.renameSync(oldPath, newPath);
    console.log(`Successfully renamed '${oldPath}' to '${newPath}'`);

    // Rename executable
    const exeName = `VRChat-OSC-Keyboard.exe`;
    const newExeName = `VRChat-OSC-Keyboard-${version}.exe`;
    const oldExePath = path.join(newPath, exeName);
    const newExePath = path.join(newPath, newExeName);

    if (fs.existsSync(oldExePath)) {
        fs.renameSync(oldExePath, newExePath);
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
