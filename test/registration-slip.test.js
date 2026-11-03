import assert from 'node:assert/strict';
import test from 'node:test';
import QRCode from 'qrcode';
import { printerStatusText } from '../src/registration-print.js';
import { formatRegistrationStamp, qrGrid, slipJob } from '../src/registration-slip.js';

test('printer status names the toggle and the link', () => {
  assert.equal(printerStatusText(true, null), 'Printer on. Checking…');
  assert.equal(printerStatusText(true, true), 'Printer on. Connected.');
  assert.equal(printerStatusText(false, false), 'Printer off. Not connected.');
});

test('stamp is 竄 plus local yyyymmdd hhMM', () => {
  assert.equal(formatRegistrationStamp(new Date(2026, 10, 3, 8, 19)), '竄20261103 0819');
});

test('registration slip is three rasters and the QR fills the head', () => {
  const qr = qrGrid('https://example.test/?m=abc123');
  assert.equal(qr.width, 576);
  assert.equal(qr.height, 576);
  assert.equal(qr.bits[0], 0);
  const span = QRCode.create('https://example.test/?m=abc123', { errorCorrectionLevel: 'M' }).modules.size + 8;
  const inside = Math.floor((5 * 576) / span) - 1;
  assert.equal(qr.bits[inside * 576 + inside], 1);

  const line = { width: 8, height: 1, bits: Uint8Array.of(1, 1, 1, 1, 1, 1, 1, 1) };
  const job = slipJob([line, qr, line]);
  let images = 0;
  for (let i = 0; i < job.length - 3; i += 1) {
    if (job[i] === 0x1d && job[i + 1] === 0x76 && job[i + 2] === 0x30 && job[i + 3] === 0x00) images += 1;
  }
  assert.equal(images, 3);
  assert.equal(job[0], 0x1b);
  assert.equal(job.at(-4), 0x1d);
  assert.equal(job.at(-1), 0x00);
});
