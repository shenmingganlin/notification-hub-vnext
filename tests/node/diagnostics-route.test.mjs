import assert from 'node:assert/strict';
import test from 'node:test';

import registerDiagnosticsRoute, { renderDiagnosticsPage } from '../../plugin/routes/diagnostics.js';

function createRouteHarness() {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); }
  };
  const json = (value, status = 200) => ({ value, status, kind: 'json' });
  const html = (value, status = 200) => ({ value, status, kind: 'html' });
  const contextFor = (body = {}) => ({ req: { url: '/api/plugins/notification-hub-vnext/diagnostics', json: async () => body }, json, html });
  return { app, routes, contextFor };
}

test('diagnostics page renders structured evidence without raw process streams or scene card lists', () => {
  const html = renderDiagnosticsPage('/api/plugins/notification-hub-vnext/diagnostics?token=t1');
  assert.match(html, /诊断中心/);
  assert.match(html, /Named Pipe/);
  assert.match(html, /恢复与布局/);
  assert.match(html, /行为通道与卡片/);
  assert.match(html, /sceneBehavior/);
  assert.match(html, /behaviorChannelId/);
  assert.match(html, /最近诊断/);
  assert.match(html, /traceId/);
  assert.match(html, /diagnostics-status/);
  assert.match(html, /request\("diagnostics-status"\)/);
  assert.match(html, /导出诊断记录/);
  assert.match(html, /notification-hub-diagnostics/);
  assert.match(html, /diagnostics-export/);
  assert.match(html, /正在打开 Windows 保存对话框/);
  assert.doesNotMatch(html, /URL\.createObjectURL/);
  assert.match(html, /\.shell \{ width:100%; max-width:1120px/);
  assert.doesNotMatch(html, /width:min\(100% -/);
  assert.doesNotMatch(html, /stdout/);
  assert.doesNotMatch(html, /stderr/);
  assert.doesNotMatch(html, /sceneCards/);
  assert.match(html, /原始进程输出/);
  assert.match(html, /data-page-navigation-path="#diagnostics"/);
});

test('diagnostics export route saves through the plugin API and preserves cancellation', async () => {
  const harness = createRouteHarness();
  const calls = [];
  registerDiagnosticsRoute(harness.app, { _notificationHubVNextRuntimeApi: {
    async exportDiagnostics(input) { calls.push(input); return { cancelled: true, savedToFile: false, savedFilename: null }; }
  } });

  const response = await harness.routes.get('POST /diagnostics-export')(harness.contextFor({ name: 'diagnostics-test' }));
  assert.deepEqual(response.value, { ok: true, cancelled: true, savedToFile: false, savedFilename: null });
  assert.deepEqual(calls, [{ name: 'diagnostics-test' }]);
});

test('diagnostics export route returns a stable unavailable error', async () => {
  const harness = createRouteHarness();
  registerDiagnosticsRoute(harness.app, {});

  const response = await harness.routes.get('POST /diagnostics-export')(harness.contextFor());
  assert.equal(response.status, 503);
  assert.equal(response.value.error.code, 'DIAGNOSTICS_PAGE_API_UNAVAILABLE');
});

test('diagnostics status route returns page status from the plugin API', async () => {
  const harness = createRouteHarness();
  const status = {
    pluginName: 'notification-hub-vnext',
    pluginVersion: '0.1.0',
    runtime: { state: 'running', connected: true },
    summary: { total: 1, errors: 0, warnings: 1, recoverable: 1, currentFailure: false },
    diagnostics: [{ code: 'TRANSPORT_RECONNECT_RETRY', severity: 'warning' }]
  };
  registerDiagnosticsRoute(harness.app, { _notificationHubVNextRuntimeApi: { async getDiagnosticsPageStatus() { return status; } } });

  const response = await harness.routes.get('GET /diagnostics-status')(harness.contextFor());
  assert.deepEqual(response.value, { ok: true, status });
});

test('diagnostics status route reports a stable unavailable error', async () => {
  const harness = createRouteHarness();
  registerDiagnosticsRoute(harness.app, {});

  const response = await harness.routes.get('GET /diagnostics-status')(harness.contextFor());
  assert.equal(response.status, 503);
  assert.deepEqual(response.value, {
    ok: false,
    error: {
      code: 'DIAGNOSTICS_PAGE_API_UNAVAILABLE',
      message: '诊断中心暂时不可用。',
      details: {}
    }
  });
});
