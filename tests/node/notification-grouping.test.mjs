import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationGroupKey,
  evaluateNotificationGrouping
} from '../../plugin/domain/notification-grouping.js';

const baseNotification = {
  notificationId: 'notification-1',
  traceId: 'trace-1',
  type: 'message_end',
  source: 'model',
  title: '完成',
  content: '正文',
  createdAt: '2026-08-04T10:01:00.000Z',
  session: { id: 'session-1' },
  importance: 'normal'
};

const baseGroup = {
  groupKey: 'session:session-1',
  createdAt: '2026-08-04T10:00:00.000Z',
  lastActivityAt: '2026-08-04T10:00:30.000Z',
  memberCount: 2,
  importance: 'normal',
  containsCritical: false
};

test('explicit groupKey has priority over session and source/type', () => {
  const result = createNotificationGroupKey({
    ...baseNotification,
    groupKey: 'job-42'
  });

  assert.deepEqual(result, {
    key: 'explicit:job-42',
    basis: 'explicit',
    stable: true
  });
});

test('incidentKey has priority over session and source/type for model service retries', () => {
  assert.deepEqual(createNotificationGroupKey({
    ...baseNotification,
    metadata: { incidentKey: 'model_service|provider-a|model-a|memory_summary|task-1' }
  }), {
    key: 'incident:model_service|provider-a|model-a|memory_summary|task-1',
    basis: 'incident',
    stable: true
  });
});

test('group key falls back through incident, session, source/type, then none', () => {
  assert.deepEqual(createNotificationGroupKey(baseNotification), {
    key: 'session:session-1',
    basis: 'session',
    stable: true
  });
  assert.deepEqual(createNotificationGroupKey({
    ...baseNotification,
    session: undefined
  }), {
    key: 'source-type:model:message_end',
    basis: 'source-type',
    stable: true
  });
  assert.deepEqual(createNotificationGroupKey({
    ...baseNotification,
    session: undefined,
    source: undefined,
    type: undefined
  }), {
    key: null,
    basis: 'none',
    stable: false
  });
});

test('group key ignores title, content, traceId, and notificationId changes', () => {
  const left = createNotificationGroupKey(baseNotification);
  const right = createNotificationGroupKey({
    ...baseNotification,
    title: '不同标题',
    content: '不同正文',
    traceId: 'trace-2',
    notificationId: 'notification-2'
  });

  assert.deepEqual(left, right);
});

test('missing group creates a new group and same key within window joins', () => {
  const notification = { ...baseNotification };
  const created = evaluateNotificationGrouping({ notification });
  const joined = evaluateNotificationGrouping({
    notification,
    group: baseGroup
  });
  const atBoundary = evaluateNotificationGrouping({
    notification: { ...notification, createdAt: '2026-08-04T10:02:30.000Z' },
    group: baseGroup,
    policy: { windowMs: 120000 }
  });

  assert.equal(created.decision, 'new_group');
  assert.equal(created.compatible, false);
  assert.equal(joined.decision, 'join');
  assert.equal(joined.compatible, true);
  assert.equal(joined.withinWindow, true);
  assert.equal(atBoundary.decision, 'join');
  assert.equal(atBoundary.withinWindow, true);
});

test('different key, outside window, full group, and critical isolation reject joining', () => {
  const different = evaluateNotificationGrouping({
    notification: { ...baseNotification, session: { id: 'session-2' } },
    group: baseGroup
  });
  const outside = evaluateNotificationGrouping({
    notification: { ...baseNotification, createdAt: '2026-08-04T10:03:00.001Z' },
    group: baseGroup
  });
  const full = evaluateNotificationGrouping({
    notification: baseNotification,
    group: { ...baseGroup, memberCount: 5 }
  });
  const critical = evaluateNotificationGrouping({
    notification: { ...baseNotification, importance: 'critical' },
    group: baseGroup
  });
  const criticalGroup = evaluateNotificationGrouping({
    notification: baseNotification,
    group: { ...baseGroup, containsCritical: true }
  });

  assert.equal(different.decision, 'reject');
  assert.equal(different.reason, 'different-key');
  assert.equal(outside.decision, 'reject');
  assert.equal(outside.reason, 'outside-window');
  assert.equal(full.decision, 'reject');
  assert.equal(full.reason, 'member-limit');
  assert.equal(critical.decision, 'reject');
  assert.equal(critical.reason, 'critical-isolated');
  assert.equal(criticalGroup.decision, 'reject');
  assert.equal(criticalGroup.reason, 'group-contains-critical');
});

test('missing stable key is indeterminate and off mode creates a new group', () => {
  const noKey = evaluateNotificationGrouping({
    notification: { ...baseNotification, session: undefined, source: undefined, type: undefined },
    group: baseGroup
  });
  const off = evaluateNotificationGrouping({
    notification: baseNotification,
    group: baseGroup,
    policy: { mode: 'off' }
  });

  assert.equal(noKey.decision, 'indeterminate');
  assert.equal(noKey.compatible, false);
  assert.equal(off.decision, 'new_group');
  assert.equal(off.compatible, false);
});

test('session mode accepts only session keys', () => {
  const session = evaluateNotificationGrouping({
    notification: baseNotification,
    group: baseGroup,
    policy: { mode: 'session' }
  });
  const sourceType = evaluateNotificationGrouping({
    notification: { ...baseNotification, session: undefined },
    group: { ...baseGroup, groupKey: 'source-type:model:message_end' },
    policy: { mode: 'session' }
  });
  const incident = evaluateNotificationGrouping({
    notification: {
      ...baseNotification,
      metadata: { incidentKey: 'incident-1' }
    },
    group: {
      ...baseGroup,
      groupKey: 'incident:incident-1'
    },
    policy: { mode: 'session' }
  });

  assert.equal(session.decision, 'join');
  assert.equal(incident.decision, 'join');
  assert.equal(sourceType.decision, 'reject');
  assert.equal(sourceType.reason, 'session-key-required');
});

test('grouping preserves inputs and deep-freezes results', () => {
  const notification = structuredClone(baseNotification);
  const group = structuredClone(baseGroup);
  const policy = { windowMs: 120000, maxMembers: 5 };
  const result = evaluateNotificationGrouping({ notification, group, policy });

  assert.equal(Object.isFrozen(notification), false);
  assert.equal(Object.isFrozen(group), false);
  assert.equal(Object.isFrozen(policy), false);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(policy, { windowMs: 120000, maxMembers: 5 });
});

test('grouping rejects invalid notification, group, policy, and timestamps', () => {
  assert.throws(
    () => createNotificationGroupKey(null),
    (error) => error.code === 'NOTIFICATION_GROUPING_NOTIFICATION_INVALID'
  );
  assert.throws(
    () => evaluateNotificationGrouping({ notification: baseNotification, policy: { mode: 'bad' } }),
    (error) => error.code === 'NOTIFICATION_GROUPING_MODE_INVALID'
  );
  assert.throws(
    () => evaluateNotificationGrouping({ notification: baseNotification, policy: { maxMembers: 0 } }),
    (error) => error.code === 'NOTIFICATION_GROUPING_MEMBER_LIMIT_INVALID'
  );
  assert.throws(
    () => evaluateNotificationGrouping({
      notification: { ...baseNotification, createdAt: 'invalid' },
      group: baseGroup
    }),
    (error) => error.code === 'NOTIFICATION_GROUPING_TIMESTAMP_INVALID'
  );
});
