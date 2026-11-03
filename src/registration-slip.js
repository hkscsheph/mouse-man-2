import QRCode from 'qrcode';

export const PRINTER_HEAD = 576;

export function formatRegistrationStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `竄${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function qrGrid(text, width = PRINTER_HEAD) {
  if (!text) throw new Error('empty qr');
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const modules = qr.modules.size;
  const span = modules + 8;
  const bits = new Uint8Array(width * width);
  const data = qr.modules.data;
  for (let y = 0; y < width; y += 1) {
    const my = Math.floor((y * span) / width) - 4;
    for (let x = 0; x < width; x += 1) {
      const mx = Math.floor((x * span) / width) - 4;
      if (mx < 0 || my < 0 || mx >= modules || my >= modules) continue;
      if (data[my * modules + mx]) bits[y * width + x] = 1;
    }
  }
  return { width, height: width, bits };
}

export function slipJob(rasters) {
  const parts = [Uint8Array.of(0x1b, 0x40)];
  for (const raster of rasters) {
    const { width, height, bits } = raster;
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y += 1024) {
      const band = Math.min(1024, height - y);
      const body = new Uint8Array(rowBytes * band);
      for (let row = 0; row < band; row += 1) {
        for (let x = 0; x < width; x += 1) {
          if (bits[(y + row) * width + x]) body[row * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
      parts.push(Uint8Array.of(
        0x1d, 0x76, 0x30, 0x00,
        rowBytes & 0xff, (rowBytes >> 8) & 0xff,
        band & 0xff, (band >> 8) & 0xff,
      ), body);
    }
  }
  parts.push(Uint8Array.of(0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00));
  let length = 0;
  for (const part of parts) length += part.length;
  const job = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    job.set(part, offset);
    offset += part.length;
  }
  return job;
}
