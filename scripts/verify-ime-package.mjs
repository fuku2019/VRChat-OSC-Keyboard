import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = async file => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const forbidden = /(^|\/)(\.git|node_modules)(\/|$)|\.gguf$|(?:^|\/)ZenzaiProbe\.exe$/i;
const legacy = /electron\/assets\/ime\/mozc(?:\/|$)|electron\/services\/ime\/(?:MozcDictionaryProvider|MicroDictionaryProvider|Segmenter|LearningStore)\./i;

async function list(directory, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), `Symlink not allowed: ${prefix}${entry.name}`);
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await list(path.join(directory, entry.name), `${name}/`));
    else result.push(name);
  }
  return result.sort();
}

export async function verifyStage(directory, { development = false } = {}) {
  const manifest = await json(path.join(directory, 'stage-manifest.json'));
  assert.equal(manifest.schemaVersion, 1, 'Re-stage with the current script');
  assert.ok(Array.isArray(manifest.payload) && manifest.payload.length > 0, 'Missing complete payload inventory');
  const expected = new Set();
  for (const entry of manifest.payload) {
    assert.ok(typeof entry.path === 'string' && !entry.path.includes('\\') && !entry.path.split('/').some(part => !part || part === '.' || part === '..')
      && !path.isAbsolute(entry.path) && !entry.path.includes(':'), 'Unsafe inventory path');
    assert.ok(!forbidden.test(entry.path), `Unexpected helper payload: ${entry.path}`);
    assert.ok(!expected.has(entry.path), `Duplicate inventory path: ${entry.path}`);
    expected.add(entry.path);
    const bytes = await fs.readFile(path.join(directory, entry.path));
    assert.equal(bytes.length, entry.bytes, `Size mismatch: ${entry.path}`);
    assert.equal(hash(bytes), entry.sha256, `Hash mismatch: ${entry.path}`);
  }
  assert.deepEqual(await list(directory), [...expected, 'stage-manifest.json'].sort(), 'Untracked stage files');
  const lock = await json(path.join(root, 'helper/windows-dependencies.json'));
  const metadata = await json(path.join(directory, 'build-metadata.json'));
  assert.equal(metadata.azooKeyRevision, lock.azooKeyRevision);
  assert.equal(metadata.dictionaryRevision, lock.dictionaryRevision);
  assert.equal(metadata.dependencyLockSha256, hash(await fs.readFile(path.join(root, 'helper/windows-dependencies.json'))));
  assert.equal(metadata.packageResolvedSha256, hash(await fs.readFile(path.join(root, 'helper/Package.resolved'))));
  assert.equal(metadata.packageLockSha256, hash(await fs.readFile(path.join(root, 'package-lock.json'))));
  const patches = await fs.readdir(path.join(root, 'helper/patches'));
  for (const name of patches.filter(name => name.endsWith('.patch'))) {
    assert.equal(metadata.patches?.find(entry => entry.name === name)?.sha256,
      hash(await fs.readFile(path.join(root, 'helper/patches', name))), `Helper patch mismatch: ${name}`);
  }
  for (const [name, sha] of Object.entries(lock.llama.files)) {
    if (name.endsWith('.dll')) assert.equal(manifest.payload.find(entry => entry.path === name)?.sha256, sha, `Pinned DLL: ${name}`);
  }
  for (const name of ['ZenzaiHelper.exe', 'build-metadata.json', 'THIRD_PARTY_LICENSES/AzooKeyDictionary-LICENSE.txt', 'THIRD_PARTY_LICENSES/llama.cpp-LICENSE.txt'])
    assert.ok(expected.has(name), `Missing resource: ${name}`);
  assert.ok([...expected].some(name => name.startsWith('Dictionary/')), 'Missing dictionary');
  const pins = (await json(path.join(root, 'helper/Package.resolved'))).pins;
  for (const pin of pins) assert.ok(expected.has(`THIRD_PARTY_LICENSES/${pin.identity}-LICENSE.txt`), `Missing notice: ${pin.identity}`);
  if (!development) {
    assert.equal(manifest.distributionReady, true, `Stage is not release-ready: ${(manifest.remainingChecks ?? []).join(', ')}`);
    assert.deepEqual(manifest.remainingChecks, []);
    assert.equal(metadata.appSourceDirty, false, 'Release stage must be built from committed sources');
  }
  return { files: expected.size, bytes: manifest.payload.reduce((sum, entry) => sum + entry.bytes, 0), distributionReady: manifest.distributionReady };
}

export async function verifyPackage(directory, options = {}) {
  const result = await verifyStage(path.join(directory, 'resources/ime-helper/win-x64'), options);
  await fs.access(path.join(directory, 'VrcLiveIme.exe'));
  const asar = require('@electron/asar');
  const archive = path.join(directory, 'resources/app.asar');
  const files = asar.listPackage(archive).map(name => name.replace(/\\/g, '/').replace(/^\//, ''));
  assert.ok(!files.some(name => legacy.test(name)), 'Legacy Mozc/learning code in app.asar');
  const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(packaged.name, 'vrcliveime', 'Fork identity mismatch');
  assert.equal(packaged.main, 'electron/bootstrap.js', 'Fork path bootstrap must run before persistent stores');
  for (const name of ['LICENSE', 'Openvr-LICENSE.txt', 'THIRD_PARTY_NOTICES.md', 'docs/distribution.md']) assert.ok(files.includes(name), `Missing application notice: ${name}`);
  for (const name of ['native/index.node', 'native/openvr_api.dll', 'steamvr/actions.json'])
    await fs.access(path.join(directory, 'resources/app.asar.unpacked', name));
  for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) await fs.access(path.join(directory, name));
  const actions = JSON.parse(await fs.readFile(path.join(directory, 'resources/app.asar.unpacked/steamvr/actions.json'), 'utf8'));
  assert.equal(actions.app_key, 'vrcliveime.keyboard', 'Packaged SteamVR identity mismatch');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), development = args.includes('--development');
    const mode = args.includes('--app') ? '--app' : '--stage';
    const directory = args[args.indexOf(mode) + 1];
    assert.ok(args.includes(mode) && directory && !directory.startsWith('--'), 'Usage: --stage DIR | --app DIR [--development]');
    const result = await (mode === '--app' ? verifyPackage : verifyStage)(path.resolve(directory), { development });
    console.log(`PASS ${mode}: ${result.files} helper files, ${(result.bytes / 1048576).toFixed(2)} MiB; release-ready=${result.distributionReady}`);
  } catch (error) { console.error(`IME package verification failed: ${error.message}`); process.exitCode = 1; }
}
