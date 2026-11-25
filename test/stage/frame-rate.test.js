import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameRateLimiter } from '../../src/stage/frame-rate.js';

test('limits frames to 30, 45, or 60 FPS on a 60 Hz display', () => {
  for (const fps of [30, 45, 60]) {
    const shouldRender = createFrameRateLimiter(() => fps);
    let rendered = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      if (shouldRender(frame * (1000 / 60))) rendered += 1;
    }
    assert.equal(rendered, fps);
  }
});

test('applies FPS changes immediately', () => {
  let fps = 30;
  const shouldRender = createFrameRateLimiter(() => fps);
  assert.equal(shouldRender(0), true);
  assert.equal(shouldRender(16), false);
  fps = 60;
  assert.equal(shouldRender(17), true);
});
