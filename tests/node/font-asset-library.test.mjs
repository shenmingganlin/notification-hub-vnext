import test from 'node:test';
import assert from 'node:assert/strict';
import { createFontAssetLibrary } from '../../plugin/domain/font-asset-library.js';
import { ttfNamed } from './font-asset-fixture.mjs';

const ttf = ttfNamed('Mint Sans', 'Mint Sans');
function library() {
  const files = new Map();
  return {
    files,
    async put(id, format, data) { files.set(`${id}.${format}`, Buffer.from(data)); },
    async remove(id, format) { files.delete(`${id}.${format}`); },
    async resolveAssetPath(id, format) { return `font-assets/${id}.${format}`; }
  };
}

test('imports immutable metadata and deduplicates by SHA256', async () => {
  const storage = library();
  const assets = createFontAssetLibrary({ storage });
  const first = await assets.importBuffer({ name: 'mint.ttf', buffer: ttf });
  const second = await assets.importBuffer({ name: 'copy.ttf', buffer: Buffer.from(ttf) });
  assert.equal(second.assetId, first.assetId);
  assert.equal(storage.files.size, 1);
  assert.equal(first.name, 'Mint Sans');
  assert.equal(first.references, 0);
  assert.throws(() => { first.name = 'changed'; }, TypeError);
});

test('tracks structured references and protects deletion', async () => {
  const storage = library();
  const assets = createFontAssetLibrary({ storage });
  const asset = await assets.importBuffer({ name: 'mint.ttf', buffer: ttf });
  await assets.addReference(asset.assetId, { ownerType: 'profile', ownerId: 'default', slot: 'card.minimal.parts.title.font' });
  await assets.addReference(asset.assetId, { ownerType: 'profile', ownerId: 'default', slot: 'card.minimal.parts.title.font' });
  assert.deepEqual(assets.references(asset.assetId), [{ ownerType: 'profile', ownerId: 'default', slot: 'card.minimal.parts.title.font' }]);
  await assert.rejects(() => assets.remove(asset.assetId), (error) => error.code === 'FONT_ASSET_IN_USE' && error.details.references.length === 1);
  assert.equal(assets.removeReference(asset.assetId, { ownerType: 'profile', ownerId: 'default', slot: 'card.minimal.parts.title.font' }), true);
  assert.equal(await assets.remove(asset.assetId), true);
  assert.equal(storage.files.size, 0);
});

test('lists by search', async () => {
  const storage = library();
  const assets = createFontAssetLibrary({ storage });
  await assets.importBuffer({ name: 'mint.ttf', buffer: ttf });
  assert.equal(assets.list({ search: 'mint' }).length, 1);
  assert.equal(assets.list({ search: 'absent' }).length, 0);
});

test('restores a validated snapshot and rebuilds reference counts', async () => {
  const storage = library();
  const source = createFontAssetLibrary({ storage });
  const asset = await source.importBuffer({ assetId: 'asset-restored', name: 'mint.ttf', buffer: ttf });
  await source.addReference(asset.assetId, { ownerType: 'profile', ownerId: 'default', slot: 'card.minimal.parts.body.font' });
  const restored = createFontAssetLibrary({ storage });
  assert.deepEqual(restored.restoreSnapshot(source.snapshot()), { assetCount: 1 });
  assert.equal(restored.get(asset.assetId).references, 1);
  assert.deepEqual(restored.references(asset.assetId), [{ ownerType: 'profile', ownerId: 'default', slot: 'card.minimal.parts.body.font' }]);
  assert.throws(() => restored.restoreSnapshot({ version: 1, assets: [{ ...asset, format: 'woff' }], references: {} }), { code: 'FONT_ASSET_SNAPSHOT_INVALID' });
});
