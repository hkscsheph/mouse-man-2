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

function taperedTube(curve, segments, radiusAt, radial) {
  const frames = curve.computeFrenetFrames(segments, false);
  const points = curve.getSpacedPoints(segments);
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const radius = typeof radiusAt === 'function'
      ? radiusAt(t)
      : radiusAt[0] + (radiusAt[1] - radiusAt[0]) * t;
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
      uvs.push(j / radial, t);
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

/** Soft mid-limb swell without a separate joint mesh. */
function limbRadius(start, end, bulgeT, bulge) {
  return (t) => {
    const base = start + (end - start) * t;
    const swell = Math.exp(-((t - bulgeT) ** 2) / (2 * 0.035));
    return base + bulge * swell;
  };
}

function buildShared() {
  if (shared.ready) return shared;
  const normalMap = feltNormal();
  shared.fur = new THREE.MeshStandardMaterial({
    color: 0xe3944a,
    roughness: 0.78,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(0.14, 0.14),
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
    opacity: 0.1,
    depthWrite: false,
  });
  shared.head = new THREE.SphereGeometry(0.46, 40, 28);
  // Pear from the turnaround: wide base, soft shoulder shelf, tapering to the neck.
  shared.body = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.02, 0.0),
      new THREE.Vector2(0.32, 0.03),
      new THREE.Vector2(0.46, 0.14),
      new THREE.Vector2(0.52, 0.34),
      new THREE.Vector2(0.5, 0.55),
      new THREE.Vector2(0.44, 0.78),
      new THREE.Vector2(0.4, 0.95),
      new THREE.Vector2(0.36, 1.08),
      new THREE.Vector2(0.24, 1.18),
      new THREE.Vector2(0.1, 1.24),
      new THREE.Vector2(0.02, 1.26),
    ],
    36,
  );
  // Flat belly patch — sits on the pear face instead of a sphere that escapes the silhouette.
  shared.bellyGeo = new THREE.SphereGeometry(0.33, 28, 18);
  shared.snout = new THREE.SphereGeometry(0.2, 28, 20);
  shared.earGeo = new THREE.SphereGeometry(0.3, 28, 18);
  shared.noseGeo = new THREE.SphereGeometry(0.055, 16, 12);
  shared.palm = new THREE.SphereGeometry(0.085, 16, 12);
  shared.finger = new THREE.CapsuleGeometry(0.016, 0.07, 4, 8);
  shared.foot = new THREE.SphereGeometry(0.135, 16, 12);
  shared.toe = new THREE.CapsuleGeometry(0.022, 0.08, 4, 8);
  // Arms hang down/forward in front of the pear.
  const armRadius = limbRadius(0.1, 0.055, 0.4, 0.01);
  shared.armL = taperedTube(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.08, 0.02, 0.0),
      new THREE.Vector3(-0.02, -0.08, 0.03),
      new THREE.Vector3(-0.08, -0.2, 0.04),
      new THREE.Vector3(-0.08, -0.34, 0.05),
      new THREE.Vector3(-0.05, -0.46, 0.05),
    ]),
    20,
    armRadius,
    12,
  );
  shared.armR = taperedTube(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, 0.02, 0.0),
      new THREE.Vector3(0.02, -0.08, 0.03),
      new THREE.Vector3(0.08, -0.2, 0.04),
      new THREE.Vector3(0.08, -0.34, 0.05),
      new THREE.Vector3(0.05, -0.46, 0.05),
    ]),
    20,
    armRadius,
    12,
  );
  // Short legs that emerge from the pear base rather than propping it up.
  const legRadius = limbRadius(0.13, 0.07, 0.4, 0.01);
  shared.legL = taperedTube(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 0.12, 0.02),
      new THREE.Vector3(0.03, 0.02, 0.03),
      new THREE.Vector3(0.02, -0.1, 0.04),
      new THREE.Vector3(0.01, -0.2, 0.04),
      new THREE.Vector3(0, -0.28, 0.05),
    ]),
    14,
    legRadius,
    12,
  );
  shared.legR = taperedTube(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.12, 0.02),
      new THREE.Vector3(-0.03, 0.02, 0.03),
      new THREE.Vector3(-0.02, -0.1, 0.04),
      new THREE.Vector3(-0.01, -0.2, 0.04),
      new THREE.Vector3(0, -0.28, 0.05),
    ]),
    14,
    legRadius,
    12,
  );
  shared.whiskerGeo = new THREE.CylinderGeometry(0.008, 0.003, 0.4, 5);
  shared.plane = new THREE.PlaneGeometry(1, 1);
  shared.tail = taperedTube(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, 0.48, -0.32),
      new THREE.Vector3(0.18, 0.32, -0.55),
      new THREE.Vector3(0.45, 0.3, -0.82),
      new THREE.Vector3(0.38, 0.55, -1.0),
      new THREE.Vector3(0.08, 0.78, -0.86),
      new THREE.Vector3(0.0, 0.64, -0.7),
    ]),
    28,
    [0.055, 0.018],
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

function mesh(geometry, material, position, scale, rotation) {
  const part = new THREE.Mesh(geometry, material);
  if (position) part.position.set(position.x, position.y, position.z);
  if (scale) part.scale.set(scale.x, scale.y, scale.z);
  if (rotation) part.rotation.set(rotation.x, rotation.y, rotation.z);
  return part;
}

function addArm(parent, side) {
  const root = new THREE.Group();
  // Attach on the pear’s side surface so the body hides only the stub, not half the arm.
  root.position.set(0.4 * side, 1.08, .24);
  root.rotation.set(0.2, -0.02 * side, 0.2 * side);
  parent.add(root);

  const armMesh = new THREE.Mesh(side < 0 ? shared.armL : shared.armR, shared.fur);
  armMesh.renderOrder = 1;
  root.add(armMesh);

  const hand = new THREE.Group();
  hand.position.set(0.04 * side, -0.5, 0.08);
  hand.rotation.set(0.4, 0.1 * side, -0.04 * side);
  root.add(hand);

  hand.add(
    mesh(shared.palm, shared.fur, null, { x: 1.1, y: 0.5, z: 0.95 }),
    mesh(shared.palm, shared.belly, { x: 0, y: -0.002, z: 0.04 }, { x: 0.92, y: 0.38, z: 0.52 }),
  );

  const fingerLayout = [
    { x: -0.048, z: 0.006, yaw: 0.38, len: 0.95 },
    { x: -0.016, z: 0.032, yaw: 0.1, len: 1.05 },
    { x: 0.016, z: 0.032, yaw: -0.1, len: 1.05 },
    { x: 0.048, z: 0.006, yaw: -0.38, len: 0.95 },
  ];
  for (const finger of fingerLayout) {
    hand.add(
      mesh(
        shared.finger,
        shared.belly,
        { x: finger.x * side, y: -0.06, z: finger.z },
        { x: 0.95, y: finger.len, z: 0.95 },
        { x: 1.0, y: finger.yaw * side, z: 0 },
      ),
    );
  }

  return root;
}

function addLeg(parent, side) {
  const root = new THREE.Group();
  // Short stubs under the pear base — body sits on the feet, not above them.
  root.position.set(0.18 * side, 0.3, 0.03);
  root.rotation.set(0.02, 0.02 * side, -0.01 * side);
  parent.add(root);

  root.add(new THREE.Mesh(side < 0 ? shared.legL : shared.legR, shared.fur));

  const foot = new THREE.Group();
  foot.position.set(0, -0.3, 0.08);
  foot.rotation.set(0.06, 0.04 * side, 0);
  root.add(foot);

  foot.add(
    mesh(shared.foot, shared.fur, null, { x: 1.22, y: 0.3, z: 1.5 }),
    mesh(shared.foot, shared.belly, { x: 0, y: -0.01, z: 0.035 }, { x: 1.02, y: 0.16, z: 1.2 }),
  );

  const toes = [
    { x: -0.062, z: 0.115, yaw: 0.28, len: 1 },
    { x: 0, z: 0.138, yaw: 0, len: 1.1 },
    { x: 0.062, z: 0.115, yaw: -0.28, len: 1 },
  ];
  for (const toe of toes) {
    foot.add(
      mesh(
        shared.toe,
        shared.belly,
        { x: toe.x, y: -0.004, z: toe.z },
        { x: 1, y: 0.5, z: toe.len },
        { x: 1.4, y: toe.yaw, z: 0 },
      ),
    );
  }

  return root;
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
  root.userData.targetRoll = 0;
  root.userData.live = false;

  // Soft contact patch under the feet (forward of center), not a hover blob.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), shared.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.15, 0.7, 1);
  shadow.position.set(0, 0.008, 0.08);
  root.add(shadow);

  // Planted mass: pear sits low; short legs tuck into its base.
  addLeg(root, -1);
  addLeg(root, 1);

  const body = new THREE.Mesh(shared.body, shared.fur);
  body.scale.set(1.05, 1, 0.95);
  body.position.set(0, 0.08, 0.02);
  // Body writes depth first so buried arm stubs and belly rim stay inside the silhouette.
  body.renderOrder = 0;
  root.add(body);

  // Cream patch flush on the pear front — mostly inside the body outline.
  const belly = new THREE.Mesh(shared.bellyGeo, shared.belly);
  belly.scale.set(0.95, 1.15, 0.18);
  belly.position.set(0, 0.68, 0.38);
  belly.renderOrder = 1;
  root.add(belly);

  root.add(new THREE.Mesh(shared.tail, shared.fur));

  // Arms after the body so only the outer sleeve shows past the pear.
  addArm(root, -1);
  addArm(root, 1);

  const bob = new THREE.Group();
  root.add(bob);
  root.userData.bob = bob;

  const head = new THREE.Group();
  head.position.set(0, 1.42, 0.05);
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
