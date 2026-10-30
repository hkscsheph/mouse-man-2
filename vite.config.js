import { defineConfig } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const localMouseStore = resolve(fileURLToPath(new URL('.', import.meta.url)), '.dev-data', 'mice');
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

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('request body too large');
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
