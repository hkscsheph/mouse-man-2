import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const mouseFilePattern = /^([a-z0-9]{8,32})\.(?:json|png)(?:\.tmp)?$/i;

export async function removeStoredMice(stores, id = null) {
  const removed = new Set();
  for (const store of stores) {
    let names;
    try {
      names = await readdir(store);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const name of names) {
      const match = name.match(mouseFilePattern);
      if (!match || (id && match[1].toLowerCase() !== id.toLowerCase())) continue;
      await rm(resolve(store, name), { force: true });
      removed.add(match[1].toLowerCase());
    }
  }
  return removed;
}
