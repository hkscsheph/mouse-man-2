import * as THREE from 'three';

const PATCH_KEYS = ['leftEye', 'rightEye', 'nose', 'mouth'];
const SCALED_PATCHES = new Set(['leftEye', 'rightEye', 'mouth']);

const shared = {
  ready: false,
};

/** Global scale for projected eyes + mouth (nose stays fixed). */
let featureScale = 1;

export function getFeatureScale() {
  return featureScale;
}

export function setFeatureScale(value) {
  featureScale = THREE.MathUtils.clamp(Number(value) || 1, 0.6, 2.4);
}

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
      indices.push(a, a + 1, b, a + 1, b + 1, b);
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
  shared.accent = new THREE.MeshStandardMaterial({
    color: 0xd45a6a,
    roughness: 0.55,
    metalness: 0.04,
  });
  shared.metal = new THREE.MeshStandardMaterial({
    color: 0xc9b48a,
    roughness: 0.32,
    metalness: 0.62,
  });
  shared.lens = new THREE.MeshStandardMaterial({
    color: 0x1a1410,
    roughness: 0.2,
    metalness: 0.15,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  shared.shadow = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  });
  shared.decorBall = new THREE.SphereGeometry(0.08, 14, 12);
  shared.decorDisc = new THREE.SphereGeometry(0.1, 16, 12);
  shared.decorRing = new THREE.TorusGeometry(0.22, 0.032, 10, 28);
  shared.decorThinRing = new THREE.TorusGeometry(0.1, 0.012, 8, 24);
  shared.decorBox = new THREE.BoxGeometry(1, 1, 1);
  shared.decorCap = new THREE.SphereGeometry(0.28, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  shared.decorCylinder = new THREE.CylinderGeometry(0.22, 0.24, 0.2, 20);
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
  shared.earGeo = Object.create(null); // sides → ExtrudeGeometry cache
  shared.noseGeo = new THREE.SphereGeometry(0.055, 16, 12);
  shared.palm = new THREE.SphereGeometry(0.085, 16, 12);
  shared.finger = new THREE.CapsuleGeometry(0.016, 0.07, 4, 8);
  shared.foot = new THREE.SphereGeometry(0.135, 16, 12);
  shared.toe = new THREE.CapsuleGeometry(0.022, 0.08, 4, 8);
  // Arms bend around the pear, with a soft elbow and a tapered wrist.
  const armRadius = limbRadius(0.112, 0.062, 0.38, 0.018);
  shared.armL = taperedTube(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.08, 0.02, 0.0),
      new THREE.Vector3(-0.025, -0.08, 0.035),
      new THREE.Vector3(-0.11, -0.19, 0.065),
      new THREE.Vector3(-0.085, -0.31, 0.095),
      new THREE.Vector3(-0.035, -0.46, 0.11),
    ]),
    20,
    armRadius,
    12,
  );
  shared.armR = taperedTube(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, 0.02, 0.0),
      new THREE.Vector3(0.025, -0.08, 0.035),
      new THREE.Vector3(0.11, -0.19, 0.065),
      new THREE.Vector3(0.085, -0.31, 0.095),
      new THREE.Vector3(0.035, -0.46, 0.11),
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

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function hsl(h, s, l) {
  return new THREE.Color().setHSL(((h % 360) + 360) % 360 / 360, s, l);
}

/** Ear outline: 3–8 = regular polygon, 0 = circle. */
const EAR_SIDE_CHOICES = [3, 4, 5, 6, 7, 8, 0];

/** Regular n-gon with soft quadratic corners (still reads as that polygon). */
function roundedRegularPolygonShape(sides, radius, roundness = 0.5) {
  const shape = new THREE.Shape();
  const verts = [];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    verts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  const maxR = radius * Math.sin(Math.PI / sides) * 0.9;
  // Fewer sides → larger fillets so triangles/squares stay plump, not pointy.
  const r = Math.min(maxR, radius * roundness * (0.62 + (8 - sides) * 0.05));

  for (let i = 0; i < sides; i += 1) {
    const prev = verts[(i + sides - 1) % sides];
    const curr = verts[i];
    const next = verts[(i + 1) % sides];
    const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
    const toNext = { x: next.x - curr.x, y: next.y - curr.y };
    const lenPrev = Math.hypot(toPrev.x, toPrev.y) || 1;
    const lenNext = Math.hypot(toNext.x, toNext.y) || 1;
    const p1 = {
      x: curr.x + (toPrev.x / lenPrev) * r,
      y: curr.y + (toPrev.y / lenPrev) * r,
    };
    const p2 = {
      x: curr.x + (toNext.x / lenNext) * r,
      y: curr.y + (toNext.y / lenNext) * r,
    };
    if (i === 0) shape.moveTo(p1.x, p1.y);
    else shape.lineTo(p1.x, p1.y);
    shape.quadraticCurveTo(curr.x, curr.y, p2.x, p2.y);
  }
  shape.closePath();
  return shape;
}

/** Lens / pillow solid: fat at center, tapering to a thin rim.
 *  Center bulge is biased forward (+Z) so the ear reads fronter. */
function pillowFromContour(contour, halfThick = 0.16, rings = 7) {
  const n = contour.length;
  const positions = [];
  const indices = [];

  const push = (x, y, z) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };

  // thickness profile: ~1 at center → ~rim at edge (cosine ease)
  const thickAt = (t) => {
    const rim = 0.06;
    return halfThick * (rim + (1 - rim) * Math.cos(t * Math.PI * 0.5) ** 1.35);
  };
  // Slide the plump center forward; rim stays put.
  const forwardAt = (t) => halfThick * 0.42 * Math.cos(t * Math.PI * 0.5) ** 1.6;

  const zPair = (t) => {
    const bulge = thickAt(t);
    const pushFwd = forwardAt(t);
    return {
      front: pushFwd + bulge * 1.2,
      back: pushFwd - bulge * 0.7,
    };
  };

  const front = [];
  const back = [];
  const c0 = zPair(0);
  front.push(push(0, 0, c0.front));
  back.push(push(0, 0, c0.back));

  for (let r = 1; r <= rings; r += 1) {
    const t = r / rings;
    const s = t;
    const { front: zF, back: zB } = zPair(t);
    const fRing = [];
    const bRing = [];
    for (let i = 0; i < n; i += 1) {
      const p = contour[i];
      fRing.push(push(p.x * s, p.y * s, zF));
      bRing.push(push(p.x * s, p.y * s, zB));
    }
    front.push(fRing);
    back.push(bRing);
  }

  // Fan from center to first ring
  for (let i = 0; i < n; i += 1) {
    const i1 = (i + 1) % n;
    indices.push(front[0], front[1][i], front[1][i1]);
    indices.push(back[0], back[1][i1], back[1][i]);
  }

  // Quads between rings
  for (let r = 1; r < rings; r += 1) {
    const a = front[r];
    const b = front[r + 1];
    const c = back[r];
    const d = back[r + 1];
    for (let i = 0; i < n; i += 1) {
      const i1 = (i + 1) % n;
      indices.push(a[i], b[i], b[i1], a[i], b[i1], a[i1]);
      indices.push(c[i], d[i1], d[i], c[i], c[i1], d[i1]);
    }
  }

  // Stitch thin rim (front outer ↔ back outer)
  const fo = front[rings];
  const bo = back[rings];
  for (let i = 0; i < n; i += 1) {
    const i1 = (i + 1) % n;
    indices.push(fo[i], bo[i], bo[i1], fo[i], bo[i1], fo[i1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function earGeometry(sides) {
  const nSides = sides >= 3 && sides <= 8 ? sides : 0;
  const key = `fwd:${nSides}`;
  if (shared.earGeo[key]) return shared.earGeo[key];
  const radius = 0.3;
  let shape;
  let divisions;
  if (nSides === 0) {
    shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    divisions = 48;
  } else {
    shape = roundedRegularPolygonShape(nSides, radius, 0.52);
    divisions = Math.max(36, nSides * 10);
  }
  const contour = shape.getPoints(divisions);
  // Drop duplicate close point if present
  if (contour.length > 2) {
    const a = contour[0];
    const b = contour[contour.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) contour.pop();
  }
  if (contour.length < 3) {
    // Fallback circle if outline failed
    const fallback = [];
    for (let i = 0; i < 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      fallback.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
    }
    const geo = pillowFromContour(fallback, 0.17, 8);
    shared.earGeo[key] = geo;
    return geo;
  }
  const geo = pillowFromContour(contour, 0.17, 8);
  shared.earGeo[key] = geo;
  return geo;
}

const NECK_ACCESSORIES = ['none', 'bowtie', 'tie', 'scarf', 'necklace'];
const HEAD_ACCESSORIES = ['none', 'hat', 'cap'];
const EYE_ACCESSORIES = ['none', 'glasses', 'sunglasses'];

function pickWeighted(options) {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return options[options.length - 1][0];
}

function pickAccessories() {
  const picks = {
    accessoryNeck: pickWeighted([
      ['none', 0.82],
      ['bowtie', 0.05],
      ['tie', 0.04],
      ['scarf', 0.05],
      ['necklace', 0.04],
    ]),
    accessoryHead: pickWeighted([
      ['none', 0.84],
      ['hat', 0.08],
      ['cap', 0.08],
    ]),
    accessoryEyes: pickWeighted([
      ['none', 0.84],
      ['glasses', 0.09],
      ['sunglasses', 0.07],
    ]),
    accessoryEarrings: Math.random() < 0.1,
  };
  // Usually keep a single statement piece so rare hits read clearly.
  const worn = [];
  if (picks.accessoryNeck !== 'none') worn.push('neck');
  if (picks.accessoryHead !== 'none') worn.push('head');
  if (picks.accessoryEyes !== 'none') worn.push('eyes');
  if (picks.accessoryEarrings) worn.push('earrings');
  if (worn.length > 1) {
    const keep = worn[Math.floor(Math.random() * worn.length)];
    if (keep !== 'neck') picks.accessoryNeck = 'none';
    if (keep !== 'head') picks.accessoryHead = 'none';
    if (keep !== 'eyes') picks.accessoryEyes = 'none';
    if (keep !== 'earrings') picks.accessoryEarrings = false;
  }
  return picks;
}

/** One-off look for each visitor mouse. */
function makeTraits() {
  const fitness = rand(0, 1);
  const accessories = pickAccessories();
  return {
    fur: hsl(rand(16, 42), rand(0.1, 0.9), rand(0.2, 0.4)),
    belly: hsl(rand(22, 48), rand(0.22, 0.48), rand(0.7, 0.88)),
    earInner: hsl(rand(340, 380), rand(0.28, 0.55), rand(0.62, 0.8)),
    nose: hsl(rand(265, 320), rand(0.22, 0.58), rand(0.32, 0.58)),
    whisker: hsl(rand(15, 40), rand(0.15, 0.4), rand(0.12, 0.28)),
    // Punchy accessory colors so rare items pop against fur.
    accent: hsl(rand(0, 360), rand(0.72, 0.95), rand(0.42, 0.58)),
    metal: hsl(rand(38, 52), rand(0.45, 0.7), rand(0.58, 0.78)),
    earSides: EAR_SIDE_CHOICES[Math.floor(Math.random() * EAR_SIDE_CHOICES.length)],
    earSize: rand(0.78, 1.32),
    earWide: rand(1, 1.2),
    earThick: rand(0.75, 1.25),
    earFlare: rand(0.75, 1.28),
    earTilt: rand(-0.18, 0.22),
    noseRound: rand(0.72, 1.4),
    noseFlat: rand(0.7, 1.25),
    noseSize: rand(0.85, 1.3),
    fitness,
    headScale: THREE.MathUtils.lerp(0.94, 1.14, 0.35 + fitness * 0.65),
    bodyWide: THREE.MathUtils.lerp(0.84, 1.32, fitness),
    bodyTall: THREE.MathUtils.lerp(1.02, 0.82, fitness),
    bodyDeep: THREE.MathUtils.lerp(0.86, 1.24, fitness),
    bellySize: THREE.MathUtils.lerp(0.72, 1.42, fitness),
    snoutLen: rand(0.88, 1.22),
    snoutRound: rand(0.85, 1),
    whiskerCount: Math.random() < 0.3 ? 4 : 3,
    whiskerLen: rand(0.9, 1.3),
    whiskerSpread: rand(0.45, 0.65),
    whiskerLift: rand(-0.5, -0.35),
    whiskerCurl: rand(-0.45, 0),
    ...accessories,
  };
}

function asColor(value) {
  return value?.isColor ? value : new THREE.Color(value);
}

function normalizeChoice(value, allowed, fallback = 'none') {
  return allowed.includes(value) ? value : fallback;
}

/** Rebuild Color traits from a saved plain snapshot. */
export function hydrateTraits(data) {
  const sides = Number(data.earSides);
  const fitness = Number.isFinite(data.fitness) ? data.fitness : 0.5;
  return {
    ...data,
    fur: asColor(data.fur),
    belly: asColor(data.belly),
    earInner: asColor(data.earInner),
    nose: asColor(data.nose),
    whisker: asColor(data.whisker),
    accent: asColor(data.accent || '#d45a6a'),
    metal: asColor(data.metal || '#c9b48a'),
    earSides: sides >= 3 && sides <= 8 ? sides : 0,
    fitness,
    accessoryNeck: normalizeChoice(data.accessoryNeck, NECK_ACCESSORIES),
    accessoryHead: normalizeChoice(data.accessoryHead, HEAD_ACCESSORIES),
    accessoryEyes: normalizeChoice(data.accessoryEyes, EYE_ACCESSORIES),
    accessoryEarrings: Boolean(data.accessoryEarrings),
  };
}

function clonePalette(traits) {
  const fur = shared.fur.clone();
  fur.color.copy(asColor(traits.fur));
  const arm = shared.fur.clone();
  arm.color.copy(asColor(traits.fur));
  arm.transparent = false;
  arm.opacity = 1;
  arm.depthWrite = true;
  const belly = shared.belly.clone();
  belly.color.copy(asColor(traits.belly));
  const ear = shared.ear.clone();
  ear.color.copy(asColor(traits.earInner));
  const nose = shared.nose.clone();
  nose.color.copy(asColor(traits.nose));
  const whisker = shared.whisker.clone();
  whisker.color.copy(asColor(traits.whisker));
  const accent = shared.accent.clone();
  accent.color.copy(asColor(traits.accent));
  const metal = shared.metal.clone();
  metal.color.copy(asColor(traits.metal));
  const lens = shared.lens.clone();
  return { fur, arm, belly, ear, nose, whisker, accent, metal, lens };
}

function addFacePlane(parent, canvas, key, position, height, maxWidth, order) {
  const mesh = new THREE.Mesh(shared.plane, faceMaterial(canvas));
  mesh.position.copy(position);
  mesh.userData.isFace = true;
  mesh.userData.key = key;
  mesh.userData.height = height;
  mesh.userData.maxWidth = maxWidth;
  mesh.userData.order = order;
  mesh.userData.aspect = canvas.aspect || 1.2;
  fitPlane(mesh, mesh.userData.aspect, true);
  parent.add(mesh);
  return mesh;
}

function addEar(head, side, mats, traits) {
  const size = traits.earSize;
  const geo = earGeometry(traits.earSides);
  const ear = new THREE.Mesh(geo, mats.fur);
  ear.scale.set(0.95 * traits.earWide * size, 1.08 * size, 1.05 * traits.earThick);
  ear.position.set(0.38 * side * traits.earFlare, 0.34 + traits.earTilt * 0.08, 0.02);
  ear.rotation.set(0.12 + traits.earTilt * 0.4, -0.35 * side * traits.earFlare, (-0.55 - traits.earTilt * 0.3) * side);
  head.add(ear);

  const inner = new THREE.Mesh(geo, mats.ear);
  inner.scale.set(0.62 * traits.earWide * size, 0.72 * size, 0.7 * traits.earThick);
  inner.position.set(0.37 * side * traits.earFlare, 0.34 + traits.earTilt * 0.08, .15);
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

function addArm(parent, side, mats, traits) {
  const root = new THREE.Group();
  // Attach on the pear’s side surface so the body hides only the stub, not half the arm.
  root.position.set(
    0.37 * 1.05 * traits.bodyWide * side,
    0.08 + 0.98 * traits.bodyTall,
    0.1 * traits.bodyDeep,
  );
  root.rotation.set(0.2, -0.02 * side, 0.2 * side);
  parent.add(root);

  const armMesh = new THREE.Mesh(side < 0 ? shared.armL : shared.armR, mats.arm);
  armMesh.renderOrder = 1;
  root.add(armMesh);

  const hand = new THREE.Group();
  hand.position.set(0.04 * side, -0.5, 0.12);
  hand.rotation.set(0.4, 0.1 * side, -0.04 * side);
  root.add(hand);

  hand.add(
    mesh(shared.palm, mats.fur, null, { x: 1.1, y: 0.5, z: 0.95 }),
    mesh(shared.palm, mats.belly, { x: 0, y: -0.002, z: 0.04 }, { x: 0.92, y: 0.38, z: 0.52 }),
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
        mats.belly,
        { x: finger.x * side, y: -0.06, z: finger.z },
        { x: 0.95, y: finger.len, z: 0.95 },
        { x: 1.0, y: finger.yaw * side, z: 0 },
      ),
    );
  }

  hand.add(
    mesh(
      shared.finger,
      mats.belly,
      { x: 0.075 * side, y: -0.005, z: 0.015 },
      { x: 1.1, y: 0.72, z: 1.05 },
      { x: 0.7, y: 0.15 * side, z: -0.65 * side },
    ),
  );

  return root;
}

function addLeg(parent, side, mats) {
  const root = new THREE.Group();
  // Short stubs under the pear base — body sits on the feet, not above them.
  root.position.set(0.18 * side, 0.3, 0.03);
  root.rotation.set(0.02, 0.02 * side, -0.01 * side);
  parent.add(root);

  root.add(new THREE.Mesh(side < 0 ? shared.legL : shared.legR, mats.fur));

  const foot = new THREE.Group();
  foot.position.set(0, -0.3, 0.08);
  foot.rotation.set(0.06, 0.04 * side, 0);
  root.add(foot);

  foot.add(
    mesh(shared.foot, mats.fur, null, { x: 1.22, y: 0.3, z: 1.5 }),
    mesh(shared.foot, mats.belly, { x: 0, y: -0.01, z: 0.035 }, { x: 1.02, y: 0.16, z: 1.2 }),
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
        mats.belly,
        { x: toe.x, y: -0.004, z: toe.z },
        { x: 1, y: 0.5, z: toe.len },
        { x: 1.4, y: toe.yaw, z: 0 },
      ),
    );
  }

  return root;
}

function addWhiskers(head, mats, traits, ownGeometries) {
  const count = traits.whiskerCount;
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      // Fan from down-forward to up-out so the mustache opens wider.
      const lift = THREE.MathUtils.lerp(-0.55, 0.7, t) + traits.whiskerLift;
      const spread = THREE.MathUtils.lerp(0.95, 1.55, t) * traits.whiskerSpread;
      const forward = THREE.MathUtils.lerp(0.08, -0.02, t);
      const len = traits.whiskerLen;
      const curl = traits.whiskerCurl;
      const geo = taperedTube(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.08 * side, -0.05, 0.44),
          new THREE.Vector3(0.2 * side * spread, -0.02 + lift * 0.1, 0.5 + forward),
          new THREE.Vector3(0.36 * side * spread * len, 0.04 + lift * 0.22 + curl * 0.08, 0.52 + forward * 0.6),
          new THREE.Vector3(
            0.52 * side * spread * len,
            0.06 + lift * 0.28 + curl * 0.18,
            0.42 + forward * 0.4 + (1 - Math.abs(curl)) * 0.04,
          ),
        ]),
        8,
        [0.0075, 0.0022],
        4,
      );
      ownGeometries.push(geo);
      head.add(new THREE.Mesh(geo, mats.whisker));
    }
  }
}

function addBowtie(torso, mats, traits) {
  const group = new THREE.Group();
  group.position.set(0, 1.2, 0.42 * traits.bodyDeep);
  group.scale.setScalar(1.55);
  torso.add(group);
  const left = new THREE.Mesh(shared.decorDisc, mats.accent);
  left.scale.set(1.7, 0.9, 0.45);
  left.position.set(-0.12, 0, 0);
  left.rotation.z = 0.45;
  const right = new THREE.Mesh(shared.decorDisc, mats.accent);
  right.scale.set(1.7, 0.9, 0.45);
  right.position.set(0.12, 0, 0);
  right.rotation.z = -0.45;
  const knot = new THREE.Mesh(shared.decorBall, mats.accent);
  knot.scale.set(0.75, 0.6, 0.65);
  group.add(left, right, knot);
}

function addTie(torso, mats, traits) {
  const group = new THREE.Group();
  group.position.set(0, 1.18, 0.4 * traits.bodyDeep);
  group.scale.setScalar(1.45);
  torso.add(group);
  const knot = new THREE.Mesh(shared.decorBox, mats.accent);
  knot.scale.set(0.12, 0.1, 0.055);
  knot.position.set(0, 0.02, 0.01);
  const blade = new THREE.Mesh(shared.decorBox, mats.accent);
  blade.scale.set(0.13, 0.48, 0.045);
  blade.position.set(0, -0.24, 0.01);
  const tip = new THREE.Mesh(shared.decorBox, mats.accent);
  tip.scale.set(0.1, 0.1, 0.045);
  tip.rotation.z = Math.PI / 4;
  tip.position.set(0, -0.48, 0.01);
  group.add(knot, blade, tip);
}

function addScarf(torso, mats, traits) {
  const wrap = new THREE.Mesh(shared.decorRing, mats.accent);
  wrap.rotation.x = Math.PI / 2;
  wrap.position.set(0, 1.24, 0.06);
  wrap.scale.set(1.35 * traits.bodyWide, 1.55, 1.35 * traits.bodyDeep);
  torso.add(wrap);
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(shared.decorBox, mats.accent);
    end.scale.set(0.14, 0.48, 0.07);
    end.position.set(0.14 * side, 0.92, 0.4 * traits.bodyDeep);
    end.rotation.set(0.2, 0.12 * side, 0.25 * side);
    torso.add(end);
  }
}

function addNecklace(torso, mats, traits) {
  const chain = new THREE.Mesh(shared.decorRing, mats.metal);
  chain.rotation.x = Math.PI / 2 + 0.35;
  chain.position.set(0, 1.14, 0.16);
  chain.scale.set(1.1 * traits.bodyWide, 1.05, 1.25 * traits.bodyDeep);
  torso.add(chain);
  const pendant = new THREE.Mesh(shared.decorBall, mats.accent);
  pendant.scale.setScalar(0.95);
  pendant.position.set(0, 0.9, 0.48 * traits.bodyDeep);
  torso.add(pendant);
}

function addEarrings(head, mats, traits) {
  for (const side of [-1, 1]) {
    const drop = new THREE.Group();
    drop.position.set(0.46 * side * traits.earFlare, 0.14 + traits.earTilt * 0.05, 0.1);
    drop.scale.setScalar(1.6);
    head.add(drop);
    const hoop = new THREE.Mesh(shared.decorThinRing, mats.metal);
    hoop.scale.setScalar(0.85);
    hoop.rotation.y = Math.PI / 2;
    const bead = new THREE.Mesh(shared.decorBall, mats.accent);
    bead.scale.setScalar(0.55);
    bead.position.set(0, -0.12, 0);
    drop.add(hoop, bead);
  }
}

function addHat(head, mats) {
  const hat = new THREE.Group();
  hat.position.set(0, 0.4, -0.02);
  hat.scale.setScalar(1.25);
  head.add(hat);
  const brim = new THREE.Mesh(shared.decorDisc, mats.accent);
  brim.scale.set(3.8, 0.28, 3.8);
  brim.position.y = 0.02;
  const crown = new THREE.Mesh(shared.decorCylinder, mats.accent);
  crown.scale.set(1.05, 1.35, 1.05);
  crown.position.y = 0.2;
  const band = new THREE.Mesh(shared.decorRing, mats.metal);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.1;
  band.scale.set(1.05, 0.9, 1.05);
  hat.add(brim, crown, band);
}

function addCap(head, mats) {
  const cap = new THREE.Group();
  cap.position.set(0, 0.32, 0.02);
  cap.scale.setScalar(1.3);
  head.add(cap);
  const crown = new THREE.Mesh(shared.decorCap, mats.accent);
  crown.scale.set(1.5, 1.3, 1.5);
  crown.position.set(0, 0.02, -0.02);
  const bill = new THREE.Mesh(shared.decorBox, mats.accent);
  bill.scale.set(0.48, 0.055, 0.3);
  bill.position.set(0, 0.02, 0.34);
  bill.rotation.x = -0.2;
  cap.add(crown, bill);
}

function addEyewear(head, mats, tinted) {
  const wear = new THREE.Group();
  // Sit just in front of the face planes so lenses frame the live eyes.
  wear.position.set(0, 0.08, 0.54);
  wear.scale.setScalar(1.35);
  head.add(wear);
  const frameMat = tinted ? mats.accent : mats.metal;
  for (const side of [-1, 1]) {
    const rim = new THREE.Mesh(shared.decorThinRing, frameMat);
    rim.position.set(0.15 * side, 0, 0);
    rim.scale.set(1.2, 1.05, 1.15);
    rim.renderOrder = 4;
    wear.add(rim);
    if (tinted) {
      const lens = new THREE.Mesh(shared.decorDisc, mats.lens);
      lens.position.set(0.15 * side, 0, 0.01);
      lens.scale.set(1.0, 0.85, 0.16);
      lens.renderOrder = 4;
      wear.add(lens);
    }
  }
  const bridge = new THREE.Mesh(shared.decorBox, frameMat);
  bridge.scale.set(0.1, 0.03, 0.03);
  bridge.position.set(0, 0.01, 0.01);
  wear.add(bridge);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(shared.decorBox, frameMat);
    arm.scale.set(0.2, 0.03, 0.03);
    arm.position.set(0.3 * side, 0.02, -0.1);
    arm.rotation.y = -0.55 * side;
    wear.add(arm);
  }
}

function addAccessories(head, torso, mats, traits) {
  switch (traits.accessoryNeck) {
    case 'bowtie':
      addBowtie(torso, mats, traits);
      break;
    case 'tie':
      addTie(torso, mats, traits);
      break;
    case 'scarf':
      addScarf(torso, mats, traits);
      break;
    case 'necklace':
      addNecklace(torso, mats, traits);
      break;
    default:
      break;
  }

  switch (traits.accessoryHead) {
    case 'hat':
      addHat(head, mats);
      break;
    case 'cap':
      addCap(head, mats);
      break;
    default:
      break;
  }

  if (traits.accessoryEyes === 'glasses') addEyewear(head, mats, false);
  if (traits.accessoryEyes === 'sunglasses') addEyewear(head, mats, true);
  if (traits.accessoryEarrings) addEarrings(head, mats, traits);
}

export function createMouse(canvases, options = {}) {
  buildShared();
  const traits = options.traits ? hydrateTraits(options.traits) : makeTraits();
  const mats = clonePalette(traits);
  const ownGeometries = [];

  const root = new THREE.Group();
  root.userData.phase = options.phase ?? Math.random() * Math.PI * 2;
  root.userData.targetYaw = 0;
  root.userData.targetPitch = 0;
  root.userData.targetRoll = 0;
  root.userData.live = false;
  root.userData.mouseId = options.id || null;
  root.userData.traits = traits;
  root.userData.ownMaterials = Object.values(mats);
  root.userData.ownGeometries = ownGeometries;

  // Soft contact patch under the feet (forward of center), not a hover blob.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), shared.shadow);
  shadow.rotation.x = -Math.PI / 2;
  const fitness = traits.fitness ?? 0.5;
  shadow.scale.set(1.05 + fitness * 0.35, 0.65 + fitness * 0.12, 1);
  shadow.position.set(0, 0.008, 0.08);
  root.add(shadow);

  // Planted mass: feet stay on the root while the torso can twist with the head.
  addLeg(root, -1, mats);
  addLeg(root, 1, mats);

  const torso = new THREE.Group();
  root.add(torso);
  root.userData.torso = torso;

  const body = new THREE.Mesh(shared.body, mats.fur);
  body.scale.set(1.05 * traits.bodyWide, traits.bodyTall, 0.95 * traits.bodyDeep);
  body.position.set(0, 0.08, 0.02);
  // Body writes depth first so buried arm stubs and belly rim stay inside the silhouette.
  body.renderOrder = 0;
  torso.add(body);

  // Cream patch flush on the pear front — mostly inside the body outline.
  const belly = new THREE.Mesh(shared.bellyGeo, mats.belly);
  belly.scale.set(0.95 * traits.bellySize, 1.15 * traits.bellySize, 0.18 + fitness * 0.08);
  belly.position.set(0, 0.68 - fitness * 0.04, 0.38 + fitness * 0.06);
  belly.renderOrder = 1;
  torso.add(belly);

  torso.add(new THREE.Mesh(shared.tail, mats.fur));

  // Arms after the body so only the outer sleeve shows past the pear.
  addArm(torso, -1, mats, traits);
  addArm(torso, 1, mats, traits);

  const bob = new THREE.Group();
  torso.add(bob);
  root.userData.bob = bob;

  const head = new THREE.Group();
  head.position.set(0, 1.42, 0.05);
  head.scale.setScalar(traits.headScale);
  bob.add(head);
  root.userData.head = head;

  const skull = new THREE.Mesh(shared.head, mats.fur);
  skull.scale.set(1.02, 0.98, 0.96);
  head.add(skull);

  const snout = new THREE.Mesh(shared.snout, mats.fur);
  snout.scale.set(1.12 * traits.snoutRound, 0.82 * traits.snoutRound, 1.18 * traits.snoutLen);
  snout.position.set(0, -0.12, 0.34);
  head.add(snout);

  // Rounder noses stay spherical; flatter ones squash on Z.
  const nose = new THREE.Mesh(shared.noseGeo, mats.nose);
  nose.scale.set(
    traits.noseSize * traits.noseRound,
    traits.noseSize * traits.noseRound,
    traits.noseSize * traits.noseFlat,
  );
  nose.position.set(0, -0.14, 0.54);
  head.add(nose);

  addEar(head, -1, mats, traits);
  addEar(head, 1, mats, traits);
  addWhiskers(head, mats, traits, ownGeometries);

  const planes = {
    leftEye: addFacePlane(head, canvases.leftEye, 'leftEye', new THREE.Vector3(-0.15, 0.08, 0.47), 0.22, 0.28, 1),
    rightEye: addFacePlane(head, canvases.rightEye, 'rightEye', new THREE.Vector3(0.15, 0.08, 0.47), 0.22, 0.28, 1),
    mouth: addFacePlane(head, canvases.mouth, 'mouth', new THREE.Vector3(0, -0.3, 0.42), 0.15, 0.34, 2),
    nose: addFacePlane(head, canvases.nose, 'nose', new THREE.Vector3(0, -0.15, 0.6), 0.2, 0.26, 3),
  };
  root.userData.planes = planes;
  addAccessories(head, torso, mats, traits);
  // staticFace = restored / QR mouse — never wire webcam patch canvases.
  root.userData.liveCanvases = options.staticFace ? null : canvases;
  return root;
}

export function retargetFace(mouse, canvases, { copy }) {
  for (const key of PATCH_KEYS) {
    const plane = mouse.userData.planes[key];
    const source = canvases?.[key];
    if (!plane || !source) continue;
    let canvas = source;
    if (copy) {
      canvas = document.createElement('canvas');
      canvas.width = source.width || 192;
      canvas.height = source.height || 192;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    plane.userData.aspect = canvas.aspect || 1.2;
    fitPlane(plane, plane.userData.aspect, true);
  }
  mouse.userData.liveCanvases = copy ? null : canvases;
}

/** Wire selected face planes to live webcam patch canvases (no copy). */
export function bindLiveFeatures(mouse, patches, keys = ['leftEye', 'rightEye', 'mouth']) {
  const live = { ...(mouse.userData.liveCanvases || {}) };
  for (const key of keys) {
    const plane = mouse.userData.planes[key];
    const source = patches?.[key];
    if (!plane || !source) continue;
    const tex = new THREE.CanvasTexture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const previous = plane.material.map;
    plane.material.map = tex;
    plane.material.needsUpdate = true;
    if (previous) previous.dispose();
    plane.userData.aspect = source.aspect || plane.userData.aspect || 1.2;
    fitPlane(plane, plane.userData.aspect, true);
    live[key] = source;
  }
  mouse.userData.liveCanvases = live;
}

export function refreshLiveFace(mouse) {
  const canvases = mouse.userData.liveCanvases;
  if (!canvases) return;
  for (const key of PATCH_KEYS) {
    const plane = mouse.userData.planes[key];
    const canvas = canvases[key];
    if (!plane || !canvas) continue;
    if (plane.material.map) plane.material.map.needsUpdate = true;
    plane.userData.aspect = canvas.aspect || plane.userData.aspect || 1.2;
    fitPlane(plane, plane.userData.aspect, false);
  }
}

export function refitFacePlanes(mouse, snap = true) {
  for (const plane of Object.values(mouse.userData.planes || {})) {
    fitPlane(plane, plane.userData.aspect || 1.2, snap);
  }
}

function fitPlane(plane, aspect, snap) {
  const safeAspect = THREE.MathUtils.clamp(aspect, 0.55, 2.6);
  const boost = SCALED_PATCHES.has(plane.userData.key) ? featureScale : 1;
  const height = plane.userData.height * boost;
  const maxWidth = plane.userData.maxWidth * boost;
  const width = Math.min(height * safeAspect, maxWidth);
  if (!plane.userData.targetScale) plane.userData.targetScale = new THREE.Vector3();
  plane.userData.targetScale.set(width, height, 1);
  if (snap) plane.scale.copy(plane.userData.targetScale);
}

export function disposeMouse(mouse) {
  mouse.traverse((obj) => {
    if (!obj.userData?.isFace) return;
    obj.material.map?.dispose();
    obj.material.dispose();
  });
  for (const mat of mouse.userData.ownMaterials || []) mat.dispose();
  for (const geo of mouse.userData.ownGeometries || []) geo.dispose();
}

export const FACE_KEYS = PATCH_KEYS;
