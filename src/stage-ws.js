const DEFAULT_WS = 'ws://localhost:8787';

export function resolveStageWsUrl() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get('ws');
  if (fromQuery) return fromQuery;
  const fromEnv = import.meta.env.VITE_STAGE_WS_URL;
  if (fromEnv) return fromEnv;
  return DEFAULT_WS;
}

/**
 * @typedef {{ type: 'catEat', id?: string }} StageWsMessage
 */

/**
 * @param {(msg: StageWsMessage) => void} onMessage
 * @param {{ url?: string, onStatus?: (text: string) => void }} [options]
 */
export function connectStageWebSocket(onMessage, options = {}) {
  const url = options.url ?? resolveStageWsUrl();
  let socket = null;
  let closed = false;

  function dispatch(raw) {
    let msg;
    try {
      msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      options.onStatus?.('Ignored non-JSON WebSocket payload');
      return;
    }
    if (msg?.type === 'catEat') {
      onMessage({ type: 'catEat', id: msg.id });
      return;
    }
    options.onStatus?.(`Unknown message type: ${msg?.type ?? '?'}`);
  }

  function connect() {
    if (closed) return;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      options.onStatus?.(`WebSocket failed: ${error.message}`);
      return;
    }
    socket.addEventListener('open', () => options.onStatus?.(`WebSocket connected (${url})`));
    socket.addEventListener('message', (event) => dispatch(event.data));
    socket.addEventListener('close', () => {
      options.onStatus?.('WebSocket closed — demo keys still work (E / postMessage)');
      socket = null;
    });
    socket.addEventListener('error', () => {
      options.onStatus?.('WebSocket error — use E key or npm run stage:ws-demo');
    });
  }

  connect();

  function onWindowMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.channel !== 'stage-ws') return;
    dispatch(data.payload);
  }

  window.addEventListener('message', onWindowMessage);

  return {
    /** Inject a message locally (same schema as WebSocket). */
    inject(payload) {
      dispatch(payload);
    },
    close() {
      closed = true;
      window.removeEventListener('message', onWindowMessage);
      socket?.close();
    },
  };
}

/** postMessage helper for tests and parent iframes. */
export function postStageWsMessage(payload) {
  window.postMessage({ channel: 'stage-ws', payload }, '*');
}
