# 老鼠人群

用網路攝影機把人臉做成 3D 老鼠，再用於單人互動、報到與舞台演出。掃到的 QR 會還原同一隻老鼠的外觀，而不是另外做一隻。

## 模式

| 網址 | 功能 |
| --- | --- |
| `/` | 單人鏡頭。臉部即時驅動眼前的 3D 老鼠，靜止後存檔並顯示可列印的 QR。已凍結的老鼠最多 30 隻，留在鏡頭兩側。 |
| `?mode=uniform` | 同上，但穿短袖校服與深色長褲。五色為黑、白、橄欖、酒紅、靛藍，左袖有校徽。衣服跟著軀幹與手臂。 |
| `?mode=pixel` | 像素貓鼠追逐。教室背景持續捲動。 |
| `?mode=reg` | 報到。黑貓老師先站在班級合照裡，每次擷取加入一位學生，並把肖像貼上該人的剪影。成功後把肖像與這隻隨機老鼠寫進共用資料夾。 |
| `?mode=stage` | 主舞台。上方是像素追逐，下方是最多 30 隻、三排各十隻的 3D 合照。這個畫面只負責顯示，不掃描、也不接受按鍵。 |
| `?mode=signal` | 舞台訊號。用鏡頭或區域網路 IP 攝影機掃 QR，並把入場、吃鼠、抓痕放大，以及 `1` 到 `5` 的物件訊號送給主舞台。 |
| `?mode=trans` | 傳輸畫面。只顯示主舞台下半的 3D 合照，並依序讀取共用資料夾裡的報到資料。 |

遠端裝置透過 HTTP 使用 `?mode=reg` 時，Chrome 可能會封鎖鏡頭。請在該裝置開啟 `chrome://flags/#unsafely-treat-insecure-origin-as-secure`，將網站來源（例如 `http://192.168.1.20:5173`，不要加路徑）加入 **Insecure origins treated as secure**，設為 **Enabled** 後重新啟動 Chrome。此設定會降低安全性；正式使用請改用 HTTPS。

預設路線加上 `?stage` 仍會顯示舊的示範老鼠。合照裡的紫衣與海軍藍都用靛藍，以維持五色校服。中央的貓老師不佔老鼠位置。

## 單人與報到

眼睛、嘴巴貼在頭骨上，並跟著頭部傾斜一起動。鼻子貼片與 3D 鼻子沿著吻部。可調五官大小、眼睛高低、鼻孔、胸口與耳朵。隨機配件會配合每隻老鼠的身體與耳朵尺寸。

報到使用男生班剪影，不依臉判斷性別。剪影來自 `polygons_boy.json`。`P` 開關印表機模式。開啟時，每次報到成功會印一張：第一行是「竄 」加上本機時間 `yyyymmdd hhMM` 再加上「 🐈」，第二行是全寬 QR，第三行是 🐭🐁🪤🐀🐹🧀。印表機要能從 `npm run dev` 連到 `192.168.0.191:9100`。老鼠 json 與學生卡 png 都放在同一個資料夾 `.dev-data/transfer/`（可用 `TRANSFER_DIR` 改位置）。印出的 QR 由訊號頁的鏡頭或 IP 攝影機掃到後，主舞台用該資料夾裡的 json 還原那隻老鼠。

在 `?mode=reg` 按 `Ctrl+Z` 可刪除最近一次報到的老鼠；按 `Ctrl+C` 並確認後可清除 `.dev-data` 裡的老鼠資料檔，不會刪除其他檔案。

| 按鍵 | 動作 |
| --- | --- |
| `Q` | 擷取這一位並建立 QR |
| `A` | 將目前臉部貼上全部 30 個班級合照位置（示範用，不逐一建立 QR） |
| `T` | 顯示或隱藏報到面板與鏡頭縮圖 |

## 主舞台

`?mode=stage` 只顯示演出，不再開鏡頭掃碼。下方 3D 合照中的人物會偶爾揮手、點頭、張望或聳肩。原本的按鍵仍然可用：`A` 貼上 QR 或老鼠 id，`D` 加入示範來賓，`E` 吃最近的老鼠，`Q` 抓痕放大；動畫結束後再按 `Q` 可返回舞台，`1` 到 `5` 送出物件，`U` 切換校服，`F` 切換背景效果，`H` 在 30、45、60 FPS 間循環，`+=` / `-` 縮放像素角色，方向鍵移動 3D 鏡頭。HUD 會顯示實際 FPS 與上限。`T` 顯示或隱藏狀態列，預設隱藏。收到的訊號和舞台上的按鍵都會寫進主控台。掃碼、以及同樣的演出動作，也可以由 `?mode=signal` 送出。同一個瀏覽器裡的舞台分頁會直接收到訊號；跨裝置時，在主機執行 `npm run stage:osc` 並允許 TCP `9021` 入站，所有裝置共用同一個 WebSocket。

`?mode=signal` 的每個選項也可以用 OSC 觸發。另開終端機執行 `npm run stage:osc`；訊號頁與舞台共用 `ws://這台電腦:9021`（可用 `?osc=`、`?ws=` 或建置時的 URL 設定改位址）。控制器把 OSC 送到 UDP `9020`（`STAGE_OSC_PORT`）。按下時送大於 0 的值。位址與訊號頁 OSC 清單相同，例如 `/signal/eat`、`/signal/scratch`、`/signal/prop/figure`、`/signal/camera/left`、`/signal/webcam`、`/signal/ipcam`、`/signal/admit`。

掃 QR 會還原已儲存的毛色、五官、臉部與部位調整。快照讀不到就顯示錯誤，不會換成別隻老鼠。QR 的 `m` 也帶著像素鼠的毛色。訊號頁的「Demo guest」可加入一隻沒有真實五官的示範來賓。

未指定對象時，貓會跑向最近的像素鼠，抓起後一起向左移出畫面，再回到原位。訊號頁的「Scratch zoom」會把整個教室畫面慢慢放大到正在跑的黑貓身上，背景同時淡成白色。黑貓一直跑，直到放到最大並停在整個畫面正中，才換成抓痕動畫。然後換成 `src/cat_scratch.gif`。位置與先前相同，貓身轉成黑色，眼睛和抓痕轉成紅色，並放大到撐滿畫面高度。抓下去之後，黑圓才從畫面中央在貓後面擴大，直到蓋滿整個畫面。訊號頁的「Pose」會讓 `src/1-mmpa.png` 的一個小人貼地滑向貓，貓帶走後回到原位。邊緣收成實心像素黑線，半透明灰邊和雜點會去掉。放到背景時與滑進來時一樣高，在桌子之間由左到右排成一列，底部對齊桌腳。新的小人要等旁邊那張桌子下次從右邊滑入才出現。整列往左移出時，最左邊的一個碰到左緣後，其餘的會留到最後一個也離開為止。訊號頁的「Draw」會讓一幅畫貼著地面從右端滑入。畫一碰到貓，貓立刻停下並像抓老鼠一樣帶著畫離開，再回到原位。畫隨後以較小尺寸掛在黑板左上角上方，之後每一幅都接在前一幅的右邊，並一直留在之後每塊黑板的上方。訊號頁的「Build」會讓一個較小的禮物盒貼地滑向貓，貓帶走後回到原位。盒子都放在同一張課桌上：桌面四個、後面三個、再後面兩個、第四排一個。再多的盒子放到這張桌子下面。新的盒子要等這張桌子下次從右邊滑入才出現。訊號頁的「Film」會讓一張海報同樣貼地滑向貓，貓帶走後回到原位。海報隨機掛在黑板和窗戶之間的牆上，可以互相遮住，但每一張都會露出一部分。新的海報要等那段牆下次滑入才出現，之後跟著牆壁一起移動。訊號頁的「Song」會讓 `src/5-msa.png` 的一個音符貼地滑向貓，貓帶走後回到原位。音符隨機貼在看得到的窗玻璃上，整顆都留在窗框裡，後來的可以稍微重疊，但每一顆都會露出一部分。新的音符要等窗戶下次滑入才出現，之後跟著窗戶一起移動。動畫還沒結束時再送小人、畫、禮物、海報或音符，會依序排隊，等這次結束再開始。合照上的那一隻被塗黑並畫上紅色抓痕，之後不再算在場。抓痕開始時播放一段怒喵；若瀏覽器擋住聲音，先按一次畫面或畫面上的「啟用聲音」。音檔摘自 [Cat Wants Food by Oneirophile](https://freesound.org/people/Oneirophile/sounds/120160/)，以 [CC0](https://creativecommons.org/publicdomain/zero/1.0/) 釋出。

有 `BarcodeDetector` 時，訊號頁用它掃碼，否則用 `jsQR`。訊號頁預設用這台裝置的鏡頭，也可以改成區域網路上的 IP 攝影機。位址可以是 `http://`、`https://` 或 `rtsp://`，例如 `rtsp://192.168.1.64/Streaming/Channels/102`，或在網址加上 `?ipcam=`。`rtsp://` 由開發伺服器轉成瀏覽器能顯示的影像。舞台畫面不再開啟鏡頭。合照預設穿校服。像素角色起始 300%，可從訊號頁放大或縮小。訊號頁可以用與舞台相同的按鍵送出訊號。

WebSocket 位址依序為 `?ws=`、建置時的 `VITE_STAGE_WS_URL`、否則使用頁面主機名稱的 TCP `9021`（本機網址會連到 `localhost`）。舞台訊號與 OSC 轉換後的指令共用這個 WebSocket。JSON 文字的 `type` 可以是 `admit`、`catEat`、`catSweep`、`restartAll`、`scratch`、`prop`、`uniform`、`spriteScale`、`camera`、`fps` 或 `backgroundEffects`。`fps` 循環 FPS 上限，`backgroundEffects` 切換背景效果。`admit` 的 `raw` 是 QR 內容，省略就是示範來賓。`prop` 的 `kind` 是 `figure`、`drawing`、`box`、`poster` 或 `note`。父頁面也可以送同一份內容：

```js
window.postMessage({ channel: 'stage-ws', payload: { type: 'catEat' } }, '*');
```

```bash
npm run stage:osc
```

在提供網站的主機執行此命令並保持執行。它會同時接收舞台訊號與 OSC：WebSocket 監聽 TCP `9021`，OSC 控制器使用 UDP `9020`。跨裝置使用時，允許 TCP `9021` 入站；其他裝置會自動連到頁面主機名稱的 `9021`，或用 `?ws=ws://主機區域網路IP:9021` 指定伺服器。若網站使用 HTTPS，WebSocket 伺服器也必須提供 `wss://`。按 Enter 會廣播吃掉最近的一隻；輸入 `id=老鼠ID` 再按 Enter 則指定對象。在主機的另一個終端機執行 `npm run dev`，開啟 `http://localhost:5173/?mode=stage`。

`npm run dev` 與 `npm run preview` 會把老鼠 json 與 png 放在被忽略的 `.dev-data/transfer/`，同一來源的瀏覽器可以再讀回。上線後由 Netlify Function `/api/mouse` 存取 Blobs。

# Reference

## Materials
- Pixel Mouse https://ikoiku.itch.io/16-x-16-pixel-art-character-mouse
- Pixel Cat https://opengameart.org/content/pixel-cat-0
- https://www.spritefusion.com/pixel-snapper
- DVC prize https://www.shutterstock.com/image-vector/pixel-art-framed-paintings-pixelated-picture-2302164693
- MMPA prize https://www.pinterest.com/pin/585468020353537367/
- MMPA prize 2 https://scontent-hkg1-1.xx.fbcdn.net/v/t39.30808-6/626656378_1327787186051179_8460426986218662513_n.jpg?stp=dst-jpg_tt6&cstp=mx761x736&ctp=p526x296&_nc_cat=106&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=aa7b47&_nc_ohc=akXc5fh_6PsQ7kNvwG1TaNP&_nc_oc=AdpCtNWU282DLBuQ4HinyFNjXt2O7th4-xZB2QZepZaVkjUJLBkPuxe05Z1-inKhd0I&_nc_zt=23&_nc_ht=scontent-hkg1-1.xx&_nc_gid=9fxfJRinW0AYKvik1mybVA&_nc_ss=7b289&oh=00_AQQufhVHb4YPzNEALpu7gvPveWcivIw06kJKxui2nEVjhQ&oe=6B01C47B
- ESS https://www.istockphoto.com/hk/%E5%90%91%E9%87%8F/gift-boxes-with-red-ribbons-pixel-art-set-present-packages-with-bows-collection-gm1419908047-466106982
- FDA https://www.reddit.com/r/PixelArt/comments/15vy7ij/a_bunch_of_tiny_movie_posters_based_on_a_mixture/
- FDA 2 https://itch.io/game-assets/tag-movie-posters/tag-pixel-art

## Modes

| URL | Mode |
| --- | --- |
| `/` (default) | Single-player webcam crowd |
| `?mode=uniform` | Default webcam crowd with mice in five school-uniform colors |
| `?mode=pixel` | Pixel cat chase (demo loop) |
| `?mode=stage` | **Main stage** — view only. Pixel chase and class photo follow signals. |
| `?mode=signal` | **Stage signals** — scan QR codes from the webcam or a local IP camera and send every stage event. OSC can trigger the same options |
| `?mode=reg` | **Registration** — capture participants into the class photo and print their QR codes |
| `?mode=trans` | **Transfer display** — the stage class photo only, filled from the shared registration folder |

Legacy demo mice on the default route still work with `?stage` (without `mode=stage`).

Uniform mode uses textured, short-sleeved shirts with the school badge on the left sleeve, and dark trousers. Shirts follow the torso and sleeves follow the arms; the chest-tuning controls still adjust the underlying belly patch rather than displacing the clothing.

## Registration (`?mode=reg`)

When using registration on a remote device over HTTP, Chrome may block webcam access. On that device, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add the site's origin (for example, `http://192.168.1.20:5173`, without a path) under **Insecure origins treated as secure**, set it to **Enabled**, and relaunch Chrome. This weakens security; use HTTPS for regular or production use.

Registration starts with the black-cat teacher alone in the class scene. Each capture adds one student from the boys' class-photo template and replaces the student's face with the captured portrait. Face appearance is not used to infer gender. Student silhouettes are clipped to the manual polygon annotations in `polygons_boy.json`. Press **Q** to capture, **A** to place the current webcam face into all 30 silhouette slots (visual demo; no per-slot QR), and **T** to toggle the registration panel and webcam thumbnail. Press **P** to toggle printer mode. While it is on, each successful registration prints a slip on the LAN printer (`192.168.0.191:9100`, override with `PRINTER_HOST`): line 1 is `竄 ` plus the local time as `yyyymmdd hhMM` plus ` 🐈`, line 2 is a full-width QR code, and line 3 is 🐭🐁🪤🐀🐹🧀. The dev server must be running so the page can reach that port. The existing mouse-saving and printable QR-card flow is preserved. Each successful capture writes `<id>.json` (portrait plus mouse traits, face patches, and tuning) and `<id>.png` (the front-facing student card) into one folder, `.dev-data/transfer/` (override with `TRANSFER_DIR`, including a network share). The printed QR is scanned by `?mode=signal` with the webcam or an IP camera. `?mode=stage` then admits that mouse from the JSON in that folder. Point `?mode=trans` at the same dev server, or at a server using that same folder, to show those mice.

Multiple registration devices synchronize the class-photo portraits, participant count, and QR cards by polling the same shared transfer folder every 1.5 seconds. Open each device against the same server/folder; registrations made against separate local folders will not synchronize.

In registration mode, **Ctrl+Z** removes the most recently captured participant and its saved files. **Ctrl+C** asks for confirmation, then removes all mouse JSON/PNG files from the local transfer and legacy mouse folders while preserving unrelated files.

## Transfer display (`?mode=trans`)

This is the bottom half of the main stage: the 3D class photo, full screen, with no pixel chase, QR scanner, or cat-eat control. It reads `.dev-data/transfer/` about once a second and adds each new registration in capture order, up to 30. `T` hides the status line. `U` toggles uniforms. Arrow keys frame the photo; hold Space with Up or Down to pan vertically. `-` / `=` change the field of view, and `[` / `]` change the row rise. `S` writes the current perspective to `src/transfer-perspective.json`, which is loaded again the next time the page opens. Restart `npm run dev` after changing `TRANSFER_DIR`.

## Main stage (`?mode=stage`)

This page does not open a camera. The 3D figures in the lower class photo occasionally wave, nod, look around, or shrug. The previous keys still work: `A` pastes a QR or mouse id, `D` admits a demo guest, `E` eats the closest mouse, `Q` plays the scratch zoom (press `Q` again after the animation to return to the stage), `1` through `5` bring on a prop, `U` toggles uniforms, `F` toggles background effects, `H` cycles the FPS cap through 30, 45, and 60, `+=` / `-` resize the pixel cast, and the arrow keys move the 3D camera (`Space` with Up or Down pans vertically). The HUD shows actual FPS and the cap. Press `T` to show or hide the status line; it starts hidden. Each received signal and each stage key is logged in the console. `?mode=signal` can scan QR codes and send the same events. Stage tabs in the same browser receive those signals directly. For a second device, run `npm run stage:osc` on the host and connect the pages to its shared WebSocket.

Split screen: **pixel chase** on top, **class photo** (3D mice) on the bottom. Stage pixel mice wander slowly and face away from the cat; the cat smoothly varies its run speed. The standalone pixel mode keeps its existing movement. The class photo shows up to 30 standing 3D mice center-out in three stepped rows of ten; they wear uniforms by default. Row rise stays at `0.8` and camera height starts at `1.8`. The signal page uses the same keys to emit those signals: `A` focuses the id field, `D` admits a demo guest, `E` eats, `Q` scratches, `1` through `5` bring on props, `U` toggles uniforms, `F` toggles background effects, `H` cycles FPS, `+=` / `-` resize the pixel cast, the arrow keys move the camera, and `T` toggles the stage HUD.

Shirt colors follow the corresponding front, middle, and back positions in `br_class.jpg`. The photo's purple and navy shirts both use indigo to retain the five-color uniform palette; the central cat teacher has no mouse slot.

1. The signal page scans participant QR codes (uses native `BarcodeDetector` when available and a `jsQR` fallback otherwise) and sends an `admit` signal. A pasted QR link or mouse id does the same. **Webcam** uses this device. **IP camera** uses an `http://`, `https://`, or `rtsp://` stream on the local network, such as `rtsp://192.168.1.64/Streaming/Channels/102`. An `rtsp://` address is converted by the dev server into frames the browser can show. The same address can be passed as `?ipcam=`. The choice is remembered in this browser.
2. Each QR admit restores the original 3D mouse from the matching JSON in `.dev-data/transfer/` (traits, captured eyes/nose/mouth, face tuning, and part tuning). If that record cannot be loaded, the stage reports an error instead of showing a different mouse. The `m` value also carries the saved fur color for the pixel mouse. A registered mouse stands in the same class-photo seat as in `?mode=trans` (registration order), even when scanned out of order. The 3D mouse walks in from the right, climbs onto that seat, and only then does its pixel mouse slide in from the right, locked to the scrolling floor, until it reaches its place. Admits line up and enter one at a time. Demo guest adds a placeholder face in a seat that is not reserved for a registration.
3. **Eat closest** on the signal page (or a `catEat` message without an ID) targets the closest active pixel mouse. The cat runs to it, then uses the second row of `cat-run-actions.png` while crawling away; the mouse stays on the floor as both drift left with the scrolling background until off-screen, and the cat returns to its starting position. Its 3D figure stays in the photo blacked out with randomized red claw slashes drawn diagonally downward in either direction and is no longer counted as active. Messages with an ID target that specific mouse. **Clear the stage** sends `catSweep`. **Scratch zoom** plays the fullscreen cat scratch. **Pose**, **Draw**, **Build**, **Film**, and **Song** send those slide-and-catch props.

An angry meow plays when the scratches start. Browsers may require a click or keypress before sound is allowed; if blocked, use the on-screen **Enable sound** button for subsequent scratches. The recording is an excerpt of [Cat Wants Food by Oneirophile](https://freesound.org/people/Oneirophile/sounds/120160/), shared under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).

The stage requests a high-performance WebGL device when available. Hardware acceleration depends on browser and driver settings. When native QR scanning is unavailable, supported browsers decode camera frames in a worker to keep the animation responsive; other browsers use the main-thread fallback.

`npm run dev` and `npm run preview` provide a local `/api/mouse` backed by the JSON files in the ignored `.dev-data/transfer/` folder, so saved QR snapshots can be retrieved across browser sessions using the same server origin.

### Signals

The stage keeps its keyboard controls and also follows `?mode=signal`. That page scans QR codes and sends every show event. Same-browser stage tabs hear the signal even when the WebSocket server is down. A running `npm run stage:osc` relays stage messages and OSC-triggered actions to connected clients through the shared WebSocket. Received signals and stage key presses are logged in the stage console.

The signal page shows red/green connection dots for DVC, ESS, FDA, MMPA, and MSA. Each station connects to the same stage WebSocket and registers once with `{"type":"station","station":"DVC"}`, substituting its own uppercase name. The relay broadcasts `{"type":"station","station":"DVC","connected":true}` on registration and the same message with `connected:false` when its last socket closes. The signal page updates that station's dot on each message. A station stays connected while at least one registered socket is open. Status is unknown when the signal page cannot reach the relay; it reconnects automatically.

| Signal | Action |
| --- | --- |
| Scanned QR or pasted id | Admit that participant |
| Demo guest | Admit a placeholder face |
| Eat closest | Eat the closest active mouse; its 3D figure remains blacked out with red scratches |
| Clear the stage | Eat every mouse still alive, one after another |
| Scratch zoom | Zoom the classroom into the running black cat while the background fades to white. The cat keeps running until it is largest and centered, and only then is it replaced by the scratch animation. That animation is `src/cat_scratch.gif`, placed and colored as before: the cat is black, the eyes and scratches are red, and it grows until it fills the screen height. The black circle starts only after the scratch, then grows from the center behind the cat until it covers the screen. |
| Restart | Clear the stage roster and pixel mice |
| Pose / Draw / Build / Film / Song | Slide that prop in from the right. The cat carries it off, then it is placed: figures between the desks, drawings above the blackboard, gifts on one desk, posters on the wall, notes on the window. |
| Uniforms | Toggle uniforms on all 3D figures, including later admissions |
| Larger cat / Smaller cat | Enlarge / shrink the pixel cat and mice (starts at 300%) |
| Camera buttons | Move the 3D camera left/right, closer/farther, and up/down |

### OSC

`npm run stage:osc` listens on UDP port `9020` and the shared stage/OSC WebSocket port `9021`. OSC messages are forwarded to `?mode=signal`, which runs the matching option and sends the usual stage signal through that same WebSocket. In turn, supported WebSocket stage signals are encoded as OSC and sent to `127.0.0.1:9040` by default. Set `STAGE_OSC_OUT_HOST` and `STAGE_OSC_OUT_PORT` to choose another OSC receiver; keep the output port distinct from this relay's input port to avoid a feedback loop. Outbound addresses and arguments follow the table below. A button press is sent as `1`, then `0`, so the next click is a new press. A press is any value above 0. The page lists every address under **OSC**. Ports can be changed with `STAGE_OSC_PORT`, `STAGE_OSC_WS_PORT`, and `STAGE_OSC_OUT_PORT`; the destination host is set with `STAGE_OSC_OUT_HOST`. The signal page address is `?osc=`, then build-time `VITE_STAGE_OSC_URL`, then `ws://<page-host>:9021`; the stage page can override with `?ws=` or `VITE_STAGE_WS_URL`. These ports stay clear of Central’s UDP `9000` and OscForward’s UDP `9001` on the same PC.

| Address | Option |
| --- | --- |
| `/signal/demo` | Demo guest |
| `/signal/eat` | Eat closest. A string eats that mouse id |
| `/signal/sweep` | Clear the stage |
| `/signal/scratch` | Scratch zoom |
| `/signal/restart` | Restart |
| `/signal/prop/figure` `/signal/prop/drawing` `/signal/prop/box` `/signal/prop/poster` `/signal/prop/note` | Bring on that prop. `/signal/1` through `/signal/5` and `/signal/gift` also work |
| `/signal/uniform` | Uniforms |
| `/signal/larger` `/signal/smaller` | Pixel size by 0.1. `/signal/scale` uses the number sent |
| `/signal/camera/left` `/signal/camera/right` `/signal/camera/closer` `/signal/camera/farther` `/signal/camera/up` `/signal/camera/down` | One on-screen camera step (0.08) |
| `/signal/camera/move` | Move by the three numbers `x`, `depth`, `height` |
| `/signal/webcam` | Webcam |
| `/signal/ipcam` | IP camera. A string sets the address |
| `/signal/admit` | Admit the QR or mouse id string |
| `/signal/hud` | Stage HUD |

### WebSocket URL

Resolved in order:

1. Query `?ws=wss://example.com/stage`
2. Build-time `VITE_STAGE_WS_URL`
3. The host in the page address, port `9021`. `http://192.168.99.31:5173/?mode=stage` uses `ws://192.168.99.31:9021`. `localhost` and `127.0.0.1` stay on `ws://localhost:9021`.

### Message schema

JSON text frames only.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `type` | string | yes | `admit` adds the QR in `raw`, or a demo guest when `raw` is omitted. `catEat` eats one mouse. `catSweep` eats every mouse still alive, one after another. `restartAll` clears the stage. `scratch` plays the cat zoom. `prop` brings on `kind`: `figure`, `drawing`, `box`, `poster`, or `note`. `uniform` toggles uniforms. `spriteScale` changes pixel size by `delta`. `camera` moves the 3D camera by `move`: `[x, depth, height]`. `fps` cycles the stage FPS cap; `backgroundEffects` toggles background animations. A `catEat` or prop that arrives during a chase waits in a queue. |
| `id` | string | no | On `catEat`, the mouse to remove. Omit it and the closest mouse is taken. |
| `raw` | string | no | QR text or mouse id for `admit`. |
| `signalId` | string | no | Duplicate deliveries of the same signal are ignored. |

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

### Shared stage/OSC relay

```bash
npm install
npm run stage:osc
```

Run this on the device hosting the site, and keep it running. It listens on all network interfaces at TCP port `9021` for the shared stage/OSC WebSocket and UDP port `9020` for OSC input. Outbound OSC is sent to `127.0.0.1:9040` by default; configure `STAGE_OSC_OUT_HOST` and `STAGE_OSC_OUT_PORT` for the receiving device. Allow inbound TCP `9021` through that device's firewall for remote pages. Remote pages use the page host's address automatically, or can set `?ws=ws://<server-LAN-IP>:9021` to choose another server. If the site is hosted on a static service such as Netlify, this relay must be hosted separately and specified with `?ws=`; HTTPS pages require a secure `wss://` endpoint.

In another terminal on the same device, start the site:

```bash
npm run dev
# open http://localhost:5173/?mode=stage
```

Open the site from another device using the host device's LAN address. Press **Enter** in the relay terminal to broadcast eat-next; type `id=MOUSE_ID` and Enter for a targeted eat.

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
3. In main stage, the display only shows the show. `?mode=signal` scans each QR and sends the admit, eat, scratch, and prop signals. The pixel cat approaches and eats a mouse while its 3D model is scratched out of the photo.
