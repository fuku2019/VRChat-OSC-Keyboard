import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyStage } from './verify-ime-package.mjs';
const source = path.resolve(process.argv[2] ?? '.tools/ime-helper-package');
const fixture = path.resolve('.tools', `package-fixture-${process.pid}`);
assert.ok(fixture.startsWith(path.resolve('.tools') + path.sep));
await fs.cp(source, fixture, { recursive: true, errorOnExist: true, force: false });
try {
  await verifyStage(fixture, { development: true });
  await assert.rejects(verifyStage(fixture), /not release-ready/);
  const manifest = JSON.parse((await fs.readFile(path.join(fixture, 'stage-manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const entry = manifest.payload.find(item => item.path.startsWith('Dictionary/'));
  const file = path.join(fixture, entry.path), bytes = await fs.readFile(file);
  const changed = Buffer.from(bytes); changed[0] ^= 1;
  await fs.writeFile(file, changed);
  await assert.rejects(verifyStage(fixture, { development: true }), /Hash mismatch/);
  await fs.writeFile(file, bytes);
  await fs.writeFile(path.join(fixture, 'untracked.txt'), 'extra');
  await assert.rejects(verifyStage(fixture, { development: true }), /Untracked stage files/);
  await fs.unlink(path.join(fixture, 'untracked.txt'));
  await fs.rename(path.join(fixture, 'llama.dll'), path.join(fixture, 'llama.dll.missing'));
  await assert.rejects(verifyStage(fixture, { development: true }), /ENOENT/);
  await fs.rename(path.join(fixture, 'llama.dll.missing'), path.join(fixture, 'llama.dll'));
  manifest.payload[0].path = '../escape';
  await fs.writeFile(path.join(fixture, 'stage-manifest.json'), JSON.stringify(manifest));
  await assert.rejects(verifyStage(fixture, { development: true }), /Unsafe inventory path/);
  console.log('PASS package gate: valid stage, release readiness, tampered dictionary, untracked file, missing DLL, path traversal');
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}
