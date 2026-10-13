// A throwaway MQTT broker (over WebSocket) for the tests, so the Plaza (room list, presence, global chat) can be
// exercised without touching the public brokers.
import http from 'node:http';
import { createRequire } from 'node:module';
import { WebSocketServer, createWebSocketStream } from 'ws';
const require = createRequire(import.meta.url);
const Aedes = require('aedes');

export function startBroker(port = 0) {
  const aedes = Aedes();
  if (process.env.DEBUG_BROKER) aedes.on('publish', (p, c) => { if (!p.topic.startsWith('$SYS')) console.log('[mqtt]', c?.id, p.topic, p.retain ? 'retained' : '', p.payload.length); });
  const server = http.createServer();
  const wss = new WebSocketServer({ server, handleProtocols: (protocols) => (protocols.has('mqtt') ? 'mqtt' : false) });
  wss.on('connection', (ws) => aedes.handle(createWebSocketStream(ws)));
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({
    port: server.address().port,
    url: `ws://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => { wss.clients.forEach((c) => c.terminate()); aedes.close(() => server.close(r)); }),
  })));
}
