#!/usr/bin/env node
/**
 * Shared stage/OSC WebSocket relay and OSC input for ?mode=signal.
 * Usage: npm run stage:osc
 * Listens for stage and OSC WebSocket clients on port 9021 and OSC input on UDP 9020.
 */
import { randomUUID } from 'node:crypto';
import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { decodeOscPacket } from '../src/signal/osc-decode.js';
import { SIGNAL_OSC_UDP_PORT, SIGNAL_OSC_WS_PORT, STATION_NAMES } from '../src/signal/signal-osc.js';

const OSC_PORT = Number(process.env.STAGE_OSC_PORT || SIGNAL_OSC_UDP_PORT);
const WS_PORT = Number(process.env.STAGE_OSC_WS_PORT || SIGNAL_OSC_WS_PORT);

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
const stationClients = new Map(STATION_NAMES.map((station) => [station, new Set()]));

function stationStatus() {
  return {
    type: 'stationStatus',
    stations: Object.fromEntries(STATION_NAMES.map((station) => [station, stationClients.get(station).size > 0])),
  };
}

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

wss.on('connection', (socket) => {
  console.log('stage/signal page connected');
  socket.send(JSON.stringify({ type: 'hello', message: 'stage relay ready' }));
  socket.send(JSON.stringify(stationStatus()));
  let registeredStation = null;
  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!message || typeof message.type !== 'string' || message.type === 'hello') return;
    if (message.type === 'station') {
      if (!stationClients.has(message.station) || (registeredStation && registeredStation !== message.station)) {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid station registration' }));
        return;
      }
      if (!registeredStation) {
        registeredStation = message.station;
        stationClients.get(registeredStation).add(socket);
        broadcast({ type: 'station', station: registeredStation, connected: true });
        broadcast(stationStatus());
      }
      return;
    }
    if (message.type === 'stationStatus') return;
    broadcast(message);
    console.log('Stage signal', message);
  });
  socket.on('close', () => {
    if (!registeredStation) return;
    stationClients.get(registeredStation).delete(socket);
    broadcast({
      type: 'station',
      station: registeredStation,
      connected: stationClients.get(registeredStation).size > 0,
    });
    broadcast(stationStatus());
  });
  socket.on('error', (error) => console.error('WebSocket client error:', error));
});

let udpStarted = false;
function startUdp() {
  if (udpStarted) return;
  udpStarted = true;
  udp.bind(OSC_PORT, '0.0.0.0', () => {
    const lans = lanAddresses();
    console.log(`OSC listening on udp://0.0.0.0:${OSC_PORT}`);
    console.log(`Stage/signal pages connect to ws://localhost:${WS_PORT}`);
    if (lans.length) console.log(`Other devices can send OSC to ${lans.join(', ')} port ${OSC_PORT}`);
    if (lans.length) console.log(`Other devices can connect to ws://${lans.join(`:${WS_PORT}, ws://`)}:${WS_PORT}`);
    console.log('Open ?mode=signal. A press sends a value above 0.');
    console.log('Press Enter to broadcast {"type":"catEat"}; type id=abc123 then Enter for targeted eat; q to quit');
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
