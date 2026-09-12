import assert from 'node:assert/strict';
import test from 'node:test';

import registerWidgetRoute, { renderWidget } from '../../plugin/routes/widget.js';

function createRouteHarness() {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); }
  };
  const json = (value, status = 200) => ({ value, status, kind: 'json' });
  const html = (value, status = 200) => ({ value, status, kind: 'html' });
  const contextFor = (body = {}) => ({
    req: { json: async () => body },
    json,
    html
  });
  return { app, routes, contextFor };
}

test('temporary Runtime widget registers its page and API endpoints', async () => {
  const harness = createRouteHarness();
  const calls = [];
  const status = {
    state: 'running',
    runtimeStatus: {
      state: 'running',
      message: 'Runtime 正常运行',
      lastError: null,
      connected: true,
      clientState: 'connected'
    },
    health: { sceneCards: [] }
  };
  const widget = {
    recent: [{ notificationId: 'n-1', title: '通知', summary: '摘要', type: 'tool_error', source: 'hana.tool', importance: 'normal', status: 'formatted', createdAt: '2026-08-11T09:00:00.000Z', unread: true }],
    unreadCount: 1,
    totalCount: 1,
    summary: '摘要'
  };
  const api = {
    async getNotificationWidgetStatus() { calls.push('widget'); return widget; },
    async getRuntimeTestStatus() { calls.push('status'); return status; },
    async createRuntimeTestCard(input) { calls.push(['create', input]); return { card: { id: 'nh-vnext-test-1' }, response: {}, status }; },
    async clearRuntimeTestCards() { calls.push('clear'); return { dismissed: ['nh-vnext-test-1'], status }; },
    async applyRuntimeTestLayout(input) { calls.push(['layout', input]); return { layout: { layout: 'shelf' }, status }; }
  };
  registerWidgetRoute(harness.app, { _notificationHubVNextPlugin: api });

  assert.equal(harness.routes.size, 8);
  const page = harness.routes.get('GET /widget')(harness.contextFor());
  assert.equal(page.kind, 'html');
  assert.match(page.value, /通知入口与 Runtime 状态/);
  assert.match(page.value, /notification-widget-summary/);
  assert.match(page.value, /共 \" \+ String\(widget\.totalCount\)/);
  assert.match(page.value, /String\(recent\.length\)/);
  assert.doesNotMatch(page.value, /Math\.min\(3, widget\.totalCount\)/);
  assert.doesNotMatch(page.value, /notification-widget-summary\)\.textContent = widget\.summary/);
  assert.match(page.value, /notification-widget-unread-count/);
  assert.match(page.value, /notification-widget-recent/);
  assert.match(page.value, /notification-widget-open-center/);
  assert.match(page.value, /notification-widget-status/);
  assert.match(page.value, /sidebar-display-limit-select/);
  assert.match(page.value, /sidebar-display-limit-custom/);
  assert.match(page.value, /sidebar-display-settings/);
  assert.match(page.value, /notificationId/);
  assert.match(page.value, /pluginSurfaceSession/);
  assert.match(page.value, /最近通知/);
  assert.match(page.value, /Runtime/);
  assert.match(page.value, /runtime-recovery/);
  assert.match(page.value, /TRANSPORT_RECONNECT_RETRY/);
  assert.match(page.value, /当前已恢复/);
  assert.match(page.value, /通知中心/);
  assert.match(page.value, /notification-widget-recent.*notification-widget-detail/s);
  assert.match(page.value, /notification-widget-detail.*data-notification-id/s);
  assert.match(page.value, /notification-widget-open-center.*addEventListener\(\"click\"/s);
  assert.match(page.value, /navigate-tab/);
  assert.match(page.value, /plugin:notification-hub-vnext/);
  assert.match(page.value, /pending-detail/);
  assert.match(page.value, /localStorage/);
  assert.match(page.value, /notificationId: notificationId/);
  assert.match(page.value, /notification-widget-recent.*addEventListener\(\"click\"/s);
  assert.match(page.value, /notification-center\?notificationId=/);
  assert.match(page.value, /request\(\"\.\/runtime-test-status\"/);
  assert.match(page.value, /request\(\"\.\/notification-widget-status\"/);
  assert.match(page.value, /minmax\(0, 1fr\)/);
  assert.match(page.value, /max-width: 100%/);
  assert.match(page.value, /window\.parent\.postMessage\(\{ type: \"ready\" \}, \"\*\"\)/);
  assert.doesNotMatch(page.value, /overflow-x:\s*hidden/);
  assert.doesNotMatch(page.value, /创建卡片/);
  assert.doesNotMatch(page.value, /应用 Shelf/);
  assert.doesNotMatch(page.value, /第一步：选择停靠位置/);
  assert.doesNotMatch(page.value, /SceneState 卡片/);
  assert.doesNotMatch(page.value, /request\(\"\.\/runtime-test-card\"/);

  const sidebarSettings = { settings: { mode: 'preset', limit: 3 }, limit: 3 };
  const settingsApi = {
    ...api,
    getSidebarDisplaySettings() { calls.push('sidebar-get'); return sidebarSettings; },
    async updateSidebarDisplaySettings(input) { calls.push(['sidebar-update', input]); return { settings: input, limit: input.limit }; }
  };
  const settingsHarness = createRouteHarness();
  registerWidgetRoute(settingsHarness.app, { _notificationHubVNextPlugin: settingsApi });
  assert.deepEqual(
    (await settingsHarness.routes.get('GET /sidebar-display-settings')(settingsHarness.contextFor())).value,
    { ok: true, ...sidebarSettings }
  );
  assert.deepEqual(
    (await settingsHarness.routes.get('POST /sidebar-display-settings')(settingsHarness.contextFor({ mode: 'custom', limit: 7 }))).value,
    { ok: true, settings: { mode: 'custom', limit: 7 }, limit: 7 }
  );

  const widgetResponse = await harness.routes.get('GET /notification-widget-status')(harness.contextFor());
  assert.deepEqual(widgetResponse.value, { ok: true, widget });

  const statusResponse = await harness.routes.get('GET /runtime-test-status')(harness.contextFor());
  assert.deepEqual(statusResponse.value, status);

  const createResponse = await harness.routes.get('POST /runtime-test-card')(
    harness.contextFor({ title: '标题', body: '内容' })
  );
  assert.equal(createResponse.value.ok, true);
  assert.deepEqual(calls.at(-2), ['create', { title: '标题', body: '内容' }]);

  const clearResponse = await harness.routes.get('POST /runtime-test-cards/clear')(harness.contextFor());
  assert.deepEqual(clearResponse.value.dismissed, ['nh-vnext-test-1']);

  const layoutResponse = await harness.routes.get('POST /runtime-test-layout')(
    harness.contextFor({ direction: 'left', anchor: 'top-right', spacing: 8 })
  );
  assert.deepEqual(layoutResponse.value.layout, { layout: 'shelf' });
  assert.deepEqual(calls.at(-1), ['layout', { direction: 'left', anchor: 'top-right', spacing: 8 }]);

  const failingHarness = createRouteHarness();
  registerWidgetRoute(failingHarness.app, {
    _notificationHubVNextPlugin: {
      async applyRuntimeTestLayout() {
        throw Object.assign(new Error('Shelf cards exceed the work area width'), { code: 'LAYOUT_SHELF_OUT_OF_BOUNDS' });
      }
    }
  });
  const failingResponse = await failingHarness.routes.get('POST /runtime-test-layout')(
    failingHarness.contextFor({ direction: 'right', anchor: 'bottom-left', spacing: 12 })
  );
  assert.equal(failingResponse.value.error.code, 'LAYOUT_SHELF_OUT_OF_BOUNDS');
  assert.match(failingResponse.value.error.message, /工作区横向空间不足/);
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] : call), ['sidebar-get', 'sidebar-update', 'widget', 'status', 'create', 'status', 'clear', 'layout']);
});

test('widget mutation routes reject invalid JSON and return structured errors', async () => {
  const harness = createRouteHarness();
  let called = false;
  registerWidgetRoute(harness.app, {
    _notificationHubVNextPlugin: {
      async applyRuntimeTestLayout() { called = true; }
    }
  });
  const response = await harness.routes.get('POST /runtime-test-layout')({
    ...harness.contextFor(),
    req: { json: async () => { throw new SyntaxError('Unexpected token'); } }
  });
  assert.equal(response.status, 400);
  assert.deepEqual(response.value, {
    ok: false,
    error: { code: 'ROUTE_INVALID_JSON', message: '请求体必须是合法 JSON。', details: { field: 'body' } }
  });
  assert.equal(called, false);

  const internal = createRouteHarness();
  registerWidgetRoute(internal.app, {
    _notificationHubVNextPlugin: {
      async applyRuntimeTestLayout() { throw Object.assign(new Error('runtime failed'), { code: 'RUNTIME_TEST_INTERNAL_FAILED' }); }
    }
  });
  const internalResponse = await internal.routes.get('POST /runtime-test-layout')(internal.contextFor({}));
  assert.equal(internalResponse.status, 500);
  assert.equal(internalResponse.value.error.code, 'RUNTIME_TEST_INTERNAL_FAILED');
});

test('widget status route reports a stable unavailable error', async () => {
  const harness = createRouteHarness();
  registerWidgetRoute(harness.app, { _notificationHubVNextPlugin: {} });

  const response = await harness.routes.get('GET /notification-widget-status')(harness.contextFor());

  assert.equal(response.status, 503);
  assert.deepEqual(response.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_WIDGET_API_UNAVAILABLE',
      message: 'Notification Widget API unavailable',
      details: {}
    }
  });
});

test('sidebar widget renders a compact self-contained dashboard shell', () => {
  const html = renderWidget();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /最近通知/);
  assert.match(html, /Runtime/);
  assert.match(html, /minmax\(0, 1fr\)/);
  assert.doesNotMatch(html, /overflow-x:\s*hidden/);
  assert.doesNotMatch(html, /创建卡片/);
  assert.doesNotMatch(html, /应用 Shelf/);
  assert.doesNotMatch(html, /SceneState 卡片/);
});
