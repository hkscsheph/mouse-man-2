import jsQR from 'jsqr';

const WORKER_TIMEOUT = 5000;

export function createFallbackQrScanner(canvas, context) {
  let worker = null;
  let pending = null;

  function disableWorker(error) {
    if (!worker) return;
    worker.terminate();
    worker = null;
    console.warn('QR worker unavailable; scanning on the main thread', error);
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pending = null;
    }
  }

  if (
    typeof Worker === 'function' &&
    typeof OffscreenCanvas === 'function' &&
    typeof createImageBitmap === 'function'
  ) {
    try {
      worker = new Worker(new URL('./stage-qr-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (!pending) return;
        if (data.error) {
          disableWorker(new Error(data.error));
          return;
        }
        clearTimeout(pending.timer);
        pending.resolve(data.raw);
        pending = null;
      };
      worker.onerror = (event) => disableWorker(new Error(event.message || 'QR worker failed'));
      worker.onmessageerror = () => disableWorker(new Error('Invalid QR worker message'));
    } catch (error) {
      console.warn('QR worker unavailable; scanning on the main thread', error);
    }
  }

  function scanOnMainThread(video) {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? '';
  }

  async function detect(video) {
    if (worker) {
      try {
        const bitmap = await createImageBitmap(video);
        if (!worker) {
          bitmap.close();
        } else {
          return await new Promise((resolve, reject) => {
            pending = {
              resolve,
              reject,
              timer: setTimeout(() => disableWorker(new Error('QR worker timed out')), WORKER_TIMEOUT),
            };
            try {
              worker.postMessage({ bitmap }, [bitmap]);
            } catch (error) {
              bitmap.close();
              disableWorker(error);
            }
          });
        }
      } catch (error) {
        disableWorker(error);
      }
    }
    return scanOnMainThread(video);
  }

  return { detect };
}
