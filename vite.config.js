import { defineConfig } from 'vite';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import net from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeStoredMice } from './src/local-transfer-store.js';

const ffmpegPath = createRequire(import.meta.url)('ffmpeg-static');
const legacyMouseStore = resolve(fileURLToPath(new URL('.', import.meta.url)), '.dev-data', 'mice');
const localTransferStore = process.env.TRANSFER_DIR
  ? resolve(process.env.TRANSFER_DIR)
  : resolve(fileURLToPath(new URL('.', import.meta.url)), '.dev-data', 'transfer');
const transferPerspectivePath = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  'src',
  'transfer-perspective.json',
);
const perspectiveLimits = {
  fov: [20, 70],
  rowRise: [0.2, 0.9],
  cameraHeight: [0.3, 2.5],
  cameraX: [-4, 4],
  cameraDepthOffset: [-2, 10],
  cameraTargetOffsetY: [-2, 2],
};

function perspectiveConfig(input) {
  const config = {};
  for (const [key, [min, max]] of Object.entries(perspectiveLimits)) {
    const value = Number(input?.[key]);
    if (!Number.isFinite(value)) throw new Error(`invalid ${key}`);
    config[key] = Math.round(Math.min(max, Math.max(min, value)) * 1000) / 1000;
  }
  return config;
}

async function localTransferPerspectiveApi(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  if (req.method === 'GET') {
    try {
      sendJson(res, 200, JSON.parse(await readFile(transferPerspectivePath, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 200, perspectiveConfig({
          fov: 38,
          rowRise: 0.8,
          cameraHeight: 1.8,
          cameraX: 0,
          cameraDepthOffset: 0,
          cameraTargetOffsetY: 0,
        }));
        return;
      }
      console.error('transfer perspective read failed', error);
      sendJson(res, 500, { error: 'perspective read failed' });
    }
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  let config;
  try {
    config = perspectiveConfig(await readJsonBody(req));
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'invalid perspective' });
    return;
  }
  const temporaryPath = `${transferPerspectivePath}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await rm(transferPerspectivePath, { force: true });
    await rename(temporaryPath, transferPerspectivePath);
    sendJson(res, 200, config);
  } catch (error) {
    console.error('transfer perspective write failed', error);
    sendJson(res, 500, { error: 'perspective write failed' });
  }
}
const validMouseId = /^[a-z0-9]{8,32}$/i;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (status === 204) {
    res.end();
    return;
  }
  res.end(JSON.stringify(body));
}

async function readJsonBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function localMouseApi(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET') {
    const id = new URL(req.url, 'http://localhost').searchParams.get('id');
    if (!id) {
      sendJson(res, 200, { ok: true, service: 'mouse', local: true });
      return;
    }
    if (!validMouseId.test(id)) {
      sendJson(res, 400, { error: 'invalid id' });
      return;
    }
    try {
      const record = await readStoredRecord(id);
      if (!record?.snapshot) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      sendJson(res, 200, record.snapshot);
    } catch (error) {
      console.error('local mouse API read failed', error);
      sendJson(res, 500, { error: 'storage read failed' });
    }
    return;
  }

  if (req.method === 'POST') {
    let snapshot;
    try {
      snapshot = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.message === 'request body too large' ? 413 : 400, {
        error: error.message === 'request body too large' ? error.message : 'invalid json',
      });
      return;
    }
    const id = String(snapshot?.id || '');
    if (!validMouseId.test(id) || !snapshot?.traits || !snapshot?.patches) {
      sendJson(res, 400, { error: 'invalid snapshot' });
      return;
    }
    try {
      const existing = await readStoredRecord(id);
      await writeStoredRecord({
        id,
        createdAt: existing?.createdAt || Number(snapshot.createdAt) || Date.now(),
        ...(existing?.portrait ? { portrait: existing.portrait } : {}),
        snapshot: { ...snapshot, id },
      });
      sendJson(res, 200, { id, remote: true });
    } catch (error) {
      console.error('local mouse API write failed', error);
      sendJson(res, 500, { error: 'storage write failed' });
    }
    return;
  }

  sendJson(res, 405, { error: 'method not allowed' });
}

function transferRecordPath(id) {
  return resolve(localTransferStore, `${id}.json`);
}

async function readStoredRecord(id) {
  try {
    const parsed = JSON.parse(await readFile(transferRecordPath(id), 'utf8'));
    if (parsed?.snapshot?.traits && parsed?.snapshot?.patches) return { ...parsed, id };
    if (parsed?.traits && parsed?.patches) {
      return {
        id,
        createdAt: Number(parsed.createdAt) || Date.now(),
        snapshot: { ...parsed, id },
      };
    }
    return null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeStoredRecord(record) {
  await mkdir(localTransferStore, { recursive: true });
  const finalPath = transferRecordPath(record.id);
  const temporaryPath = `${finalPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(record), 'utf8');
  await rm(finalPath, { force: true });
  await rename(temporaryPath, finalPath);
}

async function moveLegacyMiceIntoTransfer() {
  let names = [];
  try {
    names = await readdir(legacyMouseStore);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -'.json'.length);
    if (!validMouseId.test(id)) continue;
    const mouse = JSON.parse(await readFile(resolve(legacyMouseStore, name), 'utf8'));
    if (!mouse?.traits || !mouse?.patches) continue;
    const existing = await readStoredRecord(id);
    await writeStoredRecord({
      id,
      createdAt: existing?.createdAt || Number(mouse.createdAt) || Date.now(),
      ...(existing?.portrait ? { portrait: existing.portrait } : {}),
      snapshot: { ...(existing?.snapshot || {}), ...mouse, id },
    });
    await rm(resolve(legacyMouseStore, name), { force: true });
  }
}

function transferPhotoPath(id) {
  return resolve(localTransferStore, `${id}.png`);
}

async function localTransferPhotoApi(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  const id = new URL(req.url, 'http://localhost').searchParams.get('id');
  if (!validMouseId.test(String(id || ''))) {
    sendJson(res, 400, { error: 'invalid id' });
    return;
  }
  if (req.method === 'GET') {
    try {
      const body = await readFile(transferPhotoPath(id));
      res.statusCode = 200;
      res.setHeader('content-type', 'image/png');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('access-control-allow-origin', '*');
      res.end(body);
    } catch (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      console.error('local transfer photo read failed', error);
      sendJson(res, 500, { error: 'storage read failed' });
    }
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) {
      sendJson(res, 413, { error: 'request body too large' });
      return;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  if (body.length < 8 || body[0] !== 0x89 || body[1] !== 0x50) {
    sendJson(res, 400, { error: 'invalid png' });
    return;
  }
  const finalPath = transferPhotoPath(id);
  const temporaryPath = `${finalPath}.tmp`;
  try {
    await mkdir(localTransferStore, { recursive: true });
    await writeFile(temporaryPath, body);
    await rm(finalPath, { force: true });
    await rename(temporaryPath, finalPath);
    sendJson(res, 200, { id });
  } catch (error) {
    console.error('local transfer photo write failed', error);
    sendJson(res, 500, { error: 'storage write failed' });
  }
}

async function localTransferApi(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'DELETE') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      sendJson(res, 403, { error: 'cross-origin delete is not allowed' });
      return;
    }
    const id = new URL(req.url, 'http://localhost').searchParams.get('id');
    const stores = [localTransferStore, legacyMouseStore];
    if (id && !validMouseId.test(id)) {
      sendJson(res, 400, { error: 'invalid id' });
      return;
    }
    try {
      const removed = await removeStoredMice(stores, id);
      if (id && !removed.has(id.toLowerCase())) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      sendJson(res, 200, id ? { id } : { deleted: removed.size });
    } catch (error) {
      console.error('local transfer delete failed', error);
      sendJson(res, 500, { error: 'storage delete failed' });
    }
    return;
  }

  if (req.method === 'GET') {
    const id = new URL(req.url, 'http://localhost').searchParams.get('id');
    if (!id) {
      let names = [];
      try {
        names = await readdir(localTransferStore);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const entries = [];
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        try {
          const record = JSON.parse(await readFile(resolve(localTransferStore, name), 'utf8'));
          if (!validMouseId.test(String(record?.id || '')) || !record?.portrait) continue;
          entries.push({ id: record.id, createdAt: Number(record.createdAt) || 0 });
        } catch (error) {
          console.error('local transfer list skipped', name, error);
        }
      }
      entries.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      sendJson(res, 200, { ok: true, entries });
      return;
    }
    if (!validMouseId.test(id)) {
      sendJson(res, 400, { error: 'invalid id' });
      return;
    }
    try {
      const record = await readStoredRecord(id);
      if (!record?.snapshot) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      sendJson(res, 200, record);
    } catch (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      console.error('local transfer read failed', error);
      sendJson(res, 500, { error: 'storage read failed' });
    }
    return;
  }

  if (req.method === 'POST') {
    let record;
    try {
      record = await readJsonBody(req, 8 * 1024 * 1024);
    } catch (error) {
      sendJson(res, error.message === 'request body too large' ? 413 : 400, {
        error: error.message === 'request body too large' ? error.message : 'invalid json',
      });
      return;
    }
    const id = String(record?.id || '');
    const portrait = String(record?.portrait || '');
    const snapshot = record?.snapshot;
    if (
      !validMouseId.test(id)
      || snapshot?.id !== id
      || !snapshot?.traits
      || !snapshot?.patches
      || !portrait.startsWith('data:image/')
    ) {
      sendJson(res, 400, { error: 'invalid transfer record' });
      return;
    }
    const existing = await readStoredRecord(id);
    const stored = {
      id,
      createdAt: Number(record.createdAt) || existing?.createdAt || Date.now(),
      portrait,
      snapshot: { ...(existing?.snapshot || {}), ...snapshot, id },
    };
    try {
      await writeStoredRecord(stored);
      sendJson(res, 200, { id });
    } catch (error) {
      console.error('local transfer write failed', error);
      sendJson(res, 500, { error: 'storage write failed' });
    }
    return;
  }

  sendJson(res, 405, { error: 'method not allowed' });
}

function printerTarget() {
  // shortcut: this RP80 is on the LAN; set PRINTER_HOST when it moves
  return {
    host: process.env.PRINTER_HOST || '192.168.99.15',
    port: Number(process.env.PRINTER_PORT || 9100),
  };
}

const PRINTER_PROBE_MS = 800;
const PRINTER_DOWN_MS = 20000;
const PRINTER_UP_MS = 5000;
let printerProbe = { at: 0, ok: false };
let printerProbeTask = null;

function connectPrinter(timeoutMs) {
  const { host, port } = printerTarget();
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const socket = net.connect(port, host);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        socket.destroy();
        reject(error);
        return;
      }
      resolvePromise(socket);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
    socket.once('connect', () => finish());
    socket.once('error', finish);
  });
}

function probePrinter() {
  const now = Date.now();
  const ttl = printerProbe.ok ? PRINTER_UP_MS : PRINTER_DOWN_MS;
  if (printerProbe.at && now - printerProbe.at < ttl) return Promise.resolve(printerProbe.ok);
  if (!printerProbeTask) {
    printerProbeTask = connectPrinter(PRINTER_PROBE_MS)
      .then((socket) => {
        socket.end();
        printerProbe = { at: Date.now(), ok: true };
        return true;
      })
      .catch(() => {
        printerProbe = { at: Date.now(), ok: false };
        return false;
      })
      .finally(() => {
        printerProbeTask = null;
      });
  }
  return printerProbeTask;
}

async function localPrintApi(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  if (req.method === 'GET') {
    if (!(await probePrinter())) {
      sendJson(res, 502, { error: 'printer unavailable' });
      return;
    }
    sendJson(res, 200, { ok: true, ...printerTarget() });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  if (!(await probePrinter())) {
    req.resume();
    sendJson(res, 502, { error: 'printer unavailable' });
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      sendJson(res, 413, { error: 'too large' });
      return;
    }
    chunks.push(chunk);
  }
  const payload = Buffer.concat(chunks);
  if (!payload.length) {
    sendJson(res, 400, { error: 'empty' });
    return;
  }
  const socket = await connectPrinter(PRINTER_PROBE_MS).catch((error) => {
    printerProbe = { at: Date.now(), ok: false };
    throw error;
  });
  await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout'));
    }, PRINTER_PROBE_MS);
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.end(payload, () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
  printerProbe = { at: Date.now(), ok: true };
  sendJson(res, 200, { ok: true });
}

function isLocalCameraHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

function localCameraUrl(req) {
  let parsed;
  try {
    parsed = new URL(new URL(req.url, 'http://localhost').searchParams.get('url') || '');
  } catch {
    return null;
  }
  const stream = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    || parsed.protocol === 'rtsp:' || parsed.protocol === 'rtsps:';
  if (!stream || !isLocalCameraHost(parsed.hostname)) return null;
  return parsed;
}

function redactCamera(text) {
  return String(text).replace(/rtsps?:\/\/\S+/gi, 'rtsp://camera');
}

function streamRtsp(target, req, res) {
  if (!ffmpegPath) {
    sendJson(res, 500, { error: 'ffmpeg is required for an rtsp camera' });
    return;
  }
  const child = spawn(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-rtsp_transport', 'tcp',
    '-i', target.href,
    '-an',
    '-vf', 'fps=8',
    '-q:v', '6',
    '-f', 'mpjpeg',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let started = false;
  let settled = false;
  let stderr = '';
  const stop = () => {
    if (child.exitCode === null && !child.killed) child.kill();
  };
  const fail = (status, error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    stop();
    console.error('rtsp camera failed', redactCamera(stderr || error));
    if (!res.headersSent) sendJson(res, status, { error });
    else res.destroy();
  };
  const timer = setTimeout(() => fail(504, 'camera timed out'), 12000);
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-400);
  });
  child.stdout.once('data', (chunk) => {
    if (settled) return;
    started = true;
    clearTimeout(timer);
    res.statusCode = 200;
    res.setHeader('content-type', 'multipart/x-mixed-replace; boundary=ffmpeg');
    res.setHeader('cache-control', 'no-store');
    res.write(chunk);
    child.stdout.pipe(res);
  });
  child.on('error', (error) => fail(500, error.message || 'ffmpeg failed to start'));
  child.on('exit', () => {
    if (!started) fail(502, 'camera stream failed');
    else if (!res.writableEnded) res.end();
  });
  req.once('close', stop);
  res.once('close', stop);
}

function localIpcamApi(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  const target = localCameraUrl(req);
  if (!target) {
    sendJson(res, 400, { error: 'camera must be an http or rtsp address on the local network' });
    return;
  }
  if (target.protocol === 'rtsp:' || target.protocol === 'rtsps:') {
    streamRtsp(target, req, res);
    return;
  }
  const pump = (next, redirectsLeft) => {
    const lib = next.protocol === 'https:' ? https : http;
    const upstream = lib.request(next, { method: 'GET', headers: { accept: '*/*' } }, (incoming) => {
      const location = incoming.headers.location;
      if (incoming.statusCode >= 300 && incoming.statusCode < 400 && location && redirectsLeft > 0) {
        incoming.resume();
        upstream.destroy();
        let redirected;
        try {
          redirected = new URL(location, next);
        } catch {
          sendJson(res, 502, { error: 'camera redirect is invalid' });
          return;
        }
        if ((redirected.protocol !== 'http:' && redirected.protocol !== 'https:') || !isLocalCameraHost(redirected.hostname)) {
          sendJson(res, 400, { error: 'camera must be an http address on the local network' });
          return;
        }
        pump(redirected, redirectsLeft - 1);
        return;
      }
      res.statusCode = incoming.statusCode || 502;
      const type = incoming.headers['content-type'];
      if (type) res.setHeader('content-type', type);
      res.setHeader('cache-control', 'no-store');
      incoming.pipe(res);
    });
    upstream.on('error', (error) => {
      console.error('ip camera proxy failed', error);
      if (!res.headersSent) sendJson(res, 502, { error: 'camera unreachable' });
      else res.destroy();
    });
    const stop = () => upstream.destroy();
    req.once('close', stop);
    res.once('close', stop);
    upstream.end();
  };
  pump(target, 3);
}

function localMouseApiPlugin() {
  function register(server) {
    moveLegacyMiceIntoTransfer().catch((error) => {
      console.error('could not move mice json into the shared folder', error);
    });
    server.middlewares.use('/api/mouse', (req, res, next) => {
      localMouseApi(req, res).catch((error) => {
        console.error('local mouse API request failed', error);
        if (res.headersSent) {
          next(error);
          return;
        }
        sendJson(res, 500, { error: 'storage request failed' });
      });
    });
    server.middlewares.use('/api/transfer', (req, res, next) => {
      const kind = new URL(req.url, 'http://localhost').searchParams.get('kind');
      const handler = kind === 'photo'
        ? localTransferPhotoApi
        : kind === 'perspective'
          ? localTransferPerspectiveApi
          : localTransferApi;
      handler(req, res).catch((error) => {
        console.error('local transfer API request failed', error);
        if (res.headersSent) {
          next(error);
          return;
        }
        sendJson(res, 500, { error: 'storage request failed' });
      });
    });
    server.middlewares.use('/api/ipcam', (req, res, next) => {
      try {
        localIpcamApi(req, res);
      } catch (error) {
        console.error('ip camera proxy failed', error);
        if (res.headersSent) {
          next(error);
          return;
        }
        sendJson(res, 500, { error: 'camera request failed' });
      }
    });
    server.middlewares.use('/api/print', (req, res, next) => {
      localPrintApi(req, res).catch((error) => {
        // GET is the status poll; an unreachable printer is a normal result, not a failed job.
        if (req.method !== 'GET') console.error('local print failed', error);
        if (res.headersSent) {
          next(error);
          return;
        }
        sendJson(res, 502, { error: 'printer unavailable' });
      });
    });
  }

  return {
    name: 'local-mouse-api',
    apply: 'serve',
    configureServer(server) {
      register(server);
    },
    configurePreviewServer(server) {
      register(server);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [localMouseApiPlugin()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 5173,
  },
});
