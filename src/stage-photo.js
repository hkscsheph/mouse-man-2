import * as THREE from 'three';
import { createMouse, disposeMouse } from './mouse.js';

const COLS = 8;
const ROWS = 4;
const MAX = COLS * ROWS;

function slotPose(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = (col - (COLS - 1) / 2) * 0.72;
  const y = 0.02;
  const z = 1.35 - row * 0.55;
  return { x, y, z, ry: 0, s: 0.52 };
}

export function createStagePhoto(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8dcc8, 8, 22);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 1.05, 4.2);
  camera.lookAt(0, 0.85, 0.2);

  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x6a5040, 0.72));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.2);
  key.position.set(-2, 6, 5);
  scene.add(key);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(8.5, 4.2),
    new THREE.MeshStandardMaterial({ color: 0xd9cbb0, roughness: 0.92 }),
  );
  backdrop.position.set(0, 1.05, -0.6);
  scene.add(backdrop);

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
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    layoutScratchCanvas();
    renderer.render(scene, camera);
  }

  function projectSlotCenterFixed(slot) {
    const pose = slotPose(slot);
    const v = new THREE.Vector3(pose.x, pose.y + 0.55, pose.z);
    v.project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((v.x + 1) / 2) * rect.width,
      y: ((-v.y + 1) / 2) * rect.height,
    };
  }

  function addFigure(id, canvases, traits) {
    if (roster.find((r) => r.id === id)) return null;
    if (roster.length >= MAX) return null;
    const slot = roster.length;
    const mesh = createMouse(canvases, { traits, id, staticFace: true });
    const pose = slotPose(slot);
    mesh.position.set(pose.x, pose.y, pose.z);
    mesh.rotation.y = pose.ry;
    mesh.scale.setScalar(pose.s);
    scene.add(mesh);
    const entry = { id, mesh, slot, scratching: false };
    roster.push(entry);
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
        entry.mesh.visible = t < 0.92;
        if (t >= 1) {
          scene.remove(entry.mesh);
          disposeMouse(entry.mesh);
          const idx = roster.indexOf(entry);
          if (idx >= 0) roster.splice(idx, 1);
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
    frame,
    destroy() {
      for (const entry of [...roster]) {
        scene.remove(entry.mesh);
        disposeMouse(entry.mesh);
      }
      roster.length = 0;
      scratchCanvas.remove();
      renderer.dispose();
    },
  };
}
