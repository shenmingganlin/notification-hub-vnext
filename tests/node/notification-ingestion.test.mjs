import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationApi } from '../../plugin/api/notification-api.js';
import { prepareNotificationInput, ingestNotification } from '../../plugin/domain/notification-ingestion.js';

const profiles = [{
  id: 'default',
  importance: 'high',
  contentPolicy: { mode: 'summary', maxLength: 12 },
  historyPolicy: { save: true, maxAgeMs: 3600000 },
  runtimeHints: { layout: 'stack', lifetimeMs: 5000 }
}];

const event = {
  eventId: 'event-1',
  traceId: 'trace-1',
  type: 'message_end',
  stopReason: 'end_turn',
  source: 'model'
};

const notification = {
  title: '处理完成',
  content: '第一句完成。第二句很长，不应完整进入摘要。',
  metadata: { requestId: 'request-1' }
};

test('prepareNotificationInput composes classification, profile, and formatted content', () => {
  const result = prepareNotificationInput({ event, notification, profiles });

  assert.equal(result.classification.classification, 'completed');
  assert.equal(result.profile.profile.id, 'default');
  assert.equal(result.recordInput.notificationId, 'event-1');
  assert.equal(result.recordInput.traceId, 'trace-1');
  assert.equal(result.recordInput.type, 'message_end');
  assert.equal(result.recordInput.source, 'model');
  assert.equal(result.canonicalEvent.eventId, 'chat.assistant_reply.completed');
  assert.equal(result.recordInput.eventId, 'chat.assistant_reply.completed');
  assert.equal(result.recordInput.categoryId, 'chat');
  assert.equal(result.recordInput.eventTypeId, 'assistant_reply.completed');
  assert.equal(result.recordInput.title, notification.title);
  assert.equal(result.recordInput.content, '第一句完成。');
  assert.equal(result.recordInput.summary, '第一句完成。');
  assert.deepEqual(result.recordInput.contentPolicy, { mode: 'summary', maxLength: 12 });
  assert.equal(result.recordInput.importance, 'high');
  assert.equal(result.recordInput.importanceClass, 'important');
  assert.equal(result.recordInput.metadata.importance.value, 'important');
  assert.deepEqual(result.recordInput.historyPolicy, { save: true, maxAgeMs: 3600000 });
  assert.deepEqual(result.recordInput.runtimeHints, { layout: 'stack', lifetimeMs: 5000 });
  assert.equal(result.recordInput.status, 'formatted');
  assert.deepEqual(result.recordInput.metadata.eventClassification, result.classification);
  assert.equal(result.recordInput.metadata.semantic.eventId, 'chat.assistant_reply.completed');
  assert.equal(result.recordInput.metadata.requestId, 'request-1');
});

test('event presentation profile binds sound, visual, and behavior independently during ingestion', () => {
  const result = prepareNotificationInput({
    event,
    notification,
    profiles,
    presentationProfile: {
      global: { soundProfileId: 'sound.global', visualProfileId: 'visual.global', behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' },
      events: {
        'chat.assistant_reply.completed': { soundProfileId: 'sound.reply', visualProfileId: 'visual.reply', behaviorProfileId: 'ticker', behaviorChannelId: 'ticker.reply' }
      }
    }
  });
  assert.deepEqual(result.recordInput.presentation, {
    soundProfileId: 'sound.reply',
    visualProfileId: 'visual.reply',
    behaviorProfileId: 'ticker',
    behaviorChannelId: 'ticker.reply',
    eventId: 'chat.assistant_reply.completed',
    categoryId: 'chat',
    matchedBy: 'event'
  });
});

test('explicit contentPolicy overrides the resolved Profile policy', () => {
  const result = prepareNotificationInput({
    event,
    notification,
    profiles,
    contentPolicy: { mode: 'redacted', maxLength: 80 }
  });

  assert.equal(result.formatted.mode, 'redacted');
  assert.deepEqual(result.recordInput.contentPolicy, { mode: 'redacted', maxLength: 80 });
  assert.equal(result.recordInput.content, notification.content);
});

test('ingestNotification writes once and returns the complete processing result', () => {
  const calls = [];
  const api = {
    createNotification(input) {
      calls.push(input);
      return { ...input, notificationId: 'stored-1' };
    }
  };

  const result = ingestNotification({ api, event, notification, profiles });

  assert.equal(calls.length, 1);
  assert.equal(result.record.notificationId, 'stored-1');
  assert.equal(result.classification.classification, 'completed');
  assert.equal(result.profile.profile.id, 'default');
  assert.equal(result.formatted.content, '第一句完成。');
});

test('NotificationApi.ingestEvent writes the composed record into its Store', () => {
  const api = new NotificationApi();
  const result = api.ingestEvent({ event, notification, profiles });

  assert.equal(result.record.status, 'formatted');
  assert.equal(api.getNotification('event-1').content, '第一句完成。');
  assert.equal(api.listNotifications().length, 1);
});

test('unknown events are stored as diagnostic classifications, never successful completions', () => {
  const api = new NotificationApi();
  const result = api.ingestEvent({
    event: { ...event, type: 'future_event', stopReason: 'future_reason' },
    notification,
    profiles
  });

  assert.equal(result.classification.classification, 'unknown');
  assert.equal(result.classification.action, 'diagnostic');
  assert.equal(result.classification.successful, false);
  assert.equal(result.record.metadata.eventClassification.classification, 'unknown');
});

test('classification, Profile, and formatter failures happen before Store writes', () => {
  const storeApi = new NotificationApi();

  assert.throws(
    () => storeApi.ingestEvent({ event: { type: 'message_end' }, notification, profiles }),
    (error) => error.code === 'EVENT_CLASSIFIER_STOP_REASON_MISSING'
  );
  assert.equal(storeApi.store.size, 0);

  assert.throws(
    () => storeApi.ingestEvent({ event, notification, profiles: [{ id: 'invalid', importance: 'bad' }] }),
    (error) => error.code === 'NOTIFICATION_PROFILE_FIELD_INVALID'
  );
  assert.equal(storeApi.store.size, 0);

  assert.throws(
    () => storeApi.ingestEvent({ event, notification, profiles, contentPolicy: { mode: 'bad' } }),
    (error) => error.code === 'CONTENT_FORMATTER_MODE_INVALID'
  );
  assert.equal(storeApi.store.size, 0);
});

test('formatted redacted content enters the Record without the original secret', () => {
  const api = new NotificationApi();
  const result = api.ingestEvent({
    event,
    notification: {
      ...notification,
      content: 'password=secret123 path=C:\\Users\\Ganlin\\Desktop\\file.txt'
    },
    profiles,
    contentPolicy: { mode: 'redacted', maxLength: 120 }
  });

  assert.equal(result.formatted.redacted, true);
  assert.equal(result.record.content.includes('secret123'), false);
  assert.equal(result.record.content.includes('[REDACTED]'), true);
  assert.equal(Object.isFrozen(result.classification), true);
  assert.equal(Object.isFrozen(result.profile), true);
  assert.equal(Object.isFrozen(result.formatted), true);
});

test('ingestion does not mutate or freeze caller-owned inputs', () => {
  const inputEvent = structuredClone(event);
  const inputNotification = structuredClone(notification);
  const inputProfiles = structuredClone(profiles);
  const contentPolicy = { mode: 'full', maxLength: 100 };

  prepareNotificationInput({
    event: inputEvent,
    notification: inputNotification,
    profiles: inputProfiles,
    contentPolicy
  });

  assert.equal(Object.isFrozen(inputEvent), false);
  assert.equal(Object.isFrozen(inputNotification), false);
  assert.equal(Object.isFrozen(inputProfiles), false);
  assert.equal(Object.isFrozen(contentPolicy), false);
  assert.deepEqual(inputEvent, event);
  assert.deepEqual(inputNotification, notification);
  assert.deepEqual(inputProfiles, profiles);
});

test('ingestion rejects invalid API and notification boundaries', () => {
  assert.throws(
    () => ingestNotification({ api: {}, event, notification, profiles }),
    (error) => error.code === 'NOTIFICATION_INGESTION_API_INVALID'
  );
  assert.throws(
    () => prepareNotificationInput({ event, notification: { content: 'missing title' }, profiles }),
    (error) => error.code === 'NOTIFICATION_INGESTION_NOTIFICATION_INVALID'
      && error.details.field === 'notification.title'
  );
});
