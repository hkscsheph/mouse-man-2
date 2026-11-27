import { createPixelChase } from './pixel-chase.js';
import { createStagePhoto, DEFAULT_STAGE_UNIFORM_ENABLED } from './stage/stage-photo.js';
import { createFrameRateLimiter } from './stage/frame-rate.js';
import { createScratchSound } from './stage/stage-sound.js';
import { connectStageWebSocket } from './stage/stage-ws.js';
import {
  parseMouseFurColorFromQrText,
  parseMouseIdFromQrText,
  resolveParticipant,
} from './stage/stage-face.js';
import { listTransferRecords } from './transfer-folder.js';

document.title = 'Main Stage — Mouse Exhibition';
document.body.classList.add('stage-mode');

const gate = document.querySelector('#gate');
const tuneToggle = document.querySelector('#tune-toggle');
const tune = document.querySelector('#tune');
const sharePanel = document.querySelector('#share');

[tuneToggle, tune, sharePanel].forEach((el) => {
  if (el) el.hidden = true;
});

if (gate) gate.hidden = true;

const pixelCanvas = document.querySelector('#view');
pixelCanvas.classList.add('pixelated', 'stage-pixel');
const initialPixelSpriteScale = 3;
const FPS_LEVELS = [30, 45, 60];
let stageFps = 60;
let measuredFps = null;

const photoBackground = document.createElement('div');
photoBackground.id = 'stage-photo-background';
photoBackground.setAttribute('aria-hidden', 'true');
photoBackground.style.backgroundImage = `url("${import.meta.env.BASE_URL}canteen_mouseview.webp")`;
document.body.prepend(photoBackground);

const photoCanvas = document.createElement('canvas');
photoCanvas.id = 'stage-photo';
photoCanvas.setAttribute('aria-label', 'Class photo');
document.body.prepend(photoCanvas);

const hud = document.createElement('div');
hud.id = 'stage-hud';
hud.hidden = true;
hud.innerHTML = `
  <p id="stage-status" data-state="idle" role="status" aria-live="polite">Waiting for a signal.</p>
  <p id="stage-ws-status">WebSocket: connecting…</p>
  <p id="stage-count">Active mice: 0</p>
  <p id="stage-fps">FPS: -- / 60</p>
  <p id="stage-prop-mode">Background effects: animated (F to toggle)</p>
`;
document.body.appendChild(hud);

const admitInput = document.createElement('input');
admitInput.id = 'stage-admit';
admitInput.type = 'text';
admitInput.placeholder = 'Paste QR URL or mouse id';
admitInput.autocomplete = 'off';
admitInput.hidden = true;
document.body.appendChild(admitInput);

const soundNotice = document.createElement('div');
soundNotice.id = 'stage-sound-notice';
soundNotice.hidden = true;
soundNotice.innerHTML = `
  <span role="status" aria-live="polite"></span>
  <button type="button">Enable sound</button>
`;
document.body.appendChild(soundNotice);
const soundMessage = soundNotice.querySelector('span');
const soundButton = soundNotice.querySelector('button');
const scratchSound = createScratchSound({
  onStatus(status) {
    soundNotice.hidden = status === 'ready';
    soundButton.hidden = status !== 'blocked';
    soundMessage.textContent = status === 'blocked'
      ? 'Scratch sound blocked by browser.'
      : status === 'loading'
        ? 'Scratch sound is loading.'
        : status === 'error'
          ? 'Scratch sound unavailable.'
          : '';
  },
});
soundButton.addEventListener('click', () => void scratchSound.unlock());
document.addEventListener('pointerdown', () => void scratchSound.unlock());
document.addEventListener('keydown', () => void scratchSound.unlock());

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

function updateFpsReadout(fps) {
  if (Number.isFinite(fps)) measuredFps = fps;
  const el = document.querySelector('#stage-fps');
  if (el) el.textContent = `FPS: ${measuredFps ?? '--'} / ${stageFps}`;
}

function updateCount() {
  const el = document.querySelector('#stage-count');
  if (el) el.textContent = `Active mice: ${photo.listIds().length}`;
}

const admittedIds = new Set();

const photo = createStagePhoto(photoCanvas, {
  idle: true,
  pinStandBottom: true,
  showBackdrop: false,
  getFps: () => stageFps,
});
const pixel = createPixelChase(pixelCanvas, {
  initialCount: 0,
  initialSpriteScale: initialPixelSpriteScale,
  posterWallScale: 1.5,
  noteWallScale: 0.75,
  mouseWanderSpeed: 0.45,
  mouseWanderRange: 10,
  mouseRunFrameDuration: 150,
  catSpeedVariation: 0.3,
  getFps: () => stageFps,
  onFps: updateFpsReadout,
  getSize: () => ({
    width: pixelCanvas.clientWidth || window.innerWidth,
    height: pixelCanvas.clientHeight || Math.floor(window.innerHeight * 0.52),
  }),
});

const propStatus = {
  figure: 'A figure slides across the stage…',
  drawing: 'A drawing slides across the stage…',
  box: 'A gift box slides across the stage…',
  poster: 'A poster slides across the stage…',
  note: 'A note slides across the stage…',
};
let immediateProps = false;
pixel.setPropListener((kind) => setStatus(propStatus[kind]));

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
  const ticket = epoch;
  const parsed = idHint ? parseMouseIdFromQrText(idHint) ?? idHint : null;
  const furColor = idHint ? parseMouseFurColorFromQrText(idHint) : null;
  setStatus(parsed ? `Loading ${parsed}…` : 'Adding guest…');
  let participant;
  try {
    participant = await resolveParticipant(parsed, furColor);
  } catch (error) {
    if (ticket !== epoch) return;
    console.error('stage: failed to restore saved mouse', parsed, error);
    setStatus(
      parsed ? `Could not load saved mouse ${parsed}` : 'Could not add guest',
      'error',
    );
    return;
  }
  if (ticket !== epoch) return;
  if (admittedIds.has(participant.id)) {
    setStatus(`Already on stage: ${participant.id}`);
    return;
  }
  admittedIds.add(participant.id);
  const seat = await classPhotoSeat(participant);
  if (ticket !== epoch) return;
  if (seat.error) {
    admittedIds.delete(participant.id);
    setStatus(seat.error, 'error');
    return;
  }
  const fig = photo.addFigure(
    participant.id,
    participant.canvases,
    participant.traits,
    participant.faceSettings,
    participant.partTuning,
    { enter: true, slot: seat.slot, avoidSlots: seat.avoidSlots },
  );
  if (!fig) {
    admittedIds.delete(participant.id);
    setStatus(
      seat.slot == null
        ? 'Class photo full — cannot add more'
        : 'That class photo seat is already filled',
      'error',
    );
    return;
  }
  if (gate) gate.classList.add('hidden');
  presentOnStage(fig, participant);
}

async function classPhotoSeat(participant) {
  let entries = [];
  try {
    entries = await listTransferRecords();
  } catch (error) {
    console.error(error);
    if (participant.snapshot) return { error: 'Could not read the class photo order' };
    return {};
  }
  if (!participant.snapshot) {
    return { avoidSlots: entries.map((_, index) => index).filter((index) => index < 30) };
  }
  const slot = entries.findIndex((entry) => entry.id === participant.id);
  if (slot < 0) return { error: `${participant.id} has no seat in the class photo` };
  if (slot >= 30) return { error: 'Class photo full — cannot add more' };
  return { slot };
}

let entranceChain = Promise.resolve();

function presentOnStage(fig, participant) {
  const ticket = epoch;
  entranceChain = entranceChain
    .catch(() => {})
    .then(async () => {
      if (ticket !== epoch) return;
      setStatus(`${participant.id} is walking on…`);
      const arrived = await photo.playEntrance(fig);
      if (!arrived || ticket !== epoch) return;
      pixel.addMouse(participant.id, participant.traits.fur, { enter: true });
      updateCount();
      setStatus(
        participant.snapshot
          ? `Admitted ${participant.id} (registered face)`
          : `Admitted ${participant.id} (placeholder face)`,
        'success',
      );
    });
}

const eatQueue = [];
let eating = false;
let sweeping = false;
let epoch = 0;

async function eatOne(message) {
  const ticket = epoch;
  const ids = photo.listIds();
  if (!ids.length) {
    setStatus('Cat eat ignored — no mice on stage');
    return false;
  }
  let targetId = message?.id;
  if (targetId && !ids.includes(targetId)) {
    setStatus(`Cat eat: unknown id ${targetId}, using closest mouse`);
    targetId = undefined;
  }
  if (!targetId) targetId = pixel.closestMouseId();
  if (!targetId || !ids.includes(targetId)) targetId = ids[0];
  setStatus(sweeping ? `Cat clearing ${targetId}…` : `Cat chasing ${targetId}…`);
  let scratchPromise = Promise.resolve(false);
  const ate = await pixel.eatMouse(targetId, () => {
    if (ticket !== epoch) return;
    scratchSound.play();
    scratchPromise = photo.scratchOut(targetId);
  });
  if (ticket !== epoch) return false;
  await scratchPromise;
  if (ticket !== epoch) return false;
  updateCount();
  if (!ate) {
    setStatus('Cat eat ignored — no mice on stage');
    return false;
  }
  setStatus(`Cat ate ${targetId}.`);
  return true;
}

async function pumpEats() {
  if (eating) return;
  eating = true;
  const ticket = epoch;
  try {
    while (ticket === epoch && (sweeping || eatQueue.length)) {
      if (sweeping) {
        if (!photo.listIds().length) {
          sweeping = false;
          eatQueue.length = 0;
          setStatus('Every mouse is dead.');
          break;
        }
        const ate = await eatOne({});
        if (!ate) break;
        continue;
      }
      const next = eatQueue.shift();
      if (!photo.listIds().length) {
        eatQueue.length = 0;
        setStatus('Cat eat ignored — no mice on stage');
        break;
      }
      const ate = await eatOne(next);
      if (!ate) break;
    }
  } finally {
    eating = false;
    if (ticket !== epoch && (sweeping || eatQueue.length)) void pumpEats();
  }
}

function restartStage() {
  epoch += 1;
  sweeping = false;
  eatQueue.length = 0;
  pixel.clearMice();
  photo.clearRoster();
  admittedIds.clear();
  updateCount();
  setStatus('Stage restarted. Waiting for a signal.');
}

function logStageControl(message) {
  console.log('stage signal', message);
}

function handleStageMessage(message) {
  logStageControl(message);
  if (message?.type === 'restartAll') {
    restartStage();
    return;
  }
  if (message?.type === 'catSweep') {
    sweeping = true;
    eatQueue.length = 0;
    setStatus('Time is up. The cat is clearing the stage.');
    void pumpEats();
    return;
  }
  if (message?.type === 'admit') {
    const raw = typeof message.raw === 'string' ? message.raw.trim() : '';
    void admitParticipant(raw || null);
    return;
  }
  if (message?.type === 'scratch') {
    playCatScratch();
    return;
  }
  if (message?.type === 'hud') {
    hud.hidden = typeof message.hidden === 'boolean' ? message.hidden : !hud.hidden;
    return;
  }
  if (message?.type === 'fps') {
    const currentIndex = FPS_LEVELS.indexOf(stageFps);
    stageFps = FPS_LEVELS[(currentIndex + 1) % FPS_LEVELS.length];
    updateFpsReadout();
    setStatus(`FPS cap: ${stageFps}`);
    return;
  }
  if (message?.type === 'backgroundEffects') {
    immediateProps = !immediateProps;
    pixel.setImmediateProps(immediateProps);
    document.querySelector('#stage-prop-mode').textContent = `Background effects: ${immediateProps ? 'immediate' : 'animated'} (F to toggle)`;
    setStatus(`Background effects ${immediateProps ? 'appear immediately' : 'are animated'}.`);
    return;
  }
  if (message?.type === 'prop') {
    const kind = message.kind === 'pose' ? 'figure' : message.kind;
    const result = pixel.requestProp(kind);
    if (result === 'started') setStatus(propStatus[kind]);
    else if (result === 'placed') setStatus('Background item added immediately.');
    else if (result === 'queued') setStatus('Queued. The cat will bring it in next.');
    else setStatus('The cat is busy');
    return;
  }
  if (message?.type === 'uniform') {
    uniformsEnabled = photo.setUniformEnabled(
      typeof message.enabled === 'boolean' ? message.enabled : !uniformsEnabled,
    );
    setStatus(`3D uniforms: ${uniformsEnabled ? 'on' : 'off'}`);
    return;
  }
  if (message?.type === 'spriteScale') {
    const scale = pixel.adjustSpriteScale(Number(message.delta));
    setStatus(`Pixel cat & mice: ${Math.round(scale * 100)}%`);
    return;
  }
  if (message?.type === 'camera') {
    const [x = 0, depth = 0, height = 0] = message.move;
    const cameraHeight = photo.moveCamera(Number(x) || 0, Number(depth) || 0, Number(height) || 0);
    setStatus(`Camera height: ${cameraHeight.toFixed(2)}`);
    return;
  }
  if (message?.type === 'catEat') {
    eatQueue.push(message);
    void pumpEats();
  }
}

connectStageWebSocket((msg) => handleStageMessage(msg), {
  onStatus: setWsStatus,
});

let uniformsEnabled = DEFAULT_STAGE_UNIFORM_ENABLED;
let catScratchFrames = null;
let catScratchPlaying = false;
let catScratchOverlay = null;

function prepareScratchFrame(source) {
  const frame = document.createElement('canvas');
  frame.width = source.displayWidth || source.width;
  frame.height = source.displayHeight || source.height;
  const context = frame.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.save();
  context.translate(frame.width, 0);
  context.scale(-1, 1);
  context.drawImage(source, 0, 0);
  context.restore();
  const image = context.getImageData(0, 0, frame.width, frame.height);
  const { data } = image;
  let minX = frame.width;
  let minY = frame.height;
  let maxX = -1;
  let maxY = -1;
  let scratchPixels = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const i = (y * frame.width + x) * 4;
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      if (blue > red + 15 && blue >= green - 10 && blue > 80) {
        data[i + 3] = 0;
        continue;
      }
      if (green > red + 12 && green > blue + 12 && green > 70) {
        data[i] = 255;
        data[i + 1] = 32;
        data[i + 2] = 32;
      } else if (min > 140 && max - min < 36) {
        scratchPixels += 1;
        data[i] = 255;
        data[i + 1] = 36;
        data[i + 2] = 36;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
      data[i + 3] = 255;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  context.putImageData(image, 0, 0);
  return {
    canvas: frame,
    scratch: scratchPixels > 4000,
    duration: Math.max(1, Math.round((source.duration || 100000) / 1000)),
    box: {
      x: maxX < 0 ? 0 : minX,
      y: maxY < 0 ? 0 : minY,
      w: maxX < 0 ? frame.width : maxX - minX + 1,
      h: maxY < 0 ? frame.height : maxY - minY + 1,
    },
  };
}

async function loadCatScratchFrames() {
  if (catScratchFrames) return catScratchFrames;
  const response = await fetch(new URL('./cat_scratch.gif', import.meta.url));
  const decoder = new ImageDecoder({ data: await response.arrayBuffer(), type: 'image/gif' });
  await decoder.tracks.ready;
  const count = decoder.tracks.selectedTrack.frameCount;
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const { image } = await decoder.decode({ frameIndex: index });
    frames.push(prepareScratchFrame(image));
    image.close();
  }
  decoder.close();
  catScratchFrames = frames;
  return frames;
}

function placeCatSprite(element, x, y, w, h) {
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.style.width = `${w}px`;
  element.style.height = `${h}px`;
}

function playCatScratch() {
  if (catScratchPlaying) {
    catScratchPlaying = false;
    catScratchOverlay?.remove();
    catScratchOverlay = null;
    pixel.setCatHidden(false);
    setStatus('Stage running.');
    return;
  }
  catScratchPlaying = true;
  setStatus('The cat scratches…');
  try {
  const first = pixel.captureCat();
  const view = pixelCanvas.getBoundingClientRect();
  const scaleX = view.width / pixelCanvas.width;
  const scaleY = view.height / pixelCanvas.height;
  const from = {
    x: view.left + first.x * scaleX,
    y: view.top + first.y * scaleY,
    w: first.w * scaleX,
    h: first.h * scaleY,
  };
  const runningGifHeight = 312;
  const scratchGifHeight = 792;
  const largestH = Math.min(
    window.innerHeight * 0.82,
    Math.max(from.h * 1.8, window.innerHeight * (runningGifHeight / scratchGifHeight)),
  );
  const largestW = largestH * (from.w / Math.max(1, from.h));
  const end = {
    x: (window.innerWidth - largestW) / 2,
    y: (window.innerHeight - largestH) / 2,
    w: largestW,
    h: largestH,
  };
  const duration = 2400;
  const runFrameMs = 110;
  const focusX = (first.x + first.w / 2) / pixelCanvas.width;
  const focusY = (first.y + first.h / 2) / pixelCanvas.height;
  const maxScale = largestH / Math.max(1, from.h);

  const overlay = document.createElement('div');
  overlay.className = 'stage-cat-zoom';
  const scene = document.createElement('canvas');
  scene.className = 'stage-cat-zoom-scene';
  const sceneContext = scene.getContext('2d');
  const fade = document.createElement('div');
  fade.className = 'stage-cat-zoom-fade';
  const cat = document.createElement('canvas');
  cat.className = 'stage-cat-zoom-cat';
  const catContext = cat.getContext('2d');
  catContext.imageSmoothingEnabled = false;
  const paintRunFrame = (index) => {
    const shot = pixel.captureCat(index);
    cat.width = shot.canvas.width;
    cat.height = shot.canvas.height;
    catContext.imageSmoothingEnabled = false;
    catContext.clearRect(0, 0, cat.width, cat.height);
    catContext.drawImage(shot.canvas, 0, 0);
  };
  paintRunFrame(first.frame);
  overlay.append(scene, fade, cat);
  document.body.append(overlay);
  catScratchOverlay = overlay;
  pixel.setCatHidden(true);

  const framesPromise = loadCatScratchFrames().catch(() => null);
  const started = performance.now();
  const shouldRenderFrame = createFrameRateLimiter(() => stageFps);
  let shownFrame = first.frame;
  const ease = (t) => t * t * (3 - 2 * t);

  const approach = (now) => {
    if (!overlay.isConnected) return;
    try {
    if (!shouldRenderFrame(now)) {
      requestAnimationFrame(approach);
      return;
    }
    const t = Math.min(1, (now - started) / duration);
    const k = ease(t);
    fade.style.opacity = String(k);
    const frame = (first.frame + Math.floor((now - started) / runFrameMs)) % first.frameCount;
    if (frame !== shownFrame) {
      shownFrame = frame;
      paintRunFrame(frame);
    }
    const scale = 1 + (maxScale - 1) * k;
    const originX = from.x + from.w / 2 + (window.innerWidth / 2 - (from.x + from.w / 2)) * k;
    const originY = from.y + from.h / 2 + (window.innerHeight / 2 - (from.y + from.h / 2)) * k;
    const currentView = pixelCanvas.getBoundingClientRect();
    if (scene.width !== window.innerWidth) scene.width = window.innerWidth;
    if (scene.height !== window.innerHeight) scene.height = window.innerHeight;
    sceneContext.imageSmoothingEnabled = false;
    sceneContext.clearRect(0, 0, scene.width, scene.height);
    const plate = pixel.captureZoomPlate();
    const bitmapScale = currentView.width / Math.max(1, pixelCanvas.width);
    const destW = currentView.width * scale;
    const destH = currentView.height * scale;
    const destX = originX - focusX * currentView.width * scale;
    const destY = originY - focusY * currentView.height * scale;
    const padPx = plate.pad * bitmapScale * scale;
    sceneContext.drawImage(
      plate.canvas,
      destX - padPx,
      destY,
      destW * (plate.canvas.width / Math.max(1, pixelCanvas.width)),
      destH,
    );
    const catW = from.w * scale;
    const catH = from.h * scale;
    placeCatSprite(cat, originX - catW / 2, originY - catH / 2, catW, catH);
    if (t < 1) {
      requestAnimationFrame(approach);
      return;
    }
    paintRunFrame(shownFrame);
    placeCatSprite(cat, end.x, end.y, end.w, end.h);
    scene.remove();
    void startScratchGif(framesPromise, overlay, cat, end.h);
    } catch (error) {
      pixel.setCatHidden(false);
      overlay.remove();
      catScratchPlaying = false;
      catScratchOverlay = null;
      setStatus('The cat could not zoom in.');
      console.error(error);
    }
  };
  requestAnimationFrame(approach);
  } catch (error) {
    pixel.setCatHidden?.(false);
    document.querySelector('.stage-cat-zoom')?.remove();
    catScratchPlaying = false;
    catScratchOverlay = null;
    setStatus('The cat could not zoom in.');
    console.error(error);
  }
}

async function startScratchGif(framesPromise, overlay, runCat, startCatHeight) {
  const frames = await framesPromise;
  if (!frames?.length || !overlay.isConnected) {
    pixel.setCatHidden(false);
    catScratchPlaying = false;
    return;
  }
  const hole = document.createElement('div');
  hole.className = 'stage-cat-zoom-hole';
  const cover = Math.hypot(window.innerWidth, window.innerHeight);
  hole.style.width = `${cover}px`;
  hole.style.height = `${cover}px`;
  hole.style.left = `${(window.innerWidth - cover) / 2}px`;
  hole.style.top = `${(window.innerHeight - cover) / 2}px`;
  const play = document.createElement('canvas');
  play.className = 'stage-cat-zoom-play';
  play.width = frames[0].canvas.width;
  play.height = frames[0].canvas.height;
  const playContext = play.getContext('2d');
  playContext.imageSmoothingEnabled = false;
  overlay.append(hole, play);
  runCat.remove();

  const lastBox = frames[frames.length - 1].box;
  const startScale = startCatHeight / Math.max(1, frames[0].box.h);
  const endScale = window.innerHeight / Math.max(1, lastBox.h);
  const drawFrame = (item, progress) => {
    playContext.clearRect(0, 0, play.width, play.height);
    playContext.drawImage(item.canvas, 0, 0);
    const scale = startScale + (endScale - startScale) * progress;
    const width = play.width * scale;
    const height = play.height * scale;
    const centerX = (item.box.x + item.box.w / 2) * scale;
    const centerY = (item.box.y + item.box.h / 2) * scale;
    placeCatSprite(
      play,
      window.innerWidth / 2 - centerX,
      window.innerHeight / 2 - centerY,
      width,
      height,
    );
  };
  drawFrame(frames[0], 0);
  const gifStarted = performance.now();
  const shouldRenderFrame = createFrameRateLimiter(() => stageFps);
  const gifDuration = Math.max(1, frames.reduce((total, item) => total + item.duration, 0));
  const foundScratch = frames.findIndex((item) => item.scratch);
  const scratchIndex = foundScratch < 0 ? frames.length - 1 : foundScratch;
  const scratchStarts = frames.slice(0, scratchIndex).reduce((total, item) => total + item.duration, 0);
  const scratchSpan = Math.max(1, gifDuration - scratchStarts);
  let frameIndex = 0;
  let nextAt = gifStarted + frames[0].duration;
  const tick = (now) => {
    if (!overlay.isConnected) return;
    if (!shouldRenderFrame(now)) {
      requestAnimationFrame(tick);
      return;
    }
    while (frameIndex < frames.length - 1 && now >= nextAt) {
      frameIndex += 1;
      nextAt += frames[frameIndex].duration;
    }
    const elapsed = now - gifStarted;
    drawFrame(frames[frameIndex], Math.min(1, elapsed / gifDuration));
    const scratchProgress = elapsed < scratchStarts ? 0 : Math.min(1, (elapsed - scratchStarts) / scratchSpan);
    hole.style.transform = `scale(${scratchProgress})`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  handleStageMessage({ type: 'admit', raw: value });
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
      handleStageMessage({ type: 'camera', move: movement });
      return;
    }
  }
  if (event.repeat) return;
  if ((event.key === 'h' || event.key === 'H') && !isEditingControl && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    handleStageMessage({ type: 'fps' });
    return;
  }
  if ((event.key === 'f' || event.key === 'F') && !isEditingControl && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    handleStageMessage({ type: 'backgroundEffects' });
    return;
  }
  if ((event.key === 't' || event.key === 'T') && !isEditingControl) {
    event.preventDefault();
    handleStageMessage({ type: 'hud' });
    return;
  }
  if ((event.key === 'u' || event.key === 'U') && !isEditingControl) {
    event.preventDefault();
    handleStageMessage({ type: 'uniform' });
    return;
  }
  const scaleDelta = event.key === '+' || event.code === 'NumpadAdd'
    || event.key === '=' || event.code === 'Equal'
    ? 0.1
    : event.key === '-' || event.code === 'NumpadSubtract'
      ? -0.1
      : 0;
  if (scaleDelta && document.activeElement !== admitInput) {
    event.preventDefault();
    handleStageMessage({ type: 'spriteScale', delta: scaleDelta });
    return;
  }
  if ((event.key === 'q' || event.key === 'Q') && document.activeElement !== admitInput) {
    event.preventDefault();
    handleStageMessage({ type: 'scratch' });
    return;
  }
  if (event.key === 'a' || event.key === 'A') {
    event.preventDefault();
    logStageControl({ type: 'admitPrompt' });
    openAdmitPrompt();
    return;
  }
  if (event.key === 'e' || event.key === 'E') {
    event.preventDefault();
    handleStageMessage({ type: 'catEat' });
    return;
  }
  if (event.key === 'd' || event.key === 'D') {
    event.preventDefault();
    handleStageMessage({ type: 'admit' });
    return;
  }
  if (event.key === '1' || event.key === '2' || event.key === '3' || event.key === '4' || event.key === '5') {
    event.preventDefault();
    const kind = event.key === '1'
      ? 'figure'
      : event.key === '2'
        ? 'drawing'
        : event.key === '3'
          ? 'box'
          : event.key === '4'
            ? 'poster'
            : 'note';
    handleStageMessage({ type: 'prop', kind });
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space' || event.key === ' ') spacePressed = false;
});

window.addEventListener('blur', () => {
  spacePressed = false;
});

export {};
