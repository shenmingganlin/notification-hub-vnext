import assert from 'node:assert/strict';
import test from 'node:test';

import registerRuntimeRoute, { renderRuntimePage } from '../../plugin/routes/runtime.js';
import { renderPageNavigation } from '../../plugin/routes/page-navigation.js';

function createRouteHarness() {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); }
  };
  const json = (value, status = 200) => ({ value, status, kind: 'json' });
  const html = (value, status = 200) => ({ value, status, kind: 'html' });
  const contextFor = () => ({
    req: { url: 'https://hana.local/api/plugins/notification-hub-vnext/runtime?token=t1' },
    json,
    html
  });
  return { app, routes, contextFor };
}

test('runtime navigation is an active page link', () => {
  const html = renderPageNavigation({
    active: 'runtime',
    currentUrl: 'http://host/plugin/notification-hub-vnext/notification-center'
  });
  assert.match(html, /id="page-nav-runtime"/);
  assert.doesNotMatch(html, /id="page-nav-runtime"[^>]*coming-soon/);
  assert.doesNotMatch(html, /id="page-nav-runtime"[^>]*aria-disabled/);
  assert.doesNotMatch(html, /Runtime（即将开放）/);
});

test('runtime route renders status and retry controls', () => {
  const html = renderRuntimePage('http://host/plugin/notification-hub-vnext/runtime');
  assert.match(html, /桌面 Runtime/);
  assert.match(html, /runtime-status/);
  assert.match(html, /runtime-retry/);
  assert.match(html, /重试启动/);
  assert.match(html, /runtime-recovery/);
  assert.match(html, /当前已恢复/);
  assert.match(html, /hana\.api/);
  assert.doesNotMatch(html, /stdout/);
  assert.doesNotMatch(html, /stderr/);
});

test('runtime routes expose status and structured retry errors', async () => {
  const harness = createRouteHarness();
  registerRuntimeRoute(harness.app, {
    _notificationHubVNextRuntimeApi: {
      async getRuntimePageStatus() {
        return { state: 'running', connected: true, health: { cardCount: 2 } };
      },
      async retryRuntime() {
        throw Object.assign(new Error('Runtime unavailable'), {
          code: 'RUNTIME_RETRY_FAILED',
          details: { stage: 'host-start' }
        });
      }
    }
  });

  assert.equal(harness.routes.size, 3);
  const page = harness.routes.get('GET /runtime')(harness.contextFor());
  assert.equal(page.kind, 'html');
  const status = await harness.routes.get('GET /runtime-status')(harness.contextFor());
  assert.deepEqual(status.value, { ok: true, status: { state: 'running', connected: true, health: { cardCount: 2 } } });
  const retry = await harness.routes.get('POST /runtime-retry')(harness.contextFor());
  assert.equal(retry.status, 503);
  assert.deepEqual(retry.value.error, {
    code: 'RUNTIME_RETRY_FAILED',
    message: 'Runtime 重试失败。',
    details: { stage: 'host-start' }
  });
});

test('runtime routes report unavailable API with stable error', async () => {
  const harness = createRouteHarness();
  registerRuntimeRoute(harness.app, {});
  const status = await harness.routes.get('GET /runtime-status')(harness.contextFor());
  assert.equal(status.status, 503);
  assert.deepEqual(status.value.error, {
    code: 'RUNTIME_PAGE_API_UNAVAILABLE',
    message: 'Runtime 页面暂时不可用。',
    details: {}
  });
});

test('runtime page uses Hana iframe API fallback without a new page surface', () => {
  const html = renderRuntimePage();
  assert.match(html, /window\.hana\.api\.fetch/);
  assert.doesNotMatch(html, /fetch\("\/(?:runtime-status|runtime-retry)/);
  assert.match(html, /pluginSurfaceSession/);
  assert.match(html, /page-navigation/);
});
