import assert from 'node:assert/strict';
import test from 'node:test';
import { createSignalId, isStageSignal } from '../../src/stage/stage-ws.js';

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
});
