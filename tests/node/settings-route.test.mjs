import assert from 'node:assert/strict';
import test from 'node:test';

import registerSettingsRouteImpl, { renderSettingsPage } from '../../plugin/routes/settings.js';
import { createSoundSettingsServices } from '../../plugin/services/sound-settings-services.js';
import { createSoundAssetServices } from '../../plugin/services/sound-asset-services.js';

function registerSettingsRoute(app, ctx = {}) {
  const nextContext = { ...ctx };
  if (ctx._notificationHubVNextPlugin && !ctx._notificationHubVNextSettingsApi) {
    nextContext._notificationHubVNextSettingsApi = ctx._notificationHubVNextPlugin;
    nextContext._notificationHubVNextSoundSettingsServices = createSoundSettingsServices({ settingsApi: ctx._notificationHubVNextPlugin });
    nextContext._notificationHubVNextSoundAssetServices = createSoundAssetServices({ settingsApi: ctx._notificationHubVNextPlugin });
  }
  return registerSettingsRouteImpl(app, nextContext);
}

function createRouteHarness() {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    delete(path, handler) { routes.set(`DELETE ${path}`, handler); }
  };
  const json = (value, status = 200) => ({ value, status, kind: 'json' });
  const html = (value, status = 200) => ({ value, status, kind: 'html' });
  const contextFor = (body = {}, url = '/settings') => ({
    req: { url, json: async () => body, parseBody: async () => body, param: (key) => ({ kind: 'sound', ruleId: 'sound-1' }[key]) },
    json,
    html
  });
  return { app, routes, contextFor };
}

const status = {
  settings: {
    globalSoundEnabled: true,
    workModeMuted: false,
    defaultPolicy: { enabled: false, volume: 1, suppressDuplicates: true }
  },
  revision: 2,
  savedRevision: 2,
  appliedRevision: 2,
  status: 'applied',
  applyError: null,
  diagnostics: [],
  runtimeStatus: { state: 'running', message: 'Runtime 正常运行', connected: true },
  runtimeHealth: { cardCount: 1, workArea: { width: 1920, height: 1080, dpiScale: 1.25 } },
  sceneStatePersistence: { enabled: true, filePath: 'scene-state.json', pending: false }
};

const displayStatus = {
  settings: { mode: 'custom', limit: 321, cardLifetimeSeconds: 120 },
  limit: 321,
  cardLifetimeSeconds: 120,
  persistence: { enabled: true, filePath: 'display-settings.json' }
};

function api() {
  const calls = [];
  return {
    calls,
    async getSettingsStatus() { calls.push('status'); return status; },
    getNotificationDisplaySettings() { calls.push('display-status'); return displayStatus; },
    async updateNotificationDisplaySettings(patch) { calls.push(['display-update', patch]); return { ...displayStatus, settings: patch, limit: patch.mode === 'unlimited' ? null : patch.limit, cardLifetimeSeconds: patch.cardLifetimeSeconds }; },
    getSoundSettingsStatus() { calls.push('sound-status'); return { revision: 1, status: 'applied', profile: { version: 1 } }; },
    async updateSoundSettings(patch) { calls.push(['sound-update', patch]); return { revision: 2, status: 'applied' }; },
    previewSoundSettings(input) { calls.push(['sound-preview', input]); return { input, decision: { play: false, reason: 'policy-disabled' } }; },
    explainSoundSettings(input) { calls.push(['sound-explain', input]); return { input, explanation: { outcome: 'skip' } }; },
    async testSoundSettings(input) { calls.push(['sound-test', input]); return { input, scheduled: false, playback: null }; },
    async runSoundWorkbench(input) { calls.push(['sound-workbench', input]); return { scenario: 'single-input', runs: [] }; },
    clearSoundDiagnostics() { calls.push('sound-diagnostics-clear'); return { soundDiagnostics: [] }; },
    async exportSoundDiagnostics(input) { calls.push(['sound-diagnostics-export', input]); return { savedToFile: true }; },
    getSoundAssetStatus() { calls.push('sound-assets-status'); return { assets: [], diagnostics: [] }; },
    async importSoundPackage(input) { calls.push(['sound-package-import', input]); return { importedAssets: 1 }; },
    async importSoundAsset(input) { calls.push(['sound-asset-import', input]); return { soundId: 'custom.wav' }; },
    async deleteSoundAsset(input) { calls.push(['sound-asset-delete', input]); return { removed: true }; },
    async updateSoundAssetConfiguration(input) { calls.push(['sound-asset-configure', input]); return { profile: {}, assets: [] }; },
    async removeSoundBindingConfiguration(input) { calls.push(['sound-binding-remove', input]); return { profile: {}, assets: [] }; },
    async exportSoundPackage(input) { calls.push(['sound-package-export', input]); return { extension: '.nhsound', packageText: '{}' }; },
    async updateSettings(patch) { calls.push(['update', patch]); return { ...status, revision: 3, status: 'saved' }; },
    async retrySettingsApply() { calls.push('retry'); return { ...status, status: 'applied' }; },
    async updateLayoutSettings(patch) { calls.push(['layout-update', patch]); return { ...status, layoutStatus: { status: 'applied', applied: { layout: 'shelf', ...patch } } }; },
    getVisualSettingsStatus() { calls.push('visual-status'); return { revision: 1, status: 'saved', profile: { version: 1 } }; },
    listVisualProfiles() { calls.push('visual-profiles'); return [{ profileId: 'visual.default', name: '默认视觉方案', references: [] }]; },
    saveVisualProfile(input) { calls.push(['visual-profile-save', input]); return { profileId: input.profileId, name: input.name, references: [], visualRevision: 2 }; },
    previewApplyVisualProfile(input) { calls.push(['visual-profile-preview', input]); return { added: input.eventIds.length, replaced: 0, unchanged: 0 }; },
    applyVisualProfileToEvents(input) { calls.push(['visual-profile-apply', input]); return { added: input.eventIds, replaced: [], unchanged: [], visualRevision: 2 }; },
    getEventPresentationSettings() { calls.push('event-presentation-status'); return { revision: 1, status: 'saved', rows: [], settings: { importanceKeywords: { keywords: [] } } }; },
    async updateEventPresentationSettings(patch) { calls.push(['event-presentation-update', patch]); return { revision: 2, status: 'applied', rows: [], settings: { importanceKeywords: { keywords: [] } } }; }
  };
}

test('settings page is one shell with internal settings views', async () => {
  const harness = createRouteHarness();
  const plugin = api();
  registerSettingsRoute(harness.app, { _notificationHubVNextPlugin: plugin });

  assert.equal(harness.routes.size, 36);
  const page = harness.routes.get('GET /settings')(harness.contextFor({}, '/settings'));
  assert.equal(page.kind, 'html');
  assert.match(page.value, /Notification Hub 设置/);
  assert.match(page.value, /settings-shell/);
  assert.match(page.value, /settings-shell-sidebar/);
  assert.match(page.value, /settings-view-content/);
  assert.match(page.value, /常规/);
  assert.match(page.value, /声音/);
  assert.match(page.value, /通知视觉/);
  assert.doesNotMatch(page.value, /通知行为/);
  assert.doesNotMatch(page.value, /事件表现/);
  assert.match(page.value, /历史与隐私/);
  assert.match(page.value, /NotificationHubSettingsShell/);
  assert.doesNotMatch(page.value, /mountInitialView/);
  assert.match(page.value, /scripts\.forEach/);
  assert.match(page.value, /settings-content\?view=/);
  assert.match(page.value, /window\.hana\.api\.fetch/);
  assert.match(page.value, /notification-hub-view-before-unload/);
  assert.match(page.value, /SETTINGS_VIEW_SCRIPT_MOUNT_FAILED/);
  assert.doesNotMatch(page.value, /document\.open\(\)/);
  assert.doesNotMatch(page.value, /document\.write\(/);
  assert.doesNotMatch(page.value, /scene-card-count/);
  assert.doesNotMatch(page.value, /保存布局/);

  const soundPage = harness.routes.get('GET /settings')(harness.contextFor({}, '/settings?view=sound'));
  assert.match(soundPage.value, /settings-shell/);
  assert.match(soundPage.value, /声音配置/);
  assert.match(soundPage.value, /sound-settings-test/);
  assert.match(soundPage.value, /声音实验台/);
  assert.match(soundPage.value, /声音规则解释/);
  assert.match(soundPage.value, /sound-workbench-run/);
  assert.match(soundPage.value, /sound-rule-explain/);
  assert.match(soundPage.value, /试听实验区/);
  assert.match(soundPage.value, /id="workbench-event-id"/);
  assert.doesNotMatch(soundPage.value, /id="workbench-event"/);
  assert.doesNotMatch(soundPage.value, /workbench-importance/);
  assert.doesNotMatch(soundPage.value, /id="workbench-sound"/);
  assert.doesNotMatch(soundPage.value, /workbenchInput\(\).*soundId/);
  assert.match(soundPage.value, /导入音频包（\.nhsound）/);
  assert.match(soundPage.value, /刷新状态/);
  assert.match(soundPage.value, /删除状态/);
  assert.match(soundPage.value, /导出状态/);
  assert.match(soundPage.value, /导出音频包（\.nhsound）/);
  assert.match(soundPage.value, /asset-list/);
  assert.match(soundPage.value, /sound-package-import/);
  assert.match(soundPage.value, /sound-package-export/);
  const soundAudioPanel = soundPage.value.indexOf('<article class="panel audio-library-panel');
  const soundAdvancedTools = soundPage.value.indexOf('<details class="advanced-tools"');
  assert.ok(soundAudioPanel >= 0 && soundAdvancedTools > soundAudioPanel);
  assert.match(page.value, /settings-shell-nav-item[^}]*font-weight:400/);
  assert.match(page.value, /settings-shell-content:has\(\[data-settings-view-root="visual"\]\)/);
  assert.match(page.value, /settings-shell-content:has\(\[data-settings-sound-root="true"\]\)/);
  assert.match(soundPage.value, /<!doctype html>/i);

  const generalFragment = harness.routes.get('GET /settings-content')(harness.contextFor({}, '/settings-content?view=general'));
  assert.equal(generalFragment.kind, 'html');
  assert.match(generalFragment.value, /常规|通知中心显示/);
  assert.match(generalFragment.value, /settings-display-limit-mode/);
  assert.match(generalFragment.value, /notification-center-display-settings/);
  assert.match(generalFragment.value, /重要性关键词/);
  assert.doesNotMatch(generalFragment.value, /卡持续时间/);
  assert.doesNotMatch(generalFragment.value, /0～3600/);
  assert.doesNotMatch(generalFragment.value, /当前边界/);
  assert.doesNotMatch(generalFragment.value, /<!doctype html>/i);
  assert.doesNotMatch(generalFragment.value, /page-navigation/);

  const soundFragment = harness.routes.get('GET /settings-content')(harness.contextFor({}, '/settings-content?view=sound'));
  assert.match(soundFragment.value, /声音设置|声音配置/);
  assert.match(soundFragment.value, /sound-settings-status/);
  assert.doesNotMatch(soundFragment.value, /<!doctype html>/i);
  assert.doesNotMatch(soundFragment.value, /page-nav-settings/);
  assert.doesNotMatch(soundFragment.value, /back-settings.*addEventListener/);
  assert.doesNotMatch(soundFragment.value, /open-visual.*addEventListener/);

  const invalid = harness.routes.get('GET /settings-content')(harness.contextFor({}, '/settings-content?view=history'));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.value.error.code, 'SETTINGS_VIEW_INVALID');
});

test('settings child views keep independent APIs', async () => {
  const harness = createRouteHarness();
  const plugin = api();
  registerSettingsRoute(harness.app, { _notificationHubVNextPlugin: plugin });

  const displayStatusResponse = await harness.routes.get('GET /notification-display-settings')(harness.contextFor());
  assert.equal(displayStatusResponse.value.ok, true);
  const displayUpdateResponse = await harness.routes.get('POST /notification-display-settings')(harness.contextFor({ mode: 'custom', limit: 321, cardLifetimeSeconds: 0 }));
  assert.equal(displayUpdateResponse.value.ok, true);
  assert.deepEqual(plugin.calls.at(-1), ['display-update', { mode: 'custom', limit: 321, cardLifetimeSeconds: 0 }]);

  const profilesResponse = await harness.routes.get('GET /visual-profiles')(harness.contextFor());
  assert.equal(profilesResponse.value.ok, true);
  const saveProfileResponse = await harness.routes.get('POST /visual-profiles/save')(harness.contextFor({ profileId: 'visual.default', name: '默认视觉方案', profile: {} }));
  assert.equal(saveProfileResponse.value.ok, true);
  const previewProfileResponse = await harness.routes.get('POST /visual-profiles/preview-apply')(harness.contextFor({ profileId: 'visual.default', eventIds: ['tool.execution.succeeded'] }));
  assert.equal(previewProfileResponse.value.preview.added, 1);
  const applyProfileResponse = await harness.routes.get('POST /visual-profiles/apply')(harness.contextFor({ profileId: 'visual.default', eventIds: ['tool.execution.succeeded'], behaviorChannelId: 'stack.tool' }));
  assert.equal(applyProfileResponse.value.result.added[0], 'tool.execution.succeeded');

  const soundAssetsResponse = await harness.routes.get('GET /sound-assets-status')(harness.contextFor());
  const explainResponse = await harness.routes.get('POST /sound-rule-explain')(harness.contextFor({ input: { labels: ['chat'], event: 'arrived', importance: 'normal' } }));
  assert.equal(explainResponse.value.ok, true);
  assert.deepEqual(plugin.calls.at(-1), ['sound-explain', { input: { labels: ['chat'], event: 'arrived', importance: 'normal' } }]);
  const workbenchResponse = await harness.routes.get('POST /sound-workbench-run')(harness.contextFor({ input: { labels: ['chat'], event: 'arrived', importance: 'normal', soundId: 'must-not-be-accepted' }, count: 2 }));
  assert.equal(workbenchResponse.value.ok, true);
  assert.deepEqual(plugin.calls.at(-1), ['sound-workbench', { input: { labels: ['chat'], event: 'arrived', importance: 'normal', soundId: 'must-not-be-accepted' }, count: 2 }]);
  const clearSoundDiagnosticsResponse = await harness.routes.get('POST /sound-diagnostics-clear')(harness.contextFor({}));
  assert.equal(clearSoundDiagnosticsResponse.value.ok, true);
  assert.equal(plugin.calls.at(-1), 'sound-diagnostics-clear');
  const exportSoundDiagnosticsResponse = await harness.routes.get('POST /sound-diagnostics-export')(harness.contextFor({ name: 'status' }));
  assert.equal(exportSoundDiagnosticsResponse.value.ok, true);
  assert.deepEqual(plugin.calls.at(-1), ['sound-diagnostics-export', { name: 'status' }]);
  const configureResponse = await harness.routes.get('POST /sound-asset-configure')(harness.contextFor({ soundId: 'custom.wav', eventId: 'chat.assistant_reply.completed' }));
  assert.equal(configureResponse.value.ok, true);
  assert.deepEqual(plugin.calls.at(-1), ['sound-asset-configure', { soundId: 'custom.wav', eventId: 'chat.assistant_reply.completed' }]);
  const removeResponse = await harness.routes.get('POST /sound-binding-remove')(harness.contextFor({ eventId: 'chat.assistant_reply.completed' }));
  assert.equal(removeResponse.value.ok, true);
  assert.deepEqual(plugin.calls.at(-1), ['sound-binding-remove', { eventId: 'chat.assistant_reply.completed' }]);
  const unavailable = createRouteHarness();
  registerSettingsRoute(unavailable.app, { _notificationHubVNextPlugin: {} });
  const unavailableResponse = await unavailable.routes.get('POST /sound-binding-remove')(unavailable.contextFor({ eventId: 'chat.assistant_reply.completed' }));
  assert.equal(unavailableResponse.status, 503);
  assert.equal(unavailableResponse.value.error.code, 'SOUND_BINDING_API_UNAVAILABLE');
  assert.equal((await harness.routes.get('POST /sound-asset-delete')(harness.contextFor({ soundId: 'custom.wav' }))).value.ok, true);
  assert.equal(soundAssetsResponse.value.ok, true);
  const packageImportResponse = await harness.routes.get('POST /sound-package-import')(harness.contextFor({ packageText: '{}' }));
  assert.equal(packageImportResponse.value.ok, true);
  const packageExportResponse = await harness.routes.get('POST /sound-package-export')(harness.contextFor({ name: 'shared' }));
  assert.equal(packageExportResponse.value.ok, true);
  const audio = new File([Buffer.from('RIFF')], 'alert.wav', { type: 'audio/wav' });
  const assetImportResponse = await harness.routes.get('POST /sound-asset-import')({ req: { parseBody: async () => ({ audio, name: 'Alert', soundId: 'alert.wav', replaceExisting: 'true' }) }, json: harness.contextFor().json, html: harness.contextFor().html });
  assert.equal(assetImportResponse.value.ok, true);
  assert.equal(plugin.calls.at(-1)[0], 'sound-asset-import');
  assert.equal(plugin.calls.at(-1)[1].file, audio);
  assert.equal(plugin.calls.at(-1)[1].replaceExisting, true);
  assert.equal(plugin.calls.at(-1)[1].binding, undefined);
  const soundUpdateResponse = await harness.routes.get('POST /sound-settings-update')(harness.contextFor({ profile: { global: { volume: 0.5 } } }));
  assert.equal(soundUpdateResponse.value.ok, true);
  assert.deepEqual(plugin.calls.at(-1), ['sound-update', { profile: { global: { volume: 0.5 } } }]);

  const updateResponse = await harness.routes.get('POST /settings-update')(harness.contextFor({ globalSoundEnabled: false }));
  assert.equal(updateResponse.value.ok, true);
  assert.deepEqual(plugin.calls.at(-1), ['update', { globalSoundEnabled: false }]);
  const retryResponse = await harness.routes.get('POST /settings-retry')(harness.contextFor());
  assert.equal(retryResponse.value.ok, true);
  assert.equal(plugin.calls.at(-1), 'retry');
});

test('settings routes reject invalid JSON before entering the plugin API', async () => {
  const harness = createRouteHarness();
  let called = false;
  registerSettingsRoute(harness.app, {
    _notificationHubVNextPlugin: {
      async updateSettings() { called = true; }
    }
  });
  const response = await harness.routes.get('POST /settings-update')({
    ...harness.contextFor(),
    req: { ...harness.contextFor().req, json: async () => { throw new SyntaxError('Unexpected token'); } }
  });
  assert.equal(response.status, 400);
  assert.deepEqual(response.value, {
    ok: false,
    error: { code: 'ROUTE_INVALID_JSON', message: '请求体必须是合法 JSON。', details: { field: 'body' } }
  });
  assert.equal(called, false);
});

test('sound asset and package JSON routes reject invalid JSON with the shared route error body', async () => {
  const routeNames = [
    'POST /sound-asset-configure',
    'POST /sound-asset-delete',
    'POST /sound-asset-import',
    'POST /sound-asset-test',
    'POST /sound-combo-package-export',
    'POST /sound-package-export'
  ];
  for (const routeName of routeNames) {
    const harness = createRouteHarness();
    let called = false;
    registerSettingsRoute(harness.app, { _notificationHubVNextPlugin: {
      updateSoundAssetConfiguration() { called = true; },
      deleteSoundAsset() { called = true; },
      importSoundAsset() { called = true; },
      testSoundAsset() { called = true; },
      exportSoundComboPackage() { called = true; },
      exportSoundPackage() { called = true; }
    } });
    const base = harness.contextFor({});
    const request = { ...base.req, json: async () => { throw new SyntaxError('Unexpected token'); } };
    if (routeName === 'POST /sound-asset-import') request.header = () => 'application/json';
    const response = await harness.routes.get(routeName)({ ...base, req: request });
    assert.equal(response.status, 400, routeName);
    assert.deepEqual(response.value.error, { code: 'ROUTE_INVALID_JSON', message: '请求体必须是合法 JSON。', details: { field: 'body' } });
    assert.equal(called, false, routeName);
  }
});

test('sound asset and package routes use domain-specific HTTP status mappings', async () => {
  const notFound = createRouteHarness();
  registerSettingsRoute(notFound.app, { _notificationHubVNextPlugin: {
    async updateSoundAssetConfiguration() { throw Object.assign(new Error('missing'), { code: 'SOUND_ASSET_NOT_FOUND', details: { field: 'soundId' } }); }
  } });
  const notFoundResponse = await notFound.routes.get('POST /sound-asset-configure')(notFound.contextFor({ soundId: 'missing' }));
  assert.equal(notFoundResponse.status, 404);
  assert.equal(notFoundResponse.value.error.code, 'SOUND_ASSET_NOT_FOUND');

  const conflict = createRouteHarness();
  registerSettingsRoute(conflict.app, { _notificationHubVNextPlugin: {
    async deleteSoundAsset() { throw Object.assign(new Error('in use'), { code: 'SOUND_ASSET_IN_USE', details: { field: 'soundId' } }); }
  } });
  const conflictResponse = await conflict.routes.get('POST /sound-asset-delete')(conflict.contextFor({ soundId: 'busy' }));
  assert.equal(conflictResponse.status, 409);
  assert.equal(conflictResponse.value.error.code, 'SOUND_ASSET_IN_USE');

  const invalidExport = createRouteHarness();
  registerSettingsRoute(invalidExport.app, { _notificationHubVNextPlugin: {
    async exportSoundPackage() { throw Object.assign(new Error('destination'), { code: 'SOUND_PACKAGE_DESTINATION_INVALID' }); }
  } });
  const invalidExportResponse = await invalidExport.routes.get('POST /sound-package-export')(invalidExport.contextFor({}));
  assert.equal(invalidExportResponse.status, 400);

  const internal = createRouteHarness();
  registerSettingsRoute(internal.app, { _notificationHubVNextPlugin: {
    async testSoundAsset() { throw Object.assign(new Error('storage'), { code: 'SOUND_ASSET_STORE_FAILED' }); }
  } });
  const internalResponse = await internal.routes.get('POST /sound-asset-test')(internal.contextFor({ soundId: 'custom' }));
  assert.equal(internalResponse.status, 500);
  assert.equal(internalResponse.value.error.code, 'SOUND_ASSET_STORE_FAILED');

  const unavailable = createRouteHarness();
  registerSettingsRoute(unavailable.app, { _notificationHubVNextPlugin: {} });
  const unavailableResponse = await unavailable.routes.get('POST /sound-package-export')(unavailable.contextFor({}));
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(unavailableResponse.value.error, { code: 'SOUND_ASSET_API_UNAVAILABLE', message: 'Sound package API unavailable', details: {} });
});

test('sound routes do not fall back to the legacy Plugin context when either sound service is missing', async () => {
  const harness = createRouteHarness();
  let called = false;
  registerSettingsRouteImpl(harness.app, { _notificationHubVNextPlugin: {
    getSoundSettingsStatus() { called = true; },
    getSoundAssetStatus() { called = true; }
  } });
  const settingsResponse = await harness.routes.get('GET /sound-settings-status')(harness.contextFor());
  const assetResponse = await harness.routes.get('GET /sound-assets-status')(harness.contextFor());
  assert.equal(settingsResponse.status, 503);
  assert.equal(settingsResponse.value.error.code, 'SOUND_SETTINGS_API_UNAVAILABLE');
  assert.equal(assetResponse.status, 503);
  assert.equal(assetResponse.value.error.code, 'SOUND_ASSET_API_UNAVAILABLE');
  assert.equal(called, false);
});

test('sound routes use the explicitly injected narrow service for their responsibility', async () => {
  const harness = createRouteHarness();
  const calls = [];
  const settingsService = { getSoundSettingsStatus() { calls.push('settings'); return { revision: 1 }; } };
  const assetService = { getSoundAssetStatus() { calls.push('assets'); return { assets: [] }; } };
  registerSettingsRouteImpl(harness.app, {
    _notificationHubVNextSettingsApi: { getSoundSettingsStatus() { throw new Error('wrong source'); } },
    _notificationHubVNextSoundSettingsServices: Object.freeze(settingsService),
    _notificationHubVNextSoundAssetServices: Object.freeze(assetService),
    _notificationHubVNextPlugin: { getSoundSettingsStatus() { throw new Error('legacy fallback'); }, getSoundAssetStatus() { throw new Error('legacy fallback'); } }
  });
  assert.equal((await harness.routes.get('GET /sound-settings-status')(harness.contextFor())).value.revision, 1);
  assert.deepEqual((await harness.routes.get('GET /sound-assets-status')(harness.contextFor())).value.assets, []);
  assert.deepEqual(calls, ['settings', 'assets']);
});

test('settings routes preserve unavailable and internal error status mappings', async () => {
  const unavailable = createRouteHarness();
  registerSettingsRoute(unavailable.app, {});
  const unavailableResponse = await unavailable.routes.get('POST /settings-update')(unavailable.contextFor({}));
  assert.equal(unavailableResponse.status, 503);
  assert.equal(unavailableResponse.value.error.code, 'SETTINGS_API_UNAVAILABLE');
  assert.deepEqual(unavailableResponse.value.error.details, {});

  const internal = createRouteHarness();
  registerSettingsRoute(internal.app, {
    _notificationHubVNextPlugin: {
      async updateSettings() { throw Object.assign(new Error('database unavailable'), { code: 'SETTINGS_STORE_WRITE_FAILED' }); }
    }
  });
  const internalResponse = await internal.routes.get('POST /settings-update')(internal.contextFor({}));
  assert.equal(internalResponse.status, 500);
  assert.equal(internalResponse.value.error.code, 'SETTINGS_STORE_WRITE_FAILED');
});

test('settings routes return structured validation errors', async () => {
  const harness = createRouteHarness();
  registerSettingsRoute(harness.app, {
    _notificationHubVNextPlugin: {
      updateSettings() { throw Object.assign(new Error('volume must be between 0 and 1'), { code: 'SOUND_SETTINGS_VOLUME_INVALID', details: { field: 'defaultPolicy.volume' } }); }
    }
  });
  const response = await harness.routes.get('POST /settings-update')(harness.contextFor({ defaultPolicy: { volume: 2 } }));
  assert.equal(response.status, 400);
  assert.deepEqual(response.value.error, { code: 'SOUND_SETTINGS_VOLUME_INVALID', message: '音量必须介于 0 和 1 之间。', details: { field: 'defaultPolicy.volume' } });
});

test('layout route returns a structured validation error', async () => {
  const harness = createRouteHarness();
  registerSettingsRoute(harness.app, {
    _notificationHubVNextPlugin: {
      updateLayoutSettings() { throw Object.assign(new Error('invalid layout'), { code: 'RUNTIME_LAYOUT_INVALID', details: { field: 'direction' } }); }
    }
  });
  const response = await harness.routes.get('POST /layout-update')(harness.contextFor({ direction: 'left', anchor: 'bottom-left', spacing: 12 }));
  assert.equal(response.status, 400);
  assert.deepEqual(response.value.error, { code: 'RUNTIME_LAYOUT_INVALID', message: '布局方向、停靠位置或间距不正确。', details: { field: 'direction' } });
});

test('settings page is a self-contained Hana iframe shell', () => {
  const html = renderSettingsPage();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /window\.parent\.postMessage\(\{ type: "ready" \}, "\*"\)/);
  assert.doesNotMatch(html, /await fetch\(/);
  assert.doesNotMatch(html, /document\.open\(\)/);
  assert.doesNotMatch(html, /document\.write\(/);
});
