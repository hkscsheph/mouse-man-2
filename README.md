# 老鼠人群

用網路攝影機把人臉做成 3D 老鼠，再用於單人互動、報到與舞台演出。掃到的 QR 會還原同一隻老鼠的外觀，而不是另外做一隻。

## 模式

| 網址 | 功能 |
| --- | --- |
| `/` | 單人鏡頭。臉部即時驅動眼前的 3D 老鼠，靜止後存檔並顯示可列印的 QR。已凍結的老鼠最多 30 隻，留在鏡頭兩側。 |
| `?mode=uniform` | 同上，但穿短袖校服與深色長褲。五色為黑、白、橄欖、酒紅、靛藍，左袖有校徽。衣服跟著軀幹與手臂。 |
| `?mode=pixel` | 像素貓鼠追逐。教室背景持續捲動。 |
| `?mode=reg` | 報到。黑貓老師先站在班級合照裡，每次擷取加入一位學生，並把肖像貼上該人的剪影。 |
| `?mode=stage` | 主舞台。上方是像素追逐，下方是最多 30 隻、三排各十隻的 3D 合照。 |

預設路線加上 `?stage` 仍會顯示舊的示範老鼠。合照裡的紫衣與海軍藍都用靛藍，以維持五色校服。中央的貓老師不佔老鼠位置。

## 單人與報到

眼睛、嘴巴貼在頭骨上，並跟著頭部傾斜一起動。鼻子貼片與 3D 鼻子沿著吻部。可調五官大小、眼睛高低、鼻孔、胸口與耳朵。隨機配件會配合每隻老鼠的身體與耳朵尺寸。

報到預設使用女生班剪影，不依臉判斷性別。加入後可把最後一位改成男生班剪影；剪影來自 `polygons_girl.json` 與 `polygons_boy.json`。`P` 開關印表機模式。開啟時，每次報到成功會印一張：第一行是「竄 」加上本機時間 `yyyymmdd hhMM` 再加上「 🐈」，第二行是半寬 QR，第三行是 🐭🐁🪤🐀🐹🧀。印表機要能從 `npm run dev` 連到 `192.168.0.191:9100`。

| 按鍵 | 動作 |
| --- | --- |
| `Q` | 擷取這一位並建立 QR |
| `W` | 切換最後一位的班級模板 |
| `T` | 顯示或隱藏報到面板與鏡頭縮圖 |

## 主舞台

掃 QR 會還原已儲存的毛色、五官、臉部與部位調整。快照讀不到就顯示錯誤，不會換成別隻老鼠。QR 的 `m` 也帶著像素鼠的毛色。`D` 可加入一隻沒有真實五官的示範來賓。

未指定對象時，貓會跑向最近的像素鼠，抓起後一起向左移出畫面，再回到原位。合照上的那一隻被塗黑並畫上紅色抓痕，之後不再算在場。抓痕開始時播放一段怒喵；若瀏覽器擋住聲音，先按一次畫面或畫面上的「啟用聲音」。音檔摘自 [Cat Wants Food by Oneirophile](https://freesound.org/people/Oneirophile/sounds/120160/)，以 [CC0](https://creativecommons.org/publicdomain/zero/1.0/) 釋出。

有 `BarcodeDetector` 時用它掃碼，否則用 `jsQR`。支援的瀏覽器在 worker 解碼，其餘在主執行緒。畫面預設隱藏操作面板。`U` 可開關所有 3D 角色的校服，包含之後才進場的。`+=` / `-` 縮放像素角色（起始 300%）。方向鍵移動 3D 鏡頭，`Space` 加 `↑` / `↓` 上下平移。`T` 只隱藏面板，掃描不中斷。`A` 可貼上 QR 網址或老鼠 id。`E` 等同不帶 id 的吃鼠指令。

WebSocket 位址依序為 `?ws=`、建置時的 `VITE_STAGE_WS_URL`、否則 `ws://localhost:8787`。只接受 JSON 文字，`type` 必須是 `catEat`；`id` 可省略。父頁面也可以送同一份內容：

```js
window.postMessage({ channel: 'stage-ws', payload: { type: 'catEat' } }, '*');
```

```bash
npm run stage:ws-demo
```

在另一個終端機執行 `npm run dev`，開啟 `http://localhost:5173/?mode=stage`。示範伺服器按 Enter 會吃掉最近的一隻；輸入 `id=老鼠ID` 再按 Enter 則指定對象。

`npm run dev` 與 `npm run preview` 會把老鼠快照放在被忽略的 `.dev-data/mice/`，同一來源的瀏覽器可以再讀回。上線後由 Netlify Function `/api/mouse` 存取 Blobs。

# Reference

## Materials
- Pixel Mouse https://ikoiku.itch.io/16-x-16-pixel-art-character-mouse
- Pixel Cat https://opengameart.org/content/pixel-cat-0
- https://www.spritefusion.com/pixel-snapper

## Modes

| URL | Mode |
| --- | --- |
| `/` (default) | Single-player webcam crowd |
| `?mode=uniform` | Default webcam crowd with mice in five school-uniform colors |
| `?mode=pixel` | Pixel cat chase (demo loop) |
| `?mode=stage` | **Main stage** — QR admit + class photo + WebSocket cat eat |
| `?mode=reg` | **Registration** — capture participants into the class photo and print their QR codes |

Legacy demo mice on the default route still work with `?stage` (without `mode=stage`).

Uniform mode uses textured, short-sleeved shirts with the school badge on the left sleeve, and dark trousers. Shirts follow the torso and sleeves follow the arms; the chest-tuning controls still adjust the underlying belly patch rather than displacing the clothing.

## Registration (`?mode=reg`)

Registration starts with the black-cat teacher alone in the class scene. Each capture adds one student from the girls' class-photo template by default and replaces the student's face with the captured portrait. Face appearance is not used to infer gender. After adding a participant, **Switch last participant to…** changes that person's template and updates the class photo and QR card label. Student silhouettes are clipped to the manual polygon annotations in `polygons_girl.json` and `polygons_boy.json`. Press **Q** to capture and **W** to switch the latest participant's template; press **T** to toggle the registration panel and webcam thumbnail. Press **P** to toggle printer mode. While it is on, each successful registration prints a slip on the LAN printer (`192.168.0.191:9100`, override with `PRINTER_HOST`): line 1 is `竄 ` plus the local time as `yyyymmdd hhMM` plus ` 🐈`, line 2 is a half-width QR code, and line 3 is 🐭🐁🪤🐀🐹🧀. The dev server must be running so the page can reach that port. The existing mouse-saving and printable QR-card flow is preserved.

## Main stage (`?mode=stage`)

Split screen: **pixel chase** on top, **class photo** (3D mice) on the bottom. Stage pixel mice wander slowly and face away from the cat; the cat smoothly varies its run speed. The standalone pixel mode keeps its existing movement. The class photo shows up to 30 standing 3D mice center-out in three stepped rows of ten; they wear uniforms by default. Use the HUD sliders to adjust row rise (default `0.8`) and camera height (default `1.8`). The HUD and live QR-scanning camera thumbnail start hidden.

Shirt colors follow the corresponding front, middle, and back positions in `br_class.jpg`. The photo's purple and navy shirts both use indigo to retain the five-color uniform palette; the central cat teacher has no mouse slot.

1. Operators scan participant QR codes (uses native `BarcodeDetector` when available and a `jsQR` fallback otherwise).
2. Each QR admit restores the original 3D mouse from its persisted traits, captured eyes/nose/mouth, face tuning, and part tuning. If its snapshot cannot be loaded, the stage reports an error instead of showing a different mouse. The `m` value also carries the saved fur color for the pixel mouse. `D` adds a demo guest with a placeholder face.
3. Pressing `E` (or sending a `catEat` WebSocket message without an ID) targets the closest active pixel mouse. The cat runs to it, then uses the second row of `cat-run-actions.png` while crawling away; the mouse stays on the floor as both drift left with the scrolling background until off-screen, and the cat returns to its starting position. Its 3D figure stays in the photo blacked out with randomized red claw slashes drawn diagonally downward in either direction and is no longer counted as active. Messages with an ID target that specific mouse.

An angry meow plays when the scratches start. Browsers may require a click or keypress before sound is allowed; if blocked, use the on-screen **Enable sound** button for subsequent scratches. The recording is an excerpt of [Cat Wants Food by Oneirophile](https://freesound.org/people/Oneirophile/sounds/120160/), shared under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).

The stage requests a high-performance WebGL device when available. Hardware acceleration depends on browser and driver settings. When native QR scanning is unavailable, supported browsers decode camera frames in a worker to keep the animation responsive; other browsers use the main-thread fallback.

`npm run dev` and `npm run preview` provide a local `/api/mouse` backed by ignored `.dev-data/mice/` files, so saved QR snapshots can be retrieved across browser sessions using the same server origin.

### Keyboard (local demo without WebSocket)

| Key | Action |
| --- | --- |
| `A` | Paste / type a QR URL or mouse id |
| `D` | Admit a random demo guest (placeholder face) |
| `E` | Eat the closest active mouse; its 3D figure remains blacked out with red scratches |
| `T` | Show / hide the HUD and webcam thumbnail; QR scanning continues |
| `U` | Toggle uniforms on all 3D figures, including later admissions |
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
| `type` | string | yes | `"catEat"` eats one mouse. `"catSweep"` eats every mouse still alive, one after another. A `catEat` that arrives during a chase waits in a queue. |
| `id` | string | no | On `catEat`, the mouse to remove. Omit it and the closest mouse is taken. |

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
2. In a room, default mode is used for single-player live interaction; `?mode=uniform` adds school uniforms in black, white, olive, burgundy, and indigo.
3. In main stage, users show their QR one by one. Each adds a mouse to pixel mode and a 3D model to the class photo. The stage subscribes to a WebSocket; on a message, the pixel cat approaches and eats a mouse while its 3D model is scratched out of the photo.
