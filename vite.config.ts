import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { WebSocketServer } from 'ws';
import { Client } from 'node-osc';

// Plugin to run the OSC bridge alongside the Vite dev server
// Only active if NOT running in Electron (to avoid port conflict)
const oscBridgePlugin = () => {
  return {
    name: 'osc-bridge-plugin',
    configureServer(server) {
      // If we are running inside Electron dev mode, let Electron handle the bridge
      if (process.env.IS_ELECTRON) {
        console.log("ℹ️  Running in Electron mode: Vite OSC bridge disabled (Electron handles it).");
        return;
      }

      // Configuration
      const OSC_IP = '127.0.0.1';
      const OSC_PORT = 9000;
      const WS_PORT = 8080;

      console.log(`\n⚡ OSC Bridge initializing (Vite Plugin)...`);
      
      const oscClient = new Client(OSC_IP, OSC_PORT);
      const wss = new WebSocketServer({ port: WS_PORT });

      console.log(`⚡ OSC Bridge listening on ws://localhost:${WS_PORT}`);
      console.log(`➡️  Forwarding to VRChat at ${OSC_IP}:${OSC_PORT}\n`);

      wss.on('connection', (ws) => {
        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            if (data.text) {
              // VRChat Chatbox format
              oscClient.send('/chatbox/input', [data.text, true]);
              ws.send(JSON.stringify({ success: true }));
            }
          } catch (e) {
            console.error('[OSC] Bridge Error:', e);
            ws.send(JSON.stringify({ success: false, error: 'Bridge Processing Error' }));
          }
        });
        // Error handling to prevent crash on port conflict
        ws.on('error', (err) => console.error(err));
      });
      
      wss.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`⚠️  Port ${WS_PORT} is already in use. Assuming external bridge (e.g. Electron) is running.`);
        } else {
          console.error("WebSocket Server Error:", err);
        }
      });

      // Cleanup when Vite server stops
      server.httpServer?.on('close', () => {
        wss.close();
        oscClient.close();
      });
    }
  };
};

export default defineConfig({
  base: './', // Crucial for Electron apps loading via file://
  plugins: [
    react(),
    oscBridgePlugin()
  ],
  server: {
    host: true
  }
});