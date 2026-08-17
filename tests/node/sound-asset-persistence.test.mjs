import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSoundAssetRegistry } from '../../plugin/domain/sound-asset-registry.js';
import { loadSoundAssetRegistry, saveSoundAssetRegistry } from '../../plugin/domain/sound-asset-persistence.js';

function asset(id) {
  return { soundId: id, name: id, kind: 'custom', format: 'wav', relativePath: `sounds/${id}.wav`, durationMs: 100, fileSizeBytes: 1, sha256: 'a'.repeat(64), enabled: true };
}

test('sound asset registry persists only custom metadata and restores built-ins automatically', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-assets-'));
  const filePath = path.join(root, 'sound-assets.json');
  try {
    await saveSoundAssetRegistry(createSoundAssetRegistry({ assets: [asset('custom.persisted')] }), filePath);
    const restored = await loadSoundAssetRegistry(filePath);
    assert.equal(restored.get('custom.persisted').soundId, 'custom.persisted');
    assert.equal(restored.get('builtin.warning').kind, 'builtin');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing registry file returns an empty custom registry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-assets-'));
  try {
    const registry = await loadSoundAssetRegistry(path.join(root, 'missing.json'));
    assert.equal(registry.get('custom.missing'), null);
    assert.ok(registry.get('builtin.chat-incoming'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
