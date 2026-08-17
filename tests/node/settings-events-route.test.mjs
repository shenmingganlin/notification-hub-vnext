import assert from 'node:assert/strict';
import test from 'node:test';

import registerSettingsRoute from '../../plugin/routes/settings.js';

function createHarness() {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    delete(path, handler) { routes.set(`DELETE ${path}`, handler); }
  };
  const plugin = {
    getEventPresentationSettings() { return { revision: 1, status: 'saved', rows: [{ eventId: 'tool.execution.failed', label: '工具执行失败', categoryId: 'tool', matchedBy: 'global', binding: { soundProfileId: 'sound.default', visualProfileId: 'visual.default', behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' } }], settings: { importanceKeywords: { keywords: ['验证码'] } } }; },
    updateEventPresentationSettings(patch) { return { revision: 2, status: 'applied', rows: [], settings: { importanceKeywords: patch.importanceKeywords, soundRules: patch.soundRules || [], visualRules: patch.visualRules || [] } }; },
  };
  const json = (value, status = 200) => ({ body: value, value, status, kind: 'json' });
  const html = (value, status = 200) => ({ value, status, kind: 'html' });
  const context = (body = {}, url = '/settings-content?view=events') => ({ req: { url, json: async () => body, param: (key) => ({ kind: 'sound', ruleId: 'sound-1' }[key]) }, json, html });
  return { routes, app, plugin, context };
}

test('settings events view renders the event directory and keyword controls', () => {
  const harness = createHarness();
  registerSettingsRoute(harness.app, { _notificationHubVNextPlugin: harness.plugin });
  const response = harness.routes.get('GET /settings-content')(harness.context());
  assert.equal(response.kind, 'html');
  assert.match(response.value, /事件目录与表现绑定/);
  assert.match(response.value, /tool\.execution\.failed/);
  assert.match(response.value, /重要性关键词/);
});

test('event presentation settings route reads and updates through the plugin API', async () => {
  const harness = createHarness();
  registerSettingsRoute(harness.app, { _notificationHubVNextPlugin: harness.plugin });
  const status = await harness.routes.get('GET /event-presentation-settings')(harness.context());
  assert.equal(status.body.ok, true);
  const updated = await harness.routes.get('POST /event-presentation-settings')(harness.context({ importanceKeywords: { keywords: ['授权码'] } }));
  assert.equal(updated.body.ok, true);
  assert.deepEqual(updated.body.settings.importanceKeywords, { keywords: ['授权码'] });
});
