import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HelperProcessService } from '../electron/services/ime/HelperProcessService.js';
import { ZenzaiEngine } from '../electron/services/ime/ZenzaiEngine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(root, '.tools');
const executable = path.join(root, 'helper/.build/x86_64-unknown-windows-msvc/release/ZenzaiHelper.exe');
const dictionary = path.join(tools, 'azookey-dictionary/Dictionary');
const cwd = path.join(tools, 'llama-b4846');
const manifest = JSON.parse(await readFile(path.join(root, 'models/manifest.json'), 'utf8'));
const results = [];

async function verify(model) {
  const filename = path.join(tools, 'models', model.id, model.filename);
  assert.equal((await stat(filename)).size, model.bytes);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  assert.equal(hash.digest('hex'), model.sha256, `${model.id} SHA256`);
  return filename;
}

async function run(label, model, expectedEngine, overrides = {}) {
  let stderr = '';
  const client = new HelperProcessService({ executable, cwd,
    args: model ? [dictionary, model] : [dictionary],
    readyTimeoutMs: 30_000, requestTimeoutMs: 10_000, restartDelaysMs: [],
    log: (chunk) => { stderr = (stderr + chunk).slice(-512 * 1024); }, ...overrides });
  const engine = new ZenzaiEngine(client);
  const conversions = [];
  try {
    await client.start();
    assert.equal(client.status.engine, expectedEngine, `${label} ready`);
    for (const [revision, text] of ['', 'きょうはいいてんき', 'にほんご', 'にほんご'].entries()) {
      const converted = await engine.convert({ sessionId: 'keyboard', revision, text, leftContext: 'こんにちは。' });
      assert.equal(converted.engine, expectedEngine);
      assert.equal(converted.revision, revision);
      assert.ok(text === '' ? converted.candidates.length === 0 : converted.candidates.some((item) => item.text === text));
      conversions.push(converted);
    }
    await engine.reset('keyboard');
    const afterReset = await engine.convert({ sessionId: 'keyboard', revision: 4, text: 'あしたもよろしく', leftContext: '' });
    assert.equal(afterReset.engine, expectedEngine);
    await engine.reset('settings');
    if (expectedEngine === 'zenzai') {
      const context = await engine.convert({ sessionId: 'keyboard', revision: 5,
        text: 'にほんご', leftContext: '長い文脈'.repeat(600) });
      assert.equal(context.engine, 'zenzai', 'upstream bounds left context to its default suffix');
      const fallback = await engine.convert({ sessionId: 'keyboard', revision: 6,
        text: 'あいうえお'.repeat(120), leftContext: '' });
      assert.equal(fallback.engine, 'azookey', 'oversized neural prompt falls back without overflowing batch');
      assert.equal(client.status.engine, 'azookey', 'status tracks the actual fallback engine');
      const recovered = await engine.convert({ sessionId: 'keyboard', revision: 7,
        text: 'あしたもよろしく', leftContext: '' });
      assert.equal(recovered.engine, 'zenzai', 'short input recovers after a long-input fallback');
      assert.equal(client.status.engine, 'zenzai');
    }
  } finally { await engine.dispose(); }
  const diagnostics = stderr.split(/\r?\n/).filter((line) => line.startsWith('{"imeDiagnostics"'))
    .map((line) => JSON.parse(line).imeDiagnostics);
  assert.ok(diagnostics.length > 0, `${label} diagnostics`);
  const beforeLongPrompt = diagnostics.slice(0, -2);
  if (expectedEngine === 'zenzai') {
    assert.ok(beforeLongPrompt[0].successfulDecodes > 0, 'warmup must execute llama_decode');
    assert.ok(beforeLongPrompt.every((item) => item.modelLoadAttempts === 1), 'model reused across conversions/reset');
    assert.ok(beforeLongPrompt.every((item) => item.failedDecodes === 0), 'short inputs must not silently fallback');
    assert.ok(diagnostics.at(-1).failedDecodes > 0, 'long prompt failure diagnosed');
  } else {
    assert.ok(diagnostics.every((item) => item.successfulDecodes === 0));
  }
  const result = { label, expectedEngine, conversions, diagnostics };
  results.push(result);
  console.log(`PASS ${label}`);
}

await run('dictionary-only', undefined, 'azookey');
await run('missing-model', path.join(tools, 'missing-model.gguf'), 'azookey');
const testDirectory = path.join(tools, 'integration');
await mkdir(testDirectory, { recursive: true });
const corrupt = path.join(testDirectory, 'corrupt.gguf');
await writeFile(corrupt, 'invalid model');
await run('corrupt-model', corrupt, 'azookey');
for (const model of manifest.models) {
  const filename = await verify(model);
  await run(model.id, filename, 'zenzai');
}
const unicode = path.join(tools, '日本語 space');
await mkdir(unicode, { recursive: true });
await cp(executable, path.join(unicode, '変換 helper.exe'));
await cp(dictionary, path.join(unicode, '辞書'), { recursive: true });
const xsmall = await verify(manifest.models[0]);
await cp(xsmall, path.join(unicode, 'モデル small.gguf'));
await run('Japanese and space paths', path.join(unicode, 'モデル small.gguf'), 'zenzai', {
  executable: path.join(unicode, '変換 helper.exe'),
  args: [path.join(unicode, '辞書'), path.join(unicode, 'モデル small.gguf')],
});
const missingDictionary = new HelperProcessService({ executable, cwd,
  args: [path.join(tools, 'missing-dictionary')], restartDelaysMs: [] });
try { await assert.rejects(missingDictionary.start()); } finally { await missingDictionary.dispose(); }
console.log('PASS missing dictionary');
await writeFile(path.join(tools, 'helper-integration-results.json'), JSON.stringify({ results }, null, 2) + '\n');
