import assert from 'node:assert/strict';
import test from 'node:test';
import { stageUniformColor } from '../src/stage-photo.js';

test('stage shirt colors match the class photo in center-out admission order', () => {
  const [black, white, olive, burgundy, indigo] = [
    0x171719, 0xe9e9e3, 0x66764f, 0x651e30, 0x3e376d,
  ];
  const expected = [
    [burgundy, indigo, olive, olive, olive, white, white, indigo, black, olive],
    [indigo, indigo, burgundy, olive, black, burgundy, white, indigo, black, indigo],
    [indigo, indigo, burgundy, indigo, olive, olive, white, burgundy, black, indigo],
  ];
  for (let row = 0; row < expected.length; row += 1) {
    for (let seat = 0; seat < expected[row].length; seat += 1) {
      assert.equal(stageUniformColor(row * 10 + seat), expected[row][seat], `row ${row}, seat ${seat}`);
    }
  }
});

test('stage shirt color rejects invalid slots', () => {
  for (const slot of [-1, 30, 1.5, NaN]) {
    assert.throws(() => stageUniformColor(slot), RangeError);
  }
});
