import { createCrowd } from './crowd.js';
import { captureFacePortrait, initFace, readFace, resetFaceTracking } from './face.js';
import {
  bindLiveFeatures,
  getEyePosition,
  getFeatureScale,
  getNostrilScale,
  setEyePosition,
  setFeatureScale,
  setNostrilScale,
} from './mouse.js';
import {
  canvasesFromSnapshot,
  captureFaceCanvases,
  colorToHex,
  fetchSnapshot,
  publishSnapshot,
  shareUrlForId,
  snapshotFromMouse,
} from './persist.js';
import { renderShareQr } from './qr.js';
import { createRegistrationPhoto } from './registration.js';
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
const nostrilScale = document.querySelector('#nostril-scale');
const nostrilScaleVal = document.querySelector('#nostril-scale-val');
const eyePosition = document.querySelector('#eye-position');
const eyePositionValue = document.querySelector('#eye-position-value');
const chestPositionX = document.querySelector('#chest-position-x');
const chestPositionXValue = document.querySelector('#chest-position-x-value');
const chestPositionY = document.querySelector('#chest-position-y');
const chestPositionYValue = document.querySelector('#chest-position-y-value');
const chestPositionZ = document.querySelector('#chest-position-z');
const chestPositionZValue = document.querySelector('#chest-position-z-value');
const chestTilt = document.querySelector('#chest-tilt');
const chestTiltValue = document.querySelector('#chest-tilt-value');
const earPosition = document.querySelector('#ear-position');
const earPositionValue = document.querySelector('#ear-position-value');
const earTilt = document.querySelector('#ear-tilt');
const earTiltValue = document.querySelector('#ear-tilt-value');
const sharePanel = document.querySelector('#share');
const shareQr = document.querySelector('#share-qr');
const shareHint = document.querySelector('#share-hint');
const registrationRoot = document.querySelector('#registration');
const registrationStatus = document.querySelector('#registration-status');
const registrationCapture = document.querySelector('#registration-capture');
const registrationPrint = document.querySelector('#registration-print');
const registrationCount = document.querySelector('#registration-count');
const registrationCards = document.querySelector('#registration-cards');
const registrationPhotoCanvas = document.querySelector('#registration-photo');

const { scene, camera, renderer, rotateCamera } = createScene(view);
const crowd = createCrowd(scene);

let state = 'idle';
let settleStart = 0;
let absentSince = 0;
let liveSince = 0;
let tracking = false;
let last = performance.now();
let saving = false;
let currentShareUrl = '';
let environmentRotationLocked = false;
let dragPointerId = null;
let dragMoved = false;
let suppressNextClick = false;
let lastPointerX = 0;
let lastPointerY = 0;
let dragDistance = 0;
let latestFace = null;
let registrationBusy = false;
let registrationMessage = '';
let registrationHudVisible = true;
const urlParams = new URLSearchParams(location.search);
const mode = !urlParams.has('m') && urlParams.get('mode') === 'random' ? 'random' : 'default';
const registrationMode = !urlParams.has('m') && urlParams.get('mode') === 'reg';
const registrationPhoto = registrationMode ? createRegistrationPhoto(registrationPhotoCanvas) : null;
document.body.classList.toggle('registration-mode', registrationMode);
registrationRoot.hidden = !registrationMode;
let showcaseMode = Boolean(urlParams.get('m'));

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

function setShareLoading(on, hint = 'Saving your mouse…') {
  sharePanel.classList.toggle('loading', on);
  if (on) {
    sharePanel.classList.remove('empty');
    shareHint.textContent = hint;
  }
}

async function showShareForActor(actor) {
  if (!actor?.mesh?.userData?.mouseId) {
    currentShareUrl = '';
    shareHint.textContent = 'Hold still to save your mouse';
    await renderShareQr(shareQr, '');
    sharePanel.classList.remove('loading');
    sharePanel.classList.add('empty');
    return;
  }
  currentShareUrl = shareUrlForId(
    actor.mesh.userData.mouseId,
    colorToHex(actor.mesh.userData.traits.fur),
  );
  setShareLoading(true, 'Preparing QR…');
  try {
    await renderShareQr(shareQr, currentShareUrl);
    sharePanel.classList.remove('loading', 'empty');
    shareHint.textContent = 'Scan to open this mouse';
  } catch (error) {
    console.error(error);
    sharePanel.classList.remove('loading');
    sharePanel.classList.add('empty');
    shareHint.textContent = 'Could not make QR';
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
  if (crowd.getLive() === actor) setShareLoading(true, 'Saving your mouse…');
  try {
    const faceCanvases = lockFaceSnapshot(actor);
    const snapshot = snapshotFromMouse(actor.mesh, {
      id: actor.mesh.userData.mouseId,
      featureScale: getFeatureScale(),
      nostrilScale: getNostrilScale(),
      eyePosition: getEyePosition(),
      faceCanvases,
    });
    const published = await publishSnapshot(snapshot);
    actor.mesh.userData.mouseId = published.id;
    actor.saved = true;
    if (crowd.getLive() === actor) {
      await showShareForActor(actor);
      if (!published.remote) {
        shareHint.textContent = 'Saved on this display';
      }
    }
  } catch (error) {
    console.error(error);
    // Local snapshot failed — retry later; do not show a broken QR.
    actor.saved = false;
    actor.saveRetryAfter = performance.now() + 4000;
    if (crowd.getLive() === actor) {
      sharePanel.classList.remove('loading');
      sharePanel.classList.add('empty');
      shareHint.textContent = 'Could not save — will retry';
      await renderShareQr(shareQr, '');
    }
  } finally {
    saving = false;
  }
}

function updateRegistrationControls(face = latestFace) {
  const ready = Boolean(
    face?.present &&
    !face.jumped &&
    face.eyeSpan >= MIN_EYE_SPAN &&
    face.bounds &&
    crowd.getLive() &&
    !registrationBusy &&
    registrationPhoto.count < registrationPhoto.capacity,
  );
  registrationCapture.disabled = !ready;
  if (registrationBusy) return;
  if (registrationPhoto.failed) {
    registrationStatus.textContent = 'Could not load the class photo. Check the image asset and reload.';
    registrationCapture.disabled = true;
    return;
  }
  if (registrationMessage) {
    registrationStatus.textContent = registrationMessage;
    return;
  }
  if (registrationPhoto.count >= registrationPhoto.capacity) {
    registrationStatus.textContent = 'All class photo places are registered.';
  } else if (ready) {
    registrationStatus.textContent = 'Face ready. Capture to save the participant and create a printable QR.';
  } else if (face?.present && face.eyeSpan < MIN_EYE_SPAN) {
    registrationStatus.textContent = 'Move closer to the camera and look toward it.';
  } else if (state === 'settling') {
    registrationStatus.textContent = 'Hold still while your face is captured…';
  } else if (face?.present) {
    registrationStatus.textContent = 'Keep still and face the camera.';
  } else {
    registrationStatus.textContent = 'Waiting for the next participant…';
  }
}

function onRegistrationFace(face, now) {
  if (!face.present) {
    if (state === 'settling') {
      if (!absentSince) absentSince = now;
      if (now - absentSince > SETTLE_GAP_MS) setIdle();
    }
    updateRegistrationControls(face);
    return;
  }
  absentSince = 0;
  if (face.jumped) {
    if (state === 'settling') settleStart = now;
    updateRegistrationControls(face);
    return;
  }
  if (state === 'idle') {
    state = 'settling';
    settleStart = now;
  }
  if (state === 'settling') {
    if (face.eyeSpan >= MIN_EYE_SPAN && now - settleStart >= SETTLE_MS) {
      const actor = crowd.spawnLive(face.patches);
      actor.mesh.userData.liveCanvases = face.patches;
      state = 'live';
      liveSince = now;
    } else {
      updateRegistrationControls(face);
      return;
    }
  }
  if (state === 'live') {
    const live = crowd.getLive();
    if (live?.mesh.userData.liveCanvases) crowd.updateLive(face);
    else trackHeadOnly(face);
  }
  updateRegistrationControls(face);
}

async function registerParticipant() {
  if (!registrationMode || registrationBusy) return;
  const actor = crowd.getLive();
  const face = latestFace;
  if (
    !actor ||
    !face?.present ||
    face.jumped ||
    face.eyeSpan < MIN_EYE_SPAN ||
    !face.bounds ||
    registrationPhoto.count >= registrationPhoto.capacity
  ) return;

  registrationMessage = '';
  registrationBusy = true;
  updateRegistrationControls(face);
  let portrait;
  try {
    portrait = captureFacePortrait(video, face.bounds);
    lockFaceSnapshot(actor);
    registrationStatus.textContent = 'Saving participant and creating QR…';
    await persistLiveMouse(actor);
    if (!actor.saved || !actor.mesh.userData.mouseId) {
      registrationMessage = 'Could not save this participant. Keep still and try again.';
      return;
    }

    const id = actor.mesh.userData.mouseId;
    const qrUrl = shareUrlForId(id, colorToHex(actor.mesh.userData.traits.fur));
    const card = document.createElement('article');
    card.className = 'registration-card';
    const label = document.createElement('p');
    label.textContent = `Participant ${registrationPhoto.count + 1}`;
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = 132;
    qrCanvas.height = 132;
    card.append(label, qrCanvas);
    try {
      await renderShareQr(qrCanvas, qrUrl);
    } catch (error) {
      console.error(error);
      registrationMessage = 'Participant saved, but QR generation failed.';
      return;
    }
    if (!registrationPhoto.addPortrait(portrait)) {
      registrationMessage = 'The class photo is full.';
      return;
    }
    registrationCards.prepend(card);
    registrationCount.textContent = `${registrationPhoto.count} participant${registrationPhoto.count === 1 ? '' : 's'} registered`;
    crowd.freeze();
    setIdle();
    resetFaceTracking();
    latestFace = null;
    registrationMessage = '';
    await showShareForActor(null);
    updateRegistrationControls(null);
  } catch (error) {
    console.error(error);
    registrationMessage = 'Could not register this participant. Please try again.';
  } finally {
    registrationBusy = false;
    updateRegistrationControls(latestFace);
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
  showcaseMode = false;
  if (!new URLSearchParams(location.search).has('m')) return;
  const url = new URL(location.href);
  url.searchParams.delete('m');
  history.replaceState(null, '', url);
}

function endShowcase() {
  showcaseMode = false;
  const live = crowd.getLive();
  if (live) live.locked = false;
}

/** Staff: freeze current front mouse and start a new webcam-linked one. */
function initWebcamMouse() {
  retireLiveMouse({ force: true });
  endShowcase();
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

function feedShowcaseFace(face) {
  const live = crowd.getLive();
  if (!live) return;
  live.locked = true;
  state = 'live';
  if (!face.present) return;
  // Eyes + mouth follow the webcam; nose / body stay from the saved snapshot.
  if (!live.mesh.userData.liveFeaturesBound && face.patches) {
    bindLiveFeatures(live.mesh, face.patches, ['leftEye', 'rightEye', 'mouth']);
    live.mesh.userData.liveFeaturesBound = true;
  }
  crowd.updateLive(face);
}

function onFace(face, now) {
  const live = crowd.getLive();

  // QR / ?m= showcase: live eyes+mouth, but never settle or spawn a replacement mouse.
  if (showcaseMode || live?.locked) {
    feedShowcaseFace(face);
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
    if (
      !live.saved &&
      liveSince &&
      now - liveSince >= SAVE_AFTER_MS &&
      (!live.saveRetryAfter || now >= live.saveRetryAfter)
    ) {
      persistLiveMouse(live);
    }
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (tracking) {
    latestFace = readFace(video, now);
    if (registrationMode) onRegistrationFace(latestFace, now);
    else onFace(latestFace, now);
  }
  crowd.update(dt, now / 1000);
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
  showcaseMode = true;
  showGate('Loading mouse…');
  try {
    const snapshot = await fetchSnapshot(id);
    if (snapshot.featureScale) applyFeatureScale(snapshot.featureScale);
    if (snapshot.nostrilScale != null) applyNostrilScale(snapshot.nostrilScale);
    if (snapshot.eyePosition != null) applyEyePosition(snapshot.eyePosition);
    const canvases = await canvasesFromSnapshot(snapshot);
    const actor = crowd.spawnLive(canvases, {
      traits: snapshot.traits,
      id: snapshot.id,
      partTuning: snapshot.partTuning,
      locked: true,
      staticFace: true,
      replaceLocked: true,
    });
    actor.saved = true;
    actor.locked = true;
    actor.mesh.userData.liveCanvases = null;
    state = 'live';
    liveSince = performance.now();
    hideGate();
    await showShareForActor(actor);
  } catch (error) {
    console.error(error);
    showGate('Could not load that mouse');
    // Stay in showcaseMode so a failed load does not fall through to webcam spawn.
  }
}

async function boot() {
  const sharedId = urlParams.get('m')?.split('~')[0];
  if (sharedId) {
    showcaseMode = true;
    await loadSharedMouse(sharedId);
  } else if (mode === 'random') {
    startRandomMode();
    return;
  } else if (registrationMode) {
    showcaseMode = false;
    showGate('Starting camera…');
  } else {
    showcaseMode = false;
    showGate('Starting…');
  }

  try {
    await initFace();
  } catch (error) {
    if (!sharedId) showGate('The face tracker could not start');
    if (registrationMode) registrationStatus.textContent = 'The face tracker could not start.';
    console.error(error);
    if (!sharedId) return;
  }

  try {
    await startCamera();
    tracking = true;
    if (!sharedId) hideGate();
    if (registrationMode) updateRegistrationControls(null);
  } catch (error) {
    console.error(error);
    if (sharedId) return;
    showGate('Click to allow the camera');
    if (registrationMode) registrationStatus.textContent = 'Allow camera access to begin registration.';
    const retry = async () => {
      try {
        await startCamera();
        tracking = true;
        hideGate();
        if (registrationMode) updateRegistrationControls(null);
      } catch (retryError) {
        console.error(retryError);
        showGate('Camera permission is needed');
        if (registrationMode) registrationStatus.textContent = 'Camera permission is needed to register participants.';
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

function applyNostrilScale(value) {
  setNostrilScale(value);
  nostrilScale.value = String(getNostrilScale());
  nostrilScaleVal.textContent = `${getNostrilScale().toFixed(2)}×`;
  crowd.refitFaces();
}

function applyEyePosition(value) {
  setEyePosition(value);
  eyePosition.value = String(getEyePosition());
  eyePositionValue.textContent = getEyePosition().toFixed(2);
  crowd.refitFaces();
}

function applyPartTuning() {
  const chestX = Number(chestPositionX.value);
  const chestY = Number(chestPositionY.value);
  const chestZ = Number(chestPositionZ.value);
  const chestTiltDegrees = Number(chestTilt.value);
  const earPositionAmount = Number(earPosition.value);
  const earTiltDegrees = Number(earTilt.value);
  crowd.setPartTuning({
    chestPositionX: chestX,
    chestPositionY: chestY,
    chestPositionZ: chestZ,
    chestTilt: (chestTiltDegrees * Math.PI) / 180,
    earPosition: earPositionAmount,
    earTilt: (earTiltDegrees * Math.PI) / 180,
  });
  chestPositionXValue.textContent = `${chestX.toFixed(2)}×`;
  chestPositionYValue.textContent = `${chestY.toFixed(2)}×`;
  chestPositionZValue.textContent = `${chestZ.toFixed(2)}×`;
  chestTiltValue.textContent = `${chestTiltDegrees}°`;
  earPositionValue.textContent = earPositionAmount.toFixed(2);
  earTiltValue.textContent = `${earTiltDegrees}°`;
}

tuneToggle.addEventListener('click', () => {
  setTuneOpen(tune.hidden);
});

registrationCapture.addEventListener('click', registerParticipant);
registrationPrint.addEventListener('click', () => window.print());
if (registrationMode) {
  registrationCount.textContent = `0 participants registered`;
  updateRegistrationControls(null);
}

featureScale.addEventListener('input', () => {
  applyFeatureScale(featureScale.value);
});
nostrilScale.addEventListener('input', () => {
  applyNostrilScale(nostrilScale.value);
});
eyePosition.addEventListener('input', () => {
  applyEyePosition(eyePosition.value);
});

for (const control of [chestPositionX, chestPositionY, chestPositionZ, chestTilt, earPosition, earTilt]) {
  control.addEventListener('input', applyPartTuning);
}

view.addEventListener('pointerdown', (event) => {
  if (environmentRotationLocked || event.button !== 0) return;
  dragPointerId = event.pointerId;
  dragMoved = false;
  dragDistance = 0;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  view.setPointerCapture(event.pointerId);
  view.style.cursor = 'grabbing';
});

view.addEventListener('pointermove', (event) => {
  if (dragPointerId === event.pointerId) {
    const deltaX = event.clientX - lastPointerX;
    const deltaY = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
    if (dragDistance > 3) dragMoved = true;
    if (!environmentRotationLocked) rotateCamera(deltaX, deltaY);
  }
  const over = crowd.hoverAt(event.clientX, event.clientY, camera, view);
  if (dragPointerId === event.pointerId) view.style.cursor = 'grabbing';
  else view.style.cursor = environmentRotationLocked ? (over ? 'pointer' : '') : 'grab';
});

function endEnvironmentDrag(event) {
  if (dragPointerId !== event.pointerId) return;
  suppressNextClick = event.type === 'pointerup' && dragMoved;
  dragPointerId = null;
  view.style.cursor = environmentRotationLocked ? '' : 'grab';
  if (view.hasPointerCapture(event.pointerId)) view.releasePointerCapture(event.pointerId);
}

view.addEventListener('pointerup', endEnvironmentDrag);
view.addEventListener('pointercancel', endEnvironmentDrag);
view.addEventListener('lostpointercapture', endEnvironmentDrag);

view.addEventListener('click', (event) => {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  const actor = crowd.promoteAt(event.clientX, event.clientY, camera, view);
  if (!actor) return;
  state = 'live';
  liveSince = performance.now();
  absentSince = 0;
  actor.mesh.userData.liveCanvases = null;
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (registrationMode && (event.key === 't' || event.key === 'T')) {
    registrationHudVisible = !registrationHudVisible;
    document.body.classList.toggle('registration-hud-hidden', !registrationHudVisible);
    return;
  }
  if (event.code === 'Space' || event.key === ' ') {
    event.preventDefault();
    if (!registrationMode && mode !== 'random') initWebcamMouse();
    return;
  }
  if (event.key === 'f' || event.key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  if (event.key === 'r' || event.key === 'R') {
    if (mode === 'random') startRandomMode();
    else if (registrationMode) return;
    else {
      endShowcase();
      crowd.clear();
      resetFaceTracking();
      setIdle();
      showShareForActor(null);
      clearShareQuery();
    }
  }
  if (event.key === 'h' || event.key === 'H') {
    setTuneOpen(tune.hidden);
  }
  if (event.key === 'l' || event.key === 'L') {
    environmentRotationLocked = !environmentRotationLocked;
    view.style.cursor = environmentRotationLocked ? '' : 'grab';
  }
});
applyEyePosition(eyePosition.value);

window.addEventListener('contextmenu', (event) => event.preventDefault());
applyFeatureScale(featureScale.value);
applyNostrilScale(nostrilScale.value);
applyPartTuning();
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

function stageCanvases(hue, labels = true) {
  return {
    leftEye: stagePatch(labels ? 'L' : '', (ctx) => {
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
    rightEye: stagePatch(labels ? 'R' : '', (ctx) => {
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
      ctx.fillStyle = 'rgba(55, 24, 35, 0.82)';
      ctx.beginPath();
      ctx.ellipse(84, 136, 5, 7, -0.2, 0, Math.PI * 2);
      ctx.ellipse(108, 136, 5, 7, 0.2, 0, Math.PI * 2);
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
function startRandomMode() {
  crowd.clear();
  crowd.spawnWanderers(stageCanvases(Math.random() * 360, false), 12);
  sharePanel.hidden = true;
  hideGate();
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
