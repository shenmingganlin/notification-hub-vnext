import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createSoundAssetRegistry } from '../../plugin/domain/sound-asset-registry.js';
import { exportSoundPackage } from '../../plugin/domain/sound-package-exporter.js';
import { parseSoundPackage } from '../../plugin/domain/sound-package.js';

 test('export creates a self-contained .nhsound payload from registry and profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-export-'));
  try {
    const data = Buffer.from('RIFF-exportable-sound');
    await mkdir(path.join(root, 'sounds'), { recursive: true });
    await writeFile(path.join(root, 'sounds', 'exported.wav'), data);
    const registry = createSoundAssetRegistry({ assets: [{
      soundId: 'custom.exported', name: 'Exported sound', kind: 'custom', format: 'wav',
      relativePath: 'sounds/exported.wav', durationMs: 140, fileSizeBytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'), enabled: true
    }] });
    const result = await exportSoundPackage({
      name: 'Exported profile',
      profile: { global: { enabled: true, soundId: 'custom.exported' } },
      registry,
      assetRoot: root
    });
    assert.equal(result.extension, '.nhsound');
    const parsed = parseSoundPackage(result.packageText);
    assert.equal(parsed.name, 'Exported profile');
    assert.equal(parsed.assets[0].soundId, 'custom.exported');
    assert.equal(Buffer.from(parsed.assets[0].dataBase64, 'base64').toString(), 'RIFF-exportable-sound');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('export fails when a referenced custom asset is missing', async () => {
  const registry = createSoundAssetRegistry({ assets: [{
    soundId: 'custom.missing', name: 'Missing', kind: 'custom', format: 'wav',
    relativePath: 'sounds/missing.wav', durationMs: 100, fileSizeBytes: 1,
    sha256: 'a'.repeat(64), enabled: true
  }] });
  await assert.rejects(() => exportSoundPackage({
    name: 'Missing', profile: { global: { soundId: 'custom.missing' } }, registry,
    assetRoot: path.join(os.tmpdir(), 'nh-no-such-sound-root')
  }), /missing|asset|file/i);
});
