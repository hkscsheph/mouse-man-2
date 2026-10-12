import { createCrowd } from './crowd.js';
import { initFace, readFace, resetFaceTracking } from './face.js';
import { getFeatureScale, setFeatureScale } from './mouse.js';
import {
  canvasesFromSnapshot,
  captureFaceCanvases,
  fetchSnapshot,
  publishSnapshot,
  shareUrlForId,
  snapshotFromMouse,
} from './persist.js';
import { renderShareQr } from './qr.js';
import { createScene } from './scene.js';

const SETTLE_MS = 600;
const SAVE_AFTER_MS = 2000;
const ABSENCE_MS = 1500;
const SETTLE_GAP_MS = 300;
const MIN_EYE_SPAN = 0.055;

const view = document.querySelector('#view');
const video = document.querySelector('#cam');
const gate = document.querySelector('#gate');
const tune = document.querySelector('#tune');
const tuneToggle = document.querySelector('#tune-toggle');
const featureScale = document.querySelector('#feature-scale');
const featureScaleVal = document.querySelector('#feature-scale-val');
const sharePanel = document.querySelector('#share');
const shareQr = document.querySelector('#share-qr');
const shareHint = document.querySelector('#share-hint');

const { scene, camera, renderer } = createScene(view);
const crowd = createCrowd(scene);

let state = 'idle';
let settleStart = 0;
let absentSince = 0;
let liveSince = 0;
let tracking = false;
let last = performance.now();
let saving = false;
let currentShareUrl = '';

function showGate(text) {
  gate.textContent = text;
  gate.classList.remove('hidden');
}

function hideGate() {
  gate.classList.add('hidden');
}

function setIdle() {
  state = 'idle';
  settleStart = 0;
  absentSince = 0;
  liveSince = 0;
}

async function showShareForActor(actor) {
  if (!actor?.mesh?.userData?.mouseId) {
    currentShareUrl = '';
    shareHint.textContent = 'Hold still to save your mouse';
    await renderShareQr(shareQr, '');
    sharePanel.classList.add('empty');
    return;
  }
  currentShareUrl = shareUrlForId(actor.mesh.userData.mouseId);
  shareHint.textContent = 'Scan to open this mouse';
  sharePanel.classList.remove('empty');
  try {
    await renderShareQr(shareQr, currentShareUrl);
  } catch (error) {
    console.error(error);
  }
}

crowd.onFrontChange((actor) => {
  showShareForActor(actor);
});

function lockFaceSnapshot(actor) {
  if (!actor || actor.frozenFace) return actor?.frozenFace;
  actor.frozenFace = captureFaceCanvases(actor.mesh);
  return actor.frozenFace;
}

async function persistLiveMouse(actor) {
  if (!actor || actor.saved || saving) return;
  saving = true;
  try {
    const faceCanvases = lockFaceSnapshot(actor);
    const snapshot = snapshotFromMouse(actor.mesh, {
      id: actor.mesh.userData.mouseId,
      featureScale: getFeatureScale(),
      faceCanvases,
    });
    const published = await publishSnapshot(snapshot);
    actor.mesh.userData.mouseId = published.id;
    actor.saved = true;
    if (crowd.getLive() === actor) {
      shareHint.textContent = published.remote
        ? 'Scan to open this mouse'
        : 'Saved on this display';
      await showShareForActor(actor);
      if (!published.remote) {
        shareHint.textContent = 'Saved on this display';
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    saving = false;
  }
}

function retireLiveMouse({ force = false } = {}) {
  const live = crowd.getLive();
  if (!live) return;
  if (live.locked && !force) return;
  if (live.locked) live.locked = false;
  lockFaceSnapshot(live);
  if (!live.saved) persistLiveMouse(live);
  crowd.freeze();
}

function clearShareQuery() {
  if (!new URLSearchParams(location.search).has('m')) return;
  const url = new URL(location.href);
  url.searchParams.delete('m');
  history.replaceState(null, '', url);
}

/** Staff: freeze current front mouse and start a new webcam-linked one. */
function initWebcamMouse() {
  retireLiveMouse({ force: true });
  clearShareQuery();
  resetFaceTracking();

  const now = performance.now();
  absentSince = 0;
  const face = tracking ? readFace(video, now) : { present: false };

  if (face.present && face.patches && face.eyeSpan >= MIN_EYE_SPAN) {
    crowd.spawnLive(face.patches, { replaceLocked: true });
    state = 'live';
    liveSince = now;
    settleStart = 0;
    return;
  }

  state = 'settling';
  settleStart = now;
  liveSince = 0;
}

function trackHeadOnly(face) {
  const live = crowd.getLive();
  if (!live) return;
  live.mesh.userData.targetYaw = face.yaw;
  live.mesh.userData.targetPitch = face.pitch;
  live.mesh.userData.targetRoll = face.roll;
}

function onFace(face, now) {
  const live = crowd.getLive();

  // QR / restored mice stay in front until cleared — webcam must not replace them.
  if (live?.locked) {
    state = 'live';
    if (face.present) trackHeadOnly(face);
    return;
  }

  if (!face.present) {
    if (state === 'settling') {
      if (!absentSince) absentSince = now;
      if (now - absentSince > SETTLE_GAP_MS) setIdle();
      return;
    }
    if (state === 'live') {
      if (!absentSince) absentSince = now;
      if (now - absentSince > ABSENCE_MS) {
        retireLiveMouse();
        setIdle();
      }
    }
    return;
  }

  absentSince = 0;

  if (face.jumped && state === 'live') {
    retireLiveMouse();
    state = 'settling';
    settleStart = now;
    liveSince = 0;
    return;
  }
  if (face.jumped && state === 'settling') {
    settleStart = now;
    return;
  }

  if (state === 'idle') {
    state = 'settling';
    settleStart = now;
  }

  if (state === 'settling') {
    if (face.eyeSpan < MIN_EYE_SPAN) {
      settleStart = now;
      return;
    }
    if (now - settleStart >= SETTLE_MS) {
      crowd.spawnLive(face.patches);
      state = 'live';
      liveSince = now;
    }
    return;
  }

  if (state === 'live') {
    if (!live) return;
    // Restored / clicked mice keep their saved face; only webcam-born live canvases update.
    if (live.mesh.userData.liveCanvases) crowd.updateLive(face);
    else trackHeadOnly(face);
    if (!live.saved && liveSince && now - liveSince >= SAVE_AFTER_MS) {
      persistLiveMouse(live);
    }
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (tracking) onFace(readFace(video, now), now);
  crowd.update(dt, now / 1000, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

async function loadSharedMouse(id) {
  showGate('Loading mouse…');
  try {
    const snapshot = await fetchSnapshot(id);
    if (snapshot.featureScale) applyFeatureScale(snapshot.featureScale);
    const canvases = await canvasesFromSnapshot(snapshot);
    const actor = crowd.spawnLive(canvases, {
      traits: snapshot.traits,
      id: snapshot.id,
      locked: true,
      staticFace: true,
      replaceLocked: true,
    });
    actor.saved = true;
    actor.locked = true;
    state = 'live';
    liveSince = performance.now();
    hideGate();
    await showShareForActor(actor);
  } catch (error) {
    console.error(error);
    showGate('Could not load that mouse');
  }
}

async function boot() {
  const sharedId = new URLSearchParams(location.search).get('m');
  if (sharedId) {
    await loadSharedMouse(sharedId);
  } else {
    showGate('Starting…');
  }

  try {
    await initFace();
  } catch (error) {
    if (!sharedId) showGate('The face tracker could not start');
    console.error(error);
    if (!sharedId) return;
  }

  try {
    await startCamera();
    tracking = true;
    if (!sharedId) hideGate();
  } catch (error) {
    console.error(error);
    if (sharedId) return;
    showGate('Click to allow the camera');
    const retry = async () => {
      try {
        await startCamera();
        tracking = true;
        hideGate();
      } catch (retryError) {
        console.error(retryError);
        showGate('Camera permission is needed');
      }
    };
    document.body.addEventListener('pointerdown', retry, { once: true });
  }
}

function setTuneOpen(open) {
  tune.classList.toggle('hidden', !open);
  tune.hidden = !open;
  tuneToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function applyFeatureScale(value) {
  setFeatureScale(value);
  featureScale.value = String(getFeatureScale());
  featureScaleVal.textContent = `${getFeatureScale().toFixed(2)}×`;
  crowd.refitFaces();
}

tuneToggle.addEventListener('click', () => {
  setTuneOpen(tune.hidden);
});

featureScale.addEventListener('input', () => {
  applyFeatureScale(featureScale.value);
});

view.addEventListener('pointermove', (event) => {
  const over = crowd.hoverAt(event.clientX, event.clientY, camera, view);
  view.style.cursor = over ? 'pointer' : '';
});

view.addEventListener('click', (event) => {
  const actor = crowd.promoteAt(event.clientX, event.clientY, camera, view);
  if (!actor) return;
  state = 'live';
  liveSince = performance.now();
  absentSince = 0;
  // Keep saved face; head still follows if a visitor is present.
  actor.mesh.userData.liveCanvases = null;
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'Space' || event.key === ' ') {
    event.preventDefault();
    initWebcamMouse();
    return;
  }
  if (event.key === 'f' || event.key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  if (event.key === 'r' || event.key === 'R') {
    crowd.clear();
    resetFaceTracking();
    setIdle();
    showShareForActor(null);
    clearShareQuery();
  }
  if (event.key === 'h' || event.key === 'H') {
    setTuneOpen(tune.hidden);
  }
});

window.addEventListener('contextmenu', (event) => event.preventDefault());
applyFeatureScale(featureScale.value);
showShareForActor(null);

function stagePatch(label, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 192, 192);
  draw(ctx);
  ctx.fillStyle = '#1a120c';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 96, 108);
  canvas.aspect = 1.15;
  return canvas;
}

function stageCanvases(hue) {
  return {
    leftEye: stagePatch('L', (ctx) => {
      ctx.fillStyle = `hsl(${hue} 45% 72%)`;
      ctx.beginPath();
      ctx.ellipse(96, 110, 70, 48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath();
      ctx.ellipse(96, 118, 52, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2118';
      ctx.beginPath();
      ctx.arc(104, 118, 12, 0, Math.PI * 2);
      ctx.fill();
    }),
    rightEye: stagePatch('R', (ctx) => {
      ctx.fillStyle = `hsl(${hue} 45% 72%)`;
      ctx.beginPath();
      ctx.ellipse(96, 110, 70, 48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath();
      ctx.ellipse(96, 118, 52, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2118';
      ctx.beginPath();
      ctx.arc(88, 118, 12, 0, Math.PI * 2);
      ctx.fill();
    }),
    nose: stagePatch('', (ctx) => {
      ctx.fillStyle = `hsl(${hue} 35% 62%)`;
      ctx.beginPath();
      ctx.ellipse(96, 100, 48, 62, 0, 0, Math.PI * 2);
      ctx.fill();
    }),
    mouth: stagePatch('', (ctx) => {
      ctx.fillStyle = `hsl(${hue + 20} 45% 48%)`;
      ctx.beginPath();
      ctx.ellipse(96, 96, 74, 36, 0, 0, Math.PI * 2);
      ctx.fill();
    }),
  };
}

if (new URLSearchParams(location.search).has('stage')) {
  hideGate();
  const hues = [24, 200, 330, 90];
  for (let i = 0; i < hues.length; i += 1) {
    crowd.spawnLive(stageCanvases(hues[i]));
    if (i < hues.length - 1) crowd.freeze();
  }
} else {
  boot();
}

requestAnimationFrame(frame);
