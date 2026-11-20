import { createFallbackQrScanner } from './stage-qr-scanner.js';
import { connectStageSignals } from './stage-ws.js';

document.title = 'Stage Signals';
document.body.classList.add('signal-mode');

const gate = document.querySelector('#gate');
const tuneToggle = document.querySelector('#tune-toggle');
const tune = document.querySelector('#tune');
const sharePanel = document.querySelector('#share');
[gate, tuneToggle, tune, sharePanel].forEach((el) => {
  if (el) el.hidden = true;
});

const root = document.createElement('main');
root.id = 'signal-root';
root.innerHTML = `
  <h1>Stage signals</h1>
  <p id="signal-status" role="status" aria-live="polite">Starting camera…</p>
  <p id="signal-keys">Keys match the stage: <kbd>A</kbd> focuses the id field, <kbd>D</kbd> demo guest, <kbd>E</kbd> eat, <kbd>Q</kbd> scratch, <kbd>1</kbd>–<kbd>5</kbd> props, <kbd>U</kbd> uniforms, <kbd>+</kbd>/<kbd>-</kbd> size, arrows move the camera, <kbd>T</kbd> toggles the stage HUD.</p>
  <section>
    <h2>Camera</h2>
    <div class="signal-actions">
      <button type="button" data-source="webcam" aria-pressed="true">Webcam</button>
      <button type="button" data-source="ipcam" aria-pressed="false">IP camera</button>
    </div>
    <form id="signal-ipcam-form">
      <label for="signal-ipcam-url">IP camera address</label>
      <input id="signal-ipcam-url" type="text" autocomplete="off" placeholder="rtsp://192.168.1.64/stream" spellcheck="false">
      <button type="submit">Use stream</button>
    </form>
  </section>
  <video id="signal-cam" playsinline muted autoplay aria-label="QR scanner camera"></video>
  <img id="signal-ipcam" alt="IP camera" hidden>
  <form id="signal-admit">
    <label for="signal-id">Participant QR or mouse id</label>
    <input id="signal-id" type="text" autocomplete="off" placeholder="Paste a QR link or mouse id">
    <button type="submit">Admit</button>
  </form>
  <section>
    <h2>Show</h2>
    <div class="signal-actions">
      <button type="button" data-signal="demo">Demo guest</button>
      <button type="button" data-signal="eat">Eat closest</button>
      <button type="button" data-signal="sweep">Clear the stage</button>
      <button type="button" data-signal="scratch">Scratch zoom</button>
      <button type="button" data-signal="restart">Restart</button>
    </div>
  </section>
  <section>
    <h2>Bring on</h2>
    <div class="signal-actions">
      <button type="button" data-prop="figure">Figure</button>
      <button type="button" data-prop="drawing">Drawing</button>
      <button type="button" data-prop="box">Gift</button>
      <button type="button" data-prop="poster">Poster</button>
      <button type="button" data-prop="note">Note</button>
    </div>
  </section>
  <section>
    <h2>View</h2>
    <div class="signal-actions">
      <button type="button" data-signal="uniform">Uniforms</button>
      <button type="button" data-signal="larger">Larger cat</button>
      <button type="button" data-signal="smaller">Smaller cat</button>
      <button type="button" data-move="-1,0,0">Camera left</button>
      <button type="button" data-move="1,0,0">Camera right</button>
      <button type="button" data-move="0,-1,0">Camera closer</button>
      <button type="button" data-move="0,1,0">Camera farther</button>
      <button type="button" data-move="0,0,1">Camera up</button>
      <button type="button" data-move="0,0,-1">Camera down</button>
    </div>
  </section>
`;
document.body.append(root);

const statusEl = root.querySelector('#signal-status');
const wsEl = root.querySelector('#signal-ws');
const video = root.querySelector('#signal-cam');
const ipcamView = root.querySelector('#signal-ipcam');
const ipcamForm = root.querySelector('#signal-ipcam-form');
const ipcamInput = root.querySelector('#signal-ipcam-url');
const admitForm = root.querySelector('#signal-admit');
const admitInput = root.querySelector('#signal-id');
const SOURCE_KEY = 'signal-camera-source';
const URL_KEY = 'signal-camera-url';

function setStatus(text) {
  statusEl.textContent = text;
}

const signals = connectStageSignals({
  onStatus(text) {
    wsEl.textContent = text;
  },
});

function send(payload, label) {
  signals.send(payload);
  setStatus(`Sent: ${label}`);
}

admitForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const raw = admitInput.value.trim();
  if (!raw) return;
  send({ type: 'admit', raw }, raw);
  admitInput.value = '';
});

root.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.type === 'submit') return;
  if (button.dataset.source === 'webcam') {
    void useWebcam();
    return;
  }
  if (button.dataset.source === 'ipcam') {
    void useIpcam(ipcamInput.value);
    return;
  }
  if (button.dataset.prop) {
    send({ type: 'prop', kind: button.dataset.prop }, button.textContent.trim());
    return;
  }
  if (button.dataset.move) {
    const move = button.dataset.move.split(',').map((part) => Number(part) * 0.08);
    send({ type: 'camera', move }, button.textContent.trim());
    return;
  }
  const action = button.dataset.signal;
  if (action === 'demo') send({ type: 'admit' }, 'Demo guest');
  else if (action === 'eat') send({ type: 'catEat' }, 'Eat closest');
  else if (action === 'sweep') send({ type: 'catSweep' }, 'Clear the stage');
  else if (action === 'scratch') send({ type: 'scratch' }, 'Scratch zoom');
  else if (action === 'restart') send({ type: 'restartAll' }, 'Restart');
  else if (action === 'uniform') send({ type: 'uniform' }, 'Uniforms');
  else if (action === 'larger') send({ type: 'spriteScale', delta: 0.1 }, 'Larger cat');
  else if (action === 'smaller') send({ type: 'spriteScale', delta: -0.1 }, 'Smaller cat');
});

const propKeys = {
  1: 'figure',
  2: 'drawing',
  3: 'box',
  4: 'poster',
  5: 'note',
};
let spacePressed = false;

ipcamForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void useIpcam(ipcamInput.value);
});

window.addEventListener('keydown', (event) => {
  const editing = document.activeElement === admitInput || document.activeElement === ipcamInput;
  if (event.code === 'Space' || event.key === ' ') {
    if (!editing) {
      spacePressed = true;
      event.preventDefault();
    }
    return;
  }
  if (!editing) {
    const moveStep = 0.01;
    const movement = {
      ArrowLeft: [-moveStep, 0, 0],
      ArrowRight: [moveStep, 0, 0],
      ArrowUp: spacePressed ? [0, 0, moveStep] : [0, -moveStep, 0],
      ArrowDown: spacePressed ? [0, 0, -moveStep] : [0, moveStep, 0],
    }[event.key];
    if (movement) {
      event.preventDefault();
      send({ type: 'camera', move: movement }, 'Camera');
      return;
    }
  }
  if (event.repeat || editing) return;
  const prop = propKeys[event.key];
  if (prop) {
    event.preventDefault();
    send({ type: 'prop', kind: prop }, prop);
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 't') {
    event.preventDefault();
    send({ type: 'hud' }, 'HUD');
  } else if (key === 'u') {
    event.preventDefault();
    send({ type: 'uniform' }, 'Uniforms');
  } else if (key === 'q') {
    event.preventDefault();
    send({ type: 'scratch' }, 'Scratch zoom');
  } else if (key === 'e') {
    event.preventDefault();
    send({ type: 'catEat' }, 'Eat closest');
  } else if (key === 'd') {
    event.preventDefault();
    send({ type: 'admit' }, 'Demo guest');
  } else if (key === 'a') {
    event.preventDefault();
    admitInput.focus();
    admitInput.select();
  } else if (event.key === '+' || event.code === 'NumpadAdd' || event.key === '=' || event.code === 'Equal') {
    event.preventDefault();
    send({ type: 'spriteScale', delta: 0.1 }, 'Larger cat');
  } else if (event.key === '-' || event.code === 'NumpadSubtract') {
    event.preventDefault();
    send({ type: 'spriteScale', delta: -0.1 }, 'Smaller cat');
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space' || event.key === ' ') spacePressed = false;
});

window.addEventListener('blur', () => {
  spacePressed = false;
});

const scanCanvas = document.createElement('canvas');
const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });
let barcodeDetector = null;
let fallbackScanner = null;
let lastScan = '';
let scanCooldown = 0;
let lastScanAttempt = 0;

async function scanWithFallback(source) {
  if (!fallbackScanner) fallbackScanner = createFallbackQrScanner(scanCanvas, scanContext);
  return fallbackScanner.detect(source);
}

function frameReady(source) {
  if (!source) return false;
  if (source instanceof HTMLVideoElement) {
    return source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && source.videoWidth > 0;
  }
  return source.complete && source.naturalWidth > 0;
}

let scanSource = null;
let scanGeneration = 0;
let sourceRequest = 0;

function startScan() {
  const generation = ++scanGeneration;
  const loop = async () => {
    if (generation !== scanGeneration || !scanSource) return;
    const now = performance.now();
    if (now - lastScanAttempt < 120 || now < scanCooldown) {
      requestAnimationFrame(loop);
      return;
    }
    lastScanAttempt = now;
    const source = scanSource;
    try {
      let raw = '';
      if (frameReady(source)) {
        if (barcodeDetector) {
          try {
            const codes = await barcodeDetector.detect(source);
            raw = codes[0]?.rawValue ?? '';
          } catch (error) {
            console.warn('Native QR scanner failed; using fallback', error);
            barcodeDetector = null;
            raw = await scanWithFallback(source);
          }
        } else {
          raw = await scanWithFallback(source);
        }
      }
      if (generation !== scanGeneration) return;
      if (raw && raw !== lastScan) {
        lastScan = raw;
        scanCooldown = now + 2500;
        send({ type: 'admit', raw }, 'Scanned QR');
      }
    } catch (error) {
      console.warn('QR detect failed', error);
    }
    if (generation === scanGeneration) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function ensureBarcodeDetector() {
  if (barcodeDetector || !('BarcodeDetector' in window)) return;
  try {
    barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
  } catch (error) {
    console.warn('Native QR scanner unavailable; using fallback', error);
  }
}

function markSource(mode) {
  for (const button of root.querySelectorAll('[data-source]')) {
    const selected = button.dataset.source === mode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

function stopWebcam() {
  const stream = video.srcObject;
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
  }
  video.srcObject = null;
  video.removeAttribute('src');
}

function cameraUrl(raw) {
  let parsed;
  try {
    parsed = new URL(String(raw || '').trim());
  } catch {
    setStatus('Enter an http:// or rtsp:// address for the IP camera.');
    return null;
  }
  if (!['http:', 'https:', 'rtsp:', 'rtsps:'].includes(parsed.protocol)) {
    setStatus('The IP camera address must start with http://, https://, or rtsp://.');
    return null;
  }
  return parsed;
}

function loadIpcam(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    const finish = (error) => {
      clearTimeout(timer);
      ipcamView.removeEventListener('load', onLoad);
      ipcamView.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onLoad = () => finish();
    const onError = () => finish(new Error('load'));
    ipcamView.addEventListener('load', onLoad);
    ipcamView.addEventListener('error', onError);
    ipcamView.src = url;
  });
}

async function useWebcam() {
  const request = ++sourceRequest;
  markSource('webcam');
  localStorage.setItem(SOURCE_KEY, 'webcam');
  scanSource = null;
  ipcamView.removeAttribute('src');
  ipcamView.hidden = true;
  video.hidden = false;
  setStatus('Starting camera…');
  try {
    stopWebcam();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (request !== sourceRequest) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    video.srcObject = stream;
    await video.play();
    ensureBarcodeDetector();
    scanSource = video;
    setStatus(barcodeDetector
      ? 'Camera ready. Point it at a participant QR code.'
      : 'Camera ready. QR fallback is active.');
    startScan();
  } catch (error) {
    console.warn(error);
    const denied = error?.name === 'NotAllowedError'
      || error?.name === 'PermissionDeniedError'
      || error?.name === 'SecurityError';
    setStatus(denied
      ? 'Camera blocked. Paste a QR link, use an IP camera, or use the buttons.'
      : 'Camera unavailable. Paste a QR link, use an IP camera, or use the buttons.');
  }
}

async function useIpcam(raw) {
  const parsed = cameraUrl(raw);
  if (!parsed) return;
  const request = ++sourceRequest;
  markSource('ipcam');
  localStorage.setItem(URL_KEY, parsed.href);
  ipcamInput.value = parsed.href;
  setStatus('Opening the IP camera…');
  const endpoint = new URL('api/ipcam', document.baseURI);
  endpoint.searchParams.set('url', parsed.href);
  try {
    const timeoutMs = parsed.protocol === 'rtsp:' || parsed.protocol === 'rtsps:' ? 15000 : 8000;
    await loadIpcam(endpoint.href, timeoutMs);
  } catch (error) {
    console.warn(error);
    if (request !== sourceRequest) return;
    if (video.srcObject) {
      markSource('webcam');
      scanSource = video;
      startScan();
      setStatus('IP camera unavailable. Still using the webcam.');
      return;
    }
    setStatus('IP camera unavailable. Check the address, or switch back to the webcam.');
    return;
  }
  if (request !== sourceRequest) return;
  localStorage.setItem(SOURCE_KEY, 'ipcam');
  stopWebcam();
  video.hidden = true;
  ipcamView.hidden = false;
  ensureBarcodeDetector();
  scanSource = ipcamView;
  setStatus(barcodeDetector
    ? 'IP camera ready. Point it at a participant QR code.'
    : 'IP camera ready. QR fallback is active.');
  startScan();
}

const queryCam = new URLSearchParams(location.search).get('ipcam')?.trim() || '';
const savedUrl = localStorage.getItem(URL_KEY) || '';
if (queryCam) ipcamInput.value = queryCam;
else if (savedUrl) ipcamInput.value = savedUrl;
if (queryCam || (localStorage.getItem(SOURCE_KEY) === 'ipcam' && ipcamInput.value)) {
  void useIpcam(ipcamInput.value);
} else {
  void useWebcam();
}
