import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeOscPacket } from '../src/osc-decode.js';

function oscString(text) {
  const raw = Buffer.from(`${text}\0`);
  const pad = (4 - (raw.length % 4)) % 4;
  return Buffer.concat([raw, Buffer.alloc(pad)]);
}

function oscFloat(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value);
  return buffer;
}

test('decodes a float press on /signal/eat', () => {
  const packet = Buffer.concat([
    oscString('/signal/eat'),
    oscString(',f'),
    oscFloat(1),
  ]);
  assert.deepEqual(decodeOscPacket(packet), [
    { address: '/signal/eat', args: [1] },
  ]);
});

test('decodes a string argument and a bundle of two messages', () => {
  const admit = Buffer.concat([
    oscString('/signal/admit'),
    oscString(',s'),
    oscString('mouse-42'),
  ]);
  const release = Buffer.concat([
    oscString('/signal/scratch'),
    oscString(',f'),
    oscFloat(0),
  ]);
  const timetag = Buffer.alloc(8);
  timetag.writeUInt32BE(0, 0);
  timetag.writeUInt32BE(1, 4);
  const size = (length) => {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(length);
    return buffer;
  };
  const bundled = Buffer.concat([
    oscString('#bundle'),
    timetag,
    size(admit.length),
    admit,
    size(release.length),
    release,
  ]);
  assert.deepEqual(decodeOscPacket(bundled), [
    { address: '/signal/admit', args: ['mouse-42'] },
    { address: '/signal/scratch', args: [0] },
  ]);
});

test('returns nothing for a truncated packet', () => {
  assert.deepEqual(decodeOscPacket(Buffer.from('/signal/eat')), []);
});
