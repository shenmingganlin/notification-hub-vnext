import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOUND_ASSET_VERSION,
  createSoundAsset,
  validateSoundAsset,
  normalizeSoundId
} from '../../plugin/domain/custom-sound-asset.js';

test('custom sound asset accepts any safe soundId and freezes nested data', () => {
  const input = {
    soundId: 'ganlin.tool.failed.v1',
    name: '工具失败 · Ganlin',
    kind: 'custom',
    format: 'wav',
    relativePath: 'sounds/ganlin.tool.failed.v1.wav',
    durationMs: 180,
    fileSizeBytes: 4096,
    sha256: 'a'.repeat(64),
    enabled: true
  };
  const asset = createSoundAsset(input);

  assert.equal(SOUND_ASSET_VERSION, 1);
  assert.equal(asset.soundId, input.soundId);
  assert.equal(asset.kind, 'custom');
  assert.equal(asset.format, 'wav');
  assert.equal(Object.isFrozen(asset), true);
  assert.equal(validateSoundAsset(asset), true);
  assert.deepEqual(input, {
    soundId: 'ganlin.tool.failed.v1',
    name: '工具失败 · Ganlin',
    kind: 'custom',
    format: 'wav',
    relativePath: 'sounds/ganlin.tool.failed.v1.wav',
    durationMs: 180,
    fileSizeBytes: 4096,
    sha256: 'a'.repeat(64),
    enabled: true
  });
});

test('sound ids are normalized without imposing built-in category limits', () => {
  assert.equal(normalizeSoundId('  My Custom / Sound 01  '), 'My_Custom_Sound_01');
  assert.equal(normalizeSoundId('自定义-失败音'), '自定义-失败音');
  assert.throws(() => normalizeSoundId('../escape'), /soundId/i);
  assert.throws(() => normalizeSoundId(''), /soundId/i);
});

test('custom sound asset rejects traversal, unsupported fields, invalid hashes and unsafe values', () => {
  assert.throws(() => createSoundAsset({
    soundId: 'safe', name: 'Safe', kind: 'custom', format: 'wav',
    relativePath: '../unsafe.wav', durationMs: 100, fileSizeBytes: 1,
    sha256: 'a'.repeat(64), enabled: true
  }), /path/i);
  assert.throws(() => createSoundAsset({
    soundId: 'safe', name: 'Safe', kind: 'custom', format: 'exe',
    relativePath: 'sounds/safe.mp3', durationMs: 100, fileSizeBytes: 1,
    sha256: 'a'.repeat(64), enabled: true
  }), /format/i);
  assert.throws(() => createSoundAsset({
    soundId: 'safe', name: 'Safe', kind: 'custom', format: 'wav',
    relativePath: 'sounds/safe.wav', durationMs: 100, fileSizeBytes: 1,
    sha256: 'not-a-hash', enabled: true
  }), /sha256|hash/i);
  assert.throws(() => createSoundAsset({
    soundId: 'safe', name: 'Safe', kind: 'custom', format: 'wav',
    relativePath: 'sounds/safe.wav', durationMs: 100, fileSizeBytes: 1,
    sha256: 'a'.repeat(64), enabled: true, arbitrary: true
  }), /unknown/i);
});

test('built-in sound asset can point to an adapter cue without a file path', () => {
  const asset = createSoundAsset({
    soundId: 'builtin.chat-incoming',
    name: '聊天到达',
    kind: 'builtin',
    format: 'builtin',
    builtinCue: 'chat-incoming',
    relativePath: '',
    durationMs: 160,
    fileSizeBytes: 0,
    sha256: null,
    enabled: true
  });
  assert.equal(asset.kind, 'builtin');
  assert.equal(asset.builtinCue, 'chat-incoming');
  assert.equal(asset.relativePath, '');
});
