import { canvasesFromSnapshot, fetchSnapshot, newMouseId } from './persist.js';
import { createMouseTraits, DEFAULT_PART_TUNING } from './mouse.js';

/** Fixed school-uniform palette merged into saved traits when present. */
export const UNIFORM_TRAITS = {
  fur: '#3d4f6a',
  belly: '#e8e2d6',
  earInner: '#c9a89a',
  nose: '#5a4038',
  whisker: '#2a2118',
  accent: '#c41e3a',
  metal: '#b8b0a4',
  accessoryNeck: 'tie',
  accessoryHead: 'none',
  accessoryEyes: 'none',
  accessoryEarrings: false,
};

function patchCanvas(label, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 192, 192);
  draw(ctx);
  if (label) {
    ctx.fillStyle = '#1a120c';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 96, 178);
  }
  canvas.aspect = 1.15;
  return canvas;
}

/** Placeholder face when registration / snapshot data is missing. */
export function placeholderFaceCanvases(seed = Math.random()) {
  const hue = Math.floor(seed * 360);
  return {
    leftEye: patchCanvas('', (ctx) => {
      ctx.fillStyle = `hsl(${hue} 40% 78%)`;
      ctx.beginPath();
      ctx.ellipse(96, 110, 68, 46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath();
      ctx.ellipse(96, 118, 50, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2118';
      ctx.beginPath();
      ctx.arc(104, 118, 11, 0, Math.PI * 2);
      ctx.fill();
    }),
    rightEye: patchCanvas('', (ctx) => {
      ctx.fillStyle = `hsl(${hue} 40% 78%)`;
      ctx.beginPath();
      ctx.ellipse(96, 110, 68, 46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath();
      ctx.ellipse(96, 118, 50, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2118';
      ctx.beginPath();
      ctx.arc(88, 118, 11, 0, Math.PI * 2);
      ctx.fill();
    }),
    nose: patchCanvas('', (ctx) => {
      ctx.fillStyle = `hsl(${hue} 30% 58%)`;
      ctx.beginPath();
      ctx.ellipse(96, 100, 46, 58, 0, 0, Math.PI * 2);
      ctx.fill();
    }),
    mouth: patchCanvas('', (ctx) => {
      ctx.fillStyle = `hsl(${hue + 15} 42% 46%)`;
      ctx.beginPath();
      ctx.ellipse(96, 96, 70, 32, 0, 0, Math.PI * 2);
      ctx.fill();
    }),
  };
}

export function parseMouseIdFromQrText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get('m') || url.searchParams.get('id');
    if (fromQuery) return fromQuery;
  } catch {
    /* not a URL */
  }
  if (/^[a-z0-9]{8,32}$/i.test(trimmed)) return trimmed;
  return null;
}

export async function resolveParticipant(idHint) {
  const id = idHint || newMouseId();
  let canvases = placeholderFaceCanvases(Math.random());
  let traits = { ...createMouseTraits(), ...UNIFORM_TRAITS };
  let partTuning = { ...DEFAULT_PART_TUNING };
  let faceSettings = null;
  let snapshot = null;

  if (idHint) {
    try {
      snapshot = await fetchSnapshot(idHint);
      canvases = await canvasesFromSnapshot(snapshot);
      traits = { ...UNIFORM_TRAITS, ...snapshot.traits };
      faceSettings = {
        featureScale: snapshot.featureScale,
        nostrilScale: snapshot.nostrilScale,
        eyePosition: snapshot.eyePosition,
      };
      partTuning = { ...DEFAULT_PART_TUNING, ...snapshot.partTuning };
    } catch (error) {
      console.warn('stage: no snapshot for id, using placeholder', idHint, error);
    }
  }

  return { id, canvases, traits, faceSettings, partTuning, snapshot };
}
