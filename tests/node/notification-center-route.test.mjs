import assert from 'node:assert/strict';
import test from 'node:test';

import registerNotificationCenterRoute, { renderNotificationCenterPage } from '../../plugin/routes/notification-center.js';

function createRouteHarness() {
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); }
  };
  const json = (value, status = 200) => ({ value, status, kind: 'json' });
  const html = (value, status = 200) => ({ value, status, kind: 'html' });
  const contextFor = ({ query = {}, params = {}, headers = {}, url = '', body = {}, nativeRequest = false } = {}) => {
    if (nativeRequest) {
      const raw = new Request(`http://notification-hub.local${url || '/notification-status'}`, {
        headers
      });
      return {
        json,
        html,
        req: {
          raw,
          get url() { return this.raw.url; },
          query(name) { return new URL(this.url).searchParams.get(name) ?? undefined; },
          header(name) { return this.raw.headers.get(name) ?? undefined; },
          param(name) { return params[name]; },
          json: async () => body
        }
      };
    }
    return {
      json,
      html,
      req: {
        query: (name) => query[name],
        header: (name) => headers[name.toLowerCase()],
        param: (name) => params[name],
        json: async () => body,
        url
      }
    };
  };
  return { app, routes, contextFor };
}

const records = [
  {
    notificationId: 'notification-latest',
    source: 'agent',
    type: 'message',
    title: '最新通知',
    content: '最新正文',
    summary: '最新摘要',
    importance: 'critical',
    status: 'received',
    createdAt: '2026-08-05T09:02:00.000Z',
    updatedAt: '2026-08-05T09:02:00.000Z'
  },
  {
    notificationId: 'notification-earlier',
    source: 'runtime',
    type: 'diagnostic',
    title: '较早通知',
    content: '较早正文',
    summary: '',
    importance: 'normal',
    status: 'shown',
    createdAt: '2026-08-05T09:01:00.000Z',
    updatedAt: '2026-08-05T09:01:00.000Z'
  }
];

test('notification center renders event-first filters and advanced source controls', () => {
  const page = renderNotificationCenterPage('');
  assert.match(page, /快速视图/);
  assert.match(page, /事件类型/);
  assert.match(page, /更多筛选/);
  assert.match(page, /id="clear-filters"/);
  assert.match(page, /id="all-event-filter"/);
  assert.match(page, /id="tool-success-event-filter"/);
  assert.match(page, /工具成功/);
  assert.match(page, /id="tool-error-event-filter"/);
  assert.match(page, /工具失败/);
  assert.match(page, /id="model-service-error-event-filter"/);
  assert.match(page, /producer-filter/);
  assert.match(page, /channel-filter/);
  assert.match(page, /notification-search/);
  assert.match(page, /&search=/);
  assert.match(page, /filterState/);
  assert.match(page, /&event=/);
  assert.doesNotMatch(page, /id="plugin-event-filter"/);
  assert.doesNotMatch(page, />插件<\/button>/);
});

test('notification center settings entry injects sound and visual initial state', () => {
  const harness = createRouteHarness();
  const calls = [];
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextNotificationApi: { listNotifications: () => [] },
    _notificationHubVNextSettingsApi: {
      getSoundSettingsStatus: () => { calls.push('sound'); return { profile: { global: { volume: 0.4 } }, assets: [{ soundId: 'custom-alert', name: '提示音', kind: 'custom', format: 'wav', fileSizeBytes: 12 }], revision: 2, status: 'applied' }; },
      getVisualSettingsStatus: () => { calls.push('visual'); return { profile: { global: { preset: 'soft' } }, revision: 3, status: 'applied' }; },
      getNotificationDisplaySettings: () => ({ limit: 100 })
    }
  });
  const page = harness.routes.get('GET /notification-center')(harness.contextFor({ query: { view: 'settings' }, url: '/notification-center?view=settings' }));
  assert.match(page.value, /Notification Hub 设置/);
  assert.deepEqual(calls, ['sound', 'visual']);
});

test('notification center mutation routes reject invalid JSON before the domain API', async () => {
  const harness = createRouteHarness();
  let called = false;
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextSettingsApi: {
      async updateNotificationDisplaySettings() { called = true; }
    }
  });
  const response = await harness.routes.get('POST /notification-center-display-settings')({
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

test('notification center owns a direct display settings read and write route', async () => {
  const harness = createRouteHarness();
  let saved;
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextNotificationApi: { listNotifications: () => [] },
    _notificationHubVNextSettingsApi: {
      getNotificationDisplaySettings: () => ({ settings: { mode: 'preset', limit: 100, cardLifetimeSeconds: 120 }, limit: 100, cardLifetimeSeconds: 120 }),
      updateNotificationDisplaySettings: async (patch) => { saved = patch; return { settings: { mode: 'custom', limit: 7, cardLifetimeSeconds: 0 }, limit: 7, cardLifetimeSeconds: 0, persistence: { enabled: true, filePath: 'display.json' } }; }
    }
  });
  const read = await harness.routes.get('GET /notification-center-display-settings')(harness.contextFor());
  assert.equal(read.status, 200);
  assert.equal(read.value.settings.limit, 100);
  const write = await harness.routes.get('POST /notification-center-display-settings')(harness.contextFor({ body: { mode: 'custom', limit: 7, cardLifetimeSeconds: 0 } }));
  assert.equal(write.status, 200);
  assert.equal(write.value.saved, true);
  assert.deepEqual(saved, { mode: 'custom', limit: 7, cardLifetimeSeconds: 0 });
});

test('notification center lists unread notifications when requested', async () => {
  const harness = createRouteHarness();
  const calls = [];
  const api = {
    listNotifications(options) {
      calls.push(options);
      return records;
    }
  };

  registerNotificationCenterRoute(harness.app, { _notificationHubVNextNotificationApi: api });

  assert.equal(harness.routes.size, 14);
  const page = harness.routes.get('GET /notification-center')(harness.contextFor());
  assert.equal(page.kind, 'html');
  assert.match(page.value, /Notification Center/);
  assert.match(page.value, /通知中心/);
  assert.match(page.value, /page-navigation/);
  assert.match(page.value, /page-nav-notification-center/);
  assert.match(page.value, /page-nav-settings/);
  assert.doesNotMatch(page.value, /API 卡片/);
  assert.doesNotMatch(page.value, /id="api-filter"/);
  assert.match(page.value, /聊天/);
  assert.match(page.value, /频道/);
  assert.match(page.value, /工具/);
  assert.match(page.value, /错误/);
  assert.match(page.value, /外部调用/);
  assert.doesNotMatch(page.value, /id="plugin-event-filter"/);
  assert.match(page.value, /data-category/);
  assert.doesNotMatch(page.value, /声音与布局设置/);
  assert.doesNotMatch(page.value, /id="settings-link"/);
  assert.match(page.value, /notification-status/);
  assert.match(page.value, /pluginSurfaceSession/);
  assert.match(page.value, /current\.pathname/);
  assert.doesNotMatch(page.value, /surfaceLink\("settings"\)/);
  assert.match(page.value, /query\.get\("token"\)/);

  const settingsPage = harness.routes.get('GET /notification-center')(harness.contextFor({ url: '/notification-center?view=settings&token=t1' }));
  assert.equal(settingsPage.kind, 'html');
  assert.match(settingsPage.value, /Notification Hub 设置/);
  assert.match(settingsPage.value, /page-nav-settings/);
  assert.doesNotMatch(settingsPage.value, /声音与布局设置/);
  assert.match(page.value, /id="all-filter"/);
  assert.match(page.value, /id="unread-filter"/);
  assert.match(page.value, /id="important-filter"/);
  assert.match(page.value, /id="clear-filters"/);
  assert.match(page.value, /producer-filter/);
  assert.match(page.value, /channel-filter/);
  assert.match(page.value, /channelKind/);
  assert.match(page.value, /filterState/);
  assert.doesNotMatch(page.value, /Hana 会话通知/);
  assert.match(page.value, /data-event-filter="model_service_error"/);
  assert.match(page.value, /producerKind=/);
  assert.match(page.value, /channelKind=/);
  assert.match(page.value, /refreshQueued/);
  assert.match(page.value, /var detailOpen = false/);
  assert.match(page.value, /var activeDetailId = null/);
  assert.match(page.value, /function closeDetail\(notificationId\)/);
  assert.match(page.value, /notification-detail/);
  assert.match(page.value, /class="close-detail"/);
  assert.match(page.value, /notification-status/);
  assert.match(page.value, /var headers = new Headers/);
  assert.match(page.value, /X-Hana-Plugin-Surface-Session/);
  assert.match(page.value, /mark-read/);
  assert.match(page.value, /select-all/);
  assert.match(page.value, /selected-count/);
  assert.match(page.value, /batch-mark-read/);
  assert.match(page.value, /notification-select/);
  assert.match(page.value, /notification-status\/batch/);
  assert.match(page.value, /view-detail/);
  assert.match(page.value, /notification-detail/);
  assert.match(page.value, /searchParams\.get\("notificationId"\)/);
  assert.match(page.value, /pending-detail/);
  assert.match(page.value, /localStorage/);
  assert.match(page.value, /showDetail\(notificationId\)/);
  assert.match(page.value, /function scrollToCard\(card\)/);
  assert.match(page.value, /card\.scrollIntoView\(\{ behavior: "auto", block: "center", inline: "nearest" \}\)/);
  assert.match(page.value, /scrollToCard\(card\)/);
  assert.match(page.value, /closeDetail\(\);\s*scrollToCard\(card\);\s*var token = \+\+detailRequestToken/);
  assert.match(page.value, /activeDetailId = notificationId/);
  assert.match(page.value, /addEventListener\("storage"/);
  assert.doesNotMatch(page.value, /if \(!detailOpen && findCard\(notificationId\)\)/);
  assert.match(page.value, /查看详情/);
  assert.match(page.value, /关闭详情/);
  assert.match(page.value, /card\.insertAdjacentHTML\("beforeend", detailMarkup/);
  assert.match(page.value, /if \(detailOpen && !manual\) return/);
  assert.match(page.value, /openDetailId = activeDetailId/);
  assert.doesNotMatch(page.value, /id="detail-panel"/);
  assert.match(page.value, /暂无通知/);

  const response = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { unread: 'true' } }));
  assert.equal(response.status, 200);
  assert.deepEqual(response.value, {
    ok: true,
    notifications: records,
    totalCount: 2,
    displayedCount: 2,
    displayLimit: 100,
    cardLifetimeSeconds: 120,
    hasMore: false,
    unreadCount: 2
  });
  assert.deepEqual(calls, [{ limit: 101, unread: true }]);

  const importantResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { important: 'true' } }));
  assert.equal(importantResponse.status, 200);
  assert.deepEqual(calls, [{ limit: 101, unread: true }, { limit: 101, important: true }]);

  const conversationResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { conversation: 'true' } }));
  assert.equal(conversationResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, conversation: true });

  const producerResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { producerKind: 'api' } }));
  assert.equal(producerResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, producerKind: 'api' });

  const categoryResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { category: 'error,plugin', includeClassification: 'true' } }));
  assert.equal(categoryResponse.status, 200);
  assert.deepEqual(calls.at(-1), {});
  assert.deepEqual(categoryResponse.value.notifications, []);
  assert.deepEqual(categoryResponse.value.classifications, {});

  const eventResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { event: 'tool' } }));
  assert.equal(eventResponse.status, 200);
  assert.deepEqual(calls.at(-1), {});
  const invalidEventResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { event: 'unknown' } }));
  assert.equal(invalidEventResponse.status, 400);
  assert.equal(invalidEventResponse.value.error.code, 'NOTIFICATION_EVENT_FILTER_INVALID');

  const invalidCategoryResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { category: 'unknown' } }));
  assert.equal(invalidCategoryResponse.status, 400);
  assert.equal(invalidCategoryResponse.value.error.code, 'NOTIFICATION_CATEGORY_FILTER_INVALID');

  const sourceResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { source: 'hana.session' } }));
  assert.equal(sourceResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, source: 'hana.session' });

  const channelResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { channelKind: 'chat' } }));
  assert.equal(channelResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, channelKind: 'chat' });

  const channelFilterResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { channel: 'true' } }));
  assert.equal(channelFilterResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, channel: true });

  const channelPathResponse = await harness.routes.get('GET /notification-channel')(harness.contextFor());
  assert.equal(channelPathResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, channel: true });

  const toolResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { tool: 'true' } }));
  assert.equal(toolResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, tool: true });

  const toolPathResponse = await harness.routes.get('GET /notification-tools')(harness.contextFor());
  assert.equal(toolPathResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, tool: true });

  const modelServiceResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { category: 'model_service', includeClassification: 'true' } }));
  assert.equal(modelServiceResponse.status, 200);
  assert.deepEqual(calls.at(-1), {});

  const systemResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { system: 'true' } }));
  assert.equal(systemResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, system: true });

  const systemPathResponse = await harness.routes.get('GET /notification-system')(harness.contextFor());
  assert.equal(systemPathResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, system: true });

  const invalidToolResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { tool: 'maybe' } }));
  assert.equal(invalidToolResponse.status, 400);
  assert.deepEqual(invalidToolResponse.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_CENTER_QUERY_INVALID',
      message: '筛选条件不正确。',
      details: { field: 'tool' }
    }
  });

  const invalidChannelResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { channelKind: '' } }));
  assert.equal(invalidChannelResponse.status, 400);
  assert.deepEqual(invalidChannelResponse.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_CENTER_QUERY_INVALID',
      message: '筛选条件不正确。',
      details: { field: 'channelKind' }
    }
  });

  const invalidChannelBooleanResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { channel: 'maybe' } }));
  assert.equal(invalidChannelBooleanResponse.status, 400);
  assert.deepEqual(invalidChannelBooleanResponse.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_CENTER_QUERY_INVALID',
      message: '筛选条件不正确。',
      details: { field: 'channel' }
    }
  });

  const invalidSourceResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { source: '' } }));
  assert.equal(invalidSourceResponse.status, 400);
  assert.deepEqual(invalidSourceResponse.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_CENTER_QUERY_INVALID',
      message: '筛选条件不正确。',
      details: { field: 'source' }
    }
  });

  const errorResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { error: 'true' } }));
  assert.equal(errorResponse.status, 200);
  assert.deepEqual(calls, [
    { limit: 101, unread: true },
    { limit: 101, important: true },
    { limit: 101, conversation: true },
    { limit: 101, producerKind: 'api' },
    {},
    {},
    { limit: 101, source: 'hana.session' },
    { limit: 101, channelKind: 'chat' },
    { limit: 101, channel: true },
    { limit: 101, channel: true },
    { limit: 101, tool: true },
    { limit: 101, tool: true },
    {},
    { limit: 101, system: true },
    { limit: 101, system: true },
    { limit: 101, error: true }
  ]);

  const errorPathResponse = await harness.routes.get('GET /notification-status/error')(harness.contextFor());
  assert.equal(errorPathResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, error: true });

  const errorHeaderResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ headers: { 'x-notification-error': 'true' } }));
  assert.equal(errorHeaderResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, error: true });

  const invalidConversationResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { conversation: 'maybe' } }));
  assert.equal(invalidConversationResponse.status, 400);
  assert.deepEqual(invalidConversationResponse.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_CENTER_QUERY_INVALID',
      message: '筛选条件不正确。',
      details: { field: 'conversation' }
    }
  });

  const invalidErrorResponse = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { error: 'maybe' } }));
  assert.equal(invalidErrorResponse.status, 400);
  assert.deepEqual(invalidErrorResponse.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_CENTER_QUERY_INVALID',
      message: '筛选条件不正确。',
      details: { field: 'error' }
    }
  });

  const urlQueryResponse = await harness.routes.get('GET /notification-status')(
    harness.contextFor({ url: '/notification-status?error=true' })
  );
  assert.equal(urlQueryResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, error: true });

  const nativeRequestResponse = await harness.routes.get('GET /notification-status')(
    harness.contextFor({ url: '/notification-status?error=true', nativeRequest: true })
  );
  assert.equal(nativeRequestResponse.status, 200);
  assert.deepEqual(calls.at(-1), { limit: 101, error: true });
});

test('notification center fixed tool and system routes never return unrelated records', async () => {
  const harness = createRouteHarness();
  const mixedRecords = [
    { ...records[0], type: 'assistant_message', source: 'hana.session' },
    { ...records[1], type: 'tool_error', source: 'hana.tool' },
    { ...records[1], notificationId: 'notification-system', type: 'system_notification', source: 'hana.system' }
  ];
  const calls = [];
  const api = {
    listNotifications(options) {
      calls.push(options);
      return mixedRecords;
    }
  };
  registerNotificationCenterRoute(harness.app, { _notificationHubVNextNotificationApi: api });

  const toolResponse = await harness.routes.get('GET /notification-tools')(harness.contextFor());
  assert.equal(toolResponse.status, 200);
  assert.deepEqual(toolResponse.value.notifications.map((record) => record.source), ['hana.tool']);
  assert.equal(toolResponse.value.totalCount, 1);
  assert.deepEqual(calls.at(-1), { limit: 101, tool: true });

  const systemResponse = await harness.routes.get('GET /notification-system')(harness.contextFor());
  assert.equal(systemResponse.status, 200);
  assert.deepEqual(systemResponse.value.notifications.map((record) => record.source), ['hana.system']);
  assert.equal(systemResponse.value.totalCount, 1);
  assert.deepEqual(calls.at(-1), { limit: 101, system: true });
});

test('notification center marks one notification as read', async () => {
  const harness = createRouteHarness();
  const calls = [];
  const api = {
    setNotificationStatus(notificationId, status) {
      calls.push([notificationId, status]);
      return { ...records[0], notificationId, status };
    }
  };
  registerNotificationCenterRoute(harness.app, { _notificationHubVNextNotificationApi: api });

  const response = await harness.routes.get('POST /notification-status/:notificationId/read')(
    harness.contextFor({ params: { notificationId: 'notification-latest' } })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.value, {
    ok: true,
    notification: { ...records[0], notificationId: 'notification-latest', status: 'read' }
  });
  assert.deepEqual(calls, [['notification-latest', 'read']]);
});

test('notification center batch-marks selected notifications as read', async () => {
  const harness = createRouteHarness();
  const calls = [];
  const api = {
    setNotificationsStatus(notificationIds, status) {
      calls.push([notificationIds, status]);
      return { updated: notificationIds.map((notificationId) => ({ ...records[0], notificationId, status })), missing: [] };
    }
  };
  registerNotificationCenterRoute(harness.app, { _notificationHubVNextNotificationApi: api });

  const response = await harness.routes.get('POST /notification-status/batch')(
    harness.contextFor({ body: { notificationIds: ['notification-latest', 'notification-earlier'], status: 'read' } })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.value.updated.map((record) => record.notificationId), [
    'notification-latest', 'notification-earlier'
  ]);
  assert.deepEqual(calls, [[['notification-latest', 'notification-earlier'], 'read']]);
});

test('notification center rejects invalid batch status without calling the API', async () => {
  const harness = createRouteHarness();
  let called = false;
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextNotificationApi: {
      setNotificationsStatus() { called = true; }
    }
  });

  const response = await harness.routes.get('POST /notification-status/batch')(
    harness.contextFor({ body: { notificationIds: ['notification-latest'], status: 'shown' } })
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.equal(response.value.error.code, 'NOTIFICATION_CENTER_BATCH_INVALID');
});

test('notification center returns a structured not-found response for a batch with a missing id', async () => {
  const harness = createRouteHarness();
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextNotificationApi: {
      setNotificationsStatus() {
        throw Object.assign(new Error('missing'), {
          code: 'NOTIFICATION_STORE_NOT_FOUND',
          details: { field: 'notificationId', notificationIds: ['notification-missing'] }
        });
      }
    }
  });

  const response = await harness.routes.get('POST /notification-status/batch')(
    harness.contextFor({ body: { notificationIds: ['notification-missing'], status: 'read' } })
  );

  assert.equal(response.status, 404);
  assert.equal(response.value.error.code, 'NOTIFICATION_STORE_NOT_FOUND');
  assert.deepEqual(response.value.error.details.notificationIds, ['notification-missing']);
});

test('notification center removes one notification through the settings API', async () => {
  const harness = createRouteHarness();
  const calls = [];
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextNotificationApi: {},
    _notificationHubVNextSettingsApi: {
      removeNotification: async (notificationId) => { calls.push(notificationId); return true; },
      getNotificationDisplaySettings: () => ({ limit: 100, cardLifetimeSeconds: 120 })
    }
  });
  const response = await harness.routes.get('POST /notification-remove/:notificationId')(harness.contextFor({ params: { notificationId: 'notification-latest' } }));
  assert.equal(response.status, 200);
  assert.deepEqual(response.value, { ok: true, notificationId: 'notification-latest', removed: true });
  assert.deepEqual(calls, ['notification-latest']);
});

test('notification center removes selected notifications in a batch', async () => {
  const harness = createRouteHarness();
  let received;
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextNotificationApi: {},
    _notificationHubVNextSettingsApi: {
      removeNotifications: async (ids) => { received = ids; return { removed: ids, missing: [] }; },
      getNotificationDisplaySettings: () => ({ limit: 100, cardLifetimeSeconds: 120 })
    }
  });
  const response = await harness.routes.get('POST /notification-remove/batch')(harness.contextFor({ body: { notificationIds: ['notification-latest', 'notification-earlier', 'notification-latest'] } }));
  assert.equal(response.status, 200);
  assert.deepEqual(received, ['notification-latest', 'notification-earlier']);
  assert.deepEqual(response.value.removed, received);
});

test('notification center returns one notification detail by id', async () => {
  const harness = createRouteHarness();
  const notification = { ...records[0], content: '完整通知正文', metadata: { context: 'session-a' } };
  const calls = [];
  const api = {
    getNotification(notificationId) {
      calls.push(notificationId);
      return notificationId === notification.notificationId ? notification : null;
    }
  };
  registerNotificationCenterRoute(harness.app, { _notificationHubVNextNotificationApi: api });

  const response = await harness.routes.get('GET /notification-detail/:notificationId')(
    harness.contextFor({ params: { notificationId: notification.notificationId } })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.value, { ok: true, notification });
  assert.deepEqual(calls, [notification.notificationId]);
});

test('notification center returns a structured not-found response for missing detail', async () => {
  const harness = createRouteHarness();
  const api = { getNotification: () => null };
  registerNotificationCenterRoute(harness.app, { _notificationHubVNextNotificationApi: api });

  const response = await harness.routes.get('GET /notification-detail/:notificationId')(
    harness.contextFor({ params: { notificationId: 'notification-missing' } })
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_STORE_NOT_FOUND',
      message: '通知不存在。',
      details: { field: 'notificationId' }
    }
  });
});

test('notification center returns empty state without mutating the API result', async () => {
  const harness = createRouteHarness();
  const api = { listNotifications: () => [] };
  registerNotificationCenterRoute(harness.app, { _notificationHubVNextNotificationApi: api });

  const response = await harness.routes.get('GET /notification-status')(harness.contextFor());
  assert.deepEqual(response.value, {
    ok: true,
    notifications: [],
    totalCount: 0,
    displayedCount: 0,
    displayLimit: 100,
    cardLifetimeSeconds: 120,
    hasMore: false
  });
});

test('notification center reports hasMore only when the probe exceeds the configured limit', async () => {
  for (const [count, expectedDisplayed, expectedHasMore] of [[0, 0, false], [2, 2, false], [3, 3, false], [4, 3, true]]) {
    const harness = createRouteHarness();
    const api = { listNotifications: () => Array.from({ length: count }, (_, index) => ({ ...records[0], notificationId: `boundary-${count}-${index}` })) };
    registerNotificationCenterRoute(harness.app, {
      _notificationHubVNextNotificationApi: api,
      _notificationHubVNextSettingsApi: { getNotificationDisplaySettings: () => ({ limit: 3 }) }
    });
    const response = await harness.routes.get('GET /notification-status')(harness.contextFor());
    assert.equal(response.status, 200);
    assert.equal(response.value.notifications.length, expectedDisplayed);
    assert.equal(response.value.totalCount, expectedDisplayed);
    assert.equal(response.value.displayedCount, expectedDisplayed);
    assert.equal(response.value.displayLimit, 3);
    assert.equal(response.value.hasMore, expectedHasMore);
  }
});

test('notification center returns a structured error when the API is unavailable', async () => {
  const harness = createRouteHarness();
  registerNotificationCenterRoute(harness.app, {});

  const response = await harness.routes.get('GET /notification-status')(harness.contextFor());
  assert.equal(response.status, 503);
  assert.deepEqual(response.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_CENTER_API_UNAVAILABLE',
      message: 'Notification API unavailable',
      details: {}
    }
  });
});

test('notification center converts list failures into structured diagnostics', async () => {
  const harness = createRouteHarness();
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextNotificationApi: {
      listNotifications() {
        throw Object.assign(new Error('store unavailable'), {
          code: 'NOTIFICATION_STORE_LOAD_FAILED',
          details: { stage: 'list' }
        });
      }
    }
  });

  const response = await harness.routes.get('GET /notification-status')(harness.contextFor());
  assert.equal(response.status, 500);
  assert.deepEqual(response.value, {
    ok: false,
    error: {
      code: 'NOTIFICATION_STORE_LOAD_FAILED',
      message: '通知列表读取失败。',
      details: { stage: 'list' }
    }
  });
});

test('notification center requests the complete list and compresses only each card summary', async () => {
  const harness = createRouteHarness();
  const calls = [];
  const manyRecords = Array.from({ length: 101 }, (_, index) => ({
    ...records[0],
    notificationId: `notification-${index}`,
    title: `通知标题 ${index}`,
    content: `完整正文 ${index}`,
    summary: `短摘要 ${index}`
  }));
  const api = {
    listNotifications(options) {
      calls.push(options);
      return manyRecords;
    }
  };
  registerNotificationCenterRoute(harness.app, { _notificationHubVNextNotificationApi: api });

  const response = await harness.routes.get('GET /notification-status')(harness.contextFor());
  assert.equal(response.status, 200);
  assert.equal(response.value.notifications.length, 100);
  assert.equal(response.value.totalCount, 100);
  assert.equal(response.value.hasMore, true);
  assert.deepEqual(calls, [{ limit: 101 }]);

  const html = renderNotificationCenterPage();
  assert.match(html, /\.notification-card h2[^}]*-webkit-line-clamp:\s*1/);
  assert.match(html, /\.notification-content[^}]*-webkit-line-clamp:\s*2/);
  assert.match(html, /查看详情/);
  assert.match(html, /record\.content \|\| record\.summary/);
});

test('notification center renders detail inside the selected notification card', () => {
  const html = renderNotificationCenterPage();
  assert.match(html, /data-notification-id=\"' \+ esc\(record\.notificationId\)/);
  assert.match(html, /function findCard\(notificationId\)/);
  assert.match(html, /card\.insertAdjacentHTML\(\"beforeend\", detailMarkup\(data\.notification, notificationId\)\)/);
  assert.doesNotMatch(html, /<section id=\"detail-panel\"/);
});

test('notification center applies configured and explicit display limits without changing stored history', async () => {
  const harness = createRouteHarness();
  const calls = [];
  const api = {
    listNotifications(options) {
      calls.push(options);
      return Array.from({ length: 4 }, (_, index) => ({ ...records[0], notificationId: `limited-${index}` }));
    }
  };
  const settingsApi = {
    getNotificationDisplaySettings() { return { settings: { mode: 'preset', limit: 30 }, limit: 30 }; }
  };
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextNotificationApi: api,
    _notificationHubVNextSettingsApi: settingsApi
  });

  const configured = await harness.routes.get('GET /notification-status')(harness.contextFor());
  assert.equal(configured.value.displayLimit, 30);
  assert.deepEqual(calls.at(-1), { limit: 31 });

  const custom = await harness.routes.get('GET /notification-status')(harness.contextFor({ url: '/notification-status?limit=500' }));
  assert.equal(custom.value.displayLimit, 500);
  assert.deepEqual(calls.at(-1), { limit: 501 });

  const unlimited = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { limit: 'unlimited' } }));
  assert.equal(unlimited.value.displayLimit, null);
  assert.deepEqual(calls.at(-1), {});

  const invalid = await harness.routes.get('GET /notification-status')(harness.contextFor({ query: { limit: '10001' } }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.value.error.code, 'NOTIFICATION_DISPLAY_LIMIT_INVALID');
});

test('notification center routes use the explicit service key for list, mutations, and display settings', async () => {
  const harness = createRouteHarness();
  const calls = [];
  const service = {
    listNotifications(options) { calls.push(['list', options]); return records; },
    getNotification(notificationId) { calls.push(['get', notificationId]); return records.find((record) => record.notificationId === notificationId); },
    setNotificationStatus(notificationId, status) { calls.push(['read', notificationId, status]); return { ...records[0], notificationId, status }; },
    setNotificationsStatus(notificationIds, status) { calls.push(['batch-read', notificationIds, status]); return { updated: notificationIds.map((notificationId) => ({ notificationId, status })), missing: [] }; },
    removeNotification(notificationId) { calls.push(['remove', notificationId]); return true; },
    removeNotifications(notificationIds) { calls.push(['batch-remove', notificationIds]); return { removed: notificationIds, missing: [] }; },
    getNotificationDisplaySettings() { calls.push(['display-read']); return { limit: 30, cardLifetimeSeconds: 120 }; },
    async updateNotificationDisplaySettings(patch) { calls.push(['display-write', patch]); return { limit: patch.limit, cardLifetimeSeconds: patch.cardLifetimeSeconds }; }
  };
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextNotificationCenterServices: service,
    _notificationHubVNextPlugin: {
      listNotifications() { throw new Error('plugin must not be called'); },
      getNotification() { throw new Error('plugin must not be called'); }
    }
  });

  const list = await harness.routes.get('GET /notification-status')(harness.contextFor());
  const detail = await harness.routes.get('GET /notification-detail/:notificationId')(harness.contextFor({ params: { notificationId: 'notification-latest' } }));
  const read = await harness.routes.get('POST /notification-status/:notificationId/read')(harness.contextFor({ params: { notificationId: 'notification-latest' } }));
  const batchRead = await harness.routes.get('POST /notification-status/batch')(harness.contextFor({ body: { notificationIds: ['notification-latest'], status: 'read' } }));
  const remove = await harness.routes.get('POST /notification-remove/:notificationId')(harness.contextFor({ params: { notificationId: 'notification-latest' } }));
  const batchRemove = await harness.routes.get('POST /notification-remove/batch')(harness.contextFor({ body: { notificationIds: ['notification-latest'] } }));
  const settings = await harness.routes.get('GET /notification-center-display-settings')(harness.contextFor());
  const saved = await harness.routes.get('POST /notification-center-display-settings')(harness.contextFor({ body: { limit: 50, cardLifetimeSeconds: 0 } }));

  assert.equal(list.status, 200);
  assert.equal(detail.status, 200);
  assert.equal(read.status, 200);
  assert.equal(batchRead.status, 200);
  assert.equal(remove.status, 200);
  assert.equal(batchRemove.status, 200);
  assert.equal(settings.status, 200);
  assert.equal(saved.status, 200);
  assert.deepEqual(calls.map(([name]) => name), ['display-read', 'list', 'get', 'read', 'batch-read', 'remove', 'batch-remove', 'display-read', 'display-write']);
});

test('notification center does not use the legacy plugin fallback when the explicit service is unavailable', async () => {
  const harness = createRouteHarness();
  let pluginCalled = false;
  registerNotificationCenterRoute(harness.app, {
    _notificationHubVNextPlugin: {
      listNotifications() { pluginCalled = true; return records; },
      getNotification() { pluginCalled = true; return records[0]; },
      getNotificationDisplaySettings() { pluginCalled = true; return { limit: 30 }; }
    }
  });

  const list = await harness.routes.get('GET /notification-status')(harness.contextFor());
  const settings = await harness.routes.get('GET /notification-center-display-settings')(harness.contextFor());
  assert.equal(list.status, 503);
  assert.equal(settings.status, 503);
  assert.equal(list.value.error.code, 'NOTIFICATION_CENTER_API_UNAVAILABLE');
  assert.equal(settings.value.error.code, 'NOTIFICATION_CENTER_SETTINGS_UNAVAILABLE');
  assert.equal(pluginCalled, false);
});

test('notification center page clears its refresh timer before an internal view switch', () => {
  const html = renderNotificationCenterPage();
  assert.match(html, /notification-hub-view-before-unload/);
});

test('notification center page is a self-contained Hana iframe shell', () => {
  const html = renderNotificationCenterPage();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /window\.parent\.postMessage\(\{ type: "ready" \}, "\*"\)/);
  assert.doesNotMatch(html, /await fetch\(/);
});
