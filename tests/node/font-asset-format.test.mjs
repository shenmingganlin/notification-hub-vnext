import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFontAssetBuffer } from '../../plugin/domain/font-asset-format.js';
import { otfNamed, ttfNamed } from './font-asset-fixture.mjs';

test('inspects TTF and OTF headers and name table', () => {
  assert.deepEqual(inspectFontAssetBuffer(ttfNamed('Display Name', 'Family Name'), 'mint.ttf'), { format: 'ttf', familyName: 'Display Name' });
  assert.deepEqual(inspectFontAssetBuffer(otfNamed('Otto Family'), 'mint.otf'), { format: 'otf', familyName: 'Otto Family' });
});

test('falls back to filename when name table is missing', () => {
  const header = Buffer.alloc(12);
  header.writeUInt32BE(0x00010000, 0);
  assert.equal(inspectFontAssetBuffer(header, 'fallback-name.ttf').familyName, 'fallback-name');
});

test('rejects unsupported, empty, mismatched and oversized fonts', () => {
  assert.throws(() => inspectFontAssetBuffer(Buffer.alloc(0), 'x.ttf'), { code: 'FONT_ASSET_DATA_INVALID' });
  assert.throws(() => inspectFontAssetBuffer(Buffer.from('wOFF....'), 'x.woff'), { code: 'FONT_ASSET_FORMAT_UNSUPPORTED' });
  assert.throws(() => inspectFontAssetBuffer(Buffer.from('ttcf....'), 'x.ttf'), { code: 'FONT_ASSET_FORMAT_UNSUPPORTED' });
  assert.throws(() => inspectFontAssetBuffer(Buffer.from('wOF2....'), 'x.ttf'), { code: 'FONT_ASSET_FORMAT_UNSUPPORTED' });
  assert.throws(() => inspectFontAssetBuffer(ttfNamed(), 'mint.otf'), { code: 'FONT_ASSET_EXTENSION_MISMATCH' });
  assert.throws(() => inspectFontAssetBuffer(otfNamed(), 'mint.ttf'), { code: 'FONT_ASSET_EXTENSION_MISMATCH' });
  assert.throws(() => inspectFontAssetBuffer(Buffer.from('not-font'), 'x.ttf'), { code: 'FONT_ASSET_HEADER_INVALID' });
  assert.throws(() => inspectFontAssetBuffer(Buffer.allocUnsafe(32 * 1024 * 1024 + 1), 'x.ttf'), { code: 'FONT_ASSET_TOO_LARGE' });
});
