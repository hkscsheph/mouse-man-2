import * as THREE from 'three';

const PATCH_KEYS = ['leftEye', 'rightEye', 'nose', 'mouth'];

const shared = {
  ready: false,
};

function feltNormal() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const a = Math.sin(x * 0.65) * Math.cos(y * 0.5);
      const b = Math.sin(x * 1.25 + y * 0.45) * Math.cos(y * 1.05);
      height[y * size + x] = a * 0.65 + b * 0.35;
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const left = height[y * size + ((x - 1 + size) % size)];
      const right = height[y * size + ((x + 1) % size)];
      const down = height[((y - 1 + size) % size) * size + x];
      const up = height[((y + 1) % size) * size + x];
      image.data[i * 4] = 128 + (right - left) * 22;
      image.data[i * 4 + 1] = 128 + (up - down) * 22;
      image.data[i * 4 + 2] = 255;
      image.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 3.5);
  return tex;
}

function taperedTube(curve, segments, radiusStart, radiusEnd, radial) {
  const frames = curve.computeFrenetFrames(segments, false);
  const points = curve.getSpacedPoints(segments);
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const radius = radiusStart + (radiusEnd - radiusStart) * (i / segments);
    const center = points[i];
    const normal = frames.normals[i];
    const binormal = frames.binormals[i];
    for (let j = 0; j <= radial; j += 1) {
      const angle = (j / radial) * Math.PI * 2;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      positions.push(
        center.x + (normal.x * x + binormal.x * y) * radius,
        center.y + (normal.y * x + binormal.y * y) * radius,
        center.z + (normal.z * x + binormal.z * y) * radius,
      );
      uvs.push(j / radial, i / segments);
    }
  }
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildShared() {
  if (shared.ready) return shared;
  const normalMap = feltNormal();
  shared.fur = new THREE.MeshStandardMaterial({
    color: 0xe3944a,
    roughness: 0.74,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(0.32, 0.32),
  });
  shared.belly = new THREE.MeshStandardMaterial({
    color: 0xf3d2b8,
    roughness: 0.62,
    metalness: 0,
  });
  shared.ear = new THREE.MeshStandardMaterial({
    color: 0xf0b0c0,
    roughness: 0.58,
    metalness: 0,
  });
  shared.nose = new THREE.MeshStandardMaterial({
    color: 0x7a5a9a,
    roughness: 0.45,
    metalness: 0.02,
  });
  shared.whisker = new THREE.MeshStandardMaterial({
    color: 0x4a3428,
    roughness: 0.48,
  });
  shared.shadow = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  shared.head = new THREE.SphereGeometry(0.46, 40, 28);
  shared.torso = new THREE.SphereGeometry(0.42, 36, 26);
  shared.bellyGeo = new THREE.SphereGeometry(0.3, 28, 20);
  shared.snout = new THREE.SphereGeometry(0.2, 28, 20);
  shared.earGeo = new THREE.SphereGeometry(0.3, 28, 18);
  shared.noseGeo = new THREE.SphereGeometry(0.055, 16, 12);
  shared.hand = new THREE.SphereGeometry(0.085, 16, 12);
  shared.foot = new THREE.SphereGeometry(0.13, 16, 12);
  shared.arm = new THREE.CapsuleGeometry(0.078, 0.3, 6, 12);
  shared.leg = new THREE.CapsuleGeometry(0.105, 0.26, 6, 12);
  shared.whiskerGeo = new THREE.CylinderGeometry(0.008, 0.003, 0.4, 5);
  shared.plane = new THREE.PlaneGeometry(1, 1);
  shared.tail = taperedTube(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, 0.58, -0.28),
      new THREE.Vector3(0.2, 0.4, -0.55),
      new THREE.Vector3(0.48, 0.36, -0.82),
      new THREE.Vector3(0.4, 0.62, -1.02),
      new THREE.Vector3(0.1, 0.84, -0.88),
      new THREE.Vector3(0.02, 0.7, -0.72),
    ]),
    28,
    0.055,
    0.018,
    8,
  );
  shared.ready = true;
  return shared;
}

function faceMaterial(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

function addFacePlane(parent, canvas, position, height, maxWidth, order) {
  const mesh = new THREE.Mesh(shared.plane, faceMaterial(canvas));
  mesh.position.copy(position);
  mesh.userData.isFace = true;
  mesh.userData.height = height;
  mesh.userData.maxWidth = maxWidth;
  mesh.userData.order = order;
  const aspect = THREE.MathUtils.clamp(canvas.aspect || 1.2, 0.55, 2.6);
  const width = Math.min(height * aspect, maxWidth);
  mesh.scale.set(width, height, 1);
  mesh.userData.targetScale = mesh.scale.clone();
  parent.add(mesh);
  return mesh;
}

function addEar(head, side) {
  const ear = new THREE.Mesh(shared.earGeo, shared.fur);
  ear.scale.set(0.95, 1.08, 0.28);
  ear.position.set(0.4 * side, 0.36, -0.02);
  ear.rotation.set(0.12, -0.35 * side, -0.55 * side);
  head.add(ear);

  const inner = new THREE.Mesh(shared.earGeo, shared.ear);
  inner.scale.set(0.62, 0.72, 0.16);
  inner.position.set(0.39 * side, 0.36, 0.07);
  inner.rotation.copy(ear.rotation);
  head.add(inner);
}

function addLimb(parent, geometry, position, rotation) {
  const limb = new THREE.Mesh(geometry, shared.fur);
  limb.position.copy(position);
  limb.rotation.set(rotation.x, rotation.y, rotation.z);
  parent.add(limb);
  return limb;
}

function addWhiskers(head) {
  const up = new THREE.Vector3(0, 1, 0);
  const fans = [
    [0.15, 0.92, 0.22],
    [0, 1, 0.18],
    [-0.16, 0.88, 0.24],
  ];
  for (const side of [-1, 1]) {
    for (const [y, x, z] of fans) {
      const dir = new THREE.Vector3(x * side, y, z).normalize();
      const whisker = new THREE.Mesh(shared.whiskerGeo, shared.whisker);
      whisker.quaternion.setFromUnitVectors(up, dir);
      whisker.position.set(0.1 * side, -0.08, 0.46).addScaledVector(dir, 0.2);
      head.add(whisker);
    }
  }
}

export function createMouse(canvases) {
  buildShared();
  const root = new THREE.Group();
  root.userData.phase = Math.random() * Math.PI * 2;
  root.userData.targetYaw = 0;
  root.userData.targetPitch = 0;
  root.userData.live = false;

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), shared.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  const bob = new THREE.Group();
  root.add(bob);
  root.userData.bob = bob;

  const torso = new THREE.Mesh(shared.torso, shared.fur);
  torso.scale.set(1.06, 1.24, 0.86);
  torso.position.set(0, 0.9, 0.02);
  bob.add(torso);

  const belly = new THREE.Mesh(shared.bellyGeo, shared.belly);
  belly.scale.set(1.05, 1.28, 0.48);
  belly.position.set(0, 0.8, 0.3);
  bob.add(belly);

  const armL = addLimb(bob, shared.arm, new THREE.Vector3(-0.5, 0.98, 0.06), { x: 0.18, y: 0, z: -0.22 });
  const armR = addLimb(bob, shared.arm, new THREE.Vector3(0.5, 0.98, 0.06), { x: 0.18, y: 0, z: 0.22 });
  const handL = new THREE.Mesh(shared.hand, shared.fur);
  handL.position.set(0, -0.24, 0.02);
  armL.add(handL);
  const handR = new THREE.Mesh(shared.hand, shared.fur);
  handR.position.set(0, -0.24, 0.02);
  armR.add(handR);

  const legL = addLimb(bob, shared.leg, new THREE.Vector3(-0.17, 0.32, 0.04), { x: 0.04, y: 0, z: -0.03 });
  const legR = addLimb(bob, shared.leg, new THREE.Vector3(0.17, 0.32, 0.04), { x: 0.04, y: 0, z: 0.03 });
  for (const leg of [legL, legR]) {
    const foot = new THREE.Mesh(shared.foot, shared.fur);
    foot.scale.set(1.12, 0.48, 1.4);
    foot.position.set(0, -0.22, 0.08);
    leg.add(foot);
  }

  bob.add(new THREE.Mesh(shared.tail, shared.fur));

  const head = new THREE.Group();
  head.position.set(0, 1.58, 0.04);
  bob.add(head);
  root.userData.head = head;

  const skull = new THREE.Mesh(shared.head, shared.fur);
  skull.scale.set(1.02, 0.98, 0.96);
  head.add(skull);

  const snout = new THREE.Mesh(shared.snout, shared.fur);
  snout.scale.set(1.12, 0.82, 1.18);
  snout.position.set(0, -0.12, 0.34);
  head.add(snout);

  const nose = new THREE.Mesh(shared.noseGeo, shared.nose);
  nose.position.set(0, -0.14, 0.54);
  head.add(nose);

  addEar(head, -1);
  addEar(head, 1);
  addWhiskers(head);

  const planes = {
    leftEye: addFacePlane(head, canvases.leftEye, new THREE.Vector3(-0.15, 0.08, 0.47), 0.22, 0.28, 1),
    rightEye: addFacePlane(head, canvases.rightEye, new THREE.Vector3(0.15, 0.08, 0.47), 0.22, 0.28, 1),
    mouth: addFacePlane(head, canvases.mouth, new THREE.Vector3(0, -0.3, 0.42), 0.15, 0.34, 2),
    nose: addFacePlane(head, canvases.nose, new THREE.Vector3(0, -0.15, 0.6), 0.2, 0.26, 3),
  };
  root.userData.planes = planes;
  root.userData.liveCanvases = canvases;
  return root;
}

export function retargetFace(mouse, canvases, { copy }) {
  for (const key of PATCH_KEYS) {
    const plane = mouse.userData.planes[key];
    const source = canvases[key];
    let canvas = source;
    if (copy) {
      canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0);
      canvas.aspect = source.aspect;
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const previous = plane.material.map;
    plane.material.map = tex;
    plane.material.needsUpdate = true;
    if (previous) previous.dispose();
    fitPlane(plane, canvas.aspect || 1.2, true);
  }
  mouse.userData.liveCanvases = copy ? null : canvases;
}

export function refreshLiveFace(mouse) {
  const canvases = mouse.userData.liveCanvases;
  if (!canvases) return;
  for (const key of PATCH_KEYS) {
    const plane = mouse.userData.planes[key];
    const canvas = canvases[key];
    if (plane.material.map) plane.material.map.needsUpdate = true;
    fitPlane(plane, canvas.aspect || 1.2, false);
  }
}

function fitPlane(plane, aspect, snap) {
  const safeAspect = THREE.MathUtils.clamp(aspect, 0.55, 2.6);
  const width = Math.min(plane.userData.height * safeAspect, plane.userData.maxWidth);
  plane.userData.targetScale.set(width, plane.userData.height, 1);
  if (snap) plane.scale.copy(plane.userData.targetScale);
}

export function disposeMouse(mouse) {
  mouse.traverse((obj) => {
    if (!obj.userData?.isFace) return;
    obj.material.map?.dispose();
    obj.material.dispose();
  });
}

export const FACE_KEYS = PATCH_KEYS;
