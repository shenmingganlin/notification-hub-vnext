import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationApi } from '../../plugin/api/notification-api.js';
import { createSoundProfile } from '../../plugin/domain/sound-profile.js';

import {
  createModelServiceIncidentKey,
  getModelServiceUserCopy,
  normalizeModelServiceError
} from '../../plugin/domain/model-service-error.js';

test('model service errors retain safe HTTP metadata and omit secrets', () => {
  const result = normalizeModelServiceError({
    type: 'model_service_error',
    status: 503,
    provider: 'provider-x',
    model: 'model-y',
    operation: 'memory_summary',
    taskKey: null,
    retryable: true,
    retryAfterMs: 1200,
    apiKey: 'secret',
    response: { body: 'private' }
  });
  assert.deepEqual(result, {
    errorDomain: 'model_service',
    httpStatus: 503,
    provider: 'provider-x',
    model: 'model-y',
    operation: 'memory_summary',
    taskKey: null,
    reason: 'availability',
    retryable: true,
    retryAfterMs: 1200,
    incidentKey: 'model_service|provider-x|model-y|memory_summary|unknown-scope',
    attempt: null
  });
  assert.equal(result.apiKey, undefined);
  assert.equal(result.response, undefined);
});

test('model service status codes remain technical fields and infer bounded retry policy', () => {
  assert.equal(normalizeModelServiceError({ status: 429 }).retryable, true);
  assert.equal(normalizeModelServiceError({ status: 502 }).reason, 'capacity');
  assert.equal(normalizeModelServiceError({ status: 503 }).reason, 'availability');
  assert.equal(normalizeModelServiceError({ status: 401 }).retryable, false);
  assert.equal(normalizeModelServiceError({ status: 200 }).httpStatus, null);
});

test('NotificationApi ingests model service errors with one user category and incident key', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundProfile: createSoundProfile({ global: { enabled: true } }),
    soundPlayer: async (payload) => { calls.push(payload); return { played: true }; }
  });
  const first = api.ingestModelServiceError({ status: 503, provider: 'p', model: 'm', operation: 'memory_summary', taskKey: 'task-a', eventId: 'model-error-1' });
  const second = api.ingestModelServiceError({ status: 503, provider: 'p', model: 'm', operation: 'memory_summary', taskKey: 'task-a', eventId: 'model-error-2' });
  await Promise.all([first.sound.playback, second.sound.playback].filter(Boolean));
  assert.equal(first.record.type, 'model_service_error');
  assert.equal(first.classification.classification, 'model_service');
  assert.deepEqual(first.sound.presentation.classification.labels, ['model_service', 'system', 'error']);
  assert.equal(second.deduplication.decision, 'duplicate');
  assert.equal(second.deduplication.suppress, true);
  assert.equal(calls.length, 1);
  assert.equal(api.store.size, 1);
  assert.equal(second.record.notificationId, first.record.notificationId);
  assert.equal(second.record.metadata.incidentLifecycle.status, 'active');
  assert.equal(second.record.metadata.incidentLifecycle.attemptCount, 2);
  assert.equal(api.listNotifications({ system: true }).length, 1);
  assert.equal(api.listNotifications({ error: true }).length, 1);

  const recovered = api.ingestModelServiceRecovered({ status: 503, provider: 'p', model: 'm', operation: 'memory_summary', taskKey: 'task-a', recoveredAt: '2026-08-15T02:00:00.000Z' });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.record.metadata.incidentLifecycle.status, 'recovered');
  assert.equal(recovered.record.metadata.incidentLifecycle.recoveredAt, '2026-08-15T02:00:00.000Z');

  const afterRecovery = api.ingestModelServiceError({ status: 503, provider: 'p', model: 'm', operation: 'memory_summary', taskKey: 'task-a', eventId: 'model-error-3', createdAt: '2026-08-15T02:01:00.000Z' });
  assert.equal(afterRecovery.deduplication.decision, 'new');
  assert.equal(api.store.size, 2);
  assert.equal(afterRecovery.record.metadata.incidentLifecycle.cycle, 2);
  assert.equal(afterRecovery.record.metadata.incidentLifecycle.attemptCount, 1);
});

test('incident key uses provider/model/operation and user copy stays generic', () => {
  const input = { status: 503, provider: 'p', model: 'm', operation: 'memory_summary' };
  assert.equal(createModelServiceIncidentKey(input), 'model_service|p|m|memory_summary|unknown-scope');
  assert.equal(createModelServiceIncidentKey({ ...input, taskKey: 'task-a' }), 'model_service|p|m|memory_summary|task-a');
  assert.deepEqual(getModelServiceUserCopy(input), {
    title: '模型服务异常',
    content: '模型服务暂时不可用，系统会稍后继续尝试。'
  });
});
