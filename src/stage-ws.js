const DEFAULT_WS = 'ws://localhost:8787';

export function resolveStageWsUrl() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get('ws');
  if (fromQuery) return fromQuery;
  const fromEnv = import.meta.env.VITE_STAGE_WS_URL;
  if (fromEnv) return fromEnv;
  const host = location.hostname;
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `ws://${host}:8787`;
  return DEFAULT_WS;
}

export const STAGE_SIGNAL_CHANNEL = 'mouse-stage';

const PROP_KINDS = new Set(['figure', 'drawing', 'box', 'poster', 'note']);

/**
 * @typedef {{
 *   type: 'catEat' | 'catSweep' | 'restartAll' | 'admit' | 'scratch' | 'prop' | 'uniform' | 'spriteScale' | 'camera' | 'hud',
 *   id?: string,
 *   raw?: string,
 *   kind?: string,
 *   enabled?: boolean,
 *   delta?: number,
 *   move?: number[],
 *   signalId?: string,
 * }} StageWsMessage
 */

export function isStageSignal(message) {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === 'catEat' || message.type === 'catSweep' || message.type === 'restartAll') return true;
  if (message.type === 'admit' || message.type === 'scratch' || message.type === 'uniform' || message.type === 'hud') return true;
  if (message.type === 'prop') return PROP_KINDS.has(message.kind);
  if (message.type === 'spriteScale') return Number.isFinite(Number(message.delta)) && Number(message.delta) !== 0;
  if (message.type === 'camera') return Array.isArray(message.move);
  return false;
}

/**
 * @param {(msg: StageWsMessage) => void} onMessage
 * @param {{ url?: string, onStatus?: (text: string) => void }} [options]
 */
export function connectStageWebSocket(onMessage, options = {}) {
  const url = options.url ?? resolveStageWsUrl();
  let socket = null;
  let closed = false;
  const pending = [];
  const recentSignals = new Set();
  let channel = null;

  function remember(message) {
    if (!message.signalId) return true;
    if (recentSignals.has(message.signalId)) return false;
    recentSignals.add(message.signalId);
    setTimeout(() => recentSignals.delete(message.signalId), 4000);
    return true;
  }

  function dispatch(raw) {
    let msg;
    try {
      msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      options.onStatus?.('Ignored non-JSON WebSocket payload');
      return;
    }
    if (msg?.type === 'hello') return;
    if (!isStageSignal(msg)) {
      options.onStatus?.(`Unknown message type: ${msg?.type ?? '?'}`);
      return;
    }
    if (!remember(msg)) return;
    onMessage(msg);
  }

  function send(payload) {
    const data = JSON.stringify(payload);
    if (socket?.readyState === WebSocket.OPEN) socket.send(data);
    else if (pending.length < 8) pending.push(data);
  }

  function connect() {
    if (closed) return;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      options.onStatus?.(`WebSocket failed: ${error.message}`);
      return;
    }
    socket.addEventListener('open', () => {
      options.onStatus?.(`WebSocket connected (${url})`);
      while (pending.length && socket?.readyState === WebSocket.OPEN) socket.send(pending.shift());
    });
    socket.addEventListener('message', (event) => dispatch(event.data));
    socket.addEventListener('close', () => {
      options.onStatus?.('WebSocket closed — same-browser stage tabs still receive signals');
      socket = null;
    });
    socket.addEventListener('error', () => {
      options.onStatus?.('WebSocket error — same-browser stage tabs still receive signals');
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

  try {
    channel = new BroadcastChannel(STAGE_SIGNAL_CHANNEL);
    channel.addEventListener('message', (event) => dispatch(event.data));
  } catch (error) {
    console.warn('Stage signals cannot cross browser tabs', error);
  }

  return {
    /** Inject a message locally (same schema as WebSocket). */
    inject(payload) {
      dispatch(payload);
    },
    send,
    close() {
      closed = true;
      window.removeEventListener('message', onWindowMessage);
      channel?.close();
      socket?.close();
    },
  };
}

/** Send one show event to every stage view on this browser and over WebSocket. */
export function connectStageSignals(options = {}) {
  const connection = connectStageWebSocket(options.onMessage ?? (() => {}), options);
  return {
    send(payload) {
      const message = {
        ...payload,
        signalId: payload?.signalId || crypto.randomUUID(),
      };
      try {
        const channel = new BroadcastChannel(STAGE_SIGNAL_CHANNEL);
        channel.postMessage(message);
        channel.close();
      } catch (error) {
        console.warn('Stage signal was not broadcast to other tabs', error);
      }
      connection.send(message);
    },
    close() {
      connection.close();
    },
  };
}

/** postMessage helper for tests and parent iframes. */
export function postStageWsMessage(payload) {
  window.postMessage({ channel: 'stage-ws', payload }, '*');
}
