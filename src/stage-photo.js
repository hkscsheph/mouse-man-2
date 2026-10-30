import * as THREE from 'three';
import { createMouse, disposeMouse } from './mouse.js';

const COLS = 10;
const ROWS = 3;
const MAX = COLS * ROWS;
const ROW_SPACING = 0.92;
const DEFAULT_ROW_RISE = 0.8;
const MIN_ROW_RISE = 0.2;
const MAX_ROW_RISE = 0.9;
const DEFAULT_CAMERA_HEIGHT = 1.8;
const MIN_CAMERA_HEIGHT = 0.3;
const MAX_CAMERA_HEIGHT = 2.5;
const MIN_CAMERA_X = -4;
const MAX_CAMERA_X = 4;
const MIN_CAMERA_DEPTH_OFFSET = -2;
const MAX_CAMERA_DEPTH_OFFSET = 10;
const COLUMN_SPACING = 0.64;

function slotPose(index, rowRise) {
  const seat = index % COLS;
  const row = Math.floor(index / COLS);
  const side = seat % 2 === 0 ? -1 : 1;
  const distanceFromCenter = Math.floor(seat / 2) + 0.5;
  const x = side * distanceFromCenter * COLUMN_SPACING;
  const y = 0.12 + row * rowRise;
  const z = 1.35 - row * ROW_SPACING;
  return { x, y, z, ry: 0, s: 0.52 };
}

export function createStagePhoto(canvas) {
  let rowRise = DEFAULT_ROW_RISE;
  let cameraHeight = DEFAULT_CAMERA_HEIGHT;
  let cameraX = 0;
  let cameraDepthOffset = 0;
  let cameraTargetOffsetY = 0;
  const cameraTarget = new THREE.Vector3(0, 0.85, 0.2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8dcc8, 8, 22);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, cameraHeight, 5.2);
  camera.lookAt(cameraTarget);

  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x6a5040, 0.72));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.2);
  key.position.set(-2, 6, 5);
  scene.add(key);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshStandardMaterial({ color: 0xd9cbb0, roughness: 0.92 }),
  );
  backdrop.position.set(0, 1.05, -0.6);
  scene.add(backdrop);

  const stepMaterial = new THREE.MeshStandardMaterial({ color: 0x79553b, roughness: 0.86 });
  const stepGeometry = new THREE.BoxGeometry(7, 0.12, 0.62);
  const rowSteps = [];
  for (let row = 0; row < ROWS; row += 1) {
    const pose = slotPose(row * COLS, rowRise);
    const step = new THREE.Mesh(stepGeometry, stepMaterial);
    step.position.set(0, pose.y - 0.16, pose.z);
    scene.add(step);
    rowSteps.push(step);
  }

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x345c50, roughness: 0.85 }),
  );
  banner.position.set(0, 1.85, -0.55);
  scene.add(banner);

  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.className = 'stage-scratch-layer';
  canvas.insertAdjacentElement('afterend', scratchCanvas);

  /** @type {{ id: string, mesh: THREE.Group, slot: number, scratching: boolean }[]} */
  const roster = [];

  function layoutScratchCanvas() {
    const rect = canvas.getBoundingClientRect();
    scratchCanvas.width = Math.round(rect.width * devicePixelRatio);
    scratchCanvas.height = Math.round(rect.height * devicePixelRatio);
    scratchCanvas.style.position = 'fixed';
    scratchCanvas.style.left = `${rect.left}px`;
    scratchCanvas.style.top = `${rect.top}px`;
    scratchCanvas.style.width = `${rect.width}px`;
    scratchCanvas.style.height = `${rect.height}px`;
    scratchCanvas.style.pointerEvents = 'none';
    scratchCanvas.style.zIndex = '2';
  }

  function frame() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || Math.floor(window.innerHeight * 0.42);
    camera.aspect = w / Math.max(1, h);
    const horizontalHalfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const fitDistance = 3.8 / Math.max(0.01, Math.tan(horizontalHalfFov));
    cameraTarget.y = 0.85 + rowRise - DEFAULT_ROW_RISE + cameraTargetOffsetY;
    const baseDistance = Math.max(5.2, cameraTarget.z + fitDistance);
    camera.position.set(cameraX, cameraHeight, Math.max(3.5, baseDistance + cameraDepthOffset));
    camera.lookAt(cameraTarget);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    layoutScratchCanvas();
    renderer.render(scene, camera);
  }

  function projectSlotCenterFixed(slot) {
    const pose = slotPose(slot, rowRise);
    const v = new THREE.Vector3(pose.x, pose.y + 0.55, pose.z);
    v.project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((v.x + 1) / 2) * rect.width,
      y: ((-v.y + 1) / 2) * rect.height,
    };
  }

  function setRowRise(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new TypeError('Row rise must be a finite number');
    rowRise = THREE.MathUtils.clamp(numeric, MIN_ROW_RISE, MAX_ROW_RISE);
    for (let row = 0; row < ROWS; row += 1) {
      const pose = slotPose(row * COLS, rowRise);
      rowSteps[row].position.set(0, pose.y - 0.16, pose.z);
    }
    for (const entry of roster) {
      const pose = slotPose(entry.slot, rowRise);
      entry.mesh.position.set(pose.x, pose.y, pose.z);
    }
    frame();
    return rowRise;
  }

  function setCameraHeight(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new TypeError('Camera height must be a finite number');
    cameraHeight = THREE.MathUtils.clamp(numeric, MIN_CAMERA_HEIGHT, MAX_CAMERA_HEIGHT);
    frame();
    return cameraHeight;
  }

  function moveCamera(deltaX, deltaDepth, deltaHeight = 0) {
    const horizontal = Number(deltaX);
    const depth = Number(deltaDepth);
    const vertical = Number(deltaHeight);
    if (!Number.isFinite(horizontal) || !Number.isFinite(depth) || !Number.isFinite(vertical)) {
      throw new TypeError('Camera movement must be finite');
    }
    cameraX = THREE.MathUtils.clamp(cameraX + horizontal, MIN_CAMERA_X, MAX_CAMERA_X);
    cameraDepthOffset = THREE.MathUtils.clamp(
      cameraDepthOffset + depth,
      MIN_CAMERA_DEPTH_OFFSET,
      MAX_CAMERA_DEPTH_OFFSET,
    );
    const nextCameraHeight = THREE.MathUtils.clamp(
      cameraHeight + vertical,
      MIN_CAMERA_HEIGHT,
      MAX_CAMERA_HEIGHT,
    );
    cameraTargetOffsetY += nextCameraHeight - cameraHeight;
    cameraHeight = nextCameraHeight;
    frame();
    return cameraHeight;
  }

  function addFigure(id, canvases, traits, faceSettings, partTuning) {
    if (roster.find((r) => r.id === id)) return null;
    if (roster.length >= MAX) return null;
    let slot = 0;
    while (roster.some((entry) => entry.slot === slot)) slot += 1;
    const mesh = createMouse(canvases, {
      traits,
      faceSettings,
      partTuning,
      id,
      staticFace: true,
    });
    const pose = slotPose(slot, rowRise);
    mesh.position.set(pose.x, pose.y, pose.z);
    mesh.rotation.y = pose.ry;
    mesh.scale.setScalar(pose.s);
    scene.add(mesh);
    const entry = { id, mesh, slot, scratching: false };
    roster.push(entry);
    frame();
    return entry;
  }

  function drawScratches(cx, cy, progress) {
    const ctx = scratchCanvas.getContext('2d');
    const dpr = devicePixelRatio;
    const radius = 42 * dpr * (0.6 + progress * 0.5);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(42, 22, 12, ${0.35 + progress * 0.45})`;
    ctx.lineWidth = 5 * dpr;
    ctx.lineCap = 'round';
    const lines = 7 + Math.floor(progress * 5);
    for (let i = 0; i < lines; i += 1) {
      const angle = (i / lines) * Math.PI * 2 + progress * 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(232, 220, 200, ${progress * 0.55})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function scratchOut(id) {
    const entry = roster.find((r) => r.id === id);
    if (!entry || entry.scratching) return Promise.resolve(false);
    entry.scratching = true;
    frame();
    const center = projectSlotCenterFixed(entry.slot);
    const cx = center.x * devicePixelRatio;
    const cy = center.y * devicePixelRatio;

    return new Promise((resolve) => {
      const start = performance.now();
      const dur = 650;
      function tick(now) {
        const t = Math.min(1, (now - start) / dur);
        drawScratches(cx, cy, t);
        const visible = t < 0.92;
        if (entry.mesh.visible !== visible) {
          entry.mesh.visible = visible;
          frame();
        }
        if (t >= 1) {
          scene.remove(entry.mesh);
          disposeMouse(entry.mesh);
          const idx = roster.indexOf(entry);
          if (idx >= 0) roster.splice(idx, 1);
          frame();
          resolve(true);
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function indexOf(id) {
    return roster.findIndex((r) => r.id === id);
  }

  function listIds() {
    return roster.map((r) => r.id);
  }

  window.addEventListener('resize', frame);
  frame();

  return {
    addFigure,
    scratchOut,
    indexOf,
    listIds,
    setRowRise,
    setCameraHeight,
    moveCamera,
    frame,
    destroy() {
      for (const entry of [...roster]) {
        scene.remove(entry.mesh);
        disposeMouse(entry.mesh);
      }
      roster.length = 0;
      for (const step of rowSteps) scene.remove(step);
      stepGeometry.dispose();
      stepMaterial.dispose();
      scratchCanvas.remove();
      renderer.dispose();
    },
  };
}
