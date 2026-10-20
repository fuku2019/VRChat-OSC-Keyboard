import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startBridge, updateOscClient, getActiveWsPort, cleanup } from '../electron/services/OscBridgeService.js';

// Isolated localhost receiver: never forwards test text to VRChat's port 9000.
const receiver = dgram.createSocket('udp4');
let ws;
const deadline = setTimeout(() => { console.error('OSC loopback timed out'); process.exit(1); }, 5000);
try {
  receiver.bind(0, '127.0.0.1');
  await once(receiver, 'listening');
  updateOscClient(receiver.address().port);
  await startBridge();
  assert.ok(getActiveWsPort(), 'bridge must listen');
  ws = new WebSocket(`ws://127.0.0.1:${getActiveWsPort()}`);
  await once(ws, 'open');
  for (const sound of [true, false]) {
    const received = once(receiver, 'message');
    const ack = once(ws, 'message');
    const text = '今日はいい天気。漢字とかな🙂';
    ws.send(JSON.stringify({ text, direct: true, sound }));
    const [[packet], [reply]] = await Promise.all([received, ack]);
    assert.deepEqual(JSON.parse(reply.toString()), { success: true });
    let offset = 0;
    const string = () => {
      const end = packet.indexOf(0, offset);
      assert.ok(end >= offset, 'OSC string terminator');
      const value = packet.toString('utf8', offset, end);
      offset = (end + 4) & ~3;
      return value;
    };
    assert.equal(string(), '/chatbox/input');
    assert.equal(string(), sound ? ',sTT' : ',sTF');
    assert.equal(string(), text);
    assert.equal(offset, packet.length);
  }
  console.log('PASS Japanese committed text and silent preview: WebSocket → /chatbox/input UDP loopback');
} finally {
  clearTimeout(deadline);
  if (ws) ws.terminate();
  cleanup();
  receiver.close();
}
