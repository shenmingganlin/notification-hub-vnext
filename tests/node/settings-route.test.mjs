import assert from 'node:assert/strict';
import test from 'node:test';

import registerSettingsRoute, { renderSettingsPage } from '../../plugin/routes/settings.js';

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
    getEventPresentationSettings() { calls.push('event-presentation-status'); return { revision: 1, status: 'saved', rows: [], settings: { importanceKeywords: { keywords: [] } } }; },
    async updateEventPresentationSettings(patch) { calls.push(['event-presentation-update', patch]); return { revision: 2, status: 'applied', rows: [], settings: { importanceKeywords: { keywords: [] } } }; }
  };
}

test('settings page is one shell with internal settings views', async () => {
  const harness = createRouteHarness();
  const plugin = api();
  registerSettingsRoute(harness.app, { _notificationHubVNextPlugin: plugin });

  assert.equal(harness.routes.size, 28);
  const page = harness.routes.get('GET /settings')(harness.contextFor({}, '/settings'));
  assert.equal(page.kind, 'html');
  assert.match(page.value, /Notification Hub 设置/);
  assert.match(page.value, /settings-shell/);
  assert.match(page.value, /settings-shell-sidebar/);
  assert.match(page.value, /settings-view-content/);
  assert.match(page.value, /常规与显示/);
  assert.match(page.value, /声音/);
  assert.match(page.value, /通知视觉/);
  assert.match(page.value, /事件表现/);
  assert.match(page.value, /历史与隐私/);
  assert.match(page.value, /NotificationHubSettingsShell/);
  assert.doesNotMatch(page.value, /mountInitialView/);
  assert.match(page.value, /scripts\.forEach/);
  assert.match(page.value, /settings-content\?view=/);
  assert.match(page.value, /window\.hana\.api\.fetch/);
  assert.match(page.value, /notification-hub-view-before-unload/);
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
  assert.match(soundPage.value, /<!doctype html>/i);

  const generalFragment = harness.routes.get('GET /settings-content')(harness.contextFor({}, '/settings-content?view=general'));
  assert.equal(generalFragment.kind, 'html');
  assert.match(generalFragment.value, /常规与显示|通知中心显示/);
  assert.match(generalFragment.value, /settings-display-limit-mode/);
  assert.match(generalFragment.value, /card-lifetime/);
  assert.match(generalFragment.value, /0～3600/);
  assert.match(generalFragment.value, /notification-center-display-settings/);
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
