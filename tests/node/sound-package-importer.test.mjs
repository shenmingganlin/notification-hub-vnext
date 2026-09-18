import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createSoundPackage, serializeSoundPackage } from '../../plugin/domain/sound-package.js';
import { importSoundPackage } from '../../plugin/domain/sound-package-importer.js';
import { createSoundAssetRegistry } from '../../plugin/domain/sound-asset-registry.js';

function makePackage(soundId = 'custom.imported', dataText = 'RIFF-importable-sound') {
  const data = Buffer.from(dataText);
  return createSoundPackage({
    name: 'Importable sounds',
    profile: { global: { enabled: true, soundId } },
    assets: [{
      asset: {
        soundId, name: 'Imported sound', kind: 'custom', format: 'wav',
        relativePath: `sounds/${soundId}.wav`, durationMs: 120, fileSizeBytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'), enabled: true
      },
      data
    }]
  });
}

test('import writes assets and returns a normalized profile result', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-import-'));
  try {
    const registry = createSoundAssetRegistry();
    const result = await importSoundPackage({
      packageValue: makePackage(),
      assetRoot: root,
      registry,
      conflict: 'reject'
    });
    assert.equal(result.importedAssets, 1);
    assert.equal(result.profile.global.soundId, 'custom.imported');
    assert.equal(registry.get('custom.imported').name, 'Imported sound');
    assert.deepEqual(await readFile(path.join(root, 'sounds', 'custom.imported.wav')), Buffer.from('RIFF-importable-sound'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failed import rolls back files and registry changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-import-'));
  const registry = createSoundAssetRegistry();
  const packageValue = makePackage();
  try {
    await assert.rejects(() => importSoundPackage({
      packageValue: { ...packageValue, assets: [{ ...packageValue.assets[0], dataBase64: 'bad' }] },
      assetRoot: root,
      registry,
      conflict: 'reject'
    }), /base64|package/i);
    assert.equal(registry.get('custom.imported'), null);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('duplicate soundId follows explicit reject, keep-existing, and replace policies', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-import-'));
  const registry = createSoundAssetRegistry({ assets: [{
    soundId: 'custom.imported', name: 'Existing', kind: 'custom', format: 'wav',
    relativePath: 'sounds/existing.wav', durationMs: 100, fileSizeBytes: 3,
    sha256: 'a'.repeat(64), enabled: true
  }] });
  try {
    await assert.rejects(async () => importSoundPackage({ packageValue: makePackage(), assetRoot: root, registry, conflict: 'reject' }), (error) => {
      assert.equal(error.code, 'SOUND_PACKAGE_CONFLICT');
      assert.deepEqual(error.details.conflicts, [{ soundId: 'custom.imported', name: 'Imported sound', relativePath: 'sounds/custom.imported.wav', policy: 'reject' }]);
      return true;
    });
    const kept = await importSoundPackage({ packageValue: makePackage(), assetRoot: root, registry, conflict: 'keep-existing' });
    assert.equal(kept.skippedAssets, 1);
    assert.equal(registry.get('custom.imported').name, 'Existing');
    const replaced = await importSoundPackage({ packageValue: makePackage(), assetRoot: root, registry, conflict: 'replace' });
    assert.equal(replaced.replacedAssets, 1);
    const perItem = await importSoundPackage({ packageValue: makePackage('custom.imported'), assetRoot: root, registry, conflictBySoundId: { 'custom.imported': 'keep-existing' } });
    assert.equal(perItem.skippedAssets, 1);
    assert.equal(registry.get('custom.imported').name, 'Imported sound');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('import writes assets without applying package profile through commit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-import-'));
  try {
    let committedArgs;
    const result = await importSoundPackage({
      packageValue: makePackage(),
      assetRoot: root,
      registry: createSoundAssetRegistry(),
      commit: async (...args) => { committedArgs = args; }
    });
    assert.equal(result.importedAssets, 1);
    assert.deepEqual(committedArgs, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('import accepts serialized .nhsound text as well as a parsed package', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-import-'));
  try {
    const result = await importSoundPackage({
      packageText: serializeSoundPackage(makePackage()),
      assetRoot: root,
      registry: createSoundAssetRegistry()
    });
    assert.equal(result.importedAssets, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('replace restores the previous file and registry when a later asset cannot be committed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-import-'));
  const existingData = Buffer.from('OLD');
  const existingPath = path.join(root, 'sounds', 'custom.imported.wav');
  const registry = createSoundAssetRegistry({ assets: [{
    soundId: 'custom.imported', name: 'Existing', kind: 'custom', format: 'wav',
    relativePath: 'sounds/custom.imported.wav', durationMs: 100, fileSizeBytes: existingData.length,
    sha256: createHash('sha256').update(existingData).digest('hex'), enabled: true
  }] });
  try {
    await importSoundPackage({ packageValue: makePackage(), assetRoot: root, registry, conflict: 'replace' });
    assert.equal((await readFile(existingPath)).toString(), 'RIFF-importable-sound');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
