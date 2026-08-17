import assert from 'node:assert/strict';
import test from 'node:test';

import { queryNotificationAggregations } from '../../plugin/domain/notification-aggregation-query.js';

const first = {
  notificationId: 'notification-1',
  traceId: 'trace-1',
  type: 'message_end',
  source: 'model',
  title: '第一条',
  content: '第一条正文',
  summary: '第一条摘要',
  importance: 'normal',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
  session: { id: 'session-1' },
  metadata: {},
  contentPolicy: {},
  runtimeHints: {},
  status: 'received'
};

const second = {
  ...first,
  notificationId: 'notification-2',
  traceId: 'trace-2',
  title: '第二条',
  content: '第二条正文',
  summary: '第二条摘要',
  createdAt: '2026-08-04T10:01:00.000Z',
  updatedAt: '2026-08-04T10:01:00.000Z'
};

test('query builds one aggregation from same-session records without mutating source records', () => {
  const records = [second, first];
  const original = structuredClone(records);

  const result = queryNotificationAggregations({ records });

  assert.equal(result.sourceCount, 2);
  assert.equal(result.duplicateCount, 0);
  assert.equal(result.ungroupedCount, 0);
  assert.equal(result.aggregations.length, 1);
  assert.equal(result.aggregations[0].groupKey, 'session:session-1');
  assert.deepEqual(
    result.aggregations[0].members.map((member) => member.notificationId),
    ['notification-1', 'notification-2']
  );
  assert.deepEqual(records, original);
  assert.equal(Object.isFrozen(result), true);
});

test('query groups model service retries by incidentKey before shared session/source type', () => {
  const firstIncident = {
    ...first,
    notificationId: 'model-error-1',
    traceId: 'model-trace-1',
    type: 'model_service_error',
    source: 'hana.model',
    title: '模型服务异常',
    content: '第一次失败',
    metadata: { incidentKey: 'model_service|provider-a|model-a|memory_summary|task-1' }
  };
  const secondAttempt = {
    ...firstIncident,
    notificationId: 'model-error-2',
    traceId: 'model-trace-2',
    content: '第二次重试失败',
    createdAt: '2026-08-04T10:01:00.000Z',
    updatedAt: '2026-08-04T10:01:00.000Z'
  };
  const differentIncident = {
    ...firstIncident,
    notificationId: 'model-error-3',
    traceId: 'model-trace-3',
    content: '另一个任务失败',
    metadata: { incidentKey: 'model_service|provider-a|model-a|memory_summary|task-2' },
    createdAt: '2026-08-04T10:02:00.000Z',
    updatedAt: '2026-08-04T10:02:00.000Z'
  };

  const result = queryNotificationAggregations({
    records: [differentIncident, secondAttempt, firstIncident],
    deduplicationPolicy: { mode: 'off' }
  });

  assert.equal(result.aggregations.length, 2);
  assert.deepEqual(result.aggregations.map((aggregation) => aggregation.groupKey), [
    'incident:model_service|provider-a|model-a|memory_summary|task-1',
    'incident:model_service|provider-a|model-a|memory_summary|task-2'
  ]);
  assert.equal(result.aggregations[0].memberCount, 2);
});

test('query separates stable source keys and isolates records without a session key', () => {
  const sourceTypeRecord = {
    ...first,
    notificationId: 'notification-3',
    traceId: 'trace-3',
    session: undefined,
    source: 'tool',
    type: 'tool_use',
    createdAt: '2026-08-04T10:02:00.000Z',
    updatedAt: '2026-08-04T10:02:00.000Z'
  };
  const noSessionFirst = {
    ...first,
    notificationId: 'notification-4',
    traceId: 'trace-4',
    session: undefined,
    createdAt: '2026-08-04T10:03:00.000Z',
    updatedAt: '2026-08-04T10:03:00.000Z'
  };
  const noSessionSecond = {
    ...noSessionFirst,
    notificationId: 'notification-5',
    traceId: 'trace-5',
    createdAt: '2026-08-04T10:04:00.000Z',
    updatedAt: '2026-08-04T10:04:00.000Z'
  };

  const result = queryNotificationAggregations({
    records: [noSessionSecond, sourceTypeRecord, noSessionFirst, first],
    groupingPolicy: { mode: 'session' }
  });

  assert.equal(result.aggregations.length, 4);
  assert.equal(result.ungroupedCount, 3);
  assert.deepEqual(
    result.aggregations.map((aggregation) => aggregation.groupKey),
    [
      'session:session-1',
      'ungrouped:notification-3',
      'ungrouped:notification-4',
      'ungrouped:notification-5'
    ]
  );
});

test('query suppresses duplicate members by default and counts them', () => {
  const duplicate = {
    ...second,
    notificationId: 'notification-duplicate',
    traceId: 'trace-duplicate',
    deduplicationKey: 'job-42',
    createdAt: '2026-08-04T10:00:30.000Z',
    updatedAt: '2026-08-04T10:00:30.000Z'
  };
  const firstWithKey = { ...first, deduplicationKey: 'job-42' };
  const result = queryNotificationAggregations({
    records: [duplicate, firstWithKey, second]
  });

  assert.equal(result.sourceCount, 3);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.aggregations[0].memberCount, 2);
  assert.deepEqual(
    result.aggregations[0].members.map((member) => member.notificationId),
    ['notification-1', 'notification-2']
  );
});

test('query can include duplicate members for audit without changing duplicateCount', () => {
  const firstWithKey = { ...first, deduplicationKey: 'job-42' };
  const duplicate = {
    ...second,
    notificationId: 'notification-duplicate',
    traceId: 'trace-duplicate',
    deduplicationKey: 'job-42',
    createdAt: '2026-08-04T10:00:30.000Z',
    updatedAt: '2026-08-04T10:00:30.000Z'
  };
  const result = queryNotificationAggregations({
    records: [duplicate, firstWithKey, second],
    includeDuplicates: true
  });

  assert.equal(result.duplicateCount, 1);
  assert.equal(result.aggregations[0].memberCount, 3);
  assert.deepEqual(
    result.aggregations[0].members.map((member) => member.notificationId),
    ['notification-1', 'notification-duplicate', 'notification-2']
  );
});

test('query starts a new derived group at grouping boundaries', () => {
  const records = Array.from({ length: 6 }, (_, index) => ({
    ...first,
    notificationId: `notification-normal-${index + 1}`,
    traceId: `trace-normal-${index + 1}`,
    title: `普通通知 ${index + 1}`,
    createdAt: `2026-08-04T10:0${index}:00.000Z`,
    updatedAt: `2026-08-04T10:0${index}:00.000Z`
  }));
  records.push({
    ...first,
    notificationId: 'notification-critical',
    traceId: 'trace-critical',
    title: '严重通知',
    importance: 'critical',
    createdAt: '2026-08-04T10:06:00.000Z',
    updatedAt: '2026-08-04T10:06:00.000Z'
  });
  records.push({
    ...first,
    notificationId: 'notification-after-window',
    traceId: 'trace-after-window',
    title: '窗口外通知',
    createdAt: '2026-08-04T10:09:01.000Z',
    updatedAt: '2026-08-04T10:09:01.000Z'
  });

  const result = queryNotificationAggregations({ records });

  assert.equal(result.aggregations.length, 4);
  assert.deepEqual(result.aggregations.map((aggregation) => aggregation.memberCount), [5, 1, 1, 1]);
  assert.equal(result.aggregations[2].containsCritical, true);
  assert.equal(result.aggregations[3].members[0].notificationId, 'notification-after-window');
});

test('query preserves source records and rejects invalid query boundaries', () => {
  const records = [structuredClone(first), structuredClone(second)];
  const original = structuredClone(records);
  const result = queryNotificationAggregations({
    records,
    aggregationPolicy: { preserveRecords: false }
  });

  assert.equal('records' in result.aggregations[0], false);
  assert.deepEqual(records, original);
  assert.equal(Object.isFrozen(result.aggregations[0]), true);
  assert.throws(
    () => queryNotificationAggregations({ records: 'invalid' }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_QUERY_RECORDS_INVALID'
  );
  assert.throws(
    () => queryNotificationAggregations({ records: [{ ...first, content: 42 }] }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_QUERY_RECORD_INVALID'
      && error.details.field === 'records[0]'
  );
  assert.throws(
    () => queryNotificationAggregations({ records, includeDuplicates: 'yes' }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_QUERY_POLICY_INVALID'
      && error.details.field === 'includeDuplicates'
  );
});

test('query filters aggregation groups by final importance and reports filtered totals', () => {
  const critical = {
    ...first,
    notificationId: 'notification-critical-filter',
    traceId: 'trace-critical-filter',
    title: '关键错误',
    content: '关键错误正文',
    summary: '关键错误摘要',
    importance: 'critical',
    session: { id: 'session-critical' },
    createdAt: '2026-08-04T10:02:00.000Z',
    updatedAt: '2026-08-04T10:02:00.000Z'
  };
  const result = queryNotificationAggregations({
    records: [critical, first],
    filter: { importance: 'critical' }
  });

  assert.equal(result.totalCount, 1);
  assert.equal(result.returnedCount, 1);
  assert.equal(result.aggregations[0].importance, 'critical');
  assert.equal(result.hasMore, false);
});

test('query applies source, type, critical, group, time, and text filters with AND semantics', () => {
  const critical = {
    ...first,
    notificationId: 'notification-filter-target',
    traceId: 'trace-filter-target',
    type: 'tool_error',
    source: 'runtime',
    title: 'Runtime Failure',
    content: 'GPU device lost',
    summary: 'GPU device lost',
    importance: 'critical',
    session: { id: 'filter-target' },
    createdAt: '2026-08-04T10:02:00.000Z',
    updatedAt: '2026-08-04T10:02:00.000Z'
  };
  const result = queryNotificationAggregations({
    records: [critical, first],
    filter: {
      source: 'runtime',
      type: 'tool_error',
      containsCritical: true,
      groupKey: 'session:filter-target',
      createdAfter: '2026-08-04T10:01:00.000Z',
      createdBefore: '2026-08-04T10:03:00.000Z',
      text: 'gpu DEVICE'
    }
  });

  assert.equal(result.totalCount, 1);
  assert.equal(result.aggregations[0].groupKey, 'session:filter-target');
  assert.equal(result.aggregations[0].content, 'GPU device lost');
});

test('query sorts by time, importance, and member count with deterministic tie-breaking', () => {
  const makeRecord = (id, sessionId, createdAt, importance = 'normal') => ({
    ...first,
    notificationId: id,
    traceId: `trace-${id}`,
    session: { id: sessionId },
    title: id,
    importance,
    createdAt,
    updatedAt: createdAt
  });
  const records = [
    makeRecord('notification-b', 'session-b', '2026-08-04T10:01:00.000Z', 'high'),
    makeRecord('notification-a', 'session-a', '2026-08-04T10:01:00.000Z', 'high'),
    makeRecord('notification-critical', 'session-critical', '2026-08-04T10:02:00.000Z', 'critical'),
    makeRecord('notification-low', 'session-low', '2026-08-04T10:03:00.000Z', 'low')
  ];

  const byFirstDesc = queryNotificationAggregations({
    records,
    sort: { field: 'firstCreatedAt', direction: 'desc' }
  });
  const byImportance = queryNotificationAggregations({
    records,
    sort: { field: 'importance', direction: 'desc' }
  });
  const byLastAsc = queryNotificationAggregations({
    records,
    sort: { field: 'lastCreatedAt', direction: 'asc' }
  });
  const byMembers = queryNotificationAggregations({
    records,
    sort: { field: 'memberCount', direction: 'desc' }
  });

  assert.deepEqual(byFirstDesc.aggregations.map((item) => item.groupKey), [
    'session:session-low',
    'session:session-critical',
    'session:session-a',
    'session:session-b'
  ]);
  assert.equal(byImportance.aggregations[0].importance, 'critical');
  assert.deepEqual(byLastAsc.aggregations.map((item) => item.groupKey), [
    'session:session-a',
    'session:session-b',
    'session:session-critical',
    'session:session-low'
  ]);
  assert.equal(byMembers.sort.field, 'memberCount');
});

test('query paginates groups after filtering and preserves whole-result statistics', () => {
  const records = ['a', 'b', 'c'].map((id, index) => ({
    ...first,
    notificationId: `notification-page-${id}`,
    traceId: `trace-page-${id}`,
    session: { id: `page-${id}` },
    title: `Page ${id}`,
    createdAt: `2026-08-04T10:0${index}:00.000Z`,
    updatedAt: `2026-08-04T10:0${index}:00.000Z`
  }));
  const result = queryNotificationAggregations({ records, offset: 1, limit: 1 });
  const empty = queryNotificationAggregations({ records, offset: 10, limit: 2 });

  assert.equal(result.totalCount, 3);
  assert.equal(result.returnedCount, 1);
  assert.equal(result.offset, 1);
  assert.equal(result.limit, 1);
  assert.equal(result.hasMore, true);
  assert.equal(result.aggregations[0].groupKey, 'session:page-b');
  assert.equal(empty.totalCount, 3);
  assert.equal(empty.returnedCount, 0);
  assert.equal(empty.hasMore, false);
  assert.equal(empty.sourceCount, 3);
});

test('query rejects invalid filter, sort, and pagination parameters', () => {
  const records = [first];

  assert.throws(
    () => queryNotificationAggregations({ records, filter: { importance: 'urgent' } }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_QUERY_FILTER_IMPORTANCE_INVALID'
  );
  assert.throws(
    () => queryNotificationAggregations({ records, filter: { createdAfter: 'invalid' } }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_QUERY_FILTER_TIMESTAMP_INVALID'
  );
  assert.throws(
    () => queryNotificationAggregations({ records, sort: { field: 'unknown' } }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_QUERY_SORT_INVALID'
  );
  assert.throws(
    () => queryNotificationAggregations({ records, offset: -1 }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_QUERY_PAGINATION_INVALID'
  );
  assert.throws(
    () => queryNotificationAggregations({ records, limit: 0 }),
    (error) => error.code === 'NOTIFICATION_AGGREGATION_QUERY_PAGINATION_INVALID'
  );
});

test('query keeps filter, sort, and policy inputs unchanged and empty filter is a no-op', () => {
  const records = [structuredClone(first), structuredClone(second)];
  const filter = { text: '摘要' };
  const sort = { field: 'memberCount', direction: 'desc' };
  const aggregationPolicy = { preserveRecords: false };
  const before = {
    filter: structuredClone(filter),
    sort: structuredClone(sort),
    aggregationPolicy: structuredClone(aggregationPolicy)
  };
  const filtered = queryNotificationAggregations({ records, filter, sort, aggregationPolicy });
  const empty = queryNotificationAggregations({ records, filter: {} });

  assert.equal(filtered.totalCount, 1);
  assert.equal(empty.totalCount, 1);
  assert.deepEqual(filter, before.filter);
  assert.deepEqual(sort, before.sort);
  assert.deepEqual(aggregationPolicy, before.aggregationPolicy);
});
