import assert from 'node:assert/strict';
import test from 'node:test';
import { connectStageWebSocket, createSignalId, isStageSignal } from '../../src/stage/stage-ws.js';

test('creates signal IDs with secure random bytes when randomUUID is unavailable', () => {
  const signalId = createSignalId({
    getRandomValues(bytes) {
      bytes.fill(0xab);
      return bytes;
    },
  });
  assert.equal(signalId, 'ab'.repeat(16));
});

test('creates signal IDs when the crypto API is unavailable', () => {
  assert.match(createSignalId(null), /^[a-z0-9]+-[a-z0-9]+$/);
});

test('accepts FPS and background effect controls as stage signals', () => {
  assert.equal(isStageSignal({ type: 'fps' }), true);
  assert.equal(isStageSignal({ type: 'backgroundEffects' }), true);
  assert.equal(isStageSignal({ type: 'stageBackground' }), true);
  assert.equal(isStageSignal({ type: 'prop', kind: 'pose' }), true);
  assert.equal(isStageSignal({ type: 'station', station: 'DVC', connected: true }), true);
  assert.equal(isStageSignal({ type: 'station', station: 'UNKNOWN', connected: true }), false);
});

test('reports station status as unknown on disconnect and restores it after reconnecting', () => {
  const saved = {
    WebSocket: globalThis.WebSocket,
    BroadcastChannel: globalThis.BroadcastChannel,
    window: globalThis.window,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const sockets = [];
  let retry;
  class FakeWebSocket {
    static OPEN = 1;
    constructor() {
      this.listeners = {};
      sockets.push(this);
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    emit(name, event = {}) { this.listeners[name]?.(event); }
    close() {}
  }
  globalThis.WebSocket = FakeWebSocket;
  globalThis.BroadcastChannel = class {
    addEventListener() {}
    close() {}
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.setTimeout = (callback) => { retry = callback; return 1; };
  globalThis.clearTimeout = () => { retry = null; };
  const statuses = [];
  try {
    const connection = connectStageWebSocket(() => {}, {
      url: 'ws://relay',
      onStationStatus: (status) => statuses.push(status),
    });
    sockets[0].emit('message', { data: JSON.stringify({ type: 'stationStatus', stations: { DVC: true } }) });
    sockets[0].emit('close');
    assert.deepEqual(statuses, [{ DVC: true }, null]);
    retry();
    assert.equal(sockets.length, 2);
    sockets[1].emit('message', { data: JSON.stringify({ type: 'stationStatus', stations: { DVC: false } }) });
    assert.deepEqual(statuses[2], { DVC: false });
    connection.close();
  } finally {
    Object.assign(globalThis, saved);
  }
});
