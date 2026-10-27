const canvas = document.querySelector('#view');
const ctx = canvas.getContext('2d');
const BASE_WIDTH = 320;
const CAT_FRAME_SIZE = 66;
const CAT_FRAME_COUNT = 5;
const CAT_FOOT_ROW = 50;
const catSource = new Image();
let catRunSheet = null;
const MOUSE_FRAME_SIZE = 32;
const MOUSE_FRAME_COUNT = 6;
const MOUSE_FOOT_ROW = 20;
const mouseSprite = new Image();
mouseSprite.src = new URL('./MouseRun.png', import.meta.url).href;
const MOUSE_COUNT = 20;
const mouseOffsets = new Float32Array(MOUSE_COUNT * 2);
for (let i = 0; i < MOUSE_COUNT; i += 1) {
  mouseOffsets[i * 2] = Math.random();
  mouseOffsets[i * 2 + 1] = Math.random();
}
catSource.addEventListener('load', prepareCatSprite, { once: true });
catSource.src = new URL('./cat-run.png', import.meta.url).href;

let width = BASE_WIDTH;
let height = 200;
let worldScale = 1;
let lastFrame = performance.now();
let scroll = 0;

document.title = 'Pixel Cat Chase';
document.body.classList.add('pixel-mode');
canvas.classList.add('pixelated');

function px(value) {
  return Math.round(value * worldScale);
}

function resize() {
  width = Math.max(80, Math.round(window.innerWidth / 4));
  height = Math.max(60, Math.round(window.innerHeight / 4));
  worldScale = width / BASE_WIDTH;
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;
}

function wrap(value, period) {
  return ((value % period) + period) % period;
}

function prepareCatSprite() {
  const sheet = document.createElement('canvas');
  sheet.width = catSource.naturalWidth;
  sheet.height = catSource.naturalHeight;
  const sheetContext = sheet.getContext('2d', { willReadFrequently: true });
  sheetContext.drawImage(catSource, 0, 0);
  const image = sheetContext.getImageData(0, 0, sheet.width, sheet.height);
  const { data } = image;
  for (let y = 0; y < sheet.height; y += 1) {
    for (let x = 0; x < sheet.width; x += 1) {
      const i = (y * sheet.width + x) * 4;
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      if (red < 20 && green > 120 && blue > 180) {
        data[i + 3] = 0;
      } else if (green > 175 && red < 180 && blue < 180) {
        data[i] = 220;
        data[i + 1] = 62;
        data[i + 2] = 76;
      } else if (red > 140 && green > 70 && red > green * 1.25 && green > blue * 1.2 && blue < 130) {
        const localX = x % CAT_FRAME_SIZE;
        const whiteFur = 0;
        // const whiteFur = (localX < 24 && y > 28 && y < 41)
        //   || (localX >= 18 && localX <= 44 && y > 40)
        //   || (y > 48 && localX > 8 && localX < 52);
        const color = whiteFur ? [243, 244, 242] : red < 225 ? [78, 85, 96] : [23, 25, 35];
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
      } else if (red < 80 && green > 80 && blue > 80) {
        data[i] = 40;
        data[i + 1] = 44;
        data[i + 2] = 52;
      }
    }
  }
  sheetContext.putImageData(image, 0, 0);
  catRunSheet = sheet;
}



function drawDesk(x, y, deskWidth) {
  const one = Math.max(1, px(1));
  ctx.fillStyle = '#684332';
  ctx.fillRect(x, y + px(4), deskWidth, px(5));
  ctx.fillStyle = '#a86e42';
  ctx.fillRect(x, y, deskWidth, px(5));
  ctx.fillStyle = '#e0aa62';
  ctx.fillRect(x, y, deskWidth, one);
  ctx.fillStyle = '#795039';
  ctx.fillRect(x + px(5), y + px(8), px(3), px(11));
  ctx.fillRect(x + deskWidth - px(8), y + px(8), px(3), px(11));
}

function drawClassroomWall(groundY) {
  ctx.fillStyle = '#e8d9ba';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#bda982';
  ctx.fillRect(0, 0, width, px(7));
  ctx.fillStyle = '#f5e9cd';
  ctx.fillRect(0, px(7), width, px(2));

  const boardX = px(36);
  const boardY = Math.max(px(24), Math.floor(groundY * 0.2));
  const boardWidth = px(144);
  const boardHeight = px(58);
  ctx.fillStyle = '#79553b';
  ctx.fillRect(boardX - px(3), boardY - px(3), boardWidth + px(6), boardHeight + px(6));
  ctx.fillStyle = '#345c50';
  ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
  ctx.fillStyle = '#d7e6c7';
  ctx.fillRect(boardX + px(12), boardY + px(14), px(28), Math.max(1, px(2)));
  ctx.fillRect(boardX + px(12), boardY + px(22), px(18), Math.max(1, px(2)));
  ctx.fillRect(boardX + px(54), boardY + px(15), px(2), px(19));
  ctx.fillRect(boardX + px(48), boardY + px(23), px(14), Math.max(1, px(2)));
  ctx.fillRect(boardX + px(94), boardY + px(18), px(30), Math.max(1, px(2)));
  ctx.fillStyle = '#e1b16e';
  ctx.fillRect(boardX + px(3), boardY + boardHeight, boardWidth - px(6), Math.max(1, px(3)));

  const windowX = width - px(82);
  const windowY = boardY;
  const windowWidth = px(70);
  const windowHeight = px(58);
  ctx.fillStyle = '#79553b';
  ctx.fillRect(windowX - px(3), windowY - px(3), windowWidth + px(6), windowHeight + px(6));
  ctx.fillStyle = '#93d8e6';
  ctx.fillRect(windowX, windowY, windowWidth, windowHeight);
  ctx.fillStyle = '#f4e6c8';
  ctx.fillRect(windowX + Math.floor(windowWidth / 2) - onePixel(), windowY, px(3), windowHeight);
  ctx.fillRect(windowX, windowY + Math.floor(windowHeight / 2), windowWidth, px(3));
  ctx.fillStyle = '#b5e9ec';
  ctx.fillRect(windowX + px(5), windowY + px(5), px(16), px(12));

  const clockX = px(13);
  const clockY = boardY + px(5);
  ctx.fillStyle = '#79553b';
  ctx.fillRect(clockX, clockY, px(15), px(15));
  ctx.fillStyle = '#f5e9cd';
  ctx.fillRect(clockX + px(2), clockY + px(2), px(11), px(11));
  ctx.fillStyle = '#594734';
  ctx.fillRect(clockX + px(7), clockY + px(4), Math.max(1, px(1)), px(4));
  ctx.fillRect(clockX + px(7), clockY + px(7), px(4), Math.max(1, px(1)));
}

function drawClassroom(groundY) {
  const wallOffset = px(scroll/2) % width;
  for (let x = -wallOffset; x < width; x += width) {
    ctx.save();
    ctx.translate(x, 0);
    drawClassroomWall(groundY);
    ctx.restore();
  }
  const cabinetY = groundY - px(27);
  ctx.fillStyle = '#936541';
  ctx.fillRect(0, cabinetY, width, px(23));
  ctx.fillStyle = '#c48b53';
  ctx.fillRect(0, cabinetY, width, Math.max(1, px(2)));
  const cabinetStride = Math.max(1, px(48));
  const cabinetOffset = px(scroll) % cabinetStride;
  for (let x = px(32) - cabinetOffset; x < width; x += cabinetStride) {
    ctx.fillStyle = '#6e4b38';
    ctx.fillRect(x, cabinetY + px(3), Math.max(1, px(2)), px(18));
    ctx.fillStyle = '#d2a36b';
    ctx.fillRect(x + px(4), cabinetY + px(10), Math.max(1, px(3)), Math.max(1, px(1)));
  }

  for (let i = 0; i < 3; i += 1) {
    const deskWidth = 42 + (i % 2) * 8;
    const x = Math.floor(px(wrap(i * 126 - scroll * 0.82, BASE_WIDTH + deskWidth) - deskWidth));
    const y = groundY - Math.max(px(34), Math.floor(height * 0.18)) - 3 //(i % 1) * Math.max(px(14), Math.floor(height * 0.08));
    drawDesk(x, y, px(deskWidth));
  }

  ctx.fillStyle = '#96623f';
  ctx.fillRect(0, groundY, width, height - groundY);
  ctx.fillStyle = '#d5a266';
  ctx.fillRect(0, groundY, width, Math.max(1, px(2)));
  const tileWidth = Math.max(px(32), 2);
  const tileOffset = px(scroll) % (tileWidth * 2);
  for (let i = 0, x = -tileOffset; x < width; i += 1, x += tileWidth) {
    ctx.fillStyle = i % 2 ? '#a16a43' : '#8c593a';
    ctx.fillRect(x, groundY + px(2), tileWidth - 1, height - groundY - px(2));
    ctx.fillStyle = '#c18a55';
    ctx.fillRect(x + px(5), groundY + px(8), px(10), Math.max(1, px(1)));
    ctx.fillRect(x + px(20), groundY + px(19), px(7), Math.max(1, px(1)));
  }
}

function onePixel() {
  return Math.max(1, px(1));
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  scroll += dt * 64;
  const groundY = Math.floor(height * 0.82);
  drawClassroom(groundY);

  const catFrame = Math.floor(now / 110) % CAT_FRAME_COUNT;
  const catSize = width < 150 ? 40 : width < 240 ? 64 : 88;
  const catX = px(18);
  const mouseStart = Math.max(catX + catSize + px(5), Math.floor(width * 0.35));
  const catY = groundY - Math.ceil((CAT_FOOT_ROW * catSize) / CAT_FRAME_SIZE);
  if (catRunSheet) {
    ctx.save();
    ctx.translate(catX + catSize, catY);
    ctx.scale(-1, 1);
    ctx.drawImage(catRunSheet, catFrame * CAT_FRAME_SIZE, 0, CAT_FRAME_SIZE, CAT_FRAME_SIZE, 0, 0, catSize, catSize);
    ctx.restore();
  }
  const mouseBaseSize = 30;
  const mouseSpreadX = Math.max(1, width - mouseStart - mouseBaseSize - 2);
  const mouseSpreadY = px(16);
  if (mouseSprite.complete && mouseSprite.naturalWidth === MOUSE_FRAME_SIZE && mouseSprite.naturalHeight === MOUSE_FRAME_SIZE * MOUSE_FRAME_COUNT) {
    for (let i = 0; i < MOUSE_COUNT; i += 1) {
      const size = mouseBaseSize + (i % 3);
      const mouseFrame = Math.floor(now / 105 + i * 1.5) % MOUSE_FRAME_COUNT;
      const x = mouseStart + Math.floor(mouseOffsets[i * 2] * mouseSpreadX);
      const yOffset = Math.floor(mouseOffsets[i * 2 + 1] * mouseSpreadY);
      const y = groundY - Math.ceil((MOUSE_FOOT_ROW * size) / MOUSE_FRAME_SIZE) - yOffset;
      ctx.drawImage(mouseSprite, 0, mouseFrame * MOUSE_FRAME_SIZE, MOUSE_FRAME_SIZE, MOUSE_FRAME_SIZE, x, y, size, size);
    }
  }

  requestAnimationFrame(frame);
}

resize();
window.addEventListener('resize', resize);
requestAnimationFrame(frame);
