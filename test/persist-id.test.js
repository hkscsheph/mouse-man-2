import test from 'node:test';
import assert from 'node:assert/strict';
import { timestampId } from '../src/persist.js';

test('registration ids differ for devices registering in the same second', () => {
  const date = new Date(2026, 0, 2, 3, 4, 5);
  const first = timestampId(date, { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
  const second = timestampId(date, { randomUUID: () => '22222222-2222-4222-8222-222222222222' });

  assert.notEqual(first, second);
  assert.match(first, /^260102030405[0-9a-f]{8}$/);
  assert.match(second, /^260102030405[0-9a-f]{8}$/);
});
