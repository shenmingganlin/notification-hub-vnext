import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationRecord,
  transitionNotificationStatus,
  updateNotificationRecord
} from '../../plugin/domain/notification-record.js';

test('NotificationRecord creates a minimal received record with stable defaults', () => {
  const record = createNotificationRecord({
    type: 'message',
    source: 'test-source',
    title: '测试通知',
    content: '正文'
  });

  assert.match(record.notificationId, /^notification-/);
  assert.match(record.traceId, /^trace-/);
  assert.equal(record.type, 'message');
  assert.equal(record.source, 'test-source');
  assert.equal(record.channel, null);
  assert.equal(record.title, '测试通知');
  assert.equal(record.content, '正文');
  assert.equal(record.importance, 'normal');
  assert.equal(record.status, 'received');
  assert.ok(!Number.isNaN(Date.parse(record.createdAt)));
  assert.equal(record.updatedAt, record.createdAt);
  assert.deepEqual(record.metadata, {});
  assert.deepEqual(record.contentPolicy, {});
  assert.deepEqual(record.runtimeHints, {});
});

test('NotificationRecord preserves custom fields and freezes nested values', () => {
  const record = createNotificationRecord({
    notificationId: 'notification-custom',
    traceId: 'trace-custom',
    type: 'diagnostic',
    importance: 'high',
    source: 'runtime',
    agent: { id: 'agent-1' },
    title: '标题',
    content: '内容',
    metadata: { retryable: true }
  });

  assert.equal(record.notificationId, 'notification-custom');
  assert.equal(record.importance, 'high');
  assert.deepEqual(record.agent, { id: 'agent-1' });
  assert.deepEqual(record.metadata, { retryable: true });
  assert.throws(() => { record.title = '修改'; }, TypeError);
  assert.throws(() => { record.metadata.retryable = false; }, TypeError);
  assert.equal(record.title, '标题');
  assert.equal(record.metadata.retryable, true);
});

test('NotificationRecord does not mutate or freeze caller-owned input', () => {
  const metadata = { retryable: true };
  const record = createNotificationRecord({
    type: 'message',
    source: 'test-source',
    title: '标题',
    content: '内容',
    metadata
  });

  metadata.retryable = false;
  assert.equal(metadata.retryable, false);
  assert.equal(record.metadata.retryable, true);
});

test('NotificationRecord rejects invalid timestamps and locates the field', () => {
  assert.throws(
    () => createNotificationRecord({
      type: 'message',
      source: 'test-source',
      title: '标题',
      content: '内容',
      createdAt: 'invalid-time'
    }),
    (error) => error.code === 'NOTIFICATION_RECORD_TIMESTAMP_INVALID' && error.details.field === 'createdAt'
  );

  assert.throws(
    () => createNotificationRecord({
      type: 'message',
      source: 'test-source',
      title: '标题',
      content: '内容',
      importance: 'urgent'
    }),
    (error) => error.code === 'NOTIFICATION_RECORD_IMPORTANCE_INVALID' && error.details.field === 'importance'
  );

  assert.throws(
    () => createNotificationRecord({
      type: 'message',
      source: 'test-source',
      title: '标题',
      content: '内容',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }),
    (error) => error.code === 'NOTIFICATION_RECORD_TIMESTAMP_ORDER_INVALID' && error.details.field === 'updatedAt'
  );

  assert.throws(
    () => createNotificationRecord({
      type: 'message',
      source: 'test-source',
      title: '标题',
      content: '内容',
      metadata: []
    }),
    (error) => error.code === 'NOTIFICATION_RECORD_FIELD_INVALID' && error.details.field === 'metadata'
  );
});

test('NotificationRecord updates timestamps and transitions status', () => {
  const original = createNotificationRecord({
    type: 'message',
    source: 'test-source',
    title: '标题',
    content: '内容'
  });
  const updated = updateNotificationRecord(original, { summary: '摘要' });
  const shown = transitionNotificationStatus(updated, 'shown');

  assert.equal(updated.summary, '摘要');
  assert.equal(updated.status, 'received');
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(original.updatedAt));
  assert.equal(shown.status, 'shown');
  assert.notEqual(shown, updated);
  assert.throws(
    () => transitionNotificationStatus(shown, 'unknown'),
    (error) => error.code === 'NOTIFICATION_RECORD_STATUS_INVALID' && error.details.field === 'status'
  );
});

test('NotificationRecord preserves a structured channel and rejects invalid channel shapes', () => {
  const record = createNotificationRecord({
    type: 'message',
    source: 'hana.session',
    channel: { kind: 'chat', id: 'desktop' },
    title: '聊天通知',
    content: '内容'
  });

  assert.deepEqual(record.channel, { kind: 'chat', id: 'desktop' });
  assert.throws(
    () => createNotificationRecord({
      type: 'message',
      source: 'hana.session',
      channel: [],
      title: '标题',
      content: '内容'
    }),
    (error) => error.code === 'NOTIFICATION_RECORD_CHANNEL_INVALID' && error.details.field === 'channel'
  );
});

test('NotificationRecord rejects missing required fields and invalid shapes', () => {
  const required = ['type', 'source', 'title', 'content'];
  for (const field of required) {
    const input = { type: 'message', source: 'source', title: '标题', content: '内容' };
    delete input[field];
    assert.throws(
      () => createNotificationRecord(input),
      (error) => error.code === 'NOTIFICATION_RECORD_FIELD_INVALID' && error.details.field === field
    );
  }

  assert.throws(
    () => createNotificationRecord({
      type: 'message',
      source: 'source',
      title: '标题',
      content: '内容',
      agent: []
    }),
    (error) => error.code === 'NOTIFICATION_RECORD_FIELD_INVALID' && error.details.field === 'agent'
  );
});
