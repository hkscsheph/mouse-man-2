import assert from 'node:assert/strict';
import test from 'node:test';
import { createScratchStyle, drawScratches } from '../src/stage-scratch.js';

function pathsAt(style, progress, dpr = 1) {
  const paths = [];
  let start;
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo(x, y) { start = { x, y }; },
    quadraticCurveTo(cx, cy, x, y) { paths.push({ start, control: { x: cx, y: cy }, end: { x, y } }); },
    stroke() {},
  };
  drawScratches(ctx, 100 * dpr, 100 * dpr, progress, style, dpr);
  return paths;
}

test('claw marks extend from a fixed top point in both downward diagonal directions', (t) => {
  let randomValue = 0;
  t.mock.method(Math, 'random', () => randomValue);
  for (const sample of [0, 0.25, 0.499, 0.5, 0.75, 0.999]) {
    randomValue = sample;
    const style = createScratchStyle();
    const frames = [0, 0.25, 0.5, 0.75, 1].map((progress) => pathsAt(style, progress));
    assert.equal(frames[0].length, 6);
    for (let path = 0; path < 6; path += 1) {
      const start = frames[0][path].start;
      assert.deepEqual(frames[0][path].end, start);
      for (let frame = 1; frame < frames.length; frame += 1) {
        assert.deepEqual(frames[frame][path].start, start);
        assert.ok(frames[frame][path].end.y > frames[frame - 1][path].end.y);
      }
      const end = frames.at(-1)[path].end;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      assert.equal(Math.sign(dx), sample < 0.5 ? 1 : -1);
      assert.ok(Math.abs(dx) > 0.7 * dy && Math.abs(dx) < 1.4 * dy);
    }
    for (let slash = 0; slash < 3; slash += 1) {
      assert.deepEqual(frames.at(-1)[slash * 2], frames.at(-1)[slash * 2 + 1]);
    }
  }
});

test('scratch paths scale with the device pixel ratio', () => {
  const style = createScratchStyle();
  const normal = pathsAt(style, 0.5, 1);
  const scaled = pathsAt(style, 0.5, 2);
  for (let i = 0; i < normal.length; i += 1) {
    for (const point of ['start', 'control', 'end']) {
      assert.equal(scaled[i][point].x, normal[i][point].x * 2);
      assert.equal(scaled[i][point].y, normal[i][point].y * 2);
    }
  }
});

test('scratch length, spacing, and stroke widths are 35% larger', (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  const style = createScratchStyle();
  assert.equal(style.halfLength, 24 * 1.35);
  assert.equal(style.spacing, 10 * 1.35);
  assert.equal(style.shadowWidth, 7 * 1.35);
  assert.equal(style.highlightWidth, 3.15 * 1.35);
  const { start, end } = pathsAt(style, 1)[0];
  assert.ok(Math.abs(Math.hypot(end.x - start.x, end.y - start.y)
    - 2 * style.halfLength * style.slashes[0].lengthScale) < 1e-10);
});
