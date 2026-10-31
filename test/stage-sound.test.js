import assert from 'node:assert/strict';
import test from 'node:test';
import { createScratchSound } from '../src/stage-sound.js';

function audioFixture() {
  const starts = [];
  let context;
  class MockAudioContext {
    constructor() {
      context = this;
      this.state = 'suspended';
      this.destination = {};
    }
    async resume() { this.state = 'running'; }
    async decodeAudioData() { return { duration: 9.82 }; }
    createBufferSource() {
      return {
        connect() {},
        start(...args) { starts.push(args); },
      };
    }
    createGain() { return { gain: {}, connect() {} }; }
  }
  return {
    MockAudioContext,
    fetchAudio: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    starts,
    get context() { return context; },
  };
}

test('plays one preloaded meow at each scratch after sound is unlocked', async () => {
  const fixture = audioFixture();
  const statuses = [];
  const sound = createScratchSound({
    AudioContextClass: fixture.MockAudioContext,
    fetchAudio: fixture.fetchAudio,
    onStatus: (status) => statuses.push(status),
  });
  await sound.ready;
  sound.play();
  assert.deepEqual(statuses, ['blocked']);
  assert.equal(fixture.starts.length, 0);
  await sound.unlock();
  assert.deepEqual(statuses, ['blocked', 'ready']);
  sound.play();
  sound.play();
  assert.deepEqual(fixture.starts, [[0, 7, 1.35], [0, 7, 1.35]]);
});

test('reports loading and becomes ready without playing a late sound', async () => {
  const fixture = audioFixture();
  const statuses = [];
  let resolveFetch;
  const sound = createScratchSound({
    AudioContextClass: fixture.MockAudioContext,
    fetchAudio: () => new Promise((resolve) => { resolveFetch = resolve; }),
    onStatus: (status) => statuses.push(status),
  });
  await sound.unlock();
  await Promise.resolve();
  sound.play();
  assert.deepEqual(statuses, ['loading']);
  resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await sound.ready;
  assert.deepEqual(statuses, ['loading', 'ready']);
  assert.equal(fixture.starts.length, 0);
  sound.play();
  assert.equal(fixture.starts.length, 1);
});

test('reports a blocked resume and can unlock on a later gesture', async (t) => {
  const fixture = audioFixture();
  const statuses = [];
  const warn = t.mock.method(console, 'warn', () => {});
  const sound = createScratchSound({
    AudioContextClass: fixture.MockAudioContext,
    fetchAudio: fixture.fetchAudio,
    onStatus: (status) => statuses.push(status),
  });
  await sound.ready;
  fixture.context.resume = async () => { throw new Error('blocked'); };
  await sound.unlock();
  assert.deepEqual(statuses, ['blocked']);
  assert.equal(warn.mock.callCount(), 1);
  fixture.context.resume = async () => { fixture.context.state = 'running'; };
  await sound.unlock();
  sound.play();
  assert.deepEqual(statuses, ['blocked', 'ready']);
  assert.equal(fixture.starts.length, 1);
});

test('reports audio loading errors and leaves stage playback safe', async (t) => {
  const fixture = audioFixture();
  const statuses = [];
  const error = t.mock.method(console, 'error', () => {});
  const sound = createScratchSound({
    AudioContextClass: fixture.MockAudioContext,
    fetchAudio: async () => ({ ok: false, status: 404 }),
    onStatus: (status) => statuses.push(status),
  });
  await sound.ready;
  await sound.unlock();
  sound.play();
  assert.deepEqual(statuses, ['error']);
  assert.equal(error.mock.callCount(), 1);
  assert.equal(fixture.starts.length, 0);
});

test('reports unsupported Web Audio', async (t) => {
  const statuses = [];
  const error = t.mock.method(console, 'error', () => {});
  const sound = createScratchSound({
    AudioContextClass: null,
    onStatus: (status) => statuses.push(status),
  });
  await sound.ready;
  await sound.unlock();
  sound.play();
  assert.deepEqual(statuses, ['error']);
  assert.equal(error.mock.callCount(), 1);
});

test('reports recordings that cannot supply the selected excerpt', async (t) => {
  const fixture = audioFixture();
  const statuses = [];
  const error = t.mock.method(console, 'error', () => {});
  const sound = createScratchSound({
    AudioContextClass: fixture.MockAudioContext,
    fetchAudio: fixture.fetchAudio,
    onStatus: (status) => statuses.push(status),
  });
  fixture.context.decodeAudioData = async () => ({ duration: 1 });
  await sound.ready;
  assert.deepEqual(statuses, ['error']);
  assert.equal(error.mock.callCount(), 1);
});

test('reports playback errors without interrupting the stage', async (t) => {
  const fixture = audioFixture();
  const statuses = [];
  const error = t.mock.method(console, 'error', () => {});
  const sound = createScratchSound({
    AudioContextClass: fixture.MockAudioContext,
    fetchAudio: fixture.fetchAudio,
    onStatus: (status) => statuses.push(status),
  });
  await sound.ready;
  await sound.unlock();
  fixture.context.createBufferSource = () => ({
    connect() {},
    start() { throw new Error('device error'); },
  });
  sound.play();
  assert.deepEqual(statuses, ['error']);
  assert.equal(error.mock.callCount(), 1);
});
