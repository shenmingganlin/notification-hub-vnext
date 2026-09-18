import assert from 'node:assert/strict';
import test from 'node:test';

import registerVisualAssetRoute from '../../plugin/routes/settings-visual-assets.js';

function createHarness({ body = {}, file = null, contentType = 'multipart/form-data' } = {}) {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    delete(path, handler) { routes.set(`DELETE ${path}`, handler); }
  };
  const responses = {
    json(value, status = 200) { return { kind: 'json', body: value, status }; }
  };
  const plugin = {
    exportVisualPackageToPicker: async (input) => ({ cancelled: false, savedFilename: 'test.nhvisual', bytes: 12, input }),
    previewVisualPackage: async (input) => ({ packageName: 'Test Package', profileCount: 1, input }),
    importVisualPackage: async (input) => ({ strategy: input.strategy, applyBindings: input.applyBindings, clearMissingAssets: input.clearMissingAssets, clearMissingFonts: input.clearMissingFonts, profiles: { registered: [{ effectiveId: 'imported' }] }, assets: { imported: [] }, input }),
    exportVisualPackageDiagnostics: async (input) => ({ cancelled: false, savedFilename: 'diagnostics.json', input })
  };
  const fileValue = file ?? { name: 'test.nhvisual', async arrayBuffer() { return new ArrayBuffer(4); } };
  const context = {
    req: {
      url: '/api/plugins/notification-hub/visual-package',
      header(name) { return name.toLowerCase() === 'content-type' ? contentType : ''; },
      async json() { return body; },
      async parseBody() { return { package: fileValue, strategy: body.strategy ?? 'copy', applyBindings: body.applyBindings, clearMissingAssets: body.clearMissingAssets, clearMissingFonts: body.clearMissingFonts }; },
      param() { return 'asset-1'; },
      query() { return {}; }
    },
    json: responses.json
  };
  return { routes, app, plugin, context, file: fileValue };
}

test('visual package export route delegates metadata and returns saved file status', async () => {
  const harness = createHarness({ body: { profileIds: ['saved-package-id'], meta: { packageName: 'My Visuals' } } });
  registerVisualAssetRoute(harness.app, { _notificationHubVNextPlugin: harness.plugin });
  const response = await harness.routes.get('POST /visual-package-export')(harness.context);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.savedFilename, 'test.nhvisual');
  assert.equal(response.body.input.meta.packageName, 'My Visuals');
  assert.deepEqual(response.body.input.profileIds, ['saved-package-id']);
});

test('visual package preview route reads multipart package and keeps strategy', async () => {
  const harness = createHarness({ body: { strategy: 'skip' } });
  registerVisualAssetRoute(harness.app, { _notificationHubVNextPlugin: harness.plugin });
  const response = await harness.routes.get('POST /visual-package-preview')(harness.context);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.preview.packageName, 'Test Package');
  assert.equal(response.body.preview.input.strategy, 'skip');
  assert.equal(response.body.preview.input.file, harness.file);
});

test('visual package import route delegates selected conflict strategy', async () => {
  const harness = createHarness({ body: { strategy: 'overwrite' } });
  registerVisualAssetRoute(harness.app, { _notificationHubVNextPlugin: harness.plugin });
  const response = await harness.routes.get('POST /visual-package-import')(harness.context);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.report.strategy, 'overwrite');
  assert.equal(response.body.report.applyBindings, true);
  assert.equal(response.body.report.clearMissingAssets, false);
});

test('visual package import route forwards missing-art and event-sync flags', async () => {
  const harness = createHarness({ body: { strategy: 'skip', applyBindings: 'false', clearMissingAssets: 'true' } });
  registerVisualAssetRoute(harness.app, { _notificationHubVNextPlugin: harness.plugin });
  const response = await harness.routes.get('POST /visual-package-import')(harness.context);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.report.strategy, 'skip');
  assert.equal(response.body.report.applyBindings, false);
  assert.equal(response.body.report.clearMissingAssets, true);
});

test('visual package diagnostics export route delegates filename and returns save status', async () => {
  const harness = createHarness({ body: { name: 'import-diagnostics' } });
  registerVisualAssetRoute(harness.app, { _notificationHubVNextPlugin: harness.plugin });
  const response = await harness.routes.get('POST /visual-package-diagnostics-export')(harness.context);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.savedFilename, 'diagnostics.json');
  assert.equal(response.body.input.name, 'import-diagnostics');
});

test('visual package import route accepts JSON base64', async () => {
  const harness = createHarness({ body: { base64: Buffer.from('zip').toString('base64'), strategy: 'skip', applyBindings: false, clearMissingAssets: true, clearMissingFonts: true }, contentType: 'application/json' });
  registerVisualAssetRoute(harness.app, { _notificationHubVNextPlugin: harness.plugin });
  const response = await harness.routes.get('POST /visual-package-import')(harness.context);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.report.strategy, 'skip');
  assert.equal(response.body.report.applyBindings, false);
  assert.equal(response.body.report.clearMissingAssets, true);
  assert.equal(response.body.report.clearMissingFonts, true);
  assert.ok(Buffer.isBuffer(response.body.report.input.zipBuffer));
});

test('visual package JSON base64 input is accepted for preview', async () => {
  const harness = createHarness({ body: { base64: Buffer.from('zip').toString('base64') }, contentType: 'application/json' });
  registerVisualAssetRoute(harness.app, { _notificationHubVNextPlugin: harness.plugin });
  const response = await harness.routes.get('POST /visual-package-preview')(harness.context);
  assert.equal(response.body.ok, true);
  assert.ok(Buffer.isBuffer(response.body.preview.input.zipBuffer));
});

test('visual package route reports unavailable API', async () => {
  const harness = createHarness();
  registerVisualAssetRoute(harness.app, { _notificationHubVNextPlugin: {} });
  const response = await harness.routes.get('POST /visual-package-import')(harness.context);
  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error.code, 'VISUAL_PACKAGE_API_UNAVAILABLE');
});