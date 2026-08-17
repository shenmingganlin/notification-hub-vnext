import assert from 'node:assert/strict';
import test from 'node:test';
import registerVisualSettingsRoute, { renderVisualSettingsPage, renderVisualSettingsFragment } from '../../plugin/routes/settings-visual.js';

function harness() {
  const routes = new Map();
  const app = { get(path, handler) { routes.set(`GET ${path}`, handler); }, post(path, handler) { routes.set(`POST ${path}`, handler); } };
  return { app, routes };
}

test('visual settings page renders independent presets and current iframe fetch', () => {
  const html = renderVisualSettingsPage('/settings-visual', {
    settings: { profile: { version: 1, global: { enabled: true, preset: 'soft' }, categories: { error: { preset: 'critical' } } } },
    revision: 3,
    status: 'applied'
  });
  assert.match(html, /行为与视觉/);
  assert.match(html, /视觉规则/);
  assert.match(html, /effect-rule-preset/);
  assert.match(html, /effect-rule-intensity/);
  assert.match(html, /effect-rule-targets/);
  assert.match(html, /保存视觉规则/);
  assert.match(html, /effect-rules\/visual/);
  assert.doesNotMatch(html, /window\.confirm/);
  assert.match(html, /分类视觉预设/);
  assert.match(html, /卡片种类/);
  assert.match(html, /极简卡片/);
  assert.match(html, /card-background-color/);
  assert.match(html, /critical/);
  assert.match(html, /通知卡片预览/);
  assert.match(html, /preview-category/);
  assert.match(html, /preview-importance/);
  assert.match(html, /visual-settings-status/);
  assert.match(html, /visual-settings-update/);
  assert.match(html, /visual-settings-preview/);
  assert.match(html, /后端策略已确认/);
  const fragment = renderVisualSettingsFragment('/settings-content?view=visual', {
    profile: { global: { enabled: true, preset: 'soft' }, categories: {} },
    status: 'saved'
  });
  assert.match(fragment, /save-dock/);
  assert.match(fragment, /card-type/);
  assert.match(fragment, /notification-hub-settings-status/);
  assert.match(fragment, /if\(!\$\("preview"\)\)return/);
  assert.doesNotMatch(fragment, /back-settings.*addEventListener/);
  assert.match(html, /VISUAL_SETTINGS_REQUEST_TIMEOUT/);
  assert.match(html, /Promise\.race\(\[operation,timeout\]\)/);
  assert.doesNotMatch(html, /overflow-x\s*:\s*hidden/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length >= 1);
  scripts.forEach((script) => assert.doesNotThrow(() => new Function(script)));
  assert.match(html, /revision/);
  assert.match(html, /已应用/);
  assert.match(html, /返回设置中心/);
  assert.doesNotMatch(html, /document\.open\(\)/);
});

test('visual settings route exposes status, update, and preview endpoints', async () => {
  const { app, routes } = harness();
  const calls = [];
  const api = {
    getVisualSettingsStatus() { calls.push('status'); return { revision: 1, status: 'applied' }; },
    async updateVisualSettings(patch) { calls.push(['update', patch]); return { revision: 2, status: 'applied' }; },
    previewVisualSettings(input) { calls.push(['preview', input]); return { input, decision: { enabled: true, preset: 'soft', intensity: 'balanced', category: 'chat', matchedBy: 'category', reason: 'category-policy' } }; }
  };
  registerVisualSettingsRoute(app, { _notificationHubVNextPlugin: api });
  assert.deepEqual([...routes.keys()], ['GET /settings-visual', 'GET /visual-settings-status', 'POST /visual-settings-update', 'POST /visual-settings-preview']);
  const context = (body = {}) => ({ req: { url: '/settings-visual', json: async () => body }, html(value) { return { kind: 'html', value }; }, json(value, status = 200) { return { value, status }; } });
  assert.match(routes.get('GET /settings-visual')(context()).value, /行为与视觉/);
  assert.equal((routes.get('GET /visual-settings-status')(context())).value.ok, true);
  assert.equal((await routes.get('POST /visual-settings-update')(context({ profile: { global: { preset: 'accent' } } }))).value.ok, true);
  const previewResponse = await routes.get('POST /visual-settings-preview')(context({ labels: ['chat'], importance: 'normal' }));
  assert.equal(previewResponse.value.ok, true);
  assert.deepEqual(previewResponse.value.decision, { enabled: true, preset: 'soft', intensity: 'balanced', category: 'chat', matchedBy: 'category', reason: 'category-policy' });
  assert.deepEqual(calls.at(-1), ['preview', { labels: ['chat'], importance: 'normal' }]);
});
