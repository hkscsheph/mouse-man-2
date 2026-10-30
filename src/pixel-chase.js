/**
 * Scrollable pixel classroom with running/catching cat poses and dynamic mouse sprites.
 * Used by standalone pixel mode and main-stage mode.
 */

const BASE_WIDTH = 320;
const CAT_FRAME_SIZE = 66;
const CAT_FRAME_COUNT = 5;
const CAT_FOOT_ROW = 50;
const MOUSE_FRAME_SIZE = 32;
const MOUSE_FRAME_COUNT = 6;
const MOUSE_FOOT_ROW = 20;
const MIN_SPRITE_SCALE = 0.5;
const MAX_SPRITE_SCALE = 5;
const CAT_RETURN_SPEED = 600;

function wrap(value, period) {
  return ((value % period) + period) % period;
}

function onePixel(pxFn) {
  return Math.max(1, pxFn(1));
}

export function createPixelChase(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  let width = BASE_WIDTH;
  let height = 200;
  let worldScale = 1;
  const requestedSpriteScale = Number(options.initialSpriteScale ?? 1);
  let spriteScale = Number.isFinite(requestedSpriteScale)
    ? Math.round(Math.min(MAX_SPRITE_SCALE, Math.max(MIN_SPRITE_SCALE, requestedSpriteScale)) * 10) / 10
    : 1;
  const mouseWanderSpeed = Math.max(0, Number(options.mouseWanderSpeed) || 0);
  const mouseWanderRange = Math.max(0, Number(options.mouseWanderRange) || 0);
  const mouseRunFrameDuration = Math.max(1, Number(options.mouseRunFrameDuration) || 105);
  const catSpeedVariation = Math.min(0.5, Math.max(0, Number(options.catSpeedVariation) || 0));
  let lastFrame = performance.now();
  let scroll = 0;
  let catRunTime = 0;
  let running = true;
  let raf = 0;

  const catSource = new Image();
  let catRunSheet = null;
  let catFrameWidth = CAT_FRAME_SIZE;
  let catFrameHeight = CAT_FRAME_SIZE;
  const catCatchRow = 1;
  let catFootRows = [CAT_FRAME_SIZE * (CAT_FOOT_ROW / CAT_FRAME_SIZE)];
  const mouseSprite = new Image();
  const tintedMouseSprites = new Map();
  mouseSprite.src = new URL('./MouseRun.png', import.meta.url).href;

  /** @type {{ id: string, spread: number, ySpread: number, sizeBias: number, skinColor: string | null }[]} */
  const mice = [];

  let catBaseX = 18;
  let catSlide = 0;
  /** @type {null | { id: string, fromSlide: number, toSlide: number, t: number, dur: number, phase: 'run' | 'grab' | 'out' | 'return', resolve?: (value: boolean) => void, onGrab?: (id: string) => void, floorMouse: { skinColor: string | null, size: number, frame: number, x: number } | null, grabScroll: number, outScroll: number, catchTime: number }} */
  let catChase = null;

  const initialCount = options.initialCount ?? 0;
  const seedRandom = options.seedRandom ?? Math.random;

  function px(value) {
    return Math.round(value * worldScale);
  }

  function getMouseSprite(skinColor) {
    const color = typeof skinColor === 'string'
      ? skinColor
      : skinColor && typeof skinColor.getHexString === 'function'
        ? `#${skinColor.getHexString()}`
        : '';
    const match = /^#?([0-9a-f]{6})$/i.exec(color);
    if (!match || !mouseSprite.complete || !mouseSprite.naturalWidth) return mouseSprite;
    const key = match[1].toLowerCase();
    if (tintedMouseSprites.has(key)) return tintedMouseSprites.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = mouseSprite.naturalWidth;
    canvas.height = mouseSprite.naturalHeight;
    const spriteContext = canvas.getContext('2d', { willReadFrequently: true });
    spriteContext.drawImage(mouseSprite, 0, 0);
    const image = spriteContext.getImageData(0, 0, canvas.width, canvas.height);
    const red = parseInt(key.slice(0, 2), 16);
    const green = parseInt(key.slice(2, 4), 16);
    const blue = parseInt(key.slice(4, 6), 16);
    for (let i = 0; i < image.data.length; i += 4) {
      const sourceRed = image.data[i];
      const sourceGreen = image.data[i + 1];
      const sourceBlue = image.data[i + 2];
      if (
        sourceRed > 180 &&
        sourceGreen > 70 &&
        sourceRed > sourceGreen * 1.25 &&
        sourceGreen > sourceBlue * 1.2 &&
        sourceBlue < 130
      ) {
        const shade = sourceRed > 225 ? 1.18 : 1;
        image.data[i] = Math.min(255, Math.round(red * shade));
        image.data[i + 1] = Math.min(255, Math.round(green * shade));
        image.data[i + 2] = Math.min(255, Math.round(blue * shade));
      }
    }
    spriteContext.putImageData(image, 0, 0);
    tintedMouseSprites.set(key, canvas);
    return canvas;
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
          const color = red < 225 ? [78, 85, 96] : [23, 25, 35];
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
    catFrameWidth = sheet.width / CAT_FRAME_COUNT;
    catFrameHeight = sheet.height / 2;
    catFootRows = Array.from({ length: 2 }, (_, row) => {
      const firstY = Math.floor(row * catFrameHeight);
      const lastY = Math.floor((row + 1) * catFrameHeight);
      let bottom = -1;
      for (let y = firstY; y < lastY; y += 1) {
        for (let x = 0; x < sheet.width; x += 1) {
          if (data[(y * sheet.width + x) * 4 + 3] > 0) bottom = y - firstY;
        }
      }
      return bottom + 1;
    });
  }

  catSource.addEventListener('load', prepareCatSprite, { once: true });
  catSource.src = new URL('./cat-run-actions.png', import.meta.url).href;

  function resize() {
    if (typeof options.getSize === 'function') {
      const size = options.getSize();
      width = Math.max(80, Math.round(size.width));
      height = Math.max(60, Math.round(size.height));
    } else {
      width = Math.max(80, Math.round((options.width ?? window.innerWidth) / (options.widthDivisor ?? 4)));
      height = Math.max(
        60,
        Math.round((options.height ?? window.innerHeight) / (options.heightDivisor ?? 4)),
      );
    }
    worldScale = width / BASE_WIDTH;
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = false;
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
    ctx.fillRect(windowX + Math.floor(windowWidth / 2) - onePixel(px), windowY, px(3), windowHeight);
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
    const wallOffset = px(scroll / 2) % width;
    for (let x = -wallOffset; x < width; x += width) {
      ctx.save();
      ctx.translate(x, 0);
      drawClassroomWall(groundY);
      ctx.restore();
    }
    const cabinetY = groundY - px(20);
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
      const y = groundY - Math.max(px(34), Math.floor(height * 0.18)) - 3;
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

  function mouseLayout(groundY, now) {
    const catSize = Math.round((width < 150 ? 40 : width < 240 ? 64 : 88) * spriteScale);
    const catX = px(catBaseX) + px(catSlide);
    const mouseStart = Math.max(px(catBaseX) + catSize + px(5), Math.floor(width * 0.35));
    const mouseBaseSize = Math.round(30 * spriteScale);
    const mouseSpreadX = Math.max(1, width - mouseStart - mouseBaseSize - 2);
    const mouseSpreadY = px(16);
    return { catSize, catX, mouseStart, mouseBaseSize, mouseSpreadX, mouseSpreadY, groundY, now };
  }

  function mousePosition(entry, layout) {
    const size = layout.mouseBaseSize + Math.round(entry.sizeBias * spriteScale);
    const movePhase = (layout.now / 1000) * mouseWanderSpeed + entry.spread * Math.PI * 2;
    const baseX = layout.mouseStart + Math.floor(entry.spread * layout.mouseSpreadX);
    const wander = Math.sin(movePhase) * mouseWanderRange * spriteScale;
    const x = Math.max(
      layout.mouseStart,
      Math.min(layout.mouseStart + layout.mouseSpreadX, Math.round(baseX + wander)),
    );
    const yOffset = Math.floor(entry.ySpread * layout.mouseSpreadY)
      + Math.round(Math.sin(movePhase * 1.6) * spriteScale);
    const y = layout.groundY - Math.ceil((MOUSE_FOOT_ROW * size) / MOUSE_FRAME_SIZE) - yOffset;
    return { x, y, size };
  }

  function indexOfMouse(id) {
    return mice.findIndex((m) => m.id === id);
  }

  function addMouse(id, skinColor = null) {
    if (indexOfMouse(id) >= 0) return false;
    mice.push({
      id,
      spread: seedRandom(),
      ySpread: seedRandom(),
      sizeBias: mice.length % 3,
      skinColor,
    });
    return true;
  }

  function removeMouse(id) {
    const idx = indexOfMouse(id);
    if (idx < 0) return false;
    mice.splice(idx, 1);
    return true;
  }

  function listMouseIds() {
    return mice.map((m) => m.id);
  }

  function closestMouseId() {
    if (!mice.length) return null;
    const layout = mouseLayout(Math.floor(height * 0.82), performance.now());
    const catY = layout.groundY - Math.ceil((CAT_FOOT_ROW * layout.catSize) / CAT_FRAME_SIZE);
    const catCenterX = layout.catX + layout.catSize / 2;
    const catCenterY = catY + layout.catSize / 2;
    let closestId = null;
    let closestDistance = Infinity;
    for (let i = 0; i < mice.length; i += 1) {
      const position = mousePosition(mice[i], layout);
      const dx = position.x + position.size / 2 - catCenterX;
      const dy = position.y + position.size / 2 - catCenterY;
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = mice[i].id;
      }
    }
    return closestId;
  }

  /**
   * Animate the cat reaching a mouse, crawling out with the background, and returning.
   */
  function eatMouse(id, onGrab) {
    if (catChase) return Promise.resolve(false);
    const idx = indexOfMouse(id ?? closestMouseId());
    if (idx < 0 || !mice.length) return Promise.resolve(false);
    const target = mice[idx];
    const layout = mouseLayout(Math.floor(height * 0.82), performance.now());
    const position = mousePosition(target, layout);
    const targetCatLeft = position.x + position.size / 2 - layout.catSize * 0.9;
    const toSlide = Math.max(0, targetCatLeft / worldScale - catBaseX);

    return new Promise((resolve) => {
      catChase = {
        id: target.id,
        fromSlide: catSlide,
        toSlide,
        t: 0,
        dur: 0.85,
        phase: 'run',
        resolve,
        onGrab,
        floorMouse: {
          skinColor: target.skinColor,
          size: position.size,
          frame: 0,
          x: position.x,
        },
        grabScroll: scroll,
        outScroll: scroll,
        catchTime: 0,
      };
    });
  }

  function seedInitialMice(count) {
    for (let i = 0; i < count; i += 1) {
      addMouse(`demo-${i}`);
    }
  }

  if (initialCount > 0) seedInitialMice(initialCount);

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const catSpeed = 1 + catSpeedVariation * Math.sin(now * 0.0005);
    scroll += dt * 64 * catSpeed;
    catRunTime += dt * catSpeed;

    if (catChase) {
      if (catChase.phase === 'grab' || catChase.phase === 'out') {
        catChase.catchTime += dt * catSpeed;
      }
      if (catChase.phase === 'grab') {
        catSlide = catChase.fromSlide - (scroll - catChase.grabScroll);
        const catSize = Math.round((width < 150 ? 40 : width < 240 ? 64 : 88) * spriteScale);
        const catX = px(catBaseX) + px(catSlide);
        const mouseX = catChase.floorMouse
          ? catChase.floorMouse.x - px(scroll - catChase.grabScroll)
          : 0;
        if (catX + catSize <= 0 && mouseX + (catChase.floorMouse?.size ?? 0) <= 0) {
          catChase.phase = 'out';
          catChase.t = 0;
          catChase.dur = 0.25;
          catChase.fromSlide = catSlide;
          catChase.outScroll = scroll;
        }
      } else {
        catChase.t += (dt * catSpeed) / catChase.dur;
        if (catChase.phase === 'run') {
          const k = Math.min(1, catChase.t);
          const eased = k * k * (3 - 2 * k);
          catSlide = catChase.fromSlide + (catChase.toSlide - catChase.fromSlide) * eased;
          if (k >= 1) {
            const mouseIndex = indexOfMouse(catChase.id);
            catChase.onGrab?.(catChase.id);
            if (mouseIndex >= 0) {
              const target = mice[mouseIndex];
              const position = mousePosition(target, mouseLayout(Math.floor(height * 0.82), now));
              if (catChase.floorMouse) catChase.floorMouse.x = position.x;
              removeMouse(catChase.id);
            }
            catChase.phase = 'grab';
            if (catChase.floorMouse) {
              catChase.floorMouse.frame = Math.floor(now / mouseRunFrameDuration) % MOUSE_FRAME_COUNT;
            }
            catChase.fromSlide = catSlide;
            catChase.toSlide = catSlide;
            catChase.grabScroll = scroll;
            catChase.t = 0;
          }
        } else if (catChase.phase === 'out') {
          catSlide = catChase.fromSlide - (scroll - catChase.outScroll);
          if (catChase.t >= 1) {
            catChase.phase = 'return';
            catChase.floorMouse = null;
            catChase.fromSlide = catSlide;
            catChase.toSlide = 0;
            catChase.t = 0;
            catChase.dur = Math.max(0.65, (Math.abs(catSlide) * worldScale) / CAT_RETURN_SPEED);
          }
        } else if (catChase.phase === 'return') {
          const k = Math.min(1, catChase.t);
          const eased = k * k * (3 - 2 * k);
          catSlide = catChase.fromSlide + (catChase.toSlide - catChase.fromSlide) * eased;
          if (k >= 1) {
            const completedChase = catChase;
            catSlide = 0;
            catChase = null;
            completedChase.resolve?.(true);
          }
        }
      }
    }

    const groundY = Math.floor(height * 0.82);
    drawClassroom(groundY);

    const layout = mouseLayout(groundY, now);
    const crawling = catChase && (catChase.phase === 'grab' || catChase.phase === 'out');
    const catFrame = crawling
      ? Math.floor((catChase.catchTime * 1000) / 110) % CAT_FRAME_COUNT
      : Math.floor((catRunTime * 1000) / 110) % CAT_FRAME_COUNT;
    const catDrawHeight = layout.catSize * catFrameHeight / catFrameWidth;
    const catRow = crawling ? catCatchRow : 0;
    const catY = groundY - Math.ceil((catFootRows[catRow] / catFrameHeight) * catDrawHeight);
    if (catRunSheet) {
      const sourceY = catRow * catFrameHeight;
      ctx.save();
      ctx.translate(layout.catX + layout.catSize, catY);
      ctx.scale(-1, 1);
      ctx.drawImage(
        catRunSheet,
        catFrame * catFrameWidth,
        sourceY,
        catFrameWidth,
        catFrameHeight,
        0,
        0,
        layout.catSize,
        catDrawHeight,
      );
      ctx.restore();
    }

    if (
      catChase &&
      (catChase.phase === 'grab' || catChase.phase === 'out') &&
      catChase.floorMouse &&
      mouseSprite.complete &&
      mouseSprite.naturalWidth === MOUSE_FRAME_SIZE
    ) {
      const { size, skinColor, frame: mouseFrame, x } = catChase.floorMouse;
      const mouseY = groundY - Math.ceil((MOUSE_FOOT_ROW * size) / MOUSE_FRAME_SIZE);
      const mouseX = x - px(scroll - catChase.grabScroll);
      ctx.drawImage(
        getMouseSprite(skinColor),
        0,
        mouseFrame * MOUSE_FRAME_SIZE,
        MOUSE_FRAME_SIZE,
        MOUSE_FRAME_SIZE,
        mouseX,
        mouseY,
        size,
        size,
      );
    }

    if (
      mouseSprite.complete &&
      mouseSprite.naturalWidth === MOUSE_FRAME_SIZE &&
      mouseSprite.naturalHeight === MOUSE_FRAME_SIZE * MOUSE_FRAME_COUNT
    ) {
      for (let i = 0; i < mice.length; i += 1) {
        const entry = mice[i];
        const { x, y, size } = mousePosition(entry, layout);
        const mouseFrame = Math.floor(now / mouseRunFrameDuration + i * 1.5) % MOUSE_FRAME_COUNT;
        const sprite = getMouseSprite(entry.skinColor);
        const catCenter = layout.catX + layout.catSize / 2;
        const mouseCenter = x + size / 2;
        ctx.save();
        if (mouseCenter < catCenter) {
          ctx.translate(x + size, y);
          ctx.scale(-1, 1);
          ctx.drawImage(
            sprite,
            0,
            mouseFrame * MOUSE_FRAME_SIZE,
            MOUSE_FRAME_SIZE,
            MOUSE_FRAME_SIZE,
            0,
            0,
            size,
            size,
          );
        } else {
          ctx.drawImage(
            sprite,
            0,
            mouseFrame * MOUSE_FRAME_SIZE,
            MOUSE_FRAME_SIZE,
            MOUSE_FRAME_SIZE,
            x,
            y,
            size,
            size,
          );
        }
        ctx.restore();
      }
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf) return;
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  resize();
  start();

  return {
    resize,
    adjustSpriteScale(delta) {
      spriteScale = Math.round(
        Math.min(MAX_SPRITE_SCALE, Math.max(MIN_SPRITE_SCALE, spriteScale + delta)) * 10,
      ) / 10;
      return spriteScale;
    },
    addMouse,
    removeMouse,
    listMouseIds,
    closestMouseId,
    eatMouse,
    stop,
  };
}
