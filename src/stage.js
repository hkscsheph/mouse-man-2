import jsQR from 'jsqr';
import { createPixelChase } from './pixel-chase.js';
import { createStagePhoto } from './stage-photo.js';
import { connectStageWebSocket, postStageWsMessage } from './stage-ws.js';
import {
  parseMouseFurColorFromQrText,
  parseMouseIdFromQrText,
  resolveParticipant,
} from './stage-face.js';

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
const initialPixelSpriteScale = 3;

const photoCanvas = document.createElement('canvas');
photoCanvas.id = 'stage-photo';
photoCanvas.setAttribute('aria-label', 'Class photo');
document.body.prepend(photoCanvas);

const hud = document.createElement('div');
hud.id = 'stage-hud';
hud.hidden = true;
hud.innerHTML = `
  <p id="stage-status" data-state="idle" role="status" aria-live="polite">Scan participant QR codes (camera) or press <kbd>A</kbd> to admit demo ID.</p>
  <p id="stage-ws-status">WebSocket: connecting…</p>
  <p id="stage-count">Active mice: 0</p>
  <p id="stage-scale">Pixel cat &amp; mice: ${Math.round(initialPixelSpriteScale * 100)}% (<kbd>+</kbd>/<kbd>-</kbd> to resize)</p>
  <div id="stage-row-height">
    <label for="stage-row-rise">3D row rise: <output id="stage-row-rise-value">0.80</output></label>
    <input id="stage-row-rise" type="range" min="0.2" max="0.9" step="0.02" value="0.8" aria-label="3D row rise">
  </div>
  <div id="stage-camera-height">
    <label for="stage-camera">Camera height: <output id="stage-camera-value">1.80</output></label>
    <input id="stage-camera" type="range" min="0.3" max="2.5" step="0.05" value="1.8" aria-label="3D camera height">
  </div>
  <p>Arrow keys move the camera left/right and closer/farther; hold Space + Up/Down to pan vertically.</p>
`;
document.body.appendChild(hud);

const scanVideo = document.createElement('video');
scanVideo.id = 'stage-scan';
scanVideo.playsInline = true;
scanVideo.muted = true;
scanVideo.hidden = true;
scanVideo.setAttribute('aria-label', 'Webcam preview hidden; QR scanning continues');
scanVideo.setAttribute('aria-keyshortcuts', 'T');
scanVideo.title = 'Press T to show the HUD and webcam preview';
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
  if (el) el.textContent = `Active mice: ${photo.listIds().length}`;
}

const admittedIds = new Set();

const photo = createStagePhoto(photoCanvas);
const rowRiseInput = document.querySelector('#stage-row-rise');
const rowRiseValue = document.querySelector('#stage-row-rise-value');
rowRiseInput.addEventListener('input', () => {
  const rowRise = photo.setRowRise(rowRiseInput.value);
  rowRiseValue.value = rowRise.toFixed(2);
});
const cameraHeightInput = document.querySelector('#stage-camera');
const cameraHeightValue = document.querySelector('#stage-camera-value');
cameraHeightInput.addEventListener('input', () => {
  const cameraHeight = photo.setCameraHeight(cameraHeightInput.value);
  cameraHeightValue.value = cameraHeight.toFixed(2);
});
const pixel = createPixelChase(pixelCanvas, {
  initialCount: 0,
  initialSpriteScale: initialPixelSpriteScale,
  mouseWanderSpeed: 0.45,
  mouseWanderRange: 10,
  mouseRunFrameDuration: 150,
  catSpeedVariation: 0.3,
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
  const furColor = idHint ? parseMouseFurColorFromQrText(idHint) : null;
  setStatus(parsed ? `Loading ${parsed}…` : 'Adding guest…');
  let participant;
  try {
    participant = await resolveParticipant(parsed, furColor);
  } catch (error) {
    console.error('stage: failed to restore saved mouse', parsed, error);
    setStatus(
      parsed ? `Could not load saved mouse ${parsed}` : 'Could not add guest',
      'error',
    );
    return;
  }
  if (admittedIds.has(participant.id)) {
    setStatus(`Already on stage: ${participant.id}`);
    return;
  }
  admittedIds.add(participant.id);
  pixel.addMouse(participant.id, participant.traits.fur);
  const fig = photo.addFigure(
    participant.id,
    participant.canvases,
    participant.traits,
    participant.faceSettings,
    participant.partTuning,
  );
  if (!fig) {
    pixel.removeMouse(participant.id);
    admittedIds.delete(participant.id);
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
    setStatus(`Cat eat: unknown id ${targetId}, using closest mouse`);
    targetId = undefined;
  }
  if (!targetId) targetId = pixel.closestMouseId();
  if (!targetId || !ids.includes(targetId)) targetId = ids[0];
  eating = true;
  setStatus(`Cat chasing ${targetId}…`);
  let scratchPromise = Promise.resolve(false);
  await pixel.eatMouse(targetId, () => {
    scratchPromise = photo.scratchOut(targetId);
  });
  await scratchPromise;
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

let spacePressed = false;

window.addEventListener('keydown', (event) => {
  const activeElement = document.activeElement;
  const isEditingControl = activeElement instanceof HTMLElement
    && activeElement.matches('input, textarea, select, [contenteditable="true"]');
  if (event.code === 'Space' || event.key === ' ') {
    if (!isEditingControl) {
      spacePressed = true;
      event.preventDefault();
    }
    return;
  }
  if (!isEditingControl) {
    const moveStep = 0.01;
    const movement = {
      ArrowLeft: [-moveStep, 0],
      ArrowRight: [moveStep, 0],
      ArrowUp: spacePressed ? [0, 0, moveStep] : [0, -moveStep, 0],
      ArrowDown: spacePressed ? [0, 0, -moveStep] : [0, moveStep, 0],
    }[event.key];
    if (movement) {
      event.preventDefault();
      const cameraHeight = photo.moveCamera(...movement);
      cameraHeightInput.value = String(cameraHeight);
      cameraHeightValue.value = cameraHeight.toFixed(2);
      return;
    }
  }
  if (event.repeat) return;
  const scaleDelta =
    event.key === '+' || event.code === 'NumpadAdd'
      || event.key === '=' || event.code === 'Equal'
      ? 0.1
      : event.key === '-' || event.code === 'NumpadSubtract'
        ? -0.1
        : 0;
  if (scaleDelta && document.activeElement !== admitInput) {
    event.preventDefault();
    const scale = pixel.adjustSpriteScale(scaleDelta);
    const el = document.querySelector('#stage-scale');
    if (el) el.textContent = `Pixel cat & mice: ${Math.round(scale * 100)}%`;
    return;
  }
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

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space' || event.key === ' ') spacePressed = false;
});

window.addEventListener('blur', () => {
  spacePressed = false;
});

if (gate) {
  gate.textContent = 'Starting main stage…';
}

startScanCamera();

export {};
