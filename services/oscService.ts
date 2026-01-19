/**
 * Sends messages via WebSocket to the local Node.js OSC bridge.
 * The browser connects to server.js (ws://localhost:8080), which uses node-osc to talk to VRChat.
 */

interface OscResponse {
  success: boolean;
  error?: string;
}

export const sendOscMessage = async (text: string, bridgeUrl: string): Promise<OscResponse> => {
  return new Promise((resolve) => {
    try {
      // Auto-correct http/https to ws/wss if user forgot
      let url = bridgeUrl;
      if (url.startsWith('http://')) url = url.replace('http://', 'ws://');
      if (url.startsWith('https://')) url = url.replace('https://', 'wss://');
      if (!url.startsWith('ws')) url = 'ws://' + url;

      const ws = new WebSocket(url);
      
      // Timeout to prevent hanging if server is down
      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) ws.close();
        resolve({ success: false, error: "Timeout: Is 'node server.js' running?" });
      }, 2000);

      ws.onopen = () => {
        // Send payload
        ws.send(JSON.stringify({ text }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          clearTimeout(timeout);
          ws.close(); // Close immediately to keep it stateless/simple
          
          if (data.success) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: data.error || "Bridge Error" });
          }
        } catch (e) {
          clearTimeout(timeout);
          ws.close();
          // If we got a message but couldn't parse JSON, assume success (legacy check)
          resolve({ success: true }); 
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        // Do not resolve here immediately as 'onclose' might fire too, 
        // but generally onerror implies connection failure.
        resolve({ success: false, error: "Connection Refused (Is server.js running?)" });
      };

    } catch (error: any) {
      resolve({ success: false, error: error.message || "WebSocket Error" });
    }
  });
};