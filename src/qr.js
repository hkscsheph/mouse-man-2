import QRCode from 'qrcode';

const QR_SIZE = 132;

export async function renderShareQr(canvas, text) {
  if (!canvas) return;
  if (!text) {
    canvas.width = QR_SIZE;
    canvas.height = QR_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, QR_SIZE, QR_SIZE);
    return;
  }
  await QRCode.toCanvas(canvas, text, {
    width: QR_SIZE,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#2a160c',
      light: '#ffe8d4',
    },
  });
}
