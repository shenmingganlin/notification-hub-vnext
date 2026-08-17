import assert from 'node:assert/strict';
import test from 'node:test';

import { createNotificationWidgetViewModel } from '../../plugin/domain/notification-widget-view-model.js';

test('Widget view model exposes newest notification and unread summary', () => {
  const records = [
    {
      notificationId: 'old',
      title: '旧通知',
      content: '旧正文',
      type: 'tool_error',
      source: 'hana.tool',
      importance: 'normal',
      status: 'formatted',
      createdAt: '2026-08-11T08:00:00.000Z'
    },
    {
      notificationId: 'new',
      title: '新通知',
      content: '新正文内容',
      type: 'system_notification',
      source: 'hana.system',
      importance: 'high',
      status: 'read',
      createdAt: '2026-08-11T09:00:00.000Z'
    }
  ];

  const view = createNotificationWidgetViewModel(records, { limit: 1, summaryLength: 3 });

  assert.deepEqual(view.recent.map((item) => item.notificationId), ['new']);
  assert.equal(view.unreadCount, 1);
  assert.equal(view.totalCount, 2);
  assert.equal(view.summary, '新正…');
  assert.equal(view.recent[0].summary, '新正…');
  assert.equal(view.recent[0].type, 'system_notification');
  assert.equal(view.recent[0].source, 'hana.system');
});

test('Widget view model uses stable fallbacks and preserves source records', () => {
  const records = [
    {
      notificationId: 'missing-fields',
      status: 'shown',
      createdAt: 'not-a-date'
    }
  ];
  const before = structuredClone(records);

  const view = createNotificationWidgetViewModel(records);

  assert.equal(view.summary, '暂无内容');
  assert.equal(view.unreadCount, 1);
  assert.deepEqual(view.recent[0], {
    notificationId: 'missing-fields',
    title: '无标题通知',
    summary: '暂无内容',
    type: 'unknown',
    source: 'unknown',
    importance: 'normal',
    status: 'shown',
    createdAt: 'not-a-date',
    unread: true
  });
  assert.deepEqual(records, before);
});

test('Widget view model returns an empty state without notifications', () => {
  assert.deepEqual(createNotificationWidgetViewModel([]), {
    recent: [],
    unreadCount: 0,
    totalCount: 0,
    summary: '暂无通知'
  });
});
