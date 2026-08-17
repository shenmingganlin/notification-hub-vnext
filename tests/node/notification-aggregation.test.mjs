import assert from 'node:assert/strict';
import test from 'node:test';

import { createNotificationAggregation } from '../../plugin/domain/notification-aggregation.js';

const first = {
  notificationId: 'notification-1',
  title: '第一条',
  content: '第一条完整正文',
  summary: '第一条摘要',
  importance: 'normal',
  source: 'model',
  createdAt: '2026-08-04T10:00:00.000Z',
  metadata: { ignored: true }
};

const second = {
  notificationId: 'notification-2',
  title: '第二条',
  content: '第二条完整正文',
  summary: '第二条摘要',
  importance: 'high',
  source: 'model',
  createdAt: '2026-08-04T10:01:00.000Z'
};

const critical = {
  notificationId: 'notification-3',
  title: '严重错误',
  content: '严重错误正文',
  importance: 'critical',
  source: 'system',
  createdAt: '2026-08-04T10:02:00.000Z'
};

test('single, summary, and full modes produce stable single-member snapshots', () => {
  const single = createNotificationAggregation({
    groupKey: 'session:1',
    members: [first],
    policy: { mode: 'single' }
  });
  const summary = createNotificationAggregation({
    groupKey: 'session:1',
    members: [first],
    policy: { mode: 'summary' }
  });
  const full = createNotificationAggregation({
    groupKey: 'session:1',
    members: [first],
    policy: { mode: 'full' }
  });

  assert.equal(single.aggregationId, 'group-session:1');
  assert.equal(single.title, '第一条 · 1 条通知');
  assert.equal(single.content, '第一条摘要');
  assert.equal(summary.content, '第一条摘要');
  assert.equal(full.content, '第一条完整正文');
  assert.equal(single.memberCount, 1);
  assert.deepEqual(single.members[0], {
    notificationId: 'notification-1',
    title: '第一条',
    summary: '第一条摘要',
    content: '第一条完整正文',
    importance: 'normal',
    source: 'model',
    createdAt: '2026-08-04T10:00:00.000Z'
  });
});

test('aggregation importance uses the highest member importance and tracks critical', () => {
  const result = createNotificationAggregation({
    groupKey: 'session:1',
    members: [first, second, critical]
  });

  assert.equal(result.importance, 'critical');
  assert.equal(result.containsCritical, true);
  assert.equal(result.firstCreatedAt, first.createdAt);
  assert.equal(result.lastCreatedAt, critical.createdAt);
  assert.equal(result.memberCount, 3);
});

test('missing summary falls back to content and input member order is preserved', () => {
  const result = createNotificationAggregation({
    groupKey: 'session:1',
    members: [second, { ...first, summary: undefined }],
    policy: { mode: 'summary' }
  });

  assert.equal(result.content, '第二条摘要\n第一条完整正文');
  assert.deepEqual(result.members.map((member) => member.notificationId), [
    'notification-2',
    'notification-1'
  ]);
});

test('multi-member summary and full modes join content at member boundaries', () => {
  const summary = createNotificationAggregation({
    groupKey: 'session:1',
    members: [first, second],
    policy: { mode: 'summary' }
  });
  const full = createNotificationAggregation({
    groupKey: 'session:1',
    members: [first, second],
    policy: { mode: 'full' }
  });

  assert.equal(summary.title, '第一条 · 2 条通知');
  assert.equal(summary.content, '第一条摘要\n第二条摘要');
  assert.equal(full.content, '第一条完整正文\n第二条完整正文');
});

test('aggregation rejects member overflow and truncates only at member boundaries', () => {
  assert.throws(
    () => createNotificationAggregation({
      groupKey: 'session:1',
      members: [first, second],
      policy: { maxMembers: 1 }
    }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_MEMBER_LIMIT_INVALID'
      && error.details.field === 'members'
  );

  const result = createNotificationAggregation({
    groupKey: 'session:1',
    members: [first, second],
    policy: { maxContentLength: 10 }
  });
  assert.equal(result.content, '第一条摘要');
  assert.equal(result.truncated, true);
  assert.deepEqual(result.members.map((member) => member.notificationId), [
    'notification-1',
    'notification-2'
  ]);
});

test('titleTemplate only accepts supported placeholders', () => {
  const result = createNotificationAggregation({
    groupKey: 'session:1',
    members: [first, second],
    policy: { titleTemplate: '{count} · {firstTitle}' }
  });
  assert.equal(result.title, '2 · 第一条');

  assert.throws(
    () => createNotificationAggregation({
      groupKey: 'session:1',
      members: [first],
      policy: { titleTemplate: '{source} · {count}' }
    }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_TITLE_TEMPLATE_INVALID'
  );
});

test('preserveRecords controls isolated raw record snapshots', () => {
  const preserved = createNotificationAggregation({ groupKey: 'session:1', members: [first] });
  const omitted = createNotificationAggregation({
    groupKey: 'session:1',
    members: [first],
    policy: { preserveRecords: false }
  });

  assert.equal(Array.isArray(preserved.records), true);
  assert.deepEqual(preserved.records[0], first);
  assert.equal('records' in omitted, false);
  assert.equal(Object.isFrozen(preserved.records[0]), true);
});

test('aggregation preserves inputs and deep-freezes results', () => {
  const members = [structuredClone(first), structuredClone(second)];
  const policy = { mode: 'summary', maxMembers: 5 };
  const result = createNotificationAggregation({ groupKey: 'session:1', members, policy });

  assert.equal(Object.isFrozen(members), false);
  assert.equal(Object.isFrozen(members[0]), false);
  assert.equal(Object.isFrozen(policy), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.members), true);
  assert.deepEqual(policy, { mode: 'summary', maxMembers: 5 });
});

test('aggregation rejects invalid key, members, modes, lengths, and member fields', () => {
  assert.throws(
    () => createNotificationAggregation({ groupKey: '', members: [first] }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_GROUP_KEY_INVALID'
  );
  assert.throws(
    () => createNotificationAggregation({ groupKey: 'session:1', members: [] }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_MEMBERS_INVALID'
  );
  assert.throws(
    () => createNotificationAggregation({ groupKey: 'session:1', members: [first], policy: { mode: 'bad' } }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_MODE_INVALID'
  );
  assert.throws(
    () => createNotificationAggregation({ groupKey: 'session:1', members: [first], policy: { maxContentLength: 0 } }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_CONTENT_LENGTH_INVALID'
  );
  assert.throws(
    () => createNotificationAggregation({ groupKey: 'session:1', members: [{ title: 'missing' }] }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_MEMBER_INVALID'
      && error.details.field === 'members[0].notificationId'
  );
});
