/** Decode one OSC 1.0 packet (a message or a bundle) into plain messages. */

function readString(buffer, offset, end) {
  if (offset >= end) return null;
  let cursor = offset;
  while (cursor < end && buffer[cursor] !== 0) cursor += 1;
  if (cursor >= end) return null;
  const text = buffer.toString('utf8', offset, cursor);
  const next = (cursor + 4) & ~3;
  if (next > end) return null;
  return { text, offset: next };
}

function readNumber(buffer, offset, end, size, read) {
  if (offset + size > end) return null;
  return { value: read.call(buffer, offset), offset: offset + size };
}

function readMessage(buffer, start, end) {
  const address = readString(buffer, start, end);
  if (!address || !address.text.startsWith('/')) return null;
  const args = [];
  if (address.offset >= end || buffer[address.offset] !== 44) {
    return { address: address.text, args };
  }
  const tags = readString(buffer, address.offset, end);
  if (!tags || !tags.text.startsWith(',')) return null;
  let offset = tags.offset;
  for (const tag of tags.text.slice(1)) {
    if (tag === 'i') {
      const value = readNumber(buffer, offset, end, 4, buffer.readInt32BE);
      if (!value) return null;
      args.push(value.value);
      offset = value.offset;
    } else if (tag === 'f') {
      const value = readNumber(buffer, offset, end, 4, buffer.readFloatBE);
      if (!value) return null;
      args.push(value.value);
      offset = value.offset;
    } else if (tag === 'd') {
      const value = readNumber(buffer, offset, end, 8, buffer.readDoubleBE);
      if (!value) return null;
      args.push(value.value);
      offset = value.offset;
    } else if (tag === 'h') {
      if (offset + 8 > end) return null;
      const hi = buffer.readInt32BE(offset);
      const lo = buffer.readUInt32BE(offset + 4);
      const value = hi * 2 ** 32 + lo;
      if (!Number.isSafeInteger(value)) return null;
      args.push(value);
      offset += 8;
    } else if (tag === 's') {
      const value = readString(buffer, offset, end);
      if (!value) return null;
      args.push(value.text);
      offset = value.offset;
    } else if (tag === 'c') {
      if (offset + 4 > end) return null;
      args.push(String.fromCharCode(buffer[offset]));
      offset += 4;
    } else if (tag === 'T' || tag === 'I') {
      args.push(true);
    } else if (tag === 'F') {
      args.push(false);
    } else if (tag === 'N') {
      args.push(null);
    } else if (tag === 'b') {
      if (offset + 4 > end) return null;
      const size = buffer.readInt32BE(offset);
      if (size < 0) return null;
      offset += 4;
      const next = (offset + size + 3) & ~3;
      if (next > end) return null;
      offset = next;
    } else if (tag === 'm' || tag === 'r' || tag === 't') {
      const size = tag === 't' ? 8 : 4;
      if (offset + size > end) return null;
      offset += size;
    } else {
      return null;
    }
  }
  return { address: address.text, args };
}

function readBundle(buffer, start, end) {
  if (end - start < 16) return [];
  if (buffer.toString('ascii', start, start + 8) !== '#bundle\0') return [];
  const messages = [];
  let offset = start + 16;
  while (offset + 4 <= end) {
    const size = buffer.readInt32BE(offset);
    offset += 4;
    if (size < 0 || offset + size > end) break;
    messages.push(...readPacket(buffer, offset, offset + size));
    offset += size;
  }
  return messages;
}

function readPacket(buffer, start, end) {
  if (end - start >= 8 && buffer.toString('ascii', start, start + 8) === '#bundle\0') {
    return readBundle(buffer, start, end);
  }
  const message = readMessage(buffer, start, end);
  return message ? [message] : [];
}

export function decodeOscPacket(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return readPacket(buffer, 0, buffer.length);
}
