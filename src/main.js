import { createCrowd } from './crowd.js';
import { initFace, readFace, resetFaceTracking } from './face.js';
import { createScene } from './scene.js';

const SETTLE_MS = 600;
const ABSENCE_MS = 1500;
const SETTLE_GAP_MS = 300;
const MIN_EYE_SPAN = 0.055;

const view = document.querySelector('#view');
const video = document.querySelector('#cam');
const gate = document.querySelector('#gate');

const { scene, camera, renderer } = createScene(view);
const crowd = createCrowd(scene);

let state = 'idle';
let settleStart = 0;
let absentSince = 0;
let tracking = false;
let last = performance.now();

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
}

function onFace(face, now) {
  if (!face.present) {
    if (state === 'settling') {
      if (!absentSince) absentSince = now;
      if (now - absentSince > SETTLE_GAP_MS) setIdle();
      return;
    }
    if (state === 'live') {
      if (!absentSince) absentSince = now;
      if (now - absentSince > ABSENCE_MS) {
        crowd.freeze();
        setIdle();
      }
    }
    return;
  }

  absentSince = 0;

  if (face.jumped && state === 'live') {
    crowd.freeze();
    state = 'settling';
    settleStart = now;
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
    }
    return;
  }

  if (state === 'live') crowd.updateLive(face);
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

async function boot() {
  showGate('Starting…');
  try {
    await initFace();
  } catch (error) {
    showGate('The face tracker could not start');
    console.error(error);
    return;
  }
  try {
    await startCamera();
    tracking = true;
    hideGate();
  } catch (error) {
    console.error(error);
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

window.addEventListener('keydown', (event) => {
  if (event.key === 'f' || event.key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  if (event.key === 'r' || event.key === 'R') {
    crowd.clear();
    resetFaceTracking();
    setIdle();
  }
});

window.addEventListener('contextmenu', (event) => event.preventDefault());

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
