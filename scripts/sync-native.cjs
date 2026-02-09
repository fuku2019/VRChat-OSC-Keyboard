const fs = require('fs');
const path = require('path');

const nativeDir = path.resolve(__dirname, '..', 'native');
const dest = path.join(nativeDir, 'index.node');

const candidates = fs
  .readdirSync(nativeDir)
  .filter((name) => /^vr-overlay-native\..+\.node$/i.test(name))
  .map((name) => {
    const fullPath = path.join(nativeDir, name);
    const stat = fs.statSync(fullPath);
    return { name, fullPath, mtimeMs: stat.mtimeMs };
  })
  .sort((a, b) => b.mtimeMs - a.mtimeMs);

if (candidates.length === 0) {
  console.error('No native build artifact found (vr-overlay-native.*.node)');
  process.exit(1);
}

const source = candidates[0].fullPath;
fs.copyFileSync(source, dest);

console.log(`Synced native module: ${path.basename(source)} -> index.node`);
