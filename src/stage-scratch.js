const SCRATCH_SCALE = 1.35;

export function createScratchStyle() {
  const randomBetween = (min, max) => min + Math.random() * (max - min);
  const spacing = randomBetween(8, 12) * SCRATCH_SCALE;
  const angle = Math.random() < 0.5 ? Math.PI / 4 : 3 * Math.PI / 4;
  return {
    angle: angle + randomBetween(-0.12, 0.12),
    centerX: randomBetween(-5, 5),
    centerY: randomBetween(-5, 5),
    halfLength: randomBetween(20, 28) * SCRATCH_SCALE,
    spacing,
    shadowWidth: randomBetween(6, 8) * SCRATCH_SCALE,
    highlightWidth: randomBetween(2.5, 3.8) * SCRATCH_SCALE,
    opacity: randomBetween(0.8, 1),
    highlightColor: ['#f52330', '#ff4556', '#e71e3d'][Math.floor(Math.random() * 3)],
    slashes: Array.from({ length: 3 }, (_, i) => ({
      offset: (i - 1) * spacing + randomBetween(-1.5, 1.5) * SCRATCH_SCALE,
      lengthScale: randomBetween(0.78, 1.12),
      curve: randomBetween(-5, 5) * SCRATCH_SCALE,
    })),
  };
}

export function drawScratches(ctx, cx, cy, progress, style, dpr) {
  cx += style.centerX * dpr;
  cy += style.centerY * dpr;
  const halfLength = style.halfLength * dpr;
  const alongX = Math.cos(style.angle);
  const alongY = Math.sin(style.angle);
  const acrossX = -alongY;
  const acrossY = alongX;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const slash of style.slashes) {
    const offset = slash.offset * dpr;
    const curve = slash.curve * dpr;
    const length = halfLength * slash.lengthScale;
    const startX = cx + acrossX * offset - alongX * length;
    const startY = cy + acrossY * offset - alongY * length;
    const endX = cx + acrossX * offset + alongX * length;
    const endY = cy + acrossY * offset + alongY * length;
    const controlX = cx + acrossX * offset + acrossX * curve;
    const controlY = cy + acrossY * offset + acrossY * curve;
    const partialControlX = startX + (controlX - startX) * progress;
    const partialControlY = startY + (controlY - startY) * progress;
    const partialEndX = partialControlX * (1 - progress)
      + (controlX + (endX - controlX) * progress) * progress;
    const partialEndY = partialControlY * (1 - progress)
      + (controlY + (endY - controlY) * progress) * progress;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(partialControlX, partialControlY, partialEndX, partialEndY);
    ctx.strokeStyle = '#69000c';
    ctx.globalAlpha = (0.55 + progress * 0.4) * style.opacity;
    ctx.lineWidth = style.shadowWidth * dpr;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(partialControlX, partialControlY, partialEndX, partialEndY);
    ctx.strokeStyle = style.highlightColor;
    ctx.globalAlpha = (0.55 + progress * 0.45) * style.opacity;
    ctx.lineWidth = style.highlightWidth * dpr;
    ctx.stroke();
  }
  ctx.restore();
}
