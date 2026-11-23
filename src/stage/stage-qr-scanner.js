import jsQR from 'jsqr';

const WORKER_TIMEOUT = 5000;
const SCAN_MAX_EDGE = 720;

function frameSize(source) {
  return {
    width: source.videoWidth || source.naturalWidth || 0,
    height: source.videoHeight || source.naturalHeight || 0,
  };
}

export function qrFrameReady(source) {
  if (!source) return false;
  if (source instanceof HTMLVideoElement) {
    return source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && source.videoWidth > 0;
  }
  return source.naturalWidth > 0 && source.naturalHeight > 0;
}

function scanSize(width, height) {
  const longEdge = Math.max(width, height);
  if (!longEdge || longEdge <= SCAN_MAX_EDGE) return { width, height };
  const scale = SCAN_MAX_EDGE / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

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

  function scanOnMainThread(source) {
    const frame = frameSize(source);
    if (!frame.width || !frame.height) return '';
    const size = scanSize(frame.width, frame.height);
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? '';
  }

  async function detect(source) {
    if (worker) {
      try {
        const frame = frameSize(source);
        const size = scanSize(frame.width, frame.height);
        const bitmap = size.width && size.height
          ? await createImageBitmap(source, {
            resizeWidth: size.width,
            resizeHeight: size.height,
            resizeQuality: 'high',
          })
          : await createImageBitmap(source);
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
    return scanOnMainThread(source);
  }

  return { detect };
}
