import QRCode from 'qrcode';

/** Bitmap size large enough for long Netlify share URLs (library ignores small widths). */
const QR_BITMAP = 256;

export async function renderShareQr(canvas, text) {
  if (!canvas) return;

  if (!text) {
    canvas.width = QR_BITMAP;
    canvas.height = QR_BITMAP;
    canvas.style.removeProperty('width');
    canvas.style.removeProperty('height');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, QR_BITMAP, QR_BITMAP);
    return;
  }

  // Draw off-DOM so the library cannot force oversized inline CSS on our display canvas.
  const temp = document.createElement('canvas');
  await QRCode.toCanvas(temp, text, {
    width: QR_BITMAP,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#2a160c',
      light: '#ffe8d4',
    },
  });

  canvas.width = temp.width;
  canvas.height = temp.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(temp, 0, 0);
  // Let CSS size the element; qrcode sets style width/height to the bitmap px.
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('height');
}
