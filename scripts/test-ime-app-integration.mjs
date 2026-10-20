import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAppEngine } from '../electron/services/ime/createAppEngine.js';
import { JapaneseConversionService } from '../electron/services/JapaneseConversionService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helperDir = path.resolve(process.argv[2] ?? path.join(root, '.tools/ime-helper-stage'));
const dictionaryOnly = process.argv.includes('--dictionary-only');
const modelPath = path.resolve((process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : undefined) ?? path.join(root, '.tools/models/zenz-v3.2-xsmall-q5-k-m/ggml-model-Q5_K_M.gguf'));
if (!dictionaryOnly) {
  const manifest = JSON.parse(await readFile(path.join(root, 'models/manifest.json'), 'utf8'));
  const model = manifest.models.find(item => item.id === 'zenz-v3.2-xsmall-q5-k-m');
  const bytes = await readFile(modelPath);
  assert.equal(bytes.length, model.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sha256);
}
const checks = [];
for (const [label, directory, model, expected] of [
  ['staged xsmall', helperDir, modelPath, 'zenzai'],
  ['no model', helperDir, undefined, 'azookey'],
  ['missing model', helperDir, path.join(root, '.tools/not-installed.gguf'), 'azookey'],
  ['missing helper', path.join(root, '.tools/not-installed-helper'), undefined, 'kana'],
]) {
  if (dictionaryOnly && expected === 'zenzai') continue;
  const engine = createAppEngine({ appDir: root, resourcesPath: root, isPackaged: false,
    helperDir: directory, modelPath: model });
  const service = new JapaneseConversionService(engine);
  try {
    const initialStatus = service.status; // synchronous, including model warm-up
    assert.ok(['starting', 'ready'].includes(initialStatus.state));
    const target = { sessionId: 'app-facade', revision: 1 };
    const state = await service.convert('きょうはいいてんき', { ...target, previousText: '私は' });
    assert.equal(state.engine, expected);
    assert.equal(state.segments.length, 1);
    assert.equal(state.segments[0].raw, 'きょうはいいてんき');
    assert.equal(state.preedit, state.candidates[0].text);
    assert.equal(state.candidates.at(-1).text, 'きょうはいいてんき');
    if (expected !== 'kana') assert.ok(state.candidates.some(item => item.text === '今日はいい天気'));
    const next = await service.nextCandidate(target);
    const committed = await service.commit(next.candidateIndex, { ...target, expectedText: next.preedit });
    assert.equal(committed.committed, next.preedit);
    assert.equal(committed.state.isConverting, false);
    await assert.rejects(service.nextCandidate(target), { code: 'no-candidates' });
    await service.releaseSession();
    const again = await service.convert('にほんご', { sessionId: 'reloaded', revision: 1 });
    assert.equal(again.engine, expected);
    await service.cancel({ sessionId: 'reloaded', revision: 2 });
    assert.equal(service.buildState().rawKana, '');
    checks.push({ label, initialStatus, engine: state.engine, candidates: state.candidates.map(item => item.text) });
    console.log('PASS', label);
  } finally { await service.dispose(); }
}
console.log(JSON.stringify({ checks }, null, 2));
