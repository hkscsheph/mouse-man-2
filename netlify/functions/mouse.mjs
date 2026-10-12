import { getStore } from '@netlify/blobs';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors });
  }

  const store = getStore('mouse-crowd');

  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json(400, { error: 'id required' });
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
    return json(200, { id });
  }

  return json(405, { error: 'method not allowed' });
};

export const config = { path: '/api/mouse' };
