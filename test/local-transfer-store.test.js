import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { removeStoredMice } from '../src/local-transfer-store.js';

test('removes one mouse across stores without touching unrelated files', async () => {
  const root = await mkdtemp(join(os.tmpdir(), 'mouse-transfer-'));
  const transfer = join(root, 'transfer');
  const legacy = join(root, 'mice');
  await Promise.all([mkdir(transfer), mkdir(legacy)]);
  try {
    await Promise.all([
      writeFile(join(transfer, 'mouse1234.json'), '{}'),
      writeFile(join(transfer, 'mouse1234.png'), 'image'),
      writeFile(join(legacy, 'MOUSE1234.json'), '{}'),
      writeFile(join(transfer, 'transfer-perspective.json'), '{}'),
      writeFile(join(transfer, 'notes.txt'), 'keep'),
    ]);

    assert.deepEqual([...await removeStoredMice([transfer, legacy], 'mouse1234')], ['mouse1234']);
    await assert.rejects(readFile(join(transfer, 'mouse1234.json')));
    await assert.rejects(readFile(join(transfer, 'mouse1234.png')));
    await assert.rejects(readFile(join(legacy, 'MOUSE1234.json')));
    assert.equal(await readFile(join(transfer, 'transfer-perspective.json'), 'utf8'), '{}');
    assert.equal(await readFile(join(transfer, 'notes.txt'), 'utf8'), 'keep');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('clears mouse files and temporary writes while preserving non-mouse data', async () => {
  const root = await mkdtemp(join(os.tmpdir(), 'mouse-transfer-'));
  try {
    await Promise.all([
      writeFile(join(root, 'mouse1234.json'), '{}'),
      writeFile(join(root, 'mouse5678.png.tmp'), 'partial'),
      writeFile(join(root, 'transfer-perspective.json'), '{}'),
    ]);

    assert.equal((await removeStoredMice([root])).size, 2);
    await assert.rejects(readFile(join(root, 'mouse1234.json')));
    await assert.rejects(readFile(join(root, 'mouse5678.png.tmp')));
    assert.equal(await readFile(join(root, 'transfer-perspective.json'), 'utf8'), '{}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
