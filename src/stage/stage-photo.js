import * as THREE from 'three';
import { createMouse, disposeMouse, setMouseUniform, UNIFORM_COLORS } from '../mouse.js';
import { createScratchStyle, drawScratches } from './stage-scratch.js';

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
const MIN_CAMERA_FOV = 20;
const MAX_CAMERA_FOV = 70;
const MIN_TARGET_OFFSET_Y = -2;
const MAX_TARGET_OFFSET_Y = 2;
const COLUMN_SPACING = 0.64;
export const DEFAULT_STAGE_UNIFORM_ENABLED = true;

const [black, white, olive, burgundy, indigo] = UNIFORM_COLORS;
// Front to back, left to right; purple and navy share the five-color indigo.
const UNIFORM_ROWS = [
  [black, white, olive, olive, burgundy, indigo, olive, white, indigo, olive],
  [black, white, black, burgundy, indigo, indigo, olive, burgundy, indigo, indigo],
  [black, white, olive, burgundy, indigo, indigo, indigo, olive, burgundy, indigo],
];

export function stageUniformColor(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX) {
    throw new RangeError('Stage uniform slot must be an integer from 0 to 29');
  }
  const seat = slot % COLS;
  const offset = Math.floor(seat / 2);
  const column = seat % 2 === 0 ? COLS / 2 - 1 - offset : COLS / 2 + offset;
  return UNIFORM_ROWS[Math.floor(slot / COLS)][column];
}

const STEP_HEIGHT = 0.12;
const STEP_DEPTH = 0.62;
const STEP_DROP = 0.16;
// The scaled foot sole sits just below the mouse origin.
const FOOT_SOLE = 0.021;

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

function standY(pose) {
  return pose.y - STEP_DROP + STEP_HEIGHT / 2 + FOOT_SOLE;
}

const GESTURES = ['wave', 'nod', 'look', 'shrug'];

function restRotations(parts) {
  return parts.map((part) => part.rotation.clone());
}

function poseClassMouse(entry, time) {
  if (entry.eaten || entry.scratching || entry.entrance) return;
  const mesh = entry.mesh;
  const phase = mesh.userData.phase;
  const bob = mesh.userData.bob;
  const torso = mesh.userData.torso;
  const head = mesh.userData.head;
  const arms = mesh.userData.arms;
  const legs = mesh.userData.legs;
  if (!entry.idle) {
    entry.idle = {
      nextGesture: time + 0.8 + Math.random() * 3.5,
      gesture: null,
      armRest: restRotations(arms),
      legRest: legs.map((leg) => leg.rotation.x),
    };
  }
  const idle = entry.idle;
  const sway = Math.sin(time * 0.55 + phase);

  bob.position.y = Math.sin(time * 1.15 + phase) * 0.01;
  bob.rotation.z = Math.sin(time * 0.72 + phase) * 0.01;
  torso.rotation.y = Math.sin(time * 0.31 + phase) * 0.045;
  torso.rotation.z = sway * 0.02;
  head.rotation.y = Math.sin(time * 0.42 + phase) * 0.07;
  head.rotation.x = Math.sin(time * 0.27 + phase * 1.3) * 0.035;
  head.rotation.z = Math.sin(time * 0.24 + phase * 0.7) * 0.03;
  mesh.rotation.z = sway * 0.018;
  legs.forEach((leg, index) => {
    const side = index === 0 ? 1 : -1;
    leg.rotation.x = idle.legRest[index] + sway * 0.035 * side;
  });

  const gesture = idle.gesture;
  const active = gesture && (time - gesture.start) / gesture.dur;
  if (!gesture && time >= idle.nextGesture) {
    idle.gesture = {
      name: GESTURES[Math.floor(Math.random() * GESTURES.length)],
      start: time,
      dur: 1.4 + Math.random() * 1.1,
      side: Math.random() < 0.5 ? 0 : 1,
    };
  } else if (gesture && active >= 1) {
    idle.gesture = null;
    idle.nextGesture = time + 2.8 + Math.random() * 5.5;
  }

  const envelope = gesture && active < 1 ? Math.sin(active * Math.PI) : 0;
  arms.forEach((arm, index) => {
    const rest = idle.armRest[index];
    arm.rotation.x = rest.x;
    arm.rotation.y = rest.y;
    arm.rotation.z = rest.z;
    if (!gesture || active >= 1) return;
    if (gesture.name === 'wave' && index === gesture.side) {
      const outward = index === 0 ? -1 : 1;
      arm.rotation.x = rest.x - 0.95 * envelope;
      arm.rotation.z = rest.z + outward * 0.28 * envelope + Math.sin(time * 9) * 0.08 * envelope;
    } else if (gesture.name === 'shrug') {
      const outward = index === 0 ? -1 : 1;
      arm.rotation.z = rest.z + outward * 0.32 * envelope;
      arm.rotation.x = rest.x - 0.22 * envelope;
    }
  });
  if (gesture && active < 1 && gesture.name === 'nod') {
    head.rotation.x += Math.sin(active * Math.PI * 2) * 0.14;
  } else if (gesture && active < 1 && gesture.name === 'look') {
    const dir = gesture.side === 0 ? -1 : 1;
    head.rotation.y += dir * 0.28 * envelope;
    torso.rotation.y += dir * 0.06 * envelope;
  }
}

export function createStagePhoto(canvas, {
  idle = false,
  pinStandBottom = false,
  showBackdrop = true,
} = {}) {
  let rowRise = DEFAULT_ROW_RISE;
  let cameraHeight = DEFAULT_CAMERA_HEIGHT;
  let cameraX = 0;
  let cameraDepthOffset = 0;
  let cameraTargetOffsetY = 0;
  let uniformEnabled = DEFAULT_STAGE_UNIFORM_ENABLED;
  let badgeTexture = null;
  const cameraTarget = new THREE.Vector3(0, 0.85, 0.2);
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  let renderWidth = 0;
  let renderHeight = 0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8dcc8, 8, 22);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
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
  if (showBackdrop) scene.add(backdrop);

  const stepMaterial = new THREE.MeshStandardMaterial({ color: 0x79553b, roughness: 0.86 });
  const stepGeometry = new THREE.BoxGeometry(7, STEP_HEIGHT, STEP_DEPTH);
  const rowSteps = [];
  for (let row = 0; row < ROWS; row += 1) {
    const pose = slotPose(row * COLS, rowRise);
    const step = new THREE.Mesh(stepGeometry, stepMaterial);
    step.position.set(0, pose.y - STEP_DROP, pose.z);
    scene.add(step);
    rowSteps.push(step);
  }

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x345c50, roughness: 0.85 }),
  );
  banner.position.set(0, 1.85, -0.55);
  if (showBackdrop) scene.add(banner);

  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.className = 'stage-scratch-layer';
  canvas.insertAdjacentElement('afterend', scratchCanvas);

  /** @type {{ id: string, mesh: THREE.Group, slot: number, scratching: boolean, eaten: boolean, scratchProgress: number, scratchStyle: ReturnType<typeof createScratchStyle> | null }[]} */
  const roster = [];

  function layoutScratchCanvas() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width * devicePixelRatio);
    const height = Math.round(rect.height * devicePixelRatio);
    if (scratchCanvas.width !== width) scratchCanvas.width = width;
    if (scratchCanvas.height !== height) scratchCanvas.height = height;
    scratchCanvas.style.position = 'fixed';
    scratchCanvas.style.left = `${rect.left}px`;
    scratchCanvas.style.top = `${rect.top}px`;
    scratchCanvas.style.width = `${rect.width}px`;
    scratchCanvas.style.height = `${rect.height}px`;
    scratchCanvas.style.pointerEvents = 'none';
    scratchCanvas.style.zIndex = '2';
  }

  const standBottom = new THREE.Vector3();
  const worldUpInCamera = new THREE.Vector3();

  function frontStandBottom(target) {
    const pose = slotPose(0, rowRise);
    return target.set(0, pose.y - STEP_DROP - STEP_HEIGHT / 2, pose.z + STEP_DEPTH / 2);
  }

  // Shift that puts the front riser's bottom edge on the bottom of the view.
  // Camera orientation stays put; only a shared vertical pan of camera and target changes.
  function standBottomLift() {
    camera.updateMatrixWorld(true);
    frontStandBottom(standBottom).applyMatrix4(camera.matrixWorldInverse);
    worldUpInCamera.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const denom = worldUpInCamera.y - worldUpInCamera.z * tanHalf;
    if (Math.abs(denom) < 1e-5) return 0;
    return (standBottom.y - tanHalf * standBottom.z) / denom;
  }

  function frame() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || Math.floor(window.innerHeight * 0.42);
    camera.aspect = w / Math.max(1, h);
    const horizontalHalfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const fitDistance = 3.8 / Math.max(0.01, Math.tan(horizontalHalfFov));
    const panY = pinStandBottom ? cameraTargetOffsetY : 0;
    cameraTarget.y = 0.85 + rowRise - DEFAULT_ROW_RISE + (pinStandBottom ? 0 : cameraTargetOffsetY);
    const baseDistance = Math.max(5.2, cameraTarget.z + fitDistance);
    const baseHeight = pinStandBottom ? cameraHeight - panY : cameraHeight;
    camera.position.set(cameraX, baseHeight, Math.max(3.5, baseDistance + cameraDepthOffset));
    camera.lookAt(cameraTarget);
    if (pinStandBottom) {
      const lift = standBottomLift();
      camera.position.y = baseHeight + lift + panY;
      cameraTarget.y += lift + panY;
      camera.lookAt(cameraTarget);
    }
    camera.updateProjectionMatrix();
    if (w !== renderWidth || h !== renderHeight) {
      renderer.setSize(w, h, false);
      renderWidth = w;
      renderHeight = h;
    }
    layoutScratchCanvas();
    renderer.render(scene, camera);
    renderScratchOverlay();
  }

  function projectSlotCenterFixed(slot) {
    const pose = slotPose(slot, rowRise);
    const v = new THREE.Vector3(pose.x, standY(pose) + 0.55, pose.z);
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
      rowSteps[row].position.set(0, pose.y - STEP_DROP, pose.z);
    }
    for (const entry of roster) {
      if (!entry.presented) continue;
      const pose = slotPose(entry.slot, rowRise);
      entry.mesh.position.set(pose.x, standY(pose), pose.z);
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

  function perspectiveState() {
    return {
      fov: Math.round(camera.fov * 1000) / 1000,
      rowRise: Math.round(rowRise * 1000) / 1000,
      cameraHeight: Math.round(cameraHeight * 1000) / 1000,
      cameraX: Math.round(cameraX * 1000) / 1000,
      cameraDepthOffset: Math.round(cameraDepthOffset * 1000) / 1000,
      cameraTargetOffsetY: Math.round(cameraTargetOffsetY * 1000) / 1000,
    };
  }

  function applyPerspective(config = {}) {
    if (Number.isFinite(Number(config.fov))) {
      camera.fov = THREE.MathUtils.clamp(Number(config.fov), MIN_CAMERA_FOV, MAX_CAMERA_FOV);
    }
    if (Number.isFinite(Number(config.rowRise))) setRowRise(config.rowRise);
    if (Number.isFinite(Number(config.cameraHeight))) {
      cameraHeight = THREE.MathUtils.clamp(Number(config.cameraHeight), MIN_CAMERA_HEIGHT, MAX_CAMERA_HEIGHT);
    }
    if (Number.isFinite(Number(config.cameraX))) {
      cameraX = THREE.MathUtils.clamp(Number(config.cameraX), MIN_CAMERA_X, MAX_CAMERA_X);
    }
    if (Number.isFinite(Number(config.cameraDepthOffset))) {
      cameraDepthOffset = THREE.MathUtils.clamp(
        Number(config.cameraDepthOffset),
        MIN_CAMERA_DEPTH_OFFSET,
        MAX_CAMERA_DEPTH_OFFSET,
      );
    }
    if (Number.isFinite(Number(config.cameraTargetOffsetY))) {
      cameraTargetOffsetY = THREE.MathUtils.clamp(
        Number(config.cameraTargetOffsetY),
        MIN_TARGET_OFFSET_Y,
        MAX_TARGET_OFFSET_Y,
      );
    }
    frame();
    return perspectiveState();
  }

  function adjustFov(delta) {
    camera.fov = THREE.MathUtils.clamp(camera.fov + Number(delta), MIN_CAMERA_FOV, MAX_CAMERA_FOV);
    frame();
    return camera.fov;
  }

  function addFigure(id, canvases, traits, faceSettings, partTuning, options = {}) {
    if (roster.find((r) => r.id === id)) return null;
    const reserved = new Set(
      (options.avoidSlots || []).filter((seat) => Number.isInteger(seat) && seat >= 0 && seat < MAX),
    );
    let slot = options.slot;
    if (Number.isInteger(slot)) {
      if (slot < 0 || slot >= MAX || roster.some((entry) => entry.slot === slot)) return null;
    } else {
      slot = 0;
      while (slot < MAX && (reserved.has(slot) || roster.some((entry) => entry.slot === slot))) slot += 1;
      if (slot >= MAX) return null;
    }
    const mesh = createMouse(canvases, {
      traits,
      faceSettings,
      partTuning,
      id,
      staticFace: true,
      switchableUniformColor: stageUniformColor(slot),
    });
    if (!badgeTexture) {
      badgeTexture = mesh.getObjectByName('school-badge').material.map;
      badgeTexture.addEventListener('load', frame);
    }
    setMouseUniform(mesh, uniformEnabled);
    const enter = options.enter === true;
    const pose = slotPose(slot, rowRise);
    mesh.position.set(pose.x, standY(pose), pose.z);
    mesh.rotation.y = pose.ry;
    mesh.scale.setScalar(pose.s);
    mesh.visible = !enter;
    scene.add(mesh);
    const entry = {
      id,
      mesh,
      slot,
      presented: !enter,
      scratching: false,
      eaten: false,
      scratchProgress: 0,
      scratchStyle: null,
      entrance: null,
    };
    roster.push(entry);
    frame();
    return entry;
  }

  function offscreenRightX(z) {
    const distance = Math.max(0.4, camera.position.z - z);
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * distance;
    return camera.position.x + halfWidth + 0.55;
  }

  function smoothStep(t) {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    return clamped * clamped * (3 - 2 * clamped);
  }

  function swingWalk(entry, gait, amount) {
    const motion = entry.entrance;
    const legs = entry.mesh.userData.legs;
    const arms = entry.mesh.userData.arms;
    if (legs?.[0]) legs[0].rotation.x = motion.legRest[0] + gait * 0.48 * amount;
    if (legs?.[1]) legs[1].rotation.x = motion.legRest[1] - gait * 0.48 * amount;
    if (arms?.[0]) arms[0].rotation.x = motion.armRest[0] - gait * 0.18 * amount;
    if (arms?.[1]) arms[1].rotation.x = motion.armRest[1] + gait * 0.18 * amount;
  }

  function finishEntrance(entry, arrived) {
    const motion = entry.entrance;
    if (!motion) return;
    entry.entrance = null;
    if (arrived) {
      const pose = slotPose(entry.slot, rowRise);
      entry.mesh.position.set(pose.x, standY(pose), pose.z);
      entry.mesh.rotation.set(0, pose.ry, 0);
      entry.mesh.userData.legs?.forEach((leg, index) => {
        leg.rotation.x = motion.legRest[index];
      });
      entry.mesh.userData.arms?.forEach((arm, index) => {
        arm.rotation.x = motion.armRest[index];
      });
      entry.presented = true;
    }
    motion.resolve(arrived);
  }

  function advanceEntrance(entry, now) {
    const motion = entry.entrance;
    if (!motion) return;
    const pose = slotPose(entry.slot, rowRise);
    const elapsed = now - motion.t0;
    const gait = Math.sin(elapsed / 1000 * 9);
    if (elapsed < motion.walkMs) {
      const along = smoothStep(elapsed / motion.walkMs);
      entry.mesh.position.set(
        THREE.MathUtils.lerp(motion.startX, pose.x, along),
        motion.floorY + Math.abs(gait) * 0.012,
        motion.floorZ,
      );
      entry.mesh.rotation.set(0, -Math.PI / 2, 0);
      swingWalk(entry, gait, 1);
      return;
    }
    const climb = (elapsed - motion.walkMs) / motion.climbMs;
    if (climb < 1) {
      const along = smoothStep(climb);
      entry.mesh.position.set(
        pose.x,
        THREE.MathUtils.lerp(motion.floorY, standY(pose), along),
        THREE.MathUtils.lerp(motion.floorZ, pose.z, along),
      );
      entry.mesh.rotation.set(Math.sin(along * Math.PI) * 0.2, THREE.MathUtils.lerp(-Math.PI / 2, pose.ry, along), 0);
      swingWalk(entry, gait, 1 - along);
      return;
    }
    finishEntrance(entry, true);
  }

  function playEntrance(entry) {
    if (!entry || entry.eaten || !roster.includes(entry)) return Promise.resolve(false);
    if (entry.entrance) return entry.entrance.promise;
    frame();
    // Feet stay in the visible foreground, level with the front step.
    const floorZ = 2.05;
    const floorY = standY(slotPose(0, rowRise));
    const pose = slotPose(entry.slot, rowRise);
    const startX = Math.max(offscreenRightX(floorZ), pose.x + 0.8);
    entry.mesh.visible = true;
    entry.mesh.position.set(startX, floorY, floorZ);
    entry.mesh.rotation.set(0, -Math.PI / 2, 0);
    entry.mesh.scale.setScalar(pose.s);
    const legs = entry.mesh.userData.legs ?? [];
    const arms = entry.mesh.userData.arms ?? [];
    let resolve = () => {};
    const promise = new Promise((done) => {
      resolve = done;
    });
    entry.entrance = {
      t0: performance.now(),
      walkMs: Math.max(900, (Math.abs(startX - pose.x) / 2.15) * 1000),
      climbMs: 900,
      startX,
      floorY,
      floorZ,
      legRest: legs.map((leg) => leg.rotation.x),
      armRest: arms.map((arm) => arm.rotation.x),
      resolve,
      promise,
    };
    ensureAnimate();
    frame();
    return promise;
  }

  function renderScratchOverlay() {
    const ctx = scratchCanvas.getContext('2d');
    ctx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    for (const entry of roster) {
      if (entry.scratchProgress <= 0) continue;
      const center = projectSlotCenterFixed(entry.slot);
      drawScratches(
        ctx,
        center.x * devicePixelRatio,
        center.y * devicePixelRatio,
        entry.scratchProgress,
        entry.scratchStyle,
        devicePixelRatio,
      );
    }
  }

  function blackOutFigure(entry) {
    for (const material of entry.mesh.userData.ownMaterials ?? []) {
      material.color?.set(0x000000);
      material.emissive?.set(0x000000);
    }
    entry.mesh.traverse((child) => {
      if (child.name === 'school-badge') child.visible = false;
      if (!child.isMesh || !child.userData.isFace) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.color?.set(0x000000);
    });
  }

  function setUniformEnabled(enabled) {
    uniformEnabled = enabled;
    for (const entry of roster) {
      setMouseUniform(entry.mesh, enabled);
      if (entry.eaten) blackOutFigure(entry);
    }
    frame();
    return uniformEnabled;
  }

  function scratchOut(id) {
    const entry = roster.find((r) => r.id === id);
    if (!entry || entry.scratching || entry.eaten) return Promise.resolve(false);
    entry.scratching = true;
    entry.scratchStyle = createScratchStyle();
    frame();

    return new Promise((resolve) => {
      const start = performance.now();
      const dur = 250;
      function tick(now) {
        if (!roster.includes(entry)) {
          resolve(false);
          return;
        }
        const t = Math.min(1, (now - start) / dur);
        entry.scratchProgress = t;
        renderScratchOverlay();
        if (t >= 1) {
          entry.scratching = false;
          entry.eaten = true;
          blackOutFigure(entry);
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
    return roster.findIndex((r) => r.id === id && !r.eaten);
  }

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(roster.map((entry) => entry.mesh), true);
    for (const hit of hits) {
      let object = hit.object;
      while (object) {
        const entry = roster.find((candidate) => candidate.mesh === object);
        if (entry) return entry.id;
        object = object.parent;
      }
    }
    return null;
  }

  function listIds() {
    return roster.filter((r) => r.presented && !r.eaten).map((r) => r.id);
  }

  function clearRoster() {
    for (const entry of roster) {
      finishEntrance(entry, false);
      scene.remove(entry.mesh);
      disposeMouse(entry.mesh);
    }
    roster.length = 0;
    renderScratchOverlay();
    frame();
  }

  window.addEventListener('resize', frame);
  frame();

  let running = true;
  let animating = false;
  function animate(now) {
    if (!running) {
      animating = false;
      return;
    }
    const time = now / 1000;
    if (idle) {
      for (const entry of roster) poseClassMouse(entry, time);
    }
    for (const entry of roster) {
      if (entry.entrance) advanceEntrance(entry, now);
    }
    const moving = roster.some((entry) => entry.entrance);
    if (idle || moving) {
      frame();
      requestAnimationFrame(animate);
    } else {
      animating = false;
      frame();
    }
  }
  function ensureAnimate() {
    if (animating || !running) return;
    animating = true;
    requestAnimationFrame(animate);
  }
  if (idle) ensureAnimate();

  return {
    addFigure,
    playEntrance,
    scratchOut,
    clearRoster,
    indexOf,
    listIds,
    pick,
    setRowRise,
    setCameraHeight,
    moveCamera,
    setUniformEnabled,
    perspectiveState,
    applyPerspective,
    adjustFov,
    frame,
    destroy() {
      running = false;
      for (const entry of roster) finishEntrance(entry, false);
      for (const entry of [...roster]) {
        scene.remove(entry.mesh);
        disposeMouse(entry.mesh);
      }
      roster.length = 0;
      for (const step of rowSteps) scene.remove(step);
      stepGeometry.dispose();
      stepMaterial.dispose();
      badgeTexture?.removeEventListener('load', frame);
      scratchCanvas.remove();
      renderer.dispose();
    },
  };
}
