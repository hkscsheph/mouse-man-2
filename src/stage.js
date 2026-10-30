import jsQR from 'jsqr';
import { createPixelChase } from './pixel-chase.js';
import { createStagePhoto } from './stage-photo.js';
import { connectStageWebSocket, postStageWsMessage } from './stage-ws.js';
import { parseMouseIdFromQrText, resolveParticipant } from './stage-face.js';

document.title = 'Main Stage — Mouse Exhibition';
document.body.classList.add('stage-mode');

const gate = document.querySelector('#gate');
const tuneToggle = document.querySelector('#tune-toggle');
const tune = document.querySelector('#tune');
const sharePanel = document.querySelector('#share');

[tuneToggle, tune, sharePanel].forEach((el) => {
  if (el) el.hidden = true;
});

const pixelCanvas = document.querySelector('#view');
pixelCanvas.classList.add('pixelated', 'stage-pixel');

const photoCanvas = document.createElement('canvas');
photoCanvas.id = 'stage-photo';
photoCanvas.setAttribute('aria-label', 'Class photo');
document.body.prepend(photoCanvas);

const hud = document.createElement('div');
hud.id = 'stage-hud';
hud.innerHTML = `
  <p id="stage-status" data-state="idle" role="status" aria-live="polite">Scan participant QR codes (camera) or press <kbd>A</kbd> to admit demo ID.</p>
  <p id="stage-ws-status">WebSocket: connecting…</p>
  <p id="stage-count">On stage: 0 mice</p>
`;
document.body.appendChild(hud);

const scanVideo = document.createElement('video');
scanVideo.id = 'stage-scan';
scanVideo.playsInline = true;
scanVideo.muted = true;
scanVideo.setAttribute('aria-label', 'Live webcam preview for QR scanning');
scanVideo.setAttribute('aria-keyshortcuts', 'T');
scanVideo.title = 'Press T to hide the HUD and webcam preview';
hud.setAttribute('aria-keyshortcuts', 'T');
document.body.appendChild(scanVideo);

const scanCanvas = document.createElement('canvas');
const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });

const admitInput = document.createElement('input');
admitInput.id = 'stage-admit';
admitInput.type = 'text';
admitInput.placeholder = 'Paste QR URL or mouse id';
admitInput.autocomplete = 'off';
admitInput.hidden = true;
document.body.appendChild(admitInput);

function setStatus(text, state = 'idle') {
  const el = document.querySelector('#stage-status');
  if (el) {
    el.textContent = text;
    el.dataset.state = state;
  }
}

function setWsStatus(text) {
  const el = document.querySelector('#stage-ws-status');
  if (el) el.textContent = text;
}

function updateCount() {
  const el = document.querySelector('#stage-count');
  if (el) el.textContent = `On stage: ${photo.listIds().length} mice`;
}

/** @type {Map<string, { order: number }>} */
const order = new Map();
let orderSeq = 0;

const photo = createStagePhoto(photoCanvas);
const pixel = createPixelChase(pixelCanvas, {
  initialCount: 0,
  getSize: () => ({
    width: pixelCanvas.clientWidth || window.innerWidth,
    height: pixelCanvas.clientHeight || Math.floor(window.innerHeight * 0.52),
  }),
});

function layoutStage() {
  const photoH = Math.floor(window.innerHeight * 0.48);
  photoCanvas.style.height = `${photoH}px`;
  pixelCanvas.style.height = `${window.innerHeight - photoH}px`;
  pixel.resize();
  photo.frame();
}

window.addEventListener('resize', layoutStage);
layoutStage();

async function admitParticipant(idHint) {
  const parsed = idHint ? parseMouseIdFromQrText(idHint) ?? idHint : null;
  setStatus(parsed ? `Loading ${parsed}…` : 'Adding guest…');
  const participant = await resolveParticipant(parsed);
  if (order.has(participant.id)) {
    setStatus(`Already on stage: ${participant.id}`);
    return;
  }
  order.set(participant.id, { order: orderSeq++ });
  pixel.addMouse(participant.id);
  const fig = photo.addFigure(participant.id, participant.canvases, participant.traits);
  if (!fig) {
    pixel.removeMouse(participant.id);
    order.delete(participant.id);
    setStatus('Class photo full — cannot add more');
    return;
  }
  updateCount();
  setStatus(
    participant.snapshot
      ? `Admitted ${participant.id} (registered face)`
      : `Admitted ${participant.id} (placeholder face)`,
    'success',
  );
  if (gate) gate.classList.add('hidden');
}

let eating = false;

async function handleCatEat(message) {
  if (eating) return;
  const ids = photo.listIds();
  if (!ids.length) {
    setStatus('Cat eat ignored — no mice on stage');
    return;
  }
  let targetId = message.id;
  if (targetId && !ids.includes(targetId)) {
    setStatus(`Cat eat: unknown id ${targetId}, using next in line`);
    targetId = undefined;
  }
  if (!targetId) {
    const sorted = [...order.entries()]
      .filter(([id]) => ids.includes(id))
      .sort((a, b) => a[1].order - b[1].order);
    targetId = sorted[0]?.[0] ?? ids[0];
  }
  eating = true;
  setStatus(`Cat chasing ${targetId}…`);
  await Promise.all([pixel.eatMouse(targetId), photo.scratchOut(targetId)]);
  order.delete(targetId);
  updateCount();
  eating = false;
  setStatus(`Cat ate ${targetId}. Scan or press A to add more.`);
}

connectStageWebSocket((msg) => handleCatEat(msg), {
  onStatus: setWsStatus,
});

async function startScanCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    scanVideo.srcObject = stream;
    await scanVideo.play();
    if (gate) gate.classList.add('hidden');
    if ('BarcodeDetector' in window) {
      try {
        // @ts-ignore — BarcodeDetector is not in all TS libs
        barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
      } catch (error) {
        console.warn('Native QR scanner unavailable; using fallback', error);
      }
    }
    if (!scanContext) {
      setStatus('Unable to start QR scanning — press A to enter an ID', 'error');
      return;
    }
    setStatus(
      barcodeDetector
        ? 'Camera ready — point it at a participant QR code'
        : 'Camera ready — QR scanner fallback active; point it at a participant code',
    );
    scanLoop();
  } catch (error) {
    console.warn(error);
    const denied =
      error?.name === 'NotAllowedError' ||
      error?.name === 'PermissionDeniedError' ||
      error?.name === 'SecurityError';
    setStatus(
      denied
        ? 'Camera access denied — allow camera permission, or press A to enter an ID'
        : 'Camera unavailable — press A to enter an ID or D for a demo guest',
      'error',
    );
    if (gate) {
      gate.textContent = 'Press A to paste a QR link / mouse id';
      gate.classList.remove('hidden');
    }
  }
}

let lastScan = '';
let scanCooldown = 0;
let lastScanAttempt = 0;
let barcodeDetector = null;

async function scanLoop() {
  if (!scanVideo.srcObject) return;
  const now = performance.now();
  if (now - lastScanAttempt < 120) {
    requestAnimationFrame(scanLoop);
    return;
  }
  lastScanAttempt = now;
  if (now < scanCooldown) {
    requestAnimationFrame(scanLoop);
    return;
  }

  try {
    let raw = '';
    if (barcodeDetector) {
      const codes = await barcodeDetector.detect(scanVideo);
      raw = codes[0]?.rawValue ?? '';
    } else if (scanVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (scanCanvas.width !== scanVideo.videoWidth || scanCanvas.height !== scanVideo.videoHeight) {
        scanCanvas.width = scanVideo.videoWidth;
        scanCanvas.height = scanVideo.videoHeight;
      }
      scanContext.drawImage(scanVideo, 0, 0, scanCanvas.width, scanCanvas.height);
      const image = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      raw = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? '';
    }
    if (raw && raw !== lastScan) {
      lastScan = raw;
      scanCooldown = now + 2500;
      await admitParticipant(raw);
    }
  } catch (error) {
    console.warn('QR detect failed', error);
  }

  requestAnimationFrame(scanLoop);
}

function openAdmitPrompt() {
  admitInput.hidden = false;
  admitInput.value = '';
  admitInput.focus();
}

admitInput.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  const value = admitInput.value.trim();
  admitInput.hidden = true;
  if (!value) return;
  await admitParticipant(value);
});

admitInput.addEventListener('blur', () => {
  admitInput.hidden = true;
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if ((event.key === 't' || event.key === 'T') && document.activeElement !== admitInput) {
    event.preventDefault();
    const hideOverlay = !hud.hidden;
    hud.hidden = hideOverlay;
    scanVideo.hidden = hideOverlay;
    scanVideo.title = hideOverlay
      ? 'Press T to show the HUD and webcam preview'
      : 'Press T to hide the HUD and webcam preview';
    scanVideo.setAttribute(
      'aria-label',
      hideOverlay
        ? 'Webcam preview hidden; QR scanning continues'
        : 'Live webcam preview for QR scanning',
    );
    return;
  }
  if (event.key === 'a' || event.key === 'A') {
    event.preventDefault();
    openAdmitPrompt();
    return;
  }
  if (event.key === 'e' || event.key === 'E') {
    event.preventDefault();
    postStageWsMessage({ type: 'catEat' });
    return;
  }
  if (event.key === 'd' || event.key === 'D') {
    event.preventDefault();
    void admitParticipant(null);
  }
});

if (gate) {
  gate.textContent = 'Starting main stage…';
}

startScanCamera();

export {};
