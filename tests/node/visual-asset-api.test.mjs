import test from 'node:test';
import assert from 'node:assert/strict';
import registerVisualAssetRoute from '../../plugin/routes/settings-visual-assets.js';
function harness() { const routes = new Map(); const app = { get(path, handler) { routes.set(`GET ${path}`, handler); }, post(path, handler) { routes.set(`POST ${path}`, handler); }, delete(path, handler) { routes.set(`DELETE ${path}`, handler); } }; return { app, routes }; }
function context(id, query = {}) { return { req: { query: () => query, param: (name) => name === 'assetId' ? id : null }, json(value, status = 200) { return { value, status }; } }; }
test('visual asset routes list, detail and protect referenced deletion', async () => { const { app, routes } = harness(); const api = { listVisualAssets(query) { assert.deepEqual(query, { search:'mint' }); return [{ assetId:'a', references:1 }]; }, getVisualAsset() { return { assetId:'a', references:1 }; }, async removeVisualAsset() { const error = Object.assign(new Error('in use'), { code:'VISUAL_ASSET_IN_USE', details:{ references:[{ ownerType:'profile', ownerId:'p', slot:'icon' }] } }); throw error; } }; registerVisualAssetRoute(app, { _notificationHubVNextPlugin: api }); assert.deepEqual([...routes.keys()], ['POST /visual-assets/import', 'GET /visual-assets', 'GET /visual-assets/:assetId/file', 'GET /visual-assets/:assetId', 'DELETE /visual-assets/:assetId', 'POST /visual-package-export', 'POST /visual-package-preview', 'POST /visual-package-import', 'POST /visual-package-diagnostics-export']); assert.equal(routes.get('GET /visual-assets')(context('a', { search:'mint' })).value.assets[0].assetId, 'a'); assert.equal(routes.get('GET /visual-assets/:assetId')(context('a')).value.asset.assetId, 'a'); const response = await routes.get('DELETE /visual-assets/:assetId')(context('a')); assert.equal(response.status, 409); assert.equal(response.value.error.code, 'VISUAL_ASSET_IN_USE'); });
test('visual asset detail returns 404 for unknown asset', () => { const { app, routes } = harness(); registerVisualAssetRoute(app, { _notificationHubVNextPlugin: { getVisualAsset() { return null; } } }); const response = routes.get('GET /visual-assets/:assetId')(context('missing')); assert.equal(response.status, 404); assert.equal(response.value.error.code, 'VISUAL_ASSET_NOT_FOUND'); });
test('visual asset file route serves bytes', async () => {
  const { app, routes } = harness();
  registerVisualAssetRoute(app, {
    _notificationHubVNextPlugin: {
      async readVisualAssetFile(id) {
        assert.equal(id, 'a');
        return { assetId: 'a', format: 'png', buffer: Buffer.from([137, 80, 78]) };
      }
    }
  });
  const response = await routes.get('GET /visual-assets/:assetId/file')({
    req: { param: () => 'a' },
    json(value, status = 200) { return { value, status }; },
    body(value, status = 200, headers = {}) { return { value, status, headers }; }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'image/png');
  assert.equal(response.value[0], 137);
});
test('visual asset file route returns dataUrl when client asks for json', async () => {
  const { app, routes } = harness();
  registerVisualAssetRoute(app, {
    _notificationHubVNextPlugin: {
      async readVisualAssetFile() {
        return { assetId: 'a', format: 'png', buffer: Buffer.from([137, 80, 78]) };
      }
    }
  });
  const response = await routes.get('GET /visual-assets/:assetId/file')({
    req: { param: () => 'a', header: (name) => name === 'Accept' ? 'application/json' : '' },
    json(value, status = 200) { return { value, status }; },
    body(value, status = 200, headers = {}) { return { value, status, headers }; }
  });
  assert.equal(response.status, 200);
  assert.match(response.value.dataUrl, /^data:image\/png;base64,/);
});
