import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { importSoundAsset } from '../../plugin/domain/sound-asset-importer.js';
import { createSoundAssetRegistry } from '../../plugin/domain/sound-asset-registry.js';

function upload(name, bytes, type = 'audio/wav') {
  return new File([bytes], name, { type });
}

test('imports a WAV into the controlled asset root and registry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nhsound-asset-'));
  try {
    const registry = createSoundAssetRegistry();
    const result = await importSoundAsset({ file: upload('My alert.wav', Buffer.from('RIFF-test')), assetRoot: root, registry });
    assert.equal(result.asset.soundId, 'My_alert');
    assert.equal(result.asset.relativePath, 'custom/My_alert.wav');
    assert.equal(result.asset.kind, 'custom');
    assert.equal(registry.get('My_alert').sha256.length, 64);
    assert.deepEqual(await readFile(result.path), Buffer.from('RIFF-test'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('replaces an existing custom sound atomically when requested', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nhsound-asset-'));
  try {
    const registry = createSoundAssetRegistry();
    const first = await importSoundAsset({ file: upload('replace.wav', Buffer.from('old')), assetRoot: root, registry });
    const second = await importSoundAsset({ file: upload('replace.wav', Buffer.from('new')), assetRoot: root, registry, replaceExisting: true });
    assert.equal(second.replaced, true);
    assert.equal(registry.list().filter((asset) => asset.kind === 'custom').length, 1);
    assert.equal(registry.get(first.asset.soundId).fileSizeBytes, 3);
    assert.deepEqual(await readFile(second.path), Buffer.from('new'));
    const third = await importSoundAsset({ file: upload('replace.mp3', Buffer.from('mp3')), assetRoot: root, registry, replaceExisting: true });
    assert.equal(third.asset.format, 'mp3');
    await assert.rejects(readFile(first.path));
    assert.deepEqual(await readFile(third.path), Buffer.from('mp3'));
    await assert.rejects(() => importSoundAsset({ file: upload('replace.wav', Buffer.from('third')), assetRoot: root, registry }), (error) => error.code === 'SOUND_ASSET_DUPLICATE_ID');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects duplicate ids, empty files, unsupported playable formats, and oversized input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nhsound-asset-'));
  try {
    const registry = createSoundAssetRegistry();
    await importSoundAsset({ file: upload('same.wav', Buffer.from('a')), assetRoot: root, registry });
    await assert.rejects(() => importSoundAsset({ file: upload('same.wav', Buffer.from('b')), assetRoot: root, registry }), (error) => error.code === 'SOUND_ASSET_DUPLICATE_ID');
    await assert.rejects(() => importSoundAsset({ file: upload('empty.wav', Buffer.alloc(0)), assetRoot: root, registry }), (error) => error.code === 'SOUND_ASSET_FILE_EMPTY');
    const importedMp3 = await importSoundAsset({ file: upload('music.mp3', Buffer.from('mp3'), 'audio/mpeg'), assetRoot: root, registry });
    assert.equal(importedMp3.asset.format, 'mp3');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
