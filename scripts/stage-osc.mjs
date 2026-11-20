#!/usr/bin/env node
/**
 * OSC input for ?mode=signal.
 * Usage: npm run stage:osc
 * Listens for OSC on UDP 9000 and forwards each message to signal pages on ws://0.0.0.0:9001.
 */
import { randomUUID } from 'node:crypto';
import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { decodeOscPacket } from '../src/osc-decode.js';

const OSC_PORT = Number(process.env.STAGE_OSC_PORT || 9000);
const WS_PORT = Number(process.env.STAGE_OSC_WS_PORT || 9001);

if (!Number.isInteger(OSC_PORT) || !Number.isInteger(WS_PORT) || OSC_PORT < 1 || WS_PORT < 1) {
  console.error('STAGE_OSC_PORT and STAGE_OSC_WS_PORT must be port numbers');
  process.exit(1);
}

function lanAddresses() {
  const found = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      const v4 = entry.family === 'IPv4' || entry.family === 4;
      if (v4 && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });
const udp = dgram.createSocket('udp4');

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

wss.on('connection', (socket) => {
  console.log('signal page connected');
  socket.on('error', () => {});
});

let udpStarted = false;
function startUdp() {
  if (udpStarted) return;
  udpStarted = true;
  udp.bind(OSC_PORT, '0.0.0.0', () => {
    const lans = lanAddresses();
    console.log(`OSC listening on udp://0.0.0.0:${OSC_PORT}`);
    console.log(`Signal pages connect to ws://localhost:${WS_PORT}`);
    if (lans.length) console.log(`Other devices can send OSC to ${lans.join(', ')} port ${OSC_PORT}`);
    console.log('Open ?mode=signal. A press sends a value above 0.');
  });
}

wss.on('listening', startUdp);
if (wss.address()) startUdp();

wss.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

udp.on('message', (packet, remote) => {
  const messages = decodeOscPacket(packet);
  if (!messages.length) {
    console.warn(`OSC ignored a packet from ${remote.address}:${remote.port}`);
    return;
  }
  for (const message of messages) {
    console.log(`OSC ${remote.address}:${remote.port}`, message.address, message.args);
    broadcast({ address: message.address, args: message.args, signalId: randomUUID() });
  }
});

udp.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
