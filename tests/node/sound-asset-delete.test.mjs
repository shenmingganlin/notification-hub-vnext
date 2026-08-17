import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import NotificationHubVNextPlugin from '../../plugin/index.js';
import { createSoundAsset } from '../../plugin/domain/custom-sound-asset.js';

function createPlugin(dataDir) {
  return new NotificationHubVNextPlugin({ dataDir, config: {}, log: { warn() {}, error() {}, info() {}, debug() {} } }, {
    adapterFactory: () => ({}),
    soundBackendFactory: () => ({ playCue: async () => ({ played: true }), playFile: async () => ({ played: true }) })
  });
}

function asset(soundId = 'delete-me') {
  return createSoundAsset({
    soundId,
    name: 'Delete me',
    kind: 'custom',
    format: 'wav',
    relativePath: `custom/${soundId}.wav`,
    durationMs: 0,
    fileSizeBytes: 3,
    sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    enabled: true
  });
}

test('deleting an imported sound removes the file, registry entry, and persisted entry', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nh-delete-test-'));
  try {
    const plugin = createPlugin(dataDir);
    plugin.soundAssetRoot = path.join(dataDir, 'sound-assets');
    plugin.soundAssetRegistryPath = path.join(dataDir, 'sound-assets.json');
    const entry = asset();
    await mkdir(path.dirname(path.join(plugin.soundAssetRoot, entry.relativePath)), { recursive: true });
    await writeFile(path.join(plugin.soundAssetRoot, entry.relativePath), Buffer.from('wav'));
    plugin.soundAssetRegistry.add(entry);
    await plugin.saveSoundAssets();

    const result = await plugin.deleteSoundAsset({ soundId: entry.soundId });
    assert.equal(result.removed, true);
    assert.equal(plugin.soundAssetRegistry.get(entry.soundId), null);
    await assert.rejects(() => readFile(path.join(plugin.soundAssetRoot, entry.relativePath)), { code: 'ENOENT' });
    assert.deepEqual(JSON.parse(await readFile(plugin.soundAssetRegistryPath, 'utf8')).assets, []);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('deleting a stale registry entry removes only the stale registry entry', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nh-delete-stale-test-'));
  try {
    const plugin = createPlugin(dataDir);
    plugin.soundAssetRoot = path.join(dataDir, 'sound-assets');
    plugin.soundAssetRegistryPath = path.join(dataDir, 'sound-assets.json');
    const entry = asset('stale-entry');
    plugin.soundAssetRegistry.add(entry);
    await plugin.saveSoundAssets();

    const result = await plugin.deleteSoundAsset({ soundId: entry.soundId });
    assert.equal(result.removed, true);
    assert.equal(result.fileMissing, true);
    assert.equal(plugin.soundAssetRegistry.get(entry.soundId), null);
    assert.deepEqual(JSON.parse(await readFile(plugin.soundAssetRegistryPath, 'utf8')).assets, []);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
