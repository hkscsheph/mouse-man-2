import jsQR from 'jsqr';

const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext('2d', { willReadFrequently: true });

self.onmessage = ({ data: { bitmap } }) => {
  try {
    if (!context) throw new Error('Unable to create QR worker canvas');
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const raw = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? '';
    self.postMessage({ raw });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    bitmap.close();
  }
};
