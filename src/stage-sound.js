const MEOW_OFFSET = 7;
const MEOW_DURATION = 1.35;

export function createScratchSound({
  onStatus = () => {},
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  fetchAudio = globalThis.fetch,
} = {}) {
  let context;
  let buffer = null;
  let failed = false;
  let status = 'idle';

  function setStatus(value) {
    status = value;
    onStatus(value);
  }

  function fail(error) {
    failed = true;
    console.error('Scratch sound unavailable', error);
    setStatus('error');
  }

  try {
    if (!AudioContextClass) throw new Error('Web Audio is not supported');
    context = new AudioContextClass();
  } catch (error) {
    fail(error);
    return { unlock() {}, play() {}, ready: Promise.resolve() };
  }

  const ready = Promise.resolve()
    .then(() => fetchAudio(new URL('./cat-angry-meow.mp3', import.meta.url).href))
    .then((response) => {
      if (!response.ok) throw new Error(`Scratch sound request failed: ${response.status}`);
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .then((decoded) => {
      if (decoded.duration < MEOW_OFFSET + MEOW_DURATION) {
        throw new Error('Scratch sound recording is too short');
      }
      buffer = decoded;
      if (status === 'loading') setStatus(context.state === 'running' ? 'ready' : 'blocked');
    })
    .catch(fail);

  function unlock() {
    if (failed) return Promise.resolve();
    if (context.state === 'running') {
      if (status === 'blocked') setStatus(buffer ? 'ready' : 'loading');
      return Promise.resolve();
    }
    try {
      return context.resume().then(() => {
        if (failed) return;
        if (context.state !== 'running') {
          setStatus('blocked');
        } else if (status === 'blocked') {
          setStatus(buffer ? 'ready' : 'loading');
        }
      }).catch((error) => {
        if (failed) return;
        console.warn('Scratch sound requires a user gesture', error);
        setStatus('blocked');
      });
    } catch (error) {
      console.warn('Scratch sound requires a user gesture', error);
      setStatus('blocked');
      return Promise.resolve();
    }
  }

  function play() {
    if (failed) return;
    if (context.state !== 'running') {
      setStatus('blocked');
      return;
    }
    if (!buffer) {
      setStatus('loading');
      return;
    }
    try {
      const source = context.createBufferSource();
      const volume = context.createGain();
      source.buffer = buffer;
      volume.gain.value = 0.8;
      source.connect(volume);
      volume.connect(context.destination);
      source.start(0, MEOW_OFFSET, MEOW_DURATION);
    } catch (error) {
      fail(error);
    }
  }

  return { unlock, play, ready };
}
