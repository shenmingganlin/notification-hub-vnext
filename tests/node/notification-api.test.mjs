import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationApi } from '../../plugin/api/notification-api.js';

function persistenceStub() {
  const calls = [];
  return {
    calls,
    observe() {
      calls.push('observe');
      return 'unsubscribe';
    },
    restore: async () => {
      calls.push('restore');
      return { restored: true };
    },
    flush: async () => {
      calls.push('flush');
      return 'notifications.json';
    }
  };
}

test('NotificationApi creates and retrieves a notification', () => {
  const api = new NotificationApi();
  const created = api.createNotification({
    type: 'message',
    source: 'test',
    title: '测试通知',
    content: '正文'
  });

  assert.equal(api.getNotification(created.notificationId), created);
  assert.equal(api.store.size, 1);
});

test('NotificationApi filters API-produced cards structurally', () => {
  const api = new NotificationApi();
  api.createNotification({ notificationId: 'notification-api-card', traceId: 'trace-api-card', type: 'job_completed', source: 'plugin.api', producer: { kind: 'api', id: 'download-plugin' }, title: 'API 卡片', content: '完成' });
  api.createNotification({ notificationId: 'notification-text-api', traceId: 'trace-text-api', type: 'message', source: 'hana.session', title: '正文提到 API', content: 'API 只是正文词语' });

  assert.deepEqual(api.listNotifications({ producerKind: 'api' }).map((record) => record.notificationId), ['notification-api-card']);
});

test('NotificationApi delegates list, update, status, remove, and clear operations', () => {
  const api = new NotificationApi();
  const first = api.createNotification({ notificationId: 'notification-first', traceId: 'trace-first', type: 'message', source: 'test', title: '第一条', content: '一' });
  const second = api.createNotification({ notificationId: 'notification-second', traceId: 'trace-second', type: 'message', source: 'test', title: '第二条', content: '二' });

  api.setNotificationStatus(second.notificationId, 'shown');
  assert.deepEqual(api.listNotifications({ status: 'shown' }).map((record) => record.notificationId), [second.notificationId]);
  const updated = api.updateNotification(first.notificationId, { title: '已更新' });
  assert.equal(updated.title, '已更新');
  assert.throws(() => { updated.title = '越权修改'; }, TypeError);
  assert.equal(api.removeNotification(first.notificationId), true);
  assert.equal(api.clearNotifications(), 1);
  assert.equal(api.store.size, 0);
});

test('NotificationApi batch-marks selected notifications as read', () => {
  const api = new NotificationApi();
  const first = api.createNotification({ notificationId: 'notification-batch-first', traceId: 'trace-batch-first', type: 'message', source: 'test', title: '第一条', content: '一' });
  const second = api.createNotification({ notificationId: 'notification-batch-second', traceId: 'trace-batch-second', type: 'message', source: 'test', title: '第二条', content: '二' });

  const result = api.setNotificationsStatus([first.notificationId, second.notificationId], 'read');

  assert.deepEqual(result.updated.map((record) => record.status), ['read', 'read']);
  assert.deepEqual(api.listNotifications({ status: 'read' }).map((record) => record.notificationId).sort(), [
    first.notificationId,
    second.notificationId
  ]);
});

test('NotificationApi hides legacy internal reflection blocks without mutating Store records', () => {
  const api = new NotificationApi();
  const legacy = api.createNotification({
    notificationId: 'notification-legacy-reflect',
    traceId: 'trace-legacy-reflect',
    type: 'assistant_message',
    source: 'hana.session',
    title: '助手回复完成',
    content: '<reflect>历史内部思考</reflect>用户可见正文。',
    summary: '<thinking>历史摘要思考</thinking>用户可见摘要。'
  });

  const listed = api.listNotifications();
  assert.equal(listed[0].content, '用户可见正文。');
  assert.equal(listed[0].summary, '用户可见摘要。');
  assert.equal(api.getNotification(legacy.notificationId).content, '用户可见正文。');
  assert.equal(api.store.get(legacy.notificationId).content, '<reflect>历史内部思考</reflect>用户可见正文。');
});

test('NotificationApi omits legacy records containing only internal reflection', () => {
  const api = new NotificationApi();
  api.createNotification({
    notificationId: 'notification-only-legacy-reflect',
    traceId: 'trace-only-legacy-reflect',
    type: 'assistant_message',
    source: 'hana.session',
    title: '助手回复完成',
    content: '<thinking>只有历史内部思考</thinking>'
  });

  assert.deepEqual(api.listNotifications(), []);
  assert.equal(api.getNotification('notification-only-legacy-reflect'), null);
  assert.equal(api.store.size, 1);
});

test('NotificationApi preserves validation and missing-record errors', () => {
  const api = new NotificationApi();

  assert.throws(
    () => api.createNotification({ type: 'message', source: 'test', title: '', content: '正文' }),
    (error) => error.code === 'NOTIFICATION_RECORD_FIELD_INVALID' && error.details.field === 'title'
  );
  assert.throws(
    () => api.updateNotification('missing', { title: '不存在' }),
    (error) => error.code === 'NOTIFICATION_STORE_NOT_FOUND' && error.details.field === 'notificationId'
  );
  assert.equal(api.getNotification('missing'), null);
});

test('NotificationApi delegates restore and flush to optional persistence', async () => {
  const persistence = persistenceStub();
  const api = new NotificationApi({ persistence });

  assert.deepEqual(await api.restoreNotifications(), { restored: true });
  assert.equal(await api.flushNotifications(), 'notifications.json');
  assert.deepEqual(persistence.calls, ['restore', 'flush']);
});

test('NotificationApi leaves memory behavior unchanged without persistence', async () => {
  const api = new NotificationApi();

  assert.equal(await api.restoreNotifications(), null);
  assert.equal(await api.flushNotifications(), null);
});

test('NotificationApi validates optional persistence boundary and does not auto-observe', () => {
  assert.throws(
    () => new NotificationApi({ persistence: {} }),
    (error) => error.code === 'NOTIFICATION_API_PERSISTENCE_INVALID'
  );

  const persistence = persistenceStub();
  new NotificationApi({ persistence });
  assert.deepEqual(persistence.calls, []);
});

test('NotificationApi lists aggregation views from a Store snapshot without mutating the Store', () => {
  const api = new NotificationApi();
  const first = api.createNotification({
    notificationId: 'notification-api-first',
    traceId: 'trace-api-first',
    type: 'message_end',
    source: 'model',
    title: '第一条',
    content: '第一条正文',
    summary: '第一条摘要',
    session: { id: 'api-session' },
    createdAt: '2026-08-04T10:00:00.000Z',
    updatedAt: '2026-08-04T10:00:00.000Z'
  });
  const second = api.createNotification({
    notificationId: 'notification-api-second',
    traceId: 'trace-api-second',
    type: 'message_end',
    source: 'model',
    title: '第二条',
    content: '第二条正文',
    summary: '第二条摘要',
    session: { id: 'api-session' },
    createdAt: '2026-08-04T10:01:00.000Z',
    updatedAt: '2026-08-04T10:01:00.000Z'
  });
  const before = api.store.getSnapshotRecords();
  const result = api.listNotificationAggregations();

  assert.equal(result.aggregations.length, 1);
  assert.equal(result.aggregations[0].memberCount, 2);
  assert.deepEqual(
    result.aggregations[0].members.map((member) => member.notificationId),
    [first.notificationId, second.notificationId]
  );
  assert.deepEqual(api.store.getSnapshotRecords(), before);
});

test('NotificationApi rejects a Store without a snapshot source', () => {
  const calls = [];
  const store = {
    add: (input) => { calls.push(['add', input]); return input; },
    get: () => null,
    update: () => { calls.push('update'); },
    remove: () => { calls.push('remove'); },
    setStatus: () => { calls.push('setStatus'); }
  };
  const api = new NotificationApi({ store });

  assert.throws(
    () => api.listNotificationAggregations(),
    (error) => error.code === 'NOTIFICATION_API_AGGREGATION_SOURCE_INVALID'
  );
  assert.deepEqual(calls, []);
});

test('NotificationApi aggregation query never calls Store mutation methods', () => {
  const record = {
    notificationId: 'notification-read-only',
    traceId: 'trace-read-only',
    type: 'message_end',
    source: 'model',
    title: '只读通知',
    content: '只读正文',
    summary: '只读摘要',
    importance: 'normal',
    createdAt: '2026-08-04T10:00:00.000Z',
    updatedAt: '2026-08-04T10:00:00.000Z',
    session: { id: 'read-only-session' },
    metadata: {},
    contentPolicy: {},
    runtimeHints: {},
    status: 'received'
  };
  const store = {
    add: () => { throw new Error('add must not be called'); },
    get: () => record,
    getSnapshotRecords: () => Object.freeze([record]),
    update: () => { throw new Error('update must not be called'); },
    remove: () => { throw new Error('remove must not be called'); },
    setStatus: () => { throw new Error('setStatus must not be called'); },
    clear: () => { throw new Error('clear must not be called'); }
  };
  const api = new NotificationApi({ store });

  const result = api.listNotificationAggregations();
  assert.equal(result.sourceCount, 1);
  assert.equal(result.aggregations[0].memberCount, 1);
});

test('NotificationApi forwards filter, sort, and pagination options to aggregation query', () => {
  const records = ['a', 'b'].map((id, index) => ({
    notificationId: `notification-api-page-${id}`,
    traceId: `trace-api-page-${id}`,
    type: 'message_end',
    source: 'model',
    title: `API Page ${id}`,
    content: `正文 ${id}`,
    summary: `摘要 ${id}`,
    importance: index === 1 ? 'critical' : 'normal',
    createdAt: `2026-08-04T10:0${index}:00.000Z`,
    updatedAt: `2026-08-04T10:0${index}:00.000Z`,
    session: { id: `api-page-${id}` },
    metadata: {},
    contentPolicy: {},
    runtimeHints: {},
    status: 'received'
  }));
  const store = {
    add: () => { throw new Error('add must not be called'); },
    get: () => null,
    getSnapshotRecords: () => Object.freeze(records),
    update: () => { throw new Error('update must not be called'); },
    remove: () => { throw new Error('remove must not be called'); },
    setStatus: () => { throw new Error('setStatus must not be called'); }
  };
  const api = new NotificationApi({ store });

  const result = api.listNotificationAggregations({
    filter: { importance: 'critical', text: 'api page b' },
    sort: { field: 'importance', direction: 'desc' },
    offset: 0,
    limit: 1
  });

  assert.equal(result.totalCount, 1);
  assert.equal(result.returnedCount, 1);
  assert.equal(result.sort.field, 'importance');
  assert.equal(result.aggregations[0].importance, 'critical');
});
