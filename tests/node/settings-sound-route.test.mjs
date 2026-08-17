import assert from 'node:assert/strict';
import test from 'node:test';

import registerSoundSettingsRoute, { renderSoundSettingsPage, renderSoundSettingsFragment } from '../../plugin/routes/settings-sound.js';

function harness() {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); }
  };
  return { app, routes };
}

test('sound settings fragment extracts the sound script rather than page navigation script', () => {
  const html = renderSoundSettingsFragment('', { assets: [], profile: {}, revision: 1 });
  assert.match(html, /sound-asset-test/);
  assert.match(html, /function bindDynamicActions/);
  assert.doesNotMatch(html, /applyEventChoices\("arrived"\)/);
  assert.doesNotMatch(html, /updateLevel\(\)/);
  assert.doesNotMatch(html, /NotificationHubPageRouter\.load/);
});

test('sound settings page exposes the simplified configuration workbench and audio library', () => {
  const html = renderSoundSettingsPage('', {
    profile: {
      version: 1,
      global: { enabled: true, volume: 0.7, suppressDuplicates: true },
      soundOverrides: [{ eventId: 'chat.assistant_reply.completed', soundId: 'chat-soft' }]
    },
    assets: [{ soundId: 'chat-soft', name: 'Chat soft', kind: 'custom', format: 'wav', fileSizeBytes: 1234 }],
    revision: 4,
    status: 'applied',
    effectRuleTargets: [{ eventId: 'chat.assistant_reply.completed', label: '助手回复完成' }]
  });
  assert.match(html, /声音设置/);
  assert.match(html, /自定义声音/);
  assert.match(html, /全局声音/);
  assert.match(html, /config-event-id/);
  assert.match(html, /syncSelectedBinding\(true\)/);
  assert.match(html, /config-volume/);
  assert.doesNotMatch(html, /effect-rule-sound/);
  assert.doesNotMatch(html, /effect-rules\/sound/);
  assert.match(html, /chat\.assistant_reply\.completed/);
  assert.match(html, /tool\.execution\.failed/);
  assert.match(html, /delivery\.important_sound/);
  assert.match(html, /事件直接来自事件目录/);
  assert.doesNotMatch(html, /重要级别/);
  assert.doesNotMatch(html, /id="binding-volume"/);
  assert.match(html, /binding-volume-input/);
  assert.match(html, /binding-save/);
  assert.match(html, /组合音量已保存/);
  assert.match(html, /如果删除/);
  assert.match(html, /asset-delete-confirm/);
  assert.match(html, /音频库/);
  assert.match(html, /已自定义声音/);
  assert.doesNotMatch(html, /workbench-importance/);
  assert.match(html, /suppress-duplicate-sounds/);
  assert.match(html, /抑制重复通知声音/);
  assert.match(html, /测试当前组合/);
  assert.match(html, /最近声音状态/);
  assert.match(html, /sound-diagnostics-list/);
  assert.match(html, /还没有声音诊断记录/);
  assert.match(html, /解除配置/);
  assert.doesNotMatch(html, /combo-asset-conflict/);
  assert.match(html, /combo-binding-conflict/);
  assert.match(html, /全部覆盖/);
  assert.match(html, /全部保留/);
  assert.match(html, /bindingConflictByEventId: bindingConflictByEventId \|\| \{\}/);
  assert.match(html, /all-replace-combo-bindings.*pendingComboPackageText.*importSoundCombo/);
  assert.match(html, /all-keep-combo-bindings.*pendingComboPackageText.*importSoundCombo/);
  assert.match(html, /确认导入/);
  assert.match(html, /保留本地绑定/);
  assert.match(html, /添加本地音频/);
  assert.match(html, /导入音频包（\.nhsound）/);
  assert.match(html, /package-conflict-list/);
  assert.match(html, /apply-package-conflicts/);
  assert.match(html, /all-replace-sound-package/);
  assert.match(html, /all-keep-sound-package/);
  assert.match(html, /导出音频包（\.nhsound）/);
  assert.match(html, /sound-settings-test/);
  assert.match(html, /声音实验台/);
  assert.match(html, /workbench-event-id/);
  assert.match(html, /workbench-count/);
  assert.match(html, /workbench-interval/);
  assert.doesNotMatch(html, /id="workbench-sound"/);
  assert.doesNotMatch(html, /workbenchInput\(\).*soundId/);
  assert.match(html, /sound-binding-remove/);
  assert.match(html, /sound-asset-import/);
  assert.match(html, /sound-asset-configure/);
  assert.match(html, /sound-asset-test/);
  assert.match(html, /sound-asset-delete/);
  assert.match(html, /data-delete-warning/);
  assert.match(html, /soundId/);
  assert.match(html, /Windows 系统默认声音/);
  assert.doesNotMatch(html, /C:\\\\secret\\\\/);
  assert.match(html, /重要声音/);
  assert.match(html, /频率受限/);
  assert.doesNotMatch(html, /触发频率限制/);
  assert.match(html, /window\.hana && window\.hana\.api/);
  assert.match(html, /api\.fetch\(path, requestOptions\)/);
  assert.match(html, /pluginSurfaceSession/);
  assert.match(html, /JSON\.parse\(text\.trim\(\)\)/);
  assert.match(html, /SOUND_SETTINGS_RESPONSE_INVALID/);
  assert.match(html, /SOUND_SETTINGS_REQUEST_TIMEOUT/);
  assert.match(html, /latestRevision/);
  assert.match(html, /revision < latestRevision/);
  assert.match(html, /pageUrl/);
  assert.doesNotMatch(html, /分类默认/);
  assert.doesNotMatch(html, /value="tool">工具<\/option><option value="error">错误/);
  assert.doesNotMatch(html, /分类声音开关与音量/);
  assert.doesNotMatch(html, /<h2>声音测试<\/h2>/);
  assert.doesNotMatch(html, /保存三层组合/);
  assert.doesNotMatch(html, /import-binding-category/);
  assert.doesNotMatch(html, /overflow-x\s*:\s*hidden/);
  assert.doesNotMatch(html, /window\.confirm/);
  assert.doesNotMatch(html, /document\.open\(\)/);
});

test('sound settings route only registers a non-page-surface HTML route', () => {
  const { app, routes } = harness();
  registerSoundSettingsRoute(app, {});
  assert.deepEqual([...routes.keys()], ['GET /settings-sound']);
  const response = routes.get('GET /settings-sound')({
    req: { url: '/settings-sound' },
    html(value) { return { kind: 'html', value }; }
  });
  assert.equal(response.kind, 'html');
  assert.match(response.value, /声音设置/);
});
