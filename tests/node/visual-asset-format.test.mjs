import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectVisualAssetBuffer } from '../../plugin/domain/visual-asset-format.js';

function png(colorType = 6, width = 128, height = 64) { const b = Buffer.alloc(26); Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); b[24] = 8; b[25] = colorType; return b; }
function webp(alpha = true, width = 20, height = 30) { const b = Buffer.alloc(30); b.write('RIFF', 0); b.writeUInt32LE(22, 4); b.write('WEBPVP8X', 8); b[20] = alpha ? 0x10 : 0; b[24] = (width - 1) & 255; b[25] = (width - 1) >> 8; b[26] = (width - 1) >> 16; b[27] = (height - 1) & 255; b[28] = (height - 1) >> 8; b[29] = (height - 1) >> 16; return b; }
function jpg(width = 320, height = 240) { const b = Buffer.alloc(20); b[0]=0xff;b[1]=0xd8;b[2]=0xff;b[3]=0xc0;b.writeUInt16BE(11,4);b[6]=8;b.writeUInt16BE(height,7);b.writeUInt16BE(width,9); return b; }

test('inspects PNG alpha and dimensions', () => assert.deepEqual(inspectVisualAssetBuffer(png(), 'icon.png'), { format:'png', width:128, height:64, hasAlpha:true }));
test('inspects WEBP alpha and JPEG dimensions', () => { assert.deepEqual(inspectVisualAssetBuffer(webp(), 'icon.webp'), { format:'webp', width:20, height:30, hasAlpha:true }); assert.deepEqual(inspectVisualAssetBuffer(jpg(), 'photo.jpeg'), { format:'jpg', width:320, height:240, hasAlpha:false }); });
test('rejects unsupported, malformed and mismatched assets', () => { assert.throws(() => inspectVisualAssetBuffer(Buffer.from('x'), 'x.svg'), { code:'VISUAL_ASSET_FORMAT_UNSUPPORTED' }); assert.throws(() => inspectVisualAssetBuffer(png(), 'icon.webp'), { code:'VISUAL_ASSET_EXTENSION_MISMATCH' }); assert.throws(() => inspectVisualAssetBuffer(Buffer.from('not-png'), 'x.png'), { code:'VISUAL_ASSET_HEADER_INVALID' }); });
