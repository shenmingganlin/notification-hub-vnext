import test from 'node:test';
import assert from 'node:assert/strict';
import registerFontAssetRoute from '../../plugin/routes/settings-font-assets.js';

function harness() {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    delete(path, handler) { routes.set(`DELETE ${path}`, handler); }
  };
  return { app, routes };
}
function context(id, query = {}) {
  return { req: { query: () => query, param: (name) => name === 'assetId' ? id : null }, json(value, status = 200) { return { value, status }; } };
}

test('font asset routes list, detail and protect referenced deletion', async () => {
  const { app, routes } = harness();
  const api = {
    listFontAssets(query) { assert.deepEqual(query, { search: 'mint' }); return [{ assetId: 'a', references: 1 }]; },
    getFontAsset() { return { assetId: 'a', references: 1 }; },
    async removeFontAsset() {
      throw Object.assign(new Error('in use'), { code: 'FONT_ASSET_IN_USE', details: { references: [{ ownerType: 'profile', ownerId: 'p', slot: 'card.minimal.parts.title.font' }] } });
    }
  };
  registerFontAssetRoute(app, { _notificationHubVNextPlugin: api });
  assert.deepEqual([...routes.keys()], ['POST /font-assets/import', 'GET /font-assets', 'GET /font-assets/:assetId/file', 'GET /font-assets/:assetId', 'DELETE /font-assets/:assetId']);
  assert.equal(routes.get('GET /font-assets')(context('a', { search: 'mint' })).value.assets[0].assetId, 'a');
  assert.equal(routes.get('GET /font-assets/:assetId')(context('a')).value.asset.assetId, 'a');
  const response = await routes.get('DELETE /font-assets/:assetId')(context('a'));
  assert.equal(response.status, 409);
  assert.equal(response.value.error.code, 'FONT_ASSET_IN_USE');
});

test('font asset detail returns 404 for unknown asset', () => {
  const { app, routes } = harness();
  registerFontAssetRoute(app, { _notificationHubVNextPlugin: { getFontAsset() { return null; } } });
  const response = routes.get('GET /font-assets/:assetId')(context('missing'));
  assert.equal(response.status, 404);
  assert.equal(response.value.error.code, 'FONT_ASSET_NOT_FOUND');
});

test('font asset file route serves bytes', async () => {
  const { app, routes } = harness();
  registerFontAssetRoute(app, {
    _notificationHubVNextPlugin: {
      async readFontAssetFile(id) {
        assert.equal(id, 'a');
        return { assetId: 'a', format: 'ttf', buffer: Buffer.from([0, 1, 0, 0]) };
      }
    }
  });
  const response = await routes.get('GET /font-assets/:assetId/file')({
    req: { param: () => 'a' },
    json(value, status = 200) { return { value, status }; },
    body(value, status = 200, headers = {}) { return { value, status, headers }; }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'font/ttf');
  assert.equal(response.value[0], 0);
});

test('font asset file route returns dataUrl when client asks for json', async () => {
  const { app, routes } = harness();
  registerFontAssetRoute(app, {
    _notificationHubVNextPlugin: {
      async readFontAssetFile() {
        return { assetId: 'a', format: 'otf', buffer: Buffer.from([0x4f, 0x54, 0x54, 0x4f]) };
      }
    }
  });
  const response = await routes.get('GET /font-assets/:assetId/file')({
    req: { param: () => 'a', header: (name) => name === 'Accept' ? 'application/json' : '' },
    json(value, status = 200) { return { value, status }; },
    body(value, status = 200, headers = {}) { return { value, status, headers }; }
  });
  assert.equal(response.status, 200);
  assert.match(response.value.dataUrl, /^data:font\/otf;base64,/);
});
