function transferApiUrl(query = '') {
  const url = new URL('api/transfer', `${location.origin}/`);
  if (query) {
    const params = new URLSearchParams(query);
    for (const [key, value] of params) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function transferPhotoUrl(id) {
  return transferApiUrl(`id=${encodeURIComponent(id)}&kind=photo`);
}

export async function publishTransferPhoto(id, blob) {
  try {
    const response = await fetch(transferApiUrl(`id=${encodeURIComponent(id)}&kind=photo`), {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: blob,
    });
    return response.ok;
  } catch (error) {
    console.warn('student card upload failed', error);
    return false;
  }
}

export async function publishTransferRecord(record) {
  try {
    const response = await fetch(transferApiUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(record),
    });
    return response.ok;
  } catch (error) {
    console.warn('shared folder upload failed', error);
    return false;
  }
}

export async function listTransferRecords() {
  const response = await fetch(transferApiUrl());
  if (!response.ok) throw new Error(`transfer list ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.entries)) throw new Error('transfer list missing entries');
  return payload.entries;
}

export async function fetchTransferRecord(id) {
  const response = await fetch(transferApiUrl(`id=${encodeURIComponent(id)}`));
  if (!response.ok) throw new Error(`transfer read ${response.status}`);
  const record = await response.json();
  if (!record?.snapshot?.traits || !record.snapshot.patches) {
    throw new Error('transfer record is missing mouse data');
  }
  return record;
}
