import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getNotificationClassification,
  isApiProducedNotification,
  normalizeNotificationProducer,
  projectNotificationCategories
} from '../../plugin/domain/notification-classification.js';
import { createNotificationRecord } from '../../plugin/domain/notification-record.js';

test('product classification projects a chat notification with stable evidence', () => {
  const record = createNotificationRecord({
    notificationId: 'classification-chat',
    traceId: 'trace-classification-chat',
    type: 'assistant_message',
    source: 'hana.session',
    channel: { kind: 'chat', id: 'desktop' },
    title: '回复',
    content: '正文'
  });

  const result = projectNotificationCategories(record);
  assert.deepEqual(result.labels, ['chat']);
  assert.equal(result.version, 'v1');
  assert.equal(result.status, 'classified');
  assert.equal(result.facets.communication, 'chat');
  assert.deepEqual(result.facets.event, ['assistant_reply']);
  assert.match(result.evidence[0].rule, /channel\.kind=chat/);
  assert.ok(Object.isFrozen(result));
});

test('classification projects channel, tool, error, and plugin together', () => {
  const record = createNotificationRecord({
    notificationId: 'classification-combo',
    traceId: 'trace-classification-combo',
    type: 'tool_error',
    source: 'plugin.event',
    channel: { kind: 'feishu', id: 'group-1' },
    producer: { kind: 'api', id: 'download-plugin' },
    importance: 'high',
    title: '下载失败',
    content: '工具执行失败'
  });

  const result = projectNotificationCategories(record);
  assert.deepEqual(result.labels, ['channel', 'tool', 'error', 'external_call']);
  assert.equal(result.facets.communication, 'channel');
  assert.deepEqual(result.facets.event, ['tool', 'tool_error', 'error']);
  assert.deepEqual(result.facets.producer, { kind: 'api', id: 'download-plugin' });
  assert.equal(result.evidence.length, 4);
});

test('classification treats every explicit non-chat channel as channel even for assistant messages', () => {
  const record = createNotificationRecord({
    notificationId: 'classification-channel-assistant',
    traceId: 'trace-classification-channel-assistant',
    type: 'assistant_message',
    source: 'hana.session',
    channel: { kind: 'feishu', id: 'channel-1' },
    title: '频道回复',
    content: '正文'
  });

  const result = projectNotificationCategories(record);
  assert.deepEqual(result.labels, ['channel']);
  assert.equal(result.facets.communication, 'channel');
  assert.equal(result.evidence[0].field, 'channel.kind');
});

test('classification exposes tool success and tool error as detailed events', () => {
  const success = createNotificationRecord({ notificationId: 'tool-success', traceId: 'tool-success', type: 'tool_result', source: 'hana.tool', title: '完成', content: 'ok' });
  const failure = createNotificationRecord({ notificationId: 'tool-error', traceId: 'tool-error', type: 'tool_error', source: 'hana.tool', title: '失败', content: 'no' });
  assert.deepEqual(projectNotificationCategories(success).facets.event, ['tool', 'tool_success']);
  assert.deepEqual(projectNotificationCategories(failure).facets.event, ['tool', 'tool_error', 'error']);
});

test('classification projects model service into one strategy category and system/error filters', () => {
  const record = createNotificationRecord({
    notificationId: 'classification-model-service',
    traceId: 'trace-classification-model-service',
    type: 'model_service_error',
    source: 'hana.model',
    importance: 'high',
    title: '模型服务异常',
    content: '模型服务暂时不可用',
    metadata: { eventClassification: { classification: 'model_service' } }
  });
  const result = projectNotificationCategories(record);
  assert.deepEqual(result.labels, ['model_service', 'system', 'error']);
  assert.deepEqual(result.facets.event, ['model_service_error', 'error']);
  assert.equal(result.status, 'classified');
});

test('classification uses structured fallbacks and leaves keyword-only text unknown', () => {
  const assistant = createNotificationRecord({
    notificationId: 'classification-assistant-fallback',
    traceId: 'trace-classification-assistant-fallback',
    type: 'assistant_message',
    source: 'hana.session',
    title: '回复',
    content: '内容里提到了 error，但不是错误通知'
  });
  const external = createNotificationRecord({
    notificationId: 'classification-external-channel',
    traceId: 'trace-classification-external-channel',
    type: 'message',
    source: 'bridge',
    channel: { kind: 'custom-bridge' },
    title: '频道消息',
    content: '内容'
  });
  const unknown = createNotificationRecord({
    notificationId: 'classification-unknown',
    traceId: 'trace-classification-unknown',
    type: 'diagnostic',
    source: 'runtime',
    title: '诊断',
    content: '工具 error 文本'
  });

  assert.deepEqual(projectNotificationCategories(assistant).labels, ['chat']);
  assert.deepEqual(projectNotificationCategories(external).labels, ['channel']);
  const first = projectNotificationCategories(unknown);
  const second = projectNotificationCategories(unknown);
  assert.deepEqual(first.labels, []);
  assert.equal(first.status, 'unknown');
  assert.deepEqual(first.evidence, []);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first.facets));
  assert.ok(Object.isFrozen(first.evidence));
});

test('product classification does not mutate caller-owned notification fields', () => {
  const channel = { kind: 'feishu', id: 'group-1' };
  const producer = { kind: 'api', id: 'plugin-a', label: '插件 A' };
  const record = createNotificationRecord({
    notificationId: 'classification-immutability',
    traceId: 'trace-classification-immutability',
    type: 'tool_error',
    source: 'plugin.event',
    channel,
    producer,
    title: '失败',
    content: '正文'
  });
  const result = projectNotificationCategories(record);

  channel.kind = 'chat';
  producer.label = '已修改';
  assert.equal(record.channel.kind, 'feishu');
  assert.equal(record.producer.label, '插件 A');
  assert.equal(result.facets.producer.label, '插件 A');
  assert.throws(() => { result.facets.event.push('chat'); }, TypeError);
  assert.throws(() => { result.evidence[0].category = 'chat'; }, TypeError);
});

test('notification classification normalizes API producers without mutating input', () => {
  const producer = { kind: 'api', id: 'download-plugin', label: '下载插件' };
  const record = createNotificationRecord({
    notificationId: 'notification-api',
    traceId: 'trace-api',
    type: 'job_completed',
    source: 'plugin.api',
    producer,
    title: '任务完成',
    content: '下载完成'
  });

  producer.label = '被修改';
  assert.deepEqual(record.producer, { kind: 'api', id: 'download-plugin', label: '下载插件' });
  assert.equal(isApiProducedNotification(record), true);
  assert.deepEqual(getNotificationClassification(record), {
    type: 'job_completed',
    source: 'plugin.api',
    channel: null,
    producer: record.producer
  });
});

test('Hana core records remain unclassified as API cards', () => {
  const record = createNotificationRecord({
    notificationId: 'notification-hana',
    traceId: 'trace-hana',
    type: 'assistant_message',
    source: 'hana.session',
    title: '回复',
    content: '正文'
  });

  assert.equal(record.producer, undefined);
  assert.equal(isApiProducedNotification(record), false);
});

test('notification classification rejects malformed and unknown producers', () => {
  assert.equal(normalizeNotificationProducer(null), null);
  assert.throws(
    () => normalizeNotificationProducer({ kind: 'api' }),
    (error) => error.code === 'NOTIFICATION_PRODUCER_ID_INVALID' && error.details.field === 'producer.id'
  );
  assert.throws(
    () => normalizeNotificationProducer({ kind: 'external', id: 'x' }),
    (error) => error.code === 'NOTIFICATION_PRODUCER_KIND_INVALID' && error.details.field === 'producer.kind'
  );
  assert.throws(
    () => normalizeNotificationProducer({ kind: 'hana', label: 42 }),
    (error) => error.code === 'NOTIFICATION_PRODUCER_INVALID' && error.details.field === 'producer.label'
  );
});
