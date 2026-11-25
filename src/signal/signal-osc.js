/** OSC addresses for the options on ?mode=signal. */

export const CAMERA_NUDGE = 0.08;
export const SCALE_STEP = 0.1;
// PC-中央Server already uses UDP 9000 (Central) and UDP 9001 (OscForward).
export const SIGNAL_OSC_UDP_PORT = 9020;
export const SIGNAL_OSC_WS_PORT = 9021;

const PROP_LABELS = {
  figure: 'Figure',
  drawing: 'Drawing',
  box: 'Gift',
  poster: 'Poster',
  note: 'Note',
};

const PROP_ALIASES = {
  ...Object.fromEntries(Object.keys(PROP_LABELS).map((kind) => [kind, kind])),
  gift: 'box',
  1: 'figure',
  2: 'drawing',
  3: 'box',
  4: 'poster',
  5: 'note',
};

const CAMERA_DIRS = {
  left: [-1, 0, 0, 'Camera left'],
  right: [1, 0, 0, 'Camera right'],
  closer: [0, -1, 0, 'Camera closer'],
  farther: [0, 1, 0, 'Camera farther'],
  up: [0, 0, 1, 'Camera up'],
  down: [0, 0, -1, 'Camera down'],
};

const CAMERA_VECTORS = Object.fromEntries(
  Object.values(CAMERA_DIRS).map(([x, depth, height, label]) => [`${x},${depth},${height}`, label]),
);

export const SIGNAL_OSC_ROUTES = [
  ['/signal/demo', 'Demo guest'],
  ['/signal/eat', 'Eat closest. A string eats that mouse id'],
  ['/signal/sweep', 'Clear the stage'],
  ['/signal/scratch', 'Scratch zoom'],
  ['/signal/restart', 'Restart'],
  ['/signal/prop/figure', 'Figure'],
  ['/signal/prop/drawing', 'Drawing'],
  ['/signal/prop/box', 'Gift'],
  ['/signal/prop/poster', 'Poster'],
  ['/signal/prop/note', 'Note'],
  ['/signal/uniform', 'Uniforms'],
  ['/signal/larger', 'Larger cat'],
  ['/signal/smaller', 'Smaller cat'],
  ['/signal/scale', 'Pixel size by the number sent, such as 0.1 or -0.1'],
  ['/signal/camera/left', 'Camera left'],
  ['/signal/camera/right', 'Camera right'],
  ['/signal/camera/closer', 'Camera closer'],
  ['/signal/camera/farther', 'Camera farther'],
  ['/signal/camera/up', 'Camera up'],
  ['/signal/camera/down', 'Camera down'],
  ['/signal/camera/move', 'Camera by x, depth, and height'],
  ['/signal/webcam', 'Webcam'],
  ['/signal/ipcam', 'IP camera. A string sets the address'],
  ['/signal/admit', 'Admit the QR or mouse id string'],
  ['/signal/hud', 'Stage HUD'],
];

function sendAction(payload, label) {
  return { op: 'send', payload, label };
}

export function signalControl(name, value) {
  switch (name) {
    case 'demo':
      return sendAction({ type: 'admit' }, 'Demo guest');
    case 'eat': {
      const id = typeof value === 'string' ? value.trim() : '';
      return sendAction(id ? { type: 'catEat', id } : { type: 'catEat' }, id ? `Eat ${id}` : 'Eat closest');
    }
    case 'sweep':
      return sendAction({ type: 'catSweep' }, 'Clear the stage');
    case 'scratch':
      return sendAction({ type: 'scratch' }, 'Scratch zoom');
    case 'fps':
      return sendAction({ type: 'fps' }, 'FPS');
    case 'backgroundEffects':
      return sendAction({ type: 'backgroundEffects' }, 'Background effects');
    case 'restart':
      return sendAction({ type: 'restartAll' }, 'Restart');
    case 'uniform':
      return sendAction({ type: 'uniform' }, 'Uniforms');
    case 'larger':
      return sendAction({ type: 'spriteScale', delta: SCALE_STEP }, 'Larger cat');
    case 'smaller':
      return sendAction({ type: 'spriteScale', delta: -SCALE_STEP }, 'Smaller cat');
    case 'scale': {
      const delta = Number(value);
      if (!Number.isFinite(delta) || delta === 0) return null;
      return sendAction({ type: 'spriteScale', delta }, delta > 0 ? 'Larger cat' : 'Smaller cat');
    }
    case 'hud':
      return sendAction({ type: 'hud' }, 'HUD');
    case 'prop': {
      const kind = PROP_ALIASES[value];
      const label = PROP_LABELS[kind];
      if (!label) return null;
      return sendAction({ type: 'prop', kind }, label);
    }
    case 'camera': {
      const label = CAMERA_VECTORS[value];
      if (!label) return null;
      const move = String(value).split(',').map((part) => Number(part) * CAMERA_NUDGE);
      return sendAction({ type: 'camera', move }, label);
    }
    case 'camera-dir': {
      const dir = CAMERA_DIRS[value];
      if (!dir) return null;
      return sendAction({
        type: 'camera',
        move: [dir[0] * CAMERA_NUDGE, dir[1] * CAMERA_NUDGE, dir[2] * CAMERA_NUDGE],
      }, dir[3]);
    }
    case 'camera-move': {
      const move = Array.isArray(value) ? value.slice(0, 3).map(Number) : [];
      if (move.length < 3 || move.some((part) => !Number.isFinite(part))) return null;
      return sendAction({ type: 'camera', move }, 'Camera');
    }
    case 'admit': {
      const raw = String(value || '').trim();
      if (!raw) return null;
      return sendAction({ type: 'admit', raw }, raw);
    }
    case 'webcam':
      return { op: 'webcam', label: 'Webcam' };
    case 'ipcam':
      return { op: 'ipcam', url: String(value || '').trim(), label: 'IP camera' };
    default:
      return null;
  }
}

function addressParts(address) {
  const parts = String(address || '').trim().toLowerCase().split('/').filter(Boolean);
  if (parts[0] !== 'signal') return null;
  return parts.slice(1);
}

function isRelease(args) {
  if (!args.length) return false;
  const first = args[0];
  if (typeof first === 'number') return !(first > 0);
  if (typeof first === 'boolean') return !first;
  if (first == null) return true;
  return false;
}

function textArg(args) {
  const text = args.find((value) => typeof value === 'string');
  return text ? text.trim() : '';
}

function numberArg(args) {
  const value = args.find((item) => typeof item === 'number' && Number.isFinite(item));
  return value === undefined ? null : value;
}

export function signalActionFromOsc(address, args = []) {
  const parts = addressParts(address);
  if (!parts?.length) return null;
  const values = Array.isArray(args) ? args : [args];
  const [head, tail] = parts;

  if (head === 'camera' && tail === 'move') {
    const move = values.slice(0, 3).map((value) => Number(value));
    return signalControl('camera-move', move);
  }
  if (head === 'scale') return signalControl('scale', numberArg(values));
  if (head === 'admit') return signalControl('admit', textArg(values));
  if (isRelease(values)) return null;

  if (head === 'eat') return signalControl('eat', textArg(values));
  if (head === 'ipcam' || (head === 'source' && tail === 'ipcam')) return signalControl('ipcam', textArg(values));
  if (head === 'webcam' || (head === 'source' && tail === 'webcam')) return signalControl('webcam');
  if (head === 'prop') return signalControl('prop', PROP_ALIASES[tail] ? tail : textArg(values).toLowerCase());
  if (head === 'camera') return signalControl('camera-dir', tail || textArg(values).toLowerCase());
  if (PROP_ALIASES[head]) return signalControl('prop', head);

  const names = {
    demo: 'demo',
    sweep: 'sweep',
    scratch: 'scratch',
    restart: 'restart',
    uniform: 'uniform',
    larger: 'larger',
    smaller: 'smaller',
    hud: 'hud',
  };
  return names[head] ? signalControl(names[head]) : null;
}

export function resolveSignalOscUrl({ search = '', hostname = '' } = {}, envUrl = '') {
  const fromQuery = new URLSearchParams(search).get('osc');
  if (fromQuery) return fromQuery;
  if (envUrl) return envUrl;
  const host = !hostname || hostname === '127.0.0.1' ? 'localhost' : hostname;
  const name = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `ws://${name}:${SIGNAL_OSC_WS_PORT}`;
}
