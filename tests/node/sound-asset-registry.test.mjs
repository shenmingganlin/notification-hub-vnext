import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSoundAssetRegistry,
  createBuiltInSoundAssets
} from '../../plugin/domain/sound-asset-registry.js';

test('sound asset registry exposes built-ins and accepts unlimited custom assets', () => {
  const registry = createSoundAssetRegistry({
    assets: [
      {
        soundId: 'custom.alpha', name: 'Alpha', kind: 'custom', format: 'wav',
        relativePath: 'sounds/custom.alpha.wav', durationMs: 100, fileSizeBytes: 10,
        sha256: 'a'.repeat(64), enabled: true
      },
      {
        soundId: 'custom.beta', name: 'Beta', kind: 'custom', format: 'wav',
        relativePath: 'sounds/custom.beta.wav', durationMs: 120, fileSizeBytes: 12,
        sha256: 'b'.repeat(64), enabled: true
      }
    ]
  });

  assert.equal(registry.list().length, createBuiltInSoundAssets().length + 2);
  assert.equal(registry.get('custom.alpha').name, 'Alpha');
  assert.equal(registry.get('missing'), null);
  assert.equal(registry.resolvePlayback('custom.alpha').kind, 'custom');
  assert.equal(registry.resolvePlayback('builtin.chat-incoming').builtinCue, 'chat-incoming');
  assert.equal(Object.isFrozen(registry.list()), true);
});

test('registry rejects duplicate ids and returns structured missing asset diagnostics', () => {
  assert.throws(() => createSoundAssetRegistry({
    assets: [
      { soundId: 'same', name: 'A', kind: 'custom', format: 'wav', relativePath: 'sounds/a.wav', durationMs: 1, fileSizeBytes: 1, sha256: 'a'.repeat(64), enabled: true },
      { soundId: 'same', name: 'B', kind: 'custom', format: 'wav', relativePath: 'sounds/b.wav', durationMs: 1, fileSizeBytes: 1, sha256: 'b'.repeat(64), enabled: true }
    ]
  }), /duplicate/i);

  const registry = createSoundAssetRegistry();
  assert.deepEqual(registry.resolvePlayback('does.not.exist'), {
    kind: 'missing', soundId: 'does.not.exist', diagnostic: 'SOUND_ASSET_NOT_FOUND'
  });
});
