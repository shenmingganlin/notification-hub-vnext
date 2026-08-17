import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationFingerprint,
  evaluateNotificationDuplicate
} from '../../plugin/domain/notification-deduplication.js';

const baseNotification = {
  notificationId: 'notification-1',
  type: 'message_end',
  source: 'model',
  title: '完成',
  content: '第一行\n\n第二行',
  createdAt: '2026-08-04T10:00:00.000Z'
};

test('explicit deduplicationKey has priority over event, trace, and content', () => {
  const result = createNotificationFingerprint({
    ...baseNotification,
    deduplicationKey: 'job-42',
    eventId: 'event-42',
    traceId: 'trace-42'
  });

  assert.equal(result.key, 'explicit:job-42');
  assert.equal(result.basis, 'explicit');
  assert.equal(result.stable, true);
  assert.match(result.fingerprint, /^[0-9a-f]+$/);
});

test('incidentKey has priority over event and trace so retries share one incident identity', () => {
  const result = createNotificationFingerprint({
    ...baseNotification,
    eventId: 'attempt-2',
    traceId: 'trace-2',
    metadata: { incidentKey: 'model_service|provider|model|operation|task' }
  });
  assert.equal(result.key, 'incident:model_service|provider|model|operation|task');
  assert.equal(result.basis, 'incident');
  assert.equal(result.stable, true);
});

test('fingerprint selection falls back through incident, event, trace, metadata, content, then none', () => {
  assert.equal(createNotificationFingerprint({ ...baseNotification, eventId: 'event-1' }).basis, 'event');
  assert.equal(createNotificationFingerprint({ ...baseNotification, traceId: 'trace-1' }).basis, 'trace');
  assert.equal(createNotificationFingerprint({
    ...baseNotification,
    metadata: { eventId: 'metadata-event-1' }
  }).basis, 'metadata-event');
  assert.equal(createNotificationFingerprint(baseNotification).basis, 'none');

  const content = createNotificationFingerprint(baseNotification, { mode: 'content' });
  assert.equal(content.basis, 'content');
  assert.match(content.key, /^content:/);
  assert.equal(content.stable, true);
});

test('content fingerprint normalizes whitespace but preserves case and punctuation', () => {
  const left = createNotificationFingerprint({
    ...baseNotification,
    source: 'model',
    title: 'Title',
    content: 'Alpha\n  beta!'
  }, { mode: 'content' });
  const right = createNotificationFingerprint({
    ...baseNotification,
    source: 'model',
    title: 'Title',
    content: ' Alpha beta! '
  }, { mode: 'content' });
  const changedCase = createNotificationFingerprint({
    ...baseNotification,
    source: 'model',
    title: 'Title',
    content: 'alpha beta!'
  }, { mode: 'content' });

  assert.equal(left.fingerprint, right.fingerprint);
  assert.notEqual(left.fingerprint, changedCase.fingerprint);
});

test('no previous notification returns new and equal window boundary is duplicate', () => {
  const notification = {
    ...baseNotification,
    deduplicationKey: 'job-42'
  };
  const first = evaluateNotificationDuplicate({ notification });
  const duplicate = evaluateNotificationDuplicate({
    notification,
    previous: { ...notification, createdAt: '2026-08-04T09:59:00.000Z' }
  });
  const atBoundary = evaluateNotificationDuplicate({
    notification,
    previous: { ...notification, createdAt: '2026-08-04T09:59:00.000Z' },
    policy: { windowMs: 60000 }
  });

  assert.equal(first.decision, 'new');
  assert.equal(first.suppress, false);
  assert.equal(duplicate.decision, 'duplicate');
  assert.equal(duplicate.withinWindow, true);
  assert.equal(atBoundary.decision, 'duplicate');
  assert.equal(atBoundary.ageMs, 60000);
  assert.equal(atBoundary.suppress, true);
});

test('same key outside the window is outside_window and different key is new', () => {
  const notification = { ...baseNotification, deduplicationKey: 'job-42' };
  const outside = evaluateNotificationDuplicate({
    notification,
    previous: { ...notification, createdAt: '2026-08-04T09:58:59.999Z' }
  });
  const different = evaluateNotificationDuplicate({
    notification,
    previous: { ...notification, deduplicationKey: 'job-43', createdAt: '2026-08-04T09:59:30.000Z' }
  });

  assert.equal(outside.decision, 'outside_window');
  assert.equal(outside.withinWindow, false);
  assert.equal(outside.suppress, false);
  assert.equal(different.decision, 'new');
});

test('missing stable key is indeterminate and never suppressed by default', () => {
  const result = evaluateNotificationDuplicate({
    notification: baseNotification,
    previous: { ...baseNotification, createdAt: '2026-08-04T09:59:30.000Z' }
  });

  assert.equal(result.decision, 'indeterminate');
  assert.equal(result.basis, 'none');
  assert.equal(result.stable, false);
  assert.equal(result.suppress, false);
});

test('off, content mode, and critical notifications follow explicit policy', () => {
  const notification = { ...baseNotification, deduplicationKey: 'job-42', importance: 'critical' };
  const previous = { ...notification, createdAt: '2026-08-04T09:59:30.000Z' };

  const off = evaluateNotificationDuplicate({ notification, previous, policy: { mode: 'off' } });
  const critical = evaluateNotificationDuplicate({ notification, previous });
  const content = evaluateNotificationDuplicate({
    notification: { ...baseNotification, importance: 'normal' },
    previous: { ...baseNotification, createdAt: '2026-08-04T09:59:30.000Z' },
    policy: { mode: 'content' }
  });

  assert.equal(off.decision, 'new');
  assert.equal(off.suppress, false);
  assert.equal(critical.decision, 'duplicate');
  assert.equal(critical.suppress, false);
  assert.equal(content.decision, 'duplicate');
  assert.equal(content.basis, 'content');
});

test('deduplication preserves inputs and deep-freezes results', () => {
  const notification = { ...baseNotification, deduplicationKey: 'job-42' };
  const previous = { ...notification, createdAt: '2026-08-04T09:59:30.000Z' };
  const policy = { windowMs: 60000 };
  const result = evaluateNotificationDuplicate({ notification, previous, policy });

  assert.equal(Object.isFrozen(notification), false);
  assert.equal(Object.isFrozen(previous), false);
  assert.equal(Object.isFrozen(policy), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.key), true);
  assert.deepEqual(policy, { windowMs: 60000 });
});

test('deduplication rejects invalid notification, previous, policy, and timestamps', () => {
  assert.throws(
    () => createNotificationFingerprint(null),
    (error) => error.code === 'NOTIFICATION_DEDUPLICATION_NOTIFICATION_INVALID'
  );
  assert.throws(
    () => evaluateNotificationDuplicate({ notification: baseNotification, policy: { mode: 'bad' } }),
    (error) => error.code === 'NOTIFICATION_DEDUPLICATION_MODE_INVALID'
  );
  assert.throws(
    () => evaluateNotificationDuplicate({ notification: baseNotification, policy: { windowMs: 0 } }),
    (error) => error.code === 'NOTIFICATION_DEDUPLICATION_WINDOW_INVALID'
  );
  assert.throws(
    () => evaluateNotificationDuplicate({
      notification: { ...baseNotification, deduplicationKey: 'job-42' },
      previous: { ...baseNotification, deduplicationKey: 'job-42', createdAt: 'invalid' }
    }),
    (error) => error.code === 'NOTIFICATION_DEDUPLICATION_TIMESTAMP_INVALID'
  );
});
