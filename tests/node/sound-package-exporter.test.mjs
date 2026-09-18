import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createSoundAssetRegistry } from '../../plugin/domain/sound-asset-registry.js';
import { exportSoundPackage } from '../../plugin/domain/sound-package-exporter.js';
import { parseSoundPackage } from '../../plugin/domain/sound-package.js';

test('export packs every custom library asset and omits event bindings', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-export-'));
  try {
    const bound = Buffer.from('RIFF-exportable-sound');
    const unbound = Buffer.from('RIFF-unbound-library-sound');
    await mkdir(path.join(root, 'sounds'), { recursive: true });
    await writeFile(path.join(root, 'sounds', 'exported.wav'), bound);
    await writeFile(path.join(root, 'sounds', 'spare.wav'), unbound);
    const registry = createSoundAssetRegistry({ assets: [{
      soundId: 'custom.exported', name: 'Exported sound', kind: 'custom', format: 'wav',
      relativePath: 'sounds/exported.wav', durationMs: 140, fileSizeBytes: bound.length,
      sha256: createHash('sha256').update(bound).digest('hex'), enabled: true
    }, {
      soundId: 'custom.spare', name: 'Spare sound', kind: 'custom', format: 'wav',
      relativePath: 'sounds/spare.wav', durationMs: 80, fileSizeBytes: unbound.length,
      sha256: createHash('sha256').update(unbound).digest('hex'), enabled: true
    }] });
    const result = await exportSoundPackage({
      name: 'Exported library',
      registry,
      assetRoot: root
    });
    assert.equal(result.extension, '.nhsound');
    assert.equal(result.assetCount, 2);
    assert.equal(result.profileBindingCount, 0);
    const parsed = parseSoundPackage(result.packageText);
    assert.equal(parsed.name, 'Exported library');
    assert.deepEqual(parsed.assets.map((asset) => asset.soundId).sort(), ['custom.exported', 'custom.spare']);
    assert.equal(parsed.profile.soundOverrides.length, 0);
    assert.equal(Buffer.from(parsed.assets.find((asset) => asset.soundId === 'custom.exported').dataBase64, 'base64').toString(), 'RIFF-exportable-sound');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('export fails when a custom library file is missing', async () => {
  const registry = createSoundAssetRegistry({ assets: [{
    soundId: 'custom.missing', name: 'Missing', kind: 'custom', format: 'wav',
    relativePath: 'sounds/missing.wav', durationMs: 100, fileSizeBytes: 1,
    sha256: 'a'.repeat(64), enabled: true
  }] });
  await assert.rejects(() => exportSoundPackage({
    name: 'Missing', registry,
    assetRoot: path.join(os.tmpdir(), 'nh-no-such-sound-root')
  }), /missing|asset|file/i);
});

test('export fails when the audio library has no custom sounds', async () => {
  await assert.rejects(() => exportSoundPackage({
    name: 'Empty',
    registry: createSoundAssetRegistry(),
    assetRoot: os.tmpdir()
  }), (error) => error.code === 'SOUND_PACKAGE_EMPTY');
});
