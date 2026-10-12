const DB_NAME = 'mouse-crowd';
const DB_VERSION = 1;
const STORE = 'mice';
const PATCH_KEYS = ['leftEye', 'rightEye', 'nose', 'mouth'];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newMouseId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function colorToHex(color) {
  return `#${color.getHexString()}`;
}

export function serializeTraits(traits) {
  return {
    fur: colorToHex(traits.fur),
    belly: colorToHex(traits.belly),
    earInner: colorToHex(traits.earInner),
    nose: colorToHex(traits.nose),
    whisker: colorToHex(traits.whisker),
    earSides: traits.earSides ?? 0,
    earSize: traits.earSize,
    earWide: traits.earWide,
    earThick: traits.earThick,
    earFlare: traits.earFlare,
    earTilt: traits.earTilt,
    noseRound: traits.noseRound,
    noseFlat: traits.noseFlat,
    noseSize: traits.noseSize,
    headScale: traits.headScale,
    bodyWide: traits.bodyWide,
    bodyTall: traits.bodyTall,
    bodyDeep: traits.bodyDeep,
    bellySize: traits.bellySize,
    snoutLen: traits.snoutLen,
    snoutRound: traits.snoutRound,
    whiskerCount: traits.whiskerCount,
    whiskerLen: traits.whiskerLen,
    whiskerSpread: traits.whiskerSpread,
    whiskerLift: traits.whiskerLift,
    whiskerCurl: traits.whiskerCurl,
  };
}

function canvasToPng(source, size = 160) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(source, 0, 0, size, size);
  return {
    dataUrl: canvas.toDataURL('image/png'),
    aspect: source.aspect || 1,
  };
}

function cloneCanvas(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width || 160;
  canvas.height = source.height || 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  canvas.aspect = source.aspect || canvas.width / canvas.height || 1;
  return canvas;
}

/** Independent face canvases at a moment in time (for freeze / persist). */
export function captureFaceCanvases(mouse) {
  const patches = {};
  for (const key of PATCH_KEYS) {
    const plane = mouse.userData.planes[key];
    const map = plane?.material?.map;
    const source = map?.image || mouse.userData.liveCanvases?.[key];
    if (!source) continue;
    patches[key] = cloneCanvas(source);
  }
  return patches;
}

export function snapshotFromMouse(mouse, { id, featureScale, faceCanvases } = {}) {
  const patches = {};
  const sources = faceCanvases || null;
  for (const key of PATCH_KEYS) {
    const plane = mouse.userData.planes[key];
    const map = plane?.material?.map;
    const source = sources?.[key] || map?.image || mouse.userData.liveCanvases?.[key];
    if (!source) continue;
    patches[key] = canvasToPng(source);
  }
  return {
    id: id || mouse.userData.mouseId || newMouseId(),
    createdAt: Date.now(),
    featureScale: featureScale ?? 1,
    traits: serializeTraits(mouse.userData.traits),
    patches,
  };
}

export async function canvasesFromSnapshot(snapshot) {
  const patches = {};
  await Promise.all(
    PATCH_KEYS.map(
      (key) =>
        new Promise((resolve, reject) => {
          const entry = snapshot.patches[key];
          if (!entry?.dataUrl) {
            reject(new Error(`Missing patch ${key}`));
            return;
          }
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 128;
            canvas.height = img.naturalHeight || 128;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.aspect = entry.aspect || canvas.width / canvas.height;
            patches[key] = canvas;
            resolve();
          };
          img.onerror = () => reject(new Error(`Bad patch ${key}`));
          img.src = entry.dataUrl;
        }),
    ),
  );
  return patches;
}

export async function saveLocal(snapshot) {
  const db = await openDb();
  await idbRequest(db.transaction(STORE, 'readwrite').objectStore(STORE).put(snapshot));
  db.close();
  return snapshot.id;
}

export async function loadLocal(id) {
  const db = await openDb();
  const row = await idbRequest(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
  db.close();
  return row || null;
}

export async function publishSnapshot(snapshot) {
  await saveLocal(snapshot);
  try {
    const res = await fetch('/api/mouse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) throw new Error(`publish ${res.status}`);
    const data = await res.json();
    return { id: data.id || snapshot.id, remote: true };
  } catch {
    return { id: snapshot.id, remote: false };
  }
}

export async function fetchSnapshot(id) {
  const local = await loadLocal(id);
  if (local) return local;
  const res = await fetch(`/api/mouse?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Mouse not found');
  const snapshot = await res.json();
  await saveLocal(snapshot);
  return snapshot;
}

export function shareUrlForId(id) {
  const url = new URL(location.href);
  url.searchParams.delete('stage');
  url.searchParams.set('m', id);
  url.hash = '';
  return url.toString();
}
