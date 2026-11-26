import boyOutlines from './polygons_boy.json';
import teacherOutline from './teacher-outline.json';

const PHOTO_WIDTH = 1408;
const PHOTO_HEIGHT = 768;

const FACE_SLOTS = [
  ...makeRow([[579, 435], [836, 439], [466, 435], [956, 434], [355, 430], [1075, 432], [250, 426], [1187, 444], [146, 425], [1293, 434]], 24, 30),
  ...makeRow([[654, 327], [775, 336], [544, 325], [881, 341], [445, 323], [984, 336], [347, 322], [1081, 351], [244, 327], [1179, 344]], 23, 29),
  ...makeRow([[669, 215], [764, 240], [581, 225], [853, 233], [492, 222], [942, 220], [402, 243], [1035, 235], [310, 220], [1135, 225]], 20, 25),
];

const PERSON_OUTLINES = mapPersonOutlines(boyOutlines.polygons);

function makeRow(points, rx, ry) {
  return points.map(([x, y]) => ({ x, y, rx, ry }));
}

// Vertex x hugs the dense side of the outline. Y stays the head-band mean the slots were tuned to.
function headAnchor(points) {
  const minY = Math.min(...points.map(([, y]) => y));
  const head = points.filter(([, y]) => y <= minY + 70);
  const meanY = head.reduce((sum, [, y]) => sum + y, 0) / head.length;
  let area = 0;
  let sx = 0;
  for (let y = minY, y1 = minY + 50; y < y1; y += 1) {
    const hits = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [x0, y0] = points[j];
      const [x1, y1] = points[i];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) hits.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0));
    }
    hits.sort((a, b) => a - b);
    for (let k = 0; k + 1 < hits.length; k += 2) {
      const width = hits[k + 1] - hits[k];
      area += width;
      sx += (hits[k] + hits[k + 1]) * 0.5 * width;
    }
  }
  return { x: area ? sx / area : head[0][0], y: meanY };
}

function mapPersonOutlines(polygons) {
  const unused = polygons.map((polygon) => ({ points: polygon.points, anchor: headAnchor(polygon.points) }));

  return FACE_SLOTS.map((slot, index) => {
    const row = Math.floor(index / 10);
    const candidates = unused.filter(({ anchor }) => {
      const anchorRow = anchor.y < 285 ? 2 : anchor.y < 390 ? 1 : 0;
      return anchorRow === row;
    });
    if (!candidates.length) {
      throw new Error(`No person outline matches registration slot ${index + 1}`);
    }

    const nearest = candidates.reduce((best, candidate) => {
      const candidateDistance = (candidate.anchor.x - slot.x) ** 2 + (candidate.anchor.y - slot.y) ** 2;
      const bestDistance = (best.anchor.x - slot.x) ** 2 + (best.anchor.y - slot.y) ** 2;
      return candidateDistance < bestDistance ? candidate : best;
    });
    unused.splice(unused.indexOf(nearest), 1);
    return {
      points: nearest.points,
      anchor: nearest.anchor,
      x: slot.x,
      y: slot.y,
      rx: slot.rx,
      ry: slot.ry,
    };
  });
}

function isPhotoSkin(r, g, b) {
  return r > 140 && g > 90 && g < 210 && b > 55 && b < 190 && r - g > 8 && r - b > 18 && r < 240;
}

function isPortraitSkin(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 70 && g > 40 && b > 25 && r + 5 >= g && r > b + 8 && max - min > 15 && r < 250;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function luma(r, g, b) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function applySaturation(r, g, b, amount) {
  const gray = luma(r, g, b);
  return [
    clampByte(gray + (r - gray) * amount),
    clampByte(gray + (g - gray) * amount),
    clampByte(gray + (b - gray) * amount),
  ];
}

// Lift edge definition so eyes, nose, and mouth read clearly at class-photo scale.
function enhancePortraitDefinition(data, width, height) {
  const CONTRAST = 1.24;
  const SHADOW_LIFT = 6;
  const SATURATION = 1.1;
  const SHARPEN = 0.55;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const light = luma(r, g, b);
    const boosted = clampByte((light - 128) * CONTRAST + 128 + SHADOW_LIFT);
  const ratio = light > 2 ? boosted / light : 1;
    r = clampByte(r * ratio);
    g = clampByte(g * ratio);
    b = clampByte(b * ratio);
    [r, g, b] = applySaturation(r, g, b, SATURATION);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  const blurred = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 128) {
        blurred[index] = data[index];
        blurred[index + 1] = data[index + 1];
        blurred[index + 2] = data[index + 2];
        blurred[index + 3] = data[index + 3];
        continue;
      }
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = (ny * width + nx) * 4;
          if (data[neighbor + 3] < 128) continue;
          sumR += data[neighbor];
          sumG += data[neighbor + 1];
          sumB += data[neighbor + 2];
          count += 1;
        }
      }
      if (!count) {
        blurred[index] = data[index];
        blurred[index + 1] = data[index + 1];
        blurred[index + 2] = data[index + 2];
        blurred[index + 3] = data[index + 3];
        continue;
      }
      blurred[index] = sumR / count;
      blurred[index + 1] = sumG / count;
      blurred[index + 2] = sumB / count;
      blurred[index + 3] = data[index + 3];
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const detail = data[i + channel] - blurred[i + channel];
      data[i + channel] = clampByte(data[i + channel] + detail * SHARPEN);
    }
  }
}

// Match the portrait's color to the class photo. `data` is the copy that is drawn.
function gradeImageData(data, target) {
  if (!target) return false;
  let count = 0;
  const sum = [0, 0, 0];
  const sumSq = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128 || !isPortraitSkin(data[i], data[i + 1], data[i + 2])) continue;
    count += 1;
    for (let c = 0; c < 3; c += 1) {
      sum[c] += data[i + c];
      sumSq[c] += data[i + c] * data[i + c];
    }
  }
  if (count < 24) return false;
  const mean = sum.map((value) => value / count);
  const scale = mean.map((_, c) => {
    const deviation = Math.sqrt(Math.max(0, sumSq[c] / count - mean[c] * mean[c]));
    const ratio = Math.min(1, target.std[c] / Math.max(deviation, 4));
    return 1 + (ratio - 1) * 0.32;
  });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    for (let c = 0; c < 3; c += 1) {
      data[i + c] = (data[i + c] - mean[c]) * scale[c] + target.mean[c];
    }
  }
  return true;
}

function skinStats(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const sampleContext = sample.getContext('2d', { willReadFrequently: true });
  sampleContext.drawImage(image, 0, 0);
  const data = sampleContext.getImageData(0, 0, width, height).data;
  let count = 0;
  const sum = [0, 0, 0];
  const sumSq = [0, 0, 0];
  const scaleX = width / PHOTO_WIDTH;
  const scaleY = height / PHOTO_HEIGHT;
  for (const outline of PERSON_OUTLINES) {
    const originX = Math.round(outline.anchor.x * scaleX);
    const originY = Math.round(outline.anchor.y * scaleY);
    for (let y = originY - 12; y <= originY + 12; y += 2) {
      if (y < 0 || y >= height) continue;
      for (let x = originX - 10; x <= originX + 10; x += 2) {
        if (x < 0 || x >= width) continue;
        const index = (y * width + x) * 4;
        if (!isPhotoSkin(data[index], data[index + 1], data[index + 2])) continue;
        count += 1;
        for (let c = 0; c < 3; c += 1) {
          sum[c] += data[index + c];
          sumSq[c] += data[index + c] * data[index + c];
        }
      }
    }
  }
  if (count < 40) return null;
  const mean = sum.map((value) => value / count);
  return {
    mean,
    std: sumSq.map((value, c) => Math.sqrt(Math.max(0, value / count - mean[c] ** 2))),
  };
}

export function createRegistrationPhoto(canvas, { onChange } = {}) {
  const context = canvas.getContext('2d');
  const backgrounds = {
    canteen: { photo: new Image(), template: new Image(), error: '' },
    br_class: { photo: new Image(), template: new Image(), error: '' },
  };
  let background = 'canteen';
  const loadedAssets = new Set();
  const participants = [];
  let skinRef = null;

  function portraitSkinRef() {
    if (!skinRef) skinRef = skinStats(backgrounds[background].template);
    return skinRef;
  }

  function tunePortrait(source) {
    const tuned = document.createElement('canvas');
    tuned.width = source.width;
    tuned.height = source.height;
    const tunedContext = tuned.getContext('2d', { willReadFrequently: true });
    tunedContext.drawImage(source, 0, 0);
    const image = tunedContext.getImageData(0, 0, tuned.width, tuned.height);
    gradeImageData(image.data, portraitSkinRef());
    enhancePortraitDefinition(image.data, tuned.width, tuned.height);
    tunedContext.putImageData(image, 0, 0);
    return tuned;
  }

  function draw() {
    const { photo, template } = backgrounds[background];
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.clearRect(0, 0, width, height);
    if (!loadedAssets.has(photo)) return;

    const scale = Math.min(width / PHOTO_WIDTH, height / PHOTO_HEIGHT);
    const offsetX = (width - PHOTO_WIDTH * scale) / 2;
    const offsetY = (height - PHOTO_HEIGHT * scale) / 2;
    context.drawImage(photo, offsetX, offsetY, PHOTO_WIDTH * scale, PHOTO_HEIGHT * scale);

    participants
      .map((participant, index) => ({ participant, index }))
      .filter(() => loadedAssets.has(template))
      .sort((a, b) => Math.floor(b.index / 10) - Math.floor(a.index / 10))
      .forEach(({ participant, index }) => {
        const outline = PERSON_OUTLINES[index];
        const faceX = offsetX + outline.x * scale;
        const faceY = offsetY + outline.y * scale;
        const rx = outline.rx * scale;
        const ry = outline.ry * scale;

        context.save();
        context.translate(offsetX, offsetY);
        context.scale(scale, scale);
        context.beginPath();
        outline.points.forEach(([pointX, pointY], pointIndex) => {
          if (pointIndex === 0) context.moveTo(pointX, pointY);
          else context.lineTo(pointX, pointY);
        });
        context.closePath();
        context.clip();
        context.drawImage(template, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
        context.restore();

        context.drawImage(participant.tuned, faceX - rx, faceY - ry, rx * 2, ry * 2);
      });

    context.save();
    context.translate(offsetX, offsetY);
    context.scale(scale, scale);
    traceTeacher(context);
    context.clip();
    context.drawImage(photo, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
    context.restore();
  }

  for (const [name, type, filename, source] of [
    ['canteen', 'photo', 'canteen_class_cat.png', new URL('./canteen_class_cat.png', import.meta.url).href],
    ['canteen', 'template', 'canteen_class.png', new URL('./canteen_class.png', import.meta.url).href],
    ['br_class', 'photo', 'br_class_cat.jpg', new URL('./br_class_cat.jpg', import.meta.url).href],
    ['br_class', 'template', 'br_class_boys.jpg', new URL('./br_class_boys.jpg', import.meta.url).href],
  ]) {
    const image = backgrounds[name][type];
    image.addEventListener('load', () => {
      loadedAssets.add(image);
      if (background === name) {
        draw();
        onChange?.();
      }
    }, { once: true });
    image.addEventListener('error', () => {
      const error = `Could not load ${filename}`;
      console.error(error);
      backgrounds[name].error = error;
      if (background === name) {
        canvas.dataset.error = error;
        onChange?.();
      }
    }, { once: true });
    image.src = source;
  }
  window.addEventListener('resize', draw);

  return {
    addPortrait(portrait, id = null) {
      if (participants.length >= FACE_SLOTS.length || !loadedAssets.has(backgrounds[background].template)) return false;
      participants.push({ id, tuned: tunePortrait(portrait) });
      draw();
      return true;
    },
    removePortrait(id) {
      const index = participants.findIndex((participant) => participant.id === id);
      if (index < 0) return false;
      participants.splice(index, 1);
      draw();
      onChange?.();
      return true;
    },
    clearPortraits() {
      participants.length = 0;
      draw();
      onChange?.();
    },
    fillAllPortraits(portrait) {
      if (!loadedAssets.has(backgrounds[background].template)) return false;
      const tuned = tunePortrait(portrait);
      participants.length = 0;
      for (let index = 0; index < FACE_SLOTS.length; index += 1) {
        participants.push({ tuned });
      }
      draw();
      return true;
    },
    get count() {
      return participants.length;
    },
    get capacity() {
      return FACE_SLOTS.length;
    },
    get failed() {
      return Boolean(canvas.dataset.error);
    },
    get ready() {
      const { photo, template } = backgrounds[background];
      return loadedAssets.has(photo) && loadedAssets.has(template);
    },
    get background() {
      return background;
    },
    setBackground(name) {
      if (!Object.hasOwn(backgrounds, name)) throw new RangeError(`Unknown registration background: ${name}`);
      if (name === background) return;
      background = name;
      skinRef = null;
      if (backgrounds[name].error) canvas.dataset.error = backgrounds[name].error;
      else delete canvas.dataset.error;
      draw();
      onChange?.();
    },
    dispose() {
      window.removeEventListener('resize', draw);
    },
  };
}

function traceTeacher(context) {
  context.beginPath();
  for (const command of teacherOutline.commands) {
    if (command[0] === 'M') context.moveTo(command[1], command[2]);
    else if (command[0] === 'L') context.lineTo(command[1], command[2]);
    else context.quadraticCurveTo(command[1], command[2], command[3], command[4]);
  }
  context.closePath();
}
