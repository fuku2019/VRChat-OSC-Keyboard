import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HelperProcessService } from '../electron/services/ime/HelperProcessService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.resolve(process.argv[2] ?? path.join(root, '.tools/ime-helper-stage'));
const executable = path.join(stage, 'ZenzaiHelper.exe');
const dictionary = path.join(stage, 'Dictionary');
const env = { ...process.env };
for (const name of Object.keys(env)) {
  if (/^(PATH|SDKROOT|LIB|LIBPATH|LIBCLANG_PATH|SWIFT.*)$/i.test(name)) delete env[name];
}
env.PATH = path.join(process.env.SystemRoot, 'System32');
const spawnProcess = (exe, args, options) => spawn(exe, args, { ...options, env });
const checks = [];
const record = (label) => { checks.push(label); console.log(`PASS ${label}`); };

for (const [label, model, expected] of [
  ['isolated stage dictionary', undefined, 'azookey'],
  ['isolated stage xsmall', path.join(root, '.tools/models/zenz-v3.2-xsmall-q5-k-m/ggml-model-Q5_K_M.gguf'), 'zenzai'],
]) {
  const client = new HelperProcessService({ executable, cwd: stage,
    args: model ? [dictionary, model] : [dictionary], spawnProcess, restartDelaysMs: [] });
  try {
    await client.start();
    assert.equal(client.status.engine, expected);
    const result = await client.convert({ sessionId: 'stage', revision: 1, text: 'きょうはいいてんき', leftContext: '' });
    assert.equal(result.engine, expected);
    assert.ok(result.candidates.some((item) => item.text === '今日はいい天気'));
    await client.reset('stage');
  } finally { await client.dispose(); }
  record(label);
}

async function raw(label, bytes, expectedCode, verify, split = false) {
  const messages = [];
  const child = spawnProcess(executable, [dictionary], { cwd: stage, windowsHide: true,
    shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  child.stderr.resume();
  child.stdin.on('error', () => {}); // Malformed input deliberately closes the reader.
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    messages.push(message);
    if (message.type === 'ready') {
      if (split) {
        for (let i = 0; i < bytes.length; i += 2) child.stdin.write(bytes.subarray(i, i + 2));
        child.stdin.end();
      } else child.stdin.end(bytes);
    }
  });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${label} timeout`)); }, 10_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
  });
  lines.close();
  assert.equal(code, expectedCode, label);
  verify?.(messages);
  record(label);
}
const convert = { v: 1, type: 'convert', id: 1, sessionId: 'raw', revision: 1, text: 'にほんご', leftContext: '' };
const reset = { v: 1, type: 'reset', id: 2, sessionId: 'raw' };
await raw('split UTF-8 / CRLF / multiple lines / EOF',
  Buffer.from(`${JSON.stringify(convert)}\r\n${JSON.stringify(reset)}\r\n`), 0,
  (messages) => {
    assert.deepEqual(messages.map((message) => message.type), ['ready', 'result', 'reset']);
    assert.equal(messages[1].revision, 1);
  }, true);
await raw('malformed JSON exits', Buffer.from('{bad}\n'), 1);
await raw('invalid UTF-8 exits', Buffer.from([0xff, 10]), 1);
await raw('oversized frame exits', Buffer.alloc(1_048_577, 97), 1);
await raw('invalid request gets terminal error', Buffer.from(JSON.stringify({ ...convert, v: 2 }) + '\n'), 0,
  (messages) => assert.equal(messages[1].code, 'invalid-request'));

const missing = path.join(root, '.tools/integration/missing-dll');
await mkdir(missing, { recursive: true });
await cp(executable, path.join(missing, 'ZenzaiHelper.exe'));
const client = new HelperProcessService({ executable: path.join(missing, 'ZenzaiHelper.exe'),
  cwd: missing, args: [dictionary], spawnProcess, restartDelaysMs: [], readyTimeoutMs: 3000 });
try { await assert.rejects(client.start(), { code: 'exit' }); } finally { await client.dispose(); }
record('missing runtime DLL fails startup');
const manifest = JSON.parse(await readFile(path.join(stage, 'stage-manifest.json'), 'utf8'));
await writeFile(path.join(root, '.tools/stage-test-results.json'), JSON.stringify({
  path: stage, checks, dllCount: manifest.files.filter((file) => file.name.endsWith('.dll')).length,
  totalBytes: manifest.totalBytes, scope: 'PATH isolated on development host; not a Swift-uninstalled clean machine',
}, null, 2) + '\n');
