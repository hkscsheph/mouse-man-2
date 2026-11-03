import { formatRegistrationStamp, qrGrid, slipJob } from './registration-slip.js';

const EMOJI_LINE = '🐭🐁🪤🐀🐹🧀';

function bitsFromPixels(data, width, height, dither) {
  const bits = new Uint8Array(width * height);
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i += 1) {
    const a = data[i * 4 + 3];
    luma[i] = a < 128 ? 255 : (data[i * 4] * 30 + data[i * 4 + 1] * 59 + data[i * 4 + 2] * 11) / 100;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const old = luma[i];
      const black = old < 128;
      bits[i] = black ? 1 : 0;
      if (!dither) continue;
      const error = old - (black ? 0 : 255);
      if (x + 1 < width) luma[i + 1] += (error * 7) / 16;
      if (y + 1 >= height) continue;
      if (x > 0) luma[i + width - 1] += (error * 3) / 16;
      luma[i + width] += (error * 5) / 16;
      if (x + 1 < width) luma[i + width + 1] += error / 16;
    }
  }
  return { width, height, bits };
}

function drawBits(width, height, dither, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  draw(ctx, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  return bitsFromPixels(pixels, width, height, dither);
}

function textLineBits(text) {
  return drawBits(576, 72, false, (ctx, width, height) => {
    ctx.fillStyle = '#000';
    ctx.font = '56px "Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 8, height / 2);
  });
}

function emojiLineBits() {
  return drawBits(576, 96, true, (ctx, width, height) => {
    ctx.font = '64px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(EMOJI_LINE, width / 2, height / 2);
  });
}

export function printerStatusText(modeOn, reachable) {
  const link = reachable == null ? 'Checking…' : reachable ? 'Connected.' : 'Not connected.';
  return `Printer ${modeOn ? 'on' : 'off'}. ${link}`;
}

export async function printRegistrationSlip(qrText, date = new Date()) {
  const job = slipJob([
    textLineBits(formatRegistrationStamp(date)),
    qrGrid(qrText),
    emojiLineBits(),
  ]);
  const response = await fetch('/api/print', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: job,
  });
  if (!response.ok) throw new Error(`printer ${response.status}`);
}
