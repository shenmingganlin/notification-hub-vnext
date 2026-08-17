import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationStore } from '../../plugin/domain/notification-store.js';

test('NotificationStore adds and lists records newest first', () => {
  const store = new NotificationStore();
  const older = store.add({
    notificationId: 'notification-old',
    traceId: 'trace-old',
    type: 'message',
    source: 'test',
    title: '旧通知',
    content: '旧内容',
    createdAt: '2026-01-01T00:00:00.000Z'
  });
  const newer = store.add({
    notificationId: 'notification-new',
    traceId: 'trace-new',
    type: 'message',
    source: 'test',
    title: '新通知',
    content: '新内容',
    createdAt: '2026-01-02T00:00:00.000Z'
  });

  assert.equal(store.size, 2);
  assert.equal(store.get(older.notificationId).title, '旧通知');
  assert.deepEqual(store.list().map((record) => record.notificationId), [newer.notificationId, older.notificationId]);
});

test('NotificationStore rejects duplicate ids and supports status filtering and limits', () => {
  const store = new NotificationStore();
  store.add({ notificationId: 'notification-a', traceId: 'trace-a', type: 'message', source: 'test', title: 'A', content: 'A' });
  store.add({ notificationId: 'notification-b', traceId: 'trace-b', type: 'message', source: 'test', title: 'B', content: 'B' });
  store.setStatus('notification-b', 'read');

  assert.throws(
    () => store.add({ notificationId: 'notification-a', traceId: 'trace-other', type: 'message', source: 'test', title: '重复', content: '重复' }),
    (error) => error.code === 'NOTIFICATION_STORE_DUPLICATE_ID' && error.details.field === 'notificationId'
  );
  assert.deepEqual(store.list({ status: 'read' }).map((record) => record.notificationId), ['notification-b']);
  assert.deepEqual(store.list({ unread: true }).map((record) => record.notificationId), ['notification-a']);
  store.add({ notificationId: 'notification-c', traceId: 'trace-c', type: 'message', source: 'test', title: 'C', content: 'C', importance: 'high' });
  assert.deepEqual(store.list({ important: true }).map((record) => record.notificationId), ['notification-c']);
  assert.deepEqual(
    store.list({ important: false }).map((record) => record.notificationId).sort(),
    ['notification-a', 'notification-b']
  );
  assert.throws(() => store.list({ important: 'yes' }), (error) => error.code === 'NOTIFICATION_STORE_IMPORTANT_INVALID');
  store.add({
    notificationId: 'notification-error',
    traceId: 'trace-error',
    type: 'provider_error',
    source: 'test',
    title: '失败',
    content: '失败内容',
    status: 'failed',
    createdAt: '2026-01-03T00:00:00.000Z'
  });
  store.add({
    notificationId: 'notification-diagnostic-error',
    traceId: 'trace-diagnostic-error',
    type: 'diagnostic',
    source: 'test',
    title: '超时',
    content: '超时内容',
    metadata: { eventClassification: { classification: 'timeout' } },
    createdAt: '2026-01-04T00:00:00.000Z'
  });
  assert.deepEqual(store.list({ error: true }).map((record) => record.notificationId), [
    'notification-diagnostic-error',
    'notification-error'
  ]);
  assert.deepEqual(
    store.list({ error: false }).map((record) => record.notificationId).sort(),
    ['notification-a', 'notification-b', 'notification-c']
  );
  assert.throws(() => store.list({ error: 'yes' }), (error) => error.code === 'NOTIFICATION_STORE_ERROR_INVALID');
  store.add({
    notificationId: 'notification-conversation',
    traceId: 'trace-conversation',
    type: 'assistant_message',
    source: 'hana.session',
    title: '对话回复',
    content: '对话内容',
    createdAt: '2026-01-05T00:00:00.000Z'
  });
  store.add({
    notificationId: 'notification-tool',
    traceId: 'trace-tool',
    type: 'tool_result',
    source: 'hana.session',
    title: '工具结果',
    content: '工具内容',
    createdAt: '2026-01-06T00:00:00.000Z'
  });
  assert.deepEqual(store.list({ conversation: true }).map((record) => record.notificationId), [
    'notification-conversation'
  ]);
  assert.deepEqual(
    store.list({ conversation: false }).map((record) => record.notificationId).sort(),
    ['notification-a', 'notification-b', 'notification-c', 'notification-diagnostic-error', 'notification-error', 'notification-tool']
  );
  assert.throws(() => store.list({ conversation: 'yes' }), (error) => error.code === 'NOTIFICATION_STORE_CONVERSATION_INVALID');
  assert.deepEqual(store.list({ source: 'test' }).map((record) => record.notificationId).sort(), [
    'notification-a', 'notification-b', 'notification-c', 'notification-diagnostic-error', 'notification-error'
  ]);
  assert.deepEqual(store.list({ source: 'hana.session' }).map((record) => record.notificationId), [
    'notification-tool', 'notification-conversation'
  ]);
  store.add({
    notificationId: 'notification-tool-error',
    traceId: 'trace-tool-error',
    type: 'tool_error',
    source: 'hana.tool',
    title: '工具失败',
    content: '工具失败内容',
    createdAt: '2026-01-07T00:00:00.000Z'
  });
  store.add({
    notificationId: 'notification-system',
    traceId: 'trace-system',
    type: 'system_notification',
    source: 'hana.system',
    title: '系统警告',
    content: '系统警告内容',
    createdAt: '2026-01-08T00:00:00.000Z'
  });
  assert.deepEqual(store.list({ system: true }).map((record) => record.notificationId), [
    'notification-system'
  ]);
  assert.deepEqual(store.list({ system: false }).map((record) => record.notificationId).sort(), [
    'notification-a', 'notification-b', 'notification-c', 'notification-conversation', 'notification-diagnostic-error', 'notification-error', 'notification-tool', 'notification-tool-error'
  ]);
  assert.throws(() => store.list({ system: 'yes' }), (error) => error.code === 'NOTIFICATION_STORE_SYSTEM_INVALID');
  assert.deepEqual(store.list({ tool: true }).map((record) => record.notificationId), [
    'notification-tool-error', 'notification-tool'
  ]);
  assert.deepEqual(
    store.list({ tool: false }).map((record) => record.notificationId).sort(),
    ['notification-a', 'notification-b', 'notification-c', 'notification-conversation', 'notification-diagnostic-error', 'notification-error', 'notification-system']
  );
  assert.throws(() => store.list({ tool: 'yes' }), (error) => error.code === 'NOTIFICATION_STORE_TOOL_INVALID');
  assert.throws(() => store.list({ source: '' }), (error) => error.code === 'NOTIFICATION_STORE_SOURCE_INVALID');
  assert.throws(() => store.list({ source: 42 }), (error) => error.code === 'NOTIFICATION_STORE_SOURCE_INVALID');
  store.add({
    notificationId: 'notification-chat-channel',
    traceId: 'trace-chat-channel',
    type: 'assistant_message',
    source: 'hana.session',
    channel: { kind: 'chat', id: 'desktop' },
    title: '聊天通知',
    content: '聊天内容',
    createdAt: '2026-01-09T00:00:00.000Z'
  });
  store.add({
    notificationId: 'notification-telegram-channel',
    traceId: 'trace-telegram-channel',
    type: 'message',
    source: 'hana.bridge',
    channel: { kind: 'telegram', id: 'chat-1' },
    title: 'Telegram 通知',
    content: 'Telegram 内容',
    createdAt: '2026-01-10T00:00:00.000Z'
  });
  assert.deepEqual(store.list({ channelKind: 'chat' }).map((record) => record.notificationId), [
    'notification-chat-channel'
  ]);
  assert.deepEqual(store.list({ channelKind: 'telegram' }).map((record) => record.notificationId), [
    'notification-telegram-channel'
  ]);
  assert.deepEqual(store.list({ channel: true }).map((record) => record.notificationId), [
    'notification-telegram-channel'
  ]);
  assert.deepEqual(store.list({ channel: false }).map((record) => record.notificationId).includes('notification-chat-channel'), true);
  assert.equal(store.list({ channel: false }).includes(store.get('notification-telegram-channel')), false);
  assert.throws(() => store.list({ channel: 'yes' }), (error) => error.code === 'NOTIFICATION_STORE_CHANNEL_INVALID');
  assert.throws(() => store.list({ channelKind: '' }), (error) => error.code === 'NOTIFICATION_STORE_CHANNEL_KIND_INVALID');
  assert.throws(() => store.list({ channelKind: 42 }), (error) => error.code === 'NOTIFICATION_STORE_CHANNEL_KIND_INVALID');
  store.add({
    notificationId: 'notification-api-producer',
    traceId: 'trace-api-producer',
    type: 'job_completed',
    source: 'plugin.api',
    producer: { kind: 'api', id: 'download-plugin' },
    title: 'API 任务完成',
    content: '完成',
    createdAt: '2026-01-11T00:00:00.000Z'
  });
  assert.deepEqual(store.list({ producerKind: 'api' }).map((record) => record.notificationId), [
    'notification-api-producer'
  ]);
  assert.throws(() => store.list({ producerKind: '' }), (error) => error.code === 'NOTIFICATION_STORE_PRODUCER_KIND_INVALID');
  assert.equal(store.list({ limit: 1 }).length, 1);
  assert.throws(() => store.list({ status: 'unknown' }), (error) => error.code === 'NOTIFICATION_STORE_STATUS_INVALID');
  assert.throws(() => store.list({ limit: -1 }), (error) => error.code === 'NOTIFICATION_STORE_LIMIT_INVALID');
});

test('NotificationStore updates, removes, clears, and protects stored records', () => {
  const store = new NotificationStore();
  const record = store.add({ notificationId: 'notification-a', traceId: 'trace-a', type: 'message', source: 'test', title: 'A', content: 'A', metadata: { keep: true } });
  const updated = store.update(record.notificationId, { title: '更新后', metadata: { keep: false } });

  assert.equal(updated.title, '更新后');
  assert.equal(store.get(record.notificationId).title, '更新后');
  assert.throws(() => { updated.metadata.keep = true; }, TypeError);
  assert.equal(store.remove(record.notificationId), true);
  assert.equal(store.get(record.notificationId), null);
  assert.throws(() => store.update(record.notificationId, { title: '不存在' }), (error) => error.code === 'NOTIFICATION_STORE_NOT_FOUND');
  store.add({ notificationId: 'notification-b', traceId: 'trace-b', type: 'message', source: 'test', title: 'B', content: 'B' });
  assert.equal(store.clear(), 1);
  assert.equal(store.size, 0);
});

test('NotificationStore batch-marks selected notifications as read in one atomic change', () => {
  const store = new NotificationStore();
  store.add({ notificationId: 'notification-a', traceId: 'trace-a', type: 'message', source: 'test', title: 'A', content: 'A' });
  store.add({ notificationId: 'notification-b', traceId: 'trace-b', type: 'message', source: 'test', title: 'B', content: 'B' });
  store.add({ notificationId: 'notification-c', traceId: 'trace-c', type: 'message', source: 'test', title: 'C', content: 'C', status: 'read' });
  const changes = [];
  store.subscribe((change) => changes.push(change));

  const result = store.setStatuses(['notification-a', 'notification-b', 'notification-c', 'notification-a'], 'read');

  assert.deepEqual(result.updated.map((record) => record.notificationId), [
    'notification-a', 'notification-b', 'notification-c'
  ]);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(store.list({ status: 'read' }).map((record) => record.notificationId).sort(), [
    'notification-a', 'notification-b', 'notification-c'
  ]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, 'status-batch');
  assert.deepEqual(changes[0].updatedRecords.map((record) => record.notificationId), [
    'notification-a', 'notification-b'
  ]);
  assert.deepEqual(store.get('notification-c'), result.updated[2]);
});

test('NotificationStore batch status update is a no-op for empty or already-read selections', () => {
  const store = new NotificationStore();
  const read = store.add({ notificationId: 'notification-read', traceId: 'trace-read', type: 'message', source: 'test', title: '已读', content: '内容', status: 'read' });
  const changes = [];
  store.subscribe((change) => changes.push(change));

  assert.deepEqual(store.setStatuses([], 'read'), { updated: [], missing: [] });
  const result = store.setStatuses([read.notificationId], 'read');

  assert.deepEqual(result.updated, [read]);
  assert.deepEqual(result.missing, []);
  assert.equal(changes.length, 0);
  assert.equal(store.get(read.notificationId).updatedAt, read.updatedAt);
});

test('NotificationStore rejects invalid or missing batch ids without partial updates', () => {
  const store = new NotificationStore();
  const record = store.add({ notificationId: 'notification-existing', traceId: 'trace-existing', type: 'message', source: 'test', title: '存在', content: '内容' });
  const changes = [];
  store.subscribe((change) => changes.push(change));

  assert.throws(
    () => store.setStatuses(['notification-existing', 'notification-missing'], 'read'),
    (error) => error.code === 'NOTIFICATION_STORE_NOT_FOUND'
      && error.details.field === 'notificationId'
      && error.details.notificationIds.includes('notification-missing')
  );
  assert.equal(store.get(record.notificationId).status, 'received');
  assert.equal(changes.length, 0);
  assert.throws(
    () => store.setStatuses(['notification-existing'], 'shown'),
    (error) => error.code === 'NOTIFICATION_STORE_BATCH_STATUS_INVALID'
  );
  assert.throws(
    () => store.setStatuses('notification-existing', 'read'),
    (error) => error.code === 'NOTIFICATION_STORE_BATCH_IDS_INVALID'
  );
  assert.throws(
    () => store.setStatuses([''], 'read'),
    (error) => error.code === 'NOTIFICATION_STORE_BATCH_IDS_INVALID'
  );
});
