import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

const PATCH = 192;
const PAINT_INTERVAL = 66;

const NOSE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 97, 326, 327];

let landmarker = null;
let indices = null;
const patches = {};
let maskCanvas = null;
let maskCtx = null;
let mirror = null;
let mirrorCtx = null;
let prevCenter = null;
let lastVideoTime = -1;
let lastStamp = -1;
let lastResult = null;
let lastReading = null;
let lastPaint = 0;
let paintedOnce = false;

const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _euler = new THREE.Euler();

function asset(path) {
  const base = import.meta.env.BASE_URL || './';
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}

function uniq(connections) {
  const ids = new Set();
  for (const connection of connections) {
    ids.add(connection.start);
    ids.add(connection.end);
  }
  return [...ids];
}

function makePatch() {
  const canvas = document.createElement('canvas');
  canvas.width = PATCH;
  canvas.height = PATCH;
  canvas.aspect = 1;
  return canvas;
}

export async function initFace() {
  const files = await FilesetResolver.forVisionTasks(asset('mediapipe/wasm'));
  const options = {
    baseOptions: {
      modelAssetPath: asset('mediapipe/face_landmarker.task'),
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.6,
    minFacePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
    outputFacialTransformationMatrixes: true,
  };
  try {
    landmarker = await FaceLandmarker.createFromOptions(files, options);
  } catch {
    landmarker = await FaceLandmarker.createFromOptions(files, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    });
  }
  indices = {
    leftEye: uniq([
      ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
      ...FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
    ]),
    rightEye: uniq([
      ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
      ...FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
    ]),
    mouth: uniq(FaceLandmarker.FACE_LANDMARKS_LIPS),
    nose: NOSE,
  };
  for (const key of ['leftEye', 'rightEye', 'nose', 'mouth']) {
    patches[key] = makePatch();
  }
  maskCanvas = makePatch();
  maskCtx = maskCanvas.getContext('2d');
  mirror = document.createElement('canvas');
  mirrorCtx = mirror.getContext('2d');
}

export function resetFaceTracking() {
  prevCenter = null;
}

function poseFromMatrix(matrix) {
  if (!matrix?.data || matrix.data.length < 16) return null;
  _mat.fromArray(matrix.data);
  _mat.decompose(_pos, _quat, _scl);
  _euler.setFromQuaternion(_quat, 'YXZ');
  if (!Number.isFinite(_euler.x) || !Number.isFinite(_euler.y) || !Number.isFinite(_euler.z)) return null;
  if (Math.abs(_euler.y) > 1.4 || Math.abs(_euler.x) > 1.4 || Math.abs(_euler.z) > 1.4) return null;
  return {
    // Negate yaw/roll so the puppet matches the mirrored webcam view.
    yaw: THREE.MathUtils.clamp(-_euler.y, -0.38, 0.38),
    pitch: THREE.MathUtils.clamp(_euler.x, -0.26, 0.26),
    roll: THREE.MathUtils.clamp(-_euler.z, -0.5, 0.5),
  };
}

function poseFromLandmarks(lm) {
  const left = lm[33];
  const right = lm[263];
  const nose = lm[1];
  const forehead = lm[10];
  const chin = lm[152];
  if (!left || !right || !nose || !forehead || !chin) return { yaw: 0, pitch: 0, roll: 0 };
  const midX = (left.x + right.x) * 0.5;
  const eyeDist = Math.max(0.0001, Math.abs(right.x - left.x));
  const yaw = THREE.MathUtils.clamp(-((nose.x - midX) / eyeDist) * 0.85, -0.38, 0.38);
  const midY = (left.y + right.y) * 0.5;
  const faceH = Math.max(0.0001, chin.y - forehead.y);
  const pitch = THREE.MathUtils.clamp((((nose.y - midY) / faceH) - 0.16) * 1.4, -0.26, 0.26);
  const roll = THREE.MathUtils.clamp(Math.atan2(right.y - left.y, right.x - left.x), -0.5, 0.5);
  return { yaw, pitch, roll };
}

function gather(lm, ids, lift = 0) {
  const points = [];
  for (const id of ids) {
    const point = lm[id];
    if (!point) continue;
    points.push({ x: point.x, y: point.y });
    if (lift) points.push({ x: point.x, y: point.y - lift });
  }
  return points;
}

function convexHull(points) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function paintPatch(target, points, expand) {
  const width = mirror.width;
  const height = mirror.height;
  if (!width || !height || points.length < 3) return;
  const pixels = points.map((point) => ({ x: point.x * width, y: point.y * height }));
  const hull = convexHull(pixels);
  if (hull.length < 3) return;
  let cx = 0;
  let cy = 0;
  for (const point of hull) {
    cx += point.x;
    cy += point.y;
  }
  cx /= hull.length;
  cy /= hull.length;
  const grown = hull.map((point) => ({
    x: cx + (point.x - cx) * expand,
    y: cy + (point.y - cy) * expand,
  }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of grown) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.2;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const boxW = Math.max(2, maxX - minX);
  const boxH = Math.max(2, maxY - minY);
  target.aspect = boxW / boxH;

  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, PATCH, PATCH);
  ctx.drawImage(mirror, minX, minY, boxW, boxH, 0, 0, PATCH, PATCH);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255, 148, 64, 0.28)';
  ctx.fillRect(0, 0, PATCH, PATCH);
  ctx.restore();

  maskCtx.clearRect(0, 0, PATCH, PATCH);
  maskCtx.fillStyle = '#fff';
  maskCtx.beginPath();
  grown.forEach((point, index) => {
    const x = ((point.x - minX) / boxW) * PATCH;
    const y = ((point.y - minY) / boxH) * PATCH;
    if (index === 0) maskCtx.moveTo(x, y);
    else maskCtx.lineTo(x, y);
  });
  maskCtx.closePath();
  maskCtx.fill();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.filter = 'blur(8px)';
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.filter = 'none';
  ctx.restore();
}

function updateMirror(video) {
  if (mirror.width !== video.videoWidth || mirror.height !== video.videoHeight) {
    mirror.width = video.videoWidth;
    mirror.height = video.videoHeight;
  }
  mirrorCtx.save();
  mirrorCtx.clearRect(0, 0, mirror.width, mirror.height);
  mirrorCtx.translate(mirror.width, 0);
  mirrorCtx.scale(-1, 1);
  mirrorCtx.drawImage(video, 0, 0, mirror.width, mirror.height);
  mirrorCtx.restore();
}

function paintAll(lm) {
  const brows = {
    leftEye: 0.015,
    rightEye: 0.015,
    nose: 0,
    mouth: 0,
  };
  const expand = { leftEye: 1.18, rightEye: 1.18, nose: 1.42, mouth: 1.22 };
  for (const key of ['leftEye', 'rightEye', 'nose', 'mouth']) {
    paintPatch(patches[key], gather(lm, indices[key], brows[key]), expand[key]);
  }
}

export function readFace(video, now) {
  if (!landmarker || video.readyState < 2) return { present: false };
  if (video.currentTime === lastVideoTime && lastReading) {
    return { ...lastReading, patchesDirty: false };
  }
  lastVideoTime = video.currentTime;
  let stamp = now;
  if (stamp <= lastStamp) stamp = lastStamp + 1;
  lastStamp = stamp;
  lastResult = landmarker.detectForVideo(video, stamp);

  const raw = lastResult?.faceLandmarks?.[0];
  if (!raw) {
    lastReading = { present: false };
    return lastReading;
  }

  const lm = raw.map((point) => ({ x: 1 - point.x, y: point.y, z: point.z }));
  const left = lm[33];
  const right = lm[263];
  const center = {
    x: left && right ? (left.x + right.x) * 0.5 : lm[1].x,
    y: lm[10] && lm[152] ? (lm[10].y + lm[152].y) * 0.5 : lm[1].y,
  };
  const eyeSpan = left && right ? Math.abs(right.x - left.x) : 0;
  const jumped = Boolean(
    prevCenter &&
      (Math.abs(center.x - prevCenter.x) > 0.25 || Math.abs(center.y - prevCenter.y) > 0.22),
  );
  prevCenter = center;
  const pose = poseFromMatrix(lastResult.facialTransformationMatrixes?.[0]) || poseFromLandmarks(lm);

  if (jumped) {
    lastReading = {
      present: true,
      jumped: true,
      eyeSpan,
      yaw: pose.yaw,
      pitch: pose.pitch,
      roll: pose.roll,
      patches,
      patchesDirty: false,
    };
    return lastReading;
  }

  let patchesDirty = false;
  if (!paintedOnce || now - lastPaint >= PAINT_INTERVAL) {
    updateMirror(video);
    paintAll(lm);
    lastPaint = now;
    paintedOnce = true;
    patchesDirty = true;
  }

  lastReading = {
    present: true,
    jumped: false,
    eyeSpan,
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll,
    patches,
    patchesDirty,
  };
  return lastReading;
}
