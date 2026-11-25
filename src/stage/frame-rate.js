export function createFrameRateLimiter(getFps) {
  let previousFps = 0;
  let nextFrameAt = 0;

  return (now) => {
    const fps = Number(typeof getFps === 'function' ? getFps() : 0);
    if (!Number.isFinite(fps) || fps <= 0) return true;
    if (fps !== previousFps) {
      previousFps = fps;
      nextFrameAt = now;
    }
    if (now + 0.5 < nextFrameAt) return false;

    const interval = 1000 / fps;
    nextFrameAt += interval;
    while (nextFrameAt <= now) nextFrameAt += interval;
    return true;
  };
}
