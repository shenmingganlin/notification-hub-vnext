import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { reconcileSoundLibrary } from '../../plugin/domain/sound-library-reconcile.js';

const wavHeader = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WAVEfmt '),
  Buffer.alloc(48, 1)
]);

test('reconcile registers each audio file as its own library entry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-lib-'));
  try {
    const custom = path.join(root, 'custom');
    await mkdir(custom, { recursive: true });
    await writeFile(path.join(custom, '欧拉.wav'), wavHeader);
    await writeFile(path.join(custom, '嘎嘎滴拉虾.wav'), Buffer.concat([wavHeader, Buffer.from('two')]));
    await writeFile(path.join(custom, 'restored.wav'), Buffer.from('wav'));

    const result = await reconcileSoundLibrary({
      assetRoot: root,
      registryPath: path.join(root, 'sound-assets.json'),
      previousAssets: [{
        version: 1,
        soundId: 'Restored-sound',
        name: 'Restored sound',
        kind: 'custom',
        format: 'wav',
        relativePath: 'custom/restored.wav',
        durationMs: 0,
        fileSizeBytes: 3,
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
        enabled: true
      }]
    });

    const customAssets = result.registry.list().filter((asset) => asset.kind === 'custom');
    assert.equal(customAssets.length, 2);
    assert.deepEqual(customAssets.map((asset) => asset.soundId).sort(), ['嘎嘎滴拉虾', '欧拉']);
    assert.equal(result.skipped.some((item) => item.reason === 'too-small'), true);
    const saved = JSON.parse(await readFile(path.join(root, 'sound-assets.json'), 'utf8'));
    assert.equal(saved.assets.length, 2);
    assert.equal(saved.assets.some((asset) => asset.name === 'Restored sound'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reconcile keeps existing soundId when the same file is found by hash', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-lib-hash-'));
  try {
    const custom = path.join(root, 'custom');
    await mkdir(custom, { recursive: true });
    const bytes = Buffer.concat([wavHeader, Buffer.from('keep-id')]);
    await writeFile(path.join(custom, 'reply.wav'), bytes);
    const { createHash } = await import('node:crypto');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const result = await reconcileSoundLibrary({
      assetRoot: root,
      previousAssets: [{
        version: 1,
        soundId: 'custom.chat-complete',
        name: '回复好啦',
        kind: 'custom',
        format: 'wav',
        relativePath: 'custom/old-name.wav',
        durationMs: 120,
        fileSizeBytes: bytes.length,
        sha256,
        enabled: true
      }]
    });
    const asset = result.registry.get('custom.chat-complete');
    assert.ok(asset);
    assert.equal(asset.relativePath, 'custom/reply.wav');
    assert.equal(asset.name, 'reply');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
