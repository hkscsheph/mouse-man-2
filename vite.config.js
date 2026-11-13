import { defineConfig } from 'vite';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const localMouseStore = resolve(fileURLToPath(new URL('.', import.meta.url)), '.dev-data', 'mice');
const localTransferStore = process.env.TRANSFER_DIR
  ? resolve(process.env.TRANSFER_DIR)
  : resolve(fileURLToPath(new URL('.', import.meta.url)), '.dev-data', 'transfer');
const validMouseId = /^[a-z0-9]{8,32}$/i;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
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
      const snapshot = JSON.parse(await readFile(resolve(localMouseStore, `${id}.json`), 'utf8'));
      sendJson(res, 200, snapshot);
    } catch (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
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
      await mkdir(localMouseStore, { recursive: true });
      await writeFile(resolve(localMouseStore, `${id}.json`), JSON.stringify(snapshot), 'utf8');
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

async function localTransferApi(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
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
          if (!validMouseId.test(String(record?.id || ''))) continue;
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
      const record = JSON.parse(await readFile(transferRecordPath(id), 'utf8'));
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
    const stored = {
      id,
      createdAt: Number(record.createdAt) || Date.now(),
      portrait,
      snapshot,
    };
    const finalPath = transferRecordPath(id);
    const temporaryPath = `${finalPath}.tmp`;
    try {
      await mkdir(localTransferStore, { recursive: true });
      await writeFile(temporaryPath, JSON.stringify(stored), 'utf8');
      await rm(finalPath, { force: true });
      await rename(temporaryPath, finalPath);
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
    host: process.env.PRINTER_HOST || '192.168.0.191',
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

function localMouseApiPlugin() {
  function register(server) {
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
      localTransferApi(req, res).catch((error) => {
        console.error('local transfer API request failed', error);
        if (res.headersSent) {
          next(error);
          return;
        }
        sendJson(res, 500, { error: 'storage request failed' });
      });
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
