import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  SOUND_PACKAGE_FORMAT,
  SOUND_PACKAGE_VERSION,
  createSoundPackage,
  parseSoundPackage,
  serializeSoundPackage,
  validateSoundPackage
} from '../../plugin/domain/sound-package.js';

function assetWithData(soundId = 'custom.tool.failed') {
  const data = Buffer.from('RIFF-custom-tool-failed');
  return {
    asset: {
      soundId,
      name: '自定义工具失败',
      kind: 'custom',
      format: 'wav',
      relativePath: `sounds/${soundId}.wav`,
      durationMs: 180,
      fileSizeBytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      enabled: true
    },
    data
  };
}

test('sound package is self-contained and round-trips profile plus binary assets', () => {
  const packageValue = createSoundPackage({
    name: 'Ganlin 声音方案',
    profile: {
      global: { enabled: true, soundId: 'custom.tool.failed' },
      soundOverrides: [{ eventId: 'tool.execution.failed', soundId: 'custom.tool.failed' }]
    },
    assets: [assetWithData()]
  });

  assert.equal(packageValue.format, SOUND_PACKAGE_FORMAT);
  assert.equal(packageValue.version, SOUND_PACKAGE_VERSION);
  assert.equal(packageValue.name, 'Ganlin 声音方案');
  assert.equal(packageValue.assets.length, 1);
  assert.equal(typeof packageValue.assets[0].dataBase64, 'string');
  assert.equal(validateSoundPackage(packageValue), true);

  const parsed = parseSoundPackage(serializeSoundPackage(packageValue));
  assert.deepEqual(parsed, packageValue);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.profile), true);
});

test('package validation rejects path traversal, hash mismatch, malformed base64 and unknown files', () => {
  const valid = createSoundPackage({ name: 'valid', assets: [assetWithData()] });

  const traversal = structuredClone(valid);
  traversal.assets[0].relativePath = '../outside.wav';
  assert.throws(() => validateSoundPackage(traversal), /path|traversal/i);

  const hashMismatch = structuredClone(valid);
  hashMismatch.assets[0].sha256 = 'a'.repeat(64);
  assert.throws(() => validateSoundPackage(hashMismatch), /hash|sha256/i);

  const malformedBase64 = structuredClone(valid);
  malformedBase64.assets[0].dataBase64 = '%%%not-base64%%%';
  assert.throws(() => validateSoundPackage(malformedBase64), /base64|data/i);

  const unknownField = structuredClone(valid);
  unknownField.unexpectedScript = 'powershell';
  assert.throws(() => validateSoundPackage(unknownField), /unknown/i);
});

test('package creation rejects builtin assets and oversized binary data', () => {
  assert.throws(() => createSoundPackage({
    name: 'builtin',
    assets: [{
      asset: {
        soundId: 'builtin.warning', name: 'Warning', kind: 'builtin', format: 'builtin',
        builtinCue: 'warning', relativePath: '', durationMs: 100, fileSizeBytes: 0,
        sha256: null, enabled: true
      },
      data: Buffer.from('not-needed')
    }]
  }), /builtin/i);

  assert.throws(() => createSoundPackage({
    name: 'bad',
    assets: [{
      asset: {
        ...assetWithData('too-large').asset,
        fileSizeBytes: 64 * 1024 * 1024 + 1
      },
      data: Buffer.from('small')
    }]
  }), /size|hash|file/i);
});
