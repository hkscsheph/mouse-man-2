# Reference

## Materials
- Pixel Mouse https://ikoiku.itch.io/16-x-16-pixel-art-character-mouse
- Pixel Cat https://opengameart.org/content/pixel-cat-0
- https://www.spritefusion.com/pixel-snapper

## Modes

| URL | Mode |
| --- | --- |
| `/` (default) | Single-player webcam crowd |
| `?mode=pixel` | Pixel cat chase (demo loop) |
| `?mode=stage` | **Main stage** — QR admit + class photo + WebSocket cat eat |
| `?mode=reg` | **Registration** — capture participants into the class photo and print their QR codes |

Legacy demo mice on the default route still work with `?stage` (without `mode=stage`).

## Registration (`?mode=reg`)

Participants stand in front of the webcam one at a time. When a face is detected and steady, choose **Capture participant & create QR** to save their mouse using the default mode's snapshot and share-QR flow. Their captured portrait replaces the next red question mark in `br_class.jpg`; each generated QR is kept in the print panel so the operator can print the registered participants' codes together. The class photo starts with every student face masked by a red question mark; the black cat-headed teacher remains visible. Press **T** to toggle the registration panel and webcam thumbnail.

## Main stage (`?mode=stage`)

Split screen: **pixel chase** on top, **class photo** (3D mice in uniform) on the bottom. Stage pixel mice wander slowly and face away from the cat; the cat smoothly varies its run speed. The standalone pixel mode keeps its existing movement. The class photo shows up to 30 standing 3D mice center-out in three stepped rows of ten; use the HUD sliders to adjust row rise (default `0.8`) and camera height (default `1.8`). The HUD and live QR-scanning camera thumbnail start hidden.

1. Operators scan participant QR codes (uses native `BarcodeDetector` when available and a `jsQR` fallback otherwise).
2. Each QR admit restores the original 3D mouse from its persisted traits, captured eyes/nose/mouth, face tuning, and part tuning. If its snapshot cannot be loaded, the stage reports an error instead of showing a different mouse. The `m` value also carries the saved fur color for the pixel mouse. `D` adds a demo guest with a placeholder face.
3. Pressing `E` (or sending a `catEat` WebSocket message without an ID) targets the closest active pixel mouse. The cat runs to it, then uses the second row of `cat-run-actions.png` while crawling away; the mouse stays on the floor as both drift left with the scrolling background until off-screen, and the cat returns to its starting position. Its 3D figure stays in the photo blacked out with randomized red claw slashes and is no longer counted as active. Messages with an ID target that specific mouse.

`npm run dev` and `npm run preview` provide a local `/api/mouse` backed by ignored `.dev-data/mice/` files, so saved QR snapshots can be retrieved across browser sessions using the same server origin.

### Keyboard (local demo without WebSocket)

| Key | Action |
| --- | --- |
| `A` | Paste / type a QR URL or mouse id |
| `D` | Admit a random demo guest (placeholder face) |
| `E` | Eat the closest active mouse; its 3D figure remains blacked out with red scratches |
| `T` | Show / hide the HUD and webcam thumbnail; QR scanning continues |
| `+=` / `-` | Enlarge / shrink the pixel cat and mice (starts at 300%) |
| Arrow keys | Move the 3D camera left/right and closer/farther |
| `Space` + `↑` / `↓` | Pan the 3D camera upward / downward |

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
1. In registration mode, a group of users is captured one by one, each generating a QR code for printing and taking their place in the class photo.
2. In a room, current default mode will be used for single player live interaction
3. In main stage, users show their QR one by one. Each will add a mouse to the pixel mode, and add a 3D model to a class photo style with uniform clothing. This mode will subscribe to a websocket and upon message received the pixel cat approaches the pixel mouses and eat one scratching out one 3D model in the class photo (TODO: mouses wear school uniforms and stand in the same position)