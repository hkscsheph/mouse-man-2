function encodeString(value) {
  const raw = Buffer.from(`${value}\0`);
  const padding = (4 - (raw.length % 4)) % 4;
  return Buffer.concat([raw, Buffer.alloc(padding)]);
}

export function encodeOscMessage(address, args = []) {
  if (typeof address !== 'string' || !address.startsWith('/')) {
    throw new TypeError('OSC address must start with /');
  }
  const tags = [];
  const values = [];
  for (const arg of args) {
    if (typeof arg === 'string') {
      tags.push('s');
      values.push(encodeString(arg));
    } else if (typeof arg === 'number' && Number.isFinite(arg)) {
      const value = Buffer.alloc(4);
      if (Number.isInteger(arg)) {
        tags.push('i');
        value.writeInt32BE(arg);
      } else {
        tags.push('f');
        value.writeFloatBE(arg);
      }
      values.push(value);
    } else {
      throw new TypeError('OSC arguments must be finite numbers or strings');
    }
  }
  return Buffer.concat([encodeString(address), encodeString(`,${tags.join('')}`), ...values]);
}
