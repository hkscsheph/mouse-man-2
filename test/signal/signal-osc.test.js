import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { CAMERA_NUDGE, resolveSignalOscUrl, SIGNAL_OSC_UDP_PORT, SIGNAL_OSC_WS_PORT, signalActionFromOsc, signalControl } from '../../src/signal/signal-osc.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function oscString(text) {
  const raw = Buffer.from(`${text}\0`);
  const pad = (4 - (raw.length % 4)) % 4;
  return Buffer.concat([raw, Buffer.alloc(pad)]);
}

test('maps each signal option onto the same stage message as its button', () => {
  assert.deepEqual(signalActionFromOsc('/signal/demo'), signalControl('demo'));
  assert.deepEqual(signalActionFromOsc('/signal/eat', [1]), {
    op: 'send',
    payload: { type: 'catEat' },
    label: 'Eat closest',
  });
  assert.equal(signalActionFromOsc('/signal/eat', [0]), null);
  assert.deepEqual(signalActionFromOsc('/signal/eat', ['abc']), {
    op: 'send',
    payload: { type: 'catEat', id: 'abc' },
    label: 'Eat abc',
  });
  assert.deepEqual(signalActionFromOsc('/Signal/Sweep', [true]), signalControl('sweep'));
  assert.deepEqual(signalActionFromOsc('/signal/scratch'), signalControl('scratch'));
  assert.deepEqual(signalActionFromOsc('/signal/restart', [1]), signalControl('restart'));
  assert.deepEqual(signalActionFromOsc('/signal/uniform'), signalControl('uniform'));
  assert.deepEqual(signalActionFromOsc('/signal/larger', [1]), signalControl('larger'));
  assert.deepEqual(signalActionFromOsc('/signal/smaller', [1]), signalControl('smaller'));
  assert.equal(signalActionFromOsc('/signal/smaller', [0]), null);
  assert.deepEqual(signalActionFromOsc('/signal/hud'), signalControl('hud'));
  assert.deepEqual(signalActionFromOsc('/signal/prop/box', [1]), signalControl('prop', 'box'));
  assert.deepEqual(signalActionFromOsc('/signal/gift'), signalControl('prop', 'gift'));
  assert.deepEqual(signalActionFromOsc('/signal/3', [1]).payload, { type: 'prop', kind: 'box' });
  assert.deepEqual(signalActionFromOsc('/signal/camera/left', [1]), signalControl('camera', '-1,0,0'));
  assert.deepEqual(signalActionFromOsc('/signal/camera/left', [1]).payload.move, [-1 * CAMERA_NUDGE, 0, 0]);
  assert.equal(signalActionFromOsc('/signal/camera/down', [false]), null);
  assert.deepEqual(signalActionFromOsc('/signal/camera/move', [0.02, -0.01, 0]).payload.move, [0.02, -0.01, 0]);
  assert.deepEqual(signalActionFromOsc('/signal/scale', [-0.1]).payload, { type: 'spriteScale', delta: -0.1 });
  assert.equal(signalActionFromOsc('/signal/scale', [0]), null);
  assert.deepEqual(signalActionFromOsc('/signal/webcam', [1]), { op: 'webcam', label: 'Webcam' });
  assert.deepEqual(signalActionFromOsc('/signal/ipcam', ['rtsp://192.168.1.64/stream']), {
    op: 'ipcam',
    url: 'rtsp://192.168.1.64/stream',
    label: 'IP camera',
  });
  assert.deepEqual(signalActionFromOsc('/signal/source/ipcam', [1]), signalControl('ipcam', ''));
  assert.equal(signalActionFromOsc('/signal/ipcam', [0]), null);
  assert.deepEqual(signalActionFromOsc('/signal/admit', ['mouse-42']).payload, { type: 'admit', raw: 'mouse-42' });
  assert.equal(signalActionFromOsc('/signal/admit', [1]), null);
  assert.equal(signalActionFromOsc('/other/eat', [1]), null);
});

test('button vectors keep the on-screen camera step', () => {
  assert.deepEqual(signalControl('camera', '0,0,1').payload.move, [0, 0, CAMERA_NUDGE]);
  assert.equal(signalControl('camera', '0,0,1').label, 'Camera up');
  assert.equal(signalControl('prop', 'poster').label, 'Poster');
  assert.equal(signalControl('admit', '  '), null);
});

test('resolves the signal page OSC socket', () => {
  assert.equal(SIGNAL_OSC_UDP_PORT, 9020);
  assert.equal(SIGNAL_OSC_WS_PORT, 9021);
  assert.equal(resolveSignalOscUrl({ search: '', hostname: 'localhost' }), 'ws://localhost:9021');
  assert.equal(resolveSignalOscUrl({ search: '', hostname: '192.168.99.31' }), 'ws://192.168.99.31:9021');
  assert.equal(resolveSignalOscUrl({ search: '?osc=ws://show.local:9100', hostname: 'localhost' }), 'ws://show.local:9100');
  assert.equal(resolveSignalOscUrl({ hostname: '::1' }, ''), 'ws://[::1]:9021');
  assert.equal(resolveSignalOscUrl({ hostname: '127.0.0.1' }, 'ws://override:9'), 'ws://override:9');
});

test('relays an OSC button to connected signal pages', async () => {
  const oscPort = 20000 + Math.floor(Math.random() * 10000);
  const wsPort = oscPort + 10000;
  const child = spawn(process.execPath, ['scripts/stage-osc.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      STAGE_OSC_PORT: String(oscPort),
      STAGE_OSC_WS_PORT: String(wsPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  try {
    await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`OSC bridge did not start\n${output}`)), 5000);
      const check = () => {
        if (output.includes(`udp://0.0.0.0:${oscPort}`)) {
          clearTimeout(timer);
          resolvePromise();
        } else if (child.exitCode !== null) {
          clearTimeout(timer);
          reject(new Error(`OSC bridge exited\n${output}`));
        }
      };
      child.stdout.on('data', check);
      child.on('exit', check);
      check();
    });
    const socket = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    await once(socket, 'open');
    const incoming = once(socket, 'message');
    const udp = dgram.createSocket('udp4');
    const packet = Buffer.concat([oscString('/signal/scratch'), oscString(',f'), (() => {
      const buffer = Buffer.alloc(4);
      buffer.writeFloatBE(1);
      return buffer;
    })()]);
    await new Promise((resolvePromise, reject) => {
      udp.send(packet, oscPort, '127.0.0.1', (error) => {
        udp.close();
        if (error) reject(error);
        else resolvePromise();
      });
    });
    const [data] = await incoming;
    assert.equal(JSON.parse(data.toString()).address, '/signal/scratch');
    socket.close();
  } finally {
    if (child.exitCode === null) child.kill();
  }
});
