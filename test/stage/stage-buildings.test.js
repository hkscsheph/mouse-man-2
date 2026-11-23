import assert from 'node:assert/strict';
import test from 'node:test';
import { stageBuildingSlot, stageBuildingTableLayout } from '../../src/pixel-chase.js';

test('all 16 buildings fit on the tables before overflow uses the floor', () => {
  const slots = Array.from({ length: 18 }, (_, order) => stageBuildingSlot(order));
  for (let desk = 0; desk < 3; desk += 1) {
    assert.deepEqual(
      slots.filter((item) => item.deskIndex === desk),
      [0, 1, 2, 3, 4, 5].map((slot) => ({ deskIndex: desk, slot, floor: false })),
    );
  }
  assert.deepEqual(stageBuildingSlot(18), { deskIndex: 0, slot: 0, floor: true });
  assert.deepEqual(stageBuildingSlot(20), { deskIndex: 2, slot: 0, floor: true });
  assert.deepEqual(stageBuildingSlot(21), { deskIndex: 0, slot: 1, floor: true });
});

test('table buildings are 1.5 times larger and fit without overlapping', () => {
  const widths = [222, 211, 159, 278, 144, 329, 224, 330, 369, 321, 286, 217, 261, 373, 270, 198];
  const frames = widths.map((width) => ({ width }));
  const desks = [360, 400, 360];
  const { scale, offsets } = stageBuildingTableLayout(frames, desks, 336);
  const oldScale = 336 / 6 / Math.max(...widths);
  assert.ok(Math.abs(scale / oldScale - 1.5) < 1e-12);
  for (let desk = 0; desk < desks.length; desk += 1) {
    let end = 0;
    for (let slot = 0; slot < 6; slot += 1) {
      const start = offsets[desk][slot];
      assert.ok(start >= end);
      end = start + frames[(slot * 3 + desk) % frames.length].width * scale;
    }
    assert.ok(end <= desks[desk]);
  }
});
