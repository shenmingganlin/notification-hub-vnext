import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFontAssetStorage } from '../../plugin/domain/font-asset-storage.js';
import { loadFontAssetSnapshot, saveFontAssetSnapshot } from '../../plugin/domain/font-asset-persistence.js';

const data = Buffer.from('asset-data');

test('font storage writes, reads, removes, and rejects traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nh-font-assets-'));
  try {
    const storage = createFontAssetStorage(root);
    await storage.put('asset-1', 'ttf', data);
    assert.deepEqual(await storage.read('asset-1', 'ttf'), data);
    assert.match(storage.resolveAssetPath('asset-1', 'ttf'), /asset-1\.ttf$/);
    await assert.rejects(() => storage.put('../escape', 'ttf', data), { code: 'FONT_ASSET_PATH_INVALID' });
    await assert.rejects(() => storage.read('asset-1', 'woff'), { code: 'FONT_ASSET_FORMAT_UNSUPPORTED' });
    await storage.remove('asset-1', 'ttf');
    await assert.rejects(() => storage.read('asset-1', 'ttf'), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('font snapshots save atomically and reject corruption', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nh-font-snapshot-'));
  const path = join(root, 'nested', 'fonts.json');
  const snapshot = { version: 1, assets: [], references: {} };
  try {
    await saveFontAssetSnapshot(snapshot, path);
    assert.deepEqual(await loadFontAssetSnapshot(path), snapshot);
    await writeFile(path, '{bad', 'utf8');
    await assert.rejects(() => loadFontAssetSnapshot(path), { code: 'FONT_ASSET_LOAD_FAILED' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
