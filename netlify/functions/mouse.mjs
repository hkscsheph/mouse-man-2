import { getStore } from '@netlify/blobs';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...cors,
    },
  });
}

/** Netlify Functions v2 — required for Blobs env injection. */
export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors });
  }

  let store;
  try {
    store = getStore({ name: 'mouse-crowd', consistency: 'strong' });
  } catch (error) {
    console.error('blobs store', error);
    return json(503, { error: 'storage unavailable', detail: String(error?.message || error) });
  }

  try {
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id');
      if (!id) return json(200, { ok: true, service: 'mouse' });
      const snapshot = await store.get(id, { type: 'json' });
      if (!snapshot) return json(404, { error: 'not found' });
      return json(200, snapshot);
    }

    if (req.method === 'POST') {
      let snapshot;
      try {
        snapshot = await req.json();
      } catch {
        return json(400, { error: 'invalid json' });
      }
      if (!snapshot?.traits || !snapshot?.patches) {
        return json(400, { error: 'invalid snapshot' });
      }
      const id = String(snapshot.id || crypto.randomUUID().replace(/-/g, '').slice(0, 12));
      snapshot.id = id;
      snapshot.createdAt = snapshot.createdAt || Date.now();
      await store.setJSON(id, snapshot);
      return json(200, { id, remote: true });
    }

    return json(405, { error: 'method not allowed' });
  } catch (error) {
    console.error('mouse api', error);
    return json(500, { error: 'server error', detail: String(error?.message || error) });
  }
};

export const config = {
  path: '/api/mouse',
};
