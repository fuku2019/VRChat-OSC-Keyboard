// Protocol fixture only: this process does not run AzooKey or Zenzai inference.
import { createInterface } from 'node:readline';

function send(message) {
  const bytes = Buffer.from(`${JSON.stringify(message)}\r\n`);
  // Exercise byte boundaries inside Japanese UTF-8 characters.
  for (let i = 0; i < bytes.length; i += 2) process.stdout.write(bytes.subarray(i, i + 2));
}
send({ v: 1, type: 'ready', engine: 'azookey' });
const reader = createInterface({ input: process.stdin });
reader.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.type === 'shutdown') { reader.close(); process.exit(0); }
  if (request.type === 'reset') { send({ ...request }); return; }
  send({ ...request, type: 'result', engine: 'azookey', elapsedMs: 1,
    candidates: [{ text: '日本語' }, { text: '日本語' }, { text: '' }] });
});
reader.on('close', () => process.exit(0));
