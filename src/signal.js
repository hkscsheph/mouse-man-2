import { createFallbackQrScanner, qrFrameReady } from './stage/stage-qr-scanner.js';
import { resolveSignalOscUrl, SIGNAL_OSC_ROUTES, SIGNAL_OSC_UDP_PORT, STATION_NAMES, signalActionFromOsc, signalControl } from './signal/signal-osc.js';
import { connectStageSignals } from './stage/stage-ws.js';

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
  <p id="signal-ws" role="status">Connecting to the stage…</p>
  <section aria-labelledby="signal-stations-heading">
    <h2 id="signal-stations-heading">Stations</h2>
    <ul id="signal-stations" aria-live="polite">
      ${STATION_NAMES.map((name) => `<li data-station="${name}" data-state="unknown" aria-label="${name}: Unknown">${name}</li>`).join('')}
    </ul>
  </section>
  <p id="signal-keys">Keys match the stage: <kbd>A</kbd> focuses the id field, <kbd>D</kbd> demo guest, <kbd>E</kbd> eat, <kbd>Q</kbd> scratch, <kbd>1</kbd>–<kbd>5</kbd> props, <kbd>U</kbd> uniforms, <kbd>+</kbd>/<kbd>-</kbd> size, arrows move the camera, <kbd>F</kbd> toggles background effects, <kbd>H</kbd> cycles FPS (30/45/60), <kbd>T</kbd> toggles the stage HUD.</p>
  <details id="signal-osc-panel">
    <summary>OSC</summary>
    <p id="signal-osc" role="status">OSC offline</p>
    <p>Start <code>npm run stage:osc</code>. Controllers send UDP port ${SIGNAL_OSC_UDP_PORT}. A press sends a value above 0.</p>
    <ul id="signal-osc-map"></ul>
  </details>
  <section>
    <h2>Camera</h2>
    <div class="signal-actions">
      <button type="button" data-source="webcam" aria-pressed="true">Webcam</button>
      <button type="button" data-source="ipcam" aria-pressed="false">IP camera</button>
    </div>
    <form id="signal-ipcam-form">
      <label for="signal-ipcam-url">IP camera address</label>
      <input id="signal-ipcam-url" type="text" autocomplete="off" placeholder="rtsp://192.168.1.64/stream" spellcheck="false">
      <button type="submit">Use stream [Enter]</button>
    </form>
  </section>
  <video id="signal-cam" playsinline muted autoplay aria-label="QR scanner camera"></video>
  <img id="signal-ipcam" alt="IP camera" hidden>
  <form id="signal-admit">
    <label for="signal-id">Participant QR or mouse id</label>
    <input id="signal-id" type="text" autocomplete="off" placeholder="Paste a QR link or mouse id">
    <button type="submit">Admit [Enter]</button>
  </form>
  <section>
    <h2>Show</h2>
    <div class="signal-actions">
      <button type="button" data-signal="demo">Demo guest [D]</button>
      <button type="button" data-signal="eat">Eat closest [E]</button>
      <button type="button" data-signal="sweep">Clear the stage</button>
      <button type="button" data-signal="scratch">Scratch zoom [Q]</button>
      <button type="button" data-signal="restart">Restart</button>
    </div>
  </section>
  <section>
    <h2>Bring on</h2>
    <div class="signal-actions">
      <button type="button" data-prop="figure">Pose [1]</button>
      <button type="button" data-prop="drawing">Draw [2]</button>
      <button type="button" data-prop="box">Build [3]</button>
      <button type="button" data-prop="poster">Film [4]</button>
      <button type="button" data-prop="note">Song [5]</button>
    </div>
  </section>
  <section>
    <h2>View</h2>
    <div class="signal-actions">
      <button type="button" data-signal="uniform">Uniforms [U]</button>
      <button type="button" data-signal="larger">Larger cat [+]</button>
      <button type="button" data-signal="smaller">Smaller cat [-]</button>
      <button type="button" data-move="-1,0,0">Camera left [←]</button>
      <button type="button" data-move="1,0,0">Camera right [→]</button>
      <button type="button" data-move="0,-1,0">Camera closer [↑]</button>
      <button type="button" data-move="0,1,0">Camera farther [↓]</button>
      <button type="button" data-move="0,0,1">Camera up [Space+↑]</button>
      <button type="button" data-move="0,0,-1">Camera down [Space+↓]</button>
      <button type="button" data-signal="backgroundEffects">Background effects [F]</button>
      <button type="button" data-signal="fps">FPS [H]</button>
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

function updateStation(name, connected) {
  if (!STATION_NAMES.includes(name)) return;
  const item = root.querySelector(`[data-station="${name}"]`);
  const state = connected === true ? 'connected' : connected === false ? 'disconnected' : 'unknown';
  item.dataset.state = state;
  item.setAttribute('aria-label', `${name}: ${state}`);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function scanStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const signals = connectStageSignals({
  onMessage(message) {
    if (message.type === 'station') updateStation(message.station, message.connected);
    if (message.type === 'prop' && message.kind === 'box') lightBox();
    if (message.type === 'prop' && (message.kind === 'figure' || message.kind === 'pose')) lightPose();
  },
  onStatus(text) {
    if (wsEl) wsEl.textContent = text;
  },
  onStationStatus(stations) {
    for (const name of STATION_NAMES) {
      updateStation(name, stations?.[name]);
    }
  },
});

function send(payload, label) {
  signals.send(payload);
  setStatus(`Sent: ${label}`);
}

function applyAction(action, signalId) {
  if (!action) return;
  if (action.op === 'send') {
    const payload = signalId ? { ...action.payload, signalId } : action.payload;
    send(payload, action.label);
  } else if (action.op === 'webcam') void useWebcam();
  else if (action.op === 'ipcam') void useIpcam(action.url || ipcamInput.value);
}

admitForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const action = signalControl('admit', admitInput.value);
  if (!action) return;
  applyAction(action);
  admitInput.value = '';
});

root.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.type === 'submit') return;
  if (button.dataset.source === 'webcam') {
    applyAction(signalControl('webcam'));
    return;
  }
  if (button.dataset.source === 'ipcam') {
    applyAction(signalControl('ipcam', ipcamInput.value));
    return;
  }
  if (button.dataset.prop) {
    applyAction(signalControl('prop', button.dataset.prop));
    return;
  }
  if (button.dataset.move) {
    applyAction(signalControl('camera', button.dataset.move));
    return;
  }
  applyAction(signalControl(button.dataset.signal));
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
    applyAction(signalControl('prop', prop));
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 't') {
    event.preventDefault();
    applyAction(signalControl('hud'));
  } else if (key === 'u') {
    event.preventDefault();
    applyAction(signalControl('uniform'));
  } else if (key === 'f') {
    event.preventDefault();
    applyAction(signalControl('backgroundEffects'));
  } else if (key === 'h') {
    event.preventDefault();
    applyAction(signalControl('fps'));
  } else if (key === 'q') {
    event.preventDefault();
    applyAction(signalControl('scratch'));
  } else if (key === 'e') {
    event.preventDefault();
    applyAction(signalControl('eat'));
  } else if (key === 'd') {
    event.preventDefault();
    applyAction(signalControl('demo'));
  } else if (key === 'a') {
    event.preventDefault();
    admitInput.focus();
    admitInput.select();
  } else if (event.key === '+' || event.code === 'NumpadAdd' || event.key === '=' || event.code === 'Equal') {
    event.preventDefault();
    applyAction(signalControl('larger'));
  } else if (event.key === '-' || event.code === 'NumpadSubtract') {
    event.preventDefault();
    applyAction(signalControl('smaller'));
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
      if (qrFrameReady(source)) {
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
      if (raw && (raw !== lastScan || now >= scanCooldown)) {
        lastScan = raw;
        scanCooldown = now + 2500;
        const line = `${scanStamp()} ${raw}`;
        console.log(line);
        setStatus(line);
        signals.send({ type: 'admit', raw });
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

const oscMap = root.querySelector('#signal-osc-map');
for (const [address, text] of SIGNAL_OSC_ROUTES) {
  const item = document.createElement('li');
  item.dataset.address = address;
  const code = document.createElement('code');
  code.textContent = address;
  item.append(code, ` — ${text}`);
  oscMap.append(item);
}

let boxLitTimer = 0;
function lightBox() {
  const nodes = [
    root.querySelector('[data-prop="box"]'),
    root.querySelector('[data-address="/signal/prop/box"]'),
  ];
  for (const el of nodes) if (el) el.dataset.lit = 'on';
  window.clearTimeout(boxLitTimer);
  boxLitTimer = window.setTimeout(() => {
    for (const el of nodes) if (el) delete el.dataset.lit;
  }, 900);
}

let poseLitTimer = 0;
function lightPose() {
  const nodes = [
    root.querySelector('[data-prop="figure"]'),
    ...root.querySelectorAll('[data-address="/signal/prop/figure"], [data-address="/signal/prop/pose"]'),
  ];
  for (const el of nodes) if (el) el.dataset.lit = 'on';
  window.clearTimeout(poseLitTimer);
  poseLitTimer = window.setTimeout(() => {
    for (const el of nodes) if (el) delete el.dataset.lit;
  }, 900);
}

function connectSignalOsc() {
  const url = resolveSignalOscUrl(location, import.meta.env.VITE_STAGE_OSC_URL || '');
  const oscEl = root.querySelector('#signal-osc');
  let closed = false;
  let retry = 1000;
  let timer = 0;
  let openedSocket = null;

  function setOsc(text) {
    oscEl.textContent = text;
  }

  function connect() {
    if (closed) return;
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      console.warn(error);
      setOsc('OSC address is invalid');
      return;
    }
    openedSocket = socket;
    let finished = false;
    const fail = () => {
      if (finished || closed) return;
      finished = true;
      if (openedSocket === socket) openedSocket = null;
      setOsc(`OSC offline (${url})`);
      timer = window.setTimeout(connect, retry);
      retry = Math.min(retry * 2, 8000);
    };
    socket.addEventListener('open', () => {
      retry = 1000;
      setOsc(`OSC connected (${url})`);
    });
    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      const signalId = typeof message?.signalId === 'string' ? message.signalId : '';
      applyAction(signalActionFromOsc(message?.address, message?.args), signalId);
    });
    socket.addEventListener('close', fail);
    socket.addEventListener('error', () => {
      if (socket.readyState !== WebSocket.CLOSING && socket.readyState !== WebSocket.CLOSED) socket.close();
    });
  }

  connect();
  window.addEventListener('pagehide', () => {
    closed = true;
    window.clearTimeout(timer);
    openedSocket?.close();
  });
}

connectSignalOsc();
