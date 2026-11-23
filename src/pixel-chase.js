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
  let ctx = canvas.getContext('2d');
  let viewPad = 0;
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
  const requestedPosterWallScale = Number(options.posterWallScale ?? 1);
  const posterWallScale = Number.isFinite(requestedPosterWallScale) && requestedPosterWallScale > 0
    ? requestedPosterWallScale
    : 1;
  const requestedNoteWallScale = Number(options.noteWallScale ?? 1);
  const noteWallScale = Number.isFinite(requestedNoteWallScale) && requestedNoteWallScale > 0
    ? requestedNoteWallScale
    : 1;
  let lastFrame = performance.now();
  let scroll = 0;
  let catHidden = false;
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

  const drawingSource = new Image();
  /** @type {HTMLCanvasElement[]} */
  let drawingFrames = [];
  /** @type {{ index: number, fromTile: number }[]} */
  const hungDrawings = [];
  let nextDrawing = 0;
  /**
   * A painting crossing the stage, then leaving with the cat.
   * @type {null | { index: number, x: number, y: number, w: number, h: number, phase: 'slide' | 'caught' }}
   */
  let flyingDrawing = null;

  function sliceSpriteFrames(source, omitted = new Set(), knockout = 'near', split = 'grid') {
    const sourceWidth = source.naturalWidth;
    const sourceHeight = source.naturalHeight;
    if (!sourceWidth || !sourceHeight) return [];
    const sheet = document.createElement('canvas');
    sheet.width = sourceWidth;
    sheet.height = sourceHeight;
    const sheetContext = sheet.getContext('2d', { willReadFrequently: true });
    sheetContext.drawImage(source, 0, 0);
    const image = sheetContext.getImageData(0, 0, sourceWidth, sourceHeight);
    const { data } = image;
    const background = [data[0], data[1], data[2]];
    const far = (offset) => {
      if (knockout === 'pixel') {
        if (data[offset + 3] < 128) return false;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        if (max - min <= 24 && max >= 48) return false;
        return true;
      }
      return Math.abs(data[offset] - background[0])
        + Math.abs(data[offset + 1] - background[1])
        + Math.abs(data[offset + 2] - background[2]) > 48;
    };
    const columns = new Array(sourceWidth).fill(0);
    const rows = new Array(sourceHeight).fill(0);
    for (let y = 0; y < sourceHeight; y += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        if (!far((y * sourceWidth + x) * 4)) continue;
        columns[x] += 1;
        rows[y] += 1;
      }
    }
    const spans = (counts) => {
      const found = [];
      let start = -1;
      for (let i = 0; i < counts.length; i += 1) {
        if (counts[i] > 2 && start < 0) start = i;
        else if (counts[i] <= 2 && start >= 0) {
          found.push([start, i - 1]);
          start = -1;
        }
      }
      if (start >= 0) found.push([start, counts.length - 1]);
      return found;
    };
    const frameSpansX = spans(columns);
    const frameSpansY = spans(rows);
    const rects = [];
    if (split === 'components') {
      const seen = new Uint8Array(sourceWidth * sourceHeight);
      const parts = [];
      for (let y = 0; y < sourceHeight; y += 1) {
        for (let x = 0; x < sourceWidth; x += 1) {
          const start = y * sourceWidth + x;
          if (seen[start] || !far(start * 4)) continue;
          const stack = [start];
          seen[start] = 1;
          let minX = x;
          let maxX = x;
          let minY = y;
          let maxY = y;
          let area = 0;
          while (stack.length) {
            const pixel = stack.pop();
            area += 1;
            const px = pixel % sourceWidth;
            const py = (pixel - px) / sourceWidth;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            if (px > 0 && !seen[pixel - 1] && far((pixel - 1) * 4)) {
              seen[pixel - 1] = 1;
              stack.push(pixel - 1);
            }
            if (px + 1 < sourceWidth && !seen[pixel + 1] && far((pixel + 1) * 4)) {
              seen[pixel + 1] = 1;
              stack.push(pixel + 1);
            }
            if (py > 0 && !seen[pixel - sourceWidth] && far((pixel - sourceWidth) * 4)) {
              seen[pixel - sourceWidth] = 1;
              stack.push(pixel - sourceWidth);
            }
            if (py + 1 < sourceHeight && !seen[pixel + sourceWidth] && far((pixel + sourceWidth) * 4)) {
              seen[pixel + sourceWidth] = 1;
              stack.push(pixel + sourceWidth);
            }
          }
          if (area < 32 || maxX - minX < 6 || maxY - minY < 6) continue;
          parts.push({ minX, minY, maxX, maxY, cy: (minY + maxY) / 2 });
        }
      }
      const heights = parts.map((part) => part.maxY - part.minY + 1).sort((a, b) => a - b);
      const rowGap = (heights[Math.floor(heights.length / 2)] || 40) * 0.55;
      parts.sort((a, b) => a.cy - b.cy);
      const componentRows = [];
      for (const part of parts) {
        const row = componentRows[componentRows.length - 1];
        if (!row || part.cy - row[0].cy > rowGap) componentRows.push([part]);
        else row.push(part);
      }
      for (const row of componentRows) {
        row.sort((a, b) => a.minX - b.minX);
        for (const part of row) rects.push([part.minX, part.minY, part.maxX, part.maxY]);
      }
    } else if (split === 'per-row') {
      for (const [y0, y1] of frameSpansY) {
        const colCounts = new Array(sourceWidth).fill(0);
        for (let y = y0; y <= y1; y += 1) {
          for (let x = 0; x < sourceWidth; x += 1) {
            if (!far((y * sourceWidth + x) * 4)) continue;
            colCounts[x] += 1;
          }
        }
        for (const [x0, x1] of spans(colCounts)) rects.push([x0, y0, x1, y1]);
      }
    } else {
      for (const [y0, y1] of frameSpansY) {
        for (const [x0, x1] of frameSpansX) rects.push([x0, y0, x1, y1]);
      }
    }
    const frames = [];
    rects.forEach(([x0, y0, x1, y1], index) => {
        const sheetIndex = index + 1;
        if (omitted.has(sheetIndex)) return;
        const frameWidth = x1 - x0 + 1;
        const frameHeight = y1 - y0 + 1;
        const frame = document.createElement('canvas');
        frame.width = frameWidth;
        frame.height = frameHeight;
        const frameContext = frame.getContext('2d');
        const crop = sheetContext.getImageData(x0, y0, frameWidth, frameHeight);
        const nearBackground = (index) => Math.abs(crop.data[index] - background[0])
          + Math.abs(crop.data[index + 1] - background[1])
          + Math.abs(crop.data[index + 2] - background[2]) <= 48;
        if (knockout === 'pixel') {
          for (let i = 0; i < crop.data.length; i += 4) {
            crop.data[i + 3] = crop.data[i + 3] >= 128 ? 255 : 0;
          }
          const solid = (x, y) => {
            if (x < 0 || y < 0 || x >= frameWidth || y >= frameHeight) return false;
            return crop.data[(y * frameWidth + x) * 4 + 3] === 255;
          };
          for (let pass = 0; pass < 6; pass += 1) {
            const drop = [];
            for (let y = 0; y < frameHeight; y += 1) {
              for (let x = 0; x < frameWidth; x += 1) {
                const i = (y * frameWidth + x) * 4;
                if (crop.data[i + 3] === 0) continue;
                const max = Math.max(crop.data[i], crop.data[i + 1], crop.data[i + 2]);
                const min = Math.min(crop.data[i], crop.data[i + 1], crop.data[i + 2]);
                if (max - min > 24) continue;
                if (max < 32) {
                  crop.data[i] = 0;
                  crop.data[i + 1] = 0;
                  crop.data[i + 2] = 0;
                  continue;
                }
                if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) {
                  drop.push(i);
                }
              }
            }
            drop.forEach((i) => {
              crop.data[i + 3] = 0;
            });
            if (!drop.length) break;
          }
          for (let i = 0; i < crop.data.length; i += 4) {
            if (crop.data[i + 3] === 0) continue;
            const max = Math.max(crop.data[i], crop.data[i + 1], crop.data[i + 2]);
            const min = Math.min(crop.data[i], crop.data[i + 1], crop.data[i + 2]);
            if (max < 40 && max - min < 24) {
              crop.data[i] = 0;
              crop.data[i + 1] = 0;
              crop.data[i + 2] = 0;
            }
          }
        } else if (knockout === 'edge') {
          const cleared = new Uint8Array(frameWidth * frameHeight);
          const pending = [];
          const clearAt = (x, y) => {
            if (x < 0 || y < 0 || x >= frameWidth || y >= frameHeight) return;
            const pixel = y * frameWidth + x;
            if (cleared[pixel] || !nearBackground(pixel * 4)) return;
            cleared[pixel] = 1;
            pending.push(pixel);
          };
          for (let x = 0; x < frameWidth; x += 1) {
            clearAt(x, 0);
            clearAt(x, frameHeight - 1);
          }
          for (let y = 0; y < frameHeight; y += 1) {
            clearAt(0, y);
            clearAt(frameWidth - 1, y);
          }
          while (pending.length) {
            const pixel = pending.pop();
            const x = pixel % frameWidth;
            const y = (pixel - x) / frameWidth;
            clearAt(x - 1, y);
            clearAt(x + 1, y);
            clearAt(x, y - 1);
            clearAt(x, y + 1);
          }
          for (let pixel = 0; pixel < cleared.length; pixel += 1) {
            crop.data[pixel * 4 + 3] = cleared[pixel] ? 0 : 255;
          }
        } else {
          for (let i = 0; i < crop.data.length; i += 4) {
            if (nearBackground(i)) crop.data[i + 3] = 0;
          }
        }
        frameContext.putImageData(crop, 0, 0);
        let contentBottom = -1;
        for (let y = frameHeight - 1; y >= 0 && contentBottom < 0; y -= 1) {
          for (let x = 0; x < frameWidth; x += 1) {
            if (crop.data[(y * frameWidth + x) * 4 + 3] === 0) continue;
            contentBottom = y;
            break;
          }
        }
        frame.bottomInset = contentBottom < 0 ? 0 : (frameHeight - 1 - contentBottom) / frameHeight;
        if (split !== 'per-row' && split !== 'components') {
          frames.push(frame);
          return;
        }
        let minX = frameWidth;
        let minY = frameHeight;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < frameHeight; y += 1) {
          for (let x = 0; x < frameWidth; x += 1) {
            if (crop.data[(y * frameWidth + x) * 4 + 3] === 0) continue;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
        if (maxX < 0) return;
        const tight = document.createElement('canvas');
        tight.width = maxX - minX + 1;
        tight.height = maxY - minY + 1;
        const tightContext = tight.getContext('2d');
        tightContext.imageSmoothingEnabled = false;
        tightContext.drawImage(
          frame,
          minX,
          minY,
          tight.width,
          tight.height,
          0,
          0,
          tight.width,
          tight.height,
        );
        frames.push(tight);
    });
    return frames;
  }

  drawingSource.addEventListener('load', () => {
    drawingFrames = sliceSpriteFrames(drawingSource, new Set([2, 4, 10]));
  }, { once: true });
  drawingSource.src = new URL('./2-dvc.png', import.meta.url).href;

  const boxSource = new Image();
  /** @type {HTMLCanvasElement[]} */
  let boxFrames = [];
  /** @type {{ index: number, revealScroll: number }[]} */
  const placedBoxes = [];
  let nextBox = 0;
  /**
   * A gift box crossing the stage, then leaving with the cat.
   * @type {null | { index: number, x: number, y: number, w: number, h: number, phase: 'slide' | 'caught' }}
   */
  let flyingBox = null;

  boxSource.addEventListener('load', () => {
    boxFrames = sliceSpriteFrames(boxSource, new Set(), 'edge');
  }, { once: true });
  boxSource.src = new URL('./3-ess.png', import.meta.url).href;

  const posterSource = new Image();
  /** @type {HTMLCanvasElement[]} */
  let posterFrames = [];
  /** @type {{ index: number, u: number, v: number, fromTile: number }[]} */
  const hungPosters = [];
  let nextPoster = 0;
  /**
   * A poster crossing the stage, then leaving with the cat.
   * @type {null | { index: number, x: number, y: number, w: number, h: number, phase: 'slide' | 'caught' }}
   */
  let flyingPoster = null;

  posterSource.addEventListener('load', () => {
    posterFrames = sliceSpriteFrames(posterSource, new Set(), 'edge', 'per-row');
  }, { once: true });
  posterSource.src = new URL('./4-fda.png', import.meta.url).href;

  const figureSource = new Image();
  /** @type {HTMLCanvasElement[]} */
  let figureFrames = [];
  /** @type {{ index: number, aisle: number, slot: number, revealScroll: number }[]} */
  const placedFigures = [];
  let nextFigure = 0;
  /**
   * A figure crossing the stage, then leaving with the cat.
   * @type {null | { index: number, x: number, y: number, w: number, h: number, phase: 'slide' | 'caught' }}
   */
  let flyingFigure = null;

  figureSource.addEventListener('load', () => {
    figureFrames = sliceSpriteFrames(figureSource, new Set(), 'pixel', 'per-row');
  }, { once: true });
  figureSource.src = new URL('./1-mmpa.png', import.meta.url).href;

  const noteSource = new Image();
  /** @type {HTMLCanvasElement[]} */
  let noteFrames = [];
  /** @type {{ index: number, u: number, v: number, fromTile: number }[]} */
  const windowNotes = [];
  let nextNote = 0;
  /**
   * A note crossing the stage, then leaving with the cat.
   * @type {null | { index: number, x: number, y: number, w: number, h: number, phase: 'slide' | 'caught' }}
   */
  let flyingNote = null;

  noteSource.addEventListener('load', () => {
    noteFrames = sliceSpriteFrames(noteSource, new Set(), 'pixel', 'components');
  }, { once: true });
  noteSource.src = new URL('./5-msa.png', import.meta.url).href;

  function catSpriteSize() {
    return Math.round((width < 150 ? 40 : width < 240 ? 64 : 88) * spriteScale);
  }

  function drawingSize(frame) {
    const h = Math.max(px(36), Math.round(catSpriteSize() * 0.46));
    return {
      w: Math.round(h * frame.width / frame.height),
      h,
    };
  }

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
    const extraTiles = viewPad > 0 ? Math.ceil(viewPad / Math.max(1, width)) : 0;
    for (let x = -wallOffset - extraTiles * width; x < width; x += width) {
      ctx.save();
      ctx.translate(x, 0);
      drawClassroomWall(groundY);
      ctx.restore();
    }
    drawHungDrawings();
    drawHungPosters();
    drawWindowNotes();
    const cabinetY = groundY - px(20);
    ctx.fillStyle = '#936541';
    ctx.fillRect(-viewPad, cabinetY, width + viewPad, px(23));
    ctx.fillStyle = '#c48b53';
    ctx.fillRect(-viewPad, cabinetY, width + viewPad, Math.max(1, px(2)));
    const cabinetStride = Math.max(1, px(48));
    const cabinetOffset = px(scroll) % cabinetStride;
    let cabinetX = px(32) - cabinetOffset;
    if (viewPad > 0) {
      const steps = Math.ceil((cabinetX + viewPad) / cabinetStride);
      cabinetX -= steps * cabinetStride;
    }
    for (let x = cabinetX; x < width; x += cabinetStride) {
      ctx.fillStyle = '#6e4b38';
      ctx.fillRect(x, cabinetY + px(3), Math.max(1, px(2)), px(18));
      ctx.fillStyle = '#d2a36b';
      ctx.fillRect(x + px(4), cabinetY + px(10), Math.max(1, px(3)), Math.max(1, px(1)));
    }

    const desks = deskSlots(groundY);
    drawPlacedBoxes(desks, 'below');
    for (const desk of desks) drawDesk(desk.x, desk.top, desk.w);
    drawPlacedBoxes(desks, 'stack');

    ctx.fillStyle = '#96623f';
    ctx.fillRect(-viewPad, groundY, width + viewPad, height - groundY);
    ctx.fillStyle = '#d5a266';
    ctx.fillRect(-viewPad, groundY, width + viewPad, Math.max(1, px(2)));
    const tileWidth = Math.max(px(32), 2);
    const tileOffset = px(scroll) % (tileWidth * 2);
    let floorX = -tileOffset;
    let floorIndex = 0;
    if (viewPad > 0) {
      const steps = Math.ceil((floorX + viewPad) / tileWidth);
      floorX -= steps * tileWidth;
      floorIndex -= steps;
    }
    for (let i = floorIndex, x = floorX; x < width; i += 1, x += tileWidth) {
      ctx.fillStyle = i % 2 ? '#a16a43' : '#8c593a';
      ctx.fillRect(x, groundY + px(2), tileWidth - 1, height - groundY - px(2));
      ctx.fillStyle = '#c18a55';
      ctx.fillRect(x + px(5), groundY + px(8), px(10), Math.max(1, px(1)));
      ctx.fillRect(x + px(20), groundY + px(19), px(7), Math.max(1, px(1)));
    }
    drawPlacedFigures(desks);
  }

  function smallDrawingSize(frame) {
    const groundY = Math.floor(height * 0.82);
    const boardTop = Math.max(px(24), Math.floor(groundY * 0.2));
    const maxH = Math.max(px(10), boardTop - px(12));
    const h = Math.min(maxH, Math.max(px(10), Math.round(catSpriteSize() * 0.16)));
    return {
      w: Math.max(1, Math.round(h * frame.width / frame.height)),
      h,
    };
  }

  function nextIncomingBoardTile() {
    const scrollPx = px(scroll / 2);
    const boardX = px(36);
    return Math.floor((width + scrollPx - boardX) / width) + 1;
  }

  function drawHungDrawings() {
    if (!hungDrawings.length) return;
    const scrollPx = px(scroll / 2);
    const boardX = px(36);
    const gap = Math.max(2, px(2));
    const groundY = Math.floor(height * 0.82);
    const boardTop = Math.max(px(24), Math.floor(groundY * 0.2));
    const anchor = drawingFrames[hungDrawings[0].index];
    if (!anchor) return;
    const anchorSize = smallDrawingSize(anchor);
    const anchorBottom = boardTop - px(2) - anchorSize.h * (anchor.bottomInset || 0);
    const tilePad = viewPad > 0 ? Math.ceil(viewPad / width) : 0;
    const firstTile = Math.floor(scrollPx / width) - 1 - tilePad;
    const lastTile = firstTile + 3 + tilePad;
    for (let tile = firstTile; tile <= lastTile; tile += 1) {
      let worldX = tile * width + boardX;
      for (const item of hungDrawings) {
        if (item.fromTile > tile) continue;
        const frame = drawingFrames[item.index];
        if (!frame) continue;
        const { w, h } = smallDrawingSize(frame);
        const x = Math.round(worldX - scrollPx);
        const y = Math.round(anchorBottom - h * (1 - (frame.bottomInset || 0)));
        if (x < width && x + w > -viewPad) ctx.drawImage(frame, x, y, w, h);
        worldX += w + gap;
      }
    }
  }

  function hangDrawing(index) {
    if (!drawingFrames[index]) return;
    hungDrawings.push({ index, fromTile: nextIncomingBoardTile() });
  }

  function posterWallBox(frame) {
    const groundY = Math.floor(height * 0.82);
    const wallTop = px(7) + px(2);
    const boardTop = Math.max(px(24), Math.floor(groundY * 0.2));
    const gapLeft = px(36) + px(144) + px(3);
    const gapRight = width - px(82) - px(3);
    const gapW = Math.max(8, gapRight - gapLeft);
    const deskTop = groundY - Math.max(px(34), Math.floor(height * 0.18)) - 3;
    const wallHeight = Math.max(1, groundY - wallTop);
    const posterSizeBand = Math.max(px(12), deskTop - boardTop - px(1));
    const aspect = frame.width / Math.max(1, frame.height);
    let w = Math.round(gapW * 0.62);
    let h = Math.max(1, Math.round(w / aspect));
    if (h > posterSizeBand * 0.72) {
      h = Math.max(1, Math.round(posterSizeBand * 0.72));
      w = Math.max(1, Math.round(h * aspect));
    }
    const fitScale = Math.min(posterWallScale, gapW / w, posterSizeBand / h, wallHeight / h);
    w = Math.max(1, Math.round(w * fitScale));
    h = Math.max(1, Math.round(h * fitScale));
    return { gapLeft, gapW, wallTop, wallHeight, w, h };
  }

  function posterRect(item) {
    const frame = posterFrames[item.index];
    const box = posterWallBox(frame);
    const maxX = Math.max(0, box.gapW - box.w);
    const maxY = Math.max(0, box.wallHeight - box.h);
    return {
      x: Math.round(item.u * maxX),
      y: Math.round(item.v * maxY),
      w: box.w,
      h: box.h,
      gapLeft: box.gapLeft,
      wallTop: box.wallTop,
    };
  }

  function posterOverlap(a, b) {
    const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return width * height;
  }

  function posterCover(candidate) {
    const rect = posterRect(candidate);
    let worst = 0;
    for (const other of hungPosters) {
      const prev = posterRect(other);
      const cover = posterOverlap(rect, prev) / Math.max(1, prev.w * prev.h);
      if (cover > worst) worst = cover;
    }
    return worst;
  }

  function drawHungPosters() {
    if (!hungPosters.length) return;
    const scrollPx = px(scroll / 2);
    const tilePad = viewPad > 0 ? Math.ceil(viewPad / width) : 0;
    const firstTile = Math.floor(scrollPx / width) - 1 - tilePad;
    const lastTile = firstTile + 3 + tilePad;
    for (let tile = firstTile; tile <= lastTile; tile += 1) {
      const tileX = tile * width - scrollPx;
      for (const item of hungPosters) {
        if (tile < item.fromTile) continue;
        const frame = posterFrames[item.index];
        if (!frame) continue;
        const rect = posterRect(item);
        const x = Math.round(tileX + rect.gapLeft + rect.x);
        const y = Math.round(rect.wallTop + rect.y);
        if (x < width && x + rect.w > -viewPad) ctx.drawImage(frame, x, y, rect.w, rect.h);
      }
    }
  }

  function hangPoster(index) {
    if (!posterFrames[index]) return;
    let placed = null;
    let bestCover = Infinity;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const candidate = { index, u: Math.random(), v: Math.random() };
      const cover = posterCover(candidate);
      if (cover < bestCover) {
        bestCover = cover;
        placed = candidate;
      }
      if (cover <= 0.65) break;
    }
    const rect = posterRect(placed);
    const scrollPx = px(scroll / 2);
    const localX = rect.gapLeft + rect.x;
    placed.fromTile = Math.ceil((width + scrollPx - localX) / width);
    hungPosters.push(placed);
  }

  function noteWindowBox() {
    const groundY = Math.floor(height * 0.82);
    const windowY = Math.max(px(24), Math.floor(groundY * 0.2));
    const windowX = width - px(82);
    const windowW = px(70);
    const windowH = px(58);
    const visibleBottom = Math.min(windowY + windowH, groundY - px(20));
    return {
      windowX,
      windowY,
      windowW,
      visibleH: Math.max(px(12), visibleBottom - windowY),
    };
  }

  function noteSlideSize(frame) {
    const h = Math.max(px(14), Math.round(catSpriteSize() * 0.16));
    return {
      w: Math.max(1, Math.round(h * frame.width / frame.height)),
      h,
    };
  }

  function notePlacedSize(frame) {
    const box = noteWindowBox();
    let h = Math.max(px(8), Math.round(box.visibleH * 0.46));
    let w = Math.max(1, Math.round(h * frame.width / frame.height));
    const maxW = Math.max(px(8), box.windowW - px(4));
    const maxH = Math.max(px(8), box.visibleH - px(4));
    if (w > maxW) {
      w = maxW;
      h = Math.max(1, Math.round(w * frame.height / frame.width));
    }
    if (h > maxH) {
      h = maxH;
      w = Math.max(1, Math.min(maxW, Math.round(h * frame.width / frame.height)));
    }
    return {
      ...box,
      w: Math.max(1, Math.round(w * noteWallScale)),
      h: Math.max(1, Math.round(h * noteWallScale)),
    };
  }

  function noteRect(item) {
    const frame = noteFrames[item.index];
    const box = notePlacedSize(frame);
    const maxX = Math.max(0, box.windowW - box.w);
    const maxY = Math.max(0, box.visibleH - box.h);
    return {
      x: Math.round(item.u * maxX),
      y: Math.round(item.v * maxY),
      w: box.w,
      h: box.h,
      windowX: box.windowX,
      windowY: box.windowY,
    };
  }

  function noteCover(candidate) {
    const rect = noteRect(candidate);
    let worst = 0;
    for (const other of windowNotes) {
      const prev = noteRect(other);
      const overlapW = Math.max(0, Math.min(rect.x + rect.w, prev.x + prev.w) - Math.max(rect.x, prev.x));
      const overlapH = Math.max(0, Math.min(rect.y + rect.h, prev.y + prev.h) - Math.max(rect.y, prev.y));
      const cover = (overlapW * overlapH) / Math.max(1, prev.w * prev.h);
      if (cover > worst) worst = cover;
    }
    return worst;
  }

  function drawWindowNotes() {
    if (!windowNotes.length) return;
    const scrollPx = px(scroll / 2);
    const tilePad = viewPad > 0 ? Math.ceil(viewPad / width) : 0;
    const firstTile = Math.floor(scrollPx / width) - 1 - tilePad;
    const lastTile = firstTile + 3 + tilePad;
    for (let tile = firstTile; tile <= lastTile; tile += 1) {
      const tileX = tile * width - scrollPx;
      for (const item of windowNotes) {
        if (tile < item.fromTile) continue;
        const frame = noteFrames[item.index];
        if (!frame) continue;
        const rect = noteRect(item);
        const x = Math.round(tileX + rect.windowX + rect.x);
        const y = Math.round(rect.windowY + rect.y);
        if (x < width && x + rect.w > -viewPad) ctx.drawImage(frame, x, y, rect.w, rect.h);
      }
    }
  }

  function placeNote(index) {
    if (!noteFrames[index]) return;
    let placed = null;
    let bestCover = Infinity;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const candidate = { index, u: Math.random(), v: Math.random() };
      const cover = noteCover(candidate);
      if (cover < bestCover) {
        bestCover = cover;
        placed = candidate;
      }
      if (cover <= 0.65) break;
    }
    const rect = noteRect(placed);
    const scrollPx = px(scroll / 2);
    const localX = rect.windowX + rect.x;
    placed.fromTile = Math.ceil((width + scrollPx - localX) / width);
    windowNotes.push(placed);
  }

  function deskSlots(groundY) {
    const top = groundY - Math.max(px(34), Math.floor(height * 0.18)) - 3;
    const desks = [];
    for (let i = 0; i < 3; i += 1) {
      const deskWidth = 42 + (i % 2) * 8;
      const x = Math.floor(px(wrap(i * 126 - scroll * 0.82, BASE_WIDTH + deskWidth) - deskWidth));
      desks.push({ x, top, w: px(deskWidth) });
    }
    return desks;
  }

  const BOX_TABLE = 1;
  const BOX_ROWS = [4, 3, 2, 1];

  function boxCarrySize(frame) {
    const h = Math.max(px(14), Math.round(catSpriteSize() * 0.16));
    return {
      w: Math.max(1, Math.round(h * frame.width / frame.height)),
      h,
    };
  }

  function boxStackSlot(order) {
    let remaining = order;
    for (let row = 0; row < BOX_ROWS.length; row += 1) {
      if (remaining < BOX_ROWS[row]) {
        return { below: false, row, col: remaining, count: BOX_ROWS[row] };
      }
      remaining -= BOX_ROWS[row];
    }
    const perRow = BOX_ROWS[0];
    return {
      below: true,
      row: Math.floor(remaining / perRow),
      col: remaining % perRow,
      count: perRow,
    };
  }

  function nextDeskRevealScroll(deskIndex) {
    const deskWidth = 42 + (deskIndex % 2) * 8;
    const span = BASE_WIDTH + deskWidth;
    const phase = deskIndex * 126 - scroll * 0.82;
    const boundary = Math.floor(phase / span) * span;
    const target = phase - boundary < 1e-4 ? boundary - span : boundary;
    return (deskIndex * 126 - target) / 0.82;
  }

  function drawPlacedBoxes(desks, layer) {
    if (!placedBoxes.length) return;
    const desk = desks[BOX_TABLE];
    if (!desk) return;
    const cellW = desk.w / BOX_ROWS[0];
    const rowH = Math.max(1, Math.round(cellW * 1.16));
    const step = Math.max(1, Math.round(rowH * 0.38));
    const orders = [];
    for (let order = 0; order < placedBoxes.length; order += 1) {
      const slot = boxStackSlot(order);
      if (layer === 'below' ? slot.below : !slot.below) orders.push(order);
    }
    orders.sort((a, b) => {
      const sa = boxStackSlot(a);
      const sb = boxStackSlot(b);
      return sa.below ? sa.row - sb.row : sb.row - sa.row;
    });
    for (const order of orders) {
      const item = placedBoxes[order];
      if (!(scroll > item.revealScroll)) continue;
      const frame = boxFrames[item.index];
      if (!frame) continue;
      const { row, col, count, below } = boxStackSlot(order);
      const rowCount = below ? BOX_ROWS[0] : count;
      const rowW = cellW * rowCount;
      const left = desk.x + (desk.w - rowW) / 2;
      const edge = (index) => Math.round(left + rowW * index / rowCount);
      const x = edge(col);
      const w = Math.max(1, edge(col + 1) - x);
      const h = Math.max(1, Math.round(w * frame.height / frame.width));
      const y = below
        ? Math.round(desk.top + px(6) + row * h)
        : Math.round(desk.top - h - row * step);
      if (x < width && x + w > -viewPad) ctx.drawImage(frame, x, y, w, h);
    }
  }

  function placeBox(index) {
    if (!boxFrames[index]) return;
    placedBoxes.push({ index, revealScroll: nextDeskRevealScroll(BOX_TABLE) });
  }

  function figureSlideSize(frame) {
    const h = Math.max(px(14), Math.round(catSpriteSize() * 0.16));
    return {
      w: Math.max(1, Math.round(h * frame.width / frame.height)),
      h,
    };
  }

  function figurePlacedSize(frame) {
    const h = Math.max(px(14), Math.round(catSpriteSize() * 0.16));
    return {
      w: Math.max(1, Math.round(h * frame.width / frame.height)),
      h,
    };
  }

  function drawPlacedFigures(desks) {
    if (!placedFigures.length || !desks.length) return;
    const gapPad = Math.max(1, px(1));
    const tableBottom = px(19);
    for (let aisle = 0; aisle < desks.length; aisle += 1) {
      const group = placedFigures
        .filter((item) => item.aisle === aisle)
        .sort((a, b) => a.slot - b.slot);
      if (!group.length) continue;
      const desk = desks[aisle];
      const deskWidth = 42 + (aisle % 2) * 8;
      const span = BASE_WIDTH + deskWidth;
      const phase = aisle * 126 - scroll * 0.82;
      const cycleStartPhase = Math.ceil((phase - 1e-6) / span) * span;
      const currentEntrance = (aisle * 126 - cycleStartPhase) / 0.82;
      const baseline = desk.top + tableBottom;
      const spots = [];
      let cursor = gapPad;
      for (const item of group) {
        const frame = figureFrames[item.index];
        if (!frame) continue;
        const { w, h } = figurePlacedSize(frame);
        spots.push({ item, frame, w, h, offset: cursor });
        cursor += w + gapPad;
      }
      const lineLeft = desk.x + desk.w;
      const passes = [
        { left: lineLeft, entrance: currentEntrance },
        { left: lineLeft - px(span), entrance: currentEntrance - span / 0.82 },
      ];
      for (const pass of passes) {
        const outgoing = pass.left !== lineLeft;
        for (const spot of spots) {
          if (!(scroll > spot.item.revealScroll)) continue;
          const joinedEarlier = spot.item.revealScroll < pass.entrance - 0.05;
          const joinedThisPass = spot.item.revealScroll <= pass.entrance + 0.05;
          if (outgoing ? !joinedEarlier : !joinedThisPass) continue;
          const x = Math.round(pass.left + spot.offset);
          const y = Math.round(baseline - spot.h);
          if (x >= width || x + spot.w <= -viewPad) continue;
          ctx.drawImage(spot.frame, x, y, spot.w, spot.h);
        }
      }
    }
  }

  function placeFigure(index) {
    if (!figureFrames[index]) return;
    const previous = placedFigures[placedFigures.length - 1];
    const aisle = previous ? previous.aisle : 0;
    placedFigures.push({
      index,
      aisle,
      slot: previous ? previous.slot + 1 : 0,
      revealScroll: previous ? previous.revealScroll : nextDeskRevealScroll(aisle),
    });
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
    const feetY = layout.groundY - Math.ceil((MOUSE_FOOT_ROW * size) / MOUSE_FRAME_SIZE);
    if (entry.slideScroll != null) {
      const traveled = px(scroll - entry.slideScroll);
      const slideX = width + size - traveled;
      if (slideX > baseX) return { x: slideX, y: feetY, size, entering: true };
      entry.slideScroll = null;
    }
    const yOffset = Math.floor(entry.ySpread * layout.mouseSpreadY)
      + Math.round(Math.sin(movePhase * 1.6) * spriteScale);
    const y = feetY - yOffset;
    return { x, y, size, entering: false };
  }

  function indexOfMouse(id) {
    return mice.findIndex((m) => m.id === id);
  }

  function addMouse(id, skinColor = null, options = {}) {
    if (indexOfMouse(id) >= 0) return false;
    mice.push({
      id,
      spread: seedRandom(),
      ySpread: seedRandom(),
      sizeBias: mice.length % 3,
      skinColor,
      slideScroll: options.enter ? scroll : null,
    });
    return true;
  }

  function removeMouse(id) {
    const idx = indexOfMouse(id);
    if (idx < 0) return false;
    mice.splice(idx, 1);
    return true;
  }

  function clearMice() {
    if (catChase) {
      const pending = catChase;
      catChase = null;
      pending.resolve?.(false);
    }
    catSlide = 0;
    mice.length = 0;
    hungDrawings.length = 0;
    flyingDrawing = null;
    nextDrawing = 0;
    placedBoxes.length = 0;
    flyingBox = null;
    nextBox = 0;
    hungPosters.length = 0;
    flyingPoster = null;
    nextPoster = 0;
    placedFigures.length = 0;
    flyingFigure = null;
    nextFigure = 0;
    windowNotes.length = 0;
    flyingNote = null;
    nextNote = 0;
    propQueue.length = 0;
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
      if (position.entering) continue;
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
  const propQueue = [];
  let onPropStart = null;

  function propBusy() {
    return Boolean(catChase || flyingDrawing || flyingBox || flyingPoster || flyingFigure || flyingNote);
  }

  function startProp(kind) {
    if (kind === 'drawing') return presentDrawing();
    if (kind === 'box') return presentBox();
    if (kind === 'poster') return presentPoster();
    if (kind === 'figure') return presentFigure();
    if (kind === 'note') return presentNote();
    return false;
  }

  function pumpPropQueue() {
    if (propBusy()) return;
    while (propQueue.length) {
      const kind = propQueue.shift();
      if (!startProp(kind)) continue;
      onPropStart?.(kind);
      return;
    }
  }

  function requestProp(kind) {
    if (propBusy()) {
      propQueue.push(kind);
      return 'queued';
    }
    return startProp(kind) ? 'started' : 'unavailable';
  }

  function presentDrawing() {
    if (catChase || flyingDrawing || flyingBox || flyingPoster || flyingFigure || flyingNote || !drawingFrames.length) return false;
    const index = nextDrawing % drawingFrames.length;
    nextDrawing += 1;
    const frame = drawingFrames[index];
    const { w, h } = drawingSize(frame);
    const groundY = Math.floor(height * 0.82);
    flyingDrawing = {
      index,
      x: width + 4,
      y: groundY - h,
      w,
      h,
      phase: 'slide',
    };
    return true;
  }

  function catRunBounds(groundY) {
    const catSize = catSpriteSize();
    const catX = px(catBaseX) + px(catSlide);
    const catDrawHeight = catSize * catFrameHeight / Math.max(1, catFrameWidth);
    const foot = catFootRows[0] || CAT_FOOT_ROW;
    const catY = groundY - Math.ceil((foot / catFrameHeight) * catDrawHeight);
    return { x: catX, y: catY, w: catSize, h: catDrawHeight };
  }

  function startDrawingCatch(groundY) {
    if (catChase || !flyingDrawing) return;
    const cat = catRunBounds(groundY);
    flyingDrawing.x = cat.x + cat.w - px(4);
    flyingDrawing.phase = 'caught';
    catChase = {
      id: `drawing-${flyingDrawing.index}`,
      kind: 'drawing',
      drawingIndex: flyingDrawing.index,
      fromSlide: catSlide,
      toSlide: catSlide,
      t: 0,
      dur: 0.25,
      phase: 'grab',
      floorMouse: null,
      carried: { x: flyingDrawing.x, w: flyingDrawing.w },
      grabScroll: scroll,
      outScroll: scroll,
      catchTime: 0,
    };
  }

  function presentBox() {
    if (catChase || flyingDrawing || flyingBox || flyingPoster || flyingFigure || flyingNote || !boxFrames.length) return false;
    const index = nextBox % boxFrames.length;
    nextBox += 1;
    const frame = boxFrames[index];
    const { w, h } = boxCarrySize(frame);
    const groundY = Math.floor(height * 0.82);
    flyingBox = {
      index,
      x: width + 4,
      y: groundY - h,
      w,
      h,
      phase: 'slide',
    };
    return true;
  }

  function startBoxCatch(groundY) {
    if (catChase || !flyingBox) return;
    const cat = catRunBounds(groundY);
    flyingBox.x = cat.x + cat.w - px(4);
    flyingBox.phase = 'caught';
    catChase = {
      id: `box-${flyingBox.index}`,
      kind: 'box',
      boxIndex: flyingBox.index,
      fromSlide: catSlide,
      toSlide: catSlide,
      t: 0,
      dur: 0.25,
      phase: 'grab',
      floorMouse: null,
      carried: { x: flyingBox.x, w: flyingBox.w },
      grabScroll: scroll,
      outScroll: scroll,
      catchTime: 0,
    };
  }

  function presentPoster() {
    if (catChase || flyingDrawing || flyingBox || flyingPoster || flyingFigure || flyingNote || !posterFrames.length) return false;
    const index = nextPoster % posterFrames.length;
    nextPoster += 1;
    const frame = posterFrames[index];
    const h = Math.max(px(28), Math.round(catSpriteSize() * 0.32));
    const w = Math.max(1, Math.round(h * frame.width / frame.height));
    const groundY = Math.floor(height * 0.82);
    flyingPoster = {
      index,
      x: width + 4,
      y: groundY - h,
      w,
      h,
      phase: 'slide',
    };
    return true;
  }

  function startPosterCatch(groundY) {
    if (catChase || !flyingPoster) return;
    const cat = catRunBounds(groundY);
    flyingPoster.x = cat.x + cat.w - px(4);
    flyingPoster.phase = 'caught';
    catChase = {
      id: `poster-${flyingPoster.index}`,
      kind: 'poster',
      posterIndex: flyingPoster.index,
      fromSlide: catSlide,
      toSlide: catSlide,
      t: 0,
      dur: 0.25,
      phase: 'grab',
      floorMouse: null,
      carried: { x: flyingPoster.x, w: flyingPoster.w },
      grabScroll: scroll,
      outScroll: scroll,
      catchTime: 0,
    };
  }

  function presentFigure() {
    if (catChase || flyingDrawing || flyingBox || flyingPoster || flyingFigure || flyingNote || !figureFrames.length) return false;
    const index = nextFigure % figureFrames.length;
    nextFigure += 1;
    const frame = figureFrames[index];
    const { w, h } = figureSlideSize(frame);
    const groundY = Math.floor(height * 0.82);
    flyingFigure = {
      index,
      x: width + 4,
      y: groundY - h,
      w,
      h,
      phase: 'slide',
    };
    return true;
  }

  function startFigureCatch(groundY) {
    if (catChase || !flyingFigure) return;
    const cat = catRunBounds(groundY);
    flyingFigure.x = cat.x + cat.w - px(4);
    flyingFigure.phase = 'caught';
    catChase = {
      id: `figure-${flyingFigure.index}`,
      kind: 'figure',
      figureIndex: flyingFigure.index,
      fromSlide: catSlide,
      toSlide: catSlide,
      t: 0,
      dur: 0.25,
      phase: 'grab',
      floorMouse: null,
      carried: { x: flyingFigure.x, w: flyingFigure.w },
      grabScroll: scroll,
      outScroll: scroll,
      catchTime: 0,
    };
  }

  function presentNote() {
    if (catChase || flyingDrawing || flyingBox || flyingPoster || flyingFigure || flyingNote || !noteFrames.length) return false;
    const index = nextNote % noteFrames.length;
    nextNote += 1;
    const frame = noteFrames[index];
    const { w, h } = noteSlideSize(frame);
    const groundY = Math.floor(height * 0.82);
    flyingNote = {
      index,
      x: width + 4,
      y: groundY - h,
      w,
      h,
      phase: 'slide',
    };
    return true;
  }

  function startNoteCatch(groundY) {
    if (catChase || !flyingNote) return;
    const cat = catRunBounds(groundY);
    flyingNote.x = cat.x + cat.w - px(4);
    flyingNote.phase = 'caught';
    catChase = {
      id: `note-${flyingNote.index}`,
      kind: 'note',
      noteIndex: flyingNote.index,
      fromSlide: catSlide,
      toSlide: catSlide,
      t: 0,
      dur: 0.25,
      phase: 'grab',
      floorMouse: null,
      carried: { x: flyingNote.x, w: flyingNote.w },
      grabScroll: scroll,
      outScroll: scroll,
      catchTime: 0,
    };
  }

  function eatMouse(id, onGrab) {
    if (catChase || flyingDrawing || flyingBox || flyingPoster || flyingFigure || flyingNote) return Promise.resolve(false);
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

    if (flyingDrawing?.phase === 'slide') {
      const groundY = Math.floor(height * 0.82);
      const cat = catRunBounds(groundY);
      flyingDrawing.x -= dt * Math.max(width / 3.1, 90);
      if (flyingDrawing.x <= cat.x + cat.w) startDrawingCatch(groundY);
    }

    if (flyingBox?.phase === 'slide') {
      const groundY = Math.floor(height * 0.82);
      const cat = catRunBounds(groundY);
      flyingBox.x -= dt * Math.max(width / 3.1, 90);
      if (flyingBox.x <= cat.x + cat.w) startBoxCatch(groundY);
    }

    if (flyingPoster?.phase === 'slide') {
      const groundY = Math.floor(height * 0.82);
      const cat = catRunBounds(groundY);
      flyingPoster.x -= dt * Math.max(width / 3.1, 90);
      if (flyingPoster.x <= cat.x + cat.w) startPosterCatch(groundY);
    }

    if (flyingFigure?.phase === 'slide') {
      const groundY = Math.floor(height * 0.82);
      const cat = catRunBounds(groundY);
      flyingFigure.x -= dt * Math.max(width / 3.1, 90);
      if (flyingFigure.x <= cat.x + cat.w) startFigureCatch(groundY);
    }

    if (flyingNote?.phase === 'slide') {
      const groundY = Math.floor(height * 0.82);
      const cat = catRunBounds(groundY);
      flyingNote.x -= dt * Math.max(width / 3.1, 90);
      if (flyingNote.x <= cat.x + cat.w) startNoteCatch(groundY);
    }

    if (catChase) {
      if (catChase.phase === 'grab' || catChase.phase === 'out') {
        catChase.catchTime += dt * catSpeed;
      }
      if (catChase.phase === 'grab') {
        catSlide = catChase.fromSlide - (scroll - catChase.grabScroll);
        const catSize = Math.round((width < 150 ? 40 : width < 240 ? 64 : 88) * spriteScale);
        const catX = px(catBaseX) + px(catSlide);
        const carriedX = catChase.floorMouse
          ? catChase.floorMouse.x - px(scroll - catChase.grabScroll)
          : catChase.carried
            ? catChase.carried.x - px(scroll - catChase.grabScroll)
            : 0;
        const carriedW = catChase.floorMouse?.size ?? catChase.carried?.w ?? 0;
        if (catX + catSize <= 0 && carriedX + carriedW <= 0) {
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
            if (catChase.kind === 'drawing' && flyingDrawing) {
              catChase.carried = { x: flyingDrawing.x, w: flyingDrawing.w };
            } else {
              const mouseIndex = indexOfMouse(catChase.id);
              catChase.onGrab?.(catChase.id);
              if (mouseIndex >= 0) {
                const target = mice[mouseIndex];
                const position = mousePosition(target, mouseLayout(Math.floor(height * 0.82), now));
                if (catChase.floorMouse) catChase.floorMouse.x = position.x;
                removeMouse(catChase.id);
              }
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
            if (completedChase.kind === 'drawing') {
              flyingDrawing = null;
              hangDrawing(completedChase.drawingIndex);
            } else if (completedChase.kind === 'box') {
              flyingBox = null;
              placeBox(completedChase.boxIndex);
            } else if (completedChase.kind === 'poster') {
              flyingPoster = null;
              hangPoster(completedChase.posterIndex);
            } else if (completedChase.kind === 'figure') {
              flyingFigure = null;
              placeFigure(completedChase.figureIndex);
            } else if (completedChase.kind === 'note') {
              flyingNote = null;
              placeNote(completedChase.noteIndex);
            }
            completedChase.resolve?.(true);
            pumpPropQueue();
          }
        }
      }
    }

    paintScene(now);
    raf = requestAnimationFrame(frame);
  }

  function paintScene(now) {
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
    if (catRunSheet && !catHidden) {
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
        const { x, y, size, entering } = mousePosition(entry, layout);
        const mouseFrame = Math.floor(now / mouseRunFrameDuration + i * 1.5) % MOUSE_FRAME_COUNT;
        const sprite = getMouseSprite(entry.skinColor);
        const catCenter = layout.catX + layout.catSize / 2;
        const mouseCenter = x + size / 2;
        ctx.save();
        if (entering || mouseCenter < catCenter) {
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

    if (flyingDrawing) {
      const frameImage = drawingFrames[flyingDrawing.index];
      let drawX = flyingDrawing.x;
      if (
        flyingDrawing.phase === 'caught'
        && catChase?.carried
        && (catChase.phase === 'grab' || catChase.phase === 'out' || catChase.phase === 'return')
      ) {
        drawX = catChase.carried.x - px(scroll - catChase.grabScroll);
        flyingDrawing.x = drawX;
      }
      if (frameImage) {
        ctx.drawImage(frameImage, Math.round(drawX), flyingDrawing.y, flyingDrawing.w, flyingDrawing.h);
      }
    }

    if (flyingBox) {
      const frameImage = boxFrames[flyingBox.index];
      let drawX = flyingBox.x;
      if (
        flyingBox.phase === 'caught'
        && catChase?.carried
        && (catChase.phase === 'grab' || catChase.phase === 'out' || catChase.phase === 'return')
      ) {
        drawX = catChase.carried.x - px(scroll - catChase.grabScroll);
        flyingBox.x = drawX;
      }
      if (frameImage) {
        ctx.drawImage(frameImage, Math.round(drawX), flyingBox.y, flyingBox.w, flyingBox.h);
      }
    }

    if (flyingPoster) {
      const frameImage = posterFrames[flyingPoster.index];
      let drawX = flyingPoster.x;
      if (
        flyingPoster.phase === 'caught'
        && catChase?.carried
        && (catChase.phase === 'grab' || catChase.phase === 'out' || catChase.phase === 'return')
      ) {
        drawX = catChase.carried.x - px(scroll - catChase.grabScroll);
        flyingPoster.x = drawX;
      }
      if (frameImage) {
        ctx.drawImage(frameImage, Math.round(drawX), flyingPoster.y, flyingPoster.w, flyingPoster.h);
      }
    }

    if (flyingFigure) {
      const frameImage = figureFrames[flyingFigure.index];
      let drawX = flyingFigure.x;
      if (
        flyingFigure.phase === 'caught'
        && catChase?.carried
        && (catChase.phase === 'grab' || catChase.phase === 'out' || catChase.phase === 'return')
      ) {
        drawX = catChase.carried.x - px(scroll - catChase.grabScroll);
        flyingFigure.x = drawX;
      }
      if (frameImage) {
        ctx.drawImage(frameImage, Math.round(drawX), flyingFigure.y, flyingFigure.w, flyingFigure.h);
      }
    }

    if (flyingNote) {
      const frameImage = noteFrames[flyingNote.index];
      let drawX = flyingNote.x;
      if (
        flyingNote.phase === 'caught'
        && catChase?.carried
        && (catChase.phase === 'grab' || catChase.phase === 'out' || catChase.phase === 'return')
      ) {
        drawX = catChase.carried.x - px(scroll - catChase.grabScroll);
        flyingNote.x = drawX;
      }
      if (frameImage) {
        ctx.drawImage(frameImage, Math.round(drawX), flyingNote.y, flyingNote.w, flyingNote.h);
      }
    }
  }

  let zoomPlate = null;

  function captureZoomPlate() {
    const pad = width;
    const plateWidth = width + pad;
    if (!zoomPlate || zoomPlate.width !== plateWidth || zoomPlate.height !== height) {
      zoomPlate = document.createElement('canvas');
      zoomPlate.width = plateWidth;
      zoomPlate.height = height;
    }
    const plateCtx = zoomPlate.getContext('2d');
    const liveCtx = ctx;
    ctx = plateCtx;
    viewPad = pad;
    plateCtx.setTransform(1, 0, 0, 1, 0, 0);
    plateCtx.imageSmoothingEnabled = false;
    plateCtx.clearRect(0, 0, plateWidth, height);
    plateCtx.save();
    plateCtx.translate(pad, 0);
    try {
      paintScene(performance.now());
    } finally {
      plateCtx.restore();
      ctx = liveCtx;
      viewPad = 0;
    }
    return { canvas: zoomPlate, pad };
  }

  function captureCat(runFrame = null) {
    const groundY = Math.floor(height * 0.82);
    const layout = mouseLayout(groundY, performance.now());
    const crawling = catChase && (catChase.phase === 'grab' || catChase.phase === 'out');
    const liveFrame = crawling
      ? Math.floor((catChase.catchTime * 1000) / 110) % CAT_FRAME_COUNT
      : Math.floor((catRunTime * 1000) / 110) % CAT_FRAME_COUNT;
    const frameIndex = runFrame == null
      ? liveFrame
      : ((runFrame % CAT_FRAME_COUNT) + CAT_FRAME_COUNT) % CAT_FRAME_COUNT;
    const catRow = runFrame == null && crawling ? catCatchRow : 0;
    const catDrawHeight = Math.max(1, Math.round(layout.catSize * catFrameHeight / catFrameWidth));
    const catY = groundY - Math.ceil((catFootRows[catRow] / catFrameHeight) * catDrawHeight);
    const sprite = document.createElement('canvas');
    sprite.width = Math.max(1, Math.round(layout.catSize));
    sprite.height = catDrawHeight;
    const spriteCtx = sprite.getContext('2d');
    spriteCtx.imageSmoothingEnabled = false;
    if (catRunSheet) {
      spriteCtx.save();
      spriteCtx.translate(sprite.width, 0);
      spriteCtx.scale(-1, 1);
      spriteCtx.drawImage(
        catRunSheet,
        frameIndex * catFrameWidth,
        catRow * catFrameHeight,
        catFrameWidth,
        catFrameHeight,
        0,
        0,
        sprite.width,
        sprite.height,
      );
      spriteCtx.restore();
    }
    const pixels = spriteCtx.getImageData(0, 0, sprite.width, sprite.height).data;
    let minX = sprite.width;
    let minY = sprite.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < sprite.height; y += 1) {
      for (let x = 0; x < sprite.width; x += 1) {
        if (pixels[(y * sprite.width + x) * 4 + 3] < 20) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX >= 0) {
      const tight = document.createElement('canvas');
      tight.width = maxX - minX + 1;
      tight.height = maxY - minY + 1;
      const tightCtx = tight.getContext('2d');
      tightCtx.imageSmoothingEnabled = false;
      tightCtx.drawImage(sprite, minX, minY, tight.width, tight.height, 0, 0, tight.width, tight.height);
      return {
        canvas: tight,
        x: layout.catX + minX,
        y: catY + minY,
        w: tight.width,
        h: tight.height,
        frame: frameIndex,
        frameCount: CAT_FRAME_COUNT,
      };
    }
    return {
      canvas: sprite,
      x: layout.catX,
      y: catY,
      w: sprite.width,
      h: sprite.height,
      frame: frameIndex,
      frameCount: CAT_FRAME_COUNT,
    };
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
    clearMice,
    listMouseIds,
    closestMouseId,
    eatMouse,
    captureCat,
    captureZoomPlate,
    setCatHidden(hidden) {
      catHidden = hidden;
    },
    presentDrawing,
    presentBox,
    presentPoster,
    presentNote,
    requestProp,
    setPropListener(listener) {
      onPropStart = listener;
    },
    stop,
  };
}
