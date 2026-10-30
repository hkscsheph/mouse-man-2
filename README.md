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

Split screen: **pixel chase** on top, **class photo** (3D mice in uniform) on the bottom. The HUD and live QR-scanning camera thumbnail start hidden.

1. Operators scan participant QR codes (uses native `BarcodeDetector` when available and a `jsQR` fallback otherwise).
2. Each admit adds one pixel mouse and one 3D figure. A resolved QR/`?m=` snapshot restores the original mouse traits, face, face tuning, and part tuning. The `m` value also carries the saved fur color, so the pixel mouse still matches if the full snapshot is unavailable; missing snapshots use a placeholder face with the stage uniform palette.
3. A WebSocket client listens for cat-eat commands and runs the pixel cat eat animation plus a scratch-out on the matching photo figure.

### Keyboard (local demo without WebSocket)

| Key | Action |
| --- | --- |
| `A` | Paste / type a QR URL or mouse id |
| `D` | Admit a random demo guest (placeholder face) |
| `E` | Broadcast `{ "type": "catEat" }` via `postMessage` (same handler as WebSocket) |
| `T` | Show / hide the HUD and webcam thumbnail; QR scanning continues |
| `+` / `-` | Enlarge / shrink the pixel cat and mice (starts at 300%) |

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

## Workflow
1. (TODO) At registration, a group of users scan their faces one by one each generating a QR code for printing, their faces will be captured for generating a class photo in 大逃殺 style 
2. In a room, current default mode will be used for single player live interaction
3. (Ongoing) In main stage, users show their QR one by one. Each will add a mouse to the pixel mode, and add a 3D model to a class photo style with uniform clothing. This mode will subscribe to a websocket and upon message received the pixel cat approaches the pixel mouses and eat one scratching out one 3D model in the class photo