import boyOutlines from './polygons_boy.json';
import girlOutlines from './polygons_girl.json';

const PHOTO_WIDTH = 1408;
const PHOTO_HEIGHT = 768;

const FACE_SLOTS = [
  ...makeRow([[580, 437], [836, 440], [463, 439], [958, 436], [351, 429], [1075, 432], [248, 433], [1181, 446], [142, 426], [1293, 434]], 29, 39),
  ...makeRow([[653, 326], [772, 343], [543, 330], [880, 342], [443, 325], [981, 341], [344, 325], [1077, 345], [243, 326], [1177, 338]], 27, 36),
  ...makeRow([[667, 214], [765, 240], [579, 226], [853, 234], [490, 223], [942, 220], [401, 238], [1034, 237], [311, 220], [1134, 224]], 24, 34),
];

const PERSON_OUTLINES = {
  girls: mapPersonOutlines(girlOutlines.polygons),
  boys: mapPersonOutlines(boyOutlines.polygons),
};

function makeRow(points, rx, ry) {
  return points.map(([x, y]) => ({ x, y, rx, ry }));
}

function mapPersonOutlines(polygons) {
  const unused = polygons.map((polygon) => {
    const minY = Math.min(...polygon.points.map(([, y]) => y));
    const headPoints = polygon.points.filter(([, y]) => y <= minY + 70);
    const anchor = headPoints.reduce(
      (sum, [x, y]) => ({ x: sum.x + x / headPoints.length, y: sum.y + y / headPoints.length }),
      { x: 0, y: 0 },
    );
    return { points: polygon.points, anchor };
  });

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
    return nearest;
  });
}

export function createRegistrationPhoto(canvas) {
  const context = canvas.getContext('2d');
  const photo = new Image();
  const templates = {
    girls: new Image(),
    boys: new Image(),
  };
  const loadedAssets = new Set();
  const participants = [];
  let photoLoaded = false;

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.clearRect(0, 0, width, height);
    if (!photoLoaded) return;

    const scale = Math.min(width / PHOTO_WIDTH, height / PHOTO_HEIGHT);
    const offsetX = (width - PHOTO_WIDTH * scale) / 2;
    const offsetY = (height - PHOTO_HEIGHT * scale) / 2;
    context.drawImage(photo, offsetX, offsetY, PHOTO_WIDTH * scale, PHOTO_HEIGHT * scale);

    participants
      .map((participant, index) => ({ participant, index }))
      .filter(({ participant }) => loadedAssets.has(templates[participant.group]))
      .sort((a, b) => Math.floor(b.index / 10) - Math.floor(a.index / 10))
      .forEach(({ participant, index }) => {
        const slot = FACE_SLOTS[index];
        const outline = PERSON_OUTLINES[participant.group][index];
        const x = offsetX + slot.x * scale;
        const y = offsetY + slot.y * scale;
        const rx = slot.rx * scale;
        const ry = slot.ry * scale;

        context.save();
        context.translate(x, y);
        context.scale(scale, scale);
        context.translate(-outline.anchor.x, -outline.anchor.y);
        context.beginPath();
        outline.points.forEach(([pointX, pointY], pointIndex) => {
          if (pointIndex === 0) context.moveTo(pointX, pointY);
          else context.lineTo(pointX, pointY);
        });
        context.closePath();
        context.clip();
        context.drawImage(templates[participant.group], 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
        context.restore();

        context.drawImage(participant.portrait, x - rx, y - ry, rx * 2, ry * 2);
      });

    context.save();
    context.translate(offsetX, offsetY);
    context.scale(scale, scale);
    traceTeacher(context);
    context.clip();
    context.drawImage(photo, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
    context.restore();
  }

  function onAssetLoaded(event) {
    loadedAssets.add(event.currentTarget);
    if (event.currentTarget === photo) photoLoaded = true;
    draw();
  }

  for (const [image, filename, source] of [
    [photo, 'br_class_cat.jpg', new URL('./br_class_cat.jpg', import.meta.url).href],
    [templates.girls, 'br_class_girls.jpg', new URL('./br_class_girls.jpg', import.meta.url).href],
    [templates.boys, 'br_class_boys.jpg', new URL('./br_class_boys.jpg', import.meta.url).href],
  ]) {
    image.addEventListener('load', onAssetLoaded, { once: true });
    image.addEventListener('error', () => {
      canvas.dataset.error = `Could not load ${filename}`;
    }, { once: true });
    image.src = source;
  }
  window.addEventListener('resize', draw);

  return {
    addPortrait(portrait, group) {
      if (participants.length >= FACE_SLOTS.length || !templates[group] || !loadedAssets.has(templates[group])) return false;
      participants.push({ portrait, group });
      draw();
      return true;
    },
    switchLastGroup() {
      const last = participants[participants.length - 1];
      if (!last) return '';
      last.group = last.group === 'girls' ? 'boys' : 'girls';
      draw();
      return last.group;
    },
    get count() {
      return participants.length;
    },
    get lastGroup() {
      return participants[participants.length - 1]?.group || '';
    },
    get nextGroup() {
      return this.lastGroup || 'girls';
    },
    get capacity() {
      return FACE_SLOTS.length;
    },
    get failed() {
      return Boolean(canvas.dataset.error);
    },
    get ready() {
      return photoLoaded && Object.values(templates).every((template) => loadedAssets.has(template));
    },
    dispose() {
      window.removeEventListener('resize', draw);
    },
  };
}

function traceTeacher(context) {
  context.beginPath();
  context.moveTo(684, 400);
  context.lineTo(682, 385);
  context.quadraticCurveTo(686, 374, 694, 386);
  context.lineTo(702, 398);
  context.quadraticCurveTo(712, 395, 721, 398);
  context.lineTo(731, 384);
  context.quadraticCurveTo(740, 374, 743, 388);
  context.lineTo(739, 408);
  context.quadraticCurveTo(744, 429, 734, 447);
  context.lineTo(746, 453);
  context.quadraticCurveTo(764, 455, 769, 479);
  context.lineTo(776, 552);
  context.lineTo(768, 574);
  context.lineTo(753, 585);
  context.lineTo(744, 579);
  context.lineTo(755, 598);
  context.lineTo(744, 614);
  context.lineTo(749, 657);
  context.lineTo(751, 686);
  context.lineTo(770, 716);
  context.lineTo(762, 727);
  context.lineTo(731, 725);
  context.lineTo(716, 699);
  context.lineTo(711, 651);
  context.lineTo(707, 651);
  context.lineTo(701, 699);
  context.lineTo(685, 725);
  context.lineTo(654, 727);
  context.lineTo(649, 717);
  context.lineTo(667, 686);
  context.lineTo(670, 657);
  context.lineTo(674, 614);
  context.lineTo(662, 598);
  context.lineTo(671, 580);
  context.lineTo(662, 586);
  context.lineTo(648, 580);
  context.lineTo(642, 568);
  context.lineTo(650, 552);
  context.lineTo(652, 479);
  context.quadraticCurveTo(658, 456, 675, 453);
  context.lineTo(687, 447);
  context.quadraticCurveTo(678, 430, 684, 400);
  context.closePath();
}
