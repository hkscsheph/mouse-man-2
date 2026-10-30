const PHOTO_WIDTH = 1408;
const PHOTO_HEIGHT = 768;

const FACE_SLOTS = [
  ...[306, 401, 490, 580, 668, 762, 851, 940, 1034, 1132].map((x) => ({
    x, y: 220, rx: 24, ry: 34,
  })),
  ...[243, 345, 441, 546, 653, 770, 879, 981, 1075, 1177].map((x) => ({
    x, y: 333, rx: 27, ry: 36,
  })),
  ...[142, 243, 349, 458, 572, 839, 964, 1076, 1188, 1285].map((x) => ({
    x, y: 442, rx: 29, ry: 39,
  })),
];

export function createRegistrationPhoto(canvas) {
  const context = canvas.getContext('2d');
  const photo = new Image();
  const portraits = [];
  let loaded = false;

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.clearRect(0, 0, width, height);
    if (!loaded) return;

    const scale = Math.min(width / PHOTO_WIDTH, height / PHOTO_HEIGHT);
    const offsetX = (width - PHOTO_WIDTH * scale) / 2;
    const offsetY = (height - PHOTO_HEIGHT * scale) / 2;
    context.drawImage(photo, offsetX, offsetY, PHOTO_WIDTH * scale, PHOTO_HEIGHT * scale);

    FACE_SLOTS.forEach((slot, index) => {
      const x = offsetX + slot.x * scale;
      const y = offsetY + slot.y * scale;
      const rx = slot.rx * scale;
      const ry = slot.ry * scale;
      const portrait = portraits[index];

      context.save();
      context.beginPath();
      context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      context.clip();
      if (portrait) {
        context.drawImage(portrait, x - rx, y - ry, rx * 2, ry * 2);
      } else {
        context.fillStyle = '#000c';
        context.fillRect(x - rx, y - ry, rx * 2, ry * 2);
      }
      context.restore();

      context.save();
      // context.strokeStyle = '#7d1422';
      // context.lineWidth = Math.max(2, 2.5 * scale);
      context.beginPath();
      context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      context.stroke();
      if (!portrait) {
        context.fillStyle = '#c51e32';
        context.font = `bold ${Math.max(20, ry * 1.6)}px "Segoe UI", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('?', x, y);
      }
      context.restore();
    });
  }

  photo.addEventListener('load', () => {
    loaded = true;
    draw();
  }, { once: true });
  photo.addEventListener('error', () => {
    canvas.dataset.error = 'Could not load the registration class photo';
  }, { once: true });
  photo.src = new URL('./br_class.jpg', import.meta.url).href;
  window.addEventListener('resize', draw);

  return {
    addPortrait(portrait) {
      if (portraits.length >= FACE_SLOTS.length) return false;
      portraits.push(portrait);
      draw();
      return true;
    },
    get count() {
      return portraits.length;
    },
    get capacity() {
      return FACE_SLOTS.length;
    },
    get failed() {
      return Boolean(canvas.dataset.error);
    },
    dispose() {
      window.removeEventListener('resize', draw);
    },
  };
}
