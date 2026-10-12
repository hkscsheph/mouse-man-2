import QRCode from 'qrcode';

export async function renderShareQr(canvas, text) {
  if (!canvas) return;
  if (!text) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  await QRCode.toCanvas(canvas, text, {
    width: canvas.width,
    margin: 1,
    color: {
      dark: '#2a160c',
      light: '#ffe8d4',
    },
  });
}
