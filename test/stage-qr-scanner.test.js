import assert from 'node:assert/strict';
import test from 'node:test';
import QRCode from 'qrcode';
import { createFallbackQrScanner } from '../src/stage-qr-scanner.js';

const payload = 'https://example.test/?id=12345678';

function qrFrame() {
  const modules = QRCode.create(payload).modules;
  const scale = 6;
  const margin = 4;
  const width = (modules.size + 2 * margin) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (!modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const i = (((y + margin) * scale + dy) * width + (x + margin) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width, height: width };
}

async function withGlobals(values, callback) {
  const original = Object.fromEntries(
    Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  try {
    await callback();
  } finally {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function mainThreadFixture() {
  const image = qrFrame();
  const canvas = { width: 1, height: 1 };
  let draws = 0;
  const context = {
    drawImage() { draws += 1; },
    getImageData() { return image; },
  };
  return {
    canvas,
    context,
    video: { videoWidth: image.width, videoHeight: image.height },
    get draws() { return draws; },
  };
}

test('decodes QR at full resolution when worker APIs are unavailable', async () => {
  await withGlobals({ Worker: undefined }, async () => {
    const fixture = mainThreadFixture();
    const scanner = createFallbackQrScanner(fixture.canvas, fixture.context);
    assert.equal(await scanner.detect(fixture.video), payload);
    assert.equal(fixture.canvas.width, fixture.video.videoWidth);
    assert.equal(fixture.canvas.height, fixture.video.videoHeight);
    assert.equal(fixture.draws, 1);
  });
});

test('transfers camera frames to the worker without reading the main-thread canvas', async () => {
  const bitmap = { close() { assert.fail('transferred bitmap must be closed by the worker'); } };
  let instance;
  class MockWorker {
    constructor() { instance = this; }
    postMessage(message, transfer) {
      assert.equal(message.bitmap, bitmap);
      assert.deepEqual(transfer, [bitmap]);
      queueMicrotask(() => this.onmessage({ data: { raw: payload } }));
    }
  }
  await withGlobals({
    Worker: MockWorker,
    OffscreenCanvas: class {},
    createImageBitmap: async () => bitmap,
  }, async () => {
    const fixture = mainThreadFixture();
    const scanner = createFallbackQrScanner(fixture.canvas, fixture.context);
    assert.equal(await scanner.detect(fixture.video), payload);
    assert.ok(instance);
    assert.equal(fixture.draws, 0);
  });
});

test('worker errors fall back to main-thread decoding for this and subsequent frames', async (t) => {
  let instance;
  class MockWorker {
    constructor() { instance = this; }
    postMessage() { queueMicrotask(() => this.onerror({ message: 'worker failed' })); }
    terminate() { this.terminated = true; }
  }
  const warn = t.mock.method(console, 'warn', () => {});
  await withGlobals({
    Worker: MockWorker,
    OffscreenCanvas: class {},
    createImageBitmap: async () => ({ close() {} }),
  }, async () => {
    const fixture = mainThreadFixture();
    const scanner = createFallbackQrScanner(fixture.canvas, fixture.context);
    assert.equal(await scanner.detect(fixture.video), payload);
    assert.equal(await scanner.detect(fixture.video), payload);
    assert.equal(fixture.draws, 2);
    assert.equal(instance.terminated, true);
    assert.equal(warn.mock.callCount(), 1);
  });
});

test('bitmap creation failures disable the worker and retain QR decoding', async (t) => {
  let instance;
  class MockWorker {
    constructor() { instance = this; }
    terminate() { this.terminated = true; }
  }
  const warn = t.mock.method(console, 'warn', () => {});
  await withGlobals({
    Worker: MockWorker,
    OffscreenCanvas: class {},
    createImageBitmap: async () => { throw new Error('bitmap failed'); },
  }, async () => {
    const fixture = mainThreadFixture();
    assert.equal(await createFallbackQrScanner(fixture.canvas, fixture.context).detect(fixture.video), payload);
    assert.equal(instance.terminated, true);
    assert.equal(warn.mock.callCount(), 1);
  });
});

test('failed frame transfers close the bitmap and fall back to main-thread decoding', async (t) => {
  let instance;
  let closed = false;
  class MockWorker {
    constructor() { instance = this; }
    postMessage() { throw new Error('transfer failed'); }
    terminate() { this.terminated = true; }
  }
  const warn = t.mock.method(console, 'warn', () => {});
  await withGlobals({
    Worker: MockWorker,
    OffscreenCanvas: class {},
    createImageBitmap: async () => ({ close() { closed = true; } }),
  }, async () => {
    const fixture = mainThreadFixture();
    assert.equal(await createFallbackQrScanner(fixture.canvas, fixture.context).detect(fixture.video), payload);
    assert.equal(closed, true);
    assert.equal(instance.terminated, true);
    assert.equal(warn.mock.callCount(), 1);
  });
});

test('worker decoding errors fall back to the main thread', async (t) => {
  class MockWorker {
    postMessage() { queueMicrotask(() => this.onmessage({ data: { error: 'decode failed' } })); }
    terminate() {}
  }
  const warn = t.mock.method(console, 'warn', () => {});
  await withGlobals({
    Worker: MockWorker,
    OffscreenCanvas: class {},
    createImageBitmap: async () => ({ close() {} }),
  }, async () => {
    const fixture = mainThreadFixture();
    assert.equal(await createFallbackQrScanner(fixture.canvas, fixture.context).detect(fixture.video), payload);
    assert.equal(warn.mock.callCount(), 1);
  });
});
