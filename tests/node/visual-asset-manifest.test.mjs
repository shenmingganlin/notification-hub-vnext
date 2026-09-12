import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisualAssetManifest, validateVisualAssetManifest } from '../../plugin/domain/visual-asset-manifest.js';
const hash = 'a'.repeat(64);
test('creates a declaration-only manifest with safe relative paths', () => { const manifest = createVisualAssetManifest([{ assetId:'visual-asset-1', format:'png', sha256:hash }]); assert.deepEqual(manifest, { version:1, assets:[{ assetId:'visual-asset-1', format:'png', relativePath:'visual-assets/visual-asset-1.png', sha256:hash, enabled:true }] }); });
test('rejects unsafe paths, duplicate hashes and unsupported formats', () => { assert.throws(() => validateVisualAssetManifest({ version:1, assets:[{assetId:'a',format:'png',relativePath:'../a.png',sha256:hash,enabled:true}] }), { code:'VISUAL_ASSET_MANIFEST_PATH_INVALID' }); assert.throws(() => createVisualAssetManifest([{assetId:'a',format:'png',sha256:hash},{assetId:'b',format:'png',sha256:hash}]), { code:'VISUAL_ASSET_MANIFEST_DUPLICATE' }); assert.throws(() => createVisualAssetManifest([{assetId:'a',format:'svg',sha256:hash}]), { code:'VISUAL_ASSET_MANIFEST_INVALID' }); });
