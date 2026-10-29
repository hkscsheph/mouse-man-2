# Reference

## Materials
- Pixel Mouse https://ikoiku.itch.io/16-x-16-pixel-art-character-mouse
- Pixel Cat https://opengameart.org/content/pixel-cat-0

## Modes

| URL | Mode |
| --- | --- |
| `/` (default) | Single-player webcam crowd |
| `?mode=pixel` | Pixel cat chase (demo loop) |
| `?mode=stage` | **Main stage** — QR admit + class photo + WebSocket cat eat |

Legacy demo mice on the default route still work with `?stage` (without `mode=stage`).

## Main stage (`?mode=stage`)

Split screen: **class photo** (3D mice in uniform) on top, **pixel chase** on the bottom.

1. Operators scan participant QR codes (camera uses `BarcodeDetector` when available).
2. Each admit adds one pixel mouse and one 3D figure (face from saved snapshot when the QR/`?m=` id resolves; otherwise a placeholder face; body uses a fixed school-uniform trait preset).
3. A WebSocket client listens for cat-eat commands and runs the pixel cat eat animation plus a scratch-out on the matching photo figure.

### Keyboard (local demo without WebSocket)

| Key | Action |
| --- | --- |
| `A` | Paste / type a QR URL or mouse id |
| `D` | Admit a random demo guest (placeholder face) |
| `E` | Broadcast `{ "type": "catEat" }` via `postMessage` (same handler as WebSocket) |

### WebSocket URL

Resolved in order:

1. Query `?ws=wss://example.com/stage`
2. Build-time `VITE_STAGE_WS_URL`
3. Default `ws://localhost:8787`

### Message schema

JSON text frames only.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `type` | string | yes | Must be `"catEat"` |
| `id` | string | no | Mouse id to remove; omit to eat the oldest admit (FIFO) |

Examples:

```json
{ "type": "catEat" }
```

```json
{ "type": "catEat", "id": "a1b2c3d4e5f6" }
```

### `postMessage` fallback

Same payload as WebSocket, wrapped for tests or parent pages:

```js
window.postMessage({ channel: 'stage-ws', payload: { type: 'catEat' } }, '*');
```

### Local WebSocket demo server

```bash
npm install
npm run stage:ws-demo
```

In another terminal:

```bash
npm run dev
# open http://localhost:5173/?mode=stage
```

Press **Enter** in the demo server terminal to broadcast eat-next; type `id=MOUSE_ID` and Enter for a targeted eat.

## Pixel mode

The classroom background, floor, and desks scroll continuously and wrap without an on-screen reset.

## Accessories
Random accessories adjust to each mouse's randomized body and ear dimensions.
Eyes and mouth patches conform to the skull; nose patches and 3D noses follow the muzzle surface.
The nostril-size slider scales the nose face patch independently of eyes and mouth.
The eye-position slider moves both eyes vertically without moving the mouth or nose.
Generated nose patches place nostrils near the bottom of the nose.
Live face patches follow the tracked head tilt as a single face.
