#!/usr/bin/env node
/**
 * Minimal WebSocket broadcaster for main-stage catEat events.
 * Usage: npm run stage:ws-demo
 * Keys: Enter = eat next, id=<mouseId> + Enter = eat specific id, q = quit
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.STAGE_WS_PORT || 8787);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Main stage WebSocket demo. Connect clients to ws://localhost:' + PORT + '\n');
});

const wss = new WebSocketServer({ server: httpServer });

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
  console.log('→', data);
}

wss.on('connection', (socket) => {
  console.log('client connected');
  socket.send(JSON.stringify({ type: 'hello', message: 'stage ws demo ready' }));
});

httpServer.listen(PORT, () => {
  console.log(`Stage WS demo on ws://localhost:${PORT}`);
  console.log('Press Enter to broadcast {"type":"catEat"}; type id=abc123 then Enter for targeted eat; q to quit');
});

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  const line = chunk.trim();
  if (!line) {
    broadcast({ type: 'catEat' });
    return;
  }
  if (line === 'q' || line === 'quit') {
    process.exit(0);
  }
  const idMatch = line.match(/^id=(.+)$/);
  if (idMatch) {
    broadcast({ type: 'catEat', id: idMatch[1] });
    return;
  }
  console.log('Unknown command. Enter = eat next, id=<id> = eat id, q = quit');
});
