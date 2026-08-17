import assert from 'node:assert/strict';
import test from 'node:test';

import { projectNotificationCategories } from '../../plugin/domain/notification-classification.js';
import { createNotificationPresentationInput } from '../../plugin/domain/notification-presentation-plan.js';
import { createNotificationRecord } from '../../plugin/domain/notification-record.js';

function createRecord() {
  return createNotificationRecord({
    notificationId: 'presentation-plan-record',
    traceId: 'trace-presentation-plan-record',
    type: 'tool_error',
    source: 'plugin.event',
    channel: { kind: 'feishu' },
    producer: { kind: 'api', id: 'plugin-a' },
    importance: 'high',
    title: '工具失败',
    content: '正文'
  });
}

test('presentation input rejects invalid records and stale classification versions', () => {
  const record = createRecord();
  const classification = projectNotificationCategories(record);

  assert.throws(
    () => createNotificationPresentationInput({}, classification),
    (error) => error.code === 'NOTIFICATION_PRESENTATION_RECORD_INVALID'
      && error.details.field === 'record.notificationId'
  );
  assert.throws(
    () => createNotificationPresentationInput(record, { ...classification, version: 'v0' }),
    (error) => error.code === 'NOTIFICATION_PRESENTATION_CLASSIFICATION_VERSION_INVALID'
      && error.details.field === 'classification.version'
  );
  assert.throws(
    () => createNotificationPresentationInput(record, null),
    (error) => error.code === 'NOTIFICATION_PRESENTATION_CLASSIFICATION_INVALID'
      && error.details.field === 'classification'
  );
});

test('presentation input exposes one frozen classification to future visual and sound consumers', () => {
  const record = createRecord();
  const classification = projectNotificationCategories(record);
  const recordSnapshot = structuredClone(record);
  const classificationSnapshot = structuredClone(classification);
  const result = createNotificationPresentationInput(record, classification);

  assert.deepEqual(record, recordSnapshot);
  assert.deepEqual(classification, classificationSnapshot);
  assert.equal(result.notificationId, record.notificationId);
  assert.strictEqual(result.classification, classification);
  assert.deepEqual(result.visualInput, {
    labels: ['channel', 'tool', 'error', 'plugin'],
    categoryId: 'tool',
    visualProfileId: 'visual.tool.default',
    status: 'classified',
    importance: 'high'
  });
  assert.deepEqual(result.soundInput, {
    eventId: 'tool.execution.failed',
    categoryId: 'tool',
    eventTypeId: 'execution.failed',
    soundProfileId: 'sound.tool.failed',
    labels: ['channel', 'tool', 'error', 'external_call'],
    event: 'tool_error',
    importance: 'high',
    producer: { kind: 'api', id: 'plugin-a' },
    source: 'plugin.event',
    channel: 'feishu'
  });
  assert.deepEqual(result.explanation.matchedCategories, ['channel', 'tool', 'error', 'external_call']);
  assert.equal(result.explanation.evidence.length, 4);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.visualInput));
  assert.ok(Object.isFrozen(result.soundInput));
  assert.ok(Object.isFrozen(result.soundInput.labels));
  assert.ok(Object.isFrozen(result.soundInput.producer));
  assert.ok(Object.isFrozen(result.explanation));
  assert.deepEqual(
    Object.keys(result).filter((key) => ['css', 'soundPath', 'runtime', 'coordinates'].includes(key)),
    []
  );
  assert.throws(() => { result.visualInput.labels.push('chat'); }, TypeError);
  assert.throws(() => { result.explanation.evidence[0].rule = 'changed'; }, TypeError);
  assert.equal(record.importance, 'high');
  assert.equal(record.channel.kind, 'feishu');
});

test('presentation keeps model service as one strategy identity with system/error filter projections', () => {
  const record = createNotificationRecord({
    notificationId: 'presentation-model-service',
    traceId: 'trace-presentation-model-service',
    type: 'model_service_error',
    source: 'hana.model',
    importance: 'high',
    title: '模型服务异常',
    content: '稍后重试',
    metadata: { eventClassification: { classification: 'model_service' } }
  });
  const classification = projectNotificationCategories(record);
  const result = createNotificationPresentationInput(record, classification);
  assert.deepEqual(classification.labels, ['model_service', 'system', 'error']);
  assert.deepEqual(result.soundInput.labels, ['model_service', 'system', 'error']);
  assert.equal(result.soundInput.event, 'model_service_error');
});

test('sound input maps a completed tool from structured type', () => {
  const record = createNotificationRecord({
    ...createRecord(), notificationId: 'presentation-tool-completed', type: 'tool_completed', status: 'shown'
  });
  const classification = projectNotificationCategories(record);

  assert.equal(createNotificationPresentationInput(record, classification).soundInput.event, 'tool_success');
});

test('sound input maps a failed tool from structured type', () => {
  const record = createNotificationRecord({
    ...createRecord(), notificationId: 'presentation-tool-error', type: 'tool_error'
  });
  const classification = projectNotificationCategories(record);

  assert.equal(createNotificationPresentationInput(record, classification).soundInput.event, 'tool_error');
});

test('sound input maps timeout from structured type and ignores error wording in content', () => {
  const record = createNotificationRecord({
    ...createRecord(), notificationId: 'presentation-timeout', type: 'timeout', content: '普通聊天文本'
  });
  const classification = projectNotificationCategories(record);

  assert.equal(createNotificationPresentationInput(record, classification).soundInput.event, 'timeout');
});

test('sound input retains structured plugin producer metadata', () => {
  const record = createRecord();
  const classification = projectNotificationCategories(record);
  const result = createNotificationPresentationInput(record, classification);

  assert.deepEqual(result.soundInput.producer, { kind: 'api', id: 'plugin-a' });
  assert.equal(result.soundInput.source, 'plugin.event');
  assert.equal(result.soundInput.channel, 'feishu');
});

test('sound input identifies ordinary chat as arrived when no event is structured', () => {
  const record = createNotificationRecord({
    notificationId: 'presentation-chat-arrived', traceId: 'trace-chat-arrived',
    type: 'assistant_message', source: 'hana.session', channel: { kind: 'chat' },
    title: '聊天', content: '工具失败错误超时', importance: 'normal'
  });
  const classification = projectNotificationCategories(record);

  assert.equal(createNotificationPresentationInput(record, classification).soundInput.event, 'arrived');
});

test('sound input falls back to arrived for unknown structured events', () => {
  const record = createNotificationRecord({
    ...createRecord(), notificationId: 'presentation-unknown-event', type: 'custom_notice', content: 'timeout error'
  });
  const classification = projectNotificationCategories(record);

  assert.equal(createNotificationPresentationInput(record, classification).soundInput.event, 'arrived');
});
